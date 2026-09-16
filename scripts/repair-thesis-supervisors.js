import "dotenv/config";
import prisma from "../src/config/prisma.js";

const APPLY = process.argv.includes("--apply");

const RAW_ASSIGNMENTS = `
MUHAMMAD IKHLAS
Aina Hubby Aziira, M.Eng.
RAHMA AURELIA ZAMI
Ullya Mega Wahyuni, M.Kom.
MHD. ULIL ABSHAR
Husnil Kamil, M.T.
ANNISA NURUL HAKIM
Afriyanti Dwi Kartika, M.T.
MIFTAHUL KHAIRA
Dwi Welly Sukma Nirad, M.T.
MEYDIVA INTAYEZA
Hasdi Putra, M.T.
NURUL AFANI
Ricky Akbar, M.Kom.
GHINA ANFASHA NURHADI
Afriyanti Dwi Kartika, M.T.
UMAR ABDULLAH AZZAM
Jefril Rahmadoni, M.Kom.
FRIZQYA DELA PRATIWI
Ullya Mega Wahyuni, M.Kom.
MUHAMMAD FARHAN
Hasdi Putra, M.T.
RADIATUL MUTMAINNAH
Febby Apri Wenando, M.Eng.
RAMADHANI SAFITRI
Rahmatika Pratama Santi, M.T.
GHIFARI RIZKI RAMADHAN
Jefril Rahmadoni, M.Kom.
BENNI PUTRA CHANIAGO
Dwi Welly Sukma Nirad, M.T.
OKTAVIANI ANDRIANTI
Ricky Akbar, M.Kom.
ZELFITRIO RODESKI
Ullya Mega Wahyuni, M.Kom.
ANGELI PUTRI RAMADHANI
Dwi Welly Sukma Nirad, M.T.
TALITHA ZULFA AMIRAH
Ricky Akbar, M.Kom.
AQIMA ADALAHITA
Rahmatika Pratama Santi, M.T.
ARI RAIHAN DAFA
Ullya Mega Wahyuni, M.Kom.
MUHAMMAD RAIHAN ALGHIFARI
Hasdi Putra, M.T.
WULANDARI YULIANIS
Hasdi Putra, M.T.
REGINA NATHAMIYA PRAMIJA
Ullya Mega Wahyuni, M.Kom.
INTAN SALMA DENAIDY
Hasdi Putra, M.T.
CINDY ARWINDA PUTRI
Hasdi Putra, M.T.
ATHAYA CLARA DIVA
Afriyanti Dwi Kartika, M.T.
TEGAR ANANDA
Ullya Mega Wahyuni, M.Kom.
SYAUQI NABIIH MARWA
Ricky Akbar, M.Kom.
VATYA ARSHA MAHMUDI
Dwi Welly Sukma Nirad, M.T.
NIKEN KHALILAH HAMUTI
Dwi Welly Sukma Nirad, M.T.
MEUTIA DEWI PUTRI KARTIKA
Hafizah Hanim, M.Kom.
MUHAMMAD FAIZ AL-DZIKRO
Ullya Mega Wahyuni, M.Kom.
KHALIED NAULY MATURINO
Husnil Kamil, M.T.
MUHAMMAD ZAKI ANDAFI
Ullya Mega Wahyuni, M.Kom.
NABILA R. DZAKIRA
Ullya Mega Wahyuni, M.Kom.
JAHRO SUROYA TAURIN
Haris Suryamen, M.Sc.
ANNISA GITA SUBHI
Ricky Akbar, M.Kom.
DIO APRI DANDI
Aina Hubby Aziira, M.Eng.
NAJLA HUMAIRA DESNI
Rahmatika Pratama Santi, M.T.
NADIA DEARI HANIFAH
Afriyanti Dwi Kartika, M.T.
NAJLA NADIVA
Ricky Akbar, M.Kom.
NAUFAL ADLI DHIAURRAHMAN
Ullya Mega Wahyuni, M.Kom.
DHIYA GUSTITA AQILA
Ricky Akbar, M.Kom.
RIZKA KURNIA ILLAHI
Ricky Akbar, M.Kom.
IZZA TRY MALINDA
Afriyanti Dwi Kartika, M.T.
RUCHIL AMELINDA
Hasdi Putra, M.T.
TRIANA ZAHARA NURHALIZA
Ricky Akbar, M.Kom.
FADLI HIDAYAT
Hasdi Putra, M.T.
VIONI WIJAYA PUTRI
Rahmatika Pratama Santi, M.T.
AZIZAH NOVI DELFIANTI
Ricky Akbar, M.Kom.
MIFTAHUL JANAH
Afriyanti Dwi Kartika, M.T.
ISRA RAHMA DINA
Ullya Mega Wahyuni, M.Kom.
ANASTASYA ESTU WAHYUDI
Ullya Mega Wahyuni, M.Kom.
AKRAM MAKRUF AIDIL
Hasdi Putra, M.T.
MUHAMMAD DANI NOAR
Haris Suryamen, M.Sc.
FAJRIN PUTRA PRATAMA
Jefril Rahmadoni, M.Kom.
SISTRI MAHIRA
Hasdi Putra, M.T.
HENI YUNIDA
Ullya Mega Wahyuni, M.Kom.
AZHRA MEISA KHAIRANI
Jefril Rahmadoni, M.Kom.
RANIA SHOFI MALIKA
Afriyanti Dwi Kartika, M.T.
ZHAFIRA SYARAFINA
Ricky Akbar, M.Kom.
NAJWA NUR FAIZAH
Jefril Rahmadoni, M.Kom.
LAURA IFFA RAZITTA
Rahmatika Pratama Santi, M.T.
DAFFA AGUSTIAN SAADI
Afriyanti Dwi Kartika, M.T.
`;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function comparableTokens(value) {
  const ignored = new Set([
    "DR",
    "DRA",
    "IR",
    "S",
    "SI",
    "ST",
    "MT",
    "M",
    "T",
    "KOM",
    "ENG",
    "SC",
    "KOMPUTER",
  ]);

  return normalizeName(value)
    .split(" ")
    .filter((token) => token && !ignored.has(token));
}

