import * as repo from "../repositories/advisorRequest.repository.js";
import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";

const OFFICIAL_SUPERVISOR_ROLES = new Set([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]);
const PENDING_REVIEW_STATUSES = new Set(["pending", "escalated"]);
const WAITING_ASSIGNMENT_STATUSES = new Set(["approved", "override_approved", "redirected"]);
const BLOCKING_REQUEST_STATUSES = new Set([
  "pending",
  "escalated",
  "approved",
  "override_approved",
  "redirected",
  "assigned",
]);

function mapSupervisors(thesis) {
  if (!thesis?.thesisSupervisors?.length) return [];

  return thesis.thesisSupervisors
    .filter((supervisor) => OFFICIAL_SUPERVISOR_ROLES.has(supervisor.role?.name))
    .map((supervisor) => ({
      id: supervisor.id,
      lecturerId: supervisor.lecturerId,
      name: supervisor.lecturer?.user?.fullName ?? "-",
      email: supervisor.lecturer?.user?.email ?? null,
      avatarUrl: supervisor.lecturer?.user?.avatarUrl ?? null,
      role: supervisor.role?.name ?? null,
    }));
}

function mapGateTasks(thesis) {
  if (!thesis?.thesisMilestones?.length) return [];

  return thesis.thesisMilestones.map((task) => ({
    id: task.id,
    title: task.title,
    templateId: task.milestoneTemplate?.id ?? null,
    templateName: task.milestoneTemplate?.name ?? task.title,
    status: task.status,
    isCompleted: task.status === "completed",
  }));
}

function buildAdvisorAccessState(studentContext, blockingRequest) {
  const thesis = studentContext?.thesis?.[0] ?? null;
  const supervisors = mapSupervisors(thesis);
  const gateTasks = mapGateTasks(thesis);
  const gateConfigured = gateTasks.length > 0;
  const gateOpen = gateConfigured && gateTasks.every((task) => task.isCompleted);
  const hasOfficialSupervisor = supervisors.length > 0;
  const hasBlockingRequest = Boolean(
    blockingRequest && BLOCKING_REQUEST_STATUSES.has(blockingRequest.status)
  );

  let canBrowseCatalog = false;
  let canSubmitRequest = false;
  let canOpenLogbook = hasOfficialSupervisor;
  let reason = "Data akses pembimbing sedang diproses.";
  let nextStep = "contact_admin";

  if (!thesis) {
    reason = "Data Tugas Akhir/Metopen Anda belum tersedia. Silakan hubungi admin atau pengampu.";
    nextStep = "wait_thesis_context";
  } else if (hasOfficialSupervisor) {
    reason = "Anda sudah memiliki dosen pembimbing resmi.";
    nextStep = "open_logbook";
  } else if (hasBlockingRequest && blockingRequest) {
    if (PENDING_REVIEW_STATUSES.has(blockingRequest.status)) {
      reason = "Anda masih memiliki pengajuan pembimbing yang sedang diproses.";
      nextStep =
        blockingRequest.status === "escalated"
          ? "wait_department_review"
          : "wait_lecturer_response";
    } else if (WAITING_ASSIGNMENT_STATUSES.has(blockingRequest.status)) {
      reason = "Pengajuan Anda sudah disetujui dan sedang menunggu penetapan pembimbing.";
      nextStep = "wait_assignment";
    } else {
      reason = "Penetapan pembimbing sedang disinkronkan. Silakan tunggu beberapa saat.";
      nextStep = "wait_assignment_sync";
    }
  } else if (!gateConfigured) {
    reason = "Milestone gate pencarian pembimbing belum dikonfigurasi oleh dosen pengampu.";
    nextStep = "wait_gate_configuration";
  } else if (!gateOpen) {
    reason = "Selesaikan milestone gate Metopen terlebih dahulu untuk membuka pencarian pembimbing.";
    nextStep = "complete_gate";
  } else {
    canBrowseCatalog = true;
    canSubmitRequest = true;
    reason = "Anda sudah memenuhi syarat untuk mencari dan mengajukan dosen pembimbing.";
    nextStep = "browse_catalog";
  }

  return {
    studentId: studentContext.id,
    thesisId: thesis?.id ?? null,
    thesisTitle: thesis?.title ?? null,
    thesisStatus: thesis?.thesisStatus?.name ?? null,
    gateConfigured,
    gateOpen,
    gates: gateTasks,
    supervisors,
    hasOfficialSupervisor,
    hasBlockingRequest,
    blockingRequest,
    requestStatus: blockingRequest?.status ?? null,
    canBrowseCatalog,
    canSubmitRequest,
    canOpenLogbook,
    reason,
    nextStep,
  };
}

