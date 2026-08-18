#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://sorrycode.com/v1';
const STANDARD_MODEL = 'gpt-image-2-all';
const HIGH_RES_MODEL = 'gpt-image-2';
const SUPPORTED_MODELS = [STANDARD_MODEL, HIGH_RES_MODEL];
const STANDARD_MAX_PIXELS = 2_100_000;
const HIGH_RES_EDGE = 2048;
const FALLBACK_KEY_GUIDANCE = 'Create or select a SorryCode API key from the Image2 group, then set it as SORRYCODE_API_KEY. This fallback key does not replace your current Codex GPT key.';

function isSorryCodeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'sorrycode.com' || hostname.endsWith('.sorrycode.com');
  } catch {
    return false;
  }
}

export function parseCodexSorryCodeConfig(content) {
  if (!/^model_provider\s*=\s*["']sorrycode["']\s*(?:#.*)?$/m.test(content)) return null;
  const sectionStart = content.search(/^\[model_providers\.sorrycode\]\s*$/m);
  if (sectionStart === -1) return null;
  const afterHeader = content.slice(sectionStart).replace(/^\[model_providers\.sorrycode\]\s*\r?\n?/, '');
  const nextSection = afterHeader.search(/^\[/m);
  const section = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);
  const stringValue = (key) => {
    const match = new RegExp(`^${key}\\s*=\\s*(["'])(.*?)\\1\\s*(?:#.*)?$`, 'm').exec(section);
    return match?.[2] || null;
  };
  const baseUrl = stringValue('base_url');
  if (!isSorryCodeUrl(baseUrl)) return null;
  return {
    providerId: 'sorrycode',
    baseUrl,
    envKey: stringValue('env_key'),
    requiresOpenAIAuth: /^requires_openai_auth\s*=\s*true\s*(?:#.*)?$/m.test(section),
  };
}

export async function resolveCredentialCandidates({ env = process.env, home = homedir(), read = readFile } = {}) {
  const codexHome = env.CODEX_HOME?.trim() || join(home, '.codex');
  let provider = null;
  try {
    provider = parseCodexSorryCodeConfig(await read(join(codexHome, 'config.toml'), 'utf8'));
  } catch {}

  let currentKey = '';
  if (provider?.envKey) {
    currentKey = env[provider.envKey]?.trim() || '';
  } else if (provider?.requiresOpenAIAuth) {
    try {
      const auth = JSON.parse(await read(join(codexHome, 'auth.json'), 'utf8'));
      currentKey = typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY.trim() : '';
    } catch {}
  }

  const fallbackKey = env.SORRYCODE_API_KEY?.trim() || '';
  const candidates = [];
  if (currentKey) candidates.push({ key: currentKey, source: 'codex' });
  if (fallbackKey && fallbackKey !== currentKey) candidates.push({ key: fallbackKey, source: 'fallback' });

  return { candidates, providerBaseUrl: provider?.baseUrl || null };
}

export function shouldTryFallbackKey(status, responseText) {
  if (status === 401 || status === 403) return true;
  const message = responseText.toLowerCase();
  if (status === 400) {
    return message.includes('image model') ||
      message.includes('image generation disabled') ||
      message.includes('permission');
  }
  return status === 503 && message.includes('no available compatible accounts');
}

export function redactCredentialText(value, candidates) {
  let redacted = String(value);
  for (const candidate of candidates) {
    if (candidate.key) redacted = redacted.replaceAll(candidate.key, '[REDACTED]');
  }
  return redacted;
}

export async function executeCredentialAttempts({ endpoint, candidates, buildRequest, fetchImpl = fetch, onFallback }) {
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const { headers, body } = buildRequest(candidate.key);
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', headers, body });
    } catch (error) {
      throw new Error(`SorryCode image request did not complete (${error instanceof Error ? error.message : String(error)}). The fallback key was not tried because the first request may still be processing.`);
    }
    if (response.ok) return { response, credentialSource: candidate.source, responseText: null };

    const responseText = await response.text();
    const fallback = candidates[i + 1];
    const canTryFallback = candidate.source === 'codex' &&
      fallback?.source === 'fallback' &&
      shouldTryFallbackKey(response.status, responseText);
    if (canTryFallback) {
      await onFallback?.({ response, responseText });
      continue;
    }
    return { response, credentialSource: candidate.source, responseText };
  }
  return { response: null, credentialSource: null, responseText: null };
}

export function selectDefaultModel(size) {
  if (!size || size === 'auto') return STANDARD_MODEL;

  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return STANDARD_MODEL;

  const width = Number(match[1]);
  const height = Number(match[2]);
  const isStandardSize =
    Math.max(width, height) < HIGH_RES_EDGE &&
    width * height <= STANDARD_MAX_PIXELS;

  return isStandardSize ? STANDARD_MODEL : HIGH_RES_MODEL;
}

export function parseArgs(argv) {
  const args = {
    mode: 'generate',
    size: '1024x1024',
    model: undefined,
    n: 1,
    partialImages: 2,
    stream: true,
    promptLog: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'help') args.help = true;
    else if (key === 'mode') { args.mode = next; i += 1; }
    else if (key === 'prompt') { args.prompt = next; i += 1; }
    else if (key === 'prompt-file') { args.promptFile = next; i += 1; }
    else if (key === 'image') { args.image = next; i += 1; }
    else if (key === 'out') { args.out = next; i += 1; }
    else if (key === 'size') { args.size = next; i += 1; }
    else if (key === 'model') { args.model = next; i += 1; }
    else if (key === 'base-url') { args.baseUrl = next; i += 1; }
    else if (key === 'n') { args.n = Number.parseInt(next, 10); i += 1; }
    else if (key === 'partial-images') { args.partialImages = Number.parseInt(next, 10); i += 1; }
    else if (key === 'no-stream') args.stream = false;
    else if (key === 'stream') args.stream = true;
    else if (key === 'no-prompt-log') args.promptLog = false;
    else if (key === 'prompt-log') args.promptLog = true;
  }
  args.model ??= selectDefaultModel(args.size);
  return args;
}

