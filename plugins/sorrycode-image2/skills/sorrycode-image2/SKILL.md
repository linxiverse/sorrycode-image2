---
name: sorrycode-image2
description: Call the SorryCode Images API to generate or edit images with gpt-image-2-all or gpt-image-2 from an already-specified image prompt or prompt file. Use when the task is specifically to execute image generation/editing through SorryCode. This skill owns API key checks, Images endpoint selection, request parameters, streaming mode, output files, and diagnostics; it does not teach visual prompt writing or maintain image styles.
---

# SorryCode Image2

Use this skill when the user or an upstream workflow already has an image prompt
or edit instruction and needs to execute it through the unified SorryCode Images
API.

This is a runtime driver. It does not own visual direction, style systems,
article cover methodology, prompt formulas, or reusable image patterns.

## Default Path

1. Clarify whether the caller wants to generate a new image or edit an existing one.
2. Check whether `SORRYCODE_API_KEY` exists before writing or running any request.
3. If the key is missing, stop and help the user set it up. Do not invent a key and do not continue with a fake request.
4. Let the script choose the model unless the caller explicitly passes `--model`. `auto` and standard sizes below 2K use `gpt-image-2-all`; 2K and 4K sizes use `gpt-image-2`.
5. Use `1024x1024` by default. If the user asks for aspect ratio, high resolution, 2K / 4K, or `size`, load `references/size-guide.md` before choosing the parameter.
6. Use the bundled Node script `scripts/sorrycode-image2.mjs` for actual requests. Do not hand-write inline JSON for shell one-offs.
7. Use the default streaming mode with `stream: true` and `partial_images: 2`.
8. For editing, require a local input image path, then run the script with `--mode edit --image <path>`.
9. Save outputs under `outputs/images/<short-slug>/` unless the user asks for another folder. The script writes `request.json`, `headers.txt`, `response.json`, `summary.json`, and `events.ndjson` when streaming. It also writes `prompt.txt` by default for standalone runs.

## Execution Path

Resolve `SKILL_DIR` to the directory that contains this `SKILL.md`; when editing this repository directly, `SKILL_DIR` is the repository root.

Default OpenAI image generation:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --prompt "<image prompt>" \
  --out outputs/images/run
```

When another workflow already owns the runtime prompt file, do not duplicate it:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --prompt-file path/to/runtime-prompt.md \
  --no-prompt-log \
  --out path/to/run
```

Edit mode:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --mode edit \
  --image ./input/product.png \
  --prompt "<edit instruction>" \
  --out outputs/images/edit-run
```

Do not ask the user to set `SKILL_DIR`; derive it from the loaded skill path before running the command.

## API Settings

Default generation endpoint:

```text
https://www.sorrycode.com/v1/images/generations
```

Default edit endpoint:

```text
https://www.sorrycode.com/v1/images/edits
```

If the user or project provides `SORRYCODE_BASE_URL`, use that value and append `/images/generations` or `/images/edits` after removing any trailing `/v1` or `/` ambiguity carefully.

Default standard-size generation request body:

```json
{
  "model": "gpt-image-2-all",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1,
  "stream": true,
  "partial_images": 2,
  "response_format": "b64_json"
}
```

Automatic routing treats images with both edges below `2048` and no more than about `2.1` megapixels as standard size. This includes `1024x1024`, `1536x1024`, `1600x640`, and `1920x1080`. Passing `--model` always overrides this choice.

## API Key Gate

Before making a request, check:

- macOS / Linux: `process.env.SORRYCODE_API_KEY` or `$SORRYCODE_API_KEY`
- Windows PowerShell: `$env:SORRYCODE_API_KEY`

If missing, say:

```text
I need your SorryCode image API key before I can generate or edit images. Create one from Platform / Create API Key, then I can help your computer remember it. The setting name is SORRYCODE_API_KEY, and it will not change your Codex model configuration.
```

## Progressive Disclosure References

Load references only when they are needed:

- `references/size-guide.md`: when the user asks for aspect ratio, high resolution, 2K / 4K, or how to set `size`

## Input Contract

The caller supplies one of:

- `--prompt "<image prompt or edit instruction>"`;
- `--prompt-file path/to/runtime-prompt.md`.

If neither is available, ask the caller for the image prompt or edit instruction
instead of inventing visual direction.

Do not maintain reusable visual styles, design systems, cover formulas,
article-specific prompt methodology, or prompt examples here. Put reusable visual
method in the project that owns it, such as Open Visual Grammar. Pass the
compiled runtime prompt to this skill with `--prompt-file`.

## Script Rules

Use the bundled script instead of generating a new ad-hoc request script. The bundled script is dependency-free, uses built-in `fetch`, reads `SORRYCODE_API_KEY`, writes UTF-8 diagnostics, and parses JSON or SSE responses.

If the caller already stores the runtime prompt as its own source of truth, pass
`--no-prompt-log` so this skill does not create a duplicate `prompt.txt`.

Do not hardcode secrets. Do not print the API key.

## Error Handling

- `401`: API key is missing, invalid, or not sent as `Authorization: Bearer ...`
- `400`: request body is malformed; check `model`, `prompt`, `size`, and `n`
- `400 images endpoint requires an image model`: model is not enabled as an image model
- `503 No available compatible accounts`: the current group has no compatible image account available, or compatible accounts are temporarily unavailable
- `524`: request exceeded Cloudflare's response window. Retry later, simplify the prompt, reduce size, or try `--no-stream`.

When a request fails, point to the diagnostics folder and mention the exact saved files. Do not claim the image was generated unless the script saved an image file.
