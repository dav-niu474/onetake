/**
 * 模型能力启发式分类（前后端共享）
 *
 * 供应商 /models 接口通常返回该账户全部模型（文本 / 图像 / 语音 / 视频 / 向量混在一起），
 * 而能力路由要求「文本模型只能选进 LLM 路由、图像模型只能选进图像路由」。
 * 参考 Cherry Studio / new-api 的模型分类方式，用模型命名启发式归类：
 *
 * - embedding / rerank / asr（语音识别）→ 不属于 OneTake 四大能力，路由中不可选
 * - tts / image / video → 命中关键字即归入对应能力
 * - 其余 → chat（对话 / 文本生成兜底）
 */
import type { ProviderAbility } from './provider-presets'

export type ModelAbility = ProviderAbility | 'embedding' | 'rerank' | 'asr'

const RE_EMBEDDING = /embed|bge-|^e5-|voyage|gte-|jina-clip|text-vec|m3e|bce-embedding/i
const RE_RERANK = /rerank|ranker/i
const RE_ASR = /whisper|\basr\b|-stt\b|speech-to-text|transcri|paraformer|sensevoice/i
const RE_TTS = /tts|speech|cosyvoice|voice|audio-speech|sami-hi/i
const RE_IMAGE =
  /dall-e|gpt-image|image|flux|stable-?diffusion|sd3|sdxl|sd-?turbo|kolors|seedream|cogview|wanx|imagen|midjourney|niji|ideogram|recraft|photon|janus|omnigen|hunyuan-image|qwen-image|irag|hidream|pixart|playground-v/i
const RE_VIDEO = /video|sora|\bkling|seedance|hailuo|\bveo|t2v|i2v|cogvideo|wan2|movie|animate/i

/** 单个模型名 → 能力列表（多能力模型返回多项；无法识别时归为 chat） */
export function modelAbilities(model: string): ModelAbility[] {
  const m = (model || '').toLowerCase()
  if (!m) return []
  // 排除类优先：向量 / 重排 / 语音识别不承载 OneTake 创作能力
  if (RE_EMBEDDING.test(m)) return ['embedding']
  if (RE_RERANK.test(m)) return ['rerank']
  if (RE_ASR.test(m)) return ['asr']

  const out: ModelAbility[] = []
  if (RE_IMAGE.test(m)) out.push('image')
  if (RE_VIDEO.test(m)) out.push('video')
  if (RE_TTS.test(m)) out.push('tts')
  if (out.length === 0) out.push('chat')
  return out
}

/** 模型是否支持某能力（能力路由过滤用） */
export function modelSupports(model: string, ability: ProviderAbility): boolean {
  return modelAbilities(model).includes(ability)
}

/**
 * 按能力过滤模型列表，并保证「当前已选模型」始终在列表中
 * （即使启发式未识别，也不能让下拉丢失用户已保存的值）
 */
export function filterModelsForAbility(
  models: string[],
  ability: ProviderAbility,
  selected?: string,
): string[] {
  const matched = models.filter((m) => modelAbilities(m).includes(ability))
  if (selected && selected.trim() && !matched.includes(selected)) {
    return [selected, ...matched]
  }
  return matched
}

/** 模型能力徽章样式（显示用） */
export const MODEL_ABILITY_BADGE: Record<string, { label: string; cls: string }> = {
  chat: { label: '对话', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  image: { label: '生图', cls: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  tts: { label: '配音', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  video: { label: '视频', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  embedding: { label: '向量', cls: 'border-zinc-600/40 bg-zinc-800/60 text-zinc-400' },
  rerank: { label: '重排', cls: 'border-zinc-600/40 bg-zinc-800/60 text-zinc-400' },
  asr: { label: '识别', cls: 'border-zinc-600/40 bg-zinc-800/60 text-zinc-400' },
}

/** 模型的「主能力」徽章（多能力时按 chat > image > video > tts 展示优先级，排除类兜底「其他」） */
export function modelPrimaryAbility(model: string): string {
  const list = modelAbilities(model)
  for (const ab of ['chat', 'image', 'video', 'tts'] as const) {
    if (list.includes(ab)) return ab
  }
  return list[0] ?? 'chat'
}
