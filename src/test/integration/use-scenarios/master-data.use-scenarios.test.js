import { afterAll, beforeAll, describe, expect, it } from "vitest";

import prisma from "../../../config/prisma.js";
import { createRoom, deleteRoom, updateRoom } from "../../../services/adminfeatures.service.js";
import * as availabilityService from "../../../services/lecturer-availability.service.js";
import * as curriculumService from "../../../services/curriculum.service.js";
import * as cplService from "../../../services/cpl.service.js";
import * as thesisCpmkService from "../../../services/thesis-cpmk.service.js";
import * as seminarRequirementService from "../../../services/seminar-requirement.service.js";
import * as defenceRequirementService from "../../../services/defence-requirement.service.js";
import * as seminarRubricService from "../../../services/seminar-rubric.service.js";
import * as defenceRubricService from "../../../services/defence-rubric.service.js";

const marker = `UCMD-${Date.now()}`;
const ids = {
  users: [],
  rooms: [],
  curricula: [],
  cpls: [],
  academicYears: [],
  thesisCpmks: [],
  seminarRequirements: [],
  defenceRequirements: [],
  seminarCriteria: [],
  defenceExaminerCriteria: [],
  defenceSupervisorCriteria: [],
};

let lecturer;
let student;
let actor;
let curriculum;
let academicYear;
let rubricCpmk;
const baseYear = 5000 + Number(String(Date.now()).slice(-5));

async function createUserWithProfile(kind, suffix) {
  const user = await prisma.user.create({
    data: {
      fullName: `${marker}-${suffix}`,
      identityNumber: `${marker}-${suffix}`,
      identityType: kind === "student" ? "NIM" : "NIP",
      email: `${marker.toLowerCase()}-${suffix}@test.invalid`,
      password: "integration-test",
    },
  });
  ids.users.push(user.id);
  if (kind === "student") return prisma.student.create({ data: { id: user.id, skscompleted: 144 } });
  return prisma.lecturer.create({ data: { id: user.id } });
}

beforeAll(async () => {
  lecturer = await createUserWithProfile("lecturer", "lecturer");
  student = await createUserWithProfile("student", "student");
  actor = await createUserWithProfile("lecturer", "actor");

  curriculum = await prisma.curriculum.create({
    data: { name: `${marker}-base-curriculum`, startYear: baseYear, endYear: baseYear + 2 },
  });
  ids.curricula.push(curriculum.id);

  academicYear = await prisma.academicYear.create({
    data: {
      semester: "ganjil",
      year: marker,
      startDate: new Date("2098-01-01T00:00:00.000Z"),
      endDate: new Date("2098-06-30T00:00:00.000Z"),
      isActive: false,
      thesisSeminarMinimumScore: 55,
      thesisDefenceMinimumScore: 55,
    },
  });
  ids.academicYears.push(academicYear.id);

  rubricCpmk = await thesisCpmkService.createThesisCpmk({
    academicYearId: academicYear.id,
    code: `${marker}-RUBRIC`,
    description: "CPMK fixture rubrik",
  });
  ids.thesisCpmks.push(rubricCpmk.id);
});

