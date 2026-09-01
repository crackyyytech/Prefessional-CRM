import PDFDocument from 'pdfkit';
import { CAMPAIGN_PROFILES } from './phishingSimulator.js';

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

export function generatePhishingReportPdf(campaign, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const report = campaign.report || {};
      const profile = CAMPAIGN_PROFILES[campaign.campaignProfile] || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin CRM';
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `Phishing Simulation Report — ${campaign.name || campaign.targetDomain}`,
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
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#7c2d12').text('PHISHING SIMULATION REPORT', left + contentWidth * 0.42, 40, {
        width: contentWidth * 0.58,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(`Generated: ${formatDateTime(new Date())}`, left + contentWidth * 0.42, 58, {
        width: contentWidth * 0.58,
        align: 'right',
      });

      let y = 95;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
      y += 14;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(campaign.name || 'Phishing simulation', left, y);
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Target domain: ${campaign.targetDomain}`, left, y);
      y = doc.y + 4;
      doc.text(
        `Profile: ${campaign.godMode ? 'God Mode (AI Multi-Vector)' : (profile.label || campaign.campaignProfile)}  ·  Targets: ${report.targetsTotal ?? 0}`,
        left,
        y
      );
      y = doc.y + 14;

      const scoreColor = (report.riskScore ?? 0) >= 70 ? '#dc2626' : (report.riskScore ?? 0) >= 50 ? '#ca8a04' : '#16a34a';
      doc.roundedRect(left, y, contentWidth, 72, 6).fillAndStroke('#fff7ed', '#fdba74');
      doc.font('Helvetica-Bold').fontSize(28).fillColor(scoreColor)
        .text(`${report.riskScore ?? 0}/100`, left + 16, y + 12);
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827')
        .text(report.riskGrade || 'F', left + 120, y + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
        .text('Risk Score', left + 16, y + 46);
      doc.text(`Vulnerability: ${String(report.vulnerabilityLevel || 'low').toUpperCase()}`, left + 120, y + 46);
      y += 86;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Campaign metrics', left, y);
      y = doc.y + 8;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      [
        `Effectiveness: ${report.effectivenessScore ?? 0}%`,
        `Predicted open rate: ${report.predictedOpenRate ?? 0}%`,
        `Predicted click rate: ${report.predictedClickRate ?? 0}%`,
        `Predicted credential submit: ${report.predictedSubmitRate ?? 0}%`,
        `Emails sent (live): ${report.emailsSent ?? 0}`,
        `Templates generated: ${report.summary?.templatesGenerated ?? 0}`,
        `SPF: ${report.domainChecks?.hasSpf ? 'Yes' : 'No'}  ·  DMARC: ${report.domainChecks?.hasDmarc ? 'Yes' : 'No'}  ·  DKIM: ${report.domainChecks?.hasDkim ? 'Yes' : 'No'}`,
      ].forEach((line) => {
        doc.text(line, left, y);
        y = doc.y + 2;
      });
      y += 8;

      (report.findings || []).slice(0, 8).forEach((f) => {
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 40;
        }
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`[${f.severity?.toUpperCase()}] ${f.title}`, left, y);
        y = doc.y + 2;
        doc.font('Helvetica').fontSize(8).fillColor('#374151').text(f.detail, left, y, { width: contentWidth });
        y = doc.y + 8;
      });

      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
        .text(
          'Authorized phishing simulation for security awareness testing only.',
          left,
          doc.page.height - 50,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
