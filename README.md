# SorryCode Image2

Generate and edit images through the SorryCode Images API with
`gpt-image-2`.

The Skill finds and reuses the active SorryCode Codex provider key. Users do not
create a separate image key or configure a Skill-specific environment variable.
Image requests use the direct `https://api.sorrycode.com/v1` ingress.

All supported sizes use `gpt-image-2`. Passing `--model gpt-image-2` is optional.

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
- uses `gpt-image-2` for all supported sizes
- generates new images through `https://api.sorrycode.com/v1/images/generations`
- uses `stream: true` and `partial_images: 2` by default
- edits existing local images through `https://api.sorrycode.com/v1/images/edits`
- saves API request/response diagnostics and image outputs under `outputs/images/`
- stops after credential, balance, group, timeout, disconnect, or interrupted-response failures
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