function parseAssignments(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !["Nama Mahasiswa", "Pembimbing I"].includes(line));

  if (lines.length % 2 !== 0) {
    throw new Error(`Data pasangan tidak genap. Jumlah baris: ${lines.length}`);
  }

  const assignments = [];
  for (let i = 0; i < lines.length; i += 2) {
    assignments.push({
      studentName: lines[i],
      lecturerName: lines[i + 1],
    });
  }
  return assignments;
}

function buildUserIndex(users) {
  const index = new Map();
  for (const user of users) {
    const key = normalizeName(user.fullName);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(user);
  }
  return index;
}

function findSingle(index, name, kind) {
  const matches = index.get(normalizeName(name)) || [];
  if (matches.length === 1) return matches[0];

  if (matches.length === 0) {
    const expectedTokens = comparableTokens(name);
    const fuzzyMatches = Array.from(index.values())
      .flat()
      .filter((candidate) => {
        const candidateTokens = comparableTokens(candidate.fullName);
        return expectedTokens.every((token) => candidateTokens.includes(token));
      });

    if (fuzzyMatches.length === 1) return fuzzyMatches[0];
    if (fuzzyMatches.length > 1) {
      return {
        error: `${kind} ambigu: ${name} (${fuzzyMatches.map((m) => m.fullName).join(", ")})`,
      };
    }
  }

  return {
    error: matches.length === 0
      ? `${kind} tidak ditemukan: ${name}`
      : `${kind} ambigu: ${name} (${matches.map((m) => m.id).join(", ")})`,
  };
}

function pickTargetThesis(theses) {
  const activeStatuses = new Set(["Gagal", "Dibatalkan"]);
  const nonProposal = theses.filter((thesis) => thesis.isProposal === false);
  const active = nonProposal.filter((thesis) => !activeStatuses.has(thesis.thesisStatus?.name));
  return (active[0] || nonProposal[0] || theses[0]) ?? null;
}

async function main() {
  const assignments = parseAssignments(RAW_ASSIGNMENTS);

  const [students, lecturers, pembimbingRole] = await Promise.all([
    prisma.user.findMany({
      where: { student: { isNot: null } },
      select: { id: true, fullName: true },
    }),
    prisma.user.findMany({
      where: { lecturer: { isNot: null } },
      select: { id: true, fullName: true },
    }),
    prisma.userRole.findFirst({
      where: { name: { in: ["Pembimbing 1", "Pembimbing I"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!pembimbingRole) {
    throw new Error('Role "Pembimbing 1" / "Pembimbing I" tidak ditemukan di user_roles');
  }

  const studentIndex = buildUserIndex(students);
  const lecturerIndex = buildUserIndex(lecturers);
  const stats = { total: assignments.length, created: 0, updated: 0, skipped: 0, failed: 0 };
  const failures = [];

  for (const assignment of assignments) {
    const student = findSingle(studentIndex, assignment.studentName, "Mahasiswa");
    const lecturer = findSingle(lecturerIndex, assignment.lecturerName, "Dosen");

    if (student.error || lecturer.error) {
      stats.failed++;
      failures.push({
        studentName: assignment.studentName,
        lecturerName: assignment.lecturerName,
        reason: student.error || lecturer.error,
      });
      continue;
    }

    const theses = await prisma.thesis.findMany({
      where: { studentId: student.id },
      include: {
        thesisStatus: true,
        thesisSupervisors: {
          include: {
            role: true,
            lecturer: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const thesis = pickTargetThesis(theses);
    if (!thesis) {
      stats.failed++;
      failures.push({
        studentName: assignment.studentName,
        lecturerName: assignment.lecturerName,
        reason: "Thesis mahasiswa tidak ditemukan",
      });
      continue;
    }

    const existingPembimbing1 = thesis.thesisSupervisors.find((supervisor) =>
      ["Pembimbing 1", "Pembimbing I"].includes(supervisor.role?.name)
    );

    if (existingPembimbing1?.lecturerId === lecturer.id) {
      stats.skipped++;
      console.log(`[SKIP] ${assignment.studentName} sudah dibimbing ${assignment.lecturerName}`);
      continue;
    }

    if (existingPembimbing1) {
      stats.updated++;
      console.log(
        `[UPDATE] ${assignment.studentName}: ${existingPembimbing1.lecturer?.user?.fullName || "-"} -> ${assignment.lecturerName}`
      );
      if (APPLY) {
        await prisma.thesisSupervisors.update({
          where: { id: existingPembimbing1.id },
          data: { lecturerId: lecturer.id },
        });
      }
      continue;
    }

    stats.created++;
    console.log(`[CREATE] ${assignment.studentName}: ${assignment.lecturerName}`);
    if (APPLY) {
      await prisma.thesisSupervisors.create({
        data: {
          thesisId: thesis.id,
          lecturerId: lecturer.id,
          roleId: pembimbingRole.id,
        },
      });
    }
  }

  console.log("\nMode:", APPLY ? "APPLY" : "DRY RUN");
  console.table(stats);
  if (failures.length > 0) {
    console.log("\nFailures:");
    console.table(failures);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
