#!/usr/bin/env bun

import { spawnSync } from 'child_process'
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'

import { createCanvas } from 'canvas'

const SIZES = {
  sm: { square: 540, landscape: [720, 540], portrait: [540, 720] },
  md: { square: 720, landscape: [960, 720], portrait: [720, 960] },
  lg: { square: 1080, landscape: [1440, 1080], portrait: [1080, 1440] },
}

const PADDINGS = { sm: 30, md: 48, lg: 64 }

const DEFAULTS = {
  bg: '#222',
  window: '#000',
  border: '#333',
  size: 'md' as keyof typeof SIZES,
  aspect: 'landscape' as 'square' | 'landscape' | 'portrait',
  padding: 'md' as keyof typeof PADDINGS,
  fps: 30,
  speed: 8,
  font: 'Menlo',
  quality: 28,
  cols: 80,
  pageWait: 6,
  overlap: 4,
}

// high saturation colors
const ANSI: Record<number, string> = {
  30: '#8899cc',
  31: '#ff5555',
  32: '#50fa7b',
  33: '#f1fa8c',
  34: '#6699ff',
  35: '#ff79c6',
  36: '#8be9fd',
  37: '#ffffff',
  90: '#8899cc',
  91: '#ff5555',
  92: '#50fa7b',
  93: '#f1fa8c',
  94: '#6699ff',
  95: '#ff79c6',
  96: '#8be9fd',
  97: '#ffffff',
}

interface Style {
  fg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
}
interface Span {
  text: string
  style: Style
}
type Aspect = 'square' | 'landscape' | 'portrait'
type SizeKey = keyof typeof SIZES
type PaddingKey = keyof typeof PADDINGS

function parseAnsi(text: string): Span[] {
  const spans: Span[] = []
  const re = /\u001b\[([0-9;]*)m/g
  let idx = 0,
    style: Style = {},
    m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > idx) spans.push({ text: text.slice(idx, m.index), style: { ...style } })
    const seq = m[1] ?? ''
    for (const c of seq.split(';').filter(Boolean).map(Number)) {
      if (c === 0) style = {}
      else if (c === 1) style.bold = true
      else if (c === 2) style.dim = true
      else if (c === 3) style.italic = true
      else if (c === 4) style.underline = true
      else if (c === 22) style.bold = style.dim = false
      else if (c === 23) style.italic = false
      else if (c === 24) style.underline = false
      else if (c === 39) style.fg = undefined
      else if (ANSI[c]) style.fg = ANSI[c]
    }
    idx = re.lastIndex
  }
  if (idx < text.length) spans.push({ text: text.slice(idx), style: { ...style } })
  return spans
}

function usage(): string {
  return `Usage: md <file.md> --video [opts]
  --size sm|md|lg  --aspect square|landscape|portrait  --padding sm|md|lg
  --cols <n>  --fps <n>  --font <name>  --quality <n>  --page-wait <secs>
  --overlap <lines>  --bg/--window/--border <color>  -o <output.mp4>`
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function assertChoice<T extends string>(
  name: string,
  value: string,
  choices: readonly T[]
): T {
  if (choices.includes(value as T)) return value as T
  throw new Error(`Invalid ${name}: "${value}". Expected one of: ${choices.join(', ')}`)
}

function assertMin(name: string, value: number, min: number): number {
  if (value < min) throw new Error(`Invalid ${name}: ${value}. Must be >= ${min}`)
  return value
}

function parseArgs() {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage())
    process.exit(0)
  }
  const get = (f: string) => {
    const i = args.indexOf(f)
    return i !== -1 ? args[i + 1] : undefined
  }

  const size = assertChoice<SizeKey>('size', get('--size') || DEFAULTS.size, [
    'sm',
    'md',
    'lg',
  ] as const)
  const aspect = assertChoice<Aspect>('aspect', get('--aspect') || DEFAULTS.aspect, [
    'square',
    'landscape',
    'portrait',
  ] as const)
  const padding = assertChoice<PaddingKey>(
    'padding',
    get('--padding') || DEFAULTS.padding,
    ['sm', 'md', 'lg'] as const
  )
  const fps = assertMin('fps', parseNumber(get('--fps'), DEFAULTS.fps), 1)
  const speed = assertMin('speed', parseNumber(get('--speed'), DEFAULTS.speed), 0)
  const quality = assertMin('quality', parseNumber(get('--quality'), DEFAULTS.quality), 0)
  const cols = assertMin('cols', parseNumber(get('--cols'), DEFAULTS.cols), 1)
  const pageWait = assertMin(
    'page-wait',
    parseNumber(get('--page-wait'), DEFAULTS.pageWait),
    0
  )
  const overlap = assertMin('overlap', parseNumber(get('--overlap'), DEFAULTS.overlap), 0)

  return {
    file: args.find((a) => !a.startsWith('-')),
    output: get('-o') || 'output.mp4',
    bg: get('--bg') || DEFAULTS.bg,
    window: get('--window') || DEFAULTS.window,
    border: get('--border') || DEFAULTS.border,
    size,
    aspect,
    padding,
    fps,
    speed,
    font: get('--font') || DEFAULTS.font,
    quality,
    cols,
    pageWait,
    overlap,
  }
}