async function resolveStudentAdvisorAccessState(userId) {
  const studentContext = await repo.findStudentAdvisorAccessContext(userId);
  if (!studentContext) {
    throw new NotFoundError("Data mahasiswa tidak ditemukan");
  }

  const blockingRequest = await repo.findBlockingByStudent(studentContext.id);
  return buildAdvisorAccessState(studentContext, blockingRequest);
}

async function getStudentRecord(userId) {
  const student = await repo.findStudentByUserId(userId);
  if (!student) {
    throw new NotFoundError("Data mahasiswa tidak ditemukan");
  }

  return student;
}

// ============================================
// Lecturer Catalog (Student browsing)
// ============================================

/**
 * Get lecturer catalog with traffic-light quota status
 */
export async function getLecturerCatalog(userId, academicYearId) {
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canBrowseCatalog) {
    throw new ForbiddenError(accessState.reason);
  }

  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");
    academicYearId = activeYear.id;
  }

  const quotas = await repo.getLecturerCatalog(academicYearId);

  return quotas.map((q) => {
    const lecturer = q.lecturer;
    const remaining = q.quotaMax - q.currentCount;
    const activeTheses = lecturer.thesisSupervisors?.length || 0;

    let trafficLight;
    if (q.currentCount >= q.quotaMax) {
      trafficLight = "red";
    } else if (q.currentCount >= q.quotaSoftLimit) {
      trafficLight = "yellow";
    } else {
      trafficLight = "green";
    }

    // Collect topic names: offered topics (from ThesisTopic.lecturerId) + topics of active theses being supervised
    const fromOffered = lecturer.offeredTopics?.map((t) => t.name).filter(Boolean) || [];
    const fromSupervised = lecturer.thesisSupervisors
      ?.map((ts) => ts.thesis?.thesisTopic?.name)
      .filter(Boolean) || [];
    const supervisedTopics = [...new Set([...fromOffered, ...fromSupervised])];

    return {
      lecturerId: lecturer.id,
      fullName: lecturer.user?.fullName,
      identityNumber: lecturer.user?.identityNumber,
      email: lecturer.user?.email,
      avatarUrl: lecturer.user?.avatarUrl,
      scienceGroup: lecturer.scienceGroup,
      quotaMax: q.quotaMax,
      quotaSoftLimit: q.quotaSoftLimit,
      currentCount: q.currentCount,
      remaining,
      activeTheses,
      trafficLight,
      supervisedTopics,
    };
  });
}

// ============================================
// Submit Request (Student)
// ============================================

/**
 * Submit an advisor request.
 * Enforces exclusive lock (1 active request per student),
 * gate status, and split routing (normal vs escalated).
 */
export async function submitRequest(userId, data) {
  const { lecturerId, topicId, proposedTitle, backgroundSummary, justificationText } = data;
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canSubmitRequest) {
    throw new ForbiddenError(accessState.reason);
  }

  const studentId = accessState.studentId;

  // 1. Check exclusive lock — no active request allowed
  const existing = await repo.findActiveByStudent(studentId);
  if (existing) {
    throw new BadRequestError(
      "Anda sudah memiliki pengajuan aktif. Tunggu respon atau tarik pengajuan sebelumnya terlebih dahulu."
    );
  }

  // 2. Get active academic year
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");

  // 3. Verify topic exists
  const topic = await prisma.thesisTopic.findUnique({ where: { id: topicId } });
  if (!topic) throw new NotFoundError("Topik tidak ditemukan");

  // 4. Verify lecturer exists and is currently accepting requests
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: { id: true, acceptingRequests: true },
  });
  if (!lecturer) {
    throw new NotFoundError("Dosen pembimbing tidak ditemukan");
  }
  if (!lecturer.acceptingRequests) {
    throw new BadRequestError("Dosen yang Anda pilih sedang tidak menerima pengajuan pembimbing");
  }

  // 5. Get lecturer's quota to determine route
  const lecturerQuota = await prisma.lecturerSupervisionQuota.findUnique({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId: activeYear.id },
    },
  });

  const isOverloaded = lecturerQuota
    ? lecturerQuota.currentCount >= lecturerQuota.quotaMax
    : false;

  // 6. Determine route type
  let routeType = "normal";
  let status = "pending";

  if (isOverloaded) {
    // Escalation route — must have justification
    if (!justificationText || justificationText.trim().length < 20) {
      throw new BadRequestError(
        "Dosen yang Anda pilih sudah mencapai batas kuota. Anda wajib mengisi alasan justifikasi (minimal 20 karakter) untuk mengajukan ke Kepala Departemen."
      );
    }
    routeType = "escalated";
    status = "escalated";
  }

  // 7. Create request
  const request = await repo.create({
    studentId,
    lecturerId,
    academicYearId: activeYear.id,
    topicId,
    proposedTitle: proposedTitle || null,
    backgroundSummary: backgroundSummary || null,
    justificationText: justificationText || null,
    status,
    routeType,
  });

  return request;
}

