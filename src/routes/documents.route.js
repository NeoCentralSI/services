import express from "express";
import { uploadThesisFile } from "../middlewares/file.middleware.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import prisma from "../config/prisma.js";
import fs from "fs";
import path from "path";

const router = express.Router();

/**
 * POST /documents/upload
 * Upload a document
 * Query/Body params:
 *   - module: "thesis" (default) or "internship"
 *   - thesisId: optional (for thesis module)
 *   - documentType: name of the document type
 */
router.post("/upload", authGuard, uploadThesisFile, async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const file = req.file;
    const { documentType, thesisId, module = "thesis" } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "File tidak ditemukan",
      });
    }

    let uploadsDir;
    let relativeFilePath;
    let fileName;

    if (module === "internship") {
      // Logic for Internship Upload
      uploadsDir = path.join(process.cwd(), "uploads", "internship", userId);
      const uniqueId = Date.now().toString(36);
      fileName = `${uniqueId}-${file.originalname}`;
      relativeFilePath = `uploads/internship/${userId}/${fileName}`;
    } else {
      // Logic for Thesis Upload (Default)
      if (thesisId) {
        // If thesisId provided, verify it belongs to this user (student)
        const thesis = await prisma.thesis.findFirst({
          where: {
            id: thesisId,
            student: {
              id: userId,
            },
          },
        });

        if (!thesis) {
          return res.status(403).json({
            success: false,
            message: "Anda tidak memiliki akses ke thesis ini",
          });
        }

        // Save to /uploads/thesis/{thesisId}/ folder
        uploadsDir = path.join(process.cwd(), "uploads", "thesis", thesisId);
        fileName = "final-thesis.pdf"; // Fixed name for final thesis
        relativeFilePath = `uploads/thesis/${thesisId}/${fileName}`;
      } else {
        // Fallback: Get student's active thesis
        const student = await prisma.student.findFirst({
          where: { id: userId },
          include: {
            thesis: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (student?.thesis?.[0]) {
          const activeThesisId = student.thesis[0].id;
          uploadsDir = path.join(process.cwd(), "uploads", "thesis", activeThesisId);
          fileName = "final-thesis.pdf";
          relativeFilePath = `uploads/thesis/${activeThesisId}/${fileName}`;
        } else {
          // No thesis found, use generic path
          uploadsDir = path.join(process.cwd(), "uploads", "thesis", "general");
          const uniqueId = Date.now().toString(36);
          fileName = `${uniqueId}-${file.originalname}`;
          relativeFilePath = `uploads/thesis/general/${fileName}`;
        }
      }
    }

    // Create directory if not exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, fileName);

    // Delete old file if exists (for overwriting in thesis)
    if (module === 'thesis' && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Get or create document type
    let documentTypeRecord = null;
    if (documentType) {
      documentTypeRecord = await prisma.documentType.findFirst({
        where: { name: documentType },
      });

      if (!documentTypeRecord) {
        // Create if not exists
        documentTypeRecord = await prisma.documentType.create({
          data: { name: documentType },
        });
      }
    }

    // Save document record to database
    const document = await prisma.document.create({
      data: {
        userId,
        documentTypeId: documentTypeRecord?.id || null,
        fileName: file.originalname,
        filePath: relativeFilePath,
      },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        createdAt: true,
        documentType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Dokumen berhasil diupload ke module ${module}`,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /documents/:id
 * Get document by ID
 */
router.get("/:id", authGuard, async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        createdAt: true,
        updatedAt: true,
        documentType: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
