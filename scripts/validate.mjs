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

const { parseArgs, selectDefaultModel } = await import(
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