// ============================================
// Student History & Status
// ============================================

/**
 * Get student's request history
 */
export async function getMyRequests(userId) {
  const student = await getStudentRecord(userId);
  return repo.findByStudent(student.id);
}

/**
 * Get canonical advisor access state for the authenticated student.
 */
export async function getMyAccessState(userId) {
  return resolveStudentAdvisorAccessState(userId);
}

/**
 * Withdraw a pending/escalated request
 */
export async function withdrawRequest(requestId, userId) {
  const student = await getStudentRecord(userId);
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.studentId !== student.id) throw new ForbiddenError("Bukan pengajuan Anda");

  if (!["pending", "escalated"].includes(request.status)) {
    throw new BadRequestError("Hanya pengajuan dengan status pending/escalated yang bisa ditarik");
  }

  return repo.updateStatus(requestId, {
    status: "withdrawn",
    withdrawnAt: new Date(),
  });
}

// ============================================
// Dosen Inbox & Response
// ============================================

/**
 * Get pending requests for a lecturer
 */
export async function getDosenInbox(userId) {
  return repo.findByLecturerId(userId);
}

/**
 * Get responded/historical requests for a lecturer
 */
export async function getDosenInboxHistory(userId) {
  return repo.findRespondedByLecturerId(userId);
}

/**
 * Lecturer responds to a request (accept/reject)
 */
export async function respondByLecturer(requestId, userId, { action, rejectionReason }) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
  if (request.status !== "pending") {
    throw new BadRequestError("Hanya pengajuan dengan status pending yang bisa direspon");
  }
  if (request.routeType !== "normal") {
    throw new BadRequestError("Pengajuan eskalasi hanya bisa diputuskan oleh Kepala Departemen");
  }

  if (action === "accept") {
    return repo.updateStatus(requestId, {
      status: "approved",
      lecturerRespondedAt: new Date(),
    });
  } else if (action === "reject") {
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BadRequestError("Alasan penolakan wajib diisi (minimal 5 karakter)");
    }
    return repo.updateStatus(requestId, {
      status: "rejected",
      rejectionReason: rejectionReason.trim(),
      lecturerRespondedAt: new Date(),
    });
  } else {
    throw new BadRequestError("Action harus 'accept' atau 'reject'");
  }
}

// ============================================
// KaDep Queue & Decision
// ============================================

/**
 * Get KaDep queue (escalated + pending assignment)
 */
export async function getKadepQueue() {
  const [escalated, pendingAssignment] = await Promise.all([
    repo.findEscalated(),
    repo.findPendingAssignment(),
  ]);

  return { escalated, pendingAssignment };
}

/**
 * Get smart recommendations for alternative lecturers
 * Score = (quotaRemaining * 3) + (sameTopicCount * 2) + (10 - activeThesisCount)
 */
