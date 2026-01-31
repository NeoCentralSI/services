/**
 * Seed Script - Thesis Topics
 * 
 * Usage: node scripts/seed-thesis-topics.js
 * 
 * This script populates the thesis_topics table with predefined topics.
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

// Thesis Topics to seed
const THESIS_TOPICS = [
  { name: "Sistem Pendukung Keputusan (SPK)" },
  { name: "Business Intelligence (BI)" },
  { name: "Pengembangan Sistem (Enterprise Application)" },
  { name: "Machine Learning" },
  { name: "Enterprise System" },
];

async function seedThesisTopics() {
  console.log("\n" + "=".repeat(60));
  console.log("📋 Seeding Thesis Topics...");
  console.log("=".repeat(60));

  let created = 0;
  let skipped = 0;

  for (const topic of THESIS_TOPICS) {
    // Check if topic already exists
    const existing = await prisma.thesisTopic.findFirst({
      where: { name: topic.name },
    });

    if (existing) {
      console.log(`  ⏭️  Topic "${topic.name}" already exists, skipping...`);
      skipped++;
      continue;
    }

    // Create new topic
    await prisma.thesisTopic.create({
      data: { name: topic.name },
    });

    console.log(`  ✅ Created topic: "${topic.name}"`);
    created++;
  }

  console.log("\n" + "-".repeat(60));
  console.log(`📊 Summary: ${created} created, ${skipped} skipped`);
  console.log("=".repeat(60));
}

async function main() {
  console.log("\n🚀 Starting Thesis Topics Seed Script...\n");

  try {
    await seedThesisTopics();

    // List all topics
    const topics = await prisma.thesisTopic.findMany({
      orderBy: { name: "asc" },
    });

    console.log("\n📝 Current Thesis Topics in Database:");
    topics.forEach((topic, idx) => {
      console.log(`  ${idx + 1}. ${topic.name} (ID: ${topic.id})`);
    });

    console.log("\n✅ Thesis Topics seed completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Error seeding thesis topics:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
