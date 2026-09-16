import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../src/config/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, "..", "prisma", "seed-data", "snapshot");

async function exportFullDatabaseSnapshot() {
  console.log("=== EXPORTING FULL DATABASE SNAPSHOT FOR SEEDING ===");
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const tables = [
    { name: "AcademicYear", fetch: () => prisma.academicYear.findMany() },
    { name: "ThesisTopic", fetch: () => prisma.thesisTopic.findMany() },
    { name: "ThesisStatus", fetch: () => prisma.thesisStatus.findMany() },
    { name: "UserRole", fetch: () => prisma.userRole.findMany() },
    { name: "ScienceGroup", fetch: () => prisma.scienceGroup.findMany() },
    { name: "Role", fetch: () => prisma.role.findMany() },
    { name: "User", fetch: () => prisma.user.findMany() },
    { name: "Lecturer", fetch: () => prisma.lecturer.findMany() },
    { name: "Student", fetch: () => prisma.student.findMany() },
    { name: "UserHasRole", fetch: () => prisma.userHasRole.findMany() },
    { name: "Thesis", fetch: () => prisma.thesis.findMany() },
    { name: "ThesisSupervisors", fetch: () => prisma.thesisSupervisors.findMany() },
    { name: "ThesisAdvisorRequest", fetch: () => prisma.thesisAdvisorRequest.findMany() },
    { name: "ThesisMilestoneTemplate", fetch: () => prisma.thesisMilestoneTemplate.findMany() },
    { name: "ThesisMilestone", fetch: () => prisma.thesisMilestone.findMany() },
    { name: "ThesisGuidance", fetch: () => prisma.thesisGuidance.findMany() },
    { name: "ThesisProposalVersion", fetch: () => prisma.thesisProposalVersion.findMany() },
    { name: "ResearchMethodScore", fetch: () => prisma.researchMethodScore.findMany() },
    { name: "Document", fetch: () => prisma.document.findMany() },
    { name: "StudentAcademicYearSnapshot", fetch: () => prisma.studentAcademicYearSnapshot.findMany() },
    { name: "MetopenClass", fetch: () => prisma.metopenClass.findMany() },
    { name: "MetopenCpmk", fetch: () => prisma.metopenCpmk.findMany() },
    { name: "MetopenAssessmentCriteria", fetch: () => prisma.metopenAssessmentCriteria.findMany() },
  ];

  const summary = {};

  for (const table of tables) {
    try {
      const records = await table.fetch();
      const filePath = path.join(SNAPSHOT_DIR, `${table.name}.json`);
      await fs.writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
      summary[table.name] = records.length;
      console.log(`✅ Exported ${table.name}: ${records.length} records`);
    } catch (err) {
      console.warn(`⚠️ Skipped table ${table.name}: ${err.message}`);
    }
  }

  const manifestPath = path.join(SNAPSHOT_DIR, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        tables: summary,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("=== FULL SNAPSHOT EXPORT COMPLETED SUCCESSFULLY ===");
  await prisma.$disconnect();
}

exportFullDatabaseSnapshot().catch((err) => {
  console.error("Export error:", err);
  process.exit(1);
});
