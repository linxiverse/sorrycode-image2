#!/usr/bin/env node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const supportedModels = ['gpt-image-2'];
const unsupportedModels = ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image-preview'];
const removedCredentialTerms = ['SORRYCODE_API_KEY', 'Image2-group', 'Image2 group', 'fallback key'];
const directIngress = 'https://api.sorrycode.com/v1';
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

async function expectPublicContract(path) {
  const content = await text(path);
  for (const model of unsupportedModels) {
    if (content.includes(model)) fail(`${path}: remove unsupported model ${model}`);
  }
  for (const term of removedCredentialTerms) {
    if (content.includes(term)) fail(`${path}: remove obsolete credential term ${term}`);
  }
}

async function expectModels(path) {
  const content = await text(path);
  for (const model of supportedModels) {
    if (!content.includes(model)) fail(`${path}: missing supported model ${model}`);
  }
}

async function expectDirectIngress(path) {
  const content = await text(path);
  if (!content.includes(directIngress)) fail(`${path}: missing direct SorryCode API ingress`);
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
  ...publicFiles.map(expectPublicContract),
  expectModels('README.md'),
  expectModels('skills/sorrycode-image2/SKILL.md'),
  expectModels('skills/sorrycode-image2/scripts/sorrycode-image2.mjs'),
  expectDirectIngress('README.md'),
  expectDirectIngress('skills/sorrycode-image2/SKILL.md'),
  expectDirectIngress('skills/sorrycode-image2/scripts/sorrycode-image2.mjs'),
  ...pairs.map(([left, right]) => expectSame(left, right)),
]);

const {
  apiErrorDetail,
  executeImageRequest,
  modelCandidates,
  parseArgs,
  parseCodexSorryCodeConfig,
  redactCredentialText,
  resolveCodexCredential,
  saveImage,
  selectDefaultModel,
} = await import(
  pathToFileURL('skills/sorrycode-image2/scripts/sorrycode-image2.mjs').href
);

const routingCases = [
  ['auto', 'gpt-image-2'],
  ['1024x1024', 'gpt-image-2'],
  ['1536x1024', 'gpt-image-2'],
  ['1600x640', 'gpt-image-2'],
  ['1920x1080', 'gpt-image-2'],
  ['2048x1152', 'gpt-image-2'],
  ['2048x2048', 'gpt-image-2'],
  ['3840x2160', 'gpt-image-2'],
];

for (const [size, expected] of routingCases) {
  if (selectDefaultModel(size) !== expected) fail(`Unexpected automatic model for ${size}`);
}

if (parseArgs(['--size', '2048x2048', '--model', 'gpt-image-2']).model !== 'gpt-image-2') {
  fail('An explicit --model must override automatic routing');
}
if (modelCandidates('1024x1024').join(',') !== 'gpt-image-2') {
  fail('Automatic requests must use the supported model');
}
if (modelCandidates('1024x1024', 'gpt-image-2').join(',') !== 'gpt-image-2') {
  fail('An explicit supported model must remain the only candidate');
}
if (!apiErrorDetail('{"code":"GROUP_DELETED","message":"group was deleted"}').includes('GROUP_DELETED')) {
  fail('Top-level SorryCode API errors must remain visible in diagnostics');
}
if (parseArgs(['--base-url', 'https://example.com']).baseUrl !== undefined) {
  fail('The production endpoint must not be overridden from the command line');
}

const configFixture = `
model_provider = "custom-sorrycode"

[model_providers.custom-sorrycode]
name = "SorryCode"
base_url = "https://api.sorrycode.com/v1"
wire_api = "responses"
requires_openai_auth = true
env_key = "STALE_PROVIDER_KEY"
`;
const parsedProvider = parseCodexSorryCodeConfig(configFixture);
if (parsedProvider?.providerId !== 'custom-sorrycode' || parsedProvider?.baseUrl !== directIngress) {
  fail('The active SorryCode provider must be discovered by its configured URL');
}
if (parseCodexSorryCodeConfig(configFixture.replace('api.sorrycode.com', 'api.openai.com')) !== null) {
  fail('Credentials from non-SorryCode providers must not be reused');
}

