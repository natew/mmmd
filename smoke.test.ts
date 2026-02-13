import { describe, expect, test } from 'bun:test'

describe('cli smoke', () => {
  test('md help exits cleanly', () => {
    const result = Bun.spawnSync({
      cmd: ['bun', 'run', 'index.ts', '--help'],
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: import.meta.dir,
    })
    const out = Buffer.from(result.stdout).toString('utf8')
    expect(result.exitCode).toBe(0)
    expect(out).toContain('Usage: md <file.md>')
  })

  test('video help exits cleanly', () => {
    const result = Bun.spawnSync({
      cmd: ['bun', 'run', 'video.ts', '--help'],
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: import.meta.dir,
    })
    const out = Buffer.from(result.stdout).toString('utf8')
    expect(result.exitCode).toBe(0)
    expect(out).toContain('Usage: md <file.md> --video')
  })
})
