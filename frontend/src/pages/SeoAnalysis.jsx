import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils';

function ScoreRing({ score = 0, grade = 'F' }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? '#eab308' : pct >= 50 ? '#f97316' : '#ef4444';
  return (
    <div className="ats-score-ring" style={{ '--score-color': color, '--score-pct': pct }}>
      <div className="ats-score-inner">
        <strong>{score}</strong>
        <span>/ 100</span>
        <em>{grade}</em>
      </div>
    </div>
  );
}

function CategoryCard({ cat }) {
  return (
    <div className={`ats-category-card status-${cat.status}`}>
      <div className="ats-category-head">
        <strong>{cat.name}</strong>
        <span>{cat.score}/{cat.maxScore} · {cat.percent}%</span>
      </div>
      <div className="completeness-bar">
        <div className="completeness-fill" style={{ width: `${cat.percent}%` }} />
      </div>
      {cat.issues?.length > 0 && (
        <ul className="ats-issue-list">
          {cat.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      )}
      {cat.tips?.[0] && <p className="panel-note" style={{ marginTop: 8 }}>{cat.tips[0]}</p>}
    </div>
  );
}

export default function SeoAnalysis() {
  const { can } = useAuth();
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [url, setUrl] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [scanName, setScanName] = useState('');
  const [provider, setProvider] = useState('');
  const [aiProviders, setAiProviders] = useState([]);

  const loadHistory = () => {
    api.getSeoScans()
      .then(setHistory)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadHistory();
    api.getAiStatus()
      .then((data) => {
        setAiProviders(data.providers || []);
        if (data.defaultProvider || data.provider) {
          setProvider(data.defaultProvider || data.provider);
        }
      })
      .catch(() => {});
  }, []);

  const runScan = async (event) => {
    event.preventDefault();
    if (!url.trim()) {
      setError('Enter a website URL to analyze');
      return;
    }
    setScanning(true);
    setError('');
    setMessage('');
    setReport(null);
    try {
      const result = await api.scanSeo({
        targetUrl: url.trim(),
        targetKeyword,
        name: scanName,
        provider,
      });
      setReport(result.report);
      setMessage(result.message);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const viewScan = async (id) => {
    try {
      const scan = await api.getSeoScan(id);
      setReport({
        targetUrl: scan.targetUrl,
        finalUrl: scan.finalUrl,
        targetKeyword: scan.targetKeyword,
        overallScore: scan.overallScore,
        ruleScore: scan.ruleScore,
        aiScore: scan.aiScore,
        grade: scan.grade,
        seoRank: scan.seoRank,
        verdict: scan.verdict,
        categories: scan.categories,
        criticalIssues: scan.criticalIssues,
        recommendations: scan.recommendations,
        checks: scan.checks,
        robotsTxt: scan.robotsTxt,
        scanMode: scan.scanMode,
        aiAnalysis: scan.aiAnalysis,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteScan = async (id) => {
    if (!window.confirm('Delete this SEO scan?')) return;
    try {
      await api.deleteSeoScan(id);
      loadHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>SEO Analysis</h2>
          <p>Enter one URL for a complete deep SEO scan — accurate score, rank & category breakdown</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('seo:scan') && (
        <section className="panel">
          <h3>Scan URL</h3>
          <form onSubmit={runScan} className="form-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              Website URL
              <input
                required
                type="url"
                placeholder="https://example.com or example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              Target keyword (optional)
              <input
                placeholder="e.g. CRM software, web design Chennai"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
              />
            </label>
            <label>
              Scan name (optional)
              <input
                placeholder="My homepage audit"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
              />
            </label>
            {aiProviders.length > 0 && (
              <label>
                AI provider (deep scan)
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {aiProviders.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="modal-actions" style={{ gridColumn: '1 / -1', marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? 'Deep scanning...' : 'Run SEO deep scan'}
              </button>
            </div>
          </form>
        </section>
      )}

      {report && (
        <section className="panel ats-report-panel">
          <h3>Complete SEO Report</h3>
          <div className="ats-report-header">
            <ScoreRing score={report.overallScore} grade={report.grade} />
            <div className="ats-report-summary">
              <p><strong>SEO rank:</strong> <span className="original-badge">{report.seoRank}</span></p>
              <p><strong>Verdict:</strong> {report.verdict}</p>
              <p><strong>URL:</strong> <a href={report.finalUrl || report.targetUrl} target="_blank" rel="noreferrer">{report.finalUrl || report.targetUrl}</a></p>
              {report.targetKeyword && <p><strong>Keyword:</strong> {report.targetKeyword}</p>}
              <p><strong>Rule score:</strong> {report.ruleScore}% · <strong>AI score:</strong> {report.aiScore ?? 'N/A'} · <strong>Mode:</strong> {report.scanMode}</p>
              {report.checks?.latencyMs != null && (
                <p><strong>Response:</strong> {report.checks.latencyMs}ms · <strong>Size:</strong> {Math.round((report.checks.pageSizeBytes || 0) / 1024)} KB · <strong>Words:</strong> {report.checks.wordCount}</p>
              )}
            </div>
          </div>

          {report.checks && (
            <div className="lead-analysis-grid" style={{ marginBottom: 16 }}>
              <div className="lead-analysis-card">
                <span>Title</span>
                <strong style={{ fontSize: '0.9rem' }}>{report.checks.title || '—'}</strong>
              </div>
              <div className="lead-analysis-card">
                <span>Meta description</span>
                <strong style={{ fontSize: '0.85rem' }}>{report.checks.description?.slice(0, 80) || '—'}…</strong>
              </div>
              <div className="lead-analysis-card">
                <span>H1</span>
                <strong style={{ fontSize: '0.9rem' }}>{report.checks.h1Text || '—'}</strong>
              </div>
              <div className="lead-analysis-card">
                <span>Links</span>
                <strong>{report.checks.internalLinks} int · {report.checks.externalLinks} ext</strong>
              </div>
            </div>
          )}

          {report.criticalIssues?.length > 0 && (
            <div className="ats-block ats-critical">
              <h4>Critical issues</h4>
              <ul>{report.criticalIssues.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          <h4>Category breakdown (10 factors)</h4>
          <div className="ats-category-grid">
            {(report.categories || []).map((cat) => (
              <CategoryCard key={cat.id} cat={cat} />
            ))}
          </div>

          {report.robotsTxt && (
            <div className="ats-block">
              <h4>robots.txt</h4>
              <p className="panel-note">
                {report.robotsTxt.found
                  ? `Found · ${report.robotsTxt.allowsAll ? 'Allows crawlers' : 'May block crawlers'}${report.robotsTxt.sitemap ? ` · Sitemap: ${report.robotsTxt.sitemap}` : ''}`
                  : 'robots.txt not found or unreachable'}
              </p>
            </div>
          )}

          {report.aiAnalysis?.keywordAnalysis && (
            <div className="ats-block">
              <h4>AI keyword analysis</h4>
              <p>{report.aiAnalysis.keywordAnalysis}</p>
              {report.aiAnalysis.contentQuality && <p><strong>Content:</strong> {report.aiAnalysis.contentQuality}</p>}
              {report.aiAnalysis.competitiveNotes && <p><strong>Competitive:</strong> {report.aiAnalysis.competitiveNotes}</p>}
            </div>
          )}

          {report.recommendations?.length > 0 && (
            <div className="ats-block">
              <h4>Recommendations to improve rank</h4>
              <ol>{report.recommendations.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Scan history</h3>
        {history.length === 0 ? (
          <p className="empty-state">No scans yet. Enter a URL above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Rank</th>
                  <th>URL</th>
                  <th>Grade</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <span className="completeness-pill" data-level={row.overallScore >= 80 ? 'high' : row.overallScore >= 50 ? 'mid' : 'low'}>
                        {row.overallScore}%
                      </span>
                    </td>
                    <td><strong>{row.seoRank}</strong></td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.targetUrl}</td>
                    <td>{row.grade}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <button type="button" className="btn btn-secondary" onClick={() => viewScan(row._id)}>View</button>
                        {can('seo:scan') && (
                          <button type="button" className="btn btn-danger" onClick={() => deleteScan(row._id)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
