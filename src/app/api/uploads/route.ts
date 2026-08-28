import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** 上传图片（JSON: { dataUrl }）→ 落盘并返回可访问 URL */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const dataUrl: string = body?.dataUrl
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: '仅支持图片上传' }, { status: 400 })
    }
    const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
    if (!m) return NextResponse.json({ error: '图片格式无效' }, { status: 400 })
    const mime = m[1].toLowerCase()
    const ext = EXT_MAP[mime]
    if (!ext) return NextResponse.json({ error: '不支持的图片类型' }, { status: 400 })
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const file = `up_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`
    await fs.writeFile(path.join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64'))
    return NextResponse.json({ url: `/uploads/${file}` })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '上传失败' },
      { status: 500 },
    )
  }
}
