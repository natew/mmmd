#!/usr/bin/env bun

import { readFileSync } from 'fs'
import { resolve } from 'path'

const args = process.argv.slice(2)
const usage = 'Usage: md <file.md> [--video [-o output.mp4] [--bg "#color"]]'

if (args.includes('-h') || args.includes('--help')) {
  console.log(usage)
  process.exit(0)
}

// check for --video flag
if (args.includes('--video')) {
  const videoArgs = args.filter((a) => a !== '--video')
  process.argv = ['bun', 'video.ts', ...videoArgs]
  await import('./video.ts')
} else {
  // regular markdown rendering
  const { marked } = await import('marked')
  const { markedTerminal } = await import('marked-terminal')

  const file = args.find((a) => !a.startsWith('-'))

  if (!file) {
    console.error(usage)
    process.exit(1)
  }

  let content = ''
  try {
    content = readFileSync(resolve(file), 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to read markdown file "${file}": ${message}`)
    process.exit(1)
  }

  marked.use(
    markedTerminal({
      reflowText: true,
      width: process.stdout.columns || 80,
      showSectionPrefix: false,
      tab: 2,
    })
  )

  console.log(marked.parse(content))
}
