import PDFDocument from 'pdfkit';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function severityColor(severity) {
  const map = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#2563eb',
    pass: '#16a34a',
    info: '#6b7280',
  };
  return map[severity] || '#6b7280';
}

export function generateSecurityReportPdf(scan, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const report = scan.report || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin CRM';
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `Security Report — ${scan.name || scan.targetUrl}`,
          Author: companyName,
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = 40;
      const right = doc.page.width - 40;
      const contentWidth = right - left;

      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(companyName, left, 40, {
        width: contentWidth * 0.55,
      });
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#7c3aed').text('SECURITY REPORT', left + contentWidth * 0.52, 40, {
        width: contentWidth * 0.48,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(`Generated: ${formatDateTime(new Date())}`, left + contentWidth * 0.52, 62, {
        width: contentWidth * 0.48,
        align: 'right',
      });

      let y = 100;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
      y += 16;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(scan.name || 'Website security scan', left, y);
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Target: ${scan.targetUrl}`, left, y);
      y = doc.y + 4;
      doc.text(`Scanned: ${formatDateTime(scan.finishedAt || scan.createdAt)}`, left, y);
      y = doc.y + 16;

      doc.roundedRect(left, y, contentWidth, 70, 6).fillAndStroke('#f5f3ff', '#c4b5fd');
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#7c3aed')
        .text(`${report.securityScore ?? 0}/100`, left + 16, y + 14);
      doc.font('Helvetica-Bold').fontSize(36).fillColor('#111827')
        .text(report.grade || 'F', left + 120, y + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
        .text('Security Score', left + 16, y + 48);
      doc.text(`HTTPS: ${report.httpsEnabled ? 'Yes' : 'No'}  ·  Status: ${report.responseStatus || '—'}  ·  ${report.responseTimeMs || 0} ms`, left + 120, y + 48);
      y += 86;

      const summary = report.summary || {};
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Finding summary', left, y);
      y = doc.y + 8;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(
        `Critical: ${summary.critical || 0}  ·  High: ${summary.high || 0}  ·  Medium: ${summary.medium || 0}  ·  Low: ${summary.low || 0}  ·  Pass: ${summary.pass || 0}`,
        left,
        y
      );
      y = doc.y + 14;

      if (report.tls?.valid || report.httpsEnabled) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('SSL / TLS', left, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        const tls = report.tls || {};
        doc.text(
          `Subject: ${tls.subject || '—'}  ·  Issuer: ${tls.issuer || '—'}  ·  Expires: ${tls.validTo || '—'} (${tls.daysUntilExpiry ?? '—'} days)`,
          left,
          y,
          { width: contentWidth }
        );
        y = doc.y + 12;
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Security headers', left, y);
      y = doc.y + 8;
      (report.headers || []).forEach((h) => {
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 40;
        }
        const icon = h.present ? '✓' : '✗';
        doc.font('Helvetica').fontSize(8).fillColor(h.present ? '#16a34a' : '#dc2626')
          .text(`${icon} ${h.name}`, left, y, { width: contentWidth * 0.45 });
        if (h.value) {
          doc.fillColor('#6b7280').text(h.value.slice(0, 80), left + contentWidth * 0.45, y, { width: contentWidth * 0.55 });
        }
        y = doc.y + 4;
      });
      y += 10;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Findings & recommendations', left, y);
      y = doc.y + 8;
      (report.findings || []).filter((f) => f.severity !== 'pass').slice(0, 25).forEach((f) => {
        if (y > doc.page.height - 70) {
          doc.addPage();
          y = 40;
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor(severityColor(f.severity))
          .text(`[${String(f.severity).toUpperCase()}] ${f.title}`, left, y, { width: contentWidth });
        y = doc.y + 2;
        if (f.detail) {
          doc.font('Helvetica').fontSize(8).fillColor('#374151').text(f.detail, left + 8, y, { width: contentWidth - 8 });
          y = doc.y + 2;
        }
        if (f.recommendation) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#6b7280')
            .text(`→ ${f.recommendation}`, left + 8, y, { width: contentWidth - 8 });
          y = doc.y + 2;
        }
        y += 4;
      });

      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
        .text(`${companyName} · Security Analytics · ${scan.targetUrl}`, left, doc.page.height - 30, {
          width: contentWidth,
          align: 'center',
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
