# Size Guide

Load this reference only when the user asks for a specific aspect ratio, high resolution, 2K / 4K output, or how to set the `size` parameter.

## Default behavior

Use `1024x1024` by default. Always keep `stream: true` and `partial_images: 2` in image requests. `1024x1024` is the safest first-run size and is appropriate for covers, avatars, article images, community images, and first drafts.

Do not ask the user about size unless it matters to the task. If the user does not mention size or aspect ratio, keep the default.

## Conservative compatible sizes

Use these first for stable beginner flows:

| Use case | `size` |
| --- | --- |
| Default / square | `1024x1024` |
| Landscape | `1536x1024` |
| Portrait | `1024x1536` |
| Let the model choose | `auto` |

Recommended mapping:

- square cover, avatar, sticker, first draft: `1024x1024`
- website hero, article header, horizontal poster: `1536x1024`
- mobile poster, vertical cover, character poster: `1024x1536`
- user is unsure or explicitly says "auto": `auto`

## Community reference sizes

The following sizes are higher-resolution parameters. Use them only when the user explicitly asks for higher resolution or wants to experiment, and keep streaming enabled.

| Community reference use case | `size` |
| --- | --- |
| 2K square | `2048x2048` |
| 2K landscape | `2048x1152` |
| 4K landscape | `3840x2160` |
| 4K portrait | `2160x3840` |

Before using a community reference size, tell the user briefly:

```text
I can try this higher-resolution size. It may take longer, so I will keep stream:true and partial_images:2 enabled and save the streaming events.
```

If the request fails with `400`, `524`, timeout, or upstream failure, retry once with the closest conservative streaming request:

- `2048x2048` -> `1024x1024`
- `2048x1152` or `3840x2160` -> `1536x1024`
- `2160x3840` -> `1024x1536`

## Request examples

Square default:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1,
  "stream": true,
  "partial_images": 2
}
```

Landscape:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1536x1024",
  "n": 1,
  "stream": true,
  "partial_images": 2
}
```

Community 4K landscape experiment:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "3840x2160",
  "n": 1,
  "stream": true,
  "partial_images": 2
}
```
