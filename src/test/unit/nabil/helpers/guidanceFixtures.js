/**
 * Fixture state for guidance-revival regression tests.
 * Thesis t1 has: active P1 (p1), active P2 (p2), released former P1 (rel),
 * terminated former P1 (term). "other" is an unrelated lecturer; "kadep" and "gkm"
 * hold department roles only.
 */
const PAST = new Date("2026-01-10T03:00:00.000Z");

function user(id, fullName, roles = []) {
  return {
    id,
    fullName,
    email: `${id}@example.test`,
    identityNumber: `NIP-${id}`,
    userHasRoles: roles.map((name) => ({ status: "active", role: { name } })),
  };
}

export function buildState() {
  const users = [
    user("stu1", "Mahasiswa Uji", ["Mahasiswa"]),
    user("p1", "Dosen P1", ["Pembimbing 1"]),
    user("p2", "Dosen P2", ["Pembimbing 2"]),
    user("rel", "Dosen Released", ["Pembimbing 1"]),
    user("term", "Dosen Terminated", ["Pembimbing 1"]),
    user("other", "Dosen Lain", ["Pembimbing 1"]),
    user("kadep", "Ketua Departemen", ["Ketua Departemen"]),
    user("gkm", "GKM Saja", ["GKM"]),
    user("sekdep", "Sekdep Saja", ["Sekretaris Departemen"]),
  ];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const lecturerRef = (id) => ({ id, user: { id, fullName: byId[id].fullName, email: byId[id].email } });

  // Relation `thesis` on supervisor rows resolves to the stored thesis row, so a test
  // that changes the thesis status (e.g. to on_leave) is seen through the relation too.
  let thesisRow = null;
  const supRow = (id, lecturerId, roleName, status) => ({
    id,
    thesisId: "t1",
    lecturerId,
    status,
    seminarReady: false,
    defenceReady: false,
    role: { id: `role-${roleName}`, name: roleName },
    lecturer: lecturerRef(lecturerId),
    get thesis() {
      return thesisRow;
    },
  });
  const thesisSupervisors = [
    supRow("ts-p1", "p1", "Pembimbing 1", "active"),
    supRow("ts-p2", "p2", "Pembimbing 2", "active"),
    supRow("ts-rel", "rel", "Pembimbing 1", "released"),
    supRow("ts-term", "term", "Pembimbing 1", "terminated"),
  ];

  const student = { id: "stu1", user: { id: "stu1", fullName: "Mahasiswa Uji", identityNumber: "2211520001" } };
  const thesisRef = { id: "t1", title: "TA Uji", studentId: "stu1", status: "research", student };
  const thesis = (thesisRow = {
    ...thesisRef,
    academicYearId: "ay-1",
    thesisTopicId: "topic-1", // Paket B (K20): templates follow the thesis topic
    thesisSupervisors, // same objects as the thesisSupervisors table
  });

  const guidance = (id, status, supervisorId, extra = {}) => ({
    id,
    thesisId: "t1",
    status,
    phase: "research",
    supervisorId,
    requestedDate: PAST,
    approvedDate: PAST,
    duration: 60,
    sessionSummary: null,
    actionItems: null,
    supervisorFeedback: null,
    thesis: thesisRef,
    supervisor: lecturerRef(supervisorId),
    milestones: [],
    filePath: null,
    fileName: null,
    fileUploadedAt: null,
    ...extra,
  });
  const completed = Array.from({ length: 7 }, (_, i) => guidance(`g-done-${i + 1}`, "completed", "p1"));

  const milestone = (id, status, progressPercentage) => ({
    id,
    thesisId: "t1",
    title: `Milestone ${id}`,
    status,
    phase: "research",
    progressPercentage,
    validatedBy: null,
    thesis: thesisRef,
    guidances: [],
  });

  return {
    user: users,
    userHasRole: users.flatMap((u) => u.userHasRoles.map((r) => ({ userId: u.id, ...r }))),
    lecturer: users.filter((u) => !["stu1"].includes(u.id)).map((u) => lecturerRef(u.id)),
    student: [student],
    thesis: [thesis],
    thesisSupervisors,
    thesisGuidance: [
      guidance("g-req", "requested", "p1", { approvedDate: null }),
      guidance("g-acc", "accepted", "p1"),
      guidance("g-rej", "summary_rejected", "p1", {
        sessionSummary: "Ringkasan lama",
        supervisorFeedback: "Lengkapi pembahasan bab 3",
      }),
      guidance("g-resch", "rescheduled", "p1"),
      guidance("g-pend-p1", "summary_pending", "p1", { sessionSummary: "Ringkasan" }),
      guidance("g-pend-p2", "summary_pending", "p2", { sessionSummary: "Ringkasan" }),
      guidance("g-pend-rel", "summary_pending", "rel", { sessionSummary: "Ringkasan" }),
      guidance("g-pend-term", "summary_pending", "term", { sessionSummary: "Ringkasan" }),
      guidance("g-acc-rel", "accepted", "rel"),
      ...completed,
    ],
    thesisMilestone: [milestone("m-review", "pending_review", 100), milestone("m-progress", "in_progress", 40)],
    notification: [],
    auditLog: [],
  };
}
