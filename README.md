# md

Render markdown in terminal, or generate a scrolling terminal-style video from markdown.

## Prerequisites

- Bun
- `ffmpeg` (required for `--video`)

## Install

```bash
bun install
```

## Run

```bash
bun run dev README.md
```

## Video

```bash
bun run video README.md -o output.mp4
```

## Tooling

```bash
bun run format
bun run lint
bun run check
bun run test
```