afterAll(async () => {
  await prisma.thesisSeminarAssessmentRubric.deleteMany({
    where: { assessmentCriteriaId: { in: ids.seminarCriteria } },
  }).catch(() => {});
  await prisma.thesisDefenceExaminerAssessmentRubric.deleteMany({
    where: { assessmentCriteriaId: { in: ids.defenceExaminerCriteria } },
  }).catch(() => {});
  await prisma.thesisDefenceSupervisorAssessmentRubric.deleteMany({
    where: { assessmentCriteriaId: { in: ids.defenceSupervisorCriteria } },
  }).catch(() => {});
  await prisma.thesisSeminarAssessmentCriteria.deleteMany({ where: { id: { in: ids.seminarCriteria } } }).catch(() => {});
  await prisma.thesisDefenceExaminerAssessmentCriteria.deleteMany({ where: { id: { in: ids.defenceExaminerCriteria } } }).catch(() => {});
  await prisma.thesisDefenceSupervisorAssessmentCriteria.deleteMany({ where: { id: { in: ids.defenceSupervisorCriteria } } }).catch(() => {});
  await prisma.thesisSeminarRequirement.deleteMany({ where: { id: { in: ids.seminarRequirements } } }).catch(() => {});
  await prisma.thesisDefenceRequirement.deleteMany({ where: { id: { in: ids.defenceRequirements } } }).catch(() => {});
  await prisma.studentCplScore.deleteMany({ where: { studentId: student?.id } }).catch(() => {});
  await prisma.cpl.deleteMany({ where: { id: { in: ids.cpls } } }).catch(() => {});
  await prisma.thesisCpmk.deleteMany({ where: { id: { in: ids.thesisCpmks } } }).catch(() => {});
  await prisma.curriculum.deleteMany({ where: { id: { in: ids.curricula } } }).catch(() => {});
  await prisma.lecturerAvailability.deleteMany({ where: { lecturerId: lecturer?.id } }).catch(() => {});
  await prisma.room.deleteMany({ where: { id: { in: ids.rooms } } }).catch(() => {});
  await prisma.academicYear.deleteMany({ where: { id: { in: ids.academicYears } } }).catch(() => {});
  await prisma.student.deleteMany({ where: { id: student?.id } }).catch(() => {});
  await prisma.lecturer.deleteMany({ where: { id: { in: [lecturer?.id, actor?.id].filter(Boolean) } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } }).catch(() => {});
});

/** UC-01 - Mengelola Data Ruangan (KF-01). */
describe("UC-01 - Mengelola Data Ruangan", () => {
  it("Normal Flow - creates and persists a room", async () => {
    const room = await createRoom({ name: `${marker}-Room`, location: "Lt. 1", capacity: 30 });
    ids.rooms.push(room.id);
    await expect(prisma.room.findUnique({ where: { id: room.id } })).resolves.toMatchObject({ capacity: 30 });
  });

  it("Alternative Flow A - updates a persisted room", async () => {
    const room = await createRoom({ name: `${marker}-Room-Update`, location: "Lt. 1", capacity: 20 });
    ids.rooms.push(room.id);
    await updateRoom(room.id, { capacity: 45 });
    await expect(prisma.room.findUnique({ where: { id: room.id } })).resolves.toMatchObject({ capacity: 45 });
  });

  it("Alternative Flow B - deletes an unused room", async () => {
    const room = await createRoom({ name: `${marker}-Room-Delete`, location: "Lt. 2", capacity: 20 });
    ids.rooms.push(room.id);
    await deleteRoom(room.id);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
  });

  it("Alternative Flow C - rejects a duplicate without adding another row", async () => {
    const name = `${marker}-Room-Duplicate`;
    const room = await createRoom({ name, location: "Lt. 3", capacity: 20 });
    ids.rooms.push(room.id);
    const before = await prisma.room.count({ where: { name, location: "Lt. 3" } });
    await expect(createRoom({ name, location: "Lt. 3", capacity: 25 })).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.room.count({ where: { name, location: "Lt. 3" } })).toBe(before);
  });
});