function usage() {
  return `Usage:
  node scripts/sorrycode-image2.mjs --prompt "<image prompt>" --out outputs/images/run
  node scripts/sorrycode-image2.mjs --prompt-file runtime-prompt.md --no-prompt-log --out outputs/images/run
  node scripts/sorrycode-image2.mjs --mode edit --image ./input.png --prompt "<edit instruction>" --out outputs/images/edit

Supported models:
  ${SUPPORTED_MODELS.join('\n  ')}

Automatic model selection:
  gpt-image-2-all   auto and standard sizes below 2K (up to about 2.1 MP)
  gpt-image-2       2K and 4K sizes
  --model           overrides automatic selection

Environment:
  CODEX_HOME           optional, defaults to ~/.codex
  SORRYCODE_API_KEY    optional Image2-group fallback key
  SORRYCODE_BASE_URL   optional endpoint override, defaults to the active SorryCode provider
`;
}

function normalizeBaseUrl(value) {
  const raw = (value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

function endpointFor(baseUrl, mode) {
  return `${baseUrl}/images/${mode === 'edit' ? 'edits' : 'generations'}`;
}

async function resolvePrompt(args) {
  if (args.promptFile) return (await readFile(args.promptFile, 'utf8')).trim();
  return (args.prompt || '').trim();
}

function headersToText(headers) {
  return [...headers.entries()].map(([key, value]) => `${key}: ${value}`).join('\n') + '\n';
}

function extensionFromMime(mime) {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

function imageFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.b64_json === 'string' && payload.b64_json) {
    return { kind: 'b64', value: payload.b64_json, mime: 'image/png' };
  }
  if (typeof payload.url === 'string' && payload.url) {
    return { kind: 'url', value: payload.url };
  }
  if (Array.isArray(payload.data) && payload.data.length > 0) {
    for (let i = payload.data.length - 1; i >= 0; i -= 1) {
      const image = imageFromPayload(payload.data[i]);
      if (image) return image;
    }
  }
  if (Array.isArray(payload.output) && payload.output.length > 0) {
    for (let i = payload.output.length - 1; i >= 0; i -= 1) {
      const image = imageFromPayload(payload.output[i]);
      if (image) return image;
    }
  }
  if (payload.type === 'image_generation_call' && typeof payload.result === 'string' && payload.result) {
    return { kind: 'b64', value: payload.result, mime: `image/${payload.output_format || 'png'}` };
  }
  return null;
}

async function saveImage(outDir, image) {
  if (!image) return null;
  if (image.kind === 'url') {
    await writeFile(join(outDir, 'image-url.txt'), `${image.value}\n`, 'utf8');
    return 'image-url.txt';
  }
  const match = image.value.match(/^data:([^;]+);base64,(.*)$/s);
  const mime = match ? match[1] : image.mime || 'image/png';
  const b64 = match ? match[2] : image.value;
  const file = `image.${extensionFromMime(mime)}`;
  await writeFile(join(outDir, file), Buffer.from(b64, 'base64'));
  return file;
}

function parseSSEBlock(block) {
  let event = '';
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  const data = dataLines.join('\n');
  let json = null;
  if (data && data !== '[DONE]') {
    try { json = JSON.parse(data); } catch {}
  }
  return { event, data, json };
}

async function readStreamingResponse(response, outDir) {
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  let finalPayload = null;
  let firstEventAt = null;
  const startedAt = Date.now();

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let splitIndex;
    while ((splitIndex = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, splitIndex);
      const separator = buffer.match(/\r?\n\r?\n/)[0];
      buffer = buffer.slice(splitIndex + separator.length);
      if (!block.trim()) continue;
      if (firstEventAt == null) firstEventAt = Date.now();
      const parsed = parseSSEBlock(block);
      events.push({ event: parsed.event, data: parsed.json ?? parsed.data });
      if (parsed.json && /completed$/.test(parsed.event || parsed.json.type || '')) {
        finalPayload = parsed.json;
      }
      if (parsed.data === '[DONE]') break;
    }
  }

  await writeFile(join(outDir, 'events.ndjson'), events.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
  await writeFile(join(outDir, 'response.json'), JSON.stringify(finalPayload ?? { events }, null, 2), 'utf8');
  return {
    finalPayload,
    eventCount: events.length,
    firstEventMs: firstEventAt == null ? null : firstEventAt - startedAt,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (!SUPPORTED_MODELS.includes(args.model)) {
    throw new Error(`Unsupported model "${args.model}". Supported models: ${SUPPORTED_MODELS.join(', ')}.`);
  }

  const credentials = await resolveCredentialCandidates();
  if (credentials.candidates.length === 0) {
    throw new Error(`No reusable SorryCode key was found in the active Codex provider. ${FALLBACK_KEY_GUIDANCE}`);
  }
  const credentialKeys = credentials.candidates;

  const prompt = await resolvePrompt(args);
  if (!prompt) throw new Error('Prompt is required. Use --prompt or --prompt-file.');

  const mode = args.mode === 'edit' ? 'edit' : 'generate';
  if (mode === 'edit' && !args.image) throw new Error('--image is required for edit mode.');
  const outDir = args.out || join('outputs', 'images', 'sorrycode-image2');
  await mkdir(outDir, { recursive: true });
  if (args.promptLog) {
    await writeFile(join(outDir, 'prompt.txt'), `${prompt}\n`, 'utf8');
  }

  const baseUrl = normalizeBaseUrl(
    args.baseUrl || process.env.SORRYCODE_BASE_URL || credentials.providerBaseUrl || DEFAULT_BASE_URL,
  );
  const endpoint = endpointFor(baseUrl, mode);

  let requestForLog = {
    model: args.model,
    prompt,
    size: args.size,
    n: args.n,
    response_format: 'b64_json',
  };
  if (args.stream) {
    requestForLog.stream = true;
    requestForLog.partial_images = args.partialImages;
  }

  const imageBytes = mode === 'edit' ? await readFile(args.image) : null;
  if (mode === 'edit') {
    requestForLog.image = args.image;
  }

  await writeFile(join(outDir, 'request.json'), JSON.stringify(requestForLog, null, 2), 'utf8');

  const buildRequest = (apiKey) => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: args.stream ? 'text/event-stream' : 'application/json',
    };
    if (mode !== 'edit') {
      headers['Content-Type'] = 'application/json';
      return { headers, body: JSON.stringify(requestForLog) };
    }

    const form = new FormData();
    form.set('model', args.model);
    form.set('prompt', prompt);
    form.set('size', args.size);
    form.set('response_format', 'b64_json');
    if (args.stream) {
      form.set('stream', 'true');
      form.set('partial_images', String(args.partialImages));
    }
    form.set('image', new Blob([imageBytes]), basename(args.image));
    return { headers, body: form };
  };

  const attempt = await executeCredentialAttempts({
    endpoint,
    candidates: credentials.candidates,
    buildRequest,
    onFallback: async ({ response: rejected, responseText }) => {
      const safeHeaders = redactCredentialText(headersToText(rejected.headers), credentialKeys);
      const safeResponse = redactCredentialText(responseText, credentialKeys);
      await writeFile(join(outDir, 'codex-key-headers.txt'), `HTTP ${rejected.status}\n${safeHeaders}`, 'utf8');
      await writeFile(join(outDir, 'codex-key-response.txt'), safeResponse, 'utf8');
    },
  });
  const { response, credentialSource, responseText } = attempt;
  if (!response) throw new Error('SorryCode image request did not return a response.');
  if (!response.ok) {
    const safeHeaders = redactCredentialText(headersToText(response.headers), credentialKeys);
    const safeResponse = redactCredentialText(responseText, credentialKeys);
    await writeFile(join(outDir, 'headers.txt'), `HTTP ${response.status}\n${safeHeaders}`, 'utf8');
    await writeFile(join(outDir, 'curl-response.txt'), safeResponse, 'utf8');
    let detail = '';
    try {
      const payload = JSON.parse(responseText);
      if (payload?.error?.message) detail = `: ${payload.error.message}`;
    } catch {}
    detail = redactCredentialText(detail, credentialKeys);
    if (credentialSource === 'codex' && shouldTryFallbackKey(response.status, responseText)) {
      throw new Error(`The current Codex SorryCode key cannot generate images (HTTP ${response.status}${detail}). ${FALLBACK_KEY_GUIDANCE}`);
    }
    throw new Error(`SorryCode image request failed: HTTP ${response.status}${detail}. Diagnostics saved to ${outDir}`);
  }
  const safeHeaders = redactCredentialText(headersToText(response.headers), credentialKeys);
  await writeFile(join(outDir, 'headers.txt'), `HTTP ${response.status}\n${safeHeaders}`, 'utf8');

  const contentType = response.headers.get('content-type') || '';

  let finalPayload = null;
  let eventCount = 0;
  let firstEventMs = null;
  if (contentType.includes('text/event-stream')) {
    const result = await readStreamingResponse(response, outDir);
    finalPayload = result.finalPayload;
    eventCount = result.eventCount;
    firstEventMs = result.firstEventMs;
  } else {
    finalPayload = await response.json();
    await writeFile(join(outDir, 'response.json'), JSON.stringify(finalPayload, null, 2), 'utf8');
  }

  const imageFile = await saveImage(outDir, imageFromPayload(finalPayload));
  await writeFile(join(outDir, 'summary.json'), JSON.stringify({
    endpoint,
    mode,
    model: args.model,
    size: args.size,
    status: response.status,
    contentType,
    eventCount,
    firstEventMs,
    imageFile,
    credentialSource: credentialSource === 'codex' ? 'codex-sorrycode-provider' : 'image2-fallback',
    promptLog: args.promptLog ? 'prompt.txt' : null,
  }, null, 2), 'utf8');

  if (!imageFile) {
    throw new Error(`SorryCode returned success without a saved image. Diagnostics saved to ${outDir}`);
  }
  process.stdout.write(`Saved SorryCode image outputs to ${outDir}\n`);
  process.stdout.write(`Image: ${imageFile}\n`);
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
