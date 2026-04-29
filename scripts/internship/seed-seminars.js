import pkg from '../src/generated/prisma/index.js';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
    console.log("Mulai melakukan seeding data InternshipSeminar...");

    // Cari minimal 5 data Kerja Praktik (Internship) yang sedang AKTIF/COMPLETED
    // Kita gunakan ini sebagai data parent untuk seminar
    const internships = await prisma.internship.findMany({
        where: {
            // Bisa disesuaikan jika ingin mengutamakan status tertentu
            status: { in: ['ONGOING', 'COMPLETED'] }
        },
        take: 5,
        include: {
            supervisor: {
                include: { user: true }
            }
        }
    });

    if (internships.length === 0) {
        console.log("Tidak ada data Internship (KP) aktif yang ditemukan. Buat data KP terlebih dahulu.");
        return;
    }

    // Cari minimal 1 Ruangan untuk dialokasikan
    const room = await prisma.room.findFirst();
    if (!room) {
        console.log("Belum ada data Room. Tolong buat data Ruangan (Room) terlebih dahulu.");
        return;
    }

    // Cari beberapa mahasiswa untuk dijadikan moderator
    // (diambil yang bukan mahasiswa KP yang sedang iterasi nanti)
    const allStudents = await prisma.student.findMany({
        take: 10
    });
    
    if (allStudents.length === 0) {
        console.log("Belum ada data Student untuk dijadikan moderator.");
        return;
    }

    const statuses = ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'];
    let count = 0;

    for (let i = 0; i < internships.length; i++) {
        const internship = internships[i];
        
        // Pilih moderator (mahasiswa lain jika ada, atau fallback diri sendiri)
        const moderator = allStudents.find(s => s.id !== internship.studentId) || allStudents[0];
        
        // Buat variasi tanggal seminar (mulai dari besok hingga beberapa hari ke depan)
        const seminarDate = new Date();
        seminarDate.setDate(seminarDate.getDate() + (i * 2) + 1); 
        
        // Set waktu mulai jam 09:00 dan selesai jam 11:00
        const startTime = new Date(seminarDate);
        startTime.setHours(9, 0, 0, 0);
        
        const endTime = new Date(seminarDate);
        endTime.setHours(11, 0, 0, 0);

        // Pilih status secara round-robin atau bervariasi
        const status = statuses[i % statuses.length];

        const data = {
            internshipId: internship.id,
            roomId: room.id,
            seminarDate: seminarDate,
            startTime: startTime,
            endTime: endTime,
            linkMeeting: `https://meet.google.com/abc-xyz-${i}`,
            moderatorStudentId: moderator.id,
            status: status,
        };

        // Jika status disetujui, tambahkan approvedBy dan catatannya
        if (status === 'APPROVED' || status === 'COMPLETED') {
            data.approvedBy = internship.supervisor?.user?.id || null;
            data.supervisorNotes = "Silakan persiapkan presentasi dengan matang.";
        }

        if (status === 'REJECTED') {
            data.supervisorNotes = "Tanggal kurang pas karena saya ada rapat prodi, mohon reschedule di akhir bulan.";
        }

        try {
            await prisma.internshipSeminar.create({
                data: data
            });
            count++;
            console.log(`- Berhasil membuat seminar status ${status} untuk Internship ID: ${internship.id}`);
        } catch (err) {
            console.error(`Gagal membuat seminar untuk Internship ID ${internship.id} :`, err.message);
        }
    }

    console.log(`Selesai! ${count} data jadwal seminar berhasil diinjeksi.`);
}

main()
    .catch((e) => {
        console.error("Terjadi error saat seeder:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