/** UC-02 - Mengelola Ketersediaan Dosen (KF-02). */
describe("UC-02 - Mengelola Ketersediaan Dosen", () => {
  const validWindow = { day: "monday", startTime: "08:00", endTime: "10:00", validFrom: "2099-01-01", validUntil: "2099-06-30" };

  it("Normal Flow - creates a lecturer availability slot", async () => {
    const created = await availabilityService.createAvailability(lecturer.id, validWindow);
    expect(await prisma.lecturerAvailability.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("Alternative Flow A - updates an owned availability slot", async () => {
    const created = await availabilityService.createAvailability(lecturer.id, { ...validWindow, day: "tuesday" });
    await availabilityService.updateAvailability(created.id, lecturer.id, { endTime: "11:00" });
    const stored = await prisma.lecturerAvailability.findUnique({ where: { id: created.id } });
    expect(stored.endTime.getUTCHours()).toBe(11);
  });

  it("Alternative Flow B - deletes an owned availability slot", async () => {
    const created = await availabilityService.createAvailability(lecturer.id, { ...validWindow, day: "wednesday" });
    await availabilityService.deleteAvailability(created.id, lecturer.id);
    expect(await prisma.lecturerAvailability.findUnique({ where: { id: created.id } })).toBeNull();
  });

});

/** UC-03 - Mengelola Data Kurikulum (KF-03). */
describe("UC-03 - Mengelola Data Kurikulum", () => {
  it("Normal Flow - creates and persists a curriculum", async () => {
    const created = await curriculumService.create({ name: `${marker}-Curriculum`, startYear: baseYear + 10, endYear: baseYear + 12 });
    ids.curricula.push(created.id);
    expect(await prisma.curriculum.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("Alternative Flow A - updates a curriculum", async () => {
    const created = await curriculumService.create({ name: `${marker}-Curriculum-Update`, startYear: baseYear + 20, endYear: baseYear + 22 });
    ids.curricula.push(created.id);
    await curriculumService.update(created.id, { name: `${marker}-Curriculum-Updated` });
    await expect(prisma.curriculum.findUnique({ where: { id: created.id } })).resolves.toMatchObject({ name: `${marker}-Curriculum-Updated` });
  });

  it("Alternative Flow B - deletes an unused curriculum", async () => {
    const created = await curriculumService.create({ name: `${marker}-Curriculum-Delete`, startYear: baseYear + 30, endYear: baseYear + 32 });
    ids.curricula.push(created.id);
    await curriculumService.remove(created.id);
    expect(await prisma.curriculum.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("Alternative Flow C - rejects an overlapping range without persisting it", async () => {
    const before = await prisma.curriculum.count();
    await expect(curriculumService.create({ name: `${marker}-Curriculum-Overlap`, startYear: baseYear, endYear: baseYear + 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.curriculum.count()).toBe(before);
  });
});

/** UC-04 - Mengelola Data CPL (KF-04). */
describe("UC-04 - Mengelola Data CPL", () => {
  it("Normal Flow - creates and persists an active CPL", async () => {
    const created = await cplService.createCpl({ curriculumId: curriculum.id, code: `${marker}-CPL1`, description: "CPL integrasi", minimalScore: 55 });
    ids.cpls.push(created.id);
    await expect(prisma.cpl.findUnique({ where: { id: created.id } })).resolves.toMatchObject({ isActive: true });
  });

  it("Alternative Flow A - updates mutable CPL fields", async () => {
    const created = await cplService.createCpl({ curriculumId: curriculum.id, code: `${marker}-CPL2`, description: "Sebelum", minimalScore: 55 });
    ids.cpls.push(created.id);
    await cplService.updateCpl(created.id, { description: "Sesudah", minimalScore: 60 });
    await expect(prisma.cpl.findUnique({ where: { id: created.id } })).resolves.toMatchObject({ description: "Sesudah", minimalScore: 60 });
  });

  it("Alternative Flow B - deletes an unused CPL", async () => {
    const created = await cplService.createCpl({ curriculumId: curriculum.id, code: `${marker}-CPL3`, description: "Hapus", minimalScore: 55 });
    ids.cpls.push(created.id);
    await cplService.deleteCpl(created.id);
    expect(await prisma.cpl.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("Alternative Flow C - rejects an active duplicate without a second row", async () => {
    const code = `${marker}-CPL4`;
    const created = await cplService.createCpl({ curriculumId: curriculum.id, code, description: "Awal", minimalScore: 55 });
    ids.cpls.push(created.id);
    const before = await prisma.cpl.count({ where: { curriculumId: curriculum.id, code } });
    await expect(cplService.createCpl({ curriculumId: curriculum.id, code, description: "Duplikat", minimalScore: 55 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.cpl.count({ where: { curriculumId: curriculum.id, code } })).toBe(before);
  });
});

/** UC-05 - Mengelola CPL Mahasiswa (KF-05). */
describe("UC-05 - Mengelola CPL Mahasiswa", () => {
  let scoreCpl;

  beforeAll(async () => {
    scoreCpl = await cplService.createCpl({ curriculumId: curriculum.id, code: `${marker}-SCORE`, description: "CPL score", minimalScore: 55 });
    ids.cpls.push(scoreCpl.id);
  });

  it("Normal Flow - creates a manual student CPL score", async () => {
    const result = await cplService.createCplStudentScore(scoreCpl.id, { studentId: student.id, score: 78, status: "finalized" }, actor.id);
    expect(result).toMatchObject({ score: 78, source: "manual", status: "finalized" });
    expect(await prisma.studentCplScore.findUnique({ where: { studentId_cplId: { studentId: student.id, cplId: scoreCpl.id } } })).not.toBeNull();
  });

  it("Alternative Flow A - updates a manual score", async () => {
    await cplService.updateCplStudentScore(scoreCpl.id, student.id, { score: 82, status: "finalized" }, actor.id);
    await expect(prisma.studentCplScore.findUnique({ where: { studentId_cplId: { studentId: student.id, cplId: scoreCpl.id } } })).resolves.toMatchObject({ score: 82 });
  });

  it("Alternative Flow B - refuses to edit a SIA score and preserves state", async () => {
    await prisma.studentCplScore.update({
      where: { studentId_cplId: { studentId: student.id, cplId: scoreCpl.id } },
      data: { source: "SIA" },
    });
    await expect(cplService.updateCplStudentScore(scoreCpl.id, student.id, { score: 99 }, actor.id))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(prisma.studentCplScore.findUnique({ where: { studentId_cplId: { studentId: student.id, cplId: scoreCpl.id } } })).resolves.toMatchObject({ score: 82, source: "SIA" });
  });
});

/** UC-06 - Mengelola CPMK Tugas Akhir (KF-06). */
describe("UC-06 - Mengelola CPMK Tugas Akhir", () => {
  it("Normal Flow - creates a thesis CPMK for one academic year", async () => {
    const created = await thesisCpmkService.createThesisCpmk({ academicYearId: academicYear.id, code: `${marker}-CPMK1`, description: "CPMK integrasi" });
    ids.thesisCpmks.push(created.id);
    expect(await prisma.thesisCpmk.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("Alternative Flow A - updates an unused CPMK", async () => {
    const created = await thesisCpmkService.createThesisCpmk({ academicYearId: academicYear.id, code: `${marker}-CPMK2`, description: "Sebelum" });
    ids.thesisCpmks.push(created.id);
    await thesisCpmkService.updateThesisCpmk(created.id, { description: "Sesudah" });
    await expect(prisma.thesisCpmk.findUnique({ where: { id: created.id } })).resolves.toMatchObject({ description: "Sesudah" });
  });

  it("Alternative Flow B - deletes an unused CPMK", async () => {
    const created = await thesisCpmkService.createThesisCpmk({ academicYearId: academicYear.id, code: `${marker}-CPMK3`, description: "Hapus" });
    ids.thesisCpmks.push(created.id);
    await thesisCpmkService.deleteThesisCpmk(created.id);
    expect(await prisma.thesisCpmk.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("Alternative Flow C - rejects a duplicate code in the same academic year", async () => {
    const code = `${marker}-CPMK4`;
    const created = await thesisCpmkService.createThesisCpmk({ academicYearId: academicYear.id, code, description: "Awal" });
    ids.thesisCpmks.push(created.id);
    const before = await prisma.thesisCpmk.count({ where: { academicYearId: academicYear.id, code } });
    await expect(thesisCpmkService.createThesisCpmk({ academicYearId: academicYear.id, code, description: "Duplikat" }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.thesisCpmk.count({ where: { academicYearId: academicYear.id, code } })).toBe(before);
  });
});

function requirementScenarios({ uc, label, service, model, idsKey }) {
  describe(`${uc} - Mengelola Syarat ${label}`, () => {
    let created;

    it("Normal Flow - creates an academic-year requirement", async () => {
      created = await service.create({ academicYearId: academicYear.id, name: `${marker}-${label}`, description: "Persyaratan awal" });
      ids[idsKey].push(created.id);
      expect(await prisma[model].findUnique({ where: { id: created.id } })).not.toBeNull();
    });

    it("Alternative Flow A - updates requirement metadata", async () => {
      await service.update(created.id, { description: "Persyaratan diperbarui" });
      await expect(prisma[model].findUnique({ where: { id: created.id } })).resolves.toMatchObject({ description: "Persyaratan diperbarui" });
    });

    it("Alternative Flow B - deletes an unused requirement", async () => {
      const removable = await service.create({ academicYearId: academicYear.id, name: `${marker}-${label}-hapus`, description: "Hapus" });
      ids[idsKey].push(removable.id);
      await service.remove(removable.id);
      expect(await prisma[model].findUnique({ where: { id: removable.id } })).toBeNull();
    });
  });
}

/** UC-07 - Mengelola Syarat Seminar Hasil (KF-07). */
requirementScenarios({ uc: "UC-07", label: "Seminar", service: seminarRequirementService, model: "thesisSeminarRequirement", idsKey: "seminarRequirements" });

/** UC-09 - Mengelola Syarat Sidang TA (KF-09). */
requirementScenarios({ uc: "UC-09", label: "Sidang", service: defenceRequirementService, model: "thesisDefenceRequirement", idsKey: "defenceRequirements" });

/** UC-08 - Mengelola Rubrik Seminar Hasil (KF-08). */
describe("UC-08 - Mengelola Rubrik Seminar Hasil", () => {
  it("Normal Flow - creates a criterion and rubric linked to thesis CPMK", async () => {
    const criterion = await seminarRubricService.createCriteria({ thesisCpmkId: rubricCpmk.id, name: `${marker}-Seminar-Criteria`, maxScore: 60 });
    ids.seminarCriteria.push(criterion.id);
    const rubric = await seminarRubricService.createRubric(criterion.id, { minScore: 0, maxScore: 60, description: "Deskripsi level" });
    expect(await prisma.thesisSeminarAssessmentRubric.findUnique({ where: { id: rubric.id } })).not.toBeNull();
  });

  it("Alternative Flow A - rejects a criterion that makes the academic-year total exceed 100", async () => {
    const before = await prisma.thesisSeminarAssessmentCriteria.count({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
    await expect(seminarRubricService.createCriteria({ thesisCpmkId: rubricCpmk.id, name: `${marker}-Seminar-Overflow`, maxScore: 50 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.thesisSeminarAssessmentCriteria.count({ where: { thesisCpmk: { academicYearId: academicYear.id } } })).toBe(before);
  });
});

/** UC-10 - Mengelola Rubrik Sidang TA (KF-10). */
describe("UC-10 - Mengelola Rubrik Sidang TA", () => {
  it("Normal Flow - creates role-specific criteria and rubrics", async () => {
    const examinerCriterion = await defenceRubricService.createCriteria({ role: "examiner", thesisCpmkId: rubricCpmk.id, name: `${marker}-Examiner-Criteria`, maxScore: 40 });
    ids.defenceExaminerCriteria.push(examinerCriterion.id);
    const supervisorCriterion = await defenceRubricService.createCriteria({ role: "supervisor", thesisCpmkId: rubricCpmk.id, name: `${marker}-Supervisor-Criteria`, maxScore: 40 });
    ids.defenceSupervisorCriteria.push(supervisorCriterion.id);
    const examinerRubric = await defenceRubricService.createRubric("examiner", examinerCriterion.id, { minScore: 0, maxScore: 40, description: "Penguji" });
    const supervisorRubric = await defenceRubricService.createRubric("supervisor", supervisorCriterion.id, { minScore: 0, maxScore: 40, description: "Pembimbing" });
    expect(await prisma.thesisDefenceExaminerAssessmentRubric.findUnique({ where: { id: examinerRubric.id } })).not.toBeNull();
    expect(await prisma.thesisDefenceSupervisorAssessmentRubric.findUnique({ where: { id: supervisorRubric.id } })).not.toBeNull();
  });

  it("Alternative Flow A - rejects an unsupported assessment role without persisting criteria", async () => {
    const before = await prisma.thesisDefenceExaminerAssessmentCriteria.count({ where: { thesisCpmkId: rubricCpmk.id } });
    await expect(defenceRubricService.createCriteria({ role: "invalid", thesisCpmkId: rubricCpmk.id, name: "Invalid", maxScore: 10 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.thesisDefenceExaminerAssessmentCriteria.count({ where: { thesisCpmkId: rubricCpmk.id } })).toBe(before);
  });
});
