import fs from "fs/promises";
import path from "path";
import prisma from "../config/prisma.js";

const SOP_ROOT = path.join(process.cwd(), "uploads", "sop");

const GUIDE_TYPES = {
    // SOPs (Publicly shown on landing)
    SOP_TA: "SOP Tugas Akhir",
    SOP_KP: "SOP Kerja Praktik",
    SOP_UMUM: "SOP Umum",
    // Templates (Only shown in dashboard)
    TEMPLATE_TA: "Template Tugas Akhir",
    TEMPLATE_KP: "Template Kerja Praktik",
    TEMPLATE_UMUM: "Template Umum",
};

/**
 * Static filename mapping for template types.
 * When uploading a template of this type, the file is saved with
 * a fixed name so that the generate feature can always find it.
 * Re-uploading the same type overwrites the file and updates the DB record.
 */
const TEMPLATE_STATIC_FILES = {
    TEMPLATE_TA: "logcatatantemplate.docx",
};

async function ensureDir() {
    await fs.mkdir(SOP_ROOT, { recursive: true });
}

/**
 * List all guide documents (SOPs & Templates)
 */
export async function listSop(category) {
    const where = {};

    // category could be 'SOP' or 'TEMPLATE'
    if (category) {
        where.documentType = {
            name: {
                startsWith: category === 'SOP' ? 'SOP' : 'Template'
            }
        };
    } else {
        where.documentType = {
            name: {
                in: Object.values(GUIDE_TYPES)
            }
        };
    }

    const documents = await prisma.document.findMany({
        where,
        include: {
            documentType: true,
            user: {
                select: {
                    fullName: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return documents.map(doc => ({
        id: doc.id,
        title: doc.fileName, // Using filename as title for now if not tracked separately, but we could use doc.fileName or a dedicated field
        type: Object.keys(GUIDE_TYPES).find(key => GUIDE_TYPES[key] === doc.documentType?.name) || 'SOP_TA',
        typeName: doc.documentType?.name,
        fileName: doc.fileName,
        url: `/${doc.filePath}`,
        size: 0,
        updatedAt: doc.updatedAt.toISOString(),
        uploadedBy: doc.user?.fullName
    }));
}

export async function listSopPublic() {
    const publicTypes = [
        GUIDE_TYPES.SOP_TA,
        GUIDE_TYPES.SOP_KP,
        GUIDE_TYPES.TEMPLATE_TA,
        GUIDE_TYPES.TEMPLATE_KP
    ];
    const documents = await prisma.document.findMany({
        where: {
            documentType: {
                name: { in: publicTypes }
            }
        },
        include: {
            documentType: true
        }
    });

    return documents.map(doc => ({
        id: doc.id,
        type: Object.keys(GUIDE_TYPES).find(key => GUIDE_TYPES[key] === doc.documentType?.name),
        fileName: doc.fileName,
        url: `/${doc.filePath}`,
        updatedAt: doc.updatedAt.toISOString(),
    }));
}

/**
 * Save/Upload a new Guide document
 * For template types with a static filename mapping, the file is saved
 * with a fixed name and any existing document of the same type is updated
 * (file overwritten on disk, DB record reused).
 */
export async function saveSop({ type, buffer, originalName, mimeType, size, userId, title }) {
    const typeName = GUIDE_TYPES[type] || GUIDE_TYPES.SOP_TA;

    await ensureDir();

    // Get or create document type
    let docType = await prisma.documentType.findFirst({
        where: { name: typeName }
    });

    if (!docType) {
        docType = await prisma.documentType.create({
            data: { name: typeName }
        });
    }

    const staticFile = TEMPLATE_STATIC_FILES[type];

    if (staticFile) {
        // --- Static filename: overwrite existing ---
        const fileName = staticFile;
        const relativePath = `uploads/sop/${fileName}`;
        const fullPath = path.join(SOP_ROOT, fileName);

        // Write (overwrite) file on disk
        await fs.writeFile(fullPath, buffer);

        // Check if a Document record for this type already exists
        const existing = await prisma.document.findFirst({
            where: { documentTypeId: docType.id, filePath: relativePath },
            include: { documentType: true },
        });

        if (existing) {
            // Update existing record
            const updated = await prisma.document.update({
                where: { id: existing.id },
                data: {
                    userId,
                    fileName: title || originalName,
                    updatedAt: new Date(),
                },
                include: { documentType: true },
            });
            return {
                id: updated.id, type, typeName: updated.documentType?.name,
                fileName: updated.fileName, url: `/${updated.filePath}`,
                updatedAt: updated.updatedAt.toISOString(),
            };
        }

        // First upload — create record
        const document = await prisma.document.create({
            data: {
                userId,
                documentTypeId: docType.id,
                fileName: title || originalName,
                filePath: relativePath,
            },
            include: { documentType: true },
        });
        return {
            id: document.id, type, typeName: document.documentType?.name,
            fileName: document.fileName, url: `/${document.filePath}`,
            updatedAt: document.updatedAt.toISOString(),
        };
    }

    // --- Dynamic filename (original behaviour for SOPs) ---
    const uniqueId = Date.now().toString(36);
    const dynamicFileName = `${uniqueId}-${originalName}`;
    const relativePath = `uploads/sop/${dynamicFileName}`;
    const fullPath = path.join(SOP_ROOT, dynamicFileName);

    await fs.writeFile(fullPath, buffer);

    const document = await prisma.document.create({
        data: {
            userId,
            documentTypeId: docType.id,
            fileName: title || originalName,
            filePath: relativePath,
        },
        include: {
            documentType: true
        }
    });

    return {
        id: document.id,
        type: type,
        typeName: document.documentType?.name,
        fileName: document.fileName,
        url: `/${document.filePath}`,
        updatedAt: document.updatedAt.toISOString(),
    };
}

/**
 * Delete an SOP document
 */
export async function deleteSop(id) {
    const document = await prisma.document.findUnique({
        where: { id }
    });

    if (!document) {
        const err = new Error("Dokumen tidak ditemukan");
        err.statusCode = 404;
        throw err;
    }

    // Delete from DB
    await prisma.document.delete({
        where: { id }
    });

    // Delete from disk
    try {
        const fullPath = path.join(process.cwd(), document.filePath);
        await fs.unlink(fullPath);
    } catch (err) {
        console.error(`Failed to delete file from disk: ${document.filePath}`, err);
    }

    return { success: true };
}

/**
 * Update SOP document metadata (Title and Type)
 */
export async function updateSop(id, { type, title }) {
    const document = await prisma.document.findUnique({
        where: { id }
    });

    if (!document) {
        const err = new Error("Dokumen tidak ditemukan");
        err.statusCode = 404;
        throw err;
    }

    const typeName = GUIDE_TYPES[type] || GUIDE_TYPES.SOP_TA;

    // Get or create document type
    let docType = await prisma.documentType.findFirst({
        where: { name: typeName }
    });

    if (!docType) {
        docType = await prisma.documentType.create({
            data: { name: typeName }
        });
    }

    const updatedDocument = await prisma.document.update({
        where: { id },
        data: {
            fileName: title || document.fileName,
            documentTypeId: docType.id
        },
        include: {
            documentType: true
        }
    });

    return {
        id: updatedDocument.id,
        type: type,
        typeName: updatedDocument.documentType?.name,
        fileName: updatedDocument.fileName,
        url: `/${updatedDocument.filePath}`,
        updatedAt: updatedDocument.updatedAt.toISOString(),
    };
}

export async function getSop(type) {
    return listSop(type);
}
