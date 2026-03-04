import axios from 'axios';
import FormData from 'form-data';
import { ENV } from '../config/env.js';

/**
 * Converts a DOCX buffer to PDF using Gotenberg (LibreOffice module)
 * @param {Buffer} docxBuffer - The content of the DOCX file
 * @param {string} fileName - Original filename (optional)
 * @returns {Promise<Buffer>} - The converted PDF as a buffer
 */
export async function convertDocxToPdf(docxBuffer, fileName = 'document.docx') {
    try {
        const url = `${ENV.GOTENBERG_URL || 'http://localhost:3001'}/forms/libreoffice/convert`;

        const form = new FormData();
        form.append('files', docxBuffer, {
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(response.data);
    } catch (error) {
        const respBody = error.response?.data ? Buffer.from(error.response.data).toString('utf8').substring(0, 2000) : null;
        console.error('Gotenberg PDF conversion failed:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            body: respBody,
            message: error.message,
            code: error.code,
        });
        throw new Error('Gagal mengonversi dokumen ke PDF melalui Gotenberg');
    }
}
