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

/** 删除素材（仅允许 /generated 与 /uploads 下的纯文件名） */
export async function DELETE(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url') ?? ''
    const m = url.match(/^\/(generated|uploads)\/([A-Za-z0-9._-]+)$/)
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
