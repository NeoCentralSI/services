/**
 * Seed Milestone Templates per Thesis Topic
 *
 * Jalankan dengan: node scripts/seed-milestone-templates.js
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

// Template milestone per topic
const TEMPLATES_PER_TOPIC = {
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

async function main() {
  console.log("🌱 Seeding milestone templates per topic...\n");

  // Get all topics from database
  const topics = await prisma.thesisTopic.findMany();

  if (topics.length === 0) {
    console.log("❌ Tidak ada thesis topic di database. Jalankan seed-thesis-topics.js terlebih dahulu.");
    return;
  }

  console.log(`📚 Ditemukan ${topics.length} thesis topics:\n`);
  topics.forEach((t) => console.log(`   - ${t.name}`));
  console.log();

  // Delete existing templates (optional - comment out if you want to keep existing)
  const deleteResult = await prisma.thesisMilestoneTemplate.deleteMany();
  console.log(`🗑️  Menghapus ${deleteResult.count} template lama...\n`);

  let totalCreated = 0;

  for (const topic of topics) {
    const templates = TEMPLATES_PER_TOPIC[topic.name];

    if (!templates) {
      console.log(`⚠️  Tidak ada template untuk topic: ${topic.name}`);
      continue;
    }

    console.log(`📝 Membuat ${templates.length} template untuk: ${topic.name}`);

    for (const template of templates) {
      await prisma.thesisMilestoneTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          topicId: topic.id,
          orderIndex: template.orderIndex,
          isActive: true,
        },
      });
      totalCreated++;
    }
  }

  console.log(`\n✅ Berhasil membuat ${totalCreated} milestone templates!`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
