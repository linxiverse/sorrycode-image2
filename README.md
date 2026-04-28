# SorryCode Image2

Generate or edit image assets with `gpt-image-2` through the SorryCode Images API.

## Install

### Codex

```bash
npx skills add linxiverse/sorrycode-image2 -a codex -g -y
```

### Claude Code

```bash
npx skills add linxiverse/sorrycode-image2 -a claude-code -g -y
```

## What It Does

- checks `SORRYCODE_API_KEY` before making requests
- uses `gpt-image-2` by default
- generates new images through `/v1/images/generations`
- edits existing local images through `/v1/images/edits`
- saves prompt, response metadata, and image outputs under `outputs/images/`
- keeps advanced size guidance in `references/size-guide.md`

## First Prompt

```text
请用 SorryCode Image2 帮我生成一张中文播客封面，主题是 AI 编程，新手友好，暖色调，干净排版。先检查 API Key，如果没设置就告诉我怎么设置；成功后把图片和 response 保存到 outputs/images/first-cover/。
```