export async function getRecommendations(requestId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const topicId = request.topicId;
  const scienceGroupId = request.topic?.scienceGroupId ?? null;

  if (!scienceGroupId) {
    return {
      alternatives: [],
      message: "KBK topik belum dipetakan. Minta Admin/Sekdep untuk menghubungkan topik ini ke Kelompok Bidang Keahlian.",
    };
  }

  // Get active academic year
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) return { alternatives: [], message: "Tidak ada tahun akademik aktif" };

  // Find alternative lecturers in same KBK
  const alternatives = await repo.findAlternativeLecturers(
    scienceGroupId,
    activeYear.id,
    request.lecturerId
  );

  // Score and rank
  const scored = alternatives
    .map((q) => {
      const remaining = q.quotaMax - q.currentCount;
      const activeTheses = q.lecturer.thesisSupervisors?.length || 0;

      // Count how many theses this lecturer supervises with the same topic
      const sameTopicCount = q.lecturer.thesisSupervisors?.filter(
        (ts) => ts.thesis?.thesisTopicId === topicId
      ).length || 0;

      const score = (remaining * 3) + (sameTopicCount * 2) + Math.max(0, 10 - activeTheses);

      let trafficLight;
      if (q.currentCount >= q.quotaMax) trafficLight = "red";
      else if (q.currentCount >= q.quotaSoftLimit) trafficLight = "yellow";
      else trafficLight = "green";

      return {
        lecturerId: q.lecturerId,
        fullName: q.lecturer.user?.fullName,
        identityNumber: q.lecturer.user?.identityNumber,
        avatarUrl: q.lecturer.user?.avatarUrl,
        scienceGroup: q.lecturer.scienceGroup,
        quotaMax: q.quotaMax,
        currentCount: q.currentCount,
        remaining,
        activeTheses,
        sameTopicCount,
        trafficLight,
        score,
      };
    })
    // Only show lecturers that aren't overloaded
    .filter((l) => l.trafficLight !== "red")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { alternatives: scored };
}

/**
 * KaDep decides on an escalated request (override or redirect)
 */
export async function decideByKadep(requestId, kadepUserId, { action, targetLecturerId, notes }) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.status !== "escalated") {
    throw new BadRequestError("Hanya pengajuan eskalasi yang bisa diputuskan oleh KaDep");
  }

  const now = new Date();

  if (action === "override") {
    return repo.updateStatus(requestId, {
      status: "override_approved",
      reviewedBy: kadepUserId,
      reviewedAt: now,
      kadepNotes: notes || null,
    });
  } else if (action === "redirect") {
    if (!targetLecturerId) {
      throw new BadRequestError("Pilih dosen tujuan untuk pengalihan");
    }
    // Verify target lecturer exists and has capacity
    const targetLecturer = await prisma.lecturer.findUnique({ where: { id: targetLecturerId } });
    if (!targetLecturer) throw new NotFoundError("Dosen tujuan tidak ditemukan");

    return repo.updateStatus(requestId, {
      status: "redirected",
      redirectedTo: targetLecturerId,
      reviewedBy: kadepUserId,
      reviewedAt: now,
      kadepNotes: notes || null,
    });
  } else {
    throw new BadRequestError("Action harus 'override' atau 'redirect'");
  }
}

/**
 * KaDep assigns advisor — creates ThesisSupervisors record
 */
