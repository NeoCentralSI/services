/**
 * Seed TA (phase "research") milestone templates per thesis topic — idempotent, never deletes.
 *
 * Usage (from app/backend, AFTER confirming DATABASE_URL points to the intended database):
 *   node scripts/seed-milestone-templates.js             # writes: fills the missing TA templates
 *   node scripts/seed-milestone-templates.js --dry-run   # preview only, writes nothing
 *
 * For every catalogue topic that exists in ThesisTopic (exact name, case/whitespace-insensitive)
 * and every catalogue template name, exactly one of these happens:
 * 1. A phase "research" template with that topic + name already exists -> skipped (user edits to
 *    its description/order/status are kept).
 * 2. Otherwise -> a new template is created with `phase: "research"` written explicitly (the
 *    column has no default). A same-named template of the proposal phase is real data of
 *    that phase: it is left untouched and only reported.
 * Topics are never created; missing or ambiguous topics are reported and skipped. Templates
 * that are not in the catalogue (custom or proposal templates) are never modified.
 * Order: a topic without TA templates gets the catalogue order; otherwise new templates are
 * appended after the current max, so existing (possibly reordered) ones keep their positions.
 *
 * The old reclassification of legacy proposal-phase rows was removed. That old
 * phase value no longer exists (ThesisPhase is proposal/thesis) and the database is
 * rebuilt from empty, so such rows cannot occur.
 */
import { pathToFileURL } from "node:url";

export const TA_TEMPLATE_PHASE = "research";

