import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

const LIVE_DEBOUNCE_MS = 800;
const LIVE_MIN_CHARS = 2;

const REALISM_SUFFIX =
  ', photorealistic, ultra high quality, sharp focus, natural lighting, detailed texture, 8k, professional photography';

function enhancePrompt(prompt, style) {
  const base = String(prompt || '').trim();
  if (!base) return '';
  if (style === 'raw') return base.slice(0, 1200);
  if (/photorealistic|8k|dslr|cinematic/i.test(base)) return base.slice(0, 1200);
  return `${base}${REALISM_SUFFIX}`.slice(0, 1200);
}

function buildLiveImageUrl(prompt, size, style) {
  const enhanced = enhancePrompt(prompt, style);
  if (!enhanced) return '';
  const [w, h] = size === '1792x1024' ? [1792, 1024] : size === '1024x1792' ? [1024, 1792] : [1024, 1024];
  // Stable seed from prompt so same text = same image; change text = new image
  let seed = 0;
  for (let i = 0; i < enhanced.length; i += 1) seed = (seed * 31 + enhanced.charCodeAt(i)) >>> 0;
  const encoded = encodeURIComponent(enhanced);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&model=flux&nologo=true&enhance=true&safe=true&seed=${seed}`;
}

export default function AiImageGenerator() {
  const { can } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('auto');
  const [size, setSize] = useState('1024x1024');
  const [style, setStyle] = useState('realistic');
  const [liveAuto, setLiveAuto] = useState(true);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [livePreview, setLivePreview] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [livePending, setLivePending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [editingImage, setEditingImage] = useState(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [blobUrls, setBlobUrls] = useState({});
  const debounceRef = useRef(null);
  const chatEndRef = useRef(null);
  const composerRef = useRef(null);
  const imgLoadTokenRef = useRef(0);

  const revokeBlob = (item) => {
    if (!item) return;
    const key = item._id || item.url;
    const url = blobUrls[key];
    if (url) URL.revokeObjectURL(url);
    setBlobUrls((prev) => {
      const next = { ...prev };
      delete next[key];
      if (item.url) delete next[item.url];
      return next;
    });
  };

  const handleDeleteImage = async (item) => {
    if (!item?._id || !can('aiimage:generate')) return;
    if (!window.confirm('Delete this image from history?')) return;
    setDeletingId(item._id);
    setError('');
    try {
      await api.deleteAiImage(item._id);
      revokeBlob(item);
      setHistory((prev) => prev.filter((row) => row._id !== item._id));
      setMessages((prev) => prev.map((msg) => (
        msg.image?._id === item._id ? { ...msg, image: null } : msg
      )));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId('');
    }
  };

  const handleClearHistory = async () => {
    if (!can('aiimage:generate') || history.length === 0) return;
    if (!window.confirm(`Delete all ${history.length} images from history? This cannot be undone.`)) return;
    setClearingHistory(true);
    setError('');
    try {
      await api.clearAiImageHistory();
      history.forEach(revokeBlob);
      setHistory([]);
      setMessages((prev) => prev.map((msg) => (msg.image ? { ...msg, image: null } : msg)));
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingHistory(false);
    }
  };

  const imageName = (item, fallback = 'ai-image') => {
    const raw = String(item?.originalPrompt || item?.prompt || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || fallback;
    const ext = item?.mimeType?.includes('png') ? 'png' : item?.mimeType?.includes('webp') ? 'webp' : 'jpg';
    return `${raw}.${ext}`;
  };

  const handleDownloadImage = async (item, { live = false } = {}) => {
    const id = item?._id || item?.url || item?.liveUrl || 'live';
    const url = item?.url || item?.liveUrl;
    if (!url) return;
    setDownloadingId(id);
    setError('');
    try {
      const headers = {};
      const token = getToken();
      if (!String(url).startsWith('http') && token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = imageName(item, live ? 'live-ai-image' : 'ai-image');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      if (String(url).startsWith('http')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setError(err.message || 'Download failed');
      }
    } finally {
      setDownloadingId('');
    }
  };

  const handleEditImage = (item) => {
    const nextPrompt = String(item?.originalPrompt || item?.prompt || '').trim();
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    if (item?.size) setSize(item.size);
    if (item?.style) setStyle(item.style);
    setProvider('auto');
    setLiveAuto(true);
    setEditingImage(item);
    setError('');
    setTimeout(() => {
      scheduleLivePreview(nextPrompt);
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getAiImageStatus();
      setStatus(data);
      if (data.defaultProvider) setProvider(data.defaultProvider);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const items = await api.getAiImageHistory();
      setHistory(items || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
  }, [loadStatus, loadHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, livePreview, generating]);

  useEffect(() => {
    let cancelled = false;
    const loadBlobs = async () => {
      const token = getToken();
      const urls = {};
      const items = [
        ...messages.map((m) => m.image).filter(Boolean),
        ...history,
      ].filter(Boolean);
      for (const item of items) {
        const key = item._id || item.url;
        if (!item?.url || blobUrls[key] || String(item.url).startsWith('http')) continue;
        try {
          const res = await fetch(item.url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          urls[key] = URL.createObjectURL(blob);
        } catch {
          // ignore
        }
      }
      if (!cancelled && Object.keys(urls).length) {
        setBlobUrls((prev) => ({ ...prev, ...urls }));
      }
    };
    loadBlobs();
    return () => { cancelled = true; };
  }, [messages, history]);

  /** Live preview: browser loads Pollinations URL directly — no CRM API / rate limit */
  const updateLivePreview = useCallback((text) => {
    const value = String(text || '').trim();
    if (!liveAuto || !can('aiimage:generate')) return;
    if (value.length < LIVE_MIN_CHARS) {
      setLivePending(false);
      setLivePreview(null);
      return;
    }

    const url = buildLiveImageUrl(value, size, style);
    const token = ++imgLoadTokenRef.current;
    setLivePending(true);
    setError('');
    setLivePreview({
      prompt: value,
      liveUrl: url,
      meta: { provider: 'pollinations', model: 'flux' },
      updating: true,
      error: null,
    });

    // Prefetch so we know when image is ready / failed
    const img = new Image();
    img.onload = () => {
      if (token !== imgLoadTokenRef.current) return;
      setLivePending(false);
      setLivePreview((prev) => (prev ? { ...prev, updating: false, error: null } : prev));
    };
    img.onerror = () => {
      if (token !== imgLoadTokenRef.current) return;
      setLivePending(false);
      setLivePreview((prev) => (prev
        ? { ...prev, updating: false, error: 'Preview busy — keep typing or wait a few seconds.' }
        : prev));
    };
    img.src = url;
  }, [liveAuto, can, size, style]);

  const scheduleLivePreview = useCallback((text) => {
    if (!liveAuto || !can('aiimage:generate')) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = String(text || '').trim();
    if (value.length < LIVE_MIN_CHARS) {
      setLivePending(false);
      return;
    }
    setLivePending(true);
    debounceRef.current = setTimeout(() => {
      updateLivePreview(value);
    }, LIVE_DEBOUNCE_MS);
  }, [liveAuto, can, updateLivePreview]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = prompt.trim();
    if (!value || !can('aiimage:generate')) return;

    setGenerating(true);
    setError('');
    setMessages((prev) => [...prev, { role: 'user', text: value, at: new Date().toISOString() }]);
    setPrompt('');
    setEditingImage(null);

    try {
      const result = await api.generateAiImage({
        prompt: value,
        provider,
        size,
        style,
        live: false,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Saved with ${result.provider}${result.fallbackUsed ? ' (auto-fallback)' : ''}`,
          image: result.image,
          meta: {
            provider: result.provider,
            model: result.model,
            tried: result.providersTried,
          },
          at: new Date().toISOString(),
        },
      ]);
      await loadHistory();
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Failed: ${err.message}`, error: true, at: new Date().toISOString() },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handlePromptChange = (event) => {
    const value = event.target.value;
    setPrompt(value);
    scheduleLivePreview(value);
  };

  useEffect(() => {
    if (!liveAuto) return;
    const value = prompt.trim();
    if (value.length < LIVE_MIN_CHARS) return;
    scheduleLivePreview(value);
  }, [size, style, liveAuto]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const readyCount = status?.providers?.filter((p) => p.id !== 'auto' && p.ready)?.length || 0;
  const liveImageSrc = livePreview?.liveUrl || '';

  return (
    <>
      <div className="page-header">
        <div>
          <h2>AI Image Generator</h2>
          <p>Type → live image updates instantly. Save to chat stores a high-quality copy in history.</p>
        </div>
        {can('ai:manage') && (
          <Link className="btn btn-secondary" to="/settings">AI settings</Link>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <strong>Providers:</strong>{' '}
        {readyCount > 0
          ? `${readyCount} image-capable · live preview is free & instant · Save uses auto-merge`
          : 'Live preview works free · Save uses Pollinations + any keys in Settings'}
        <div className="form-row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
          <label>
            Provider (for Save)
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {(status?.providers || [{ id: 'auto', label: 'All image providers (auto-merge)' }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.id}{p.model && p.id !== 'auto' ? ` · ${p.model}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="1024x1024">1024×1024</option>
              <option value="1792x1024">1792×1024</option>
              <option value="1024x1792">1024×1792</option>
            </select>
          </label>
          <label>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="realistic">Photorealistic HQ</option>
              <option value="raw">Raw prompt (no boost)</option>
            </select>
          </label>
          <label className="permission-item" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={liveAuto} onChange={(e) => setLiveAuto(e.target.checked)} />
            Live auto (type → image updates)
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {editingImage && (
        <div className="success-banner">
          Editing prompt from saved image. Change the text, then Save to chat to create a new version.
        </div>
      )}

      <section className="panel ai-image-chat">
        <div className="ai-image-thread">
          {liveAuto && (
            <div className={`ai-image-bubble assistant ai-image-live-canvas${livePreview?.updating || livePending ? ' is-updating' : ''}`}>
              <div className="ai-image-bubble-meta">
                Live preview
                {livePending || livePreview?.updating ? ' · updating…' : livePreview?.meta?.provider ? ` · ${livePreview.meta.provider}` : ''}
              </div>
              {!livePreview?.liveUrl && !livePending && (
                <div className="ai-image-bubble-text">
                  Type below — image appears automatically (~1s after you pause)
                </div>
              )}
              {(livePending || livePreview?.updating) && !livePreview?.liveUrl && (
                <div className="ai-image-bubble-text">Generating from your typing…</div>
              )}
              {livePreview?.liveUrl && (
                <div className="ai-image-preview">
                  <img
                    key={livePreview.liveUrl}
                    src={liveImageSrc}
                    alt={livePreview.prompt || 'Live preview'}
                    className={livePreview.updating || livePending ? 'ai-image-fading' : ''}
                  />
                  <div className="ai-image-caption">
                    {livePreview.prompt}
                    {' · live'}
                  </div>
                  <div className="ai-image-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownloadImage({
                        liveUrl: livePreview.liveUrl,
                        originalPrompt: livePreview.prompt,
                        mimeType: 'image/jpeg',
                      }, { live: true })}
                      disabled={downloadingId === livePreview.liveUrl}
                    >
                      {downloadingId === livePreview.liveUrl ? 'Downloading…' : 'Download preview'}
                    </button>
                  </div>
                </div>
              )}
              {livePreview?.error && (
                <div className="ai-image-bubble-text ai-image-live-hint">
                  {livePreview.error}
                </div>
              )}
            </div>
          )}

          {messages.length === 0 && !liveAuto && (
            <p className="empty-state">
              Describe a scene… e.g. “a realistic portrait of a woman in golden hour street light”
            </p>
          )}
          {messages.map((msg, idx) => (
            <div key={`${msg.at}-${idx}`} className={`ai-image-bubble ${msg.role}${msg.error ? ' is-error' : ''}`}>
              <div className="ai-image-bubble-meta">
                {msg.role === 'user' ? 'You' : 'AI'}
                {msg.meta?.provider ? ` · ${msg.meta.provider}` : ''}
              </div>
              <div className="ai-image-bubble-text">{msg.text}</div>
              {msg.image && (
                <div className="ai-image-preview">
                  <img
                    src={blobUrls[msg.image._id] || blobUrls[msg.image.url] || msg.image.url}
                    alt={msg.image.originalPrompt || msg.image.prompt || 'Generated'}
                  />
                  <div className="ai-image-caption">
                    {msg.image.model || msg.meta?.model || ''}
                    {msg.meta?.tried?.length > 1 ? ` · tried ${msg.meta.tried.join(' → ')}` : ''}
                  </div>
                  <div className="ai-image-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownloadImage(msg.image)}
                      disabled={downloadingId === (msg.image._id || msg.image.url)}
                    >
                      {downloadingId === (msg.image._id || msg.image.url) ? 'Downloading…' : 'Download'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleEditImage(msg.image)}
                    >
                      Edit prompt
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {generating && (
            <div className="ai-image-bubble assistant">
              <div className="ai-image-bubble-meta">AI</div>
              <div className="ai-image-bubble-text">Saving high-quality image to history…</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {can('aiimage:generate') && (
          <form className="ai-image-composer" onSubmit={handleSubmit}>
            <textarea
              ref={composerRef}
              rows={3}
              value={prompt}
              onChange={handlePromptChange}
              placeholder={editingImage ? 'Edit this prompt… save to create a new image version' : 'Type here… image auto-updates as you type'}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={generating || !prompt.trim()}>
              {generating ? 'Saving…' : editingImage ? 'Save edited image' : 'Save to chat'}
            </button>
          </form>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="ai-image-history-header">
          <h3>Recent images</h3>
          {can('aiimage:generate') && history.length > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleClearHistory}
              disabled={clearingHistory}
            >
              {clearingHistory ? 'Clearing…' : 'Clear all history'}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="empty-state">No images yet — type above for live preview, then Save to chat</p>
        ) : (
          <div className="ai-image-gallery">
            {history.map((item) => (
              <figure key={item._id} className="ai-image-card">
                <div className="ai-image-card-media">
                  <img
                    src={blobUrls[item._id] || blobUrls[item.url] || item.url}
                    alt={item.originalPrompt || item.prompt}
                  />
                  {can('aiimage:generate') && (
                    <button
                      type="button"
                      className="ai-image-delete-btn"
                      title="Delete image"
                      disabled={deletingId === item._id || clearingHistory}
                      onClick={() => handleDeleteImage(item)}
                    >
                      {deletingId === item._id ? '…' : '×'}
                    </button>
                  )}
                </div>
                <figcaption>
                  <strong>{item.provider}</strong>
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span className="ai-image-prompt">{item.originalPrompt || item.prompt}</span>
                  <div className="ai-image-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownloadImage(item)}
                      disabled={downloadingId === (item._id || item.url)}
                    >
                      {downloadingId === (item._id || item.url) ? 'Downloading…' : 'Download'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleEditImage(item)}
                    >
                      Edit
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
