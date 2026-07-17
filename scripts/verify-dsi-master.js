/** Read-only acceptance check for the canonical DSI master data. */
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();
const groups = [
  "Sistem Enterprise",
  "Rekayasa Data dan Business Intelligence",
  "Tata Kelola dan Infrastruktur Teknologi Informasi",
  "Pengembangan Sistem",
];
const topics = {
  "Sistem Pendukung Keputusan (SPK)": "Rekayasa Data dan Business Intelligence",
  "Business Intelligence (BI)": "Rekayasa Data dan Business Intelligence",
  "Machine Learning": "Rekayasa Data dan Business Intelligence",
  "Enterprise System": "Sistem Enterprise",
  "Pengembangan Sistem (Enterprise Application)": "Pengembangan Sistem",
};
const lecturers = {
  "198904212019032024": "Sistem Enterprise",
  "199504302022032013": "Rekayasa Data dan Business Intelligence",
  "199104172022031007": "Rekayasa Data dan Business Intelligence",
  "199108122019032018": "Pengembangan Sistem",
  "198001102008121002": "Rekayasa Data dan Business Intelligence",
  "199309292019032022": "Rekayasa Data dan Business Intelligence",
  "199601222024062002": null,
  "197503232012121001": "Rekayasa Data dan Business Intelligence",
  "198307272008121003": "Sistem Enterprise",
  "198201182008121002": "Sistem Enterprise",
  "198904152019031009": "Sistem Enterprise",
  "199206042024062001": "Pengembangan Sistem",
  "199308152022032017": "Tata Kelola dan Infrastruktur Teknologi Informasi",
  "198410062012121001": "Sistem Enterprise",
  "196404091995121001": "Rekayasa Data dan Business Intelligence",
  "199011032019032008": "Tata Kelola dan Infrastruktur Teknologi Informasi",
  "199208202019031005": "Tata Kelola dan Infrastruktur Teknologi Informasi",
};

const checks = [];
const check = (id, pass, detail) => checks.push({ id, pass: Boolean(pass), detail });

async function main() {
  const actualGroups = await prisma.scienceGroup.findMany({ orderBy: { name: "asc" } });
  check("groups:exact", actualGroups.length === groups.length && groups.every((name) => actualGroups.some((row) => row.name === name)), `${actualGroups.map((row) => row.name).join(" | ")}`);
  for (const [name, groupName] of Object.entries(topics)) {
    const rows = await prisma.thesisTopic.findMany({ where: { name }, include: { scienceGroup: true } });
    check(`topic:${name}`, rows.length === 1 && rows[0].scienceGroup?.name === groupName, `${rows.length} row; KBK=${rows[0]?.scienceGroup?.name ?? "null"}`);
  }
  const legacyNames = ["Sistem Informasi Manajemen", "Data Mining & Knowledge Discovery", "Data Warehouse & Business Intelligence"];
  const legacyCount = await prisma.thesisTopic.count({ where: { name: { in: legacyNames } } });
  check("topics:legacy-merged", legacyCount === 0, `legacy rows=${legacyCount}`);

  for (const [nip, groupName] of Object.entries(lecturers)) {
    const user = await prisma.user.findUnique({ where: { identityNumber: nip }, include: { lecturer: { include: { scienceGroup: true } } } });
    check(`lecturer:${nip}`, Boolean(user?.lecturer) && (user.lecturer.scienceGroup?.name ?? null) === groupName, `${user?.fullName ?? "missing"}; KBK=${user?.lecturer?.scienceGroup?.name ?? "null"}`);
  }
  const dummy = await prisma.user.findMany({ where: { email: { endsWith: "@dummy.ac.id" }, identityType: "NIP" }, select: { fullName: true } });
  check("dummy:prefixed", dummy.every((row) => row.fullName.startsWith("[DUMMY]")), `${dummy.length} dummy lecturer names checked`);
  check("groups:no-legacy", (await prisma.scienceGroup.count({ where: { name: { notIn: groups } } })) === 0, "no legacy KBK remains");

  const failed = checks.filter((row) => !row.pass);
  console.log(JSON.stringify({ ready: failed.length === 0, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
