import express from "express";
import crypto from "crypto";
import { uploadThesisFile } from "../middlewares/file.middleware.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import prisma from "../config/prisma.js";
import fs from "fs";
import path from "path";

const router = express.Router();

/**
 * POST /documents/upload
 * Upload a document (PDF for thesis)
 */
router.post("/upload", authGuard, uploadThesisFile, async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const file = req.file;
    const { documentType } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "File tidak ditemukan",
      });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads", "thesis");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const fileExt = path.extname(file.originalname);
    const uniqueFileName = `${crypto.randomUUID()}${fileExt}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

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
        filePath: `/uploads/thesis/${uniqueFileName}`,
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
      message: "Dokumen berhasil diupload",
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
