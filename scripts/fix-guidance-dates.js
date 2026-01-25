/**
 * Script untuk memperbaiki data bimbingan yang tidak konsisten
 * - Fix approvedDate yang salah (seharusnya sama dengan requestedDate jika tidak diubah dosen)
 * - Bersihkan data yang tidak konsisten
 * 
 * Jalankan dengan: node scripts/fix-guidance-dates.js
 */

import generated from "../src/generated/prisma/index.js";
const { PrismaClient } = generated;

const prisma = new PrismaClient();

async function fixGuidanceDates() {
  console.log('🔧 Fixing guidance dates...\n');

  // 1. Get all guidances with status accepted/summary_pending/completed
  const guidances = await prisma.thesisGuidance.findMany({
    where: {
      status: { in: ['accepted', 'summary_pending', 'completed'] },
    },
    select: {
      id: true,
      status: true,
      requestedDate: true,
      approvedDate: true,
      completedAt: true,
      sessionSummary: true,
      thesis: {
        select: {
          student: {
            select: {
              user: { select: { fullName: true } }
            }
          }
        }
      }
    }
  });

  console.log(`📊 Found ${guidances.length} guidances to check\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const g of guidances) {
    const studentName = g.thesis?.student?.user?.fullName || 'Unknown';
    const requestedTime = g.requestedDate?.getTime();
    const approvedTime = g.approvedDate?.getTime();

    // Check if approvedDate is significantly different from requestedDate
    // (more than 1 hour difference indicates it was set to current time instead of scheduled time)
    const timeDiff = approvedTime && requestedTime ? Math.abs(approvedTime - requestedTime) : 0;
    const oneHour = 60 * 60 * 1000;

    if (timeDiff > oneHour && g.requestedDate) {
      console.log(`🔄 Fixing: ${studentName}`);
      console.log(`   Status: ${g.status}`);
      console.log(`   Requested: ${g.requestedDate?.toISOString()}`);
      console.log(`   Approved (wrong): ${g.approvedDate?.toISOString()}`);
      console.log(`   → Setting approvedDate to requestedDate`);

      await prisma.thesisGuidance.update({
        where: { id: g.id },
        data: {
          approvedDate: g.requestedDate,
        }
      });

      fixedCount++;
      console.log('   ✅ Fixed!\n');
    } else {
      skippedCount++;
    }
  }

  console.log('-----------------------------------');
  console.log(`✅ Fixed: ${fixedCount} guidances`);
  console.log(`⏭️  Skipped: ${skippedCount} guidances (already correct)`);
  console.log('-----------------------------------\n');

  // 2. Fix status inconsistencies
  console.log('🔧 Checking status inconsistencies...\n');

  // Guidances with summary but still "accepted" status
  const needsStatusFix = await prisma.thesisGuidance.findMany({
    where: {
      status: 'accepted',
      sessionSummary: { not: null },
      summarySubmittedAt: { not: null },
    },
    select: { id: true }
  });

  if (needsStatusFix.length > 0) {
    console.log(`📝 Found ${needsStatusFix.length} guidances with summary but wrong status`);
    
    await prisma.thesisGuidance.updateMany({
      where: {
        id: { in: needsStatusFix.map(g => g.id) }
      },
      data: {
        status: 'summary_pending'
      }
    });
    
    console.log(`✅ Updated ${needsStatusFix.length} to 'summary_pending' status\n`);
  } else {
    console.log('✅ No status inconsistencies found\n');
  }

  // 3. Summary statistics
  console.log('📊 Current guidance statistics:');
  
  const stats = await prisma.thesisGuidance.groupBy({
    by: ['status'],
    _count: { id: true }
  });

  for (const stat of stats) {
    console.log(`   ${stat.status}: ${stat._count.id}`);
  }

  console.log('\n✨ Done!');
}

async function main() {
  try {
    await fixGuidanceDates();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
