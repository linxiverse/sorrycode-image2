---
name: sorrycode-image2
description: Generate or edit images through the SorryCode Images API with gpt-image-2-all or gpt-image-2 from an already-specified prompt. Reuse the active Codex SorryCode provider key by default, and use SORRYCODE_API_KEY only when that key is unavailable or definitely cannot generate images. Use for image generation or editing through SorryCode; this skill owns credential discovery, endpoint selection, request parameters, output files, and diagnostics, but not visual prompt writing.
---

# SorryCode Image2

Use this skill to execute an existing image prompt or edit instruction through
the SorryCode Images API. Reuse the user's active Codex SorryCode configuration
before introducing a separate image credential.

This is a runtime driver. It does not own visual direction, style systems,
article cover methodology, prompt formulas, or reusable image patterns.

## Default Path

1. Clarify whether the caller wants to generate a new image or edit an existing one.
2. Run the bundled script without checking or requesting `SORRYCODE_API_KEY` first. The script discovers the active Codex SorryCode provider and reuses its current key.
3. Let the script use `SORRYCODE_API_KEY` only when the current Codex key is missing or receives a definite authentication or image-capability failure. After a timeout, disconnect, rate limit, or ambiguous service failure, do not automatically send a second paid request.
4. If neither credential works, give the Image2 fallback setup guidance below. Do not invent a key or continue with a fake request.
5. Let the script choose the model unless the caller explicitly passes `--model`. `auto` and standard sizes below 2K use `gpt-image-2-all`; 2K and 4K sizes use `gpt-image-2`.
6. Use `1024x1024` by default. If the user asks for aspect ratio, high resolution, 2K / 4K, or `size`, load `references/size-guide.md` before choosing the parameter.
7. Use `stream: true` and `partial_images: 2` by default.
8. For editing, require a local input image path, then run the script with `--mode edit --image <path>`.
9. Save outputs under `outputs/images/<short-slug>/` unless the user asks for another folder. The script writes request, response, summary, and streaming diagnostics without storing credentials.
10. Confirm that `summary.json` names a saved image, then display that image with the host's image viewer. Do not report only a filesystem path.

## Execution Path

Resolve `SKILL_DIR` to the directory that contains this `SKILL.md`; when editing this repository directly, `SKILL_DIR` is the repository root.

Image generation:

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

Use the active Codex SorryCode provider's `base_url` by default. If it cannot be
discovered, use:

```text
https://sorrycode.com/v1/images/generations
```

Default edit endpoint:

```text
https://sorrycode.com/v1/images/edits
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

## Credential Resolution

The bundled script resolves credentials in this order:

1. Confirm that the active provider in `CODEX_HOME/config.toml` points to `sorrycode.com` or one of its subdomains.
2. For `requires_openai_auth = true`, read `OPENAI_API_KEY` from `CODEX_HOME/auth.json`. For an `env_key` provider, read only the named environment variable.
3. If the current key is unavailable or definitely lacks image capability, use `SORRYCODE_API_KEY` as the Image2 fallback.

Never print a key, include it in diagnostics, or reuse a key from a non-SorryCode
provider. A standalone Skill cannot extract credentials from an OS keyring; if
Codex stores the current key there instead of `auth.json`, proceed to the
fallback step.

Only when the fallback is required and missing, say:

```text
Your current Codex SorryCode key is unavailable or cannot generate images. Create or select a SorryCode API key from the Image2 group, then set it as SORRYCODE_API_KEY. This fallback key does not replace your current Codex GPT key.
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

Use the bundled script instead of generating a new ad-hoc request script. The bundled script is dependency-free, discovers the active Codex SorryCode credential, uses built-in `fetch`, writes UTF-8 diagnostics, and parses JSON or SSE responses.

If the caller already stores the runtime prompt as its own source of truth, pass
`--no-prompt-log` so this skill does not create a duplicate `prompt.txt`.

Do not hardcode secrets. Do not print the API key.

## Error Handling

- `401` / `403`: the current key is invalid or lacks image permission; try the configured Image2 fallback once
- `400`: request body is malformed; check `model`, `prompt`, `size`, and `n`
- `400 images endpoint requires an image model`: model is not enabled as an image model
- `503 No available compatible accounts`: the current group has no compatible image account; try the configured Image2 fallback once
- `524`: request exceeded Cloudflare's response window. Retry later, simplify the prompt, reduce size, or try `--no-stream`.

When a request fails, point to the diagnostics folder and mention the exact saved files. Do not claim the image was generated unless the script saved an image file. Do not automatically retry with another key when completion or billing state is unknown.
