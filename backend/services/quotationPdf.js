import PDFDocument from 'pdfkit';

function formatInr(value) {
  const n = Number(value) || 0;
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Professional software quotation PDF (A4).
 */
export function generateQuotationPdf(quotation, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `Quotation ${quotation.quoteNumber}`,
          Author: company.companyLegalName || company.appName || 'Vistawin',
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const left = 40;
      const right = pageWidth - 40;
      const contentWidth = right - left;
      const client = quotation.clientSnapshot || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin';

      // Header
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(companyName, left, 40, {
        width: contentWidth * 0.58,
      });
      let y = doc.y + 4;
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
      const companyLines = [
        company.companyAddress,
        [company.companyPhone, company.companyEmail].filter(Boolean).join('  ·  '),
        company.companyGstin ? `GSTIN: ${company.companyGstin}` : '',
      ].filter(Boolean);
      companyLines.forEach((line) => {
        doc.text(line, left, y, { width: contentWidth * 0.58 });
        y = doc.y + 2;
      });

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1d4ed8').text('QUOTATION', left + contentWidth * 0.55, 40, {
        width: contentWidth * 0.45,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      const metaTop = 62;
      doc.text(`Quote No: ${quotation.quoteNumber}`, left + contentWidth * 0.55, metaTop, {
        width: contentWidth * 0.45,
        align: 'right',
      });
      doc.text(`Date: ${formatDate(quotation.issueDate)}`, left + contentWidth * 0.55, metaTop + 14, {
        width: contentWidth * 0.45,
        align: 'right',
      });
      doc.text(`Valid Until: ${formatDate(quotation.validUntil)}`, left + contentWidth * 0.55, metaTop + 28, {
        width: contentWidth * 0.45,
        align: 'right',
      });
      if (quotation.placeOfSupply) {
        doc.text(`Place of Supply: ${quotation.placeOfSupply}`, left + contentWidth * 0.55, metaTop + 42, {
          width: contentWidth * 0.45,
          align: 'right',
        });
      }

      y = Math.max(y, metaTop + 60) + 8;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').lineWidth(1).stroke();
      y += 14;

      // Bill To
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Bill To', left, y);
      y = doc.y + 4;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      const billLines = [
        client.name,
        client.company,
        client.address,
        [client.phone, client.email].filter(Boolean).join('  ·  '),
        client.gstin ? `GSTIN: ${client.gstin}` : '',
      ].filter(Boolean);
      if (billLines.length === 0) {
        doc.text('—', left, y);
        y = doc.y + 2;
      } else {
        billLines.forEach((line) => {
          doc.text(line, left, y, { width: contentWidth * 0.55 });
          y = doc.y + 2;
        });
      }

      y += 10;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Project', left, y);
      y = doc.y + 4;
      doc.font('Helvetica-Bold').fontSize(11).text(quotation.projectTitle || 'Software Project', left, y, {
        width: contentWidth,
      });
      y = doc.y + 4;
      if (quotation.scopeSummary) {
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(quotation.scopeSummary, left, y, {
          width: contentWidth,
        });
        y = doc.y + 8;
      } else {
        y += 6;
      }

      // Table header
      const cols = {
        no: left,
        desc: left + 22,
        type: left + 210,
        hsn: left + 258,
        qty: left + 310,
        rate: left + 350,
        gst: left + 410,
        amt: left + 450,
      };
      const rowH = 18;

      doc.rect(left, y, contentWidth, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      const headerY = y + 7;
      doc.text('#', cols.no + 4, headerY, { width: 16 });
      doc.text('Description', cols.desc, headerY, { width: 180 });
      doc.text('Type', cols.type, headerY, { width: 44 });
      doc.text('HSN/SAC', cols.hsn, headerY, { width: 48 });
      doc.text('Qty', cols.qty, headerY, { width: 36, align: 'right' });
      doc.text('Rate', cols.rate, headerY, { width: 54, align: 'right' });
      doc.text('GST%', cols.gst, headerY, { width: 36, align: 'right' });
      doc.text('Amount', cols.amt, headerY, { width: right - cols.amt - 2, align: 'right' });
      y += 22;

      const items = Array.isArray(quotation.items) ? quotation.items : [];
      doc.font('Helvetica').fontSize(8).fillColor('#111827');

      items.forEach((item, index) => {
        if (y > doc.page.height - 160) {
          doc.addPage();
          y = 40;
        }
        const bg = index % 2 === 0 ? '#f8fafc' : '#ffffff';
        const desc = String(item.description || '');
        const descHeight = Math.max(rowH, doc.heightOfString(desc, { width: 180 }) + 8);
        doc.rect(left, y, contentWidth, descHeight).fill(bg);
        doc.fillColor('#111827');
        const textY = y + 5;
        doc.text(String(index + 1), cols.no + 4, textY, { width: 16 });
        doc.text(desc, cols.desc, textY, { width: 180 });
        doc.text(String(item.itemType || 'service'), cols.type, textY, { width: 44 });
        doc.text(String(item.hsnSac || ''), cols.hsn, textY, { width: 48 });
        doc.text(`${item.qty || 0} ${item.unit || ''}`, cols.qty, textY, { width: 36, align: 'right' });
        doc.text(money(item.rate), cols.rate, textY, { width: 54, align: 'right' });
        doc.text(String(item.gstPercent ?? 18), cols.gst, textY, { width: 36, align: 'right' });
        doc.text(money(item.amount), cols.amt, textY, { width: right - cols.amt - 2, align: 'right' });
        y += descHeight;
      });

      if (items.length === 0) {
        doc.rect(left, y, contentWidth, rowH).fill('#f8fafc');
        doc.fillColor('#6b7280').text('No line items', left + 8, y + 5);
        y += rowH;
      }

      y += 12;
      const totalsX = left + contentWidth * 0.55;
      const totalsW = contentWidth * 0.45;

      const drawTotalRow = (label, value, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111827');
        doc.text(label, totalsX, y, { width: totalsW * 0.45 });
        doc.text(formatInr(value), totalsX + totalsW * 0.45, y, { width: totalsW * 0.55, align: 'right' });
        y = doc.y + 4;
      };

      drawTotalRow('Taxable Amount', quotation.subtotal);
      if (quotation.taxMode === 'igst') {
        drawTotalRow('IGST', quotation.igstAmount);
      } else {
        drawTotalRow('CGST', quotation.cgstAmount);
        drawTotalRow('SGST', quotation.sgstAmount);
      }
      doc.moveTo(totalsX, y).lineTo(right, y).strokeColor('#9ca3af').lineWidth(0.8).stroke();
      y += 6;
      drawTotalRow('Grand Total', quotation.grandTotal, true);

      y += 12;
      if (y > doc.page.height - 180) {
        doc.addPage();
        y = 40;
      }

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Payment Terms', left, y);
      y = doc.y + 3;
      doc.font('Helvetica').fontSize(8).fillColor('#374151').text(quotation.paymentTerms || '—', left, y, {
        width: contentWidth,
      });
      y = doc.y + 10;

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Terms & Conditions', left, y);
      y = doc.y + 3;
      doc.font('Helvetica').fontSize(8).fillColor('#374151').text(quotation.termsAndConditions || '—', left, y, {
        width: contentWidth,
      });
      y = doc.y + 10;

      if (quotation.notes) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Notes', left, y);
        y = doc.y + 3;
        doc.font('Helvetica').fontSize(8).fillColor('#374151').text(quotation.notes, left, y, {
          width: contentWidth,
        });
        y = doc.y + 14;
      }

      y = Math.max(y + 20, doc.page.height - 90);
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
        .text('Authorized Signatory', right - 160, y, { width: 160, align: 'center' });
      doc.moveTo(right - 150, y - 4).lineTo(right - 10, y - 4).strokeColor('#9ca3af').stroke();
      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
        .text(`Generated by ${company.appName || 'CRM'} · ${quotation.quoteNumber}`, left, doc.page.height - 30, {
          width: contentWidth,
          align: 'center',
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
