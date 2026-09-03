# Size Guide

Load this reference only when the user asks for a specific aspect ratio, high resolution, 2K / 4K output, or how to set the `size` parameter.

## Default behavior

Use `1024x1024` by default. Keep `stream: true` and `partial_images: 2` by default. `1024x1024` uses `gpt-image-2` and is appropriate for covers, avatars, article images, community images, and first drafts.

Do not ask the user about size unless it matters to the task. If the user does not mention size or aspect ratio, keep the default.

## Conservative compatible sizes

Use these first for stable beginner flows:

| Use case | `size` |
| --- | --- |
| Default / square | `1024x1024` |
| Landscape | `1536x1024` |
| Portrait | `1024x1536` |
| Let the model choose | `auto` |

These sizes use `gpt-image-2`. Custom images with both edges below `2048` and no more than about `2.1` megapixels, including `1600x640` and `1920x1080`, use the same route.

Recommended mapping:

- square cover, avatar, sticker, first draft: `1024x1024`
- website hero, article header, horizontal poster: `1536x1024`
- mobile poster, vertical cover, character poster: `1024x1536`
- user is unsure or explicitly says "auto": `auto`

## Higher-resolution sizes

Use the following sizes only when the user explicitly asks for higher resolution or wants to experiment, and keep streaming enabled.

| Use case | `size` |
| --- | --- |
| 2K square | `2048x2048` |
| 2K landscape | `2048x1152` |
| 4K landscape | `3840x2160` |
| 4K portrait | `2160x3840` |

These sizes also use `gpt-image-2`.

Before using a community reference size, tell the user briefly:

```text
I can try this higher-resolution size with gpt-image-2. It may take longer, so I will keep stream:true and partial_images:2 enabled and save the streaming events.
```

If the API rejects the size with `400`, inspect the diagnostics before starting a new request. When the user chooses to try a conservative size, use this mapping:

- `2048x2048` -> `1024x1024`
- `2048x1152` or `3840x2160` -> `1536x1024`
- `2160x3840` -> `1024x1536`

After a timeout, disconnect, or upstream failure, do not start another request automatically. The original paid request may still be processing; check its state first.

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

gpt-image-2 4K landscape experiment:

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


## Invalid 4K size

Do not use `4096x4096` as a 4K size. Current upstream constraints require the maximum side to be at most `3840px` and total pixels to be at most `8,294,400`. Use `3840x2160` or `2160x3840` for 4K experiments.