function renderMarkdown(file: string, cols: number): string {
  const content = readFileSync(file, 'utf-8')
  const script = `
    import { marked } from 'marked'
    import { markedTerminal } from 'marked-terminal'
    marked.use(markedTerminal({ reflowText: true, width: ${cols}, showSectionPrefix: false, tab: 2 }))
    const content = ${JSON.stringify(content)}
    process.stdout.write(marked.parse(content))
  `
  const result = spawnSync('bun', ['-e', script], {
    env: { ...process.env, FORCE_COLOR: '3' },
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    cwd: import.meta.dir,
  })
  if (result.error) {
    throw new Error(`Failed to render markdown with bun: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || `exit code ${result.status}`
    throw new Error(`Markdown render failed: ${detail}`)
  }
  return result.stdout
}

async function main() {
  const o = parseArgs()
  if (!o.file) {
    console.error(usage())
    process.exit(1)
  }

  const preset = SIZES[o.size]
  const [W, H] =
    o.aspect === 'square'
      ? [preset.square, preset.square]
      : (preset[o.aspect] as [number, number])
  const PAD = PADDINGS[o.padding]
  const FONT = o.size === 'sm' ? 12 : o.size === 'md' ? 13 : 15
  const LH = Math.round(FONT * 1.5)
  const WPAD = Math.round(PAD * 0.7)
  const RAD = o.size === 'sm' ? 10 : 12
  const TITLE_H = 32

  const mc = createCanvas(100, 100)
  const mx = mc.getContext('2d')
  mx.font = `${FONT}px "${o.font}", Monaco, Menlo, monospace`
  const cw = mx.measureText('M').width
  const contentW = Math.ceil(o.cols * cw)
  const winW = contentW + WPAD * 2
  const winH = H - PAD * 2
  const winX = Math.round((W - winW) / 2)
  const winY = PAD

  const rendered = renderMarkdown(resolve(o.file), o.cols)
  const lines = rendered.split('\n').map(parseAnsi)

  const colorCount = lines.flat().filter((s) => s.style.fg).length
  console.log(`${W}x${H} | ${o.cols} cols | ${colorCount} colored spans`)

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const contentTop = winY + TITLE_H
  const visH = winH - TITLE_H - WPAD
  const totalH = lines.length * LH
  const maxScroll = Math.max(0, totalH - visH + WPAD) // include bottom padding
  const hasScroll = maxScroll > 0

  const ZOOM_FRAMES = Math.round(o.fps * 0.6)
  const zoomScale = W / winW

  // paginated scroll config
  const pageHeight = Math.max(LH, visH - LH * o.overlap) // overlap lines from previous page
  const numPages = Math.ceil(maxScroll / pageHeight)
  const PAGE_SCROLL_FRAMES = Math.round(o.fps * 0.8) // time to scroll one page
  const PAGE_PAUSE_FRAMES = Math.round(o.fps * o.pageWait) // pause between pages
  const HOLD_AFTER_ZOOM = PAGE_PAUSE_FRAMES // same as page wait
  // last page pause serves as final hold, no extra HOLD_AFTER_ZOOM needed
  const scrollFrames = hasScroll ? numPages * (PAGE_SCROLL_FRAMES + PAGE_PAUSE_FRAMES) : 0
  const total =
    ZOOM_FRAMES +
    HOLD_AFTER_ZOOM +
    scrollFrames +
    (hasScroll ? ZOOM_FRAMES : Math.round(o.fps * 0.3))

  console.log(
    `${lines.length} lines | ${numPages} pages | ${total} frames (~${Math.round(total / o.fps)}s)`
  )

  const tmp = `/tmp/md-video-${Date.now()}`
  mkdirSync(tmp, { recursive: true })

  try {
    for (let f = 0; f < total; f++) {
      let zoom = 1,
        scrollY = 0

      const scrollStart = ZOOM_FRAMES + HOLD_AFTER_ZOOM
      const scrollEnd = scrollStart + scrollFrames
      const zoomOutStart = scrollEnd // last page pause serves as final hold

      if (f < ZOOM_FRAMES) {
        // zoom IN
        const p = f / ZOOM_FRAMES
        const ease = 1 - Math.pow(1 - p, 3)
        zoom = 1 + (zoomScale - 1) * ease
        scrollY = 0
      } else if (f < scrollStart) {
        // hold after zoom in
        zoom = zoomScale
        scrollY = 0
      } else if (f < scrollEnd) {
        // paginated scrolling
        zoom = zoomScale
        const scrollFrame = f - scrollStart
        const pageLen = PAGE_SCROLL_FRAMES + PAGE_PAUSE_FRAMES
        const currentPage = Math.floor(scrollFrame / pageLen)
        const frameInPage = scrollFrame % pageLen

        const prevPageScroll = currentPage * pageHeight
        if (frameInPage < PAGE_SCROLL_FRAMES) {
          // scrolling to next page
          const p = frameInPage / PAGE_SCROLL_FRAMES
          const ease = 1 - Math.pow(1 - p, 3)
          scrollY = Math.min(maxScroll, prevPageScroll + pageHeight * ease)
        } else {
          // paused on page
          scrollY = Math.min(maxScroll, prevPageScroll + pageHeight)
        }
      } else if (hasScroll) {
        // zoom OUT
        const p = (f - zoomOutStart) / ZOOM_FRAMES
        const ease = 1 - Math.pow(1 - p, 3)
        zoom = zoomScale - (zoomScale - 1) * ease
        scrollY = maxScroll
      } else {
        zoom = 1
        scrollY = 0
      }

      ctx.save()
      ctx.fillStyle = o.bg
      ctx.fillRect(0, 0, W, H)

      // zoom centered on top of content, not center of screen
      const cx = W / 2
      const cy = winY + TITLE_H // top of content area
      ctx.translate(cx, cy)
      ctx.scale(zoom, zoom)
      ctx.translate(-cx, -cy)

      // shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 70
      ctx.shadowOffsetY = 30
      ctx.fillStyle = o.window
      ctx.beginPath()
      ctx.roundRect(winX, winY, winW, winH, RAD)
      ctx.fill()
      ctx.restore()

      // window
      ctx.fillStyle = o.window
      ctx.beginPath()
      ctx.roundRect(winX, winY, winW, winH, RAD)
      ctx.fill()

      // border
      ctx.strokeStyle = o.border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(winX, winY, winW, winH, RAD)
      ctx.stroke()

      // dots
      const dy = winY + 16,
        dx = winX + 16
      ctx.fillStyle = '#ff5f57'
      ctx.beginPath()
      ctx.arc(dx, dy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#febc2e'
      ctx.beginPath()
      ctx.arc(dx + 16, dy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#28c840'
      ctx.beginPath()
      ctx.arc(dx + 32, dy, 5, 0, Math.PI * 2)
      ctx.fill()

      // clip & text
      ctx.save()
      ctx.beginPath()
      ctx.rect(winX + WPAD, contentTop, contentW, visH)
      ctx.clip()

      let y = contentTop + LH - scrollY
      for (const line of lines) {
        if (y > contentTop - LH && y < contentTop + visH + LH) {
          let x = winX + WPAD
          for (const { text, style } of line) {
            ctx.fillStyle = style.dim ? '#6272a4' : style.fg || '#ffffff'
            ctx.font = `${style.bold ? 'bold ' : ''}${style.italic ? 'italic ' : ''}500 ${FONT}px "${o.font}", Monaco, Menlo, monospace`
            ctx.fillText(text, x, y)
            if (style.underline) {
              ctx.strokeStyle = ctx.fillStyle
              ctx.lineWidth = 1
              const w = ctx.measureText(text).width
              ctx.beginPath()
              ctx.moveTo(x, y + 2)
              ctx.lineTo(x + w, y + 2)
              ctx.stroke()
            }
            x += ctx.measureText(text).width
          }
        }
        y += LH
      }
      ctx.restore()
      ctx.restore()

      // progress bar during pauses (in screen coords)
      const barW = 180
      const barH = 6
      const barX = (W - barW) / 2
      const barY = H - 30
      let barProgress = -1

      // first page hold (after zoom in)
      if (f >= ZOOM_FRAMES && f < scrollStart) {
        barProgress = (f - ZOOM_FRAMES) / HOLD_AFTER_ZOOM
      }
      // page pauses during scroll (includes last page which serves as final hold)
      else if (f >= scrollStart && f < scrollEnd) {
        const scrollFrame = f - scrollStart
        const pageLen = PAGE_SCROLL_FRAMES + PAGE_PAUSE_FRAMES
        const frameInPage = scrollFrame % pageLen
        if (frameInPage >= PAGE_SCROLL_FRAMES) {
          barProgress = (frameInPage - PAGE_SCROLL_FRAMES) / PAGE_PAUSE_FRAMES
        }
      }

      if (barProgress >= 0) {
        // bg
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.beginPath()
        ctx.roundRect(barX, barY, barW, barH, barH / 2)
        ctx.fill()

        // fill
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.roundRect(barX, barY, barW * barProgress, barH, barH / 2)
        ctx.fill()
      }

      writeFileSync(
        join(tmp, `f${String(f).padStart(5, '0')}.png`),
        canvas.toBuffer('image/png')
      )
      if (f % o.fps === 0) process.stdout.write(`\r${Math.round((f / total) * 100)}%`)
    }

    console.log('\nencoding...')
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        String(o.fps),
        '-i',
        join(tmp, 'f%05d.png'),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-crf',
        String(o.quality),
        o.output,
      ],
      { stdio: 'inherit' }
    )
    if (ffmpeg.error) {
      throw new Error(`Failed to start ffmpeg: ${ffmpeg.error.message}`)
    }
    if (ffmpeg.status !== 0) {
      throw new Error(`ffmpeg exited with code ${ffmpeg.status}`)
    }

    console.log(`✓ ${o.output}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
