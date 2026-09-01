import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, titleCase } from '../utils';

const emptyLead = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  source: 'manual',
  campaign: '',
  notes: '',
};

const emptyForm = {
  name: '',
  slug: '',
  title: '',
  description: '',
  thankYouMessage: 'Thanks! We received your details and will contact you soon.',
  source: 'form',
  campaign: '',
  isActive: true,
};

const SOURCES = ['website', 'referral', 'social', 'ads', 'import', 'form', 'manual', 'ai', 'other'];

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

export default function Leads() {
  const { can } = useAuth();
  const [leads, setLeads] = useState([]);
  const [forms, setForms] = useState([]);
  const [stats, setStats] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [originalOnly, setOriginalOnly] = useState(true);
  const [minCompleteness, setMinCompleteness] = useState(100);
  const [query, setQuery] = useState('');
  const [detailLead, setDetailLead] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [leadModal, setLeadModal] = useState(false);
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingForm, setEditingForm] = useState(null);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [captureForm, setCaptureForm] = useState(emptyForm);
  const [csvText, setCsvText] = useState(
    'firstName,lastName,email,phone,company,source,campaign,notes\nPriya,Rajan,priya@example.com,9876543210,Acme,referral,spring-campaign,Interested in demo'
  );
  const [nearby, setNearby] = useState({
    location: '',
    needType: 'all',
    radiusKm: 5,
    count: 10,
    provider: '',
    originalOnly: true,
    minCompleteness: 100,
  });
  const [aiProviders, setAiProviders] = useState([]);
  const [nearbyResults, setNearbyResults] = useState([]);
  const [nearbySelected, setNearbySelected] = useState({});
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyDisclaimer, setNearbyDisclaimer] = useState('');
  const [savingNearby, setSavingNearby] = useState(false);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (sourceFilter) params.set('source', sourceFilter);
      if (query.trim()) params.set('q', query.trim());
      if (originalOnly) params.set('originalOnly', 'true');
      if (minCompleteness > 0) params.set('minCompleteness', String(minCompleteness));
      const qs = params.toString() ? `?${params}` : '';
      const [leadsData, formsData, statsData, analysisData] = await Promise.all([
        api.getLeads(qs),
        api.getLeadForms(),
        api.getLeadStats(),
        api.getLeadAnalysis(),
      ]);
      setLeads(leadsData);
      setForms(formsData);
      setStats(statsData);
      setAnalysis(analysisData);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [sourceFilter, originalOnly, minCompleteness]);

  useEffect(() => {
    if (!can('ai:chat')) return;
    api.getAiStatus()
      .then((data) => {
        setAiProviders(data.providers || []);
        if (data.defaultProvider || data.provider) {
          setNearby((prev) => ({ ...prev, provider: data.defaultProvider || data.provider }));
        }
      })
      .catch(() => {});
  }, [can]);

  const sourceMax = useMemo(() => {
    const values = Object.values(stats?.bySource || { 0: 1 });
    return Math.max(...values, 1);
  }, [stats]);

  const openCreateLead = () => {
    setEditing(null);
    setLeadForm(emptyLead);
    setLeadModal(true);
  };

  const openEditLead = (lead) => {
    setEditing(lead);
    setLeadForm({
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      source: lead.source || 'manual',
      campaign: lead.campaign || '',
      notes: lead.notes || '',
    });
    setLeadModal(true);
  };

  const saveLead = async (event) => {
    event.preventDefault();
    try {
      if (editing) await api.updateLead(editing._id, leadForm);
      else await api.createLead(leadForm);
      setLeadModal(false);
      setMessage(editing ? 'Lead updated' : 'Lead created');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const convertLead = async (id, status) => {
    try {
      await api.convertLead(id, status);
      setMessage(`Lead converted to ${status}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteLead = async (id) => {
    if (!window.confirm('Delete this lead?')) return;
    try {
      await api.deleteLead(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openCreateForm = () => {
    setEditingForm(null);
    setCaptureForm(emptyForm);
    setFormModal(true);
  };

  const openEditForm = (form) => {
    setEditingForm(form);
    setCaptureForm({
      name: form.name || '',
      slug: form.slug || '',
      title: form.title || '',
      description: form.description || '',
      thankYouMessage: form.thankYouMessage || emptyForm.thankYouMessage,
      source: form.source || 'form',
      campaign: form.campaign || '',
      isActive: form.isActive !== false,
    });
    setFormModal(true);
  };

  const saveForm = async (event) => {
    event.preventDefault();
    try {
      if (editingForm) await api.updateLeadForm(editingForm._id, captureForm);
      else await api.createLeadForm(captureForm);
      setFormModal(false);
      setMessage(editingForm ? 'Capture form updated' : 'Capture form created');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteForm = async (id) => {
    if (!window.confirm('Delete this capture form?')) return;
    try {
      await api.deleteLeadForm(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const importCsv = async (event) => {
    event.preventDefault();
    try {
      const result = await api.importLeads({ csv: csvText });
      setImportModal(false);
      setMessage(result.message + (result.errors?.length ? ` (${result.errors.length} row error(s))` : ''));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyFormLink = async (slug) => {
    const url = `${window.location.origin}/f/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`Copied: ${url}`);
    } catch {
      setMessage(url);
    }
  };

  const detectMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { Accept: 'application/json' } }
          );
          const data = await response.json();
          const area = data?.address?.suburb || data?.address?.neighbourhood || data?.address?.village || '';
          const city = data?.address?.city || data?.address?.town || data?.address?.state_district || data?.address?.state || '';
          const location = [area, city].filter(Boolean).join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setNearby((prev) => ({ ...prev, location }));
          setMessage(`Location detected: ${location}`);
        } catch {
          setNearby((prev) => ({
            ...prev,
            location: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          }));
        }
      },
      () => setError('Could not detect location. Allow location access or type city/area manually.')
    );
  };

  const findNearby = async (event) => {
    event.preventDefault();
    if (!nearby.location.trim()) {
      setError('Enter a city or area to find nearby contacts');
      return;
    }
    setNearbyLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await api.findNearbyLeads(nearby);
      setNearbyResults(data.results || []);
      setNearbyDisclaimer(data.disclaimer || '');
      const selected = {};
      (data.results || []).forEach((item) => {
        selected[item.id] = true;
      });
      setNearbySelected(selected);
      setMessage(`Found ${data.totalQualified ?? data.results?.length ?? 0} original lead(s) (${data.minCompleteness}%+ complete)`);
    } catch (err) {
      setError(err.message);
    } finally {
      setNearbyLoading(false);
    }
  };

  const toggleNearby = (id) => {
    setNearbySelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllNearby = (checked) => {
    const next = {};
    nearbyResults.forEach((item) => {
      next[item.id] = checked;
    });
    setNearbySelected(next);
  };

  const saveSelectedNearby = async () => {
    const selected = nearbyResults.filter((item) => nearbySelected[item.id]);
    if (!selected.length) {
      setError('Select at least one nearby contact to save');
      return;
    }
    setSavingNearby(true);
    setError('');
    try {
      const result = await api.saveNearbyLeads({
        leads: selected,
        campaign: `ai-nearby-${nearby.location}`.slice(0, 80),
        originalOnly: nearby.originalOnly,
        minCompleteness: nearby.minCompleteness,
      });
      setMessage(`${result.message}${result.skipped ? `, skipped ${result.skipped}` : ''}`);
      setNearbyResults([]);
      setNearbySelected({});
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNearby(false);
    }
  };

  const exportLeadsCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sourceFilter) params.set('source', sourceFilter);
      if (query.trim()) params.set('q', query.trim());
      if (originalOnly) params.set('originalOnly', 'true');
      if (minCompleteness > 0) params.set('minCompleteness', String(minCompleteness));
      const qs = params.toString() ? `?${params}` : '';
      const blob = await api.exportLeads(qs);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-alignment-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${leads.length} lead(s) for alignment`);
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
          <h2>Lead Generation</h2>
          <p>Original leads only · 100% data analysis · export for alignment</p>
        </div>
        <div className="actions">
          {can('leads:view') && (
            <button className="btn btn-secondary" onClick={exportLeadsCsv} disabled={exporting || leads.length === 0}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
          {can('leads:import') && (
            <button className="btn btn-secondary" onClick={() => setImportModal(true)}>Import CSV</button>
          )}
          {can('leads:manage') && (
            <>
              <button className="btn btn-secondary" onClick={openCreateForm}>New Form</button>
              <button className="btn btn-primary" onClick={openCreateLead}>Add Lead</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {analysis && (
        <section className="panel">
          <h3>Lead Data Analysis</h3>
          <p className="panel-note">
            Completeness score (0–100%) measures how ready each lead is for outreach alignment.
            Original leads have real contact details — not placeholders or incomplete AI data.
          </p>
          <div className="lead-analysis-grid">
            <div className="lead-analysis-card">
              <span>Avg completeness</span>
              <strong>{analysis.averageCompleteness}%</strong>
              <CompletenessBar value={analysis.averageCompleteness} />
            </div>
            <div className="lead-analysis-card">
              <span>100% complete leads</span>
              <strong>{analysis.complete100Count}</strong>
              <div className="panel-note">{analysis.complete100Percent}% of total</div>
            </div>
            <div className="lead-analysis-card">
              <span>Original leads</span>
              <strong>{analysis.originalCount}</strong>
              <div className="panel-note">{analysis.originalPercent}% verified</div>
            </div>
            <div className="lead-analysis-card">
              <span>Total leads</span>
              <strong>{analysis.total}</strong>
              <div className="panel-note">{analysis.duplicateOrIncomplete} incomplete/filtered</div>
            </div>
          </div>
        </section>
      )}

      {can('ai:chat') && (
        <section className="panel nearby-panel">
          <h3>AI Nearby Contacts</h3>
          <p className="panel-note">
            Shows only businesses that need a <strong>website</strong>, <strong>software</strong>, or <strong>application</strong> — not general nearby shops.
          </p>
          <form className="nearby-form" onSubmit={findNearby}>
            <label>
              Location / Area
              <input
                required
                placeholder="e.g. T. Nagar, Chennai"
                value={nearby.location}
                onChange={(e) => setNearby({ ...nearby, location: e.target.value })}
              />
            </label>
            <label>
              Looking for customers who need
              <select
                value={nearby.needType}
                onChange={(e) => setNearby({ ...nearby, needType: e.target.value })}
              >
                <option value="all">Website / Software / Application</option>
                <option value="website">Website only</option>
                <option value="software">Software only</option>
                <option value="application">Application only</option>
              </select>
            </label>
            <label>
              Radius (km)
              <input
                type="number"
                min="1"
                max="50"
                value={nearby.radiusKm}
                onChange={(e) => setNearby({ ...nearby, radiusKm: Number(e.target.value) || 5 })}
              />
            </label>
            <label>
              Count
              <input
                type="number"
                min="3"
                max="20"
                value={nearby.count}
                onChange={(e) => setNearby({ ...nearby, count: Number(e.target.value) || 10 })}
              />
            </label>
            {aiProviders.length > 0 && (
              <label>
                AI provider
                <select
                  value={nearby.provider}
                  onChange={(e) => setNearby({ ...nearby, provider: e.target.value })}
                >
                  {aiProviders.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Min completeness %
              <input
                type="number"
                min="50"
                max="100"
                value={nearby.minCompleteness}
                onChange={(e) => setNearby({ ...nearby, minCompleteness: Number(e.target.value) || 100 })}
              />
            </label>
            <label className="checkbox-row" style={{ alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={nearby.originalOnly}
                onChange={(e) => setNearby({ ...nearby, originalOnly: e.target.checked })}
              />
              Original leads only
            </label>
            <div className="nearby-actions">
              <button type="button" className="btn btn-secondary" onClick={detectMyLocation}>Use my location</button>
              <button type="submit" className="btn btn-primary" disabled={nearbyLoading}>
                {nearbyLoading ? 'Generating...' : 'Find nearby'}
              </button>
            </div>
          </form>

          {nearbyResults.length > 0 && (
            <>
              {nearbyDisclaimer && <p className="panel-note">{nearbyDisclaimer}</p>}
              <div className="toolbar filters-bar">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={nearbyResults.every((item) => nearbySelected[item.id])}
                    onChange={(e) => toggleAllNearby(e.target.checked)}
                  />
                  Select all
                </label>
                {can('leads:manage') && (
                  <button className="btn btn-primary" onClick={saveSelectedNearby} disabled={savingNearby}>
                    {savingNearby ? 'Saving...' : 'Save selected as leads'}
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Complete</th>
                      <th>Business</th>
                      <th>Needs</th>
                      <th>Has Website?</th>
                      <th>Marketing</th>
                      <th>Digital info</th>
                      <th>Contact</th>
                      <th>Phone</th>
                      <th>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearbyResults.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(nearbySelected[item.id])}
                            onChange={() => toggleNearby(item.id)}
                          />
                        </td>
                        <td>
                          <span className="completeness-pill" data-level={completenessLevel(item.dataCompleteness)}>
                            {item.dataCompleteness ?? 0}%
                          </span>
                          {item.isOriginal && <span className="original-badge">Original</span>}
                        </td>
                        <td>
                          <strong>{item.company}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.category || '—'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.notes || ''}</div>
                        </td>
                        <td><Badge value={item.needType || 'website'} /></td>
                        <td>
                          <span className={`score-pill`} data-score={item.hasWebsite ? 'Warm' : 'Cold'}>
                            {item.hasWebsite ? 'Yes' : 'No'}
                          </span>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                            {item.websiteStatus === 'none' ? 'No website' : titleCase(item.websiteStatus || 'unknown')}
                          </div>
                          {item.website ? (
                            <a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>
                              Open site
                            </a>
                          ) : null}
                        </td>
                        <td>
                          <div className="chip-list">
                            {(item.marketingChannels || []).map((channel) => (
                              <span key={channel} className="mini-chip">{channel}</span>
                            ))}
                          </div>
                          {(item.socialMedia?.facebook || item.socialMedia?.instagram || item.socialMedia?.whatsappBusiness) && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6 }}>
                              {[
                                item.socialMedia?.facebook ? 'Facebook' : null,
                                item.socialMedia?.instagram ? 'Instagram' : null,
                                item.socialMedia?.whatsappBusiness ? 'WhatsApp Biz' : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>{item.digitalPresence || '—'}</div>
                          {item.currentTools && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                              Tools: {item.currentTools}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{item.firstName} {item.lastName}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.email || '—'}</div>
                        </td>
                        <td>{item.phone || '—'}</td>
                        <td>
                          <div>{item.address || '—'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {[item.area, item.city].filter(Boolean).join(', ') || '—'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><span>Open Leads</span><strong>{stats.total}</strong></div>
          <div className="stat-card"><span>New This Week</span><strong>{stats.recentWeek}</strong></div>
          <div className="stat-card"><span>Hot</span><strong>{stats.byScore?.Hot || 0}</strong></div>
          <div className="stat-card"><span>Warm</span><strong>{stats.byScore?.Warm || 0}</strong></div>
        </div>
      )}

      <div className="panel-grid">
        <section className="panel">
          <h3>Leads by Source</h3>
          {!stats || Object.keys(stats.bySource || {}).length === 0 ? (
            <p className="empty-state">No leads yet</p>
          ) : (
            <div className="chart-bars">
              {Object.entries(stats.bySource).map(([source, count]) => (
                <div key={source} className="chart-row">
                  <span className="chart-label">{titleCase(source)}</span>
                  <div className="chart-track">
                    <div className="chart-fill" style={{ width: `${(count / sourceMax) * 100}%` }} />
                  </div>
                  <strong className="chart-value">{count}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Capture Forms</h3>
          {forms.length === 0 ? (
            <p className="empty-state">Create a public form to collect leads from your website.</p>
          ) : (
            forms.map((form) => (
              <div key={form._id} className="list-item">
                <div>
                  <strong>{form.name}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    /f/{form.slug} · {form.submissionCount || 0} submissions · {form.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="actions">
                  <Link className="btn btn-secondary" to={`/f/${form.slug}`} target="_blank">Open</Link>
                  <button className="btn btn-secondary" onClick={() => copyFormLink(form.slug)}>Copy</button>
                  {can('leads:manage') && (
                    <>
                      <button className="btn btn-secondary" onClick={() => openEditForm(form)}>Edit</button>
                      <button className="btn btn-danger" onClick={() => deleteForm(form._id)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="toolbar filters-bar">
        <input
          placeholder="Search leads..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>{titleCase(source)}</option>
          ))}
        </select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={originalOnly}
            onChange={(e) => setOriginalOnly(e.target.checked)}
          />
          Original only
        </label>
        <label>
          Min %
          <input
            type="number"
            min="0"
            max="100"
            style={{ width: 70, marginLeft: 6 }}
            value={minCompleteness}
            onChange={(e) => setMinCompleteness(Number(e.target.value) || 0)}
          />
        </label>
        <button className="btn btn-secondary" onClick={load}>Filter</button>
      </div>

      <div className="table-wrap leads-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name / Company</th>
              <th>Contact</th>
              <th>Location</th>
              <th>Need / Category</th>
              <th>Website</th>
              <th>Marketing</th>
              <th>Digital / Tools</th>
              <th>Complete</th>
              <th>Score</th>
              <th>Source</th>
              <th>Campaign</th>
              <th>Captured</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="13">
                  <div className="empty-state">No leads match filters. Try lowering min completeness or disable Original only.</div>
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead._id}>
                  <td>
                    <strong>{lead.firstName} {lead.lastName}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lead.company || '—'}</div>
                    {lead.isOriginal && <span className="original-badge">Original</span>}
                  </td>
                  <td>
                    <div>{lead.email || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lead.phone || '—'}</div>
                  </td>
                  <td>
                    <div>{lead.address || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {[lead.area, lead.city].filter(Boolean).join(', ') || '—'}
                    </div>
                  </td>
                  <td>
                    <Badge value={lead.needType || '—'} />
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>{lead.category || '—'}</div>
                  </td>
                  <td>
                    {lead.hasWebsite === true ? 'Yes' : lead.hasWebsite === false ? 'No' : '—'}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{titleCase(lead.websiteStatus || '')}</div>
                    {lead.website && (
                      <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem' }}>Site</a>
                    )}
                  </td>
                  <td>
                    <div className="chip-list">
                      {(lead.marketingChannels || []).slice(0, 3).map((ch) => (
                        <span key={ch} className="mini-chip">{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem', maxWidth: 160 }}>{lead.digitalPresence || '—'}</div>
                    {lead.currentTools && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{lead.currentTools}</div>
                    )}
                  </td>
                  <td>
                    <span className="completeness-pill" data-level={completenessLevel(lead.dataCompleteness)}>
                      {lead.dataCompleteness ?? 0}%
                    </span>
                    <CompletenessBar value={lead.dataCompleteness || 0} />
                  </td>
                  <td>
                    <span className="score-pill" data-score={lead.leadScoreLabel || 'Cold'}>
                      {lead.leadScore ?? 0} · {lead.leadScoreLabel || 'Cold'}
                    </span>
                  </td>
                  <td><Badge value={lead.source || 'manual'} /></td>
                  <td>{lead.campaign || '—'}</td>
                  <td>{formatDate(lead.capturedAt || lead.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setDetailLead(lead)}>View</button>
                      {can('leads:manage') && (
                        <>
                          <button className="btn btn-secondary" onClick={() => convertLead(lead._id, 'prospect')}>To Prospect</button>
                          <button className="btn btn-secondary" onClick={() => convertLead(lead._id, 'customer')}>To Customer</button>
                          <button className="btn btn-secondary" onClick={() => openEditLead(lead)}>Edit</button>
                          <button className="btn btn-danger" onClick={() => deleteLead(lead._id)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailLead && (
        <Modal title={`Lead — ${detailLead.company || detailLead.firstName}`} onClose={() => setDetailLead(null)}>
          <div className="form-grid">
            <p><strong>Name:</strong> {detailLead.firstName} {detailLead.lastName}</p>
            <p><strong>Company:</strong> {detailLead.company || '—'}</p>
            <p><strong>Email:</strong> {detailLead.email || '—'}</p>
            <p><strong>Phone:</strong> {detailLead.phone || '—'}</p>
            <p><strong>Address:</strong> {detailLead.address || '—'}</p>
            <p><strong>Area / City:</strong> {[detailLead.area, detailLead.city].filter(Boolean).join(', ') || '—'}</p>
            <p><strong>Category:</strong> {detailLead.category || '—'}</p>
            <p><strong>Need type:</strong> {detailLead.needType || '—'}</p>
            <p><strong>Website:</strong> {detailLead.hasWebsite === true ? 'Yes' : detailLead.hasWebsite === false ? 'No' : '—'} ({detailLead.websiteStatus || '—'}) {detailLead.website || ''}</p>
            <p><strong>Marketing:</strong> {(detailLead.marketingChannels || []).join(', ') || '—'}</p>
            <p><strong>Facebook:</strong> {detailLead.socialFacebook || '—'}</p>
            <p><strong>Instagram:</strong> {detailLead.socialInstagram || '—'}</p>
            <p><strong>WhatsApp Business:</strong> {detailLead.whatsappBusiness ? 'Yes' : 'No'}</p>
            <p><strong>Digital presence:</strong> {detailLead.digitalPresence || '—'}</p>
            <p><strong>Current tools:</strong> {detailLead.currentTools || '—'}</p>
            <p><strong>Data completeness:</strong> {detailLead.dataCompleteness ?? 0}% {detailLead.isOriginal ? '(Original)' : '(Incomplete)'}</p>
            <p><strong>Lead score:</strong> {detailLead.leadScore ?? 0} · {detailLead.leadScoreLabel || 'Cold'}</p>
            <p><strong>Source / Campaign:</strong> {detailLead.source} · {detailLead.campaign || '—'}</p>
            <p><strong>Notes:</strong> {detailLead.notes || '—'}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDetailLead(null)}>Close</button>
              {can('leads:manage') && (
                <button type="button" className="btn btn-primary" onClick={() => { openEditLead(detailLead); setDetailLead(null); }}>Edit lead</button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {leadModal && (
        <Modal title={editing ? 'Edit Lead' : 'Add Lead'} onClose={() => setLeadModal(false)}>
          <form onSubmit={saveLead} className="form-grid">
            <div className="form-row">
              <label>
                First name
                <input required value={leadForm.firstName} onChange={(e) => setLeadForm({ ...leadForm, firstName: e.target.value })} />
              </label>
              <label>
                Last name
                <input required value={leadForm.lastName} onChange={(e) => setLeadForm({ ...leadForm, lastName: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Email
                <input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
              </label>
            </div>
            <label>
              Company
              <input value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Source
                <select value={leadForm.source} onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}>
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>{titleCase(source)}</option>
                  ))}
                </select>
              </label>
              <label>
                Campaign
                <input value={leadForm.campaign} onChange={(e) => setLeadForm({ ...leadForm, campaign: e.target.value })} />
              </label>
            </div>
            <label>
              Notes
              <textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setLeadModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {formModal && (
        <Modal title={editingForm ? 'Edit Capture Form' : 'New Capture Form'} onClose={() => setFormModal(false)}>
          <form onSubmit={saveForm} className="form-grid">
            <div className="form-row">
              <label>
                Form name
                <input required value={captureForm.name} onChange={(e) => setCaptureForm({ ...captureForm, name: e.target.value })} />
              </label>
              <label>
                Public slug
                <input
                  required
                  value={captureForm.slug}
                  onChange={(e) => setCaptureForm({ ...captureForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="website"
                />
              </label>
            </div>
            <label>
              Public title
              <input required value={captureForm.title} onChange={(e) => setCaptureForm({ ...captureForm, title: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={captureForm.description} onChange={(e) => setCaptureForm({ ...captureForm, description: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Default source
                <select value={captureForm.source} onChange={(e) => setCaptureForm({ ...captureForm, source: e.target.value })}>
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>{titleCase(source)}</option>
                  ))}
                </select>
              </label>
              <label>
                Campaign
                <input value={captureForm.campaign} onChange={(e) => setCaptureForm({ ...captureForm, campaign: e.target.value })} />
              </label>
            </div>
            <label>
              Thank-you message
              <textarea value={captureForm.thankYouMessage} onChange={(e) => setCaptureForm({ ...captureForm, thankYouMessage: e.target.value })} />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={captureForm.isActive}
                onChange={(e) => setCaptureForm({ ...captureForm, isActive: e.target.checked })}
              />
              Form is active
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setFormModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingForm ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {importModal && (
        <Modal title="Import Leads (CSV)" onClose={() => setImportModal(false)}>
          <form onSubmit={importCsv} className="form-grid">
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Columns: firstName, lastName, email, phone, company, source, campaign, notes
            </p>
            <label>
              CSV content
              <textarea rows={10} value={csvText} onChange={(e) => setCsvText(e.target.value)} required />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setImportModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Import</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
