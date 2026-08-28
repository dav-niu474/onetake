/**
 * 节点执行引擎（服务端）
 * 负责调用 z-ai-web-dev-sdk 完成图像 / 视频 / LLM 生成，并落盘产物
 */
import fs from 'fs/promises'
import path from 'path'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getProviderConfig, type ProviderConfig } from '@/lib/ai-canvas/provider-config'

const execFileAsync = promisify(execFile)

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

/**
 * 瞬时错误（限流 / 服务端抖动）自动重试：
 * 并行执行时多个节点同时发起请求，容易触发上游 429，此处带退避地重试。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number
    baseDelay?: number
    label?: string
    onRetry?: (stage: string, progress: number) => void
  } = {},
): Promise<T> {
  const retries = opts.retries ?? 2
  const baseDelay = opts.baseDelay ?? 2500
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const transient =
        /429|rate.?limit|too many requests|5\d{2}|bad gateway|service unavailable/i.test(msg)
      if (!transient || attempt === retries) throw err
      const delay = baseDelay * (attempt + 1)
      opts.onRetry?.(
        `${opts.label ?? '请求'}受限，${Math.round(delay / 1000)}s 后自动重试（${attempt + 1}/${retries}）…`,
        20,
      )
      await sleep(delay)
    }
  }
  throw lastErr as Error
}

/* ---------------------- 自定义模型供应商（OpenAI 兼容协议） ---------------------- */

const CUSTOM_TIMEOUT_MS = 60_000

/** 带超时的自定义供应商请求：AbortController 到点中止，网络类错误翻译为可读中文 */
async function customFetch(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs = CUSTOM_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${label}请求超时（${Math.round(timeoutMs / 1000)}s），请检查服务可达性`)
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|certificate|SSL/i.test(msg)) {
      throw new Error(`${label}无法连接：请检查 Base URL 是否正确、服务是否可达`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 校验自定义供应商响应，失败时抛出带上游简短信息的中文错误（不回显密钥） */
async function assertCustomOk(res: Response, label: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    const text = await res.text()
    if (text) {
      let msg = text
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
        if (typeof j.error === 'string') msg = j.error
        else if (j.error?.message) msg = j.error.message
        else if (j.message) msg = j.message
      } catch {
        /* 非 JSON 响应，用原文 */
      }
      detail = msg.replace(/\s+/g, ' ').slice(0, 160)
    }
  } catch {
    /* 忽略读取失败 */
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label}鉴权失败：API Key 无效或无权限（HTTP ${res.status}）`)
  }
  throw new Error(`${label}失败：HTTP ${res.status}${detail ? `（${detail}）` : ''}`)
}

/** 音频 content-type → 文件扩展名（默认 wav） */
function audioExtFromContentType(ct: string | null): string {
  const s = (ct ?? '').toLowerCase()
  if (s.includes('mpeg') || s.includes('mp3')) return 'mp3'
  if (s.includes('ogg')) return 'ogg'
  if (s.includes('opus')) return 'opus'
  if (s.includes('aac')) return 'aac'
  if (s.includes('flac')) return 'flac'
  return 'wav'
}

