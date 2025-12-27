import prisma from './src/config/prisma.js';

const r = await prisma.thesisGuidance.findMany({ 
  take: 3, 
  orderBy: { createdAt: 'desc' }, 
  select: {
    id: true, 
    milestoneId: true, 
    milestoneIds: true, 
    status: true, 
    studentNotes: true
  } 
});
console.log(JSON.stringify(r, null, 2));
await prisma.$disconnect();