export async function assignAdvisor(requestId, kadepUserId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const validStatuses = ["approved", "override_approved", "redirected"];
  if (!validStatuses.includes(request.status)) {
    throw new BadRequestError(
      `Pengajuan harus berstatus approved/override_approved/redirected, status saat ini: ${request.status}`
    );
  }

  // Determine which lecturer gets assigned
  const assignedLecturerId =
    request.status === "redirected" && request.redirectedTo
      ? request.redirectedTo
      : request.lecturerId;

  const [supervisorRole, thesisStatus] = await Promise.all([
    prisma.userRole.findFirst({
      where: { name: ROLES.PEMBIMBING_1 },
      select: { id: true, name: true },
    }),
    prisma.thesisStatus.findFirst({
      where: {
        name: { equals: "Bimbingan", mode: "insensitive" },
      },
      select: { id: true, name: true },
    }),
  ]);

  if (!supervisorRole) {
    throw new BadRequestError("Role Pembimbing 1 belum dikonfigurasi");
  }
  if (!thesisStatus) {
    throw new BadRequestError("Status thesis 'Bimbingan' belum dikonfigurasi");
  }

  const existingThesis = await prisma.thesis.findFirst({
    where: { studentId: request.studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    let thesisId = existingThesis?.id ?? null;

    if (!thesisId) {
      const createdThesis = await tx.thesis.create({
        data: {
          studentId: request.studentId,
          academicYearId: request.academicYearId,
          thesisTopicId: request.topicId,
          title: request.proposedTitle || "Judul belum ditentukan",
          thesisStatusId: thesisStatus.id,
        },
        select: { id: true },
      });
      thesisId = createdThesis.id;
    } else {
      await tx.thesis.update({
        where: { id: thesisId },
        data: {
          academicYearId: existingThesis.academicYearId ?? request.academicYearId,
          thesisTopicId: existingThesis.thesisTopicId ?? request.topicId,
          title: existingThesis.title ?? request.proposedTitle ?? "Judul belum ditentukan",
          thesisStatusId: thesisStatus.id,
        },
      });
    }

    const [existingSupervisorByRole, existingSupervisorByLecturer] = await Promise.all([
      tx.thesisSupervisors.findFirst({
        where: { thesisId, roleId: supervisorRole.id },
        select: { id: true },
      }),
      tx.thesisSupervisors.findFirst({
        where: { thesisId, lecturerId: assignedLecturerId },
        select: { id: true },
      }),
    ]);

    if (existingSupervisorByRole) {
      throw new BadRequestError("Mahasiswa ini sudah memiliki Pembimbing 1");
    }
    if (existingSupervisorByLecturer) {
      throw new BadRequestError("Dosen ini sudah terdaftar sebagai pembimbing mahasiswa tersebut");
    }

    await tx.thesisSupervisors.create({
      data: {
        thesisId,
        lecturerId: assignedLecturerId,
        roleId: supervisorRole.id,
      },
    });

    await tx.lecturerSupervisionQuota.upsert({
      where: {
        lecturerId_academicYearId: {
          lecturerId: assignedLecturerId,
          academicYearId: request.academicYearId,
        },
      },
      update: {
        currentCount: { increment: 1 },
      },
      create: {
        lecturerId: assignedLecturerId,
        academicYearId: request.academicYearId,
        currentCount: 1,
      },
    });

    await tx.thesisAdvisorRequest.update({
      where: { id: requestId },
      data: {
        status: "assigned",
        reviewedBy: kadepUserId,
        reviewedAt: new Date(),
      },
    });

    return { thesisId };
  });

  // FR-KDP-03: Generate Surat Penugasan TA-04 in background (non-blocking)
  generateTA04Letter(result.thesisId, assignedLecturerId, request).catch((err) => {
    console.error("TA-04 generation failed (non-blocking):", err.message);
  });

  return {
    message: "Pembimbing berhasil ditetapkan",
    thesisId: result.thesisId,
    assignedLecturerId,
    studentId: request.studentId,
  };
}

/**
 * Generate TA-04 Surat Penugasan Pembimbing (background task)
 */
async function generateTA04Letter(thesisId, lecturerId, request) {
  const [thesis, lecturer, student] = await Promise.all([
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: { title: true, academicYear: { select: { name: true } } },
    }),
    prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: { user: { select: { fullName: true, identityNumber: true } } },
    }),
    prisma.student.findUnique({
      where: { id: request.studentId },
      include: { user: { select: { fullName: true, identityNumber: true } } },
    }),
  ]);

  if (!thesis || !lecturer || !student) return;

  const fs = await import("fs/promises");
  const path = await import("path");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const content = `
SURAT PENUGASAN DOSEN PEMBIMBING TUGAS AKHIR (TA-04)

Nomor: TA04/${now.getFullYear()}/${thesisId.substring(0, 8).toUpperCase()}

Yang bertanda tangan di bawah ini, Kepala Departemen Sistem Informasi Universitas Andalas,
menugaskan dosen berikut sebagai Pembimbing Tugas Akhir:

Dosen Pembimbing:
  Nama  : ${lecturer.user?.fullName}
  NIP   : ${lecturer.user?.identityNumber}

Untuk membimbing mahasiswa:
  Nama  : ${student.user?.fullName}
  NIM   : ${student.user?.identityNumber}
  Judul : ${thesis.title || "Belum ditentukan"}
  Tahun Akademik: ${thesis.academicYear?.name || "-"}

Surat ini berlaku sejak tanggal ditetapkan.

Padang, ${dateStr}
Kepala Departemen Sistem Informasi
  `.trim();

  const outputDir = path.join(process.cwd(), "uploads", "documents", "ta04");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `TA04_${student.user?.identityNumber}_${Date.now()}.txt`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, content, "utf-8");

  await prisma.document.create({
    data: {
      fileName,
      filePath: `uploads/documents/ta04/${fileName}`,
      fileSize: Buffer.byteLength(content, "utf-8"),
      mimeType: "text/plain",
      description: `Surat Penugasan Pembimbing TA-04 - ${student.user?.fullName}`,
      documentTypeId: null,
    },
  });
}

/**
 * Get request detail by ID
 */
export async function getRequestDetail(requestId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  return request;
}
