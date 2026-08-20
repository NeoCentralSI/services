import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../src/config/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, "..", "prisma", "seed-data", "snapshot");

async function readTableData(tableName) {
  const filePath = path.join(SNAPSHOT_DIR, `${tableName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function parseDates(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      out[k] = new Date(v);
    } else if (v && typeof v === "object") {
      out[k] = parseDates(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function seedFromSnapshot() {
  console.log("=== SEEDING DATABASE FROM COMPLETE SNAPSHOT ===");

  const manifestData = await readTableData("manifest");
  if (manifestData) {
    console.log(`Snapshot exported at: ${manifestData.exportedAt}`);
  }

  const order = [
    { name: "AcademicYear", delegate: prisma.academicYear, pk: "id" },
    { name: "ThesisTopic", delegate: prisma.thesisTopic, pk: "id" },
    { name: "ThesisStatus", delegate: prisma.thesisStatus, pk: "id" },
    { name: "UserRole", delegate: prisma.userRole, pk: "id" },
    { name: "ScienceGroup", delegate: prisma.scienceGroup, pk: "id" },
    { name: "Role", delegate: prisma.role, pk: "id" },
    { name: "User", delegate: prisma.user, pk: "id" },
    { name: "Lecturer", delegate: prisma.lecturer, pk: "id" },
    { name: "Student", delegate: prisma.student, pk: "id" },
    { name: "UserHasRole", delegate: prisma.userHasRole, pk: "id" },
    { name: "Document", delegate: prisma.document, pk: "id" },
    { name: "Thesis", delegate: prisma.thesis, pk: "id" },
    { name: "ThesisSupervisors", delegate: prisma.thesisSupervisors, pk: "id" },
    { name: "ThesisAdvisorRequest", delegate: prisma.thesisAdvisorRequest, pk: "id" },
    { name: "ThesisMilestoneTemplate", delegate: prisma.thesisMilestoneTemplate, pk: "id" },
    { name: "ThesisMilestone", delegate: prisma.thesisMilestone, pk: "id" },
    { name: "ThesisGuidance", delegate: prisma.thesisGuidance, pk: "id" },
    { name: "ThesisProposalVersion", delegate: prisma.thesisProposalVersion, pk: "id" },
    { name: "ResearchMethodScore", delegate: prisma.researchMethodScore, pk: "id" },
    { name: "StudentAcademicYearSnapshot", delegate: prisma.studentAcademicYearSnapshot, pk: "id" },
    { name: "MetopenClass", delegate: prisma.metopenClass, pk: "id" },
    { name: "MetopenCpmk", delegate: prisma.metopenCpmk, pk: "id" },
    { name: "MetopenAssessmentCriteria", delegate: prisma.metopenAssessmentCriteria, pk: "id" },
  ];

  for (const { name, delegate, pk } of order) {
    const items = await readTableData(name);
    if (!items || items.length === 0) continue;

    console.log(`Importing ${items.length} records for ${name}...`);
    let count = 0;

    for (const item of items) {
      const data = parseDates(item);
      try {
        if (pk && data[pk]) {
          await delegate.upsert({
            where: { [pk]: data[pk] },
            create: data,
            update: data,
          });
        } else {
          await delegate.create({ data });
        }
        count++;
      } catch (err) {
        // Continue on individual record conflict
      }
    }
    console.log(`✅ ${name}: ${count}/${items.length} records synced.`);
  }

  console.log("=== SNAPSHOT SEEDING COMPLETED SUCCESSFULLY ===");
  await prisma.$disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedFromSnapshot().catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  });
}
