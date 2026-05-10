import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const CPMKS = [
    {
        code: "CPMK-01",
        description: "Mahasiswa mampu merancang dan mengimplementasikan solusi berbasis sistem informasi secara tepat guna untuk memecahkan permasalahan nyata dalam organisasi",
        type: "thesis",
    },
    {
        code: "CPMK-02",
        description: "Mahasiswa mampu menyampaikan ide, proses, dan hasil penelitian tugas akhir secara jelas, sistematis, dan meyakinkan kepada audiens",
        type: "thesis",
    },
    {
        code: "CPMK-03",
        description: "Mahasiswa mampu menyusun laporan Tugas Akhir secara sistematis sesuai dengan kaidah akademik.",
        type: "thesis",
    },
    {
        code: "CPMK-04",
        description: "Mahasiswa mampu merespons masukan, pertanyaan, dan kritik dari audiens secara reflektif dan konstruktif untuk penyempurnaan tugas akhir",
        type: "thesis",
    },
    {
        code: "CPMK-05",
        description: "Mahasiswa mampu menunjukkan kemandirian, inisiatif, dan kemampuan beradaptasi dalam menghadapi tantangan baru, baik terkait perkembangan teknologi, metodologi, maupun dinamika lingkungan penelitian, sebagai bagian dari proses penyelesaian Tugas Akhir",
        type: "thesis",
    },
    {
        code: "CPMK-06",
        description: "Mahasiswa mampu mengembangkan pengetahuan dan solusi tugas akhir yang memiliki kebermanfaatan jangka panjang bagi organisasi atau masyarakat",
        type: "thesis",
    },
];