// Template milestone per topic (catalogue names follow scripts/sync-dsi-master.js)
export const TEMPLATES_PER_TOPIC = {
  "Sistem Pendukung Keputusan (SPK)": [
    {
      name: "Studi Literatur SPK",
      description: "Mempelajari teori dan metode Sistem Pendukung Keputusan seperti AHP, SAW, TOPSIS, PROMETHEE, dll.",
      orderIndex: 0,
    },
    {
      name: "Identifikasi Kriteria & Alternatif",
      description: "Mengidentifikasi kriteria-kriteria keputusan dan alternatif yang akan dievaluasi.",
      orderIndex: 1,
    },
    {
      name: "Pengumpulan Data & Bobot Kriteria",
      description: "Mengumpulkan data dari pakar/stakeholder untuk menentukan bobot kriteria.",
      orderIndex: 2,
    },
    {
      name: "Implementasi Metode SPK",
      description: "Mengimplementasikan algoritma/metode SPK yang dipilih (AHP, SAW, TOPSIS, dll).",
      orderIndex: 3,
    },
    {
      name: "Pengembangan Sistem/Aplikasi",
      description: "Membangun sistem informasi atau aplikasi SPK berbasis web/mobile/desktop.",
      orderIndex: 4,
    },
    {
      name: "Pengujian & Validasi Hasil",
      description: "Melakukan pengujian sistem dan validasi hasil keputusan dengan pakar.",
      orderIndex: 5,
    },
    {
      name: "Analisis Sensitivitas",
      description: "Melakukan analisis sensitivitas terhadap perubahan bobot kriteria.",
      orderIndex: 6,
    },
    {
      name: "Penulisan Bab I - Pendahuluan",
      description: "Menulis latar belakang, rumusan masalah, tujuan, batasan, dan sistematika penulisan.",
      orderIndex: 7,
    },
    {
      name: "Penulisan Bab II - Landasan Teori",
      description: "Menulis teori SPK, metode yang digunakan, dan penelitian terkait.",
      orderIndex: 8,
    },
    {
      name: "Penulisan Bab III - Metodologi",
      description: "Menulis metodologi penelitian, desain sistem, dan flowchart.",
      orderIndex: 9,
    },
    {
      name: "Penulisan Bab IV - Implementasi & Pengujian",
      description: "Menulis implementasi sistem, hasil pengujian, dan analisis.",
      orderIndex: 10,
    },
    {
      name: "Penulisan Bab V - Penutup",
      description: "Menulis kesimpulan dan saran.",
      orderIndex: 11,
    },
  ],

  "Business Intelligence (BI)": [
    {
      name: "Studi Literatur BI & Data Warehouse",
      description: "Mempelajari konsep Business Intelligence, Data Warehouse, ETL, dan OLAP.",
      orderIndex: 0,
    },
    {
      name: "Analisis Kebutuhan Bisnis",
      description: "Mengidentifikasi kebutuhan informasi dan KPI yang dibutuhkan stakeholder.",
      orderIndex: 1,
    },
    {
      name: "Desain Data Warehouse",
      description: "Merancang skema data warehouse (star schema/snowflake schema).",
      orderIndex: 2,
    },
    {
      name: "Pengembangan ETL",
      description: "Membangun proses Extract, Transform, Load untuk mengisi data warehouse.",
      orderIndex: 3,
    },
    {
      name: "Implementasi Data Warehouse",
      description: "Mengimplementasikan data warehouse menggunakan tools seperti SQL Server, PostgreSQL, dll.",
      orderIndex: 4,
    },
    {
      name: "Pembuatan Dashboard & Visualisasi",
      description: "Membuat dashboard interaktif menggunakan tools seperti Tableau, Power BI, Metabase, dll.",
      orderIndex: 5,
    },
    {
      name: "Pengujian & Validasi Data",
      description: "Memvalidasi keakuratan data dan performa sistem BI.",
      orderIndex: 6,
    },
    {
      name: "Penulisan Bab I - Pendahuluan",
      description: "Menulis latar belakang, rumusan masalah, tujuan, batasan, dan sistematika penulisan.",
      orderIndex: 7,
    },
    {
      name: "Penulisan Bab II - Landasan Teori",
      description: "Menulis teori BI, Data Warehouse, ETL, dan penelitian terkait.",
      orderIndex: 8,
    },
    {
      name: "Penulisan Bab III - Metodologi",
      description: "Menulis metodologi penelitian dan desain sistem.",
      orderIndex: 9,
    },
    {
      name: "Penulisan Bab IV - Implementasi & Pengujian",
      description: "Menulis implementasi, hasil dashboard, dan analisis.",
      orderIndex: 10,
    },
    {
      name: "Penulisan Bab V - Penutup",
      description: "Menulis kesimpulan dan saran.",
      orderIndex: 11,
    },
  ],

  "Pengembangan Sistem (Enterprise Application)": [
    {
      name: "Studi Literatur & Analisis Sistem Existing",
      description: "Mempelajari sistem yang sudah ada dan mengidentifikasi masalah.",
      orderIndex: 0,
    },
    {
      name: "Pengumpulan Kebutuhan (Requirement Gathering)",
      description: "Melakukan wawancara, observasi, dan dokumentasi kebutuhan user.",
      orderIndex: 1,
    },
    {
      name: "Analisis & Desain Sistem",
      description: "Membuat use case, activity diagram, class diagram, dan ERD.",
      orderIndex: 2,
    },
    {
      name: "Desain UI/UX",
      description: "Membuat wireframe dan mockup antarmuka pengguna.",
      orderIndex: 3,
    },
    {
      name: "Setup Arsitektur & Environment",
      description: "Menyiapkan environment development, framework, dan database.",
      orderIndex: 4,
    },
    {
      name: "Implementasi Backend",
      description: "Mengembangkan API, business logic, dan database.",
      orderIndex: 5,
    },
    {
      name: "Implementasi Frontend",
      description: "Mengembangkan antarmuka pengguna sesuai desain.",
      orderIndex: 6,
    },
    {
      name: "Integrasi & Testing",
      description: "Mengintegrasikan frontend-backend dan melakukan testing.",
      orderIndex: 7,
    },
    {
      name: "User Acceptance Testing (UAT)",
      description: "Melakukan UAT dengan pengguna akhir.",
      orderIndex: 8,
    },
    {
      name: "Penulisan Bab I - Pendahuluan",
      description: "Menulis latar belakang, rumusan masalah, tujuan, batasan, dan sistematika penulisan.",
      orderIndex: 9,
    },
    {
      name: "Penulisan Bab II - Landasan Teori",
      description: "Menulis teori pengembangan sistem, framework, dan penelitian terkait.",
      orderIndex: 10,
    },
    {
      name: "Penulisan Bab III - Metodologi",
      description: "Menulis metodologi SDLC, analisis, dan desain sistem.",
      orderIndex: 11,
    },
    {
      name: "Penulisan Bab IV - Implementasi & Pengujian",
      description: "Menulis implementasi sistem dan hasil pengujian.",
      orderIndex: 12,
    },
    {
      name: "Penulisan Bab V - Penutup",
      description: "Menulis kesimpulan dan saran.",
      orderIndex: 13,
    },
  ],

  "Machine Learning": [
    {
      name: "Studi Literatur Machine Learning",
      description: "Mempelajari teori ML, algoritma, dan penelitian terkait.",
      orderIndex: 0,
    },
    {
      name: "Pengumpulan Dataset",
      description: "Mengumpulkan atau mengunduh dataset yang relevan.",
      orderIndex: 1,
    },
    {
      name: "Eksplorasi & Preprocessing Data",
      description: "Melakukan EDA, cleaning, normalisasi, dan feature engineering.",
      orderIndex: 2,
    },
    {
      name: "Pemilihan & Training Model",
      description: "Memilih algoritma dan melatih model ML.",
      orderIndex: 3,
    },
    {
      name: "Hyperparameter Tuning",
      description: "Melakukan tuning parameter untuk optimasi model.",
      orderIndex: 4,
    },
    {
      name: "Evaluasi Model",
      description: "Mengevaluasi performa model dengan metrik yang sesuai (accuracy, precision, recall, F1, dll).",
      orderIndex: 5,
    },
    {
      name: "Pengembangan Aplikasi/API",
      description: "Membangun aplikasi atau API untuk deploy model ML.",
      orderIndex: 6,
    },
    {
      name: "Deployment & Testing",
      description: "Melakukan deployment dan testing model di production.",
      orderIndex: 7,
    },
    {
      name: "Penulisan Bab I - Pendahuluan",
      description: "Menulis latar belakang, rumusan masalah, tujuan, batasan, dan sistematika penulisan.",
      orderIndex: 8,
    },
    {
      name: "Penulisan Bab II - Landasan Teori",
      description: "Menulis teori ML, algoritma yang digunakan, dan penelitian terkait.",
      orderIndex: 9,
    },
    {
      name: "Penulisan Bab III - Metodologi",
      description: "Menulis metodologi penelitian, preprocessing, dan arsitektur model.",
      orderIndex: 10,
    },
    {
      name: "Penulisan Bab IV - Implementasi & Pengujian",
      description: "Menulis hasil training, evaluasi model, dan analisis.",
      orderIndex: 11,
    },
    {
      name: "Penulisan Bab V - Penutup",
      description: "Menulis kesimpulan dan saran.",
      orderIndex: 12,
    },
  ],

  "Enterprise System": [
    {
      name: "Studi Literatur Enterprise System",
      description: "Mempelajari konsep ERP, CRM, SCM, atau sistem enterprise lainnya.",
      orderIndex: 0,
    },
    {
      name: "Analisis Proses Bisnis",
      description: "Menganalisis dan memodelkan proses bisnis menggunakan BPMN atau flowchart.",
      orderIndex: 1,
    },
    {
      name: "Gap Analysis",
      description: "Mengidentifikasi gap antara sistem existing dan kebutuhan bisnis.",
      orderIndex: 2,
    },
    {
      name: "Desain Arsitektur Sistem",
      description: "Merancang arsitektur sistem enterprise (microservices, monolith, dll).",
      orderIndex: 3,
    },
    {
      name: "Desain Database & Integrasi",
      description: "Merancang database dan skema integrasi antar modul/sistem.",
      orderIndex: 4,
    },
    {
      name: "Implementasi Modul Core",
      description: "Mengembangkan modul-modul utama sistem enterprise.",
      orderIndex: 5,
    },
    {
      name: "Implementasi Integrasi",
      description: "Mengintegrasikan modul-modul dan sistem eksternal.",
      orderIndex: 6,
    },
    {
      name: "Testing & QA",
      description: "Melakukan unit testing, integration testing, dan UAT.",
      orderIndex: 7,
    },
    {
      name: "Dokumentasi & Training Material",
      description: "Membuat dokumentasi teknis dan materi training user.",
      orderIndex: 8,
    },
    {
      name: "Penulisan Bab I - Pendahuluan",
      description: "Menulis latar belakang, rumusan masalah, tujuan, batasan, dan sistematika penulisan.",
      orderIndex: 9,
    },
    {
      name: "Penulisan Bab II - Landasan Teori",
      description: "Menulis teori enterprise system dan penelitian terkait.",
      orderIndex: 10,
    },
    {
      name: "Penulisan Bab III - Metodologi",
      description: "Menulis metodologi, analisis proses bisnis, dan desain sistem.",
      orderIndex: 11,
    },
    {
      name: "Penulisan Bab IV - Implementasi & Pengujian",
      description: "Menulis implementasi modul dan hasil pengujian.",
      orderIndex: 12,
    },
    {
      name: "Penulisan Bab V - Penutup",
      description: "Menulis kesimpulan dan saran.",
      orderIndex: 13,
    },
  ],
};

