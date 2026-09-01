import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  PROVIDER_MODEL_FALLBACKS,
  buildSystemPrompt,
  runAiChat,
} from './aiProvider.js';
import { getAppSettings, listReadyAiProviders, resolveAiRuntime } from '../models/AppSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AI_CODE_DIR = path.join(__dirname, '..', 'uploads', 'ai-code');
const MAX_FILE_BYTES = 750_000;
const MAX_GENERATED_FILES = 80;
const MAX_EXECUTE_MS = 12_000;
const MAX_OUTPUT_CHARS = 40_000;

if (!fs.existsSync(AI_CODE_DIR)) {
  fs.mkdirSync(AI_CODE_DIR, { recursive: true });
}

function workspaceRoot(userId, workspaceId) {
  return path.join(AI_CODE_DIR, String(userId), String(workspaceId));
}

function safeRelativePath(filePath = '') {
  const cleaned = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) throw new Error('File path is required');
  const normalized = path.posix.normalize(cleaned);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Unsafe file path');
  }
  return normalized;
}

function resolveSafePath(root, filePath) {
  const rel = safeRelativePath(filePath);
  const fullPath = path.resolve(root, rel);
  const rootPath = path.resolve(root);
  if (!fullPath.startsWith(rootPath + path.sep) && fullPath !== rootPath) {
    throw new Error('Unsafe file path');
  }
  return { rel, fullPath };
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function removeDir(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

async function walkFiles(root, dir = root, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      await walkFiles(root, fullPath, out);
      continue;
    }
    const stat = await fs.promises.stat(fullPath);
    out.push({
      path: rel,
      name: entry.name,
      size: stat.size,
      updatedAt: stat.mtime,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function initWorkspaceDir(workspace) {
  const root = workspaceRoot(workspace.createdBy, workspace._id);
  await ensureDir(root);
  if (workspace.rootDir !== root) {
    workspace.rootDir = root;
    await workspace.save();
  }
  return root;
}

export async function deleteWorkspaceDir(workspace) {
  const root = workspace.rootDir || workspaceRoot(workspace.createdBy, workspace._id);
  await removeDir(root);
}

export async function listWorkspaceFiles(workspace) {
  const root = await initWorkspaceDir(workspace);
  return walkFiles(root);
}

export async function readWorkspaceFile(workspace, filePath) {
  const root = await initWorkspaceDir(workspace);
  const { rel, fullPath } = resolveSafePath(root, filePath);
  if (!fs.existsSync(fullPath)) throw new Error('File not found');
  const stat = await fs.promises.stat(fullPath);
  if (stat.size > MAX_FILE_BYTES) throw new Error('File is too large to open');
  const content = await fs.promises.readFile(fullPath, 'utf8');
  return { path: rel, content, size: stat.size, updatedAt: stat.mtime };
}

export async function writeWorkspaceFile(workspace, filePath, content) {
  const root = await initWorkspaceDir(workspace);
  const { rel, fullPath } = resolveSafePath(root, filePath);
  const text = String(content ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('File is too large to save');
  }
  await ensureDir(path.dirname(fullPath));
  await fs.promises.writeFile(fullPath, text, 'utf8');
  return readWorkspaceFile(workspace, rel);
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI did not return a file manifest');
  return JSON.parse(candidate.slice(start, end + 1));
}

function makeJsonGenerationPrompt(prompt) {
  return `Generate a complete, runnable code project from this request:
${prompt}

Return ONLY valid JSON in this exact shape:
{
  "summary": "short summary",
  "files": [
    { "path": "package.json", "content": "file contents" }
  ]
}

Rules:
- Include all essential files for a working project.
- Use relative paths only.
- Do not include explanations outside JSON.
- Do not include node_modules, lockfiles, binary files, images, or secrets.
- Keep each file concise and complete.`;
}

function makeCursorPrompt(prompt) {
  return `You are generating a project inside the current working directory.

User request:
${prompt}

Create or update files directly in this sandbox workspace. Do not edit parent directories. Build a complete runnable project with sensible filenames. Include a README with run instructions. After writing files, reply with a concise summary and list the main files created.`;
}

async function writeManifestFiles(workspace, manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (!files.length) throw new Error('AI returned no files');
  if (files.length > MAX_GENERATED_FILES) throw new Error('AI returned too many files');

  for (const file of files) {
    const rel = safeRelativePath(file.path);
    await writeWorkspaceFile(workspace, rel, String(file.content ?? ''));
  }
  return files.length;
}

async function generateWithCursor({ workspace, runtime, prompt, model }) {
  const { Agent, CursorAgentError } = await import('@cursor/sdk');
  const root = await initWorkspaceDir(workspace);
  const models = [
    model || runtime.aiModel,
    ...(PROVIDER_MODEL_FALLBACKS.cursor || []).filter((m) => m !== model && m !== runtime.aiModel),
  ].filter(Boolean);

  let lastError = 'Cursor code generation failed';
  for (const modelId of models) {
    try {
      const result = await Agent.prompt(makeCursorPrompt(prompt), {
        apiKey: runtime.aiApiKey,
        model: { id: modelId },
        local: { cwd: root, settingSources: [] },
      });
      if (result.status === 'error') {
        lastError = String(result.result || lastError);
        continue;
      }
      const files = await walkFiles(root);
      if (!files.length) {
        lastError = 'Cursor completed but did not create files';
        continue;
      }
      return {
        provider: 'cursor',
        model: modelId,
        summary: String(result.result || 'Workspace generated').trim(),
        filesCount: files.length,
        providersTried: ['cursor'],
      };
    } catch (error) {
      if (error?.name === 'CursorAgentError' || error instanceof CursorAgentError) {
        lastError = `Cursor API: ${error.message}`;
      } else {
        lastError = error.message || String(error);
      }
      if (!/model|not found|invalid|empty|did not create/i.test(lastError)) break;
    }
  }
  throw new Error(lastError);
}

async function generateWithChatProvider({ workspace, runtime, prompt }) {
  const systemPrompt = `${buildSystemPrompt({})}

You are an expert software generator. Return only strict JSON file manifests for complete runnable projects.`;
  const reply = await runAiChat({
    settings: runtime,
    messages: [{ role: 'user', content: makeJsonGenerationPrompt(prompt) }],
    systemPrompt,
    temperature: 0.2,
    maxTokens: 12000,
  });
  const manifest = extractJson(reply);
  const filesCount = await writeManifestFiles(workspace, manifest);
  return {
    provider: runtime.aiProvider,
    model: runtime.aiModel,
    summary: String(manifest.summary || 'Workspace generated').trim(),
    filesCount,
    providersTried: [runtime.aiProvider],
  };
}

export async function generateCodeWorkspace({ workspace, prompt, provider = 'auto', model = '' }) {
  const settings = await getAppSettings();
  const ready = listReadyAiProviders(settings);
  if (!ready.length) {
    throw new Error('No AI provider is configured. Add API keys in Settings → AI integrations.');
  }

  const isAuto = !provider || provider === 'auto' || provider === 'all';
  const readyIds = ready.map((p) => p.id);
  const queue = isAuto
    ? [...new Set(['cursor', settings.aiProvider, ...readyIds].filter(Boolean))]
    : [provider, ...readyIds.filter((id) => id !== provider)];

  const tried = [];
  const providerErrors = {};
  let lastError = 'AI code generation failed';

  await initWorkspaceDir(workspace);
  for (const providerId of queue) {
    const runtime = resolveAiRuntime(settings, providerId);
    if (!runtime || tried.includes(runtime.aiProvider)) continue;
    tried.push(runtime.aiProvider);
    try {
      if (runtime.aiProvider === 'cursor') {
        const result = await generateWithCursor({ workspace, runtime, prompt, model });
        return { ...result, providersTried: tried, mergeMode: isAuto };
      }
      const result = await generateWithChatProvider({ workspace, runtime, prompt });
      return { ...result, providersTried: tried, mergeMode: isAuto };
    } catch (error) {
      lastError = error.message || String(error);
      providerErrors[runtime.aiProvider] = lastError;
    }
  }

  throw new Error(`${lastError}${Object.keys(providerErrors).length ? ` (${Object.entries(providerErrors).map(([id, msg]) => `${id}: ${msg}`).join(' | ')})` : ''}`);
}

export function aiCodeStatus(settings) {
  const providers = listReadyAiProviders(settings);
  return {
    enabled: providers.length > 0,
    defaultProvider: 'auto',
    mergeMode: true,
    providers: [
      { id: 'auto', label: 'All providers (auto-merge)', model: `${providers.length} providers`, isAuto: true },
      ...providers,
    ],
    cursorModels: PROVIDER_MODEL_FALLBACKS.cursor || ['composer-2.5', 'auto', 'composer-2'],
    features: {
      previewHtml: true,
      executeNode: true,
      saveFiles: true,
    },
  };
}

function pickPreferred(files, patterns) {
  for (const pattern of patterns) {
    const hit = files.find((file) => pattern.test(file.path));
    if (hit) return hit.path;
  }
  return '';
}

async function readOptionalFile(workspace, filePath) {
  try {
    return await readWorkspaceFile(workspace, filePath);
  } catch {
    return null;
  }
}

function toPosixJoin(baseDir, relative) {
  const base = String(baseDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const rel = String(relative || '').replace(/\\/g, '/');
  if (!rel || /^(https?:|data:|blob:|#|\/\/)/i.test(rel)) return null;
  if (rel.startsWith('/')) return safeRelativePath(rel.slice(1));
  const joined = path.posix.normalize(`${base}/${rel}`.replace(/^\.\//, ''));
  return safeRelativePath(joined);
}

async function inlineHtmlAssets(workspace, html, htmlPath) {
  const baseDir = path.posix.dirname(htmlPath).replace(/^\.$/, '');
  let out = String(html || '');

  const linkRe = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const links = [...out.matchAll(linkRe)];
  for (const match of links) {
    const href = match[1];
    const assetPath = toPosixJoin(baseDir, href);
    if (!assetPath || !/\.css$/i.test(assetPath)) continue;
    const file = await readOptionalFile(workspace, assetPath);
    if (!file) continue;
    out = out.replace(match[0], `<style data-from="${assetPath}">\n${file.content}\n</style>`);
  }

  const scriptRe = /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi;
  const scripts = [...out.matchAll(scriptRe)];
  for (const match of scripts) {
    const src = match[2];
    const assetPath = toPosixJoin(baseDir, src);
    if (!assetPath || !/\.(js|mjs|cjs)$/i.test(assetPath)) continue;
    const file = await readOptionalFile(workspace, assetPath);
    if (!file) continue;
    out = out.replace(
      match[0],
      `<script data-from="${assetPath}"${match[1]}${match[3]}>\n${file.content}\n</script>`
    );
  }

  return out;
}

export async function inspectWorkspace(workspace) {
  const files = await listWorkspaceFiles(workspace);
  const htmlEntry = pickPreferred(files, [
    /^index\.html$/i,
    /\/index\.html$/i,
    /\.html$/i,
  ]);
  let jsEntry = pickPreferred(files, [
    /^index\.(js|mjs|cjs)$/i,
    /^main\.(js|mjs|cjs)$/i,
    /^app\.(js|mjs|cjs)$/i,
    /\.(js|mjs|cjs)$/i,
  ]);

  const pkg = await readOptionalFile(workspace, 'package.json');
  if (pkg?.content) {
    try {
      const parsed = JSON.parse(pkg.content);
      const main = String(parsed.main || '').trim();
      if (main) {
        const normalized = safeRelativePath(main);
        if (files.some((f) => f.path === normalized)) jsEntry = normalized;
      }
    } catch {
      // ignore invalid package.json
    }
  }

  return {
    filesCount: files.length,
    htmlEntry: htmlEntry || null,
    jsEntry: jsEntry || null,
    canPreview: Boolean(htmlEntry),
    canExecute: Boolean(jsEntry),
    files,
  };
}

export async function buildHtmlPreview(workspace, preferredPath = '') {
  const inspect = await inspectWorkspace(workspace);
  const entry = preferredPath
    ? safeRelativePath(preferredPath)
    : inspect.htmlEntry;
  if (!entry || !/\.html$/i.test(entry)) {
    throw new Error('No HTML file found to preview. Generate an HTML app or open an .html file.');
  }
  const file = await readWorkspaceFile(workspace, entry);
  const html = await inlineHtmlAssets(workspace, file.content, entry);
  return {
    type: 'html',
    entry,
    html,
    canExecute: inspect.canExecute,
    jsEntry: inspect.jsEntry,
  };
}

export async function executeWorkspace(workspace, { entry = '', timeoutMs = MAX_EXECUTE_MS } = {}) {
  const inspect = await inspectWorkspace(workspace);
  const root = await initWorkspaceDir(workspace);
  const chosen = entry ? safeRelativePath(entry) : inspect.jsEntry;
  if (!chosen) {
    throw new Error('No JavaScript entry file found to execute. Open/generate a .js file first.');
  }
  if (!/\.(js|mjs|cjs)$/i.test(chosen)) {
    throw new Error('Only .js / .mjs / .cjs files can be executed in the sandbox.');
  }

  const { fullPath } = resolveSafePath(root, chosen);
  if (!fs.existsSync(fullPath)) throw new Error('Entry file not found');

  const limit = Math.min(Math.max(Number(timeoutMs) || MAX_EXECUTE_MS, 1000), MAX_EXECUTE_MS);
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(process.execPath, [fullPath], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        AI_CODE_SANDBOX: '1',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve({
        type: 'execute',
        entry: chosen,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
        stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
        truncated: stdout.length > MAX_OUTPUT_CHARS || stderr.length > MAX_OUTPUT_CHARS,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, limit);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_OUTPUT_CHARS + 1000) stdout = stdout.slice(0, MAX_OUTPUT_CHARS);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_OUTPUT_CHARS + 1000) stderr = stderr.slice(0, MAX_OUTPUT_CHARS);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      stderr += `\n${error.message}`;
      finish(1);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(timedOut ? 124 : (code ?? 1));
    });
  });
}
