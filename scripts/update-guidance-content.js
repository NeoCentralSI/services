import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const TRACKS = {
    web_si: {
        keywords: ["web", "sistem informasi", "aplikasi", "react", "laravel", "flutter", "mobile", "frontend", "backend", "fullstack", "manajemen"],
        steps: [
            {
                summary: "Diskusi awal mengenai cakupan sistem, identifikasi stakeholder, dan modul-modul utama yang akan dibangun.",
                action: "Cari referensi sistem serupa yang sudah ada. Buat daftar fitur prioritas (MVP)."
            },
            {
                summary: "Presentasi draf diagram alir (Flowchart) dan rancangan skema basis data (ERD) untuk modul utama.",
                action: "Normalisasi database sampai 3NF. Perbaiki relasi many-to-many pada tabel transaksi."
            },
            {
                summary: "Konsultasi desain antarmuka (UI Mockup) dan rancangan pengalaman pengguna (UX).",
                action: "Pastikan desain responsif untuk tampilan mobile. Gunakan palet warna yang konsisten sesuai identitas brand."
            },
            {
                summary: "Review progress koding bagian backend, integrasi API, dan autentikasi user.",
                action: "Gunakan JWT untuk keamanan API. Tambahkan validasi input di setiap endpoint."
            },
            {
                summary: "Implementasi fitur utama (core business logic) dan pengujian integrasi antar modul.",
                action: "Tambahkan fitur search dan filter pada tabel utama. Perbaiki bug pada proses logout."
            },
            {
                summary: "Pengujian internal fungsionalitas (Alpha Testing) dan penanganan bug minor di sisi frontend.",
                action: "Lakukan stress test sederhana pada server. Perbaiki tampilan loading state saat fetch data."
            },
            {
                summary: "Finalisasi Bab 1-3. Diskusi penulisan Bab 4 mengenai hasil implementasi.",
                action: "Tambahkan screenshot sistem yang representatif di Bab 4. Jelaskan batasan sistem yang ditemukan."
            },
            {
                summary: "Persiapan demo aplikasi akhir dan draf laporan (Bab 4 & 5). Review kesimpulan dan saran.",
                action: "Siapkan slide presentasi yang fokus pada masalah dan solusi. Rekam video demo sebagai backup."
            }
        ]
    },
    iot: {
        keywords: ["iot", "arduino", "esp32", "sensor", "hardware", "elektronik", "kontrol", "monitoring", "embedded", "lora", "zigbee"],
        steps: [
            {
                summary: "Penentuan komponen hardware (mikrokontroler & sensor) serta mekanisme catu daya.",
                action: "Cek ketersediaan sensor di pasaran. Pelajari datasheet sensor untuk kalibrasi."
            },
            {
                summary: "Diskusi perancangan skema rangkaian elektronik dan topologi jaringan komunikasi data.",
                action: "Gunakan software Fritz atau Proteus untuk simulasi rangkaian. Pertimbangkan penggunaan sleep mode."
            },
            {
                summary: "Review hasil pembacaan data sensor awal ke serial monitor and kalibrasi pembacaan.",
                action: "Lakukan pengambilan data di lingkungan kontrol. Buat kurva kalibrasi jika pembacaan tidak linear."
            },
            {
                summary: "Integrasi pengiriman data ke cloud/platform IoT melalui protokol MQTT atau HTTP.",
                action: "Atur interval pengiriman data agar tidak overload. Implementasi penanganan jika koneksi terputus."
            },
            {
                summary: "Optimasi konsumsi daya dan stabilitas fisik perangkat (casing & wiring).",
                action: "Solder kabel dengan rapi untuk menghindari noise. Gunakan battery management system (BMS)."
            },
            {
                summary: "Pengujian akurasi alat dengan membandingkan hasil sensor terhadap alat ukur standar.",
                action: "Hitung nilai error (RMSE/MAE) dari pembacaan sensor. Lakukan pengujian durasi baterai."
            },
            {
                summary: "Penyusunan metodologi di Bab 3 dan hasil pengujian hardware di Bab 4.",
                action: "Gambar skema rangkaian akhir dimasukkan ke lampiran. Jelaskan kendala hardware yang dihadapi."
            },
            {
                summary: "Finalisasi prototipe fisik. Review draf laporan akhir dan persiapan demonstrasi alat.",
                action: "Pastikan semua kabel terlindungi. Persiapkan skenario demo yang stabil."
            }
        ]
    },
    ai_ml: {
        keywords: ["ml", "machine learning", "ai", "klasifikasi", "prediksi", "deep learning", "cnn", "rnn", "lstm", "nlp", "clustering", "deteksi"],
        steps: [
            {
                summary: "Diskusi pemilihan dataset, eksplorasi data (EDA), dan teknik pra-pemrosesan data.",
                action: "Cek distribusi kelas pada dataset. Lakukan handling missing values dan outlier."
            },
            {
                summary: "Eksplorasi algoritma yang relevan dan penentuan metrik evaluasi yang akan digunakan.",
                action: "Gunakan algoritma baseline sebagai perbandingan. Pahami parameter utama tiap model."
            },
            {
                summary: "Evaluasi draf arsitektur model dan pembagian dataset (train-test split).",
                action: "Gunakan cross-validation untuk validasi lebih robust. Tentukan rasio split (misal 80:20)."
            },
            {
                summary: "Review hasil pelatihan model awal, analisis overfitting, dan hyperparameter tuning.",
                action: "Gunakan teknik regularization (dropout/batch norm) jika model overfit. Visualisasikan loss curve."
            },
            {
                summary: "Perbandingan performa model antar skenario atau dengan algoritma berbeda.",
                action: "Buat tabel perbandingan Accuracy, Precision, Recall, dan F1-Score."
            },
            {
                summary: "Analisis confusion matrix dan interpretasi hasil prediksi model pada data uji.",
                action: "Jelaskan mengapa model salah memprediksi pada kelas tertentu. Gunakan visualisasi misklasifikasi."
            },
            {
                summary: "Penyusunan pembahasan hasil penelitian di Bab 4 dan korelasi hasil dengan teori.",
                action: "Jelaskan faktor-faktor yang mempengaruhi performa model. Masukkan grafik evaluasi."
            },
            {
                summary: "Review kesimpulan, saran pengembangan model kedepan, dan finalisasi draf laporan.",
                action: "Sebutkan batasan dataset atau model. Pastikan semua sitasi referensi sudah benar."
            }
        ]
    },
    security: {
        keywords: ["keamanan", "security", "jaringan", "network", "kriptografi", "penetration", "cyber", "kerentanan", "firewall", "ids", "vpn"],
        steps: [
            {
                summary: "Identifikasi target uji, cakupan ancaman, dan metodologi pengujian keamanan.",
                action: "Tentukan environment pengujian (Blackbox/Whitebox). Pelajari framework NIST atau OWASP."
            },
            {
                summary: "Setup infrastruktur simulasi jaringan atau server (Sandboxing) dan konfigurasi tools pengujian.",
                action: "Gunakan Virtual Machine/Container yang terisolasi. Pastikan audit log setiap pengujian aktif."
            },
            {
                summary: "Pengujian tahap awal untuk pemetaan aset dan identifikasi celah keamanan (Vulnerability Assessment).",
                action: "Gunakan tools seperti Nmap atau Nessus. Dokumentasikan setiap open-port yang ditemukan."
            },
            {
                summary: "Implementasi mekanisme proteksi (Firewall/Enkripsi/IDS) pada sistem yang diuji.",
                action: "Konfigurasi rule set firewall yang ketat. Pilih algoritma enkripsi yang standar industri (AES-256)."
            },
            {
                summary: "Simulasi serangan untuk menguji efektivitas pertahanan yang telah dibangun.",
                action: "Ukur respons time sistem saat terjadi serangan. Cek efektivitas deteksi pada log IDS."
            },
            {
                summary: "Analisis dampak serangan terhadap performa dan integritas sistem (Post-Attack Analysis).",
                action: "Dokumentasikan data yang berhasil dicuri atau servis yang down. Berikan rekomendasi mitigasi."
            },
            {
                summary: "Penyusunan temuan teknis di Bab 4 dan analisis risiko menggunakan standar keamanan.",
                action: "Gunakan skoring CVSS untuk tiap kerentanan yang ditemukan. Buat topologi jaringan sebelum & sesudah fix."
            },
            {
                summary: "Review akhir draf laporan teknis dan penulisan kesimpulan mengenai postur keamanan sistem.",
                action: "Pastikan draf laporan tidak mengandung informasi sensitif. Siapkan ringkasan eksekutif."
            }
        ]
    },
    general: {
        keywords: [],
        steps: [
            {
                summary: "Diskusi lingkup penelitian, latar belakang masalah, dan rumusan masalah utama.",
                action: "Cari mininum 5 jurnal referensi dalam 5 tahun terakhir. Perjelas tujuan penelitian."
            },
            {
                summary: "Review studi literatur, tinjauan pustaka, dan draf landasan teori yang digunakan.",
                action: "Pastikan teori yang digunakan relevan dengan masalah. Tambahkan gap analysis."
            },
            {
                summary: "Konsultasi metodologi penelitian, alur pemikiran, dan teknik pengumpulan data.",
                action: "Gunakan diagram alur untuk menjelaskan tahapan penelitian. Tentukan instrumen uji."
            },
            {
                summary: "Review progress implementasi awal atau draf perancangan sistem/model.",
                action: "Dokumentasikan setiap hambatan teknis yang ditemukan. Buat jadwal mingguan (Sprint)."
            },
            {
                summary: "Eksperimen awal atau pengujian fungsionalitas utama dari objek penelitian.",
                action: "Pastikan data uji valid. Catat setiap anomali yang muncul selama proses eksperimen."
            },
            {
                summary: "Review draf laporan Bab 1 sampai Bab 3 secara menyeluruh.",
                action: "Perbaiki tata bahasa sesuai PUEBI. Cek konsistensi istilah teknis."
            },
            {
                summary: "Konsultasi analisis hasil penelitian dan pembahasan data mentah menjadi informasi.",
                action: "Gunakan tabel/grafik pembantu untuk memudahkan pembaca. Hubungkan dengan teori di Bab 2."
            },
            {
                summary: "Persiapan demo akhir dan draf laporan final. Review kesimpulan dan saran penelitian.",
                action: "Pastikan draf laporan sudah lengkap dari cover sampai lampiran. Siapkan diri untuk Q&A."
            }
        ]
    }
};

