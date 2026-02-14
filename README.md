# mmmd

Render markdown in terminal, or generate scrolling terminal-style videos from markdown.

## Usage

```bash
# render markdown in terminal
bunx mmmd README.md

# generate video
bunx mmmd README.md --video -o output.mp4
```

## Video Options

```bash
bunx mmmd <file.md> --video [options]

--size sm|md|lg          # video size preset (default: md)
--aspect square|landscape|portrait  # aspect ratio (default: landscape)
--padding sm|md|lg       # padding size (default: md)
--cols <n>               # terminal columns (default: 80)
--fps <n>                # frames per second (default: 30)
--quality <n>            # encoding quality (default: 28)
--page-wait <secs>       # pause between pages (default: 6)
--overlap <lines>        # lines to overlap between pages (default: 4)
--bg <color>             # background color (default: #222)
--window <color>         # window color (default: #000)
--border <color>         # border color (default: #333)
--font <name>            # font family (default: Menlo)
-o <file>                # output file (default: output.mp4)
```

## Install Globally

```bash
bun install -g mmmd
```

## Prerequisites

- [Bun](https://bun.sh)
- `ffmpeg` (for video generation)
