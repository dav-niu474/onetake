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
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
}

/** 上传媒体文件（JSON: { dataUrl }）→ 落盘并返回可访问 URL */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const dataUrl: string = body?.dataUrl
    if (typeof dataUrl !== 'string') {
      return NextResponse.json({ error: '参数无效' }, { status: 400 })
    }
    const m = dataUrl.match(/^data:([a-z]+\/[a-z0-9+-]+);base64,(.+)$/i)
    if (!m) {
      return NextResponse.json({ error: '仅支持图片 / 视频 / 音频上传' }, { status: 400 })
    }
    const mime = m[1].toLowerCase()
    const ext = EXT_MAP[mime]
    if (!ext) {
      return NextResponse.json(
        { error: `不支持的文件类型：${mime}` },
        { status: 400 },
      )
    }
    const raw = Buffer.from(m[2], 'base64')
    // 上传体积保护（约 80MB）
    if (raw.length > 80 * 1024 * 1024) {
      return NextResponse.json({ error: '文件过大（上限 80MB）' }, { status: 400 })
    }
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const prefix = mime.startsWith('image/') ? 'up' : mime.startsWith('video/') ? 'uv' : 'ua'
    const file = `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`
    await fs.writeFile(path.join(UPLOAD_DIR, file), raw)
    return NextResponse.json({ url: `/uploads/${file}` })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '上传失败' },
      { status: 500 },
    )
  }
}
