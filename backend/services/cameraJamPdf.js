import PDFDocument from 'pdfkit';
import { JAM_PROFILES } from './cameraJamRunner.js';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

export function generateCameraJamPdf(test, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const report = test.report || {};
      const profile = JAM_PROFILES[test.jamProfile] || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin CRM';
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = 40;
      const right = doc.page.width - 40;
      const w = right - left;

      doc.font('Helvetica-Bold').fontSize(16).text(companyName, left, 40, { width: w * 0.55 });
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#4338ca').text('CAMERA IP JAM REPORT', left + w * 0.45, 40, { width: w * 0.55, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor('#111827').text(`Generated: ${formatDateTime(new Date())}`, left + w * 0.45, 58, { width: w * 0.55, align: 'right' });

      let y = 95;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
      y += 14;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(test.name || 'Camera jam test', left, y);
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Target: ${test.targetHost}  ·  Profile: ${test.godMode ? 'God Mode' : (profile.label || test.jamProfile)}`, left, y);
      y = doc.y + 4;
      doc.text(`Duration: ${formatDuration(test.durationSeconds)}  ·  Workers: ${test.concurrency}  ·  Burst: ×${report.burstSize ?? '—'}`, left, y);
      y = doc.y + 14;

      doc.roundedRect(left, y, w, 70, 6).fillAndStroke('#eef2ff', '#a5b4fc');
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#4338ca').text(`${report.jamScore ?? 0}/100`, left + 16, y + 12);
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(report.jamGrade || 'F', left + 120, y + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text('Jam Score', left + 16, y + 46);
      const status = report.cameraDisrupted ? 'Camera DISRUPTED' : report.cameraDegraded ? 'Camera DEGRADED' : 'Camera held up';
      doc.text(status, left + 120, y + 46);
      y += 86;

      doc.font('Helvetica-Bold').fontSize(10).text('Packet metrics', left, y);
      y = doc.y + 8;
      doc.font('Helvetica').fontSize(9);
      [
        `Total packets: ${report.totalPackets ?? 0}`,
        `Packets/sec: ${report.packetsPerSecond ?? 0}`,
        `Peak packets/sec: ${report.peakPacketsPerSecond ?? 0}`,
        `Peak in-flight: ${report.peakInFlight ?? 0}`,
        `Ports targeted: ${(report.portsTargeted || []).join(', ')}`,
      ].forEach((line) => { doc.text(line, left, y); y = doc.y + 2; });

      const intel = test.cameraIntel;
      if (intel) {
        y += 10;
        if (y > doc.page.height - 180) { doc.addPage(); y = 40; }
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Pre-attack camera intel', left, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        const mfr = intel.manufacturer || {};
        doc.text(`Manufacturer: ${mfr.brand || 'Unknown'}${mfr.model ? ` · ${mfr.model}` : ''}  ·  Exposure: ${intel.exposureScore ?? 0}/100`, left, y);
        y = doc.y + 2;
        doc.text(`Open ports: ${(intel.openPorts || []).map((p) => p.port).join(', ') || 'none'}`, left, y);
        y = doc.y + 2;
        doc.text(`Recommended profile: ${intel.recommendedProfileLabel || intel.recommendedProfile || '—'}  ·  Burst ×${intel.recommendedBurst ?? '—'}`, left, y);
        y = doc.y + 2;
        if ((intel.attackVectors || []).length) {
          doc.text(`Attack vectors (${intel.attackVectors.length}):`, left, y);
          y = doc.y + 2;
          intel.attackVectors.slice(0, 8).forEach((v) => {
            doc.text(`  • [${v.priority}] ${v.type}: ${v.target}`, left, y);
            y = doc.y + 2;
          });
        }
      }

      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af').text(
        'Authorized camera resilience test only. Use on cameras you own or have permission to test.',
        left, doc.page.height - 50, { width: w, align: 'center' }
      );
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
