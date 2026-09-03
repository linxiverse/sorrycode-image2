#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://api.sorrycode.com/v1';
const DEFAULT_MODEL = 'gpt-image-2';
const SUPPORTED_MODELS = [DEFAULT_MODEL];
const CODEX_SETUP_GUIDANCE = 'Connect Codex from the SorryCode API Key page, then run this Skill again. Do not paste the key into chat or configure a separate image key.';

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
  const activeProvider = /^model_provider\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/m.exec(content)?.[1];
  if (!activeProvider) return null;
  const escapedProvider = activeProvider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(`^\\[model_providers\\.${escapedProvider}\\]\\s*$`, 'm');
  const sectionStart = content.search(sectionPattern);
  if (sectionStart === -1) return null;
  const afterHeader = content.slice(sectionStart).replace(sectionPattern, '').replace(/^\r?\n/, '');
  const nextSection = afterHeader.search(/^\[/m);
  const section = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);
  const stringValue = (key) => {
    const match = new RegExp(`^${key}\\s*=\\s*(["'])(.*?)\\1\\s*(?:#.*)?$`, 'm').exec(section);
    return match?.[2] || null;
  };
  const baseUrl = stringValue('base_url');
  if (!isSorryCodeUrl(baseUrl)) return null;
  return {
    providerId: activeProvider,
    baseUrl,
    envKey: stringValue('env_key'),
    requiresOpenAIAuth: /^requires_openai_auth\s*=\s*true\s*(?:#.*)?$/m.test(section),
  };
}

export async function resolveCodexCredential({ env = process.env, home = homedir(), read = readFile } = {}) {
  const codexHome = env.CODEX_HOME?.trim() || join(home, '.codex');
  let provider = null;
  try {
    provider = parseCodexSorryCodeConfig(await read(join(codexHome, 'config.toml'), 'utf8'));
  } catch {}

  let currentKey = '';
  if (provider?.requiresOpenAIAuth) {
    try {
      const auth = JSON.parse(await read(join(codexHome, 'auth.json'), 'utf8'));
      currentKey = typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY.trim() : '';
    } catch {}
  } else if (provider?.envKey) {
    currentKey = env[provider.envKey]?.trim() || '';
  }

  return {
    credential: currentKey ? { key: currentKey, source: 'codex' } : null,
    provider,
  };
}

export function redactCredentialText(value, candidates) {
  let redacted = String(value);
  for (const candidate of candidates) {
    if (candidate.key) redacted = redacted.replaceAll(candidate.key, '[REDACTED]');
  }
  return redacted;
}

export async function executeImageRequest({ endpoint, credential, buildRequest, fetchImpl = fetch }) {
  const { headers, body } = buildRequest(credential.key);
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', headers, body });
  } catch (error) {
    throw new Error(`SorryCode image request did not complete (${error instanceof Error ? error.message : String(error)}). The request was not retried because it may still be processing.`);
  }
  let responseText = null;
  if (!response.ok) {
    try { responseText = await response.text(); } catch { responseText = ''; }
  }
  return { response, credentialSource: credential.source, responseText };
}

export function selectDefaultModel(_size) {
  return DEFAULT_MODEL;
}

export function modelCandidates(size, explicitModel) {
  return [explicitModel || selectDefaultModel(size)];
}

export function apiErrorDetail(responseText) {
  try {
    const payload = JSON.parse(responseText);
    const code = payload?.error?.code || payload?.code;
    const message = payload?.error?.message || payload?.message;
    const parts = [...new Set([code, message].filter((value) => typeof value === 'string' && value))];
    return parts.length > 0 ? `: ${parts.join(' - ')}` : '';
  } catch {
    return '';
  }
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
    else if (key === 'n') { args.n = Number.parseInt(next, 10); i += 1; }
    else if (key === 'partial-images') { args.partialImages = Number.parseInt(next, 10); i += 1; }
    else if (key === 'no-stream') args.stream = false;
    else if (key === 'stream') args.stream = true;
    else if (key === 'no-prompt-log') args.promptLog = false;
    else if (key === 'prompt-log') args.promptLog = true;
  }
  args.models = modelCandidates(args.size, args.model);
  args.model = args.models[0];
  return args;
}

