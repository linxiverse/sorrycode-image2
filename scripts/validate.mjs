#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const supportedModels = ['gpt-image-2'];
const unsupportedModels = ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image-preview'];
const pairs = [
  ['SKILL.md', 'plugins/sorrycode-image2/skills/sorrycode-image2/SKILL.md'],
  ['scripts/sorrycode-image2.mjs', 'plugins/sorrycode-image2/skills/sorrycode-image2/scripts/sorrycode-image2.mjs'],
  ['references/size-guide.md', 'plugins/sorrycode-image2/skills/sorrycode-image2/references/size-guide.md'],
];
const publicFiles = [
  'README.md',
  'SKILL.md',
  'scripts/sorrycode-image2.mjs',
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
  expectModels('SKILL.md'),
  expectModels('scripts/sorrycode-image2.mjs'),
  ...pairs.map(([left, right]) => expectSame(left, right)),
]);

const codexMarketplace = await expectJSON('.agents/plugins/marketplace.json');
const codexPlugin = await expectJSON('plugins/sorrycode-image2/.codex-plugin/plugin.json');
const claude = await expectJSON('.claude-plugin/marketplace.json');

if (codexMarketplace?.name !== 'sorrycode-image2') fail('Codex marketplace name must be sorrycode-image2');
if (!codexMarketplace?.plugins?.some((plugin) => plugin.name === 'sorrycode-image2')) fail('Codex marketplace must expose sorrycode-image2');
if (codexPlugin?.name !== 'sorrycode-image2') fail('Codex plugin name must be sorrycode-image2');
if (codexPlugin?.skills !== './skills/') fail('Codex plugin must expose ./skills/');
if (claude?.name !== 'sorrycode-image2') fail('Claude marketplace name must be sorrycode-image2');
if (!claude?.plugins?.some((plugin) => plugin.name === 'sorrycode-image2')) fail('Claude marketplace must expose sorrycode-image2');
