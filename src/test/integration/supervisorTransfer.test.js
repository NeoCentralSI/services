/**
 * Integration guard: formal supervisor transfer is outside the active SIMPTA
 * scope. The system must reject all transfer entry points before any database
 * mutation or notification side effect is attempted.
 */
import { describe, it, expect, afterAll } from "vitest";
import prisma from "../../config/prisma.js";
import {
  requestStudentTransferService,
  approveTransferRequestService,
  rejectTransferRequestService,
  kadepApproveTransferService,
  kadepRejectTransferService,
} from "../../services/thesisGuidance/lecturer.guidance.service.js";

const REMOVED_TRANSFER_MESSAGE = "Penggantian/transfer dosen pembimbing formal tidak difasilitasi";

describe("IT-03: Supervisor Transfer Guard", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects lecturer-initiated transfer requests", async () => {
    await expect(
      requestStudentTransferService("user-dosen-1", {
        thesisIds: ["thesis-1"],
        targetLecturerId: "lecturer-target",
        reason: "Tidak sesuai scope aktif SIMPTA",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(REMOVED_TRANSFER_MESSAGE),
    });
  });

  it("rejects target lecturer transfer approval/rejection", async () => {
    await expect(
      rejectTransferRequestService("user-dosen-target", "notification-transfer-1", {
        reason: "Tidak sesuai scope",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(REMOVED_TRANSFER_MESSAGE),
    });

    await expect(
      approveTransferRequestService("user-dosen-target", "notification-transfer-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(REMOVED_TRANSFER_MESSAGE),
    });
  });

  it("rejects department approval/rejection for transfer requests", async () => {
    await expect(
      kadepApproveTransferService("user-kadep-1", "notification-transfer-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(REMOVED_TRANSFER_MESSAGE),
    });

    await expect(
      kadepRejectTransferService("user-kadep-1", "notification-transfer-1", {
        reason: "Tidak sesuai scope",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(REMOVED_TRANSFER_MESSAGE),
    });
  });
});
