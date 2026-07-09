# SorryCode Image2

Generate or edit images with `gpt-image-2` through the SorryCode Images API.

Supported models:

- `gpt-image-2`

## Install

### Recommended: `npx skills`

Install into Codex and Claude Code:

```bash
npx skills add linxiverse/sorrycode-image2 -a codex -a claude-code -g -y
```

Install into one host:

```bash
npx skills add linxiverse/sorrycode-image2 -a codex -g -y
npx skills add linxiverse/sorrycode-image2 -a claude-code -g -y
```

Update installed global Skills:

```bash
npx skills update -g -y
```

### Native Plugin

Claude Code:

```bash
/plugin marketplace add linxiverse/sorrycode-image2
/plugin install sorrycode-image2@sorrycode-image2
```

Codex:

```bash
codex plugin marketplace add linxiverse/sorrycode-image2
codex plugin add sorrycode-image2@sorrycode-image2
```

## What It Does

- checks `SORRYCODE_API_KEY` before making requests
- uses `gpt-image-2` by default
- generates new images through `/v1/images/generations`
- uses `stream: true` and `partial_images: 2` by default
- edits existing local images through `/v1/images/edits`
- saves API request/response diagnostics and image outputs under `outputs/images/`
- can skip duplicate prompt logging with `--no-prompt-log` when another workflow already owns the runtime prompt file
- keeps advanced size guidance in `references/size-guide.md`

It does not teach agents how to write image prompts, choose visual styles, or
design covers. Pass a prompt from the caller or from another workflow.

## Script Usage

```bash
node scripts/sorrycode-image2.mjs --prompt "<image prompt>" --out outputs/images/run
```

The script writes `request.json`, `headers.txt`, `events.ndjson`, `response.json`, `summary.json`, and the final image when available. Standalone runs also write `prompt.txt` by default.

For workflow-owned prompts:

```bash
node scripts/sorrycode-image2.mjs \
  --prompt-file path/to/runtime-prompt.md \
  --no-prompt-log \
  --out outputs/images/run
```
