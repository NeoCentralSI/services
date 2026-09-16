const fs = require('fs');

const kpContent = fs.readFileSync('D:\\\\Tugas Akhir\\\\services-kp\\\\prisma\\\\schema.prisma', 'utf8');
let currContent = fs.readFileSync('D:\\\\Tugas Akhir\\\\services\\\\prisma\\\\schema.prisma', 'utf8');

function extractBlock(str, type, name) {
    const regex = new RegExp(type + '\\s+' + name + '\\s*\\{[\\s\\S]*?\\}', 'g');
    const matches = [...str.matchAll(regex)];
    return matches.length ? matches[0][0] : null;
}

const models = ['Company', 'InternshipProposal', 'InternshipSupervisorLetter', 'Internship', 'InternshipLogbook', 'InternshipGuidanceQuestion', 'InternshipGuidanceLecturerCriteria', 'InternshipGuidanceLecturerCriteriaOption', 'InternshipGuidanceSession', 'InternshipGuidanceStudentAnswer', 'InternshipGuidanceLecturerAnswer', 'InternshipSeminar', 'InternshipSeminarAudience', 'InternshipCpmk', 'InternshipAssessmentRubric', 'InternshipLecturerScore', 'InternshipFieldScore', 'FieldAssessmentToken', 'InternshipHoliday'];
const enums = ['CompanyStatus', 'InternshipProposalStatus', 'InternshipMemberStatus', 'InternshipCompanyResponseStatus', 'InternshipActiveStatus', 'InternshipGuidanceSessionStatus', 'InternshipGuidanceInputType', 'InternshipGuidanceEvaluation', 'InternshipSeminarStatus', 'InternshipSeminarAudienceStatus', 'InternshipAssessorType', 'InternshipAssessmentStatus', 'InternshipReportStatus', 'SupervisorLetterStatus', 'ReplacementRequestStatus', 'InternshipLogbookStatus'];

let successCount = 0;
let missingCurr = [];
let missingOld = [];

for (const m of models) {
    const oldBlock = extractBlock(kpContent, 'model', m);
    if (!oldBlock) {
        missingOld.push('model ' + m);
        continue;
    }
    const currBlock = extractBlock(currContent, 'model', m);
    if (currBlock) {
        currContent = currContent.replace(currBlock, oldBlock);
        successCount++;
    } else {
        missingCurr.push(m);
        // append before enums
        currContent = currContent.replace('// ==================== Internship Enums', oldBlock + '\n\n// ==================== Internship Enums');
    }
}

for (const e of enums) {
    const oldBlock = extractBlock(kpContent, 'enum', e);
    if (!oldBlock) {
        missingOld.push('enum ' + e);
        continue;
    }
    const currBlock = extractBlock(currContent, 'enum', e);
    if (currBlock) {
        currContent = currContent.replace(currBlock, oldBlock);
        successCount++;
    } else {
        missingCurr.push(e);
        currContent += '\n\n' + oldBlock;
    }
}

console.log('Successfully replaced/appended ' + successCount + ' blocks.');
if (missingOld.length) console.log('Missing in old:', missingOld);
if (missingCurr.length) console.log('Missing in curr (appended):', missingCurr);

fs.writeFileSync('D:\\\\Tugas Akhir\\\\services\\\\prisma\\\\schema.prisma', currContent);