const resolvedCredential = await resolveCodexCredential({
  env: { CODEX_HOME: '/fake-codex', STALE_PROVIDER_KEY: 'sk-not-current' },
  read: async (path) => path.endsWith('config.toml')
    ? configFixture
    : JSON.stringify({ OPENAI_API_KEY: 'sk-codex-current' }),
});
if (resolvedCredential.credential?.source !== 'codex' || resolvedCredential.credential?.key !== 'sk-codex-current') {
  fail('The active Codex auth file credential must take precedence when requires_openai_auth is true');
}

const envProviderFixture = `
model_provider = "custom-sorrycode"

[model_providers.custom-sorrycode]
base_url = "https://sorrycode.com/v1"
env_key = "CURRENT_PROVIDER_KEY"
`;
const resolvedProviderEnv = await resolveCodexCredential({
  env: { CODEX_HOME: '/fake-codex', CURRENT_PROVIDER_KEY: 'sk-provider-current' },
  read: async (path) => path.endsWith('config.toml') ? envProviderFixture : '{}',
});
if (resolvedProviderEnv.credential?.key !== 'sk-provider-current') {
  fail('A provider-declared credential source must remain reusable');
}

const credential = { key: 'sk-current', source: 'codex' };
const buildRequest = (key) => ({ headers: { Authorization: `Bearer ${key}` }, body: '{}' });
let seenRequests = 0;
const rejected = await executeImageRequest({
  endpoint: 'https://api.sorrycode.com/v1/images/generations',
  credential,
  buildRequest,
  fetchImpl: async () => {
    seenRequests += 1;
    return new Response('{"error":{"message":"image generation disabled"}}', {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});
if (rejected.response.status !== 403 || seenRequests !== 1) {
  fail('A rejected image request must not switch credentials or retry');
}

seenRequests = 0;
let networkError = null;
try {
  await executeImageRequest({
    endpoint: 'https://api.sorrycode.com/v1/images/generations',
    credential,
    buildRequest,
    fetchImpl: async () => {
      seenRequests += 1;
      throw new Error('connection lost');
    },
  });
} catch (error) {
  networkError = error;
}
if (!networkError?.message.includes('was not retried') || seenRequests !== 1) {
  fail('An ambiguous network failure must remain a single request');
}

const missingCredential = await resolveCodexCredential({
  env: { CODEX_HOME: '/fake-codex' },
  read: async (path) => path.endsWith('config.toml') ? 'model_provider = "openai"\n' : '{}',
});
if (missingCredential.credential !== null) {
  fail('Missing Codex credentials must remain an explicit setup state');
}

const redactedDiagnostic = redactCredentialText('authorization=sk-current', [credential]);
if (redactedDiagnostic.includes('sk-current')) {
  fail('Known credentials must be removed from diagnostics and error messages');
}

const imageDownloadDir = await mkdtemp(join(tmpdir(), 'sorrycode-image2-'));
try {
  const imageFile = await saveImage(
    imageDownloadDir,
    { kind: 'url', value: 'https://example.com/generated.png' },
    async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }),
  );
  const savedBytes = await readFile(join(imageDownloadDir, imageFile));
  if (imageFile !== 'image.png' || savedBytes.length !== 3) {
    fail('URL image results must be downloaded as image files');
  }
} finally {
  await rm(imageDownloadDir, { recursive: true, force: true });
}

const sourceScript = await text('skills/sorrycode-image2/scripts/sorrycode-image2.mjs');
if (!sourceScript.includes('mimeFromImagePath') || !sourceScript.includes("type: mimeFromImagePath(args.image)")) {
  fail('Image edits must send the correct PNG, JPEG, or WebP MIME type');
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