function usage() {
  return `Usage:
  node scripts/sorrycode-image2.mjs --prompt "<image prompt>" --out outputs/images/run
  node scripts/sorrycode-image2.mjs --prompt-file runtime-prompt.md --no-prompt-log --out outputs/images/run
  node scripts/sorrycode-image2.mjs --mode edit --image ./input.png --prompt "<edit instruction>" --out outputs/images/edit

Supported model:
  ${SUPPORTED_MODELS.join('\n  ')}

Model selection:
  all sizes         use gpt-image-2
  --model           optionally specify gpt-image-2 explicitly

Environment:
  CODEX_HOME           optional, defaults to ~/.codex
`;
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

function mimeFromImagePath(imagePath) {
  const extension = extname(imagePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  throw new Error(`Unsupported edit image type "${extension || '(none)'}". Use PNG, JPEG, or WebP.`);
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

export async function saveImage(outDir, image, fetchImpl = fetch) {
  if (!image) return null;
  if (image.kind === 'url') {
    const url = new URL(image.value);
    if (url.protocol !== 'https:') throw new Error('Image result URL must use HTTPS.');
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Image result download failed: HTTP ${response.status}.`);
    const file = `image.${extensionFromMime(response.headers.get('content-type') || 'image/png')}`;
    await writeFile(join(outDir, file), Buffer.from(await response.arrayBuffer()));
    return file;
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

  const unsupportedModel = args.models.find((model) => !SUPPORTED_MODELS.includes(model));
  if (unsupportedModel) {
    throw new Error(`Unsupported model "${unsupportedModel}". Supported models: ${SUPPORTED_MODELS.join(', ')}.`);
  }

  const credentials = await resolveCodexCredential();
  if (!credentials.credential) {
    throw new Error(`No reusable SorryCode key was found in the active Codex provider. ${CODEX_SETUP_GUIDANCE}`);
  }
  const credentialKeys = [credentials.credential];

  const prompt = await resolvePrompt(args);
  if (!prompt) throw new Error('Prompt is required. Use --prompt or --prompt-file.');

  const mode = args.mode === 'edit' ? 'edit' : 'generate';
  if (mode === 'edit' && !args.image) throw new Error('--image is required for edit mode.');
  const outDir = args.out || join('outputs', 'images', 'sorrycode-image2');
  await mkdir(outDir, { recursive: true });
  if (args.promptLog) {
    await writeFile(join(outDir, 'prompt.txt'), `${prompt}\n`, 'utf8');
  }

  const endpoint = endpointFor(DEFAULT_BASE_URL, mode);
  const imageBytes = mode === 'edit' ? await readFile(args.image) : null;
  const attempts = [];
  let imageFile = null;
  let finalResult = null;
  let stopReason = 'request_failed';

  for (let index = 0; index < args.models.length; index += 1) {
    const model = args.models[index];
    const attemptRelativeDir = join('attempts', `${String(index + 1).padStart(2, '0')}-${model}`);
    const attemptDir = join(outDir, attemptRelativeDir);
    await mkdir(attemptDir, { recursive: true });

    const requestForLog = {
      model,
      prompt,
      size: args.size,
      n: args.n,
      response_format: 'b64_json',
      ...(args.stream ? { stream: true, partial_images: args.partialImages } : {}),
      ...(mode === 'edit' ? { image: args.image } : {}),
    };
    await writeFile(join(attemptDir, 'request.json'), JSON.stringify(requestForLog, null, 2), 'utf8');

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
      form.set('model', model);
      form.set('prompt', prompt);
      form.set('size', args.size);
      form.set('response_format', 'b64_json');
      if (args.stream) {
        form.set('stream', 'true');
        form.set('partial_images', String(args.partialImages));
      }
      form.set('image', new Blob([imageBytes], { type: mimeFromImagePath(args.image) }), basename(args.image));
      return { headers, body: form };
    };

    try {
      const { response, responseText } = await executeImageRequest({
        endpoint,
        credential: credentials.credential,
        buildRequest,
      });
      const safeHeaders = redactCredentialText(headersToText(response.headers), credentialKeys);
      await writeFile(join(attemptDir, 'headers.txt'), `HTTP ${response.status}\n${safeHeaders}`, 'utf8');

      if (!response.ok) {
        const safeResponse = redactCredentialText(responseText, credentialKeys);
        const detail = redactCredentialText(apiErrorDetail(responseText), credentialKeys);
        await writeFile(join(attemptDir, 'curl-response.txt'), safeResponse, 'utf8');
        finalResult = {
          model,
          status: response.status,
          imageFile: null,
          outcome: 'rejected',
          message: `HTTP ${response.status}${detail}`,
          diagnostics: attemptRelativeDir,
        };
        attempts.push(finalResult);
        stopReason = 'request_rejected';
        break;
      }

      const contentType = response.headers.get('content-type') || '';
      let finalPayload = null;
      let eventCount = 0;
      let firstEventMs = null;
      if (contentType.includes('text/event-stream')) {
        const result = await readStreamingResponse(response, attemptDir);
        finalPayload = result.finalPayload;
        eventCount = result.eventCount;
        firstEventMs = result.firstEventMs;
      } else {
        finalPayload = await response.json();
        await writeFile(join(attemptDir, 'response.json'), JSON.stringify(finalPayload, null, 2), 'utf8');
      }

      const savedFile = await saveImage(attemptDir, imageFromPayload(finalPayload));
      imageFile = savedFile ? join(attemptRelativeDir, savedFile) : null;
      finalResult = {
        model,
        status: response.status,
        contentType,
        eventCount,
        firstEventMs,
        imageFile,
        outcome: imageFile ? 'completed' : 'completed_without_image',
        message: imageFile ? null : 'API returned success without a saved image',
        diagnostics: attemptRelativeDir,
      };
      attempts.push(finalResult);
      if (imageFile) {
        stopReason = null;
        break;
      }
      stopReason = 'completed_without_image';
      break;
    } catch (error) {
      const message = redactCredentialText(error instanceof Error ? error.message : String(error), credentialKeys);
      await writeFile(join(attemptDir, 'error.txt'), `${message}\n`, 'utf8');
      finalResult = {
        model,
        status: null,
        imageFile: null,
        outcome: 'request_state_unknown',
        message,
        diagnostics: attemptRelativeDir,
      };
      attempts.push(finalResult);
      stopReason = 'request_state_unknown';
      break;
    }
  }

  await writeFile(join(outDir, 'summary.json'), JSON.stringify({
    endpoint,
    mode,
    candidateModels: args.models,
    model: imageFile ? finalResult?.model : null,
    size: args.size,
    status: finalResult?.status ?? null,
    contentType: finalResult?.contentType || null,
    eventCount: finalResult?.eventCount ?? 0,
    firstEventMs: finalResult?.firstEventMs ?? null,
    attempts,
    imageFile,
    credentialSource: 'codex-sorrycode-provider',
    stopReason,
    promptLog: args.promptLog ? 'prompt.txt' : null,
  }, null, 2), 'utf8');

  if (!imageFile) {
    throw new Error(`${finalResult?.message || 'No SorryCode image model produced a saved image'}. Diagnostics saved to ${outDir}`);
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
