import prisma from '../src/config/prisma.js';

// Create approved change request for test_nothesis user (simulating thesis was deleted)
const user = await prisma.user.findFirst({ where: { identityNumber: '2211522103' } });
if (user) {
  const existing = await prisma.thesisChangeRequest.findFirst({ where: { studentId: user.id } });
  if (existing) {
    console.log('Change request already exists');
  } else {
    await prisma.thesisChangeRequest.create({
      data: {
        studentId: user.id,
        thesisId: null, // Thesis was deleted
        requestType: 'both',
        reason: 'Simulasi untuk testing - thesis sudah dihapus',
        status: 'approved',
        reviewedAt: new Date(),
      }
    });
    console.log('Created approved change request for Test Tanpa Thesis');
  }
} else {
  console.log('User not found');
}

await prisma.$disconnect();
