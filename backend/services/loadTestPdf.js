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

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (m || rem) return `${h}h ${m}m ${rem}s`;
    return `${h}h`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimelineLabel(second, bucketSeconds = 1) {
  if (bucketSeconds >= 60) return formatDuration(second);
  return `${second}s`;
}

function drawSectionTitle(doc, left, y, title) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a5f').text(title, left, y);
  return doc.y + 8;
}

function drawTable(doc, left, right, y, columns, rows) {
  const tableWidth = right - left;
  const rowH = 20;
  const colWidths = columns.map((c) => c.width * tableWidth);

  doc.rect(left, y, tableWidth, rowH).fill('#1e3a5f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  let x = left;
  columns.forEach((col, i) => {
    doc.text(col.label, x + 6, y + 6, { width: colWidths[i] - 10, align: col.align || 'left' });
    x += colWidths[i];
  });
  y += rowH;

  doc.font('Helvetica').fontSize(8).fillColor('#111827');
  rows.forEach((row, index) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    const bg = index % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(left, y, tableWidth, rowH).fill(bg);
    x = left;
    row.forEach((cell, i) => {
      doc.fillColor('#111827').text(String(cell ?? ''), x + 6, y + 6, {
        width: colWidths[i] - 10,
        align: columns[i].align || 'left',
      });
      x += colWidths[i];
    });
    y += rowH;
  });

  return y + 10;
}

