/**
 * 节点执行引擎（服务端）
 * 负责调用 z-ai-web-dev-sdk 完成图像 / 视频 / LLM 生成，并落盘产物
 */
import fs from 'fs/promises'
import path from 'path'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

const GEN_DIR = path.join(process.cwd(), 'public', 'generated')
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export async function ensureDirs() {
  await fs.mkdir(GEN_DIR, { recursive: true })
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}

async function saveBase64Image(base64: string): Promise<string> {
  await ensureDirs()
  const raw = base64.includes(',') ? base64.split(',')[1] : base64
  const file = `img_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.png`
  await fs.writeFile(path.join(GEN_DIR, file), Buffer.from(raw, 'base64'))
  return `/generated/${file}`
}

async function downloadTo(url: string, ext: string): Promise<string> {
  await ensureDirs()
  const file = `${ext}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext === 'video' ? 'mp4' : 'png'}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`资源下载失败: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const dir = ext === 'video' ? GEN_DIR : GEN_DIR
  await fs.writeFile(path.join(dir, file), buf)
  return `/generated/${file}`
}

/** 将输入图像（本地路径 / dataURL / 远程 URL）统一转为纯 base64 */
async function imageToBase64(url?: string): Promise<string> {
  if (!url) throw new Error('缺少图像输入')
  if (url.startsWith('data:')) return url.split(',')[1]
  if (url.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', url)
    const buf = await fs.readFile(filePath)
    return buf.toString('base64')
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`图像获取失败: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

export interface ExecIO {
  inputs: Record<string, { kind: string; url?: string; text?: string }>
  params: Record<string, unknown>
}

type ProgressFn = (stage: string, progress: number) => void

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function str(params: Record<string, unknown>, key: string): string {
  const v = params[key]
  return typeof v === 'string' ? v.trim() : ''
}

function bool(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true || params[key] === 'true'
}

/* ------------------------------ LLM 提示词优化 ------------------------------ */

const STYLE_HINT: Record<string, string> = {
  auto: '忠实扩写用户的想法，适度补充视觉细节',
  cinematic: '电影质感：运镜、光线、景深、胶片色调',
  photoreal: '写实摄影：真实光影、镜头参数、自然细节',
  anime: '日式动漫：鲜明的赛璐璐质感与色彩',
  '3d': '3D 渲染：CGI 质感、物理光照、材质细节',
  ink: '水墨国风：留白意境、水墨晕染、东方美学',
  cyberpunk: '赛博朋克：霓虹光效、未来都市、高对比',
}

function buildEnhancePrompt(text: string, style: string, target: string) {
  const styleHint = STYLE_HINT[style] ?? STYLE_HINT.auto
  const targetHint =
    target === 'image'
      ? '静态图像生成模型'
      : '视频生成模型（请描述主体、动作、运镜与氛围）'
  return [
    `你是一名顶级的 AI 视频/图像提示词工程师。`,
    `请将下面这段简短创意扩写为一段适合${targetHint}的高质量中文提示词。`,
    `风格要求：${styleHint}。`,
    `要求：1) 保留用户原意 2) 补充主体细节、场景、光线、构图、风格关键词 3) 输出 60~150 字的纯提示词文本，不要任何解释、引号或前缀。`,
    ``,
    `用户创意：${text}`,
  ].join('\n')
}

async function runEnhancer(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; text?: string; url?: string }>> {
  const text =
    io.inputs.text?.text ??
    (typeof io.params.fallbackText === 'string' ? io.params.fallbackText : '')
  if (!text?.trim()) throw new Error('请先在左侧连接一个提示词节点或输入文本')
  const style = str(io.params, 'style') || 'auto'
  const target = str(io.params, 'target') || 'video'
  onProgress('正在分析创意…', 20)
  const zai = await ZAI.create()
  const res = (await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          '你是专业的 AI 视频提示词工程师，只输出扩写后的提示词本身，不要任何多余内容。',
      },
      { role: 'user', content: buildEnhancePrompt(text, style, target) },
    ],
  })) as {
    choices?: { message?: { content?: string } }[]
    content?: string
  }
  onProgress('正在整理提示词…', 80)
  const out =
    res?.choices?.[0]?.message?.content ?? res?.content ?? String(res ?? '')
  const cleaned = String(out)
    .replace(/^["'「『]|["'」』]$/g, '')
    .trim()
  if (!cleaned) throw new Error('LLM 未返回有效内容')
  return { text: { kind: 'text', text: cleaned } }
}

/* --------------------------------- 图像生成 --------------------------------- */

async function runImageGen(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  if (!prompt) throw new Error('缺少提示词：请连接提示词节点或在节点内填写')
  const size = str(io.params, 'size') || '1024x576'
  onProgress('正在构思画面…', 15)
  const zai = await ZAI.create()
  const res = await zai.images.generations.create({
    prompt,
    size: size as '1024x1024',
  })
  const b64 = res?.data?.[0]?.base64
  if (!b64) throw new Error('图像生成结果为空')
  onProgress('正在保存图像…', 85)
  const url = await saveBase64Image(b64)
  return {
    image: { kind: 'image', url, meta: { model: 'cogview', size } },
  }
}

async function runImageEdit(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  if (!prompt) throw new Error('缺少提示词：请描述想要的改动')
  if (!io.inputs.image?.url) throw new Error('缺少图像输入：请连接上游图像')
  const size = str(io.params, 'size')
  onProgress('正在读取原图…', 15)
  const base64 = await imageToBase64(io.inputs.image.url)
  onProgress('AI 重绘中…', 35)
  const zai = await ZAI.create()
  const res = await zai.images.generations.edit({
    prompt,
    image: base64,
    ...(size && size !== 'auto' ? { size: size as '1024x1024' } : {}),
  })
  const b64 = res?.data?.[0]?.base64
  if (!b64) throw new Error('图像重绘结果为空')
  onProgress('正在保存图像…', 85)
  const url = await saveBase64Image(b64)
  return {
    image: { kind: 'image', url, meta: { model: 'image-edit' } },
  }
}

/* --------------------------------- 视频生成 --------------------------------- */

async function pollVideoTask(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  taskId: string,
  onProgress: ProgressFn,
  timeoutMs = 10 * 60 * 1000,
): Promise<string> {
  const start = Date.now()
  let lastStage = ''
  while (Date.now() - start < timeoutMs) {
    await sleep(4000)
    const elapsed = (Date.now() - start) / 1000
    // 进度按时间估算：约 3 分钟到 90%
    const est = Math.min(92, Math.round(8 + (elapsed / 180) * 84))
    const stage = `AI 视频生成中… 已等待 ${Math.round(elapsed)}s`
    if (stage !== lastStage) {
      lastStage = stage
      onProgress(stage, est)
    }
    let r
    try {
      r = await zai.async.result.query(taskId)
    } catch {
      continue // 网络抖动重试
    }
    if (r?.task_status === 'SUCCESS') {
      const url =
        r.video_result?.[0]?.url || r.video_url || r.url || r.video || ''
      if (!url) throw new Error('视频任务成功但未返回地址')
      return url
    }
    if (r?.task_status === 'FAIL') {
      throw new Error('视频生成失败，请调整提示词后重试')
    }
  }
  throw new Error('视频生成超时（10 分钟），请稍后重试或使用极速模式')
}

async function runTextToVideo(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  if (!prompt) throw new Error('缺少提示词：请连接提示词节点或在节点内填写')
  const quality = str(io.params, 'quality') || 'quality'
  const withAudio = bool(io.params, 'withAudio')
  onProgress('正在提交视频任务…', 8)
  const zai = await ZAI.create()
  const task = await zai.video.generations.create({
    prompt,
    quality: quality as 'speed' | 'quality',
    with_audio: withAudio,
  })
  const remoteUrl = await pollVideoTask(zai, task.id, onProgress)
  onProgress('正在下载视频…', 95)
  const url = await downloadTo(remoteUrl, 'video')
  return {
    video: { kind: 'video', url, meta: { quality, withAudio: withAudio ? 1 : 0 } },
  }
}

async function runImageToVideo(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  if (!io.inputs.image?.url) throw new Error('缺少图像输入：请连接上游图像')
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  const quality = str(io.params, 'quality') || 'quality'
  const withAudio = bool(io.params, 'withAudio')
  onProgress('正在读取图像…', 6)
  const b64 = await imageToBase64(io.inputs.image.url)
  onProgress('正在提交视频任务…', 10)
  const zai = await ZAI.create()
  const task = await zai.video.generations.create({
    prompt: prompt || undefined,
    image_url: `data:image/png;base64,${b64}`,
    quality: quality as 'speed' | 'quality',
    with_audio: withAudio,
  })
  const remoteUrl = await pollVideoTask(zai, task.id, onProgress)
  onProgress('正在下载视频…', 95)
  const url = await downloadTo(remoteUrl, 'video')
  return {
    video: { kind: 'video', url, meta: { quality, withAudio: withAudio ? 1 : 0 } },
  }
}

/* --------------------------------- 统一入口 --------------------------------- */

export async function executeNode(
  nodeType: string,
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  switch (nodeType) {
    case 'enhancer':
      return runEnhancer(io, onProgress)
    case 'imageGen':
      return runImageGen(io, onProgress)
    case 'imageEdit':
      return runImageEdit(io, onProgress)
    case 'textToVideo':
      return runTextToVideo(io, onProgress)
    case 'imageToVideo':
      return runImageToVideo(io, onProgress)
    default:
      throw new Error(`节点类型 ${nodeType} 不可执行`)
  }
}
