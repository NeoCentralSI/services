import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";

/**
 * List all internship proposals ready for Sekdep review.
 * @returns {Promise<Array>}
 */
export async function listProposals() {
    const proposals = await sekdepRepository.findProposalsReadyForSekdep();

    // Map to a consistent format for the frontend
    return proposals.map(proposal => {
        return {
            id: proposal.id,
            coordinatorName: proposal.coordinator?.user?.fullName || "Unknown",
            coordinatorNim: proposal.coordinator?.user?.identityNumber || "N/A",
            companyName: proposal.targetCompany?.companyName || "N/A",
            status: proposal.status,
            memberCount: proposal.members.length,
            createdAt: proposal.createdAt
        };
    });
}

/**
 * Get full detail of an internship proposal for Sekdep.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getProposalDetail(id) {
    const proposal = await sekdepRepository.findProposalDetail(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }
    return proposal;
}

/**
 * Get all companies with their proposal counts and intern stats.
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
 * Service to create a new company.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompany(data) {
    if (!data.companyName || !data.companyAddress) {
        const error = new Error("Nama dan alamat perusahaan wajib diisi.");
        error.statusCode = 400;
        throw error;
    }
    return sekdepRepository.createCompany(data);
}

/**
 * Service to update a company.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateCompany(id, data) {
    const company = await sekdepRepository.updateCompany(id, data);
    if (!company) {
        const error = new Error("Perusahaan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }
    return company;
}

/**
 * Service to delete a company.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function deleteCompany(id) {
    return sekdepRepository.deleteCompany(id);
}
