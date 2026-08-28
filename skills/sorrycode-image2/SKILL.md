---
name: sorrycode-image2
description: Generate or edit images through the SorryCode Images API with automatic model fallback and visual result checks. Reuse the active SorryCode Codex provider key; use for reproducible image generation, local image editing, fixed output paths, or saved diagnostics.
---

# SorryCode Image2

Deliver an image that satisfies the caller's request through the SorryCode
Images API. An API response or saved path is only an intermediate result. This
Skill owns credential discovery, request execution, model fallback, output
files, and result checks.

## Default Path

1. Determine whether the caller wants to generate a new image or edit an existing one.
2. Run the bundled script without asking for an API key. The script discovers the active SorryCode Codex provider and reuses its current credential.
3. Let the script choose the model unless the caller passes `--model`. Standard sizes try `gpt-image-2-all`, then `gpt-image-2` after an explicit retryable failure. 2K and 4K sizes use `gpt-image-2`.
4. Use `1024x1024` by default. For aspect ratios, high resolution, 2K, 4K, or an explicit `size`, read `references/size-guide.md` first.
5. Use streaming with two partial images by default.
6. For editing, require a local PNG, JPEG, or WebP path and pass `--mode edit --image <path>`.
7. Save outputs under `outputs/images/<short-slug>/` unless the caller chooses another folder.
8. Confirm that `summary.json` names a saved image, then display the image with the host viewer. Do not report only a path.
9. Check the displayed image against the requested subject, composition, aspect ratio, text, and edit constraints. If it misses a requirement, revise the prompt or parameters and run a materially different attempt. Continue until an image passes or a failure below makes another paid request unsafe.
10. If both SorryCode models finish with known results but save no image, use another image generator only when the current session exposes a concrete callable tool. A Skill or mode named `imagegen` does not by itself provide that tool.

## Execution

Resolve `SKILL_DIR` to the directory containing this `SKILL.md`. Do not ask the
user to set it.

Generate an image:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --prompt "<image prompt>" \
  --out outputs/images/run
```

Use a workflow-owned prompt without duplicating it:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --prompt-file path/to/runtime-prompt.md \
  --no-prompt-log \
  --out outputs/images/run
```

Edit a local image:

```bash
node "$SKILL_DIR/scripts/sorrycode-image2.mjs" \
  --mode edit \
  --image ./input/product.png \
  --prompt "<edit instruction>" \
  --out outputs/images/edit-run
```

## API Contract

Always send production image requests through the direct ingress:

```text
https://api.sorrycode.com/v1/images/generations
https://api.sorrycode.com/v1/images/edits
```

Do not inherit the request URL from Codex configuration. The Codex provider is
used only to locate and validate the credential.

The default standard-size request starts with `gpt-image-2-all`, `1024x1024`,
`stream: true`, `partial_images: 2`, and `response_format: b64_json`. The script
tries `gpt-image-2` only after a completed empty result or an explicit retryable
HTTP rejection. Passing `--model` limits execution to that model.

## Credential Discovery

Credential discovery belongs to the Skill, not the user:

1. Resolve `CODEX_HOME`, defaulting to `~/.codex`.
2. Read `config.toml` and identify the active `model_provider`.
3. Confirm that the active provider's `base_url` belongs to `sorrycode.com` or one of its subdomains.
4. If the provider uses `requires_openai_auth = true`, read `OPENAI_API_KEY` from `auth.json`.
5. If the provider explicitly declares `env_key`, read only that provider-owned variable.

Never ask for a separate image key. Never scan project files, unrelated `.env`
files, shell history, other tool configurations, or the whole filesystem for
credentials. Never print the key or write it to diagnostics.

If no readable credential exists, tell the user to open the SorryCode API Key
page, choose **Connect tool > Codex**, complete that setup, and run the Skill
again. Do not ask the user to paste a key into chat, and do not change the Codex
installer or credential-storage settings to make discovery easier.

## Inputs And Outputs

The caller must supply either `--prompt` or `--prompt-file`. If neither exists,
ask for the prompt or edit instruction rather than inventing visual direction.

The script writes `summary.json` at the selected output directory and keeps each
model's request, response, streaming diagnostics, and saved image under
`attempts/`. It writes `prompt.txt` unless `--no-prompt-log` is passed.

## Failure Handling

- `400`, `404`, `409`, `429`, or `5xx`: the script may try the next compatible model after the server explicitly rejects the request.
- `401`, `402`, or `403`: stop; the active SorryCode Codex key, balance, or group must be fixed first.
- A disconnect, timeout, interrupted response, or failed image download may leave the paid request processing remotely. Stop instead of submitting another model request.

Never switch credentials. Do not claim success unless `summary.json` names an
image file and the displayed image passes the caller's request.

## Reference

- Read `references/size-guide.md` only when the caller needs size or resolution guidance.