const SEMINAR_EXAMINER_CRITERIA = [
    {
        cpmkCode: "CPMK-01",
        name: "A.(a) KESESUAIAN SOLUSI DENGAN PERMASALAHAN",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Solusi tidak relevan dengan masalah yang diangkat atau tanpa dasar analisis kebutuhan." },
            { min: 4, max: 6, desc: "Solusi kurang sesuai dan tidak menunjukkan hubungan langsung dengan permasalahan organisasi." },
            { min: 7, max: 9, desc: "Solusi cukup sesuai namun tidak sepenuhnya menjawab masalah inti." },
            { min: 9, max: 12, desc: "Solusi relevan dengan sebagian besar masalah utama, namun belum menunjukkan bukti kebutuhan pengguna secara lengkap." },
            { min: 12, max: 15, desc: "Solusi sepenuhnya menjawab akar masalah dan selaras dengan kebutuhan organisasi, disertai bukti kebutuhan pengguna dan hasil analisis masalah." },
        ],
    },
    {
        cpmkCode: "CPMK-01",
        name: "A.(b) ANALISIS SISTEM (BUSINESS PROCESS) ATAU MODEL",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Mahasiswa tidak menunjukkan analisis sistem, proses bisnis, atau model yang dapat dievaluasi, atau analisis tidak relevan dengan konteks organisasi dan permasalahan penelitian." },
            { min: 3, max: 4, desc: "Mahasiswa menunjukkan analisis terbatas, hanya menggambarkan sebagian proses atau model tanpa kejelasan alur dan keterkaitan antar aktivitas. Tidak menggunakan notasi standar atau dokumentasi formal." },
            { min: 5, max: 6, desc: "Mahasiswa menyajikan analisis proses bisnis atau model secara umum, namun beberapa bagian tidak konsisten, tidak lengkap, atau tidak disertai penjelasan hubungan antarproses." },
            { min: 7, max: 8, desc: "Mahasiswa menunjukkan analisis proses bisnis atau model yang jelas dan relevan, meliputi sebagian besar komponen utama (aktor, aktivitas, alur informasi), namun belum seluruhnya mendalam atau terjustifikasi." },
            { min: 9, max: 10, desc: "Mahasiswa menunjukkan analisis proses bisnis atau model yang lengkap, akurat, dan logis, mencakup identifikasi aktor, aktivitas, alur informasi, serta hubungan antarproses. Analisis disajikan dengan notasi standar dan dilengkapi justifikasi atas setiap keputusan desain." },
        ],
    },
    {
        cpmkCode: "CPMK-01",
        name: "A.(c) KUALITAS PERANCANGAN SISTEM",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Mahasiswa tidak menyajikan perancangan sistem yang dapat dievaluasi, atau desain yang ditampilkan tidak relevan, tidak konsisten, dan tidak sesuai dengan hasil analisis sistem." },
            { min: 3, max: 4, desc: "Mahasiswa menyajikan perancangan sistem yang terbatas dan tidak terintegrasi, dengan diagram yang tidak mengikuti notasi standar atau tidak menggambarkan hubungan antar komponen sistem." },
            { min: 5, max: 6, desc: "Mahasiswa menyajikan perancangan sistem secara umum, namun hanya sebagian diagram yang dibuat (misal hanya ERD atau hanya Use Case), atau terdapat ketidaksesuaian antar diagram dan kebutuhan sistem." },
            { min: 7, max: 8, desc: "Mahasiswa menyajikan sebagian besar komponen perancangan sistem (ERD dan beberapa diagram UML/DFD) dengan hubungan yang cukup jelas antar komponen. Struktur rancangan cukup konsisten, namun terdapat kekurangan minor pada kelengkapan atau dokumentasi." },
            { min: 9, max: 10, desc: "Mahasiswa menyajikan perancangan sistem yang komprehensif, terintegrasi, dan konsisten antar diagram, mencakup ERD atau model basis data, serta diagram UML/DFD utama (Use Case, Activity, Sequence/Class) dengan notasi standar dan dokumentasi lengkap." },
        ],
    },
    {
        cpmkCode: "CPMK-01",
        name: "A.(d) IMPLEMENTASI SISTEM ATAU MODEL",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Tidak ada hasil implementasi yang dapat dievaluasi." },
            { min: 3, max: 4, desc: "Implementasi tidak lengkap atau belum dapat diuji." },
            { min: 5, max: 6, desc: "Implementasi berjalan sebagian, dengan fungsi utama belum seluruhnya bekerja." },
            { min: 7, max: 8, desc: "Sistem diimplementasikan dengan baik, namun terdapat beberapa fungsi minor yang belum sempurna." },
            { min: 9, max: 10, desc: "Sistem diimplementasikan sepenuhnya, berfungsi stabil, dan menghasilkan keluaran sesuai rancangan." },
        ],
    },
    {
        cpmkCode: "CPMK-01",
        name: "A.(e) PROSES DAN HASIL PENGUJIAN",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Tidak ada pengujian atau bukti hasil pengujian yang disajikan." },
            { min: 3, max: 4, desc: "Pengujian sangat terbatas dan tidak sistematis." },
            { min: 5, max: 6, desc: "Pengujian dilakukan namun tidak lengkap atau tanpa analisis hasil." },
            { min: 7, max: 8, desc: "Pengujian dilakukan dengan metode yang cukup tepat, hasil terukur sebagian." },
            { min: 9, max: 10, desc: "Pengujian dilakukan menyeluruh dengan metode valid (mis. black-box, user testing, UAT, dll) dan hasil terukur serta terdokumentasi." },
        ],
    },
    {
        cpmkCode: "CPMK-02",
        name: "B. PRESENTASI",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Tidak mampu menyampaikan ide atau hasil dengan jelas; komunikasi tidak efektif." },
            { min: 4, max: 6, desc: "Presentasi tidak runtut dan sulit dipahami; penggunaan bahasa tidak efektif." },
            { min: 7, max: 9, desc: "Presentasi cukup runtut, namun penjelasan sering tidak mendalam atau tidak fokus." },
            { min: 9, max: 12, desc: "Presentasi teratur dan jelas, namun kurang kuat dalam argumentasi atau visualisasi." },
            { min: 12, max: 15, desc: "Presentasi terstruktur, logis, dan sistematis; penyampaian jelas dan meyakinkan; penggunaan bahasa dan visualisasi efektif; mampu menjelaskan konsep tanpa membaca naskah." },
        ],
    },
    {
        cpmkCode: "CPMK-03",
        name: "C. LAPORAN TUGAS AKHIR",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Laporan tidak memenuhi kaidah akademik dan tidak logis dalam isi maupun format." },
            { min: 4, max: 6, desc: "Laporan tidak sistematis, dengan banyak kesalahan bahasa atau sitasi." },
            { min: 7, max: 9, desc: "Laporan cukup baik, tetapi analisis tidak mendalam atau format tidak konsisten." },
            { min: 9, max: 12, desc: "Laporan sistematis dan jelas, namun ada kesalahan minor dalam bahasa atau format referensi." },
            { min: 12, max: 15, desc: "Laporan terstruktur sesuai pedoman, menggunakan bahasa ilmiah baku, referensi terbaru dan valid, serta konsisten antara hasil, pembahasan, dan kesimpulan." },
        ],
    },
    {
        cpmkCode: "CPMK-04",
        name: "D. RESPON TERHADAP MASUKAN DAN PERTANYAAN",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Tidak mampu menjawab dengan baik, menolak kritik, atau tidak memahami pertanyaan." },
            { min: 4, max: 6, desc: "Jawaban kurang tepat dan tidak menunjukkan sikap reflektif." },
            { min: 7, max: 9, desc: "Menjawab sebagian pertanyaan, namun tidak mendalam atau kurang relevan." },
            { min: 9, max: 12, desc: "Menjawab tepat dan jelas, namun refleksi terhadap masukan masih terbatas." },
            { min: 12, max: 15, desc: "Menjawab tepat dan logis, dengan argumentasi berbasis data/literatur; sopan dan terbuka terhadap kritik; menunjukkan refleksi terhadap perbaikan karya." },
        ],
    },
];

