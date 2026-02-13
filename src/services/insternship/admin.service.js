import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as documentService from "../document.service.js";

/**
 * Get all internship proposals that need "Surat Pengantar" (Approved by Sekdep).
 * @returns {Promise<Array>}
 */
export async function getApprovedProposals() {
    const proposals = await adminRepository.findApprovedProposals();

    return proposals.map(p => {
        const latestLetter = p.applicationLetters?.[0] || null;

        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            companyAddress: p.targetCompany?.companyAddress || "—",
            members: [
                {
                    name: p.coordinator?.user?.fullName,
                    nim: p.coordinator?.user?.identityNumber,
                    isCoordinator: true
                },
                ...p.members.map(m => ({
                    name: m.student?.user?.fullName,
                    nim: m.student?.user?.identityNumber,
                    isCoordinator: false
                }))
            ],
            letterNumber: latestLetter?.documentNumber || "—",
            letterFile: latestLetter?.document ? {
                id: latestLetter.document.id,
                fileName: latestLetter.document.fileName,
                filePath: latestLetter.document.filePath
            } : null,
            // Assuming date range is in the application letter or proposal?
            // Re-checking schema: InternshipApplicationLetter has startDatePlanned and endDatePlanned
            period: latestLetter ? {
                start: latestLetter.startDatePlanned,
                end: latestLetter.endDatePlanned
            } : null,
            updatedAt: p.updatedAt
        };
    });
}

/**
 * Get all companies with their proposal counts and intern stats for Admin.
 * Reuses the repository logic from Sekdep.
 * @returns {Promise<Array>}
 */
export async function getCompaniesStats() {
    const companies = await sekdepRepository.findCompaniesWithStats();

    return companies.map(company => {
        // Count unique students who have an internship record with this company
        const internIds = company.internshipProposals.flatMap(p =>
            p.internships.map(i => i.studentId)
        );
        const uniqueInternCount = new Set(internIds).size;

        return {
            id: company.id,
            companyName: company.companyName,
            address: company.companyAddress,
            status: company.status,
            proposalCount: company._count?.internshipProposals || 0,
            internCount: uniqueInternCount
        };
    });
}

/**
 * Get detailed info of a proposal for SP management.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getProposalLetterDetail(id) {
    const p = await adminRepository.findProposalForLetter(id);
    if (!p) {
        const error = new Error("Pengajuan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const latestLetter = p.applicationLetters?.[0] || null;

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        companyName: p.targetCompany?.companyName || "—",
        companyAddress: p.targetCompany?.companyAddress || "—",
        members: [
            {
                name: p.coordinator?.user?.fullName,
                nim: p.coordinator?.user?.identityNumber,
                isCoordinator: true
            },
            ...p.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber,
                isCoordinator: false
            }))
        ],
        letterNumber: latestLetter?.documentNumber || "",
        period: latestLetter ? {
            start: latestLetter.startDatePlanned,
            end: latestLetter.endDatePlanned
        } : null
    };
}

/**
 * Save/update SP details for a proposal.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveApplicationLetter(id, data) {
    // 1. Save/Update stats
    const letter = await adminRepository.updateApplicationLetter(id, data);

    // 2. Fetch full data for document generation
    const proposal = await adminRepository.findProposalForLetter(id);

    // 3. Prepare data
    const genData = {
        documentNumber: data.documentNumber,
        dateIssued: letter.dateIssued || new Date(),
        companyName: proposal.targetCompany?.companyName || "Unknown Company",
        companyAddress: proposal.targetCompany?.companyAddress || "Unknown Address",
        startDate: data.startDatePlanned,
        endDate: data.endDatePlanned,
        coordinatorId: proposal.coordinatorId,
        members: [
            {
                name: proposal.coordinator?.user?.fullName,
                nim: proposal.coordinator?.user?.identityNumber
            },
            ...proposal.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber
            }))
        ]
    };

    // 4. Generate Document
    const documentId = await documentService.generateApplicationLetter(id, genData);

    // 5. Update letter with documentId
    await adminRepository.updateLetterDocumentId(letter.id, documentId);

    return letter;
}
