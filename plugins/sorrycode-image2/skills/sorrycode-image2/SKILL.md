---
name: sorrycode-image2
description: Generate or edit images through the SorryCode Images API with gpt-image-2-all or gpt-image-2 from an existing prompt. Automatically discover the active SorryCode Codex provider key; use when a caller needs reproducible image generation, local image editing, fixed output paths, or saved diagnostics.
---

# SorryCode Image2

Execute an existing image prompt or edit instruction through the SorryCode
Images API. This Skill owns credential discovery, request execution, and output
files. It does not own visual direction, prompt design, or reusable style
systems.

## Default Path

1. Determine whether the caller wants to generate a new image or edit an existing one.
2. Run the bundled script without asking for an API key. The script discovers the active SorryCode Codex provider and reuses its current credential.
3. Let the script choose the model unless the caller passes `--model`. Standard sizes use `gpt-image-2-all`; 2K and 4K sizes use `gpt-image-2`.
4. Use `1024x1024` by default. For aspect ratios, high resolution, 2K, 4K, or an explicit `size`, read `references/size-guide.md` first.
5. Use streaming with two partial images by default.
6. For editing, require a local PNG, JPEG, or WebP path and pass `--mode edit --image <path>`.
7. Save outputs under `outputs/images/<short-slug>/` unless the caller chooses another folder.
8. Confirm that `summary.json` names a saved image, then display the image with the host viewer. Do not report only a path.

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

The default standard-size request uses `gpt-image-2-all`, `1024x1024`,
`stream: true`, `partial_images: 2`, and `response_format: b64_json`.
Passing `--model` overrides automatic model selection.

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

The script writes request, response, summary, streaming diagnostics, and the
saved image under the selected output directory. It writes `prompt.txt` unless
`--no-prompt-log` is passed.

## Failure Handling

- `400`: check the model, prompt, size, count, and input image format.
- `401` or `403`: the active SorryCode Codex key is invalid or lacks image permission.
- `503 No available compatible accounts`: the active Codex group has no compatible image account.
- A disconnect or timeout may leave the paid request processing remotely.

Never switch credentials or automatically send a second request after a
failure. Point to the saved diagnostics and do not claim success unless an image
file was saved.

## Reference

- Read `references/size-guide.md` only when the caller needs size or resolution guidance.