/** 自定义 LLM：POST {baseUrl}/chat/completions，解析 choices[0].message.content */
async function callCustomLLM(
  cfg: ProviderConfig,
  text: string,
  style: string,
  target: string,
  onProgress: ProgressFn,
): Promise<string> {
  if (!cfg.model) {
    throw new Error('自定义模型未配置模型名，请在「模型服务配置」中填写')
  }
  const res = await withRetry(
    () =>
      customFetch(
        `${cfg.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              {
                role: 'system',
                content:
                  '你是专业的 AI 视频提示词工程师，只输出扩写后的提示词本身，不要任何多余内容。',
              },
              { role: 'user', content: buildEnhancePrompt(text, style, target) },
            ],
          }),
        },
        '自定义模型',
      ),
    { label: '自定义模型', onRetry: onProgress },
  )
  await assertCustomOk(res, '自定义模型')
  const j = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null
  const content = j?.choices?.[0]?.message?.content
  if (!content || !String(content).trim()) {
    throw new Error('自定义模型未返回有效内容（响应缺少 choices[0].message.content）')
  }
  return String(content)
}

/** 自定义文生图：POST {baseUrl}/images/generations，兼容 b64_json 与 url 两种响应 */
async function callCustomImageGen(
  cfg: ProviderConfig,
  prompt: string,
  size: string,
  onProgress: ProgressFn,
): Promise<string> {
  if (!cfg.model) {
    throw new Error('自定义图像供应商未配置模型名，请在「模型服务配置」中填写')
  }
  const res = await withRetry(
    () =>
      customFetch(
        `${cfg.baseUrl}/images/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({ model: cfg.model, prompt, n: 1, size }),
        },
        '自定义图像生成',
      ),
    { label: '自定义图像生成', onRetry: onProgress },
  )
  await assertCustomOk(res, '自定义图像生成')
  const j = (await res.json().catch(() => null)) as {
    data?: { b64_json?: string; url?: string }[]
  } | null
  const item = j?.data?.[0]
  if (item?.b64_json) return saveBase64Image(item.b64_json)
  if (item?.url) {
    // url 响应：下载转存本地 /public/generated
    return downloadTo(item.url, 'img')
  }
  throw new Error('自定义图像生成响应格式不兼容（缺少 data[0].b64_json / url）')
}

