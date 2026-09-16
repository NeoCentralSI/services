const fs = require('fs');
let text = fs.readFileSync('D:\\\\Tugas Akhir\\\\services\\\\prisma\\\\schema.prisma', 'utf8');

const lines = text.split('\n');
const newLines = lines.filter(l => !l.includes('internshipGuidanceSessions') && !l.includes('internshipReportFinalDocs'));

fs.writeFileSync('D:\\\\Tugas Akhir\\\\services\\\\prisma\\\\schema.prisma', newLines.join('\n'));
console.log('Removed offending lines');
