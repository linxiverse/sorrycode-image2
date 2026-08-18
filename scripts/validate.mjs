#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const supportedModels = ['gpt-image-2-all', 'gpt-image-2'];
const unsupportedModels = ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image-preview'];
const pairs = [
  ['skills/sorrycode-image2/SKILL.md', 'plugins/sorrycode-image2/skills/sorrycode-image2/SKILL.md'],
  ['skills/sorrycode-image2/scripts/sorrycode-image2.mjs', 'plugins/sorrycode-image2/skills/sorrycode-image2/scripts/sorrycode-image2.mjs'],
  ['skills/sorrycode-image2/references/size-guide.md', 'plugins/sorrycode-image2/skills/sorrycode-image2/references/size-guide.md'],
];
const publicFiles = [
  'README.md',
  'skills/sorrycode-image2/SKILL.md',
  'skills/sorrycode-image2/scripts/sorrycode-image2.mjs',
  '.claude-plugin/marketplace.json',
  'plugins/sorrycode-image2/.codex-plugin/plugin.json',
];

async function text(path) {
  return readFile(path, 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function expectNoUnsupportedModels(path) {
  const content = await text(path);
  for (const model of unsupportedModels) {
    if (content.includes(model)) fail(`${path}: remove unsupported model ${model}`);
  }
}

async function expectModels(path) {
  const content = await text(path);
  for (const model of supportedModels) {
    if (!content.includes(model)) fail(`${path}: missing supported model ${model}`);
  }
}

async function expectSame(left, right) {
  const [leftText, rightText] = await Promise.all([text(left), text(right)]);
  if (leftText !== rightText) fail(`${right}: must stay in sync with ${left}`);
}

async function expectJSON(path) {
  try {
    return JSON.parse(await text(path));
  } catch (error) {
    fail(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

await Promise.all([
  ...publicFiles.map(expectNoUnsupportedModels),
  expectModels('README.md'),
  expectModels('skills/sorrycode-image2/SKILL.md'),
  expectModels('skills/sorrycode-image2/scripts/sorrycode-image2.mjs'),
  ...pairs.map(([left, right]) => expectSame(left, right)),
]);

const {
  executeCredentialAttempts,
  parseArgs,
  parseCodexSorryCodeConfig,
  redactCredentialText,
  resolveCredentialCandidates,
  selectDefaultModel,
  shouldTryFallbackKey,
} = await import(
  pathToFileURL('skills/sorrycode-image2/scripts/sorrycode-image2.mjs').href
);
const routingCases = [
  ['auto', 'gpt-image-2-all'],
  ['1024x1024', 'gpt-image-2-all'],
  ['1536x1024', 'gpt-image-2-all'],
  ['1600x640', 'gpt-image-2-all'],
  ['1920x1080', 'gpt-image-2-all'],
  ['2048x1152', 'gpt-image-2'],
  ['2048x2048', 'gpt-image-2'],
  ['3840x2160', 'gpt-image-2'],
];

for (const [size, expected] of routingCases) {
  if (selectDefaultModel(size) !== expected) {
    fail(`Unexpected automatic model for ${size}`);
  }
}

if (parseArgs(['--size', '2048x2048', '--model', 'gpt-image-2-all']).model !== 'gpt-image-2-all') {
  fail('An explicit --model must override automatic routing');
}

const configFixture = `
model_provider = "sorrycode"

[model_providers.sorrycode]
name = "SorryCode"
base_url = "https://api.sorrycode.com/v1"
wire_api = "responses"
requires_openai_auth = true
`;
const parsedProvider = parseCodexSorryCodeConfig(configFixture);
if (parsedProvider?.providerId !== 'sorrycode' || parsedProvider?.baseUrl !== 'https://api.sorrycode.com/v1') {
  fail('The active SorryCode provider must be discovered from Codex config');
}
if (parseCodexSorryCodeConfig(configFixture.replace('api.sorrycode.com', 'api.openai.com')) !== null) {
  fail('Credentials from non-SorryCode providers must not be reused');
}

const resolvedCredentials = await resolveCredentialCandidates({
  env: { CODEX_HOME: '/fake-codex', SORRYCODE_API_KEY: 'sk-image-fallback' },
  read: async (path) => path.endsWith('config.toml')
    ? configFixture
    : JSON.stringify({ OPENAI_API_KEY: 'sk-codex-current' }),
});
if (resolvedCredentials.candidates.map(({ source }) => source).join(',') !== 'codex,fallback') {
  fail('Codex credentials must be tried before the Image2 fallback key');
}
if (!shouldTryFallbackKey(403, '{"error":{"message":"image generation disabled"}}')) {
  fail('A definite image permission failure must allow the fallback key');
}
if (shouldTryFallbackKey(429, '{"error":{"message":"rate limited"}}') ||
    shouldTryFallbackKey(524, 'timeout') ||
    shouldTryFallbackKey(503, 'temporary upstream failure')) {
  fail('Ambiguous or service-wide failures must not trigger a second paid request');
}

const candidates = [
  { key: 'sk-current', source: 'codex' },
  { key: 'sk-image', source: 'fallback' },
];
const buildRequest = (key) => ({ headers: { Authorization: `Bearer ${key}` }, body: '{}' });

let seenKeys = [];
const primaryResult = await executeCredentialAttempts({
  endpoint: 'https://sorrycode.invalid/v1/images/generations',
  candidates,
  buildRequest,
  fetchImpl: async (_endpoint, request) => {
    seenKeys.push(request.headers.Authorization.slice('Bearer '.length));
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
if (primaryResult.credentialSource !== 'codex' || seenKeys.join(',') !== 'sk-current') {
  fail('A working current Codex key must be used without touching the fallback key');
}

seenKeys = [];
let fallbackNoticeCount = 0;
const fallbackResult = await executeCredentialAttempts({
  endpoint: 'https://sorrycode.invalid/v1/images/generations',
  candidates,
  buildRequest,
  fetchImpl: async (_endpoint, request) => {
    const key = request.headers.Authorization.slice('Bearer '.length);
    seenKeys.push(key);
    if (key === 'sk-current') {
      return new Response('{"error":{"message":"image generation disabled for group"}}', {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
  onFallback: async () => { fallbackNoticeCount += 1; },
});
if (fallbackResult.credentialSource !== 'fallback' ||
    seenKeys.join(',') !== 'sk-current,sk-image' ||
    fallbackNoticeCount !== 1) {
  fail('The Image2 key must be used only after a definite current-key capability failure');
}

seenKeys = [];
let networkError = null;
try {
  await executeCredentialAttempts({
    endpoint: 'https://sorrycode.invalid/v1/images/generations',
    candidates,
    buildRequest,
    fetchImpl: async (_endpoint, request) => {
      seenKeys.push(request.headers.Authorization.slice('Bearer '.length));
      throw new Error('connection lost');
    },
  });
} catch (error) {
  networkError = error;
}
if (!networkError?.message.includes('fallback key was not tried') || seenKeys.join(',') !== 'sk-current') {
  fail('An ambiguous network failure must not trigger the fallback key');
}

const missingCredentials = await resolveCredentialCandidates({
  env: { CODEX_HOME: '/fake-codex', SORRYCODE_API_KEY: '' },
  read: async (path) => path.endsWith('config.toml') ? 'model_provider = "openai"\n' : '{}',
});
if (missingCredentials.candidates.length !== 0) {
  fail('Missing current and fallback credentials must remain an explicit setup state');
}

const redactedDiagnostic = redactCredentialText(
  'authorization=sk-current echoed=sk-image',
  candidates,
);
if (redactedDiagnostic.includes('sk-current') || redactedDiagnostic.includes('sk-image')) {
  fail('Known credentials must be removed from diagnostics and error messages');
}

const codexMarketplace = await expectJSON('.agents/plugins/marketplace.json');
const codexPlugin = await expectJSON('plugins/sorrycode-image2/.codex-plugin/plugin.json');
const claude = await expectJSON('.claude-plugin/marketplace.json');
const packageJson = await expectJSON('package.json');

if (codexMarketplace?.name !== 'sorrycode-image2') fail('Codex marketplace name must be sorrycode-image2');
if (!codexMarketplace?.plugins?.some((plugin) => plugin.name === 'sorrycode-image2')) fail('Codex marketplace must expose sorrycode-image2');
if (codexPlugin?.name !== 'sorrycode-image2') fail('Codex plugin name must be sorrycode-image2');
if (codexPlugin?.skills !== './skills/') fail('Codex plugin must expose ./skills/');
if (claude?.name !== 'sorrycode-image2') fail('Claude marketplace name must be sorrycode-image2');
if (!claude?.plugins?.some((plugin) => plugin.name === 'sorrycode-image2')) fail('Claude marketplace must expose sorrycode-image2');
if (codexPlugin?.version !== packageJson?.version) fail('Codex plugin version must match package.json');
if (claude?.plugins?.[0]?.version !== packageJson?.version) fail('Claude plugin version must match package.json');
