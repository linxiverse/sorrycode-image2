#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_BASE_URL = 'https://www.sorrycode.com/v1';

function parseArgs(argv) {
  const args = { mode: 'generate', size: '1024x1024', model: 'gpt-image-2', n: 1, partialImages: 2, stream: true };
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
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/sorrycode-image2.mjs --prompt "a cute cat" --out outputs/images/cat
  node scripts/sorrycode-image2.mjs --model gemini-3-pro-image-preview --no-stream --prompt "a cute cat"
  node scripts/sorrycode-image2.mjs --mode edit --image ./input.png --prompt "make it watercolor" --out outputs/images/edit

Environment:
  SORRYCODE_API_KEY   required
  SORRYCODE_BASE_URL  optional, defaults to ${DEFAULT_BASE_URL}
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
    return imageFromPayload(payload.data[payload.data.length - 1]);
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

  const apiKey = process.env.SORRYCODE_API_KEY;
  if (!apiKey) throw new Error('SORRYCODE_API_KEY is not set.');

  const prompt = await resolvePrompt(args);
  if (!prompt) throw new Error('Prompt is required. Use --prompt or --prompt-file.');

  const mode = args.mode === 'edit' ? 'edit' : 'generate';
  if (mode === 'edit' && !args.image) throw new Error('--image is required for edit mode.');

  const outDir = args.out || join('outputs', 'images', 'sorrycode-image2');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'prompt.txt'), `${prompt}\n`, 'utf8');

  const baseUrl = normalizeBaseUrl(args.baseUrl || process.env.SORRYCODE_BASE_URL || DEFAULT_BASE_URL);
  const endpoint = endpointFor(baseUrl, mode);

  let body;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: args.stream ? 'text/event-stream' : 'application/json',
  };

  const requestForLog = {
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

  if (mode === 'edit') {
    const form = new FormData();
    form.set('model', args.model);
    form.set('prompt', prompt);
    form.set('size', args.size);
    form.set('response_format', 'b64_json');
    if (args.stream) {
      form.set('stream', 'true');
      form.set('partial_images', String(args.partialImages));
    }
    const imageBytes = await readFile(args.image);
    form.set('image', new Blob([imageBytes]), basename(args.image));
    body = form;
    requestForLog.image = args.image;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(requestForLog);
  }

  await writeFile(join(outDir, 'request.json'), JSON.stringify(requestForLog, null, 2), 'utf8');

  const response = await fetch(endpoint, { method: 'POST', headers, body });
  await writeFile(join(outDir, 'headers.txt'), `HTTP ${response.status}\n${headersToText(response.headers)}`, 'utf8');

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const text = await response.text();
    await writeFile(join(outDir, 'curl-response.txt'), text, 'utf8');
    throw new Error(`SorryCode image request failed: HTTP ${response.status}. Diagnostics saved to ${outDir}`);
  }

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
    status: response.status,
    contentType,
    eventCount,
    firstEventMs,
    imageFile,
  }, null, 2), 'utf8');

  process.stdout.write(`Saved SorryCode image outputs to ${outDir}\n`);
  if (imageFile) process.stdout.write(`Image: ${imageFile}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
