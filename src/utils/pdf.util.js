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
        console.error('Gotenberg PDF conversion failed:', error.response?.data?.toString() || error.message);
        throw new Error('Gagal mengonversi dokumen ke PDF melalui Gotenberg');
    }
}

/**
 * Converts HTML content to PDF using Gotenberg (Chromium module)
 * @param {string} html - The HTML content to convert
 * @returns {Promise<Buffer>} - The converted PDF as a buffer
 */
export async function convertHtmlToPdf(html) {
    try {
        const url = `${ENV.GOTENBERG_URL || 'http://localhost:3001'}/forms/chromium/convert/html`;

        const form = new FormData();
        form.append('files', Buffer.from(html), {
            filename: 'index.html',
            contentType: 'text/html'
        });

        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error('Gotenberg HTML to PDF conversion failed:', error.response?.data?.toString() || error.message);
        throw new Error('Gagal mengonversi HTML ke PDF melalui Gotenberg');
    }
}
