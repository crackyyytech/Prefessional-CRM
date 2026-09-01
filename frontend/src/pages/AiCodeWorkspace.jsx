import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

function languageForPath(filePath = '') {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'json') return 'json';
  if (ext === 'css') return 'css';
  if (ext === 'html') return 'html';
  if (ext === 'md') return 'markdown';
  if (ext === 'py') return 'python';
  if (ext === 'java') return 'java';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rust';
  if (ext === 'php') return 'php';
  if (ext === 'sql') return 'sql';
  return 'plaintext';
}

function fileDepth(filePath = '') {
  return Math.max(0, filePath.split('/').length - 1);
}

export default function AiCodeWorkspace() {
  const { can } = useAuth();
  const [status, setStatus] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [files, setFiles] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activePath, setActivePath] = useState('');
  const [contents, setContents] = useState({});
  const [dirty, setDirty] = useState({});
  const [prompt, setPrompt] = useState('Build a React app with a clean layout and README');
  const [provider, setProvider] = useState('auto');
  const [cursorModel, setCursorModel] = useState('composer-2.5');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [pane, setPane] = useState('editor'); // editor | preview | console
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewEntry, setPreviewEntry] = useState('');
  const [inspect, setInspect] = useState(null);
  const [consoleResult, setConsoleResult] = useState(null);

  const activeContent = activePath ? contents[activePath] || '' : '';

  const loadStatus = useCallback(async () => {
    const data = await api.getAiCodeStatus();
    setStatus(data);
    if (data.defaultProvider) setProvider(data.defaultProvider);
    if (data.cursorModels?.[0]) setCursorModel(data.cursorModels[0]);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    const items = await api.getAiCodeWorkspaces();
    setWorkspaces(items || []);
    if (!workspace && items?.[0]) setWorkspace(items[0]);
    return items || [];
  }, [workspace]);

  const loadFiles = useCallback(async (target = workspace) => {
    if (!target?._id) {
      setFiles([]);
      setInspect(null);
      return [];
    }
    const items = await api.getAiCodeFiles(target._id);
    setFiles(items || []);
    try {
      const info = await api.inspectAiCodeWorkspace(target._id);
      setInspect(info);
    } catch {
      setInspect(null);
    }
    return items || [];
  }, [workspace]);

  useEffect(() => {
    Promise.all([loadStatus(), loadWorkspaces()]).catch((err) => setError(err.message));
  }, [loadStatus, loadWorkspaces]);

  useEffect(() => {
    if (!workspace?._id) return;
    loadFiles(workspace).catch((err) => setError(err.message));
  }, [workspace?._id, loadFiles]);

  const ensureWorkspace = async () => {
    if (workspace?._id) return workspace;
    const created = await api.createAiCodeWorkspace({ name: 'AI Code Workspace' });
    setWorkspace(created);
    setWorkspaces((prev) => [created, ...prev]);
    return created;
  };

  const createWorkspace = async () => {
    if (!can('aicode:run')) return;
    setBusy(true);
    setError('');
    try {
      const created = await api.createAiCodeWorkspace({ name: 'AI Code Workspace' });
      setWorkspace(created);
      setWorkspaces((prev) => [created, ...prev]);
      setFiles([]);
      setOpenTabs([]);
      setActivePath('');
      setContents({});
      setDirty({});
      setSummary('');
      setPreviewHtml('');
      setPreviewEntry('');
      setConsoleResult(null);
      setInspect(null);
      setPane('editor');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteWorkspace = async () => {
    if (!workspace?._id || !can('aicode:run')) return;
    if (!window.confirm('Delete this code workspace and all files?')) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAiCodeWorkspace(workspace._id);
      const next = workspaces.filter((item) => item._id !== workspace._id);
      setWorkspaces(next);
      setWorkspace(next[0] || null);
      setFiles([]);
      setOpenTabs([]);
      setActivePath('');
      setContents({});
      setDirty({});
      setPreviewHtml('');
      setConsoleResult(null);
      setInspect(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (filePath) => {
    if (!workspace?._id || !filePath) return;
    setError('');
    try {
      if (!Object.prototype.hasOwnProperty.call(contents, filePath)) {
        const file = await api.getAiCodeFile(workspace._id, filePath);
        setContents((prev) => ({ ...prev, [filePath]: file.content || '' }));
      }
      setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
      setActivePath(filePath);
      setPane('editor');
    } catch (err) {
      setError(err.message);
    }
  };

  const closeTab = (filePath) => {
    if (dirty[filePath] && !window.confirm(`Close ${filePath} with unsaved changes?`)) return;
    setOpenTabs((prev) => prev.filter((tab) => tab !== filePath));
    setDirty((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
    if (activePath === filePath) {
      const remaining = openTabs.filter((tab) => tab !== filePath);
      setActivePath(remaining[remaining.length - 1] || '');
    }
  };

  const saveActiveFile = async () => {
    if (!workspace?._id || !activePath || !can('aicode:run')) return;
    setSaving(true);
    setError('');
    try {
      await api.saveAiCodeFile(workspace._id, {
        path: activePath,
        content: contents[activePath] || '',
      });
      setDirty((prev) => ({ ...prev, [activePath]: false }));
      await loadFiles(workspace);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async (preferredPath = '') => {
    if (!workspace?._id) return;
    setRunning(true);
    setError('');
    try {
      // Save dirty files first so preview reflects latest edits
      if (can('aicode:run')) {
        const dirtyPaths = Object.keys(dirty).filter((key) => dirty[key]);
        for (const filePath of dirtyPaths) {
          await api.saveAiCodeFile(workspace._id, {
            path: filePath,
            content: contents[filePath] || '',
          });
        }
        if (dirtyPaths.length) {
          setDirty({});
          await loadFiles(workspace);
        }
      }

      const pathHint = preferredPath
        || (activePath && /\.html$/i.test(activePath) ? activePath : '')
        || '';
      const preview = await api.previewAiCodeWorkspace(workspace._id, pathHint);
      setPreviewHtml(preview.html || '');
      setPreviewEntry(preview.entry || '');
      setPane('preview');
      setSummary(`Preview ready · ${preview.entry}`);
    } catch (err) {
      setError(err.message);
      setPane('preview');
    } finally {
      setRunning(false);
    }
  };

  const runExecute = async () => {
    if (!workspace?._id || !can('aicode:run')) return;
    setRunning(true);
    setError('');
    setConsoleResult(null);
    try {
      if (can('aicode:run')) {
        const dirtyPaths = Object.keys(dirty).filter((key) => dirty[key]);
        for (const filePath of dirtyPaths) {
          await api.saveAiCodeFile(workspace._id, {
            path: filePath,
            content: contents[filePath] || '',
          });
        }
        if (dirtyPaths.length) setDirty({});
      }
      const entry = (activePath && /\.(js|mjs|cjs)$/i.test(activePath))
        ? activePath
        : (inspect?.jsEntry || '');
      const result = await api.executeAiCodeWorkspace(workspace._id, { entry });
      setConsoleResult(result);
      setPane('console');
      setSummary(
        result.timedOut
          ? `Timed out running ${result.entry}`
          : `Executed ${result.entry} · exit ${result.exitCode} · ${result.durationMs}ms`
      );
    } catch (err) {
      setError(err.message);
      setPane('console');
    } finally {
      setRunning(false);
    }
  };

  const executeToView = async () => {
    if (!workspace?._id) return;
    setError('');
    // Prefer HTML preview when available; otherwise execute JS
    const wantsHtml = (activePath && /\.html$/i.test(activePath))
      || inspect?.canPreview
      || files.some((f) => /\.html$/i.test(f.path));
    if (wantsHtml) {
      await runPreview();
      return;
    }
    await runExecute();
  };

  const generateWorkspace = async (event) => {
    event.preventDefault();
    if (!can('aicode:run')) return;
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setError('');
    setSummary('');
    try {
      const target = await ensureWorkspace();
      const result = await api.generateAiCodeWorkspace(target._id, {
        prompt: text,
        provider,
        model: provider === 'cursor' || provider === 'auto' ? cursorModel : '',
      });
      setWorkspace(result.workspace);
      setSummary(`${result.summary || result.message} · ${result.provider} / ${result.model}`);
      setFiles(result.files || []);
      setWorkspaces((prev) => [result.workspace, ...prev.filter((item) => item._id !== result.workspace._id)]);
      setContents({});
      setDirty({});
      setConsoleResult(null);
      setPreviewHtml('');
      const info = await api.inspectAiCodeWorkspace(result.workspace._id);
      setInspect(info);
      const firstFile = (result.files || []).find((file) => /index\.html$/i.test(file.path))
        || (result.files || []).find((file) => /readme|package\.json|src\//i.test(file.path))
        || result.files?.[0];
      if (firstFile) {
        const file = await api.getAiCodeFile(result.workspace._id, firstFile.path);
        setContents({ [firstFile.path]: file.content || '' });
        setOpenTabs([firstFile.path]);
        setActivePath(firstFile.path);
      }
      if (info.canPreview) {
        const preview = await api.previewAiCodeWorkspace(result.workspace._id, info.htmlEntry || '');
        setPreviewHtml(preview.html || '');
        setPreviewEntry(preview.entry || '');
        setPane('preview');
      } else {
        setPane('editor');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onEditorChange = (value) => {
    if (!activePath) return;
    setContents((prev) => ({ ...prev, [activePath]: value || '' }));
    setDirty((prev) => ({ ...prev, [activePath]: true }));
  };

  const providers = status?.providers || [{ id: 'auto', label: 'All providers (auto-merge)' }];
  const cursorModels = status?.cursorModels || ['composer-2.5', 'auto', 'composer-2'];
  const canPreview = Boolean(inspect?.canPreview || files.some((f) => /\.html$/i.test(f.path)));
  const canExecute = Boolean(inspect?.canExecute || (activePath && /\.(js|mjs|cjs)$/i.test(activePath)));

  return (
    <>
      <div className="page-header">
        <div>
          <h2>AI Code Workspace</h2>
          <p>Generate code, edit like VS Code, then Execute / View the result.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={createWorkspace} disabled={busy || !can('aicode:run')}>
            New workspace
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={executeToView}
            disabled={busy || running || !workspace || (!canPreview && !canExecute)}
          >
            {running ? 'Running…' : 'Execute / View'}
          </button>
          <button type="button" className="btn btn-danger" onClick={deleteWorkspace} disabled={busy || !workspace || !can('aicode:run')}>
            Delete
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {summary && <div className="success-banner">{summary}</div>}

      <section className="panel ai-code-toolbar">
        <label>
          Workspace
          <select
            value={workspace?._id || ''}
            onChange={(event) => {
              const next = workspaces.find((item) => item._id === event.target.value) || null;
              setWorkspace(next);
              setOpenTabs([]);
              setActivePath('');
              setContents({});
              setDirty({});
              setPreviewHtml('');
              setConsoleResult(null);
              setPane('editor');
            }}
          >
            <option value="">Create on generate</option>
            {workspaces.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} · {formatDateTime(item.updatedAt)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label || item.id}{item.model ? ` · ${item.model}` : ''}
              </option>
            ))}
          </select>
        </label>
        {(provider === 'auto' || provider === 'cursor') && (
          <label>
            Cursor model
            <select value={cursorModel} onChange={(event) => setCursorModel(event.target.value)}>
              {cursorModels.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="ai-code-shell">
        <aside className="ai-code-sidebar">
          <div className="ai-code-sidebar-title">Explorer</div>
          {files.length === 0 ? (
            <p className="empty-state">No files yet. Generate a workspace first.</p>
          ) : (
            <div className="ai-code-file-list">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={`ai-code-file${activePath === file.path ? ' active' : ''}`}
                  style={{ paddingLeft: 12 + fileDepth(file.path) * 14 }}
                  onClick={() => openFile(file.path)}
                >
                  <span>{file.path.split('/').pop()}</span>
                  <small>{file.path}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="ai-code-editor-pane">
          <div className="ai-code-tabs">
            <button type="button" className={`ai-code-tab${pane === 'editor' ? ' active' : ''}`} onClick={() => setPane('editor')}>
              Code
            </button>
            <button type="button" className={`ai-code-tab${pane === 'preview' ? ' active' : ''}`} onClick={() => (previewHtml ? setPane('preview') : runPreview())} disabled={!workspace || (!canPreview && !previewHtml)}>
              View
            </button>
            <button type="button" className={`ai-code-tab${pane === 'console' ? ' active' : ''}`} onClick={() => setPane('console')} disabled={!consoleResult && !canExecute}>
              Console
            </button>
            {openTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`ai-code-tab${pane === 'editor' && activePath === tab ? ' active' : ''}`}
                onClick={() => { setActivePath(tab); setPane('editor'); }}
              >
                {dirty[tab] ? '● ' : ''}{tab.split('/').pop()}
                <span onClick={(event) => { event.stopPropagation(); closeTab(tab); }}>×</span>
              </button>
            ))}
            <div className="ai-code-actions">
              <button type="button" className="btn btn-secondary" onClick={saveActiveFile} disabled={!activePath || saving || !dirty[activePath]}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => runPreview()} disabled={!workspace || running || !canPreview}>
                Preview HTML
              </button>
              <button type="button" className="btn btn-secondary" onClick={runExecute} disabled={!workspace || running || !canExecute || !can('aicode:run')}>
                Run JS
              </button>
            </div>
          </div>

          <div className="ai-code-editor">
            {pane === 'preview' ? (
              previewHtml ? (
                <div className="ai-code-preview">
                  <div className="ai-code-preview-bar">Live view · {previewEntry || 'index.html'}</div>
                  <iframe
                    title="AI Code Preview"
                    className="ai-code-preview-frame"
                    sandbox="allow-scripts allow-forms allow-modals"
                    srcDoc={previewHtml}
                  />
                </div>
              ) : (
                <div className="ai-code-empty">
                  <strong>No preview yet</strong>
                  <p>Generate an HTML app, then click Execute / View.</p>
                </div>
              )
            ) : pane === 'console' ? (
              <div className="ai-code-console">
                {!consoleResult ? (
                  <div className="ai-code-empty">
                    <strong>Console</strong>
                    <p>Click Run JS or Execute / View for Node output.</p>
                  </div>
                ) : (
                  <>
                    <div className="ai-code-console-meta">
                      {consoleResult.entry} · exit {consoleResult.exitCode}
                      {consoleResult.timedOut ? ' · timed out' : ''} · {consoleResult.durationMs}ms
                    </div>
                    {consoleResult.stdout ? (
                      <pre className="ai-code-console-out">{consoleResult.stdout}</pre>
                    ) : (
                      <pre className="ai-code-console-out muted">(no stdout)</pre>
                    )}
                    {consoleResult.stderr ? (
                      <pre className="ai-code-console-err">{consoleResult.stderr}</pre>
                    ) : null}
                  </>
                )}
              </div>
            ) : activePath ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={activePath}
                language={languageForPath(activePath)}
                value={activeContent}
                onChange={onEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div className="ai-code-empty">
                <strong>AI Code Workspace</strong>
                <p>Generate a project, then Execute / View to see it run.</p>
              </div>
            )}
          </div>
        </main>
      </section>

      <form className="panel ai-code-prompt" onSubmit={generateWorkspace}>
        <textarea
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the app, component, API, script, or full project you want…"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !prompt.trim() || !can('aicode:run')}>
          {busy ? 'Generating…' : 'Generate code'}
        </button>
      </form>
    </>
  );
}
