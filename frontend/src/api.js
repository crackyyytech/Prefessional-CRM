const TOKEN_KEY = 'crm_token';

import { assertOnline, requestEnd, requestStart } from './network/networkBus.js';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 20000;
const GET_CACHE_TTL_MS = 15000;
const inflightGets = new Map();
const getCache = new Map();

// Only cache stable, infrequently changing GETs
const CACHEABLE_GET_PREFIXES = [
  '/settings/branding',
  '/internships/meta',
  '/load-tests/meta',
  '/port-scans/meta',
  '/ddos-tests/meta',
  '/phishing-campaigns/meta',
  '/camera-jam/meta',
  '/resume-builder/templates',
  '/roles/permissions',
];

function isNetworkFailure(error) {
  if (!navigator.onLine) return true;
  if (error?.name === 'TypeError') return true;
  return false;
}

function cacheKey(path, method) {
  return `${method || 'GET'}:${path}`;
}

function isCacheableGet(path) {
  const bare = String(path || '').split('?')[0];
  return CACHEABLE_GET_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

function readGetCache(path) {
  const entry = getCache.get(cacheKey(path, 'GET'));
  if (!entry) return null;
  if (Date.now() - entry.at > GET_CACHE_TTL_MS) {
    getCache.delete(cacheKey(path, 'GET'));
    return null;
  }
  return entry.data;
}

function writeGetCache(path, data) {
  if (!isCacheableGet(path)) return;
  getCache.set(cacheKey(path, 'GET'), { at: Date.now(), data });
}

export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.includes(prefix)) getCache.delete(key);
  }
}