async function main() {
    console.log("🚀 Starting Realistic Guidance Update...");

    // Get all completed guidances grouped by thesis
    const theses = await prisma.thesis.findMany({
        where: {},
        include: {
            thesisGuidances: {
                where: { status: "completed" },
                orderBy: { requestedDate: "asc" }
            }
        }
    });

    console.log(`📊 Found ${theses.length} theses to process.`);

    let updatedCount = 0;

    for (const thesis of theses) {
        if (!thesis.thesisGuidances.length) continue;

        // 1. Determine the track based on title
        const title = (thesis.title || "").toLowerCase();
        let selectedTrack = TRACKS.general;

        for (const [key, track] of Object.entries(TRACKS)) {
            if (key === 'general') continue;
            if (track.keywords.some(keyword => title.includes(keyword))) {
                selectedTrack = track;
                break;
            }
        }

        console.log(`📝 Updating: "${thesis.title.substring(0, 50)}..." [Track: ${Object.keys(TRACKS).find(k => TRACKS[k] === selectedTrack)}]`);

        // 2. Update each guidance in this thesis
        const guidances = thesis.thesisGuidances;
        for (let i = 0; i < guidances.length; i++) {
            const guidance = guidances[i];
            const stepIndex = i % selectedTrack.steps.length;
            const step = selectedTrack.steps[stepIndex];

            // Add variety with cycle suffix if sessions exceed track steps
            const cycleSuffix = i >= selectedTrack.steps.length ? " (Lanjutan)" : "";

            await prisma.thesisGuidance.update({
                where: { id: guidance.id },
                data: {
                    sessionSummary: step.summary + cycleSuffix,
                    actionItems: step.action + cycleSuffix
                }
            });
            updatedCount++;
        }
    }

    console.log(`\n✨ Update complete! Total Guidance Records Updated: ${updatedCount}`);
}

main()
    .catch((e) => {
        console.error("❌ Error during update:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
