import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils';

const EMPTY = {
  name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '',
  targetRole: '', jobDescription: '', summary: '',
  experience: [{ title: '', company: '', location: '', startDate: '', endDate: '', current: false, bullets: [''] }],
  education: [{ degree: '', institution: '', year: '', gpa: '' }],
  skills: { technical: [], soft: [] },
  projects: [{ name: '', description: '', technologies: '', link: '' }],
  certifications: [{ name: '', issuer: '', year: '' }],
};

function ScoreRing({ score = 0, grade = 'F' }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? '#eab308' : pct >= 50 ? '#f97316' : '#ef4444';
  return (
    <div className="ats-score-ring rb-score-ring" style={{ '--score-color': color, '--score-pct': pct }}>
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
    </div>
  );
}

function composePreview(data) {
  const lines = [];
  if (data.name) lines.push(data.name.toUpperCase());
  const contact = [data.email, data.phone, data.location, data.linkedin].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '));
  if (data.summary) lines.push('\nPROFESSIONAL SUMMARY\n' + data.summary);
  const exp = data.experience.filter((e) => e.title || e.company);
  if (exp.length) {
    lines.push('\nEXPERIENCE');
    exp.forEach((e) => {
      lines.push(`${[e.title, e.company].filter(Boolean).join(' — ')}${e.startDate ? ` (${e.startDate}${e.current ? '–Present' : e.endDate ? `–${e.endDate}` : ''})` : ''}`);
      e.bullets.filter(Boolean).forEach((b) => lines.push(`• ${b}`));
    });
  }
  if (data.skills.technical.length || data.skills.soft.length) {
    lines.push('\nSKILLS');
    if (data.skills.technical.length) lines.push(data.skills.technical.join(', '));
  }
  const edu = data.education.filter((e) => e.degree || e.institution);
  if (edu.length) {
    lines.push('\nEDUCATION');
    edu.forEach((e) => lines.push([e.degree, e.institution, e.year].filter(Boolean).join(' · ')));
  }
  return lines.join('\n');
}