export function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Pure planner: decides what to create/skip without touching the database.
 * @param {{
 *   topics: Array<{id: string, name: string}>,
 *   existingTemplates: Array<{id: string, name: string, topicId: string|null, phase: string, orderIndex: number}>
 * }} input
 */
export function planMilestoneTemplateSeed({ topics, existingTemplates }, catalogue = TEMPLATES_PER_TOPIC) {
  const plan = {
    toCreate: [],
    skippedExisting: [],
    otherPhaseKept: [],
    missingTopics: [],
    ambiguousTopics: [],
    uncataloguedTopics: [],
  };

  const topicsByName = new Map();
  for (const topic of topics) {
    const key = normalizeName(topic.name);
    topicsByName.set(key, [...(topicsByName.get(key) || []), topic]);
  }
  const catalogueKeys = new Set(Object.keys(catalogue).map(normalizeName));
  plan.uncataloguedTopics = topics.filter((t) => !catalogueKeys.has(normalizeName(t.name))).map((t) => t.name);

  for (const [topicName, entries] of Object.entries(catalogue)) {
    const matches = topicsByName.get(normalizeName(topicName)) || [];
    if (matches.length === 0) {
      plan.missingTopics.push(topicName);
      continue;
    }
    if (matches.length > 1) {
      plan.ambiguousTopics.push({ topicName, topicIds: matches.map((t) => t.id) });
      continue;
    }
    const topic = matches[0];
    const sameTopic = existingTemplates.filter((t) => t.topicId === topic.id);
    const thesisTemplates = sameTopic.filter((t) => t.phase === TA_TEMPLATE_PHASE);
    let nextOrder = thesisTemplates.length
      ? Math.max(...thesisTemplates.map((t) => t.orderIndex ?? 0)) + 1
      : null;

    entries.forEach((entry, index) => {
      const key = normalizeName(entry.name);
      const existingThesis = thesisTemplates.find((t) => normalizeName(t.name) === key);
      if (existingThesis) {
        plan.skippedExisting.push({ topic: topic.name, name: entry.name, id: existingThesis.id });
        return;
      }
      for (const t of sameTopic) {
        if (t.phase !== TA_TEMPLATE_PHASE && normalizeName(t.name) === key) {
          plan.otherPhaseKept.push({ topic: topic.name, name: t.name, id: t.id, phase: t.phase });
        }
      }
      plan.toCreate.push({
        name: entry.name,
        description: entry.description ?? null,
        topicId: topic.id,
        orderIndex: nextOrder === null ? entry.orderIndex ?? index : nextOrder++,
        isActive: true,
        phase: TA_TEMPLATE_PHASE,
        topicName: topic.name,
      });
    });
  }
  return plan;
}

