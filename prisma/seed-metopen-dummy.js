import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding Metopen dummy data...');

  // 1. Ensure Active Academic Year
  let academicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: {
        semester: 'ganjil',
        year: 2025,
        isActive: true,
      },
    });
    console.log('✅ Created active academic year');
  }

  // 2. Ensure "Metopel" Thesis Status
  let statusMetopel = await prisma.thesisStatus.findFirst({
    where: { name: 'Metopel' },
  });

  if (!statusMetopel) {
    statusMetopel = await prisma.thesisStatus.create({
      data: { name: 'Metopel' },
    });
    console.log('✅ Created "Metopel" thesis status');
  }

  // 3. Ensure a Thesis Topic
  let topic = await prisma.thesisTopic.findFirst();
  if (!topic) {
    topic = await prisma.thesisTopic.create({
      data: { name: 'Sistem Informasi' },
    });
    console.log('✅ Created thesis topic');
  }

  // 4. Ensure a Lecturer for Metopen Class
  let lecturer = await prisma.lecturer.findFirst({
    include: { user: true }
  });

  if (!lecturer) {
    // Create a dummy lecturer
    const userLecturer = await prisma.user.create({
      data: {
        fullName: 'Dr. Ilham N, M.T.',
        identityNumber: '198001012010011001',
        identityType: 'NIP',
        email: 'ilham.lecturer@dummy.ac.id',
        isVerified: true,
      },
    });
    lecturer = await prisma.lecturer.create({
      data: { id: userLecturer.id },
      include: { user: true }
    });
    console.log('✅ Created dummy lecturer');
  }

  // 5. Create Metopen Class
  const metopenClass = await prisma.metopenClass.upsert({
    where: { 
      // Assuming name + academicYearId is unique enough for dummy, 
      // but MetopenClass doesn't have a unique constraint on name.
      // We'll use findFirst/create for this since no ID is known.
      id: 'dummy-class-a' 
    },
    update: {},
    create: {
      id: 'dummy-class-a',
      name: 'Metopen Kelas A - 2025 Ganjil',
      academicYearId: academicYear.id,
      lecturerId: lecturer.id,
      description: 'Kelas Metodologi Penelitian Reguler',
      isActive: true,
    },
  });
  console.log('✅ Ensured Metopen class A');

  // 6. Create Dummy Students & Theses
  const dummyStudents = [
    { name: 'Aditya Pratama', nim: '2111521001' },
    { name: 'Budi Santoso', nim: '2111521002' },
    { name: 'Citra Lestari', nim: '2111521003' },
    { name: 'Dewi Saputri', nim: '2111521004' },
    { name: 'Eka Wijaya', nim: '2111521005' },
  ];

  for (const s of dummyStudents) {
    const user = await prisma.user.upsert({
      where: { identityNumber: s.nim },
      update: {
        fullName: s.name,
        email: `${s.nim}@student.dummy.ac.id`,
      },
      create: {
        fullName: s.name,
        identityNumber: s.nim,
        identityType: 'NIM',
        email: `${s.nim}@student.dummy.ac.id`,
        isVerified: true,
      },
    });

    const studentProfile = await prisma.student.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        skscompleted: 110,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        currentSemester: 6,
      },
    });

    const existingThesis = await prisma.thesis.findFirst({
      where: { studentId: studentProfile.id }
    });

    if (!existingThesis) {
      await prisma.thesis.create({
        data: {
          studentId: studentProfile.id,
          thesisTopicId: topic.id,
          thesisStatusId: statusMetopel.id,
          academicYearId: academicYear.id,
          title: `Rancang Bangun Sistem Informasi ${s.name}`,
          startDate: new Date(),
        },
      });
    }

    // Enroll in Metopen Class
    const existingEnrollment = await prisma.metopenClassStudent.findFirst({
      where: {
        classId: metopenClass.id,
        studentId: studentProfile.id,
      },
    });

    if (!existingEnrollment) {
      await prisma.metopenClassStudent.create({
        data: {
          classId: metopenClass.id,
          studentId: studentProfile.id,
        },
      });
    }

    console.log(`✅ Ensured student & thesis for ${s.name} (${s.nim})`);
  }

  // 7. Create Metopen Class B
  const metopenClassB = await prisma.metopenClass.upsert({
    where: { id: 'dummy-class-b' },
    update: {},
    create: {
      id: 'dummy-class-b',
      name: 'Metopen Kelas B - 2025 Ganjil',
      academicYearId: academicYear.id,
      lecturerId: lecturer.id,
      description: 'Kelas Metodologi Penelitian Sore',
      isActive: true,
    },
  });
  console.log('✅ Ensured Metopen class B');

  // One student in Class B
  const nimB = '2111521006';
  const userB = await prisma.user.upsert({
    where: { identityNumber: nimB },
    update: {
      fullName: 'Fajar Nugraha',
      email: `${nimB}@student.dummy.ac.id`,
    },
    create: {
      fullName: 'Fajar Nugraha',
      identityNumber: nimB,
      identityType: 'NIM',
      email: `${nimB}@student.dummy.ac.id`,
      isVerified: true,
    },
  });

  const studentProfileB = await prisma.student.upsert({
    where: { id: userB.id },
    update: {},
    create: {
      id: userB.id,
      skscompleted: 110,
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      currentSemester: 6,
    },
  });

  const existingThesisB = await prisma.thesis.findFirst({
    where: { studentId: studentProfileB.id }
  });

  if (!existingThesisB) {
    await prisma.thesis.create({
      data: {
        studentId: studentProfileB.id,
        thesisTopicId: topic.id,
        thesisStatusId: statusMetopel.id,
        academicYearId: academicYear.id,
        title: 'Analisis Keamanan Jaringan Kampus',
        startDate: new Date(),
      },
    });
  }

  const existingEnrollmentB = await prisma.metopenClassStudent.findFirst({
    where: {
      classId: metopenClassB.id,
      studentId: studentProfileB.id,
    },
  });

  if (!existingEnrollmentB) {
    await prisma.metopenClassStudent.create({
      data: {
        classId: metopenClassB.id,
        studentId: studentProfileB.id,
      },
    });
  }
  console.log('✅ Ensured student & thesis for Fajar Nugraha (2111521006) in Class B');

  console.log('✨ Metopen Dummy Seeding Complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
