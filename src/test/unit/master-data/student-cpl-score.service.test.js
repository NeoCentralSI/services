import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        student: { findUnique: vi.fn() },
        cpl: { findUnique: vi.fn(), findFirst: vi.fn() },
        studentCplScore: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));

import {
    createStudentCplScoreManual,
    updateStudentCplScoreManual,
    deleteStudentCplScoreManual,
    importStudentCplScoresManual,
} from "../../../services/master-data/student-cpl-score.service.js";

describe("Student CPL Score Manual Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("create success for manual score when record not exists", async () => {
        mockPrisma.student.findUnique.mockResolvedValue({ id: "student-1", user: { fullName: "Satu" } });
        mockPrisma.cpl.findUnique.mockResolvedValue({
            id: "cpl-1",
            code: "CPL-01",
            isActive: true,
            description: "Desc",
            minimalScore: 60,
        });
        mockPrisma.studentCplScore.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                studentId: "student-1",
                cplId: "cpl-1",
                source: "manual",
                status: "calculated",
                score: 88,
                student: { id: "student-1", user: { fullName: "Satu", identityNumber: "135" } },
                cpl: { id: "cpl-1", code: "CPL-01", description: "Desc", minimalScore: 60, isActive: true },
            });
        mockPrisma.studentCplScore.create.mockResolvedValue({});

        const result = await createStudentCplScoreManual(
            { studentId: "student-1", cplId: "cpl-1", score: 88 },
            "user-gkm"
        );

        expect(mockPrisma.studentCplScore.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "finalized",
                }),
            })
        );
        expect(result.source).toBe("manual");
        expect(result.score).toBe(88);
    });

    it("create allows inactive CPL for archive data", async () => {
        mockPrisma.student.findUnique.mockResolvedValue({ id: "student-1", user: { fullName: "Satu" } });
        mockPrisma.cpl.findUnique.mockResolvedValue({
            id: "cpl-legacy",
            code: "CPL-OLD",
            isActive: false,
            description: "Legacy CPL",
            minimalScore: 60,
        });
        mockPrisma.studentCplScore.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                studentId: "student-1",
                cplId: "cpl-legacy",
                source: "manual",
                status: "finalized",
                score: 77,
                student: { id: "student-1", user: { fullName: "Satu", identityNumber: "135" } },
                cpl: { id: "cpl-legacy", code: "CPL-OLD", description: "Legacy CPL", minimalScore: 60, isActive: false },
            });
        mockPrisma.studentCplScore.create.mockResolvedValue({});

        const result = await createStudentCplScoreManual(
            { studentId: "student-1", cplId: "cpl-legacy", score: 77 },
            "user-gkm"
        );

        expect(result.cpl?.isActive).toBe(false);
        expect(result.score).toBe(77);
    });

    it("create rejects when score already exists (SIA or MANUAL)", async () => {
        mockPrisma.student.findUnique.mockResolvedValue({ id: "student-1" });
        mockPrisma.cpl.findUnique.mockResolvedValue({ id: "cpl-1", isActive: true });
        mockPrisma.studentCplScore.findUnique.mockResolvedValue({ studentId: "student-1", cplId: "cpl-1", source: "SIA" });

        await expect(
            createStudentCplScoreManual(
                { studentId: "student-1", cplId: "cpl-1", score: 70 },
                "user-gkm"
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("update allowed for manual source and resets verification fields", async () => {
        mockPrisma.studentCplScore.findUnique
            .mockResolvedValueOnce({
                studentId: "student-1",
                cplId: "cpl-1",
                source: "manual",
                finalizedAt: null,
            })
            .mockResolvedValueOnce({
                studentId: "student-1",
                cplId: "cpl-1",
                source: "manual",
                score: 90,
                status: "calculated",
            });
        mockPrisma.studentCplScore.update.mockResolvedValue({});

        const result = await updateStudentCplScoreManual("student-1", "cpl-1", { score: 90 }, "user-gkm");

        expect(mockPrisma.studentCplScore.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    score: 90,
                    verifiedBy: null,
                    verifiedAt: null,
                    finalizedAt: null,
                    status: "calculated",
                }),
            })
        );
        expect(result.score).toBe(90);
    });

    it("reject update for SIA source", async () => {
        mockPrisma.studentCplScore.findUnique.mockResolvedValue({
            studentId: "student-1",
            cplId: "cpl-1",
            source: "SIA",
        });

        await expect(
            updateStudentCplScoreManual("student-1", "cpl-1", { score: 99 }, "user-gkm")
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("delete allowed for manual source only", async () => {
        mockPrisma.studentCplScore.findUnique.mockResolvedValue({
            studentId: "student-1",
            cplId: "cpl-1",
            source: "manual",
        });
        mockPrisma.studentCplScore.delete.mockResolvedValue({});

        await deleteStudentCplScoreManual("student-1", "cpl-1");
        expect(mockPrisma.studentCplScore.delete).toHaveBeenCalled();
    });

    it("import returns partial failure details and avoids override", async () => {
        mockPrisma.student.findUnique.mockResolvedValue({ id: "student-1" });
        mockPrisma.cpl.findFirst.mockResolvedValue({
            id: "cpl-1",
            code: "CPL-01",
            isActive: true,
            description: "Desc",
            minimalScore: 60,
        });
        mockPrisma.studentCplScore.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ source: "SIA" });
        mockPrisma.studentCplScore.create.mockResolvedValue({});

        const result = await importStudentCplScoresManual(
            [
                { studentId: "student-1", cplCode: "CPL-01", score: 80 },
                { studentId: "student-1", cplCode: "CPL-01", score: 70 },
            ],
            "user-gkm"
        );

        expect(result.total).toBe(2);
        expect(result.success).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.failedRows.length).toBe(1);
        expect(mockPrisma.studentCplScore.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "finalized",
                }),
            })
        );
    });
});
