// Canonical internship route. File baru ini menggantikan ejaan typo
// `insternship.route.js`. Auto-loader di `app.js` me-mount kedua file di
// `/internship` (canonical) dan `/insternship` (BC alias) sehingga klien
// lama yang masih memakai endpoint typo tetap berjalan.
//
// Migrasi: frontend dipindahkan ke prefix `/internship` secara bertahap.
// Setelah seluruh konsumer berpindah, file typo dapat dihapus dan folder
// `insternship/` di-rename menjadi `internship/`.
import insternshipRouter from "./insternship.route.js";

export default insternshipRouter;
