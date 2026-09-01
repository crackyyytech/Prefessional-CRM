let cachedReport = null;
let cachedAt = 0;
let inflight = null;

export async function getCachedAiHealth(fetchReport, { maxAgeMs = 900 } = {}) {
  const now = Date.now();
  if (cachedReport && now - cachedAt < maxAgeMs) {
    return { ...cachedReport, checkedAt: cachedAt, fromCache: true };
  }
  if (inflight) return inflight;

  inflight = fetchReport()
    .then((report) => {
      cachedReport = report;
      cachedAt = Date.now();
      inflight = null;
      return { ...report, checkedAt: cachedAt, fromCache: false };
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
}

/** Return cached status instantly; refresh in background when stale (does not block other APIs). */
export async function getLiveAiHealth(fetchReport, { refreshMs = 30000 } = {}) {
  const now = Date.now();
  const stale = !cachedReport || now - cachedAt >= refreshMs;

  if (cachedReport && !stale) {
    return { ...cachedReport, checkedAt: cachedAt, fromCache: true };
  }

  if (cachedReport && stale && !inflight) {
    inflight = fetchReport()
      .then((report) => {
        cachedReport = report;
        cachedAt = Date.now();
        inflight = null;
      })
      .catch(() => {
        inflight = null;
      });
    return { ...cachedReport, checkedAt: cachedAt, fromCache: true, refreshing: true };
  }

  if (inflight && cachedReport) {
    return { ...cachedReport, checkedAt: cachedAt, fromCache: true, refreshing: true };
  }

  return getCachedAiHealth(fetchReport, { maxAgeMs: 0 });
}

export function clearAiHealthCache() {
  cachedReport = null;
  cachedAt = 0;
  inflight = null;
}
