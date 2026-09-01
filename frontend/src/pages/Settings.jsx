import { useEffect, useState } from 'react';
import PasswordInput from '../components/PasswordInput';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

function isProviderConnected(row) {
  if (!row?.enabled) return false;
  if (row.requiresApiKey === false) return true;
  return Boolean(row.hasApiKey || row.apiKey?.trim());
}

function ProviderStatusBadge({ id, row, health, loading }) {
  if (!isProviderConnected(row)) {
    return <span className="ai-status-badge not-connected">Not connected</span>;
  }
  if (loading && !health) {
    return <span className="ai-status-badge checking">Checking…</span>;
  }
  if (!health) {
    return <span className="ai-status-badge unknown">Not tested</span>;
  }
  if (health.ok) {
    return <span className="ai-status-badge working">Working</span>;
  }
  return <span className="ai-status-badge not-working" title={health.error}>Not working</span>;
}

function ProviderConfigForm({
  id,
  row,
  meta,
  defaults,
  updateProvider,
  testingProvider,
  onTest,
  isNew = false,
}) {
  const requiresApiKey = meta.requiresApiKey !== false && row.requiresApiKey !== false;
  const showBase = row.showBaseUrl ?? (meta.showBaseUrl !== false && id !== 'gemini');
  const canTest = requiresApiKey ? (row.hasApiKey || row.apiKey?.trim()) : true;
  return (
    <div className="ai-provider-card ai-provider-config">
      <div className="ai-provider-head">
        <div>
          <strong>{isNew ? 'Connect' : 'Manage'} — {row.label || meta.label || id}</strong>
          <p className="panel-note" style={{ margin: '4px 0 0' }}>{row.description || meta.description}</p>
        </div>
        {!isNew && (
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={Boolean(row.enabled)}
              onChange={(e) => updateProvider(id, { enabled: e.target.checked })}
            />
            Enabled
          </label>
        )}
      </div>

      <label>
        Model
        <input
          value={row.model}
          onChange={(e) => updateProvider(id, { model: e.target.value })}
          placeholder={defaults?.model || 'model id'}
        />
      </label>

      {showBase && (
        <label>
          API base URL
          <input
            value={row.baseUrl}
            onChange={(e) => updateProvider(id, { baseUrl: e.target.value })}
            placeholder={defaults?.baseUrl || 'https://...'}
          />
        </label>
      )}

      {id === 'cloudflare' && (
        <label>
          Account ID
          <input
            value={row.accountId || ''}
            onChange={(e) => updateProvider(id, { accountId: e.target.value })}
            placeholder="From Workers AI → Use REST API"
          />
          <span className="field-hint">Optional if auto-detect works — copy from Cloudflare dashboard</span>
        </label>
      )}

      {(row.docsUrl || meta.docsUrl) && (
        <p className="panel-note">
          {requiresApiKey ? 'Free key: ' : 'Setup: '}
          <a href={row.docsUrl || meta.docsUrl} target="_blank" rel="noreferrer">
            {requiresApiKey ? 'Get API key' : 'Install / setup guide'}
          </a>
        </p>
      )}

      {requiresApiKey ? (
        <label>
          API key {row.hasApiKey ? `(saved: ${row.apiKeyMasked})` : ''}
          <PasswordInput
            value={row.apiKey}
            onChange={(e) => updateProvider(id, { apiKey: e.target.value })}
            placeholder={row.hasApiKey ? 'Leave blank to keep current key' : 'Paste free API key'}
            autoComplete="off"
          />
        </label>
      ) : (
        <p className="panel-note">No API key required — enable and save, then ensure Ollama is running locally.</p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        disabled={testingProvider === id || !canTest}
        onClick={() => onTest(id)}
      >
        {testingProvider === id ? 'Testing...' : 'Test connection'}
      </button>
    </div>
  );
}

export default function Settings() {
  const { user, updateProfile, can } = useAuth();
  const { refreshBranding } = useBranding();
  const canManageAi = can('ai:manage');
  const canManageBranding = can('users:manage');
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [brandingForm, setBrandingForm] = useState({
    appName: 'Vistawin CRM',
    appTagline: 'Customer relationships',
    companyLegalName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyGstin: '',
  });
  const [aiForm, setAiForm] = useState({
    defaultProvider: 'gemini',
    providers: {},
  });
  const [providerMeta, setProviderMeta] = useState({});
  const [providerDefaults, setProviderDefaults] = useState({});
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [brandingMessage, setBrandingMessage] = useState('');
  const [brandingError, setBrandingError] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [aiError, setAiError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [testingProvider, setTestingProvider] = useState('');
  const [aiHealth, setAiHealth] = useState(null);
  const [providerHealth, setProviderHealth] = useState({});
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [healthCheckedAt, setHealthCheckedAt] = useState(null);
  const [testingAll, setTestingAll] = useState(false);
  const [addingProvider, setAddingProvider] = useState('');
  const [editingProvider, setEditingProvider] = useState('');

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        email: user.email || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (!canManageBranding) return;
    api.getBranding()
      .then((data) => {
        setBrandingForm({
          appName: data.appName || 'Vistawin CRM',
          appTagline: data.appTagline || 'Customer relationships',
          companyLegalName: data.companyLegalName || '',
          companyAddress: data.companyAddress || '',
          companyPhone: data.companyPhone || '',
          companyEmail: data.companyEmail || '',
          companyGstin: data.companyGstin || '',
        });
      })
      .catch((err) => setBrandingError(err.message));
  }, [canManageBranding]);

  const refreshProviderHealth = async ({ silent = false, live = false } = {}) => {
    if (silent) setHealthRefreshing(true);
    else setHealthLoading(true);
    try {
      const report = live ? await api.getAiHealthLive() : await api.getAiHealth();
      setAiHealth(report);
      const map = {};
      (report.results || []).forEach((row) => {
        map[row.id] = row;
      });
      setProviderHealth(map);
      setHealthCheckedAt(report.checkedAt || Date.now());
      return report;
    } catch {
      return null;
    } finally {
      if (silent) setHealthRefreshing(false);
      else setHealthLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageAi) return undefined;

    refreshProviderHealth({ silent: true, live: true });
    const interval = setInterval(() => {
      refreshProviderHealth({ silent: true, live: true });
    }, 30000);

    return () => clearInterval(interval);
  }, [canManageAi]);

  useEffect(() => {
    if (!canManageAi) return;
    api.getAiSettings()
      .then((data) => {
        const providers = {};
        Object.entries(data.providers || {}).forEach(([id, row]) => {
          providers[id] = {
            enabled: Boolean(row.enabled),
            apiKey: '',
            baseUrl: row.baseUrl || '',
            model: row.model || '',
            accountId: row.accountId || '',
            hasApiKey: Boolean(row.hasApiKey),
            isReady: Boolean(row.isReady),
            requiresApiKey: row.requiresApiKey !== false,
            freeTier: row.freeTier || 'free-key',
            apiKeyMasked: row.apiKeyMasked || '',
            label: row.label || id,
            description: row.description || '',
            docsUrl: data.providerMeta?.[id]?.docsUrl || '',
            showBaseUrl: data.providerMeta?.[id]?.showBaseUrl !== false && id !== 'gemini',
          };
        });
        setProviderMeta(data.providerMeta || {});
        setProviderDefaults(data.providerDefaults || {});
        setAiForm({
          defaultProvider: data.defaultProvider || data.provider || 'gemini',
          providers,
        });
      })
      .catch((err) => setAiError(err.message));
  }, [canManageAi]);

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileMessage('');
    setSavingProfile(true);
    try {
      await updateProfile(profile);
      setProfileMessage('Profile updated successfully');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage('Password updated successfully');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleBrandingSubmit = async (event) => {
    event.preventDefault();
    setBrandingError('');
    setBrandingMessage('');
    setSavingBranding(true);
    try {
      const result = await api.saveBranding(brandingForm);
      setBrandingForm({
        appName: result.settings.appName,
        appTagline: result.settings.appTagline,
        companyLegalName: result.settings.companyLegalName || '',
        companyAddress: result.settings.companyAddress || '',
        companyPhone: result.settings.companyPhone || '',
        companyEmail: result.settings.companyEmail || '',
        companyGstin: result.settings.companyGstin || '',
      });
      await refreshBranding();
      setBrandingMessage(result.message || 'Branding & letterhead updated');
    } catch (err) {
      setBrandingError(err.message);
    } finally {
      setSavingBranding(false);
    }
  };

  const updateProvider = (id, patch) => {
    setAiForm((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [id]: { ...prev.providers[id], ...patch },
      },
    }));
  };

  const handleTestProvider = async (id) => {
    setAiError('');
    setAiMessage('');
    setTestingProvider(id);
    try {
      const result = await api.testAiProvider({ provider: id });
      setProviderHealth((prev) => ({
        ...prev,
        [id]: { id, ok: true, model: result.model, reply: result.reply, latencyMs: 0 },
      }));
      setAiMessage(`${result.message} — "${result.reply}"`);
      refreshProviderHealth({ silent: true, live: false });
    } catch (err) {
      setProviderHealth((prev) => ({
        ...prev,
        [id]: { id, ok: false, error: err.message },
      }));
      setAiError(`${id}: ${err.message}`);
    } finally {
      setTestingProvider('');
    }
  };

  const handleTestAllProviders = async () => {
    setAiError('');
    setAiMessage('');
    setTestingAll(true);
    try {
      const report = await refreshProviderHealth({ live: false });
      if (!report) throw new Error('Health check failed');
      setAiMessage(`AI health: ${report.passed}/${report.tested} providers working`);
      if (report.failed > 0) {
        setAiError(`${report.failed} provider(s) not working — see status below`);
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setTestingAll(false);
    }
  };

  const handleAiSubmit = async (event) => {
    event.preventDefault();
    setAiError('');
    setAiMessage('');
    setSavingAi(true);
    try {
      const providersPayload = {};
      Object.entries(aiForm.providers).forEach(([id, row]) => {
        const connecting = id === addingProvider;
        const noKeyProvider = providerMeta[id]?.requiresApiKey === false;
        providersPayload[id] = {
          enabled: Boolean(row.enabled || row.apiKey?.trim() || (connecting && noKeyProvider)),
          baseUrl: row.baseUrl,
          model: row.model,
        };
        if (id === 'cloudflare' && row.accountId !== undefined) {
          providersPayload[id].accountId = row.accountId;
        }
        if (row.apiKey?.trim()) providersPayload[id].apiKey = row.apiKey.trim();
      });

      const result = await api.saveAiSettings({
        defaultProvider: aiForm.defaultProvider,
        providers: providersPayload,
      });

      const providers = {};
      Object.entries(result.settings.providers || {}).forEach(([id, row]) => {
        providers[id] = {
          enabled: Boolean(row.enabled),
          apiKey: '',
          baseUrl: row.baseUrl || '',
          model: row.model || '',
          accountId: row.accountId || '',
          hasApiKey: Boolean(row.hasApiKey),
          isReady: Boolean(row.isReady),
          requiresApiKey: row.requiresApiKey !== false,
          freeTier: row.freeTier || 'free-key',
          apiKeyMasked: row.apiKeyMasked || '',
          label: row.label || id,
          description: row.description || '',
          docsUrl: result.settings.providerMeta?.[id]?.docsUrl || providerMeta[id]?.docsUrl || '',
          showBaseUrl: (result.settings.providerMeta?.[id] || providerMeta[id])?.showBaseUrl !== false && id !== 'gemini',
        };
      });

      if (result.settings.providerMeta) setProviderMeta(result.settings.providerMeta);
      if (result.settings.providerDefaults) setProviderDefaults(result.settings.providerDefaults);

      setAiForm({
        defaultProvider: result.settings.defaultProvider || result.settings.provider || 'gemini',
        providers,
      });
      setAddingProvider('');
      setEditingProvider('');
      setAiMessage(result.message || 'AI integrations saved');
    } catch (err) {
      setAiError(err.message);
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Update profile, application name, password, and AI chatbot configuration</p>
        </div>
      </div>

      <div className="panel-grid settings-grid">
        {canManageBranding && (
          <section className="panel settings-ai-panel">
            <h3>Application name & quotation letterhead</h3>
            <p className="panel-note">
              Admin only — product name for the app, plus company details printed on software quotations.
            </p>
            {brandingError && <div className="error-banner">{brandingError}</div>}
            {brandingMessage && <div className="success-banner">{brandingMessage}</div>}
            <form onSubmit={handleBrandingSubmit} className="form-grid">
              <label>
                Application name
                <input
                  required
                  maxLength={60}
                  value={brandingForm.appName}
                  onChange={(e) => setBrandingForm({ ...brandingForm, appName: e.target.value })}
                  placeholder="Vistawin CRM"
                />
              </label>
              <label>
                Tagline
                <input
                  maxLength={80}
                  value={brandingForm.appTagline}
                  onChange={(e) => setBrandingForm({ ...brandingForm, appTagline: e.target.value })}
                  placeholder="Customer relationships"
                />
              </label>
              <label>
                Legal company name (quotes)
                <input
                  maxLength={120}
                  value={brandingForm.companyLegalName}
                  onChange={(e) => setBrandingForm({ ...brandingForm, companyLegalName: e.target.value })}
                  placeholder="Vistawin Solutions"
                />
              </label>
              <label>
                Company address
                <textarea
                  rows={2}
                  maxLength={400}
                  value={brandingForm.companyAddress}
                  onChange={(e) => setBrandingForm({ ...brandingForm, companyAddress: e.target.value })}
                  placeholder="Street, city, state, PIN"
                />
              </label>
              <div className="form-row">
                <label>
                  Company phone
                  <input
                    value={brandingForm.companyPhone}
                    onChange={(e) => setBrandingForm({ ...brandingForm, companyPhone: e.target.value })}
                  />
                </label>
                <label>
                  Company email
                  <input
                    type="email"
                    value={brandingForm.companyEmail}
                    onChange={(e) => setBrandingForm({ ...brandingForm, companyEmail: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Company GSTIN
                <input
                  maxLength={20}
                  value={brandingForm.companyGstin}
                  onChange={(e) => setBrandingForm({ ...brandingForm, companyGstin: e.target.value.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                />
              </label>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="submit" className="btn btn-primary" disabled={savingBranding}>
                  {savingBranding ? 'Saving...' : 'Save branding & letterhead'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="panel">
          <h3>Profile</h3>
          {profileError && <div className="error-banner">{profileError}</div>}
          {profileMessage && <div className="success-banner">{profileMessage}</div>}
          <form onSubmit={handleProfileSubmit} className="form-grid">
            <label>
              Full name
              <input
                required
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                required
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
            </label>
            <label>
              Role
              <input value={user?.role?.name || '—'} disabled />
            </label>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h3>Change password</h3>
          {passwordError && <div className="error-banner">{passwordError}</div>}
          {passwordMessage && <div className="success-banner">{passwordMessage}</div>}
          <form onSubmit={handlePasswordSubmit} className="form-grid">
            <label>
              Current password
              <PasswordInput
                required
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </label>
            <label>
              New password
              <PasswordInput
                required
                minLength={6}
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </label>
            <label>
              Confirm new password
              <PasswordInput
                required
                minLength={6}
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                {savingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>
        </section>

        {canManageAi && (
          <section className="panel settings-ai-panel">
            <h3>AI Integrations</h3>
            <p className="panel-note">
              Connect free AI providers (Gemini, Groq, OpenRouter, Ollama, Pollinations, and more) or your
              <strong> Cursor API</strong> key for Composer models. Ollama is 100% free with no key — install locally.
              Voice assistant: use the mic in the AI chat widget or AI Chat page.
            </p>
            {aiError && <div className="error-banner">{aiError}</div>}
            {aiMessage && <div className="success-banner">{aiMessage}</div>}
            <div className="modal-actions" style={{ marginTop: 0, marginBottom: 12 }}>
              <button type="button" className="btn btn-primary" onClick={handleTestAllProviders} disabled={testingAll || healthLoading}>
                {testingAll || healthLoading ? 'Checking providers…' : 'Test all providers'}
              </button>
            </div>
            {aiHealth && (
              <div className={`ai-health-summary${healthRefreshing ? ' refreshing' : ''}`}>
                <span className="ai-status-badge working">{aiHealth.passed} working</span>
                <span className="ai-status-badge not-working">{aiHealth.failed} not working</span>
                {healthCheckedAt && (
                  <span className="panel-note ai-health-updated">
                    Live · {new Date(healthCheckedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
            <form onSubmit={handleAiSubmit} className="form-grid">
              <label>
                Default provider
                <select
                  value={aiForm.defaultProvider}
                  onChange={(e) => setAiForm({ ...aiForm, defaultProvider: e.target.value })}
                >
                  {Object.entries(aiForm.providers)
                    .filter(([, row]) => isProviderConnected(row))
                    .map(([id, row]) => (
                      <option key={id} value={id}>{row.label || id}</option>
                    ))}
                </select>
              </label>

              <section className="ai-all-providers-section">
                <h4>All AI providers — status</h4>
                <div className="table-wrap">
                  <table className="ai-connected-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Connected</th>
                        <th>Status</th>
                        <th>Model</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(aiForm.providers).map(([id, row]) => (
                        <tr key={id}>
                          <td>
                            <strong>{row.label || providerMeta[id]?.label || id}</strong>
                            <div className="panel-note">{row.description || providerMeta[id]?.description}</div>
                          </td>
                          <td>{isProviderConnected(row) ? 'Yes' : 'No'}</td>
                          <td>
                            <ProviderStatusBadge
                              id={id}
                              row={row}
                              health={providerHealth[id]}
                              loading={healthLoading}
                            />
                          </td>
                          <td>{row.model || providerDefaults[id]?.model || '—'}</td>
                          <td>
                            {isProviderConnected(row) ? (
                              <div className="actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => setEditingProvider(editingProvider === id ? '' : id)}
                                >
                                  {editingProvider === id ? 'Close' : 'Manage'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={testingProvider === id}
                                  onClick={() => handleTestProvider(id)}
                                >
                                  {testingProvider === id ? 'Testing…' : 'Test'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => updateProvider(id, { enabled: false })}
                                >
                                  Disconnect
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setAddingProvider(id)}
                              >
                                Connect
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {editingProvider && aiForm.providers[editingProvider] && (
                <ProviderConfigForm
                  id={editingProvider}
                  row={aiForm.providers[editingProvider]}
                  meta={providerMeta[editingProvider] || {}}
                  defaults={providerDefaults[editingProvider] || {}}
                  updateProvider={updateProvider}
                  testingProvider={testingProvider}
                  onTest={handleTestProvider}
                />
              )}

              <section className="ai-connect-section">
                <h4>Connect a provider</h4>
                <label>
                  Choose provider
                  <select
                    value={addingProvider}
                    onChange={(e) => setAddingProvider(e.target.value)}
                  >
                    <option value="">— Select to connect —</option>
                    {Object.entries(aiForm.providers)
                      .filter(([, row]) => !isProviderConnected(row))
                      .map(([id, row]) => (
                        <option key={id} value={id}>{row.label || providerMeta[id]?.label || id}</option>
                      ))}
                  </select>
                </label>
                {addingProvider && aiForm.providers[addingProvider] && (
                  <ProviderConfigForm
                    id={addingProvider}
                    row={aiForm.providers[addingProvider]}
                    meta={providerMeta[addingProvider] || {}}
                    defaults={providerDefaults[addingProvider] || {}}
                    updateProvider={(id, patch) => {
                      updateProvider(id, { ...patch, enabled: patch.enabled ?? true });
                    }}
                    testingProvider={testingProvider}
                    onTest={handleTestProvider}
                    isNew
                  />
                )}
              </section>

              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="submit" className="btn btn-primary" disabled={savingAi}>
                  {savingAi ? 'Saving...' : 'Save AI integrations'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
