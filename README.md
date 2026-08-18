# SorryCode Image2

Generate and edit images through the SorryCode Images API with
`gpt-image-2-all` and `gpt-image-2`.

In Codex, the Skill reuses the active SorryCode provider key from the user's
existing Codex configuration. No extra Image2 key is required by default.
`SORRYCODE_API_KEY` is consulted only when the current Codex key is unavailable
or definitely cannot generate images.

Supported models:

- `gpt-image-2-all`: automatic default for `auto`, common 1K/1080p sizes, and custom images below 2K up to about 2.1 megapixels
- `gpt-image-2`: automatic default for 2K and 4K images

Passing `--model` always overrides automatic selection.

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

- confirms the active Codex provider points to SorryCode
- reuses the current Codex SorryCode login key without printing or logging it
- checks `SORRYCODE_API_KEY` only after the current key is unavailable or lacks image capability
- tells users to configure an Image2-group key only when that fallback is needed
- selects `gpt-image-2-all` for standard-size work and `gpt-image-2` for 2K/4K work
- generates new images through `/v1/images/generations`
- uses `stream: true` and `partial_images: 2` by default
- edits existing local images through `/v1/images/edits`
- saves API request/response diagnostics and image outputs under `outputs/images/`
- can skip duplicate prompt logging with `--no-prompt-log` when another workflow already owns the runtime prompt file
- keeps advanced size guidance in `references/size-guide.md`

It does not teach agents how to write image prompts, choose visual styles, or
design covers. Pass a prompt from the caller or from another workflow.

The script reads the current key only inside the request process. It never
prints it or writes it to diagnostics. If Codex stores credentials in an OS
keyring rather than `auth.json`, the standalone Skill cannot extract them and
uses the independent Image2 fallback instead. Non-Codex hosts such as Claude
Code also use `SORRYCODE_API_KEY`.

## Script Usage

```bash
node skills/sorrycode-image2/scripts/sorrycode-image2.mjs --prompt "<image prompt>" --out outputs/images/run
```

The script writes `request.json`, `headers.txt`, `events.ndjson`, `response.json`, `summary.json`, and the final image when available. Standalone runs also write `prompt.txt` by default.

For workflow-owned prompts:

```bash
node skills/sorrycode-image2/scripts/sorrycode-image2.mjs \
  --prompt-file path/to/runtime-prompt.md \
  --no-prompt-log \
  --out outputs/images/run
```
