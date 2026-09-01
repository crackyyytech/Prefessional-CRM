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
  const statusLabel = {
    excellent: 'Excellent',
    good: 'Good',
    warning: 'Needs work',
    fail: 'Critical',
  }[cat.status] || cat.status;

  return (
    <div className={`ats-category-card status-${cat.status}`}>
      <div className="ats-category-head">
        <strong>{cat.name}</strong>
        <span>{cat.score}/{cat.maxScore} · {cat.percent}%</span>
      </div>
      <div className="completeness-bar">
        <div className="completeness-fill" style={{ width: `${cat.percent}%` }} />
      </div>
      <div className="panel-note">{statusLabel}</div>
      {cat.issues?.length > 0 && (
        <ul className="ats-issue-list">
          {cat.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      )}
      {cat.tips?.[0] && <p className="panel-note" style={{ marginTop: 8 }}>Tip: {cat.tips[0]}</p>}
    </div>
  );
}

export default function AtsScanner() {
  const { can } = useAuth();
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [file, setFile] = useState(null);
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [aiProviders, setAiProviders] = useState([]);

  const loadHistory = () => {
    api.getAtsScans()
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
    if (!file) {
      setError('Please upload your resume (PDF, DOCX, or TXT)');
      return;
    }
    setScanning(true);
    setError('');
    setMessage('');
    setReport(null);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('targetRole', targetRole);
      formData.append('jobDescription', jobDescription);
      if (provider) formData.append('provider', provider);

      const result = await api.scanResume(formData);
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
      const scan = await api.getAtsScan(id);
      setReport({
        overallScore: scan.overallScore,
        ruleScore: scan.ruleScore,
        aiScore: scan.aiScore,
        grade: scan.grade,
        verdict: scan.verdict,
        atsPassProbability: scan.atsPassProbability,
        fresherOrExperienced: scan.fresherOrExperienced,
        wordCount: scan.wordCount,
        categories: scan.categories,
        criticalIssues: scan.criticalIssues,
        recommendations: scan.recommendations,
        keywordsFound: scan.keywordsFound,
        keywordsMissing: scan.keywordsMissing,
        strengths: scan.strengths,
        scanMode: scan.scanMode,
        fileName: scan.fileName,
        targetRole: scan.targetRole,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteScan = async (id) => {
    if (!window.confirm('Delete this scan?')) return;
    try {
      await api.deleteAtsScan(id);
      loadHistory();
      if (report?.fileName) setReport(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>ATS Resume Scanner</h2>
          <p>Upload resume for strict deep ATS analysis — score, grade & complete category breakdown</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('ats:scan') && (
        <section className="panel">
          <h3>Upload & Scan</h3>
          <p className="panel-note">
            Strict mode: 50% rule engine + 50% AI deep audit. Supports PDF, DOCX, TXT.
            Add target role for keyword alignment scoring.
          </p>
          <form onSubmit={runScan} className="form-grid">
            <label
              className={`upload-dropzone${file ? ' has-file' : ''}`}
              style={{ gridColumn: '1 / -1' }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
              {file ? (
                <span><strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)</span>
              ) : (
                <span>Drop resume here or click to browse · PDF, DOCX, TXT</span>
              )}
            </label>
            <label>
              Target role (optional)
              <input
                placeholder="e.g. Software Developer, HR Executive"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
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
            <label style={{ gridColumn: '1 / -1' }}>
              Job description (optional — improves keyword match)
              <textarea
                rows={4}
                placeholder="Paste job description for strict keyword alignment..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </label>
            <div className="modal-actions" style={{ gridColumn: '1 / -1', marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={scanning || !file}>
                {scanning ? 'Deep scanning...' : 'Run strict ATS scan'}
              </button>
            </div>
          </form>
        </section>
      )}

      {report && (
        <section className="panel ats-report-panel">
          <h3>Complete ATS Analysis</h3>
          <div className="ats-report-header">
            <ScoreRing score={report.overallScore} grade={report.grade} />
            <div className="ats-report-summary">
              <p><strong>Verdict:</strong> {report.verdict}</p>
              <p><strong>ATS pass probability:</strong> {report.atsPassProbability}</p>
              <p><strong>Level:</strong> {report.fresherOrExperienced === 'fresher' ? 'Fresher profile' : report.fresherOrExperienced === 'experienced' ? 'Experienced profile' : '—'}</p>
              <p><strong>Rule score:</strong> {report.ruleScore}% · <strong>AI score:</strong> {report.aiScore ?? 'N/A'} · <strong>Words:</strong> {report.wordCount}</p>
              <p><strong>Scan mode:</strong> {report.scanMode}</p>
              {report.fileName && <p><strong>File:</strong> {report.fileName}{report.targetRole ? ` · Role: ${report.targetRole}` : ''}</p>}
            </div>
          </div>

          {report.strengths?.length > 0 && (
            <div className="ats-block">
              <h4>Strengths</h4>
              <ul>{report.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          {report.criticalIssues?.length > 0 && (
            <div className="ats-block ats-critical">
              <h4>Critical issues</h4>
              <ul>{report.criticalIssues.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          <h4>Category breakdown (strict)</h4>
          <div className="ats-category-grid">
            {(report.categories || []).map((cat) => (
              <CategoryCard key={cat.id} cat={cat} />
            ))}
          </div>

          <div className="panel-grid" style={{ marginTop: 16 }}>
            <section className="panel">
              <h4>Keywords found</h4>
              {(report.keywordsFound || []).length ? (
                <div className="chip-list">
                  {report.keywordsFound.map((k) => <span key={k} className="mini-chip">{k}</span>)}
                </div>
              ) : <p className="empty-state">None detected</p>}
            </section>
            <section className="panel">
              <h4>Keywords missing</h4>
              {(report.keywordsMissing || []).length ? (
                <div className="chip-list">
                  {report.keywordsMissing.map((k) => <span key={k} className="mini-chip" style={{ opacity: 0.85 }}>{k}</span>)}
                </div>
              ) : <p className="empty-state">None — good alignment</p>}
            </section>
          </div>

          {report.recommendations?.length > 0 && (
            <div className="ats-block">
              <h4>Recommendations to improve score</h4>
              <ol>{report.recommendations.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Scan history</h3>
        {history.length === 0 ? (
          <p className="empty-state">No scans yet. Upload your resume above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>File</th>
                  <th>Role</th>
                  <th>Grade</th>
                  <th>Level</th>
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
                    <td>{row.fileName}</td>
                    <td>{row.targetRole || '—'}</td>
                    <td><strong>{row.grade}</strong></td>
                    <td>{row.fresherOrExperienced || '—'}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <button type="button" className="btn btn-secondary" onClick={() => viewScan(row._id)}>View</button>
                        {can('ats:scan') && (
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
