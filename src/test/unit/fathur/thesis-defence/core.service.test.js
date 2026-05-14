import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as coreService from '../../../../services/thesis-defence/core.service.js';
import * as coreRepo from '../../../../repositories/thesis-defence/thesis-defence.repository.js';
import * as docRepo from '../../../../repositories/thesis-defence/doc.repository.js';
import prisma from '../../../../config/prisma.js';
import { getFinalizationData } from '../../../../services/thesis-defence/examiner.service.js';

const { mockPrisma, mockXlsx } = vi.hoisted(() => ({
  mockPrisma: {
    thesisDefence: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn() },
    thesis: { findUnique: vi.fn() },
    student: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    lecturer: { findMany: vi.fn().mockResolvedValue([]) },
  },
  mockXlsx: {
    read: vi.fn().mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} }
    }),
    utils: {
      sheet_to_json: vi.fn().mockReturnValue([]),
      json_to_sheet: vi.fn().mockReturnValue({}),
      book_new: vi.fn().mockReturnValue({}),
      book_append_sheet: vi.fn(),
    },
    write: vi.fn().mockReturnValue(Buffer.from('')),
  }
}));

vi.mock('../../../../repositories/thesis-defence/thesis-defence.repository.js');
vi.mock('../../../../repositories/thesis-defence/doc.repository.js');
vi.mock('../../../../config/prisma.js', () => ({ default: mockPrisma }));
vi.mock('xlsx', () => ({ default: mockXlsx }));
vi.mock('../../../../services/notification.service.js', () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock('../../../../services/push.service.js', () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../../../../services/outlook-calendar.service.js', () => ({
  createSeminarCalendarEvents: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../../helpers/pdf.helper.js', () => ({
  convertHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));
vi.mock('../../../../services/thesis-defence/examiner.service.js', () => ({
  getFinalizationData: vi.fn(),
}));