function parseSkillsInput(value) {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function ResumeBuilder() {
  const { can } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [draftId, setDraftId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [optimizationNotes, setOptimizationNotes] = useState([]);
  const [keywordAdditions, setKeywordAdditions] = useState([]);
  const [scoreBefore, setScoreBefore] = useState(null);
  const [activeTab, setActiveTab] = useState('templates');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [provider, setProvider] = useState('');
  const [aiProviders, setAiProviders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateFilter, setTemplateFilter] = useState('All');

  const preview = useMemo(() => composePreview(data), [data]);
  const canBuild = can('resumebuilder:build');
  const templateCategories = useMemo(
    () => ['All', ...new Set(templates.map((t) => t.category))],
    [templates],
  );
  const filteredTemplates = templateFilter === 'All'
    ? templates
    : templates.filter((t) => t.category === templateFilter);

  const loadHistory = () => {
    api.getResumeDrafts().then(setHistory).catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadHistory();
    api.getResumeTemplates().then(setTemplates).catch(() => {});
    api.getAiStatus()
      .then((d) => {
        setAiProviders(d.providers || []);
        if (d.defaultProvider || d.provider) setProvider(d.defaultProvider || d.provider);
      })
      .catch(() => {});
  }, []);

  const patch = (key, value) => setData((prev) => ({ ...prev, [key]: value }));

  const patchExperience = (idx, key, value) => {
    setData((prev) => {
      const experience = [...prev.experience];
      experience[idx] = { ...experience[idx], [key]: value };
      return { ...prev, experience };
    });
  };

  const patchBullet = (expIdx, bulletIdx, value) => {
    setData((prev) => {
      const experience = [...prev.experience];
      const bullets = [...experience[expIdx].bullets];
      bullets[bulletIdx] = value;
      experience[expIdx] = { ...experience[expIdx], bullets };
      return { ...prev, experience };
    });
  };

  const addExperience = () => {
    setData((prev) => ({
      ...prev,
      experience: [...prev.experience, { title: '', company: '', location: '', startDate: '', endDate: '', current: false, bullets: [''] }],
    }));
  };

  const addBullet = (expIdx) => {
    setData((prev) => {
      const experience = [...prev.experience];
      experience[expIdx] = { ...experience[expIdx], bullets: [...experience[expIdx].bullets, ''] };
      return { ...prev, experience };
    });
  };

  const saveDraft = async () => {
    if (!canBuild) return;
    setBusy('save');
    setError('');
    try {
      const payload = { name: draftName || data.name || 'My Resume', resumeData: data };
      const result = draftId
        ? await api.updateResumeDraft(draftId, payload)
        : await api.createResumeDraft(payload);
      const draft = result.draft;
      setDraftId(draft._id);
      setDraftName(draft.name);
      setMessage(result.message || 'Draft saved');
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const runAnalyze = async () => {
    if (!canBuild) return;
    setBusy('analyze');
    setError('');
    setMessage('');
    try {
      const body = { resumeData: data, provider };
      const result = draftId
        ? await api.analyzeResumeDraftById(draftId, body)
        : await api.analyzeResumeDraft(body);
      setReport(result.report);
      setActiveTab('analysis');
      setMessage(result.message);
      if (result.draft) setDraftId(result.draft._id);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const runOptimize = async () => {
    if (!canBuild || !report) {
      setError('Run ATS analysis first before AI optimization.');
      return;
    }
    setBusy('optimize');
    setError('');
    try {
      const body = { resumeData: data, report, provider };
      const result = draftId
        ? await api.optimizeResumeDraftById(draftId, body)
        : await api.optimizeResumeDraft(body);
      setData(result.resumeData || result.draft?.resumeData || data);
      setReport(result.report);
      setOptimizationNotes(result.optimizationNotes || []);
      setKeywordAdditions(result.keywordAdditions || []);
      setScoreBefore(result.scoreBefore);
      setActiveTab('analysis');
      setMessage(result.message);
      if (result.draft) setDraftId(result.draft._id);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const loadDraft = async (id) => {
    try {
      const draft = await api.getResumeDraft(id);
      setData(draft.resumeData || EMPTY);
      setDraftId(draft._id);
      setDraftName(draft.name);
      setReport(draft.overallScore ? {
        overallScore: draft.overallScore,
        ruleScore: draft.ruleScore,
        aiScore: draft.aiScore,
        grade: draft.grade,
        verdict: draft.verdict,
        atsPassProbability: draft.atsPassProbability,
        fresherOrExperienced: draft.fresherOrExperienced,
        categories: draft.categories,
        criticalIssues: draft.criticalIssues,
        recommendations: draft.recommendations,
        keywordsFound: draft.keywordsFound,
        keywordsMissing: draft.keywordsMissing,
        strengths: draft.strengths,
        scanMode: draft.scanMode,
      } : null);
      setOptimizationNotes(draft.optimizationNotes || []);
      setKeywordAdditions(draft.keywordAdditions || []);
      setMessage(`Loaded "${draft.name}"`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteDraft = async (id) => {
    if (!window.confirm('Delete this resume draft?')) return;
    try {
      await api.deleteResumeDraft(id);
      if (draftId === id) {
        setDraftId(null);
        setDraftName('');
        setData(EMPTY);
        setReport(null);
      }
      loadHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([preview], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(data.name || 'resume').replace(/\s+/g, '_')}_ATS.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyTemplate = async (templateId) => {
    const hasContent = data.name || data.summary || data.experience.some((e) => e.title || e.company);
    if (hasContent && !window.confirm('Replace current resume with this template? Unsaved changes will be lost.')) {
      return;
    }
    try {
      const template = await api.getResumeTemplateById(templateId);
      setData(template.resumeData);
      setDraftId(null);
      setDraftName(`${template.name} — ${template.resumeData.name || 'Draft'}`);
      setSelectedTemplate(templateId);
      setReport(null);
      setOptimizationNotes([]);
      setKeywordAdditions([]);
      setScoreBefore(null);
      setActiveTab('build');
      setMessage(`Template loaded: ${template.name}. Customize your details and run ATS scan.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header rb-page-header">
        <div>
          <h2>Resume Builder</h2>
          <p>Build a professional ATS-optimized resume — deep analysis & AI optimization</p>
        </div>
        {canBuild && (
          <div className="rb-header-actions">
            <button type="button" className="btn btn-secondary" onClick={downloadTxt} disabled={!preview.trim()}>
              Export TXT
            </button>
            <button type="button" className="btn btn-secondary" onClick={saveDraft} disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="btn btn-primary" onClick={runAnalyze} disabled={busy === 'analyze'}>
              {busy === 'analyze' ? 'Analyzing…' : 'ATS deep scan'}
            </button>
            <button type="button" className="btn btn-primary rb-optimize-btn" onClick={runOptimize} disabled={busy === 'optimize' || !report}>
              {busy === 'optimize' ? 'Optimizing…' : 'AI optimize'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="rb-tabs">
        <button type="button" className={activeTab === 'templates' ? 'active' : ''} onClick={() => setActiveTab('templates')}>Templates</button>
        <button type="button" className={activeTab === 'build' ? 'active' : ''} onClick={() => setActiveTab('build')}>Build</button>
        <button type="button" className={activeTab === 'analysis' ? 'active' : ''} onClick={() => setActiveTab('analysis')}>
          Analysis {report ? `(${report.overallScore})` : ''}
        </button>
      </div>

      {activeTab === 'templates' && (
        <section className="panel rb-templates-panel">
          <div className="rb-templates-head">
            <div>
              <h3>Professional resume templates</h3>
              <p className="panel-note">Complete ATS-optimized templates — select one, customize, then run deep scan</p>
            </div>
            <div className="rb-template-filters">
              {templateCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={templateFilter === cat ? 'active' : ''}
                  onClick={() => setTemplateFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="rb-template-list-wrap">
            <table className="rb-template-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Category</th>
                  <th>Level</th>
                  <th>Description</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((tpl, index) => (
                  <tr
                    key={tpl.id}
                    className={selectedTemplate === tpl.id ? 'selected' : ''}
                    style={{ '--tpl-accent': tpl.accent }}
                  >
                    <td>
                      <div className="rb-template-list-name">
                        <span className="rb-template-list-icon" aria-hidden="true">{tpl.name.charAt(0)}</span>
                        <div>
                          <strong>{tpl.name}</strong>
                          <span className="rb-template-list-id">Template {index + 1}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="rb-template-list-badge">{tpl.category}</span>
                    </td>
                    <td>{tpl.level}</td>
                    <td className="rb-template-list-desc">{tpl.description}</td>
                    <td>
                      {canBuild ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => applyTemplate(tpl.id)}>
                          Use template
                        </button>
                      ) : (
                        <span className="panel-note">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTemplates.length === 0 && (
              <p className="empty-state">No templates in this category.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'build' && (
        <div className="rb-layout">
          <div className="rb-editor">
            <section className="panel rb-section">
              <h3>Target role & job</h3>
              <div className="form-grid">
                <label>
                  Draft name
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="My Software Engineer Resume" />
                </label>
                <label>
                  Target role
                  <input value={data.targetRole} onChange={(e) => patch('targetRole', e.target.value)} placeholder="Software Engineer, Digital Marketing…" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Job description (paste for keyword match)
                  <textarea rows={4} value={data.jobDescription} onChange={(e) => patch('jobDescription', e.target.value)} placeholder="Paste job posting for ATS keyword alignment…" />
                </label>
                {aiProviders.length > 0 && (
                  <label>
                    AI provider
                    <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                      {aiProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </section>

            <section className="panel rb-section">
              <h3>Contact & header</h3>
              <div className="form-grid">
                <label>Full name<input required value={data.name} onChange={(e) => patch('name', e.target.value)} /></label>
                <label>Email<input type="email" value={data.email} onChange={(e) => patch('email', e.target.value)} /></label>
                <label>Phone<input value={data.phone} onChange={(e) => patch('phone', e.target.value)} /></label>
                <label>Location<input value={data.location} onChange={(e) => patch('location', e.target.value)} placeholder="City, Country" /></label>
                <label>LinkedIn<input value={data.linkedin} onChange={(e) => patch('linkedin', e.target.value)} placeholder="linkedin.com/in/username" /></label>
                <label>GitHub / Portfolio<input value={data.github || data.portfolio} onChange={(e) => patch('github', e.target.value)} /></label>
              </div>
            </section>

            <section className="panel rb-section">
              <h3>Professional summary</h3>
              <textarea rows={4} value={data.summary} onChange={(e) => patch('summary', e.target.value)} placeholder="2–4 lines with role, years of experience, top skills, and value proposition…" />
            </section>

            <section className="panel rb-section">
              <div className="rb-section-head">
                <h3>Experience</h3>
                <button type="button" className="btn btn-secondary" onClick={addExperience}>+ Add role</button>
              </div>
              {data.experience.map((exp, i) => (
                <div key={i} className="rb-block">
                  <div className="form-grid">
                    <label>Job title<input value={exp.title} onChange={(e) => patchExperience(i, 'title', e.target.value)} /></label>
                    <label>Company<input value={exp.company} onChange={(e) => patchExperience(i, 'company', e.target.value)} /></label>
                    <label>Location<input value={exp.location} onChange={(e) => patchExperience(i, 'location', e.target.value)} /></label>
                    <label>Start<input value={exp.startDate} onChange={(e) => patchExperience(i, 'startDate', e.target.value)} placeholder="Jan 2022" /></label>
                    <label>End<input value={exp.endDate} onChange={(e) => patchExperience(i, 'endDate', e.target.value)} placeholder="Present" disabled={exp.current} /></label>
                    <label className="rb-check">
                      <input type="checkbox" checked={exp.current} onChange={(e) => patchExperience(i, 'current', e.target.checked)} />
                      Current role
                    </label>
                  </div>
                  <div className="rb-bullets">
                    <strong>Achievements (use action verbs + metrics)</strong>
                    {exp.bullets.map((b, bi) => (
                      <input key={bi} value={b} onChange={(e) => patchBullet(i, bi, e.target.value)} placeholder="Led team of 5, increased revenue 25%…" />
                    ))}
                    <button type="button" className="btn btn-secondary" onClick={() => addBullet(i)}>+ Bullet</button>
                  </div>
                </div>
              ))}
            </section>

            <section className="panel rb-section">
              <h3>Skills</h3>
              <div className="form-grid">
                <label>
                  Technical skills (comma-separated)
                  <input
                    value={data.skills.technical.join(', ')}
                    onChange={(e) => patch('skills', { ...data.skills, technical: parseSkillsInput(e.target.value) })}
                    placeholder="JavaScript, React, Node.js, SQL, AWS…"
                  />
                </label>
                <label>
                  Soft skills (comma-separated)
                  <input
                    value={data.skills.soft.join(', ')}
                    onChange={(e) => patch('skills', { ...data.skills, soft: parseSkillsInput(e.target.value) })}
                    placeholder="Leadership, Communication, Problem solving…"
                  />
                </label>
              </div>
            </section>

            <section className="panel rb-section">
              <h3>Education</h3>
              {data.education.map((edu, i) => (
                <div key={i} className="form-grid rb-block">
                  <label>Degree<input value={edu.degree} onChange={(e) => {
                    const education = [...data.education];
                    education[i] = { ...edu, degree: e.target.value };
                    patch('education', education);
                  }} placeholder="B.Tech Computer Science" /></label>
                  <label>Institution<input value={edu.institution} onChange={(e) => {
                    const education = [...data.education];
                    education[i] = { ...edu, institution: e.target.value };
                    patch('education', education);
                  }} /></label>
                  <label>Year<input value={edu.year} onChange={(e) => {
                    const education = [...data.education];
                    education[i] = { ...edu, year: e.target.value };
                    patch('education', education);
                  }} /></label>
                  <label>GPA (optional)<input value={edu.gpa} onChange={(e) => {
                    const education = [...data.education];
                    education[i] = { ...edu, gpa: e.target.value };
                    patch('education', education);
                  }} /></label>
                </div>
              ))}
            </section>
          </div>

          <aside className="rb-preview panel">
            <h3>Live ATS preview</h3>
            <p className="panel-note">Single-column plain text — safe for Workday, Taleo, Greenhouse</p>
            <pre className="rb-preview-text">{preview || 'Fill in your details to see preview…'}</pre>
            {report && (
              <div className="rb-preview-score">
                <span className="completeness-pill" data-level={report.overallScore >= 80 ? 'high' : report.overallScore >= 50 ? 'mid' : 'low'}>
                  ATS {report.overallScore}/100 · {report.grade}
                </span>
              </div>
            )}
          </aside>
        </div>
      )}

      {activeTab === 'analysis' && (
        <section className="panel ats-report-panel">
          {!report ? (
            <p className="empty-state">No analysis yet. Fill your resume and click <strong>ATS deep scan</strong>.</p>
          ) : (
            <>
              <div className="ats-report-header">
                <ScoreRing score={report.overallScore} grade={report.grade} />
                <div className="ats-report-summary">
                  <p><strong>Verdict:</strong> {report.verdict}</p>
                  <p><strong>ATS pass probability:</strong> {report.atsPassProbability}</p>
                  <p><strong>Profile:</strong> {report.fresherOrExperienced}</p>
                  <p><strong>Rule score:</strong> {report.ruleScore}% · <strong>AI score:</strong> {report.aiScore ?? 'N/A'} · <strong>Mode:</strong> {report.scanMode}</p>
                  {scoreBefore != null && report.overallScore > scoreBefore && (
                    <p className="rb-score-boost">Score improved: {scoreBefore} → {report.overallScore} (+{report.overallScore - scoreBefore})</p>
                  )}
                </div>
              </div>

              {report.criticalIssues?.length > 0 && (
                <div className="ats-block ats-critical">
                  <h4>Critical issues</h4>
                  <ul>{report.criticalIssues.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}

              {report.strengths?.length > 0 && (
                <div className="ats-block">
                  <h4>Strengths</h4>
                  <ul>{report.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}

              <h4>Category breakdown</h4>
              <div className="ats-category-grid">
                {(report.categories || []).map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
              </div>

              {report.keywordsMissing?.length > 0 && (
                <div className="ats-block">
                  <h4>Missing keywords</h4>
                  <div className="rb-keyword-chips">
                    {report.keywordsMissing.map((k) => <span key={k} className="rb-chip missing">{k}</span>)}
                  </div>
                </div>
              )}

              {report.recommendations?.length > 0 && (
                <div className="ats-block">
                  <h4>Recommendations</h4>
                  <ol>{report.recommendations.map((s) => <li key={s}>{s}</li>)}</ol>
                </div>
              )}

              {optimizationNotes.length > 0 && (
                <div className="ats-block rb-optimized-block">
                  <h4>AI optimization applied</h4>
                  <ul>{optimizationNotes.map((n) => <li key={n}>{n}</li>)}</ul>
                  {keywordAdditions.length > 0 && (
                    <div className="rb-keyword-chips">
                      {keywordAdditions.map((k) => <span key={k} className="rb-chip added">{k}</span>)}
                    </div>
                  )}
                </div>
              )}

              {canBuild && (
                <div className="modal-actions">
                  <button type="button" className="btn btn-primary rb-optimize-btn" onClick={runOptimize} disabled={busy === 'optimize'}>
                    {busy === 'optimize' ? 'Optimizing…' : 'Run AI optimization'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Saved drafts</h3>
        {history.length === 0 ? (
          <p className="empty-state">No saved drafts yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row._id}>
                    <td>
                      {row.overallScore ? (
                        <span className="completeness-pill" data-level={row.overallScore >= 80 ? 'high' : row.overallScore >= 50 ? 'mid' : 'low'}>
                          {row.overallScore}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>{row.name}</td>
                    <td>{row.targetRole || '—'}</td>
                    <td><span className="original-badge">{row.status}</span></td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>
                      <div className="actions">
                        <button type="button" className="btn btn-secondary" onClick={() => loadDraft(row._id)}>Open</button>
                        {canBuild && (
                          <button type="button" className="btn btn-danger" onClick={() => deleteDraft(row._id)}>Delete</button>
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
