export function appendOfficialDocumentValidation(html, { qrDataUrl, verificationUrl }) {
  const validationBlock = `
  <section style="page-break-inside: avoid; margin: 18px auto 0; padding: 10px 12px; border: 1px solid #9ca3af; display: table; width: 100%; box-sizing: border-box; font-family: Arial, sans-serif; color: #111827;">
    <div style="display: table-cell; width: 78px; vertical-align: middle;">
      <img src="${qrDataUrl}" alt="QR validasi dokumen" style="display: block; width: 68px; height: 68px;" />
    </div>
    <div style="display: table-cell; vertical-align: middle; padding-left: 10px;">
      <div style="font-size: 10pt; font-weight: 700; margin-bottom: 3px;">Validasi Dokumen NeoCentral</div>
      <div style="font-size: 8.5pt; line-height: 1.35;">Dokumen ini diterbitkan secara elektronik oleh NeoCentral. Pindai QR untuk memeriksa status resmi dan keutuhan dokumen.</div>
      <div style="font-size: 7.5pt; line-height: 1.25; margin-top: 4px; overflow-wrap: anywhere;">${verificationUrl}</div>
    </div>
  </section>`;

  return html.includes("</body>")
    ? html.replace("</body>", `${validationBlock}\n</body>`)
    : `${html}${validationBlock}`;
}