/**
 * Loads current data, plans, and (only when apply=true) writes the plan in one transaction.
 */
export async function seedMilestoneTemplates({ prisma, apply = false, log = console.log } = {}) {
  const topics = await prisma.thesisTopic.findMany({ select: { id: true, name: true } });
  const existingTemplates = await prisma.thesisMilestoneTemplate.findMany({
    where: { topicId: { in: topics.map((t) => t.id) } },
    select: { id: true, name: true, topicId: true, phase: true, orderIndex: true },
  });
  const plan = planMilestoneTemplateSeed({ topics, existingTemplates });

  let created = 0;
  if (apply && plan.toCreate.length > 0) {
    const results = await prisma.$transaction(
      plan.toCreate.map(({ topicName: _topicName, ...data }) => prisma.thesisMilestoneTemplate.create({ data })),
    );
    created = results.length;
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    plannedCreate: plan.toCreate.length,
    created,
    skippedExisting: plan.skippedExisting.length,
    otherPhaseKept: plan.otherPhaseKept.length,
    missingTopics: plan.missingTopics,
    ambiguousTopics: plan.ambiguousTopics,
    uncataloguedTopics: plan.uncataloguedTopics,
  };

  const done = (n) => (apply ? ` (berhasil: ${n})` : " (dry-run, tidak ada yang ditulis)");
  log(`Seed template milestone Tugas Akhir — phase "${TA_TEMPLATE_PHASE}" (${summary.mode})`);
  log(`  Dibuat baru          : ${summary.plannedCreate}${done(created)}`);
  log(`  Sudah ada (dilewati) : ${summary.skippedExisting}`);
  if (plan.otherPhaseKept.length) {
    log(`  Nama sama di phase lain, dibiarkan: ${summary.otherPhaseKept}`);
    for (const k of plan.otherPhaseKept) log(`    - [${k.phase}] ${k.topic} :: ${k.name} (id ${k.id})`);
  }
  if (plan.missingTopics.length) log(`  Topik katalog tidak ditemukan: ${plan.missingTopics.join(", ")}`);
  if (plan.ambiguousTopics.length) log(`  Topik ambigu (nama ganda): ${plan.ambiguousTopics.map((a) => a.topicName).join(", ")}`);
  if (plan.uncataloguedTopics.length) log(`  Topik tanpa katalog: ${plan.uncataloguedTopics.join(", ")}`);

  return { plan, summary };
}

async function main() {
  const apply = !process.argv.includes("--dry-run");
  const generated = await import("../src/generated/prisma/index.js");
  const PrismaClient = generated.PrismaClient ?? generated.default?.PrismaClient;
  const prisma = new PrismaClient();
  try {
    await seedMilestoneTemplates({ prisma, apply });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Seed milestone templates gagal:", error);
    process.exitCode = 1;
  });
}
