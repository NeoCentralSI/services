import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as coreService from '../../../../services/thesis-defence/core.service.js';
import * as coreRepo from '../../../../repositories/thesis-defence/thesis-defence.repository.js';
import * as docRepo from '../../../../repositories/thesis-defence/doc.repository.js';
import prisma from '../../../../config/prisma.js';

vi.mock('../../../../repositories/thesis-defence/thesis-defence.repository.js');
vi.mock('../../../../repositories/thesis-defence/doc.repository.js');
vi.mock('../../../../config/prisma.js', () => ({
  default: {
    thesisDefence: {
      findFirst: vi.fn(),
    },
    thesisSupervisors: {
      updateMany: vi.fn(),
    },
    thesis: {
      findUnique: vi.fn(),
    }
  },
}));

describe('Thesis Defence Core Service - Archive Management', () => {
  const mockUserId = 'user-123';
  const mockThesisId = 'thesis-123';
  const mockDefenceId = 'defence-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('importArchive', () => {
    it('should process excel rows and calculate grades during import', async () => {
      // Mock xlsx
      vi.mock('xlsx', () => ({
        default: {
          read: vi.fn().mockReturnValue({
            SheetNames: ['Sheet1'],
            Sheets: { Sheet1: {} }
          }),
          utils: {
            sheet_to_json: vi.fn().mockReturnValue([
              { NIM: '123', Hasil: 'Lulus', Tanggal: '2023-01-01', Nilai: 80, 'Dosen Penguji': 'Lec A' }
            ])
          }
        }
      }));

      coreRepo.getStudentOptions.mockResolvedValue([{ user: { identityNumber: '123' }, id: 'stud-1' }]);
      coreRepo.getThesisOptions.mockResolvedValue([{ student: { user: { identityNumber: '123' } }, id: mockThesisId, thesisDefences: [] }]);
      coreRepo.getLecturerOptions.mockResolvedValue([{ user: { fullName: 'Lec A' }, id: 'lec-a' }]);
      coreRepo.findAllRooms.mockResolvedValue([]);

      const result = await coreService.importArchive(Buffer.from(''), mockUserId);

      expect(result.successCount).toBe(1);
      expect(coreRepo.createArchive).toHaveBeenCalledWith(expect.objectContaining({
        grade: 'A'
      }));
    });
  });
});
