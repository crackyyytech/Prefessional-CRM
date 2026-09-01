import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, titleCase } from '../utils';

function completenessLevel(pct = 0) {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
}

function CompletenessBar({ value = 0 }) {
  return (
    <div className="completeness-bar" title={`${value}% complete`}>
      <div className="completeness-fill" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function ExpBadge({ level }) {
  const label = level === 'fresher' ? 'Fresher' : level === 'experienced' ? 'Experienced' : 'Fresher / Experienced';
  const cls = level === 'fresher' ? 'badge-website' : level === 'experienced' ? 'badge-application' : 'badge-software';
  return <span className={`score-pill ${cls}`} style={{ fontSize: '0.78rem' }}>{label}</span>;
}

export default function FindJobs() {
  const { can } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [expFilter, setExpFilter] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [minCompleteness, setMinCompleteness] = useState(70);
  const [detailJob, setDetailJob] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState({
    location: '',
    role: '',
    experienceLevel: 'all',
    jobType: '',
    count: 10,
    provider: '',
    verifiedOnly: true,
    minCompleteness: 70,
  });
  const [aiProviders, setAiProviders] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState({});
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disclaimer, setDisclaimer] = useState('');

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (expFilter) params.set('experienceLevel', expFilter);
      if (verifiedOnly) params.set('verifiedOnly', 'true');
      if (minCompleteness > 0) params.set('minCompleteness', String(minCompleteness));
      const qs = params.toString() ? `?${params}` : '';
      const [jobsData, analysisData, statsData] = await Promise.all([
        api.getJobs(qs),
        api.getJobAnalysis(),
        api.getJobStats(),
      ]);
      setJobs(jobsData);
      setAnalysis(analysisData);
      setStats(statsData);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [expFilter, verifiedOnly, minCompleteness]);

  useEffect(() => {
    if (!can('ai:chat')) return;
    api.getAiStatus()
      .then((data) => {
        setAiProviders(data.providers || []);
        if (data.defaultProvider || data.provider) {
          setSearch((prev) => ({ ...prev, provider: data.defaultProvider || data.provider }));
        }
      })
      .catch(() => {});
  }, [can]);

  const findJobs = async (event) => {
    event.preventDefault();
    if (!search.location.trim() && !search.role.trim()) {
      setError('Enter a location or job role');
      return;
    }
    setSearching(true);
    setError('');
    setMessage('');
    try {
      const data = await api.findJobs(search);
      setSearchResults(data.results || []);
      setDisclaimer(data.disclaimer || '');
      const sel = {};
      (data.results || []).forEach((item) => { sel[item.id] = true; });
      setSelected(sel);
      setMessage(`Found ${data.totalQualified ?? data.results?.length ?? 0} job(s) with full analysis`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const saveSelected = async () => {
    const picked = searchResults.filter((item) => selected[item.id]);
    if (!picked.length) {
      setError('Select at least one job to save');
      return;
    }
    setSaving(true);
    try {
      const result = await api.saveJobs({
        jobs: picked,
        searchQuery: `${search.role} ${search.location}`.trim(),
        verifiedOnly: search.verifiedOnly,
        minCompleteness: search.minCompleteness,
      });
      setMessage(`${result.message}${result.skipped ? `, skipped ${result.skipped}` : ''}`);
      setSearchResults([]);
      setSelected({});
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteJob = async (id) => {
    if (!window.confirm('Delete this saved job?')) return;
    try {
      await api.deleteJob(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (expFilter) params.set('experienceLevel', expFilter);
      if (verifiedOnly) params.set('verifiedOnly', 'true');
      if (minCompleteness > 0) params.set('minCompleteness', String(minCompleteness));
      const qs = params.toString() ? `?${params}` : '';
      const blob = await api.exportJobs(qs);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `jobs-alignment-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${jobs.length} job(s) for alignment`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Find Jobs</h2>
          <p>AI job search with role, requirements, contact details, website & fresher/experienced analysis</p>
        </div>
        <div className="actions">
          {can('jobs:view') && (
            <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting || jobs.length === 0}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {analysis && (
        <section className="panel">
          <h3>Job Analysis</h3>
          <div className="lead-analysis-grid">
            <div className="lead-analysis-card">
              <span>Avg completeness</span>
              <strong>{analysis.averageCompleteness}%</strong>
              <CompletenessBar value={analysis.averageCompleteness} />
            </div>
            <div className="lead-analysis-card">
              <span>100% complete</span>
              <strong>{analysis.complete100Count}</strong>
            </div>
            <div className="lead-analysis-card">
              <span>Fresher jobs</span>
              <strong>{analysis.fresherCount}</strong>
            </div>
            <div className="lead-analysis-card">
              <span>Experienced jobs</span>
              <strong>{analysis.experiencedCount}</strong>
            </div>
            <div className="lead-analysis-card">
              <span>Saved jobs</span>
              <strong>{analysis.total}</strong>
            </div>
          </div>
        </section>
      )}

      {can('ai:chat') && (
        <section className="panel nearby-panel">
          <h3>AI Job Finder</h3>
          <p className="panel-note">
            Search by city/area and role. Results include requirements, skills, contact (HR email/phone),
            company website, apply link, and <strong>Fresher</strong> or <strong>Experienced</strong> level.
          </p>
          <form className="nearby-form" onSubmit={findJobs}>
            <label>
              Location
              <input
                placeholder="e.g. Chennai, Bangalore"
                value={search.location}
                onChange={(e) => setSearch({ ...search, location: e.target.value })}
              />
            </label>
            <label>
              Role / Keyword
              <input
                placeholder="e.g. Software Developer, HR, Sales"
                value={search.role}
                onChange={(e) => setSearch({ ...search, role: e.target.value })}
              />
            </label>
            <label>
              Experience
              <select
                value={search.experienceLevel}
                onChange={(e) => setSearch({ ...search, experienceLevel: e.target.value })}
              >
                <option value="all">All (Fresher + Experienced)</option>
                <option value="fresher">Fresher only</option>
                <option value="experienced">Experienced only</option>
              </select>
            </label>
            <label>
              Job type
              <select
                value={search.jobType}
                onChange={(e) => setSearch({ ...search, jobType: e.target.value })}
              >
                <option value="">Any</option>
                <option value="full-time">Full-time</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="internship">Internship</option>
                <option value="contract">Contract</option>
                <option value="part-time">Part-time</option>
              </select>
            </label>
            <label>
              Count
              <input
                type="number"
                min="3"
                max="20"
                value={search.count}
                onChange={(e) => setSearch({ ...search, count: Number(e.target.value) || 10 })}
              />
            </label>
            {aiProviders.length > 0 && (
              <label>
                AI provider
                <select
                  value={search.provider}
                  onChange={(e) => setSearch({ ...search, provider: e.target.value })}
                >
                  {aiProviders.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="checkbox-row" style={{ alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={search.verifiedOnly}
                onChange={(e) => setSearch({ ...search, verifiedOnly: e.target.checked })}
              />
              Verified only
            </label>
            <div className="nearby-actions">
              <button type="submit" className="btn btn-primary" disabled={searching}>
                {searching ? 'Searching...' : 'Find jobs'}
              </button>
            </div>
          </form>

          {searchResults.length > 0 && (
            <>
              {disclaimer && <p className="panel-note">{disclaimer}</p>}
              <div className="toolbar filters-bar">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={searchResults.every((item) => selected[item.id])}
                    onChange={(e) => {
                      const next = {};
                      searchResults.forEach((item) => { next[item.id] = e.target.checked; });
                      setSelected(next);
                    }}
                  />
                  Select all
                </label>
                {can('jobs:manage') && (
                  <button className="btn btn-primary" onClick={saveSelected} disabled={saving}>
                    {saving ? 'Saving...' : 'Save selected jobs'}
                  </button>
                )}
              </div>
              <div className="table-wrap leads-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Complete</th>
                      <th>Job / Role</th>
                      <th>Experience</th>
                      <th>Company</th>
                      <th>Requirements</th>
                      <th>Skills</th>
                      <th>Contact</th>
                      <th>Website / Apply</th>
                      <th>Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(selected[item.id])}
                            onChange={() => setSelected((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          />
                        </td>
                        <td>
                          <span className="completeness-pill" data-level={completenessLevel(item.dataCompleteness)}>
                            {item.dataCompleteness ?? 0}%
                          </span>
                        </td>
                        <td>
                          <strong>{item.jobTitle}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.role}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {[item.area, item.city].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td>
                          <ExpBadge level={item.experienceLevel} />
                          <div style={{ fontSize: '0.8rem', marginTop: 4 }}>{item.experienceYears || '—'}</div>
                          <Badge value={item.jobType || 'full-time'} />
                        </td>
                        <td>{item.company || '—'}</td>
                        <td>
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.82rem' }}>
                            {(item.requirements || []).slice(0, 4).map((r) => <li key={r}>{r}</li>)}
                          </ul>
                        </td>
                        <td>
                          <div className="chip-list">
                            {(item.skills || []).slice(0, 4).map((s) => (
                              <span key={s} className="mini-chip">{s}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div>{item.contactName || '—'}</div>
                          <div style={{ fontSize: '0.8rem' }}>{item.contactEmail || '—'}</div>
                          <div style={{ fontSize: '0.8rem' }}>{item.contactPhone || '—'}</div>
                        </td>
                        <td>
                          {item.website && (
                            <a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', display: 'block' }}>Website</a>
                          )}
                          {item.applyUrl && (
                            <a href={item.applyUrl.startsWith('http') ? item.applyUrl : `https://${item.applyUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', display: 'block' }}>Apply</a>
                          )}
                          {!item.website && !item.applyUrl && '—'}
                        </td>
                        <td>{item.salaryRange || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {stats && stats.total > 0 && (
        <div className="stats-grid">
          <div className="stat-card"><span>Saved Jobs</span><strong>{stats.total}</strong></div>
          <div className="stat-card"><span>Fresher</span><strong>{stats.byExperience?.fresher || 0}</strong></div>
          <div className="stat-card"><span>Experienced</span><strong>{stats.byExperience?.experienced || 0}</strong></div>
          <div className="stat-card"><span>Avg Complete</span><strong>{stats.averageCompleteness}%</strong></div>
        </div>
      )}

      <div className="toolbar filters-bar">
        <input
          placeholder="Search saved jobs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <select value={expFilter} onChange={(e) => setExpFilter(e.target.value)}>
          <option value="">All experience</option>
          <option value="fresher">Fresher</option>
          <option value="experienced">Experienced</option>
          <option value="both">Both</option>
        </select>
        <label className="checkbox-row">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          Verified only
        </label>
        <button className="btn btn-secondary" onClick={load}>Filter</button>
      </div>

      <div className="table-wrap leads-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job / Role</th>
              <th>Experience</th>
              <th>Company</th>
              <th>Requirements</th>
              <th>Contact</th>
              <th>Website</th>
              <th>Complete</th>
              <th>Saved</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">No saved jobs yet. Use AI Job Finder above to search and save.</div>
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job._id}>
                  <td>
                    <strong>{job.jobTitle}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{job.role}</div>
                    <div style={{ fontSize: '0.8rem' }}>{[job.area, job.city].filter(Boolean).join(', ')}</div>
                  </td>
                  <td>
                    <ExpBadge level={job.experienceLevel} />
                    <div style={{ fontSize: '0.8rem' }}>{job.experienceYears}</div>
                  </td>
                  <td>{job.company || '—'}</td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 200 }}>
                    {(job.requirements || []).slice(0, 3).join(' · ')}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>{job.contactEmail || '—'}</div>
                    <div style={{ fontSize: '0.82rem' }}>{job.contactPhone || '—'}</div>
                  </td>
                  <td>
                    {job.website && (
                      <a href={job.website.startsWith('http') ? job.website : `https://${job.website}`} target="_blank" rel="noreferrer">Site</a>
                    )}
                    {job.applyUrl && (
                      <a href={job.applyUrl.startsWith('http') ? job.applyUrl : `https://${job.applyUrl}`} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>Apply</a>
                    )}
                  </td>
                  <td>
                    <span className="completeness-pill" data-level={completenessLevel(job.dataCompleteness)}>
                      {job.dataCompleteness ?? 0}%
                    </span>
                  </td>
                  <td>{formatDate(job.savedAt || job.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setDetailJob(job)}>View</button>
                      {can('jobs:manage') && (
                        <button type="button" className="btn btn-danger" onClick={() => deleteJob(job._id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailJob && (
        <Modal title={detailJob.jobTitle} onClose={() => setDetailJob(null)}>
          <div className="form-grid">
            <p><strong>Role:</strong> {detailJob.role}</p>
            <p><strong>Company:</strong> {detailJob.company || '—'}</p>
            <p><strong>Location:</strong> {[detailJob.location, detailJob.area, detailJob.city].filter(Boolean).join(', ') || '—'}</p>
            <p><strong>Experience:</strong> <ExpBadge level={detailJob.experienceLevel} /> {detailJob.experienceYears}</p>
            <p><strong>Job type:</strong> {titleCase(detailJob.jobType || 'full-time')}</p>
            <p><strong>Salary:</strong> {detailJob.salaryRange || '—'}</p>
            <p><strong>Requirements:</strong></p>
            <ul>{(detailJob.requirements || []).map((r) => <li key={r}>{r}</li>)}</ul>
            <p><strong>Skills:</strong> {(detailJob.skills || []).join(', ') || '—'}</p>
            <p><strong>Contact:</strong> {detailJob.contactName || '—'} · {detailJob.contactEmail || '—'} · {detailJob.contactPhone || '—'}</p>
            <p><strong>Website:</strong> {detailJob.website || '—'}</p>
            <p><strong>Apply URL:</strong> {detailJob.applyUrl || '—'}</p>
            <p><strong>Posted:</strong> {detailJob.postedDate || '—'}</p>
            <p><strong>Data completeness:</strong> {detailJob.dataCompleteness ?? 0}%</p>
            <p><strong>Notes:</strong> {detailJob.notes || '—'}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDetailJob(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