/** 自定义 TTS：POST {baseUrl}/audio/speech，响应为二进制音频，按 content-type 判断扩展名落盘 */
async function callCustomTTS(
  cfg: ProviderConfig,
  text: string,
  voiceParam?: string,
  speed?: number,
  onProgress?: ProgressFn,
): Promise<{ url: string; voice: string; ext: string }> {
  if (!cfg.model) {
    throw new Error('自定义语音供应商未配置模型名，请在「模型服务配置」中填写')
  }
  // 音色优先级：模型服务配置的 voice > 节点参数 voice > 供应商默认 alloy
  const voice = cfg.voice || voiceParam || 'alloy'
  const res = await withRetry(
    () =>
      customFetch(
        `${cfg.baseUrl}/audio/speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            voice,
            input: text,
            ...(speed ? { speed } : {}),
            response_format: 'wav',
          }),
        },
        '自定义语音合成',
      ),
    { label: '自定义语音合成', onRetry: onProgress },
  )
  await assertCustomOk(res, '自定义语音合成')
  const raw = Buffer.from(await res.arrayBuffer())
  if (raw.length === 0) throw new Error('自定义语音合成结果为空')
  let ext = audioExtFromContentType(res.headers.get('content-type'))
  let buf = raw
  // PCM 裸流（audio/pcm 或未声明类型且非 RIFF 头）：包装为可播放的 WAV
  const isWav = raw.length > 44 && raw.slice(0, 4).toString() === 'RIFF'
  if (!isWav && (ext === 'wav' || ext === 'pcm')) {
    buf = pcmToWav(raw)
    ext = 'wav'
  }
  const url = await saveBuffer(buf, ext)
  return { url, voice, ext }
}

/** 将 16bit PCM 裸流包装为可播放的 WAV 文件 */
function pcmToWav(
  pcm: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function num(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v)
  }
  return undefined
}

async function saveBuffer(buf: Buffer, ext: string): Promise<string> {
  await ensureDirs()
  const file = `aud_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`
  await fs.writeFile(path.join(GEN_DIR, file), buf)
  return `/generated/${file}`
}

function str(params: Record<string, unknown>, key: string): string {
  const v = params[key]
  return typeof v === 'string' ? v.trim() : ''
}

function bool(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true || params[key] === 'true'
}

/* ------------------------------ 媒体工具（ffmpeg） ------------------------------ */

/** 将媒体 URL（本地路径 / 远程地址）解析为服务端本地文件路径 */
async function resolveMediaPath(
  url: string,
  kind: 'video' | 'audio',
): Promise<string> {
  if (url.startsWith('/')) {
    return path.join(process.cwd(), 'public', url)
  }
  await ensureDirs()
  const file = `dl_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${kind === 'video' ? 'mp4' : 'wav'}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`媒体下载失败: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(path.join(GEN_DIR, file), buf)
  return path.join(GEN_DIR, file)
}

interface MediaInfo {
  hasAudio: boolean
  duration: number
  width?: number
  height?: number
}

/** 使用 ffprobe 读取媒体信息（失败时给出宽松默认值） */
async function probeMedia(file: string): Promise<MediaInfo> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      file,
    ])
    const j = JSON.parse(stdout) as {
      streams?: { codec_type?: string; width?: number; height?: number }[]
      format?: { duration?: string }
    }
    const videoStream = j.streams?.find((s) => s.codec_type === 'video')
    return {
      hasAudio: (j.streams ?? []).some((s) => s.codec_type === 'audio'),
      duration: Number(j.format?.duration ?? 0) || 0,
      width: videoStream?.width,
      height: videoStream?.height,
    }
  } catch {
    return { hasAudio: true, duration: 0 }
  }
}

const fmtSec = (s: number) => `${Math.round(s * 10) / 10}s`

/** 运行 ffmpeg，解析 stderr time= 汇报进度 */
function runFfmpeg(
  args: string[],
  total: number,
  onProgress: ProgressFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-y', ...args])
    let lastEmit = 0
    let errTail = ''
    p.stderr.on('data', (d) => {
      const s = String(d)
      errTail = (errTail + s).slice(-4000)
      const m = s.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (m && total > 0) {
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        const now = Date.now()
        if (now - lastEmit > 800) {
          lastEmit = now
          onProgress(
            `正在合成… ${fmtSec(sec)} / ${fmtSec(total)}`,
            Math.min(96, Math.round(10 + (sec / total) * 85)),
          )
        }
      }
    })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) return resolve()
      const tail = errTail
        .split('\n')
        .filter((l) => l.trim())
        .slice(-2)
        .join(' ')
      reject(new Error(`ffmpeg 合成失败（code ${code}）：${tail}`))
    })
  })
}

/* ------------------------------ 成片合成（音视频混流） ------------------------------ */

async function runAvMerge(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const videoUrl = io.inputs.video?.url
  const audioUrl = io.inputs.audio?.url
  if (!videoUrl) throw new Error('缺少视频输入：请连接上游视频节点')
  if (!audioUrl) throw new Error('缺少音频输入：请连接配音 / 音频节点')
  const keepOriginal = bool(io.params, 'keepOriginal')
  const vVol = num(io.params, 'videoVolume') ?? 1
  const aVol = num(io.params, 'audioVolume') ?? 1
  const durationMode = str(io.params, 'durationMode') || 'video'

  onProgress('正在读取媒体…', 6)
  const videoPath = await resolveMediaPath(videoUrl, 'video')
  const audioPath = await resolveMediaPath(audioUrl, 'audio')

  onProgress('正在分析音视频…', 14)
  const vInfo = await probeMedia(videoPath)
  const aInfo = await probeMedia(audioPath)
  const target =
    durationMode === 'video'
      ? vInfo.duration || aInfo.duration
      : aInfo.duration || vInfo.duration

  // 是否需要延长视频画面（clone 最后一帧，需重编码）
  const needVideoPad =
    durationMode === 'audio' &&
    target > 0 &&
    vInfo.duration > 0 &&
    aInfo.duration > vInfo.duration + 0.05
  const videoReencode = needVideoPad

  const filterParts: string[] = []
  if (needVideoPad) {
    const pad = (target - vInfo.duration + 0.2).toFixed(2)
    filterParts.push(`[0:v]tpad=stop_mode=clone:stop_duration=${pad}[vout]`)
  }
  const mix = keepOriginal && vInfo.hasAudio
  if (mix) {
    const padExpr = target > 0 ? `apad=whole_dur=${target.toFixed(2)}` : 'apad'
    filterParts.push(`[0:a]volume=${vVol},${padExpr}[a0]`)
    filterParts.push(`[1:a]volume=${aVol},${padExpr}[a1]`)
    filterParts.push(
      `[a0][a1]amix=inputs=2:duration=longest:normalize=0[aout]`,
    )
  }

  const args: string[] = ['-i', videoPath, '-i', audioPath]
  if (filterParts.length > 0) args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', needVideoPad ? '[vout]' : '0:v')
  if (mix) {
    args.push('-map', '[aout]')
  } else {
    args.push('-map', '1:a')
    const padExpr = target > 0 ? `apad=whole_dur=${target.toFixed(2)}` : 'apad'
    args.push('-af', `volume=${aVol},${padExpr}`)
  }
  if (videoReencode) {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p')
  } else {
    args.push('-c:v', 'copy')
  }
  args.push(
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
  )

  const outName = `merge_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.mp4`
  const outPath = path.join(GEN_DIR, outName)
  args.push(outPath)

  onProgress('开始合成…', 10)
  await runFfmpeg(args, target, onProgress)

  onProgress('正在保存成片…', 96)
  const url = `/generated/${outName}`
  const poster = await makePoster(url)
  const outInfo = await probeMedia(outPath)
  const meta: Record<string, string | number> = {
    duration: fmtSec(outInfo.duration || target),
    mixed: mix ? 1 : 0,
  }
  if (outInfo.width && outInfo.height) {
    meta.resolution = `${outInfo.width}x${outInfo.height}`
  }
  if (poster) meta.poster = poster
  return {
    video: { kind: 'video', url, meta },
  }
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

  let out: string | undefined
  // 自定义 LLM 供应商（OpenAI 兼容）：配置且启用时优先使用，失败回落内置 SDK
  const custom = await getProviderConfig('llm')
  if (custom) {
    try {
      onProgress(
        custom.model ? `使用自定义模型 ${custom.model}…` : '使用自定义模型…',
        20,
      )
      out = await callCustomLLM(custom, text, style, target, onProgress)
    } catch (err) {
      // 回落内置：日志只记错误消息，绝不含 apiKey / 完整配置
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[runner] 自定义 LLM 调用失败，回落内置模型:', msg)
      onProgress('自定义模型调用失败，已回落内置模型…', 20)
    }
  }

  if (out === undefined) {
    const zai = await ZAI.create()
    const res = (await withRetry(
      () =>
        zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content:
                '你是专业的 AI 视频提示词工程师，只输出扩写后的提示词本身，不要任何多余内容。',
            },
            { role: 'user', content: buildEnhancePrompt(text, style, target) },
          ],
        }),
      { label: '提示词优化', onRetry: onProgress },
    )) as {
      choices?: { message?: { content?: string } }[]
      content?: string
    }
    out = res?.choices?.[0]?.message?.content ?? res?.content ?? String(res ?? '')
  }

  onProgress('正在整理提示词…', 80)
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

  // 自定义图像供应商（OpenAI 兼容 /images/generations）：配置且启用时使用，错误直接抛给节点显示
  const custom = await getProviderConfig('image')
  if (custom) {
    onProgress(custom.model ? `使用自定义图像模型 ${custom.model}…` : '使用自定义图像模型…', 25)
    const url = await callCustomImageGen(custom, prompt, size, onProgress)
    onProgress('正在保存图像…', 85)
    return {
      image: { kind: 'image', url, meta: { model: custom.model, size, provider: 'custom' } },
    }
  }

  const zai = await ZAI.create()
  const res = await withRetry(
    () => zai.images.generations.create({ prompt, size: size as '1024x1024' }),
    { label: '图像生成', onRetry: onProgress },
  )
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
  // 图生图保持内置：各家图像编辑协议差异大（mask / 图层 / 参考图传法不一），
  // OpenAI 兼容协议对「图像编辑」并不通用，故暂不开放自定义供应商接入
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  if (!prompt) throw new Error('缺少提示词：请描述想要的改动')
  if (!io.inputs.image?.url) throw new Error('缺少图像输入：请连接上游图像')
  const size = str(io.params, 'size')
  onProgress('正在读取原图…', 15)
  const base64 = await imageToBase64(io.inputs.image.url)
  onProgress('AI 重绘中…', 35)
  const zai = await ZAI.create()
  const res = await withRetry(
    () =>
      zai.images.generations.edit({
        prompt,
        image: base64,
        ...(size && size !== 'auto' ? { size: size as '1024x1024' } : {}),
      }),
    { label: '图像重绘', onRetry: onProgress },
  )
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
  throw new Error(
    '视频生成超时（10 分钟）：云端任务可能仍在进行，可通过「找回任务」恢复成果',
  )
}

async function runTextToVideo(
  io: ExecIO,
  onProgress: ProgressFn,
  onRemoteTask?: (taskId: string) => void,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  // 供应商扩展点：视频能力暂未开放自定义供应商接入（各平台异步任务协议差异大，
  // 无通用标准），当前固定使用内置智谱视频生成；后续可在 getProviderConfig('video')
  // 基础上扩展自定义 baseUrl / model 路由
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  if (!prompt) throw new Error('缺少提示词：请连接提示词节点或在节点内填写')
  const quality = str(io.params, 'quality') || 'quality'
  const withAudio = bool(io.params, 'withAudio')
  onProgress('正在提交视频任务…', 8)
  const zai = await ZAI.create()
  let task
  try {
    task = await withRetry(
      () =>
        zai.video.generations.create({
          prompt,
          quality: quality as 'speed' | 'quality',
          with_audio: withAudio,
        }),
      // 视频提交限流严格：同账号同时仅 1 个活跃任务 + 分钟级时间窗配额。
      // 快速失败策略：3 次 / 8s 线性退避（总窗口 ≈ 24s），避免整图运行被长退避阻塞
      { retries: 3, baseDelay: 8000, label: '视频任务提交', onRetry: onProgress },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/429|too many/i.test(msg)) {
      throw new Error(
        '视频生成配额受限（同账号同时仅 1 个活跃任务 + 分钟级提交配额）。请稍候 1-2 分钟后重试；若此前有任务曾显示「生成中」，可点「找回任务」恢复其成果',
      )
    }
    throw err
  }
  onRemoteTask?.(task.id)
  const remoteUrl = await pollVideoTask(zai, task.id, onProgress)
  onProgress('正在下载视频…', 93)
  const url = await downloadTo(remoteUrl, 'video')
  const poster = await makePoster(url)
  const meta: Record<string, string | number> = { quality, withAudio: withAudio ? 1 : 0 }
  if (poster) meta.poster = poster
  return {
    video: { kind: 'video', url, meta },
  }
}

async function runImageToVideo(
  io: ExecIO,
  onProgress: ProgressFn,
  onRemoteTask?: (taskId: string) => void,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  // 供应商扩展点：同 runTextToVideo，图生视频暂固定使用内置智谱能力
  if (!io.inputs.image?.url) throw new Error('缺少图像输入：请连接上游图像')
  const prompt = str(io.params, 'prompt') || io.inputs.text?.text || ''
  const quality = str(io.params, 'quality') || 'quality'
  const withAudio = bool(io.params, 'withAudio')
  onProgress('正在读取图像…', 6)
  const b64 = await imageToBase64(io.inputs.image.url)
  onProgress('正在提交视频任务…', 10)
  const zai = await ZAI.create()
  let task
  try {
    task = await withRetry(
      () =>
        zai.video.generations.create({
          prompt: prompt || undefined,
          image_url: `data:image/png;base64,${b64}`,
          quality: quality as 'speed' | 'quality',
          with_audio: withAudio,
        }),
      // 同 runTextToVideo：快速失败（3 次 / 8s 线性退避 ≈ 24s 窗口），避免阻塞整图运行
      { retries: 3, baseDelay: 8000, label: '视频任务提交', onRetry: onProgress },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/429|too many/i.test(msg)) {
      throw new Error(
        '视频生成配额受限（同账号同时仅 1 个活跃任务 + 分钟级提交配额）。请稍候 1-2 分钟后重试；若此前有任务曾显示「生成中」，可点「找回任务」恢复其成果',
      )
    }
    throw err
  }
  onRemoteTask?.(task.id)
  const remoteUrl = await pollVideoTask(zai, task.id, onProgress)
  onProgress('正在下载视频…', 93)
  const url = await downloadTo(remoteUrl, 'video')
  const poster = await makePoster(url)
  const meta: Record<string, string | number> = { quality, withAudio: withAudio ? 1 : 0 }
  if (poster) meta.poster = poster
  return {
    video: { kind: 'video', url, meta },
  }
}

/* ------------------------------ 视频拼接（多段顺序拼接 + 转场） ------------------------------ */

const XFADE_TRANSITIONS = new Set(['fade', 'wipeleft', 'slideup', 'circleopen'])

async function runConcat(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const order = ['v1', 'v2', 'v3', 'v4']
  const urls = order
    .map((k) => io.inputs[k]?.url)
    .filter((u): u is string => !!u)
  if (urls.length < 2) {
    throw new Error('至少需要连接两段视频（段 1 与 段 2）')
  }
  const transition = str(io.params, 'transition') || 'none'
  const useFade = XFADE_TRANSITIONS.has(transition)
  const fitMode = str(io.params, 'fitMode') || 'pad'

  onProgress('正在读取视频片段…', 5)
  const paths: string[] = []
  const infos: MediaInfo[] = []
  for (let i = 0; i < urls.length; i++) {
    const p = await resolveMediaPath(urls[i], 'video')
    const info = await probeMedia(p)
    if (!info.duration || info.duration <= 0) {
      throw new Error(`第 ${i + 1} 段视频时长读取失败，无法拼接`)
    }
    paths.push(p)
    infos.push(info)
    onProgress(
      `正在读取视频片段… ${i + 1}/${urls.length}`,
      5 + Math.round(((i + 1) / urls.length) * 12),
    )
  }

  // 目标画幅：以首段为准（宽高取偶）
  const evenize = (n: number | undefined, fb: number) => {
    const v = n && n > 0 ? Math.round(n) : fb
    return v % 2 === 0 ? v : v - 1
  }
  const W = evenize(infos[0].width, 1024)
  const H = evenize(infos[0].height, 576)
  const FPS = 30

  // 转场时长不能超过最短片段
  const minDur = Math.min(...infos.map((i) => i.duration))
  const fadeDur = Math.min(
    Math.max(0.2, num(io.params, 'transitionDuration') ?? 0.5),
    Math.max(0.2, minDur - 0.3),
  )

  // 输入注册（无音轨的片段补静音轨）
  const args: string[] = []
  let inputIdx = 0
  const segs = paths.map((p, i) => {
    const videoIdx = inputIdx++
    args.push('-i', p)
    let audioIdx: number | null = null
    if (!infos[i].hasAudio) {
      args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo')
      audioIdx = inputIdx++
    }
    return { videoIdx, audioIdx, dur: infos[i].duration }
  })

  // 逐段归一化（同分辨率 / 帧率 / 像素格式，音轨重采样并裁齐片段时长）
  const filter: string[] = []
  segs.forEach((s, i) => {
    const dur = s.dur.toFixed(2)
    // 注意：setpts 必须在 fps 之前，否则帧率元数据变为 1/0，xfade 会拒绝 CFR 校验
    const vChain =
      fitMode === 'crop'
        ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p`
        : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p`
    filter.push(`[${s.videoIdx}:v]${vChain}[v${i}]`)
    if (s.audioIdx !== null) {
      filter.push(`[${s.audioIdx}:a]atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`)
    } else {
      filter.push(
        `[${s.videoIdx}:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`,
      )
    }
  })

  const total: number =
    useFade
      ? segs.reduce((a, s) => a + s.dur, 0) - fadeDur * (segs.length - 1)
      : segs.reduce((a, s) => a + s.dur, 0)

  let vOut = 'v0'
  let aOut = 'a0'
  if (!useFade) {
    const concatInputs = segs.map((_, i) => `[v${i}][a${i}]`).join('')
    filter.push(`${concatInputs}concat=n=${segs.length}:v=1:a=1[vout][aout]`)
    vOut = 'vout'
    aOut = 'aout'
  } else {
    // xfade / acrossfade 转场链
    let acc = segs[0].dur
    for (let i = 1; i < segs.length; i++) {
      const offset = Math.max(0, acc - fadeDur)
      filter.push(
        `[${vOut}][v${i}]xfade=transition=${transition}:duration=${fadeDur.toFixed(2)}:offset=${offset.toFixed(2)}[vx${i}]`,
      )
      filter.push(`[${aOut}][a${i}]acrossfade=d=${fadeDur.toFixed(2)}[ax${i}]`)
      vOut = `vx${i}`
      aOut = `ax${i}`
      acc = acc + segs[i].dur - fadeDur
    }
  }

  args.push('-filter_complex', filter.join(';'))
  args.push('-map', `[${vOut}]`, '-map', `[${aOut}]`)
  // 快速预览档：superfast + 高 CRF，速度优先（约 2 倍速）；正式出片用 veryfast + crf20
  const fast = bool(io.params, 'fastPreview')
  args.push(
    '-c:v', 'libx264',
    '-preset', fast ? 'superfast' : 'veryfast',
    '-crf', fast ? '28' : '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
  )

  const outName = `concat_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}.mp4`
  const outPath = path.join(GEN_DIR, outName)
  args.push(outPath)

  onProgress(useFade ? '正在拼接（含转场渲染）…' : '正在拼接片段…', 18)
  await runFfmpeg(args, total, onProgress)

  onProgress('正在保存成片…', 96)
  const url = `/generated/${outName}`
  const poster = await makePoster(url)
  const outInfo = await probeMedia(outPath)
  const meta: Record<string, string | number> = {
    duration: fmtSec(outInfo.duration || total),
    segments: segs.length,
    transition: useFade ? transition : 'cut',
    quality: fast ? 'preview' : 'final',
  }
  if (outInfo.width && outInfo.height) {
    meta.resolution = `${outInfo.width}x${outInfo.height}`
  }
  if (poster) meta.poster = poster
  return { video: { kind: 'video', url, meta } }
}

/** 为视频生成首帧海报（poster），失败时静默返回 undefined */
async function makePoster(videoUrl: string): Promise<string | undefined> {
  try {
    await ensureDirs()
    const src = videoUrl.startsWith('/')
      ? path.join(process.cwd(), 'public', videoUrl)
      : videoUrl
    const name = `poster_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`
    const out = path.join(GEN_DIR, name)
    const tryRun = (seek: string[]) =>
      new Promise<void>((resolve, reject) => {
        spawn(
          'ffmpeg',
          ['-hide_banner', '-y', ...seek, '-i', src, '-frames:v', '1', '-q:v', '4', out],
        )
          .on('error', reject)
          .on('close', (c) => (c === 0 ? resolve() : reject(new Error('poster failed'))))
      })
    try {
      await tryRun(['-ss', '0.1'])
    } catch {
      await tryRun([])
    }
    const st = await fs.stat(out).catch(() => null)
    if (!st || st.size === 0) return undefined
    return `/generated/${name}`
  } catch {
    return undefined
  }
}

/* --------------------------------- 语音合成 --------------------------------- */

async function runTTS(
  io: ExecIO,
  onProgress: ProgressFn,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  const text =
    str(io.params, 'fallbackText') || io.inputs.text?.text || ''
  if (!text) throw new Error('缺少文案：请连接提示词节点或在节点内填写')
  const voiceRaw = str(io.params, 'voice')
  const voice = voiceRaw && voiceRaw !== 'default-voice' ? voiceRaw : undefined
  const speed = num(io.params, 'speed')
  onProgress('正在合成语音…', 30)

  // 自定义语音供应商（OpenAI 兼容 /audio/speech）：配置且启用时使用，错误直接抛给节点显示
  const custom = await getProviderConfig('tts')
  if (custom) {
    onProgress(custom.model ? `使用自定义语音模型 ${custom.model}…` : '使用自定义语音模型…', 40)
    const r = await callCustomTTS(custom, text, voice, speed, onProgress)
    onProgress('正在封装音频…', 80)
    return {
      audio: {
        kind: 'audio',
        url: r.url,
        meta: {
          voice: r.voice,
          speed: speed ?? 1,
          format: r.ext,
          provider: 'custom',
        },
      },
    }
  }

  const zai = await ZAI.create()
  const res = await withRetry(
    () =>
      zai.audio.tts.create({
        input: text,
        ...(voice ? { voice } : {}),
        ...(speed ? { speed } : {}),
      }),
    { label: '语音合成', onRetry: onProgress },
  )
  onProgress('正在封装音频…', 80)
  const arrayBuffer = await res.arrayBuffer()
  const raw = Buffer.from(arrayBuffer)
  if (raw.length === 0) throw new Error('语音合成结果为空')
  // API 返回 PCM 裸流（24kHz 16bit mono），包装为 WAV
  const isWav = raw.length > 44 && raw.slice(0, 4).toString() === 'RIFF'
  const url = await saveBuffer(
    isWav ? raw : pcmToWav(raw),
    'wav',
  )
  return {
    audio: {
      kind: 'audio',
      url,
      meta: { voice: voice ?? 'default', speed: speed ?? 1 },
    },
  }
}

/* --------------------------------- 统一入口 --------------------------------- */

export async function executeNode(
  nodeType: string,
  io: ExecIO,
  onProgress: ProgressFn,
  onRemoteTask?: (taskId: string) => void,
): Promise<Record<string, { kind: string; url?: string; text?: string }>> {
  switch (nodeType) {
    case 'enhancer':
      return runEnhancer(io, onProgress)
    case 'imageGen':
      return runImageGen(io, onProgress)
    case 'imageEdit':
      return runImageEdit(io, onProgress)
    case 'textToVideo':
      return runTextToVideo(io, onProgress, onRemoteTask)
    case 'imageToVideo':
      return runImageToVideo(io, onProgress, onRemoteTask)
    case 'tts':
      return runTTS(io, onProgress)
    case 'avMerge':
      return runAvMerge(io, onProgress)
    case 'concat':
      return runConcat(io, onProgress)
    default:
      throw new Error(`节点类型 ${nodeType} 不可执行`)
  }
}

/* ------------------------------ 远程任务找回 ------------------------------ */

export interface ReclaimResult {
  status: 'success' | 'failed' | 'running'
  output?: Record<string, { kind: string; url?: string; text?: string }>
  error?: string
  /** 远端任务仍在进行时返回已等待秒数 */
  elapsed?: number
}

/**
 * 查询远端视频任务状态；可选等待其完成（等待模式下每 5s 轮询一次）。
 * - success：下载成片 + 首帧海报，返回可直接回填节点的 outputs
 * - failed：返回远端失败信息
 * - running：返回已等待时间（仅在非等待模式 / 等待超时后）
 */
export async function reclaimRemoteVideoTask(
  taskId: string,
  opts: { waitMs?: number; onProgress?: ProgressFn } = {},
): Promise<ReclaimResult> {
  const zai = await ZAI.create()
  const start = Date.now()
  const waitMs = opts.waitMs ?? 0
  for (;;) {
    let r
    try {
      r = await zai.async.result.query(taskId)
    } catch {
      if (Date.now() - start > Math.max(waitMs, 15000)) {
        return { status: 'running', elapsed: Math.round((Date.now() - start) / 1000) }
      }
      await sleep(4000)
      continue
    }
    if (r?.task_status === 'SUCCESS') {
      const url = r.video_result?.[0]?.url || r.video_url || r.url || r.video || ''
      if (!url) return { status: 'failed', error: '云端任务成功但未返回视频地址' }
      opts.onProgress?.('正在下载找回的视频…', 80)
      const localUrl = await downloadTo(url, 'video')
      const poster = await makePoster(localUrl)
      const meta: Record<string, string | number> = { reclaimed: 1 }
      if (poster) meta.poster = poster
      return {
        status: 'success',
        output: { video: { kind: 'video', url: localUrl, meta } },
      }
    }
    if (r?.task_status === 'FAIL') {
      return { status: 'failed', error: '云端任务生成失败，请调整提示词后重试' }
    }
    if (Date.now() - start >= waitMs) {
      return { status: 'running', elapsed: Math.round((Date.now() - start) / 1000) }
    }
    opts.onProgress?.(
      `正在找回云端任务… 已查询 ${Math.round((Date.now() - start) / 1000)}s`,
      30,
    )
    await sleep(5000)
  }
}