describe('Thesis Defence Core Service', () => {
  const mockUserId = 'user-123';
  const mockThesisId = 'thesis-123';
  const mockDefenceId = 'defence-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  describe('Archive Management', () => {
    describe('createArchive', () => {
      it('should successfully create an archive entry with auto-calculated grade', async () => {
        const payload = {
          thesisId: mockThesisId,
          status: 'passed',
          date: new Date().toISOString(),
          roomId: 'room-1',
          examinerLecturerIds: ['lec-1', 'lec-2'],
          finalScore: 85,
        };

        coreRepo.getThesisOptions.mockResolvedValue([
          { id: mockThesisId, thesisDefences: [], thesisSupervisors: [] }
        ]);
        coreRepo.createArchive.mockResolvedValue({ id: mockDefenceId });
        coreRepo.findDefenceById.mockResolvedValue({ id: mockDefenceId, ...payload, grade: 'A' });

        const result = await coreService.createArchive(payload, mockUserId);

        expect(coreRepo.createArchive).toHaveBeenCalledWith(expect.objectContaining({
          finalScore: 85,
          grade: 'A'
        }));
        expect(result.id).toBe(mockDefenceId);
      });

      it('should throw error if student already passed defence', async () => {
        coreRepo.getThesisOptions.mockResolvedValue([
          { id: mockThesisId, thesisDefences: [{ status: 'passed' }], thesisSupervisors: [] }
        ]);

        await expect(coreService.createArchive({ thesisId: mockThesisId, status: 'passed' }, mockUserId))
          .rejects.toThrow('Mahasiswa ini sudah lulus sidang tugas akhir.');
      });

      it('should throw error if examiner is also a supervisor', async () => {
        coreRepo.getThesisOptions.mockResolvedValue([
          { 
            id: mockThesisId, 
            thesisDefences: [], 
            thesisSupervisors: [{ lecturerId: 'lec-1' }] 
          }
        ]);

        const payload = {
          thesisId: mockThesisId,
          status: 'passed',
          examinerLecturerIds: ['lec-1'],
        };

        await expect(coreService.createArchive(payload, mockUserId))
          .rejects.toThrow('Dosen pembimbing tidak boleh menjadi dosen penguji');
      });
    });

    describe('updateArchive', () => {
      it('should successfully update archive and recalculate grade', async () => {
        const payload = {
          status: 'passed_with_revision',
          finalScore: 78,
          examinerLecturerIds: ['lec-1'],
        };

        coreRepo.findDefenceBasicById.mockResolvedValue({ id: mockDefenceId, registeredAt: null, thesisId: mockThesisId });
        coreRepo.getThesisOptions.mockResolvedValue([{ id: mockThesisId, thesisSupervisors: [] }]);
        
        await coreService.updateArchive(mockDefenceId, payload, mockUserId);

        expect(coreRepo.updateArchive).toHaveBeenCalledWith(mockDefenceId, expect.objectContaining({
          grade: 'A-'
        }));
      });

      it('should block updating active defence through archive service', async () => {
        coreRepo.findDefenceBasicById.mockResolvedValue({ id: mockDefenceId, registeredAt: new Date() });

        await expect(coreService.updateArchive(mockDefenceId, { status: 'passed' }, mockUserId))
          .rejects.toThrow('Data sidang aktif tidak dapat diubah melalui fitur arsip');
      });
    });

    describe('deleteArchive', () => {
      it('should delete archive successfully', async () => {
        coreRepo.findDefenceBasicById.mockResolvedValue({ id: mockDefenceId, registeredAt: null });
        coreRepo.deleteDefence.mockResolvedValue({});
        const res = await coreService.deleteArchive(mockDefenceId);
        expect(res.success).toBe(true);
      });
    });
  });

  describe('View Queries', () => {
    describe('getDefenceDetail', () => {
      it('should return defence detail with enriched examiners', async () => {
        const mockDefence = {
          id: mockDefenceId,
          status: 'verified',
          thesis: { studentId: 'st-1' },
          examiners: [{ order: 1, lecturerName: 'L1', revisionNotes: 'Notes' }]
        };
        coreRepo.findDefenceById.mockResolvedValue(mockDefence);
        
        const res = await coreService.getDefenceDetail(mockDefenceId, { studentId: 'st-1' });
        
        expect(res.id).toBe(mockDefenceId);
        expect(res.examinerNotes).toHaveLength(1);
        expect(res.examinerNotes[0].lecturerName).toBe('L1');
      });

      it('should throw error if defence not found', async () => {
        coreRepo.findDefenceById.mockResolvedValue(null);
        await expect(coreService.getDefenceDetail('wrong', {}))
          .rejects.toThrow('Sidang tidak ditemukan.');
      });
    });

    describe('getDefenceList', () => {
      it('should return admin list by default', async () => {
        coreRepo.findDefencesPaginated.mockResolvedValue({ data: [], total: 0 });
        const res = await coreService.getDefenceList({ view: 'verification' });
        expect(res.defences).toBeDefined();
        expect(coreRepo.findDefencesPaginated).toHaveBeenCalled();
      });

      it('should return supervisor list when view is supervised_students', async () => {
        coreRepo.findDefencesBySupervisor.mockResolvedValue([]);
        await coreService.getDefenceList({ view: 'supervised_students', user: { lecturerId: 'lec-1' } });
        expect(coreRepo.findDefencesBySupervisor).toHaveBeenCalledWith('lec-1', expect.any(Object));
      });

      it('should return examiner list when view is examiner_requests', async () => {
        coreRepo.findDefencesByExaminer.mockResolvedValue([]);
        await coreService.getDefenceList({ view: 'examiner_requests', user: { lecturerId: 'lec-1' } });
        expect(coreRepo.findDefencesByExaminer).toHaveBeenCalledWith('lec-1', expect.any(Object));
      });
    });
  });

  describe('Scheduling & Lifecycle', () => {
    const validDate = '2026-06-02'; // A Monday

    it('should save draft schedule for a weekday within business hours', async () => {
      coreRepo.findDefenceBasicById.mockResolvedValue({ id: mockDefenceId, status: 'examiner_assigned' });
      coreRepo.findRoomScheduleConflict.mockResolvedValue(null);
      coreRepo.updateDefenceSchedule.mockResolvedValue({});

      const result = await coreService.scheduleDefence(mockDefenceId, {
        roomId: 'room-1',
        date: validDate,
        startTime: '09:00',
        endTime: '11:00',
        isOnline: false,
        meetingLink: null,
      });

      expect(coreRepo.updateDefenceSchedule).toHaveBeenCalledWith(mockDefenceId, expect.objectContaining({
        date: validDate,
        startTime: '09:00',
        endTime: '11:00',
      }));
      expect(result.defenceId).toBe(mockDefenceId);
    });

    it('should finalize schedule, set scheduledAt, and send notifications', async () => {
      const mockDefence = {
        id: mockDefenceId,
        status: 'examiner_assigned',
        date: new Date('2026-06-02'),
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T11:00:00Z'),
        room: { name: 'Lab A' },
        meetingLink: null,
        thesis: {
          student: { id: 'student-1', user: { fullName: 'Budi Santoso' } },
          thesisSupervisors: [{ lecturerId: 'lec-sup-1' }],
        },
        examiners: [{ lecturerId: 'lec-exam-1' }],
      };

      coreRepo.findDefenceById.mockResolvedValue(mockDefence);
      coreRepo.updateDefenceStatus.mockResolvedValue({});
      mockPrisma.thesisDefence.update.mockResolvedValue({ ...mockDefence, scheduledAt: new Date() });

      const result = await coreService.finalizeSchedule(mockDefenceId, 'admin-1');

      expect(coreRepo.updateDefenceStatus).toHaveBeenCalledWith(mockDefenceId, 'scheduled');
      expect(mockPrisma.thesisDefence.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { scheduledAt: expect.any(Date) } })
      );

      // Verify notifications sent ONLY to private participants
      const expectedRecipients = ['student-1', 'lec-sup-1', 'lec-exam-1'];
      const notificationService = await import('../../../../services/notification.service.js');
      const pushService = await import('../../../../services/push.service.js');
      
      expect(notificationService.createNotificationsForUsers).toHaveBeenCalledWith(
        expect.arrayContaining(expectedRecipients),
        expect.any(Object)
      );
      expect(pushService.sendFcmToUsers).toHaveBeenCalledWith(
        expect.arrayContaining(expectedRecipients),
        expect.any(Object)
      );
      
      // Ensure it's exactly the right length (no broadcast to all students)
      const callArgs = vi.mocked(notificationService.createNotificationsForUsers).mock.calls[0][0];
      expect(callArgs.length).toBe(expectedRecipients.length);

      expect(result.status).toBe('scheduled');
    });

    it('should cancel defence and reset supervisors', async () => {
      coreRepo.findDefenceBasicById.mockResolvedValue({ id: mockDefenceId, status: 'scheduled', thesisId: mockThesisId });
      coreRepo.updateDefence.mockResolvedValue({ status: 'cancelled' });
      mockPrisma.thesisSupervisors.updateMany.mockResolvedValue({ count: 1 });
      
      const res = await coreService.cancelDefence(mockDefenceId, { cancelledReason: 'Reson' });
      
      expect(res.status).toBe('cancelled');
      expect(mockPrisma.thesisSupervisors.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { thesisId: mockThesisId },
        data: { defenceReady: false }
      }));
    });
  });

  describe('Document Generation', () => {
    it('should generate assessment result PDF', async () => {
      coreRepo.findDefenceById.mockResolvedValue({ id: mockDefenceId, date: new Date(), startTime: new Date(), thesis: { student: { user: { fullName: 'S' } } } });
      vi.mocked(getFinalizationData).mockResolvedValue({
        defence: { resultFinalizedAt: new Date(), status: 'passed', finalScore: 80 },
        examiners: [],
        supervisor: { name: 'Sup 1', nip: '123' },
        supervisorAssessment: { assessmentDetails: [] }
      });
      const res = await coreService.generateAssessmentResultPdf(mockDefenceId);
      expect(res).toBeDefined();
    });

    it('should generate invitation letter PDF', async () => {
      mockPrisma.thesisDefence.findUnique.mockResolvedValue({ id: mockDefenceId, date: new Date(), startTime: new Date(), thesis: { title: 'T', student: { user: { fullName: 'S' } } }, examiners: [] });
      mockPrisma.lecturer.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ fullName: 'Kadep', identityNumber: '123' });
      
      const res = await coreService.generateInvitationLetter(mockDefenceId, 'REF/123');
      
      expect(res).toBeDefined();
      expect(mockPrisma.thesisDefence.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: mockDefenceId },
        data: { invitationLetterNo: 'REF/123' }
      }));
    });
  });

  describe('Import/Export', () => {
    it('should process excel rows during import', async () => {
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { NIM: '123', Hasil: 'Lulus', Tanggal: '2023-01-01', Skor: 80, Nilai: 'A', 'Dosen Penguji': 'Lec A' }
      ]);

      coreRepo.getStudentOptions.mockResolvedValue([{ user: { identityNumber: '123' }, id: 'stud-1' }]);
      coreRepo.getThesisOptions.mockResolvedValue([{ student: { user: { identityNumber: '123' } }, id: mockThesisId, thesisDefences: [] }]);
      coreRepo.getLecturerOptions.mockResolvedValue([{ user: { fullName: 'Lec A' }, id: 'lec-a' }]);
      coreRepo.findAllRooms.mockResolvedValue([]);

      const result = await coreService.importArchive(Buffer.from(''), mockUserId);

      expect(result.successCount).toBe(1);
    });

    it('should export archive data correctly', async () => {
      coreRepo.findAllDefences.mockResolvedValue([
        {
          id: 'def-1',
          status: 'passed',
          date: new Date(),
          startTime: new Date(),
          endTime: new Date(),
          thesis: {
            title: 'T',
            student: { user: { fullName: 'M', identityNumber: '1' } },
            thesisSupervisors: []
          },
          room: { name: 'R' },
          examiners: []
        }
      ]);

      await coreService.exportArchive();
      expect(mockXlsx.utils.json_to_sheet).toHaveBeenCalled();
      expect(mockXlsx.write).toHaveBeenCalled();
    });
  });

  describe('Options', () => {
    it('returns student options', async () => {
      coreRepo.getStudentOptions.mockResolvedValue([{ id: 's1', user: { fullName: 'S', identityNumber: '1' } }]);
      const res = await coreService.getStudentOptions();
      expect(res[0].fullName).toBe('S');
    });

    it('returns lecturer options', async () => {
      coreRepo.getLecturerOptions.mockResolvedValue([{ id: 'l1', user: { fullName: 'L', identityNumber: '1' } }]);
      const res = await coreService.getLecturerOptions();
      expect(res[0].fullName).toBe('L');
    });
  });
});