const DEFENCE_EXAMINER_CRITERIA = [
    {
        cpmkCode: "CPMK-01",
        name: "A. ANALISIS, PERANCANGAN, IMPLEMENTASI, DAN PENGUJIAN SISTEM",
        maxScore: 20,
        rubrics: [
            { min: 0, max: 4, desc: "Mahasiswa tidak menunjukkan kemampuan yang dapat dievaluasi, solusi tidak relevan, tanpa analisis, rancangan, implementasi, atau pengujian yang dapat dibuktikan." },
            { min: 5, max: 8, desc: "Mahasiswa kurang menunjukkan integrasi antara analisis, rancangan, dan implementasi. Solusi kurang relevan, rancangan tidak lengkap atau tidak logis, implementasi belum berjalan dengan baik, dan pengujian tidak sistematis." },
            { min: 9, max: 12, desc: "Mahasiswa menunjukkan kemampuan cukup pada sebagian tahapan. Solusi cukup relevan, analisis dan rancangan masih terbatas, sistem hanya sebagian berfungsi, dan pengujian dilakukan secara terbatas tanpa metode yang jelas." },
            { min: 12, max: 16, desc: "Mahasiswa menunjukkan kemampuan baik dalam seluruh tahapan perancangan dan implementasi. Solusi relevan dan logis, analisis dan rancangan cukup lengkap, sistem berfungsi baik dengan kekurangan minor, serta pengujian telah dilakukan namun belum sepenuhnya mendalam atau terdokumentasi sempurna." },
            { min: 16, max: 20, desc: "Mahasiswa menunjukkan kemampuan menyeluruh dan terintegrasi dalam mengembangkan solusi sistem informasi. Solusi sangat relevan dengan masalah organisasi, analisis proses dan model sistem akurat dan logis, perancangan sistem komprehensif dan konsisten, implementasi berfungsi penuh, pengujian valid dan terdokumentasi baik." },
        ],
    },
    {
        cpmkCode: "CPMK-02",
        name: "B. PRESENTASI",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Tidak mampu menyampaikan ide atau hasil dengan jelas; komunikasi tidak efektif." },
            { min: 3, max: 4, desc: "Presentasi tidak runtut dan sulit dipahami; penggunaan bahasa tidak efektif." },
            { min: 5, max: 6, desc: "Presentasi cukup runtut, namun penjelasan sering tidak mendalam atau tidak fokus." },
            { min: 7, max: 8, desc: "Presentasi teratur dan jelas, namun kurang kuat dalam argumentasi atau visualisasi." },
            { min: 9, max: 10, desc: "Presentasi terstruktur, logis, dan sistematis; penyampaian jelas dan meyakinkan; penggunaan bahasa dan visualisasi efektif; mampu menjelaskan konsep tanpa membaca naskah." },
        ],
    },
    {
        cpmkCode: "CPMK-03",
        name: "C. LAPORAN TUGAS AKHIR",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Laporan tidak memenuhi kaidah akademik dan tidak logis dalam isi maupun format." },
            { min: 4, max: 6, desc: "Laporan tidak sistematis, dengan banyak kesalahan bahasa atau sitasi." },
            { min: 7, max: 9, desc: "Laporan cukup baik, tetapi analisis tidak mendalam atau format tidak konsisten." },
            { min: 9, max: 12, desc: "Laporan sistematis dan jelas, namun ada kesalahan minor dalam bahasa atau format referensi." },
            { min: 12, max: 15, desc: "Laporan terstruktur sesuai pedoman, menggunakan bahasa ilmiah baku, referensi terbaru dan valid, serta konsisten antara hasil, pembahasan, dan kesimpulan." },
        ],
    },
    {
        cpmkCode: "CPMK-04",
        name: "D. RESPON TERHADAP MASUKAN DAN PERTANYAAN",
        maxScore: 15,
        rubrics: [
            { min: 0, max: 3, desc: "Tidak mampu menjawab dengan baik, menolak kritik, atau tidak memahami pertanyaan." },
            { min: 4, max: 6, desc: "Jawaban kurang tepat dan tidak menunjukkan sikap reflektif." },
            { min: 7, max: 9, desc: "Menjawab sebagian pertanyaan, namun tidak mendalam atau kurang relevan." },
            { min: 9, max: 12, desc: "Menjawab tepat dan jelas, namun refleksi terhadap masukan masih terbatas." },
            { min: 12, max: 15, desc: "Menjawab tepat dan logis, dengan argumentasi berbasis data/literatur; sopan dan terbuka terhadap kritik; menunjukkan refleksi terhadap perbaikan karya." },
        ],
    },
    {
        cpmkCode: "CPMK-06",
        name: "E. KEBERMANFAATAN JANGKA PANJANG",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Solusi tidak menunjukkan manfaat nyata, tidak relevan, dan tidak memiliki potensi keberlanjutan atau kontribusi ilmiah/praktis." },
            { min: 3, max: 4, desc: "Solusi kurang menunjukkan manfaat dan keberlanjutan, serta minim kontribusi terhadap pengetahuan atau penerapan praktis." },
            { min: 5, max: 6, desc: "Solusi cukup bermanfaat dan relevan, namun dampak dan kontribusi terhadap pengetahuan masih terbatas atau belum teruji dalam konteks nyata." },
            { min: 7, max: 8, desc: "Solusi relevan dan bermanfaat nyata, menunjukkan potensi pengembangan dan keberlanjutan, namun inovasi atau dampak jangka panjang belum sepenuhnya optimal." },
            { min: 9, max: 10, desc: "Solusi sangat relevan dan berdampak nyata, memberikan manfaat jangka panjang yang terukur, menerapkan inovasi atau pendekatan baru, serta menunjukkan potensi keberlanjutan dan pengembangan lebih lanjut." },
        ],
    },
];

