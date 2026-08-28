import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

/**
 * 素材库 API：浏览 /generated 与 /uploads 下的全部媒体产物
 */

const ROOT = process.cwd()
const DIRS = [
  { dir: path.join(ROOT, 'public', 'generated'), prefix: '/generated' },
  { dir: path.join(ROOT, 'public', 'uploads'), prefix: '/uploads' },
]

const KIND_BY_EXT: Record<string, 'image' | 'video' | 'audio'> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  mp4: 'video',
  webm: 'video',
  wav: 'audio',
  mp3: 'audio',
  m4a: 'audio',
}

export async function GET() {
  try {
    const items: {
      url: string
      kind: 'image' | 'video' | 'audio'
      name: string
      size: number
      mtime: number
    }[] = []
    for (const { dir, prefix } of DIRS) {
      let entries: { isFile: () => boolean; name: string }[] = []
      try {
        entries = (await fs.readdir(dir, {
          withFileTypes: true,
        })) as unknown as { isFile: () => boolean; name: string }[]
      } catch {
        continue
      }
      for (const ent of entries) {
        if (!ent.isFile?.()) continue
        const ext = ent.name.split('.').pop()?.toLowerCase() ?? ''
        const kind = KIND_BY_EXT[ext]
        if (!kind) continue
        const st = await fs.stat(path.join(dir, ent.name)).catch(() => null)
        if (!st) continue
        items.push({
          url: `${prefix}/${ent.name}`,
          kind,
          name: ent.name,
          size: st.size,
          mtime: st.mtimeMs,
        })
      }
    }
    items.sort((a, b) => b.mtime - a.mtime)
    return NextResponse.json({ items: items.slice(0, 300) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '读取素材失败' },
      { status: 500 },
    )
  }
}

/** 素材 URL 校验：允许任意非路径分隔符文件名（含中文），拒绝穿越 */
function parseAssetUrl(url: string) {
  const m = typeof url === 'string' ? url.match(/^\/(generated|uploads)\/([^/\\]+)$/) : null
  if (!m) return null
  if (m[2].includes('..') && m[2].split('.').every((p) => p === '..')) return null // 纯穿越串
  return m
}

/** 删除素材（仅允许 /generated 与 /uploads 下的纯文件名） */
export async function DELETE(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url') ?? ''
    const m = parseAssetUrl(url)
    if (!m) {
      return NextResponse.json({ error: '非法的资源路径' }, { status: 400 })
    }
    const base = path.join(ROOT, 'public', m[1])
    const target = path.join(base, m[2])
    if (!target.startsWith(base + path.sep)) {
      return NextResponse.json({ error: '非法的资源路径' }, { status: 400 })
    }
    await fs.unlink(target).catch(() => undefined)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '删除失败' },
      { status: 500 },
    )
  }
}

/**
 * 重命名素材（仅允许 /generated 与 /uploads 下的纯文件名）
 * body: { url, name } — 自动保留原扩展名；同名冲突返回 409
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, name } = body ?? {}
    const m = parseAssetUrl(url)
    if (!m || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 })
    }
    const dir = path.join(ROOT, 'public', m[1])
    const oldName = m[2]
    const target = path.join(dir, oldName)
    if (!target.startsWith(dir + path.sep)) {
      return NextResponse.json({ error: '非法的资源路径' }, { status: 400 })
    }
    const ext = (oldName.split('.').pop() ?? '').toLowerCase()
    // 清洗新名称：去除路径分隔符与非法字符，去除前导点（防隐藏文件），保留原扩展名
    let base = name
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80)
      .replace(/^\.+/, '')
      .replace(/^_+|_+$/g, '')
    if (!base) {
      return NextResponse.json({ error: '名称无效' }, { status: 400 })
    }
    if (base.toLowerCase().endsWith(`.${ext}`)) {
      base = base.slice(0, -(ext.length + 1))
    }
    const newName = `${base}.${ext}`
    if (newName === oldName) {
      return NextResponse.json({ url: `/${m[1]}/${newName}`, name: newName })
    }
    const exists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false)
    if (!exists) {
      return NextResponse.json({ error: '源文件不存在' }, { status: 404 })
    }
    const dest = path.join(dir, newName)
    if (!dest.startsWith(dir + path.sep)) {
      return NextResponse.json({ error: '非法的目标路径' }, { status: 400 })
    }
    const destExists = await fs
      .access(dest)
      .then(() => true)
      .catch(() => false)
    if (destExists) {
      return NextResponse.json({ error: '同名文件已存在' }, { status: 409 })
    }
    await fs.rename(target, dest)
    return NextResponse.json({ url: `/${m[1]}/${newName}`, name: newName })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '重命名失败' },
      { status: 500 },
    )
  }
}