function drawMetricRow(doc, left, right, y, metrics) {
  const gap = 8;
  const colW = (right - left - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((m, i) => {
    const x = left + i * (colW + gap);
    doc.roundedRect(x, y, colW, 52, 4).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(m.label, x + 8, y + 10, { width: colW - 16 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(m.value, x + 8, y + 26, { width: colW - 16 });
  });
  return y + 62;
}

function formatMethodsLabel(test) {
  if (test.mixedMethods || test.method === 'MIXED') {
    const list = (test.methods || ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
    return `Mixed (${list})`;
  }
  return test.method || 'GET';
}

export function generateLoadTestPdf(test, company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const report = test.report || {};
      const companyName = company.companyLegalName || company.appName || 'Vistawin CRM';
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `Load Test Report — ${test.name || test._id}`,
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
      let y = doc.y + 4;
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
      [company.companyAddress, [company.companyPhone, company.companyEmail].filter(Boolean).join(' · ')]
        .filter(Boolean)
        .forEach((line) => {
          doc.text(line, left, y, { width: contentWidth * 0.55 });
          y = doc.y + 2;
        });

      doc.font('Helvetica-Bold').fontSize(16).fillColor('#1d4ed8').text('LOAD TEST REPORT', left + contentWidth * 0.52, 40, {
        width: contentWidth * 0.48,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      const metaTop = 62;
      doc.text(`Report ID: ${String(test._id).slice(-8).toUpperCase()}`, left + contentWidth * 0.52, metaTop, {
        width: contentWidth * 0.48,
        align: 'right',
      });
      doc.text(`Generated: ${formatDateTime(new Date())}`, left + contentWidth * 0.52, metaTop + 14, {
        width: contentWidth * 0.48,
        align: 'right',
      });
      doc.text(`Status: ${String(test.status || '—').toUpperCase()}`, left + contentWidth * 0.52, metaTop + 28, {
        width: contentWidth * 0.48,
        align: 'right',
      });

      y = Math.max(y, metaTop + 48) + 6;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').lineWidth(1).stroke();
      y += 14;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(test.name || 'Website load test', left, y);
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(`Target URL: ${test.targetUrl}`, left, y, { width: contentWidth });
      y = doc.y + 4;
      doc.text(
        `Methods: ${formatMethodsLabel(test)}  ·  Duration: ${formatDuration(test.durationSeconds)}  ·  Workers: ${test.concurrency}`,
        left,
        y
      );
      y = doc.y + 4;
      if (report.godMode) {
        doc.text(
          `GOD MODE: ${report.effectiveConcurrency || test.concurrency} workers · burst ×${report.burstSize || 5} · `
          + `${report.aiProviderChannels || 0} AI channels (${(report.aiProvidersUsed || []).join(', ')})`,
          left,
          y,
          { width: contentWidth }
        );
        y = doc.y + 4;
      } else {
        doc.text(`Concurrency: ${test.concurrency} users`, left, y);
        y = doc.y + 4;
      }
      doc.text(
        `Started: ${formatDateTime(test.startedAt)}  ·  Finished: ${formatDateTime(test.finishedAt)}`,
        left,
        y
      );
      if (test.createdBy?.name || test.createdBy?.email) {
        y = doc.y + 4;
        doc.text(`Run by: ${test.createdBy.name || test.createdBy.email}`, left, y);
      }
      y = doc.y + 14;

      y = drawSectionTitle(doc, left, y, 'Executive summary');
      y = drawMetricRow(doc, left, right, y, [
        { label: 'Total requests', value: String(report.totalRequests ?? 0) },
        { label: 'Success rate', value: `${report.successRate ?? 0}%` },
        { label: 'Requests / sec', value: String(report.requestsPerSecond ?? 0) },
        { label: 'Avg latency', value: `${report.avgLatencyMs ?? 0} ms` },
      ]);

      y = drawMetricRow(doc, left, right, y, [
        { label: 'P95 latency', value: `${report.p95LatencyMs ?? 0} ms` },
        { label: 'P99 latency', value: `${report.p99LatencyMs ?? 0} ms` },
        { label: 'Data transferred', value: formatBytes(report.bytesTransferred) },
        { label: 'Failed requests', value: String(report.failedRequests ?? 0) },
      ]);

      y = drawSectionTitle(doc, left, y, 'Latency breakdown');
      y = drawTable(doc, left, right, y, [
        { label: 'Metric', width: 0.34 },
        { label: 'Value (ms)', width: 0.33, align: 'right' },
        { label: 'Notes', width: 0.33 },
      ], [
        ['Minimum', String(report.minLatencyMs ?? 0), 'Fastest response'],
        ['Average', String(report.avgLatencyMs ?? 0), 'Mean response time'],
        ['P50 (median)', String(report.p50LatencyMs ?? 0), '50th percentile'],
        ['P95', String(report.p95LatencyMs ?? 0), '95th percentile'],
        ['P99', String(report.p99LatencyMs ?? 0), '99th percentile'],
        ['Maximum', String(report.maxLatencyMs ?? 0), 'Slowest response'],
      ]);

      const methodRows = Object.entries(report.methodCounts || {}).map(([method, count]) => [
        method,
        String(count),
        report.totalRequests
          ? `${Math.round((count / report.totalRequests) * 1000) / 10}%`
          : '0%',
      ]);
      if (methodRows.length) {
        y = drawSectionTitle(doc, left, y, 'HTTP method mix');
        y = drawTable(doc, left, right, y, [
          { label: 'Method', width: 0.34 },
          { label: 'Requests', width: 0.33, align: 'right' },
          { label: 'Share', width: 0.33, align: 'right' },
        ], methodRows);
      }

      const channelRows = Object.entries(report.channelCounts || {}).map(([channel, count]) => [
        channel,
        String(count),
        report.totalRequests
          ? `${Math.round((count / report.totalRequests) * 1000) / 10}%`
          : '0%',
      ]);
      if (channelRows.length) {
        y = drawSectionTitle(doc, left, y, 'AI provider channel streams');
        y = drawTable(doc, left, right, y, [
          { label: 'AI channel', width: 0.34 },
          { label: 'Packets', width: 0.33, align: 'right' },
          { label: 'Share', width: 0.33, align: 'right' },
        ], channelRows);
      }

      const statusRows = Object.entries(report.statusCodes || {}).map(([code, count]) => [
        code === 'ERR' ? 'Network / timeout' : `HTTP ${code}`,
        String(count),
        code === '200' || code === '201' ? 'Success' : code === 'ERR' ? 'Failed' : 'Response',
      ]);
      if (statusRows.length) {
        y = drawSectionTitle(doc, left, y, 'HTTP status distribution');
        y = drawTable(doc, left, right, y, [
          { label: 'Status', width: 0.4 },
          { label: 'Count', width: 0.3, align: 'right' },
          { label: 'Type', width: 0.3 },
        ], statusRows);
      }

      const errorRows = Object.entries(report.errors || {}).map(([msg, count]) => [msg, String(count)]);
      if (errorRows.length) {
        y = drawSectionTitle(doc, left, y, 'Errors');
        y = drawTable(doc, left, right, y, [
          { label: 'Error', width: 0.7 },
          { label: 'Count', width: 0.3, align: 'right' },
        ], errorRows);
      }

      const bucketSec = report.timelineBucketSeconds || 1;
      const timelineRows = (report.timeline || []).slice(0, 40).map((b) => [
        formatTimelineLabel(b.second, bucketSec),
        String(b.requests),
        String(b.errors),
        `${b.avgLatencyMs} ms`,
      ]);
      if (timelineRows.length) {
        y = drawSectionTitle(doc, left, y, `Traffic timeline (${bucketSec}s buckets)`);
        y = drawTable(doc, left, right, y, [
          { label: 'Time', width: 0.25 },
          { label: 'Requests', width: 0.25, align: 'right' },
          { label: 'Errors', width: 0.25, align: 'right' },
          { label: 'Avg latency', width: 0.25, align: 'right' },
        ], timelineRows);
        if ((report.timeline || []).length > 40) {
          doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(
            `Showing first 40 of ${report.timeline.length} timeline buckets.`,
            left,
            y
          );
          y = doc.y + 8;
        }
      }

      y = Math.max(y + 10, doc.page.height - 80);
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(
        'This report was generated by Vistawin CRM Load Testing. Use results to assess website performance under simulated traffic.',
        left,
        y,
        { width: contentWidth, align: 'center' }
      );
      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af').text(
        `${companyName} · ${test.targetUrl}`,
        left,
        doc.page.height - 30,
        { width: contentWidth, align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