const DEFENCE_SUPERVISOR_CRITERIA = [
    {
        cpmkCode: "CPMK-02",
        name: "A. PRESENTASI",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Tidak mampu menyampaikan ide atau hasil dengan jelas; komunikasi tidak efektif." },
            { min: 3, max: 4, desc: "Presentasi tidak runtut dan sulit dipahami; penggunaan bahasa tidak efektif." },
            { min: 5, max: 6, desc: "Presentasi cukup runtut, namun penjelasan sering tidak mendalam atau tidak fokus." },
            { min: 7, max: 8, desc: "Presentasi teratur dan jelas, namun kurang kuat dalam argumentasi atau visualisasi." },
            { min: 9, max: 10, desc: "Presentasi terstruktur, logis, dan sistematis; penyampaian jelas dan meyakinkan; penggunaan bahasa dan visualisasi efektif; mampu menjelaskan konsep tanpa membaca naskah." },
        ],
    },
    {
        cpmkCode: "CPMK-04",
        name: "B. RESPON TERHADAP MASUKAN DAN PERTANYAAN",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Tidak mampu menjawab dengan baik, menolak kritik, atau tidak memahami pertanyaan." },
            { min: 3, max: 4, desc: "Jawaban kurang tepat dan tidak menunjukkan sikap reflektif." },
            { min: 5, max: 6, desc: "Menjawab sebagian pertanyaan, namun tidak mendalam atau kurang relevan." },
            { min: 7, max: 8, desc: "Menjawab tepat dan jelas, namun refleksi terhadap masukan masih terbatas." },
            { min: 9, max: 10, desc: "Menjawab tepat dan logis, dengan argumentasi berbasis data/literatur; sopan dan terbuka terhadap kritik; menunjukkan refleksi terhadap perbaikan karya." },
        ],
    },
    {
        cpmkCode: "CPMK-05",
        name: "C. KEMANDIRIAN DAN INISIATIF",
        maxScore: 10,
        rubrics: [
            { min: 0, max: 2, desc: "Mahasiswa tidak menunjukkan kemandirian, inisiatif, maupun kemampuan adaptasi, sangat bergantung pada pembimbing, dan tidak mampu mengatasi tantangan baru." },
            { min: 3, max: 4, desc: "Mahasiswa kurang mandiri dan pasif, menunggu instruksi pembimbing, serta kurang mampu beradaptasi terhadap perubahan teknologi atau metodologi penelitian." },
            { min: 5, max: 6, desc: "Mahasiswa cukup mandiri namun masih sering bergantung pada arahan pembimbing. Mampu menghadapi sebagian tantangan, tetapi kurang aktif mencari solusi atau inovasi baru." },
            { min: 7, max: 8, desc: "Mahasiswa mandiri dan menunjukkan inisiatif yang baik, masih membutuhkan arahan terbatas dari pembimbing. Mampu menyelesaikan sebagian besar tantangan secara mandiri." },
            { min: 9, max: 10, desc: "Mahasiswa sangat mandiri dan proaktif dalam seluruh proses Tugas Akhir, mengambil inisiatif tanpa ketergantungan pada pembimbing, mampu menyelesaikan masalah baru secara kreatif, serta menunjukkan adaptasi cepat." },
        ],
    },
];

