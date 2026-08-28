import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

/**
 * 导出素材 / 成片到 download 归档目录（服务端复制，保留原文件）
 * body: { url } — 仅允许 /generated 与 /uploads 下的纯文件名
 */
const ROOT = process.cwd()
const DOWNLOAD_DIR = path.join(ROOT, 'download')

/** 素材 URL 校验：允许任意非路径分隔符文件名（含中文），拒绝穿越 */
function parseAssetUrl(url: string) {
  const m = typeof url === 'string' ? url.match(/^\/(generated|uploads)\/([^/\\]+)$/) : null
  if (!m) return null
  if (m[2].includes('..') && m[2].split('.').every((p) => p === '..')) return null
  return m
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const url = body?.url ?? ''
    const m = parseAssetUrl(url)
    if (!m) {
      return NextResponse.json({ error: '非法的资源路径' }, { status: 400 })
    }
    const dir = path.join(ROOT, 'public', m[1])
    const src = path.join(dir, m[2])
    if (!src.startsWith(dir + path.sep)) {
      return NextResponse.json({ error: '非法的资源路径' }, { status: 400 })
    }
    await fs.access(src).catch(() => {
      throw new Error('源文件不存在')
    })
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true })
    let dest = path.join(DOWNLOAD_DIR, m[2])
    if (!dest.startsWith(DOWNLOAD_DIR + path.sep)) {
      return NextResponse.json({ error: '非法的目标路径' }, { status: 400 })
    }
    // 同名冲突：追加时间戳后缀
    const exists = await fs
      .access(dest)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      const dot = m[2].lastIndexOf('.')
      const base = dot > 0 ? m[2].slice(0, dot) : m[2]
      const ext = dot > 0 ? m[2].slice(dot) : ''
      dest = path.join(
        DOWNLOAD_DIR,
        `${base}_${Date.now().toString(36)}${ext}`,
      )
    }
    await fs.copyFile(src, dest)
    return NextResponse.json({
      ok: true,
      name: path.basename(dest),
      path: dest,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '导出失败' },
      { status: 500 },
    )
  }
}
