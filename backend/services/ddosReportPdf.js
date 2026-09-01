import PDFDocument from 'pdfkit';
import { ATTACK_PROFILES, GOD_MODE_BURST_SIZE } from './ddosRunner.js';

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

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

export function generateDdosReportPdf(test, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const report = test.report || {};
      const profile = ATTACK_PROFILES[test.attackProfile] || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin CRM';
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `DDoS Resilience Report — ${test.name || test.targetUrl}`,
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
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#dc2626').text('DDoS RESILIENCE REPORT', left + contentWidth * 0.45, 40, {
        width: contentWidth * 0.55,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(`Generated: ${formatDateTime(new Date())}`, left + contentWidth * 0.45, 58, {
        width: contentWidth * 0.55,
        align: 'right',
      });

      let y = 95;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
      y += 14;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(test.name || 'DDoS simulation', left, y);
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Target: ${test.targetUrl}`, left, y);
      y = doc.y + 4;
      doc.text(
        `Profile: ${test.godMode ? 'God Mode (AI Botnet)' : (profile.label || test.attackProfile)}  ·  Duration: ${formatDuration(test.durationSeconds)}  ·  Workers: ${test.concurrency}`,
        left,
        y
      );
      y = doc.y + 4;
      if (test.godMode || report.godMode) {
        doc.text(
          `God mode: ${report.effectiveConcurrency || test.concurrency} workers × ${report.burstSize || GOD_MODE_BURST_SIZE} burst · ${report.aiProviderChannels || '—'} AI botnet channels (${(report.aiProvidersUsed || []).join(', ') || 'merged'})`,
          left,
          y,
          { width: contentWidth }
        );
        y = doc.y + 4;
      }
      doc.text(`Run: ${formatDateTime(test.startedAt)} → ${formatDateTime(test.finishedAt)}`, left, y);
      y = doc.y + 14;

      const scoreColor = (report.resilienceScore ?? 0) >= 70 ? '#16a34a' : (report.resilienceScore ?? 0) >= 40 ? '#ca8a04' : '#dc2626';
      doc.roundedRect(left, y, contentWidth, 72, 6).fillAndStroke('#fef2f2', '#fecaca');
      doc.font('Helvetica-Bold').fontSize(28).fillColor(scoreColor)
        .text(`${report.resilienceScore ?? 0}/100`, left + 16, y + 12);
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827')
        .text(report.resilienceGrade || 'F', left + 120, y + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
        .text('Resilience Score', left + 16, y + 46);
      const statusLabel = report.siteDown ? 'Site appears DOWN' : report.siteDegraded ? 'Site DEGRADED' : 'Site held up';
      doc.text(statusLabel, left + 120, y + 46);
      y += 86;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Attack metrics', left, y);
      y = doc.y + 8;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      const metrics = [
        `Total requests: ${report.totalRequests ?? 0}`,
        `Success rate: ${report.successRate ?? 0}%`,
        `Error rate: ${report.errorRate ?? 0}%`,
        `Avg RPS: ${report.requestsPerSecond ?? 0}`,
        `Peak RPS: ${report.peakRequestsPerSecond ?? 0}`,
        `Peak error rate: ${report.peakErrorRate ?? 0}%`,
        `Avg latency: ${report.avgLatencyMs ?? 0} ms`,
        `P95 latency: ${report.p95LatencyMs ?? 0} ms`,
        `Burst size: ×${report.burstSize ?? profile.burstSize ?? 1}`,
      ];
      metrics.forEach((line) => {
        doc.text(line, left, y);
        y = doc.y + 2;
      });
      y += 8;

      const statusEntries = Object.entries(report.statusCodes || {});
      if (statusEntries.length) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('HTTP status breakdown', left, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        statusEntries.forEach(([code, count]) => {
          doc.text(`${code === 'ERR' ? 'Network error' : `HTTP ${code}`}: ${count}`, left, y);
          y = doc.y + 2;
        });
        y += 8;
      }

      const errorEntries = Object.entries(report.errorTypes || {});
      if (errorEntries.length) {
        if (y > doc.page.height - 100) {
          doc.addPage();
          y = 40;
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Error types', left, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        errorEntries.forEach(([err, count]) => {
          doc.text(`${err}: ${count}`, left, y);
          y = doc.y + 2;
        });
      }

      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
        .text(
          'This report is from an authorized DDoS resilience simulation. Use only on systems you own or have permission to test.',
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
