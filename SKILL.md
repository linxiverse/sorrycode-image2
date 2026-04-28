---
name: sorrycode-image2
description: Generate or edit and save images through SorryCode Images API. Use when the user asks to generate covers, posters, illustrations, product visuals, article images, avatars, game sprites, or edit/restyle an existing image with SorryCode/gpt-image-2. The skill must check for a SorryCode API key before making requests, guide the user to create or set the key if missing, and save outputs into a local folder with the prompt and response metadata.
---

# SorryCode Image2

Use this skill when the user wants to create image assets through SorryCode.

## Default path

1. Clarify whether the user wants to generate a new image or edit an existing one.
2. Check whether `SORRYCODE_API_KEY` exists before writing or running any request.
3. If the key is missing, stop and help the user set it up in beginner-friendly language. Do not invent a key and do not continue with a fake request.
4. Use `gpt-image-2` by default.
5. Use `1024x1024` by default. If the user asks for aspect ratio, high resolution, 2K / 4K, or `size`, load `references/size-guide.md` before choosing the parameter.
6. For generation, call `/v1/images/generations` with a JSON body.
7. For editing, require a local input image path, then call `/v1/images/edits` with `multipart/form-data`.
8. Save outputs under `outputs/images/<short-slug>/` in the current project unless the user asks for another folder.
9. Save the prompt as `prompt.txt` and the raw JSON response as `response.json`. For edits, also copy or record the source image path.
10. If the response contains `url`, tell the user to open or download it. If it contains `b64_json`, decode it to `image.png`.

## API settings

Default generation endpoint:

```text
https://www.sorrycode.com/v1/images/generations
```

Default edit endpoint:

```text
https://www.sorrycode.com/v1/images/edits
```

If the user or project provides `SORRYCODE_BASE_URL`, use that value and append `/images/generations` or `/images/edits` after removing any trailing `/v1` or `/` ambiguity carefully. Prefer the project’s existing conventions if present.

Default generation request body:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1
}
```

Default edit form fields:

```text
model=gpt-image-2
prompt=...
size=1024x1024
image=@/path/to/input.png
```

## API key gate

Before making a request, check:

- macOS / Linux: `process.env.SORRYCODE_API_KEY` or `$SORRYCODE_API_KEY`
- Windows PowerShell: `$env:SORRYCODE_API_KEY`

If missing, say:

```text
I need your SorryCode image API key before I can generate or edit images. Create one from Platform / Create API Key, then I can help your computer remember it. The setting name is SORRYCODE_API_KEY, and it will not change your Codex model configuration.
```

Then offer the persistent setup command for the user’s OS, or ask for permission before editing shell profile files. For public docs, point users to `Platform / Create API Key`.

## Progressive disclosure references

Load references only when they are needed:

- `references/prompt-patterns.md`: when the user wants examples, styles, or help shaping the prompt
- `references/size-guide.md`: when the user asks for aspect ratio, high resolution, 2K / 4K, or how to set `size`

## Prompt shaping

Ask for only the missing fields that matter:

- task type: generate a new image, or edit an existing image
- source image path, only for edit tasks
- purpose: cover, poster, illustration, character, product visual, article image
- subject
- style
- mood or color
- whether text is needed

Do not over-optimize the first prompt. The first run should produce one usable image quickly. For edits, describe the intended change instead of rewriting the whole source image from scratch.

## Minimal Node.js script pattern

When writing a script, keep it dependency-free and use built-in `fetch` in modern Node.js. Read the prompt from command-line arguments. Create the output folder before writing files.

Do not hardcode secrets. Read `SORRYCODE_API_KEY` from the environment.

## Error handling

- `401`: API key is missing, invalid, or not sent as `Authorization: Bearer ...`
- `400`: request body is malformed; check `model`, `prompt`, `size`, and `n`
- `503 No available compatible accounts`: the current group has no compatible account available; image models may not be enabled yet, or compatible accounts may be temporarily unavailable
- slow request: image generation is slower than text; retry with a shorter prompt or wait

## Boundaries

- Do not explain SorryCode internal account groups, billing routing, or OAuth image bridge.
- Do not turn this skill into a full HTTP API manual; use Platform docs for that.
- Do not promise a built-in Codex image button.
- Do not ask the user to learn HTTP before their first image.
- Do not generate multiple variants by default; start with `n: 1`.
