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
  args.push(
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
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
  const zai = await ZAI.create()
  const res = await zai.audio.tts.create({
    input: text,
    ...(voice ? { voice } : {}),
    ...(speed ? { speed } : {}),
  })
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
