# SorryCode Image2

Generate and edit images through the SorryCode Images API with
`gpt-image-2-all` and `gpt-image-2`.

The Skill finds and reuses the active SorryCode Codex provider key. Users do not
create a separate image key or configure a Skill-specific environment variable.
Image requests use the direct `https://api.sorrycode.com/v1` ingress.

Supported models:

- `gpt-image-2-all`: automatic default for `auto`, common 1K/1080p sizes, and custom images below 2K up to about 2.1 megapixels
- `gpt-image-2`: automatic default for 2K and 4K images

Standard-size requests try `gpt-image-2-all` first and then `gpt-image-2` after
an explicit retryable failure. Passing `--model` limits execution to that model.

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
- tries `gpt-image-2-all` and `gpt-image-2` for standard-size work, while 2K/4K work uses `gpt-image-2`
- generates new images through `https://api.sorrycode.com/v1/images/generations`
- uses `stream: true` and `partial_images: 2` by default
- edits existing local images through `https://api.sorrycode.com/v1/images/edits`
- saves API request/response diagnostics and image outputs under `outputs/images/`
- stops fallback after credential, balance, group, timeout, disconnect, or interrupted-response failures
- can skip duplicate prompt logging with `--no-prompt-log` when another workflow already owns the runtime prompt file
- keeps advanced size guidance in `references/size-guide.md`

It does not teach agents how to write image prompts, choose visual styles, or
design covers. Pass a prompt from the caller or from another workflow.

The script reads the current key only inside the request process. It never
prints it or writes it to diagnostics. Claude Code uses the same Codex
configuration on the machine. If no readable credential exists, complete the
SorryCode **Connect tool > Codex** setup first and run the Skill again.

## Script Usage

```bash
node skills/sorrycode-image2/scripts/sorrycode-image2.mjs --prompt "<image prompt>" --out outputs/images/run
```

The script writes `summary.json` at the selected output directory. Per-model requests, headers, responses, streaming events, and images are saved under `attempts/`. Standalone runs also write `prompt.txt` by default.

For workflow-owned prompts:

```bash
node skills/sorrycode-image2/scripts/sorrycode-image2.mjs \
  --prompt-file path/to/runtime-prompt.md \
  --no-prompt-log \
  --out outputs/images/run
```