async function request(path, options = {}) {
  assertOnline();

  const method = (options.method || 'GET').toUpperCase();
  const useCache = method === 'GET'
    && !options.skipCache
    && !options.expectBlob
    && isCacheableGet(path);
  const dedupeKey = method === 'GET' && !options.skipCache && !options.expectBlob
    ? cacheKey(path, method)
    : null;

  if (useCache && !options.forceRefresh) {
    const cached = readGetCache(path);
    if (cached != null) return cached;
  }

  if (dedupeKey && inflightGets.has(dedupeKey)) {
    return inflightGets.get(dedupeKey);
  }

  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const run = async () => {
    const reqId = requestStart();
    try {
      let response;
      try {
        response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          signal: AbortSignal.timeout(options.timeoutMs || REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          throw new Error('Request timed out. The server may be busy — please retry.');
        }
        if (isNetworkFailure(error)) {
          throw new Error('No internet connection. Requests are paused until you are back online.');
        }
        throw new Error('Network request failed. Check your connection and try again.');
      }

      if (options.expectBlob) {
        if (response.status === 401) {
          clearToken();
          window.location.href = '/login';
          throw new Error('Authentication required');
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Request failed');
        }
        return response.blob();
      }

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        clearToken();
        if (!path.startsWith('/auth/login')) {
          const reason = data.code === 'SESSION_REVOKED' ? '?reason=session_revoked' : '';
          window.location.href = `/login${reason}`;
        }
      }

      if (!response.ok) {
        const fallback =
          response.status === 502 || response.status === 503 || response.status === 504
            ? 'API server is unavailable. Make sure the backend is running, then try again.'
            : response.status >= 500
              ? 'Server error. Please try again in a moment.'
              : 'Request failed';
        const err = new Error(data.message || fallback);
        err.code = data.code;
        err.retryAfterMs = data.retryAfterMs;
        err.status = response.status;
        throw err;
      }

      if (useCache) writeGetCache(path, data);
      if (method !== 'GET') invalidateApiCache();
      return data;
    } finally {
      requestEnd(reqId);
    }
  };

  const promise = run();
  if (dedupeKey) {
    inflightGets.set(dedupeKey, promise);
    promise.finally(() => {
      if (inflightGets.get(dedupeKey) === promise) inflightGets.delete(dedupeKey);
    });
  }
  return promise;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (body) => request('/auth/password', { method: 'PUT', body: JSON.stringify(body) }),

  getDashboard: () => request('/dashboard', { timeoutMs: 12000, forceRefresh: true }),
  getAnalytics: () => request('/analytics', { timeoutMs: 15000, forceRefresh: true }),
  refreshLeadScores: () => request('/analytics/refresh-scores', { method: 'POST' }),

  getLoadTests: () => request('/load-tests', { skipCache: true }),
  getLoadTestMeta: () => request('/load-tests/meta'),
  getLoadTest: (id) => request(`/load-tests/${id}`, { skipCache: true }),
  createLoadTest: (body) => request('/load-tests', { method: 'POST', body: JSON.stringify(body) }),
  cancelLoadTest: (id) => request(`/load-tests/${id}/cancel`, { method: 'POST' }),
  deleteLoadTest: (id) => request(`/load-tests/${id}`, { method: 'DELETE' }),
  downloadLoadTestPdf: (id) => request(`/load-tests/${id}/pdf`, { expectBlob: true }),

  getSecurityScans: () => request('/security-scans'),
  getSecurityScan: (id) => request(`/security-scans/${id}`),
  createSecurityScan: (body) => request('/security-scans', { method: 'POST', body: JSON.stringify(body) }),
  deleteSecurityScan: (id) => request(`/security-scans/${id}`, { method: 'DELETE' }),
  downloadSecurityScanPdf: (id) => request(`/security-scans/${id}/pdf`, { expectBlob: true }),

  getSecurityHubOverview: () => request('/security-hub/overview'),

  getPortScans: () => request('/port-scans'),
  getPortScanMeta: () => request('/port-scans/meta'),
  getPortScan: (id) => request(`/port-scans/${id}`),
  createPortScan: (body) => request('/port-scans', { method: 'POST', body: JSON.stringify(body) }),
  deletePortScan: (id) => request(`/port-scans/${id}`, { method: 'DELETE' }),

  getNetworkScans: () => request('/network-scans', { skipCache: true }),
  getNetworkScanMeta: () => request('/network-scans/meta', { skipCache: true }),
  getNetworkScan: (id) => request(`/network-scans/${id}`, { skipCache: true }),
  createNetworkScan: (body) => request('/network-scans', {
    method: 'POST',
    body: JSON.stringify(body || {}),
    timeoutMs: 180000,
  }),
  deleteNetworkScan: (id) => request(`/network-scans/${id}`, { method: 'DELETE' }),

  getDnsScans: () => request('/dns-scans'),
  getDnsScan: (id) => request(`/dns-scans/${id}`),
  createDnsScan: (body) => request('/dns-scans', { method: 'POST', body: JSON.stringify(body) }),
  deleteDnsScan: (id) => request(`/dns-scans/${id}`, { method: 'DELETE' }),

  getDdosTests: () => request('/ddos-tests'),
  getDdosMeta: () => request('/ddos-tests/meta'),
  getDdosTest: (id) => request(`/ddos-tests/${id}`, { skipCache: true }),
  createDdosTest: (body) => request('/ddos-tests', { method: 'POST', body: JSON.stringify(body) }),
  cancelDdosTest: (id) => request(`/ddos-tests/${id}/cancel`, { method: 'POST' }),
  deleteDdosTest: (id) => request(`/ddos-tests/${id}`, { method: 'DELETE' }),
  downloadDdosTestPdf: (id) => request(`/ddos-tests/${id}/pdf`, { expectBlob: true }),

  getPhishingCampaigns: () => request('/phishing-campaigns'),
  getPhishingMeta: () => request('/phishing-campaigns/meta'),
  getPhishingCampaign: (id) => request(`/phishing-campaigns/${id}`),
  createPhishingCampaign: (body) => request('/phishing-campaigns', { method: 'POST', body: JSON.stringify(body) }),
  deletePhishingCampaign: (id) => request(`/phishing-campaigns/${id}`, { method: 'DELETE' }),
  downloadPhishingPdf: (id) => request(`/phishing-campaigns/${id}/pdf`, { expectBlob: true }),

  getCameraJamTests: () => request('/camera-jam'),
  getCameraJamMeta: () => request('/camera-jam/meta'),
  gatherCameraIntel: (body) => request('/camera-jam/recon', { method: 'POST', body: JSON.stringify(body) }),
  probeCameraView: (body) => request('/camera-jam/view-probe', { method: 'POST', body: JSON.stringify(body) }),
  getCameraPreview: (body) => request('/camera-jam/preview', { method: 'POST', body: JSON.stringify(body), expectBlob: true }),
  getCameraJamTest: (id) => request(`/camera-jam/${id}`, { skipCache: true }),
  createCameraJamTest: (body) => request('/camera-jam', { method: 'POST', body: JSON.stringify(body) }),
  cancelCameraJamTest: (id) => request(`/camera-jam/${id}/cancel`, { method: 'POST' }),
  deleteCameraJamTest: (id) => request(`/camera-jam/${id}`, { method: 'DELETE' }),
  downloadCameraJamPdf: (id) => request(`/camera-jam/${id}/pdf`, { expectBlob: true }),

  getFollowUps: () => request('/automation'),
  createFollowUp: (body) => request('/automation', { method: 'POST', body: JSON.stringify(body) }),
  sendFollowUpNow: (id) => request(`/automation/${id}/send-now`, { method: 'POST' }),
  cancelFollowUp: (id) => request(`/automation/${id}/cancel`, { method: 'PATCH' }),
  deleteFollowUp: (id) => request(`/automation/${id}`, { method: 'DELETE' }),

  getIntegrations: () => request('/settings/integrations'),
  saveIntegrations: (body) => request('/settings/integrations', { method: 'PUT', body: JSON.stringify(body) }),
  testEmailIntegration: (body) => request('/settings/integrations/test-email', { method: 'POST', body: JSON.stringify(body) }),
  getBranding: () => request('/settings/branding'),
  saveBranding: (body) => request('/settings/branding', { method: 'PUT', body: JSON.stringify(body) }),

  getContacts: () => request('/contacts'),
  createContact: (body) => request('/contacts', { method: 'POST', body: JSON.stringify(body) }),
  updateContact: (id, body) => request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),

  getLeads: (qs = '') => request(`/leads${qs}`),
  getLeadAnalysis: () => request('/leads/analysis'),
  exportLeads: (qs = '') => request(`/leads/export${qs}`, { expectBlob: true }),
  getLeadStats: () => request('/leads/stats'),
  createLead: (body) => request('/leads', { method: 'POST', body: JSON.stringify(body) }),
  updateLead: (id, body) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLead: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
  convertLead: (id, status) => request(`/leads/${id}/convert`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  importLeads: (body) => request('/leads/import', { method: 'POST', body: JSON.stringify(body) }),
  findNearbyLeads: (body) => request('/leads/ai-nearby', { method: 'POST', body: JSON.stringify(body) }),
  saveNearbyLeads: (body) => request('/leads/ai-nearby/save', { method: 'POST', body: JSON.stringify(body) }),
  getLeadForms: () => request('/leads/forms'),
  createLeadForm: (body) => request('/leads/forms', { method: 'POST', body: JSON.stringify(body) }),
  updateLeadForm: (id, body) => request(`/leads/forms/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLeadForm: (id) => request(`/leads/forms/${id}`, { method: 'DELETE' }),

  getJobs: (qs = '') => request(`/jobs${qs}`),
  getJobStats: () => request('/jobs/stats'),
  getJobAnalysis: () => request('/jobs/analysis'),
  exportJobs: (qs = '') => request(`/jobs/export${qs}`, { expectBlob: true }),
  findJobs: (body) => request('/jobs/ai-find', { method: 'POST', body: JSON.stringify(body) }),
  saveJobs: (body) => request('/jobs/ai-find/save', { method: 'POST', body: JSON.stringify(body) }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),

  getAtsScans: () => request('/ats'),
  getAtsScan: (id) => request(`/ats/${id}`),
  scanResume: (formData) => request('/ats/scan', { method: 'POST', body: formData }),
  deleteAtsScan: (id) => request(`/ats/${id}`, { method: 'DELETE' }),

  getResumeTemplate: () => request('/resume-builder/template'),
  getResumeTemplates: () => request('/resume-builder/templates'),
  getResumeTemplateById: (id) => request(`/resume-builder/templates/${id}`),
  getResumeDrafts: () => request('/resume-builder'),
  getResumeDraft: (id) => request(`/resume-builder/${id}`),
  createResumeDraft: (body) => request('/resume-builder', { method: 'POST', body: JSON.stringify(body) }),
  updateResumeDraft: (id, body) => request(`/resume-builder/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  analyzeResumeDraft: (body) => request('/resume-builder/analyze', { method: 'POST', body: JSON.stringify(body) }),
  analyzeResumeDraftById: (id, body) => request(`/resume-builder/${id}/analyze`, { method: 'POST', body: JSON.stringify(body) }),
  optimizeResumeDraft: (body) => request('/resume-builder/optimize', { method: 'POST', body: JSON.stringify(body) }),
  optimizeResumeDraftById: (id, body) => request(`/resume-builder/${id}/optimize`, { method: 'POST', body: JSON.stringify(body) }),
  deleteResumeDraft: (id) => request(`/resume-builder/${id}`, { method: 'DELETE' }),

  getSeoScans: () => request('/seo'),
  getSeoScan: (id) => request(`/seo/${id}`),
  scanSeo: (body) => request('/seo/scan', { method: 'POST', body: JSON.stringify(body) }),
  deleteSeoScan: (id) => request(`/seo/${id}`, { method: 'DELETE' }),

  getAlertSms: () => request('/alert-sms', { skipCache: true }),
  getAlertSmsTemplates: () => request('/alert-sms/templates', { skipCache: true }),
  createAlertSmsTemplate: (body) => request('/alert-sms/templates', { method: 'POST', body: JSON.stringify(body) }),
  deleteAlertSmsTemplate: (id) => request(`/alert-sms/templates/${id}`, { method: 'DELETE' }),
  draftAlertSms: (body) => request('/alert-sms/draft', { method: 'POST', body: JSON.stringify(body) }),
  sendAlertSms: (body) => request('/alert-sms/send', { method: 'POST', body: JSON.stringify(body) }),
  cancelAlertSms: (id) => request(`/alert-sms/${id}/cancel`, { method: 'POST' }),
  deleteAlertSms: (id) => request(`/alert-sms/${id}`, { method: 'DELETE' }),

  testSmsIntegration: (body) => request('/settings/integrations/test-sms', { method: 'POST', body: JSON.stringify(body) }),

  getDeals: () => request('/deals'),
  createDeal: (body) => request('/deals', { method: 'POST', body: JSON.stringify(body) }),
  updateDeal: (id, body) => request(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDeal: (id) => request(`/deals/${id}`, { method: 'DELETE' }),

  getQuotations: () => request('/quotations'),
  getQuotation: (id) => request(`/quotations/${id}`),
  createQuotation: (body) => request('/quotations', { method: 'POST', body: JSON.stringify(body) }),
  updateQuotation: (id, body) => request(`/quotations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuotation: (id) => request(`/quotations/${id}`, { method: 'DELETE' }),
  downloadQuotationPdf: (id) => request(`/quotations/${id}/pdf`, { expectBlob: true }),

  getTasks: () => request('/tasks'),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  getDocuments: () => request('/documents'),
  uploadDocument: (formData) => request('/documents', { method: 'POST', body: formData }),
  downloadDocument: (id) => request(`/documents/${id}/download`, { expectBlob: true }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),

  getInternships: () => request('/internships'),
  getInternshipMeta: () => request('/internships/meta'),
  createInternship: (body) => request('/internships', { method: 'POST', body: JSON.stringify(body) }),
  updateInternship: (id, body) => request(`/internships/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteInternship: (id) => request(`/internships/${id}`, { method: 'DELETE' }),
  downloadInternshipCertificate: (id) => request(`/internships/${id}/certificate`, { expectBlob: true }),

  getAiStatus: () => request('/settings/ai/status'),
  getAiSettings: () => request('/settings/ai'),
  saveAiSettings: (body) => request('/settings/ai', { method: 'PUT', body: JSON.stringify(body) }),
  testAiProvider: (body) => request('/settings/ai/test', { method: 'POST', body: JSON.stringify(body) }),
  getAiHealth: () => request('/settings/ai/health'),
  getAiHealthLive: () => request('/settings/ai/health?live=1'),
  chatAi: (body) => request('/ai/chat', { method: 'POST', body: JSON.stringify(body) }),

  getAiImageStatus: () => request('/ai-image/status', { skipCache: true }),
  getAiImageHistory: () => request('/ai-image/history', { skipCache: true }),
  generateAiImage: (body) => request('/ai-image/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: 120000,
  }),
  deleteAiImage: (id) => request(`/ai-image/${id}`, { method: 'DELETE' }),
  clearAiImageHistory: () => request('/ai-image/history', { method: 'DELETE' }),

  getAiCodeStatus: () => request('/ai-code/status', { skipCache: true }),
  getAiCodeWorkspaces: () => request('/ai-code/workspaces', { skipCache: true }),
  createAiCodeWorkspace: (body) => request('/ai-code/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  deleteAiCodeWorkspace: (id) => request(`/ai-code/workspaces/${id}`, { method: 'DELETE' }),
  getAiCodeFiles: (id) => request(`/ai-code/workspaces/${id}/files`, { skipCache: true }),
  getAiCodeFile: (id, filePath) => request(`/ai-code/workspaces/${id}/file?path=${encodeURIComponent(filePath)}`, { skipCache: true }),
  saveAiCodeFile: (id, body) => request(`/ai-code/workspaces/${id}/file`, { method: 'PUT', body: JSON.stringify(body) }),
  generateAiCodeWorkspace: (id, body) => request(`/ai-code/workspaces/${id}/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: 300000,
  }),
  inspectAiCodeWorkspace: (id) => request(`/ai-code/workspaces/${id}/inspect`, { skipCache: true }),
  previewAiCodeWorkspace: (id, filePath = '') => request(
    `/ai-code/workspaces/${id}/preview${filePath ? `?path=${encodeURIComponent(filePath)}` : ''}`,
    { skipCache: true }
  ),
  executeAiCodeWorkspace: (id, body) => request(`/ai-code/workspaces/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
    timeoutMs: 30000,
  }),

  getPermissionsCatalog: () => request('/roles/permissions'),
  getRoles: () => request('/roles'),
  createRole: (body) => request('/roles', { method: 'POST', body: JSON.stringify(body) }),
  updateRole: (id, body) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRole: (id) => request(`/roles/${id}`, { method: 'DELETE' }),

  getUsers: () => request('/users'),
  getUserPasswordInfo: (id) => request(`/users/${id}/password-info`),
  adminChangeUserPassword: (id, body) => request(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify(body) }),
  createUser: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getActiveSessions: () => request('/sessions'),
  forceLogoutSession: (sessionId) => request(`/sessions/${sessionId}`, { method: 'DELETE' }),
  forceLogoutUser: (userId) => request(`/sessions/revoke-user/${userId}`, { method: 'POST' }),
};