async function main() {
    console.log("🌱 Starting Thesis Rubrics seeding...");

    let activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) {
        console.log("⚠️ No active academic year found. Creating a default one (Ganjil 2025)...");
        activeYear = await prisma.academicYear.create({
            data: {
                semester: "ganjil",
                year: "2025",
                startDate: new Date("2025-08-01"),
                endDate: new Date("2026-01-31"),
                isActive: true,
            }
        });
        console.log(`✅ Created Academic Year: ${activeYear.semester} ${activeYear.year}`);
    } else {
        console.log(`📅 Found Active Academic Year: ${activeYear.semester} ${activeYear.year}`);
    }

    // 1. Seed CPMKs
    const cpmkMap = new Map();
    for (const data of CPMKS) {
        let cpmk = await prisma.cpmk.findFirst({
            where: { code: data.code, academicYearId: activeYear.id },
        });

        if (!cpmk) {
            cpmk = await prisma.cpmk.create({
                data: {
                    ...data,
                    academicYearId: activeYear.id,
                },
            });
            console.log(`✨ Created CPMK: ${data.code}`);
        } else {
            console.log(`⏭️  CPMK exists: ${data.code}`);
        }
        cpmkMap.set(data.code, cpmk);
    }

    // 2. Seed Seminar Examiner Criteria
    console.log("\n📋 Seeding Seminar Examiner Criteria...");
    for (const [index, criteriaData] of SEMINAR_EXAMINER_CRITERIA.entries()) {
        const cpmk = cpmkMap.get(criteriaData.cpmkCode);
        let criteria = await prisma.assessmentCriteria.findFirst({
            where: {
                cpmkId: cpmk.id,
                name: criteriaData.name,
                appliesTo: "seminar",
                role: "default",
            },
        });

        if (!criteria) {
            criteria = await prisma.assessmentCriteria.create({
                data: {
                    cpmkId: cpmk.id,
                    name: criteriaData.name,
                    appliesTo: "seminar",
                    role: "default",
                    maxScore: criteriaData.maxScore,
                    displayOrder: index,
                },
            });
            console.log(`  ✅ Created Seminar Criteria: ${criteriaData.name}`);
        }

        // Seed Rubrics
        for (const [rIndex, rData] of criteriaData.rubrics.entries()) {
            const existingRubric = await prisma.assessmentRubric.findFirst({
                where: { assessmentCriteriaId: criteria.id, description: rData.desc },
            });
            if (!existingRubric) {
                await prisma.assessmentRubric.create({
                    data: {
                        assessmentCriteriaId: criteria.id,
                        minScore: rData.min,
                        maxScore: rData.max,
                        description: rData.desc,
                        displayOrder: rIndex,
                    },
                });
            }
        }
    }

    // 3. Seed Defence Examiner Criteria
    console.log("\n📋 Seeding Defence Examiner Criteria...");
    for (const [index, criteriaData] of DEFENCE_EXAMINER_CRITERIA.entries()) {
        const cpmk = cpmkMap.get(criteriaData.cpmkCode);
        let criteria = await prisma.assessmentCriteria.findFirst({
            where: {
                cpmkId: cpmk.id,
                name: criteriaData.name,
                appliesTo: "defence",
                role: "examiner",
            },
        });

        if (!criteria) {
            criteria = await prisma.assessmentCriteria.create({
                data: {
                    cpmkId: cpmk.id,
                    name: criteriaData.name,
                    appliesTo: "defence",
                    role: "examiner",
                    maxScore: criteriaData.maxScore,
                    displayOrder: index,
                },
            });
            console.log(`  ✅ Created Defence Examiner Criteria: ${criteriaData.name}`);
        }

        // Seed Rubrics
        for (const [rIndex, rData] of criteriaData.rubrics.entries()) {
            const existingRubric = await prisma.assessmentRubric.findFirst({
                where: { assessmentCriteriaId: criteria.id, description: rData.desc },
            });
            if (!existingRubric) {
                await prisma.assessmentRubric.create({
                    data: {
                        assessmentCriteriaId: criteria.id,
                        minScore: rData.min,
                        maxScore: rData.max,
                        description: rData.desc,
                        displayOrder: rIndex,
                    },
                });
            }
        }
    }

    // 4. Seed Defence Supervisor Criteria
    console.log("\n📋 Seeding Defence Supervisor Criteria...");
    for (const [index, criteriaData] of DEFENCE_SUPERVISOR_CRITERIA.entries()) {
        const cpmk = cpmkMap.get(criteriaData.cpmkCode);
        let criteria = await prisma.assessmentCriteria.findFirst({
            where: {
                cpmkId: cpmk.id,
                name: criteriaData.name,
                appliesTo: "defence",
                role: "supervisor",
            },
        });

        if (!criteria) {
            criteria = await prisma.assessmentCriteria.create({
                data: {
                    cpmkId: cpmk.id,
                    name: criteriaData.name,
                    appliesTo: "defence",
                    role: "supervisor",
                    maxScore: criteriaData.maxScore,
                    displayOrder: index,
                },
            });
            console.log(`  ✅ Created Defence Supervisor Criteria: ${criteriaData.name}`);
        }

        // Seed Rubrics
        for (const [rIndex, rData] of criteriaData.rubrics.entries()) {
            const existingRubric = await prisma.assessmentRubric.findFirst({
                where: { assessmentCriteriaId: criteria.id, description: rData.desc },
            });
            if (!existingRubric) {
                await prisma.assessmentRubric.create({
                    data: {
                        assessmentCriteriaId: criteria.id,
                        minScore: rData.min,
                        maxScore: rData.max,
                        description: rData.desc,
                        displayOrder: rIndex,
                    },
                });
            }
        }
    }

    console.log("\n🏁 Thesis Rubrics seeding finished.");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
