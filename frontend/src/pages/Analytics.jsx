import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, fullName, titleCase } from '../utils';

function BarChart({ title, items, valueKey = 'value', labelKey = 'label', color = '#3b82f6' }) {
  const max = Math.max(...items.map((i) => Number(i[valueKey]) || 0), 1);
  return (
    <section className="panel">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-state">No data</p>
      ) : (
        <div className="chart-bars">
          {items.map((item) => (
            <div key={item[labelKey]} className="chart-row">
              <span className="chart-label">{item[labelKey]}</span>
              <div className="chart-track">
                <div
                  className="chart-fill"
                  style={{ width: `${(Number(item[valueKey]) / max) * 100}%`, background: color }}
                />
              </div>
              <strong className="chart-value">{item[valueKey]}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Analytics() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    api.getAnalytics()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const stageItems = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.dealsByStage || {}).map(([label, value]) => ({
      label: titleCase(label),
      value,
    }));
  }, [data]);

  const scoreItems = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.scoreBands || {}).map(([label, value]) => ({ label, value }));
  }, [data]);

  const monthlyWon = useMemo(() => {
    if (!data) return [];
    return (data.monthly || []).map((m) => ({ label: m.label, value: Math.round(m.won) }));
  }, [data]);

  const refreshScores = async () => {
    setError('');
    setMessage('');
    try {
      const result = await api.refreshLeadScores();
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !data && !error) return <p>Loading analytics...</p>;

  if (error && !data) {
    return (
      <div className="panel">
        <div className="error-banner">{error}</div>
        <button type="button" className="btn btn-primary" onClick={load} style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const totals = data?.totals || {};
  const followUpStats = data?.followUpStats || {};
  const sms = data?.sms || {};

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Analytics</h2>
          <p>Sales performance dashboards, graphics, lead scoring, and SMS delivery</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
          {can('analytics:view') && (
            <button type="button" className="btn btn-secondary" onClick={refreshScores}>Refresh Lead Scores</button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card"><span>Conversion Rate</span><strong>{totals.conversionRate || 0}%</strong></div>
        <div className="stat-card"><span>Pipeline Value</span><strong>{formatCurrency(totals.pipelineValue || 0)}</strong></div>
        <div className="stat-card"><span>Won Revenue</span><strong>{formatCurrency(totals.wonValue || 0)}</strong></div>
        <div className="stat-card"><span>Avg Lead Score</span><strong>{totals.avgLeadScore || 0}</strong></div>
        <div className="stat-card"><span>Follow-ups Sent</span><strong>{followUpStats.sent || 0}</strong></div>
        <div className="stat-card"><span>SMS Delivery Rate</span><strong>{sms.deliveryRate || 0}%</strong></div>
      </div>

      <div className="panel-grid">
        <BarChart title="Won Revenue (Last 6 Months)" items={monthlyWon} color="#22c55e" />
        <BarChart title="Deals by Stage" items={stageItems} color="#3b82f6" />
        <BarChart title="Lead Score Bands" items={scoreItems} color="#f59e0b" />

        <section className="panel">
          <h3>Alert SMS (30 days)</h3>
          <div className="list-item"><span>Delivered</span><strong>{sms.delivered || 0}</strong></div>
          <div className="list-item"><span>Queued / Sent</span><strong>{(sms.queued || 0) + (sms.sent || 0)}</strong></div>
          <div className="list-item"><span>Failed / Partial</span><strong>{(sms.failed || 0) + (sms.partial || 0)}</strong></div>
          <div className="list-item"><span>Segments</span><strong>{sms.segments || 0}</strong></div>
          <div className="list-item"><span>Est. cost</span><strong>{sms.price ? sms.price.toFixed(4) : '0'}</strong></div>
        </section>

        <section className="panel">
          <h3>Top Leads by Score</h3>
          {(data?.topLeads || []).length === 0 ? (
            <p className="empty-state">No contacts yet</p>
          ) : (
            data.topLeads.map((lead) => (
              <div key={lead._id} className="list-item">
                <div>
                  <strong>{fullName(lead)}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {lead.company || '—'} · {titleCase(lead.status)}
                  </div>
                </div>
                <div className="score-pill" data-score={lead.leadScoreLabel || 'Cold'}>
                  {lead.leadScore || 0} · {lead.leadScoreLabel || 'Cold'}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
