import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { unlink } from "fs/promises";

import path from "path";

import prisma from "../../../config/prisma.js";

import * as coreService from "../../../services/yudisium/core.service.js";

import * as studentService from "../../../services/yudisium/student.service.js";

import * as participantService from "../../../services/yudisium/participant.service.js";



const fakeFile = (originalname) => ({

  originalname,

  mimetype: "application/pdf",

  size: 2048,

  buffer: Buffer.from(`%PDF-1.4 fake pdf for ${originalname}`),

});



describe("Integration: Yudisium Flow", () => {

  const ts = Date.now();

  let studentUser;

  let adminUser;

  let gkmUser;

  let coordinatorUser;

  let student;

  let thesis;

  let defence;

  let room;

  let exitSurveyForm;

  let yudisium;

  let requirements = [];

  let requirementItems = [];

  let cpls = [];



  const createdCplIds = [];

  const uploadedPaths = [];

  let participantId = null;



  beforeAll(async () => {

    const mRole = await prisma.userRole.findFirst({ where: { name: "Mahasiswa" } });

    const aRole = await prisma.userRole.findFirst({ where: { name: "Admin" } });

    const gRole = await prisma.userRole.findFirst({ where: { name: "GKM" } });

    const cRole = await prisma.userRole.findFirst({ where: { name: "Koordinator Yudisium" } });



    studentUser = await prisma.user.create({

      data: {

        fullName: `Flow Student ${ts}`,

        identityNumber: `NIM-FLOW-${ts}`,

        identityType: "NIM",

        userHasRoles: {

          create: {

            roleId: mRole.id,

            status: "active",

          },

        },

      },

    });



    adminUser = await prisma.user.create({

      data: {

        fullName: `Flow Admin ${ts}`,

        identityNumber: `NIP-ADM-${ts}`,

        identityType: "NIP",

        userHasRoles: {

          create: {

            roleId: aRole.id,

            status: "active",

          },

        },

      },

    });



    gkmUser = await prisma.user.create({

      data: {

        fullName: `Flow GKM ${ts}`,

        identityNumber: `NIP-GKM-${ts}`,

        identityType: "NIP",

        userHasRoles: {

          create: {

            roleId: gRole.id,

            status: "active",

          },

        },

      },

    });



    await prisma.lecturer.create({

      data: {

        id: gkmUser.id,

      },

    });



    coordinatorUser = await prisma.user.create({

      data: {

        fullName: `Flow Coordinator ${ts}`,

        identityNumber: `NIP-CORD-${ts}`,

        identityType: "NIP",

        userHasRoles: {

          create: {

            roleId: cRole.id,

            status: "active",

          },

        },

      },

    });



    await prisma.lecturer.create({

      data: {

        id: coordinatorUser.id,

      },

    });



    student = await prisma.student.create({

      data: {

        id: studentUser.id,

        skscompleted: 146,

        mandatoryCoursesCompleted: true,

        mkwuCompleted: true,

        internshipCompleted: true,

        kknCompleted: true,

      },

    });



    const thesisStatus = await prisma.thesisStatus.findFirst({

      where: { name: { contains: "Bimbingan" } },

    });

    if (!thesisStatus) throw new Error("Seed thesis status Bimbingan tidak ditemukan");



    thesis = await prisma.thesis.create({

      data: {

        studentId: student.id,

        title: `Tugas Akhir Yudisium Flow ${ts}`,

        thesisStatusId: thesisStatus.id,

      },

    });

    defence = await prisma.thesisDefence.create({

      data: {

        thesisId: thesis.id,

        status: "passed",

        date: new Date(),

      },

    });



    room = await prisma.room.create({

      data: { name: `Ruang Yudisium Flow ${ts}`, location: "Integration Test" },

    });

    exitSurveyForm = await prisma.exitSurveyForm.create({

      data: {

        title: `Exit Survey Flow ${ts}`,

        description: "Exit survey integration flow",

        isActive: true,

      },

    });



    yudisium = await prisma.yudisium.create({

      data: {

        name: `Yudisium Flow ${ts}`,

        roomId: room.id,

        exitSurveyFormId: exitSurveyForm.id,

        registrationOpenDate: new Date(Date.now() - 1000),

        registrationCloseDate: new Date(Date.now() + 24 * 60 * 60 * 1000),

        eventDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),

        notes: "Integration yudisium flow",

      },

    });



    requirements = await prisma.$transaction([

      prisma.yudisiumRequirement.create({

        data: {

          name: `Laporan Tugas Akhir Final ${ts}`,

          description: "Dokumen laporan akhir",

          isActive: true,

        },

      }),

      prisma.yudisiumRequirement.create({

        data: {

          name: `Bukti Bebas Pustaka ${ts}`,

          description: "Dokumen bebas pustaka",

          isActive: true,

        },

      }),

    ]);



    requirementItems = await Promise.all(

      requirements.map((requirement, index) =>

        prisma.yudisiumRequirementItem.create({

          data: {

            yudisiumId: yudisium.id,

            yudisiumRequirementId: requirement.id,

            order: index + 1,

          },

        })

      )

    );



    const initialParticipant = await prisma.yudisiumParticipant.create({

      data: {

        yudisiumId: yudisium.id,

        thesisId: thesis.id,

        status: "registered",

        registeredAt: null,

        exitSurveySubmittedAt: new Date(),

        exitSurveyFormId: exitSurveyForm.id,

      },

    });

    participantId = initialParticipant.id;



    cpls = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });

    if (cpls.length === 0) {

      cpls = await prisma.$transaction([

        prisma.cpl.create({

          data: {

            code: `CPL-YUD-1-${ts}`,

            description: "CPL integration 1",

            minimalScore: 60,

            isActive: true,

          },

        }),

        prisma.cpl.create({

          data: {

            code: `CPL-YUD-2-${ts}`,

            description: "CPL integration 2",

            minimalScore: 60,

            isActive: true,

          },

        }),

      ]);

      createdCplIds.push(...cpls.map((item) => item.id));

    }



    await prisma.studentCplScore.createMany({

      data: cpls.map((cpl, index) => ({

        studentId: student.id,

        cplId: cpl.id,

        score: Math.max(cpl.minimalScore, 75 + index),

        status: "calculated",

      })),

    });

  });



  afterAll(async () => {

    try {

      for (const filePath of uploadedPaths) {

        await unlink(path.join(process.cwd(), filePath)).catch(() => {});

      }



      if (participantId) {

        await prisma.yudisiumParticipantRequirement.deleteMany({

          where: { yudisiumParticipantId: participantId },

        }).catch(() => {});

        await prisma.yudisiumParticipant.delete({ where: { id: participantId } }).catch(() => {});

      }



      await prisma.studentCplScore.deleteMany({ where: { studentId: student?.id } }).catch(() => {});

      await prisma.cpl.deleteMany({ where: { id: { in: createdCplIds } } }).catch(() => {});

      if (yudisium?.id) {

        await prisma.yudisiumRequirementItem.deleteMany({ where: { yudisiumId: yudisium.id } }).catch(() => {});

        await prisma.yudisium.delete({ where: { id: yudisium.id } }).catch(() => {});

      }

      if (requirements?.length) {

        await prisma.yudisiumRequirement.deleteMany({

          where: { id: { in: requirements.map((item) => item.id) } },

        }).catch(() => {});

      }

      if (exitSurveyForm?.id) await prisma.exitSurveyForm.delete({ where: { id: exitSurveyForm.id } }).catch(() => {});

      if (room?.id) await prisma.room.delete({ where: { id: room.id } }).catch(() => {});

      if (defence?.id) await prisma.thesisDefence.delete({ where: { id: defence.id } }).catch(() => {});

      if (thesis?.id) await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});

      if (gkmUser?.id) await prisma.lecturer.delete({ where: { id: gkmUser.id } }).catch(() => {});

      if (coordinatorUser?.id) await prisma.lecturer.delete({ where: { id: coordinatorUser.id } }).catch(() => {});

      if (student?.id) await prisma.student.delete({ where: { id: student.id } }).catch(() => {});

      const userIds = [studentUser?.id, adminUser?.id, gkmUser?.id, coordinatorUser?.id].filter(Boolean);

      if (userIds.length) {

        await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});

      }

    } catch (err) {

      console.error("Yudisium flow cleanup error:", err);

    }

  });



  it("allows a student to upload all yudisium requirement documents", async () => {

    for (const requirement of requirements) {

      const result = await studentService.uploadOwnDocument(

        student.id,

        fakeFile(`${requirement.name}.pdf`),

        requirement.id

      );

      expect(result.status).toBe("submitted");

      uploadedPaths.push(result.filePath);

    }



    const participant = await prisma.yudisiumParticipant.findFirst({

      where: { yudisiumId: yudisium.id, thesisId: thesis.id },

    });



    expect(participant).toBeTruthy();

    expect(participant.status).toBe("registered");

    expect(participant.registeredAt).toBeTruthy();

    participantId = participant.id;

  });



  it("updates requirementVerifiedAt after admin approves all documents", async () => {

    for (const item of requirementItems) {

      await participantService.verifyParticipantDocument(participantId, item.id, {

        action: "approve",

        userId: adminUser.id,

      });

    }



    const participant = await prisma.yudisiumParticipant.findUnique({

      where: { id: participantId },

    });



    expect(participant.requirementVerifiedAt).toBeTruthy();

  });



  it("transitions participant to eligible after GKM validates every active CPL score", async () => {

    for (const cpl of cpls) {

      await participantService.validateCplScore(participantId, cpl.id, gkmUser.id);

    }



    const participant = await prisma.yudisiumParticipant.findUnique({

      where: { id: participantId },

    });

    const scores = await prisma.studentCplScore.findMany({

      where: { studentId: student.id, cplId: { in: cpls.map((item) => item.id) } },

    });



    expect(participant.status).toBe("eligible");

    expect(participant.cplValidatedAt).toBeTruthy();

    expect(scores.every((score) => score.status === "validated")).toBe(true);

    expect(scores.every((score) => score.validatedAt)).toBe(true);

  });



  it("finalizes yudisium registration into appointed participants after registration closes", async () => {

    await prisma.yudisium.update({

      where: { id: yudisium.id },

      data: {

        registrationCloseDate: new Date(Date.now() - 1000),

        eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),

      },

    });



    const result = await participantService.finalizeParticipants(

      yudisium.id,

      coordinatorUser.id

    );



    const participant = await prisma.yudisiumParticipant.findUnique({

      where: { id: participantId },

    });

    const updatedYudisium = await prisma.yudisium.findUnique({

      where: { id: yudisium.id },

    });



    expect(result.appointed).toBe(1);

    expect(result.rejected).toBe(0);

    expect(participant.status).toBe("appointed");

    expect(updatedYudisium.appointedAt).toBeTruthy();

  });



  it("finalizes appointed participants, CPL scores, and student status when SK is uploaded", async () => {

    const result = await coreService.updateYudisium(yudisium.id, {

      userId: coordinatorUser.id,

      decreeFile: fakeFile("sk-yudisium-final.pdf"),

    });



    if (result.decreeFilePath) uploadedPaths.push(result.decreeFilePath);



    const [participant, scores, updatedStudent, updatedYudisium] = await Promise.all([

      prisma.yudisiumParticipant.findUnique({ where: { id: participantId } }),

      prisma.studentCplScore.findMany({

        where: { studentId: student.id, cplId: { in: cpls.map((item) => item.id) } },

      }),

      prisma.student.findUnique({ where: { id: student.id } }),

      prisma.yudisium.findUnique({ where: { id: yudisium.id } }),

    ]);



    expect(participant.status).toBe("finalized");

    expect(scores).toHaveLength(cpls.length);

    expect(scores.every((score) => score.status === "finalized")).toBe(true);

    expect(scores.every((score) => score.finalizedAt)).toBe(true);

    expect(updatedStudent.status).toBe("lulus");

    expect(updatedYudisium.decreeFilePath).toBeTruthy();

    expect(updatedYudisium.decreeUploadedBy).toBe(coordinatorUser.id);

    expect(updatedYudisium.decreeUploadedAt).toBeTruthy();

  });

});
