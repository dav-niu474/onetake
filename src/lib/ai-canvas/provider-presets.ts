/**
 * 预置模型供应商目录（前后端共享）
 *
 * 参考 Cherry Studio / LobeChat / new-api 的供应商预置方式：
 * 每家预置官方 API Base URL、密钥申请入口、支持的协议与能力，
 * 用户只需选择预置 → 填 API Key → 「测试连接」拉取模型列表 → 保存。
 *
 * protocol 说明：
 * - openai    OpenAI 兼容协议（/chat/completions、/models、/images/generations、/audio/speech），
 *             覆盖绝大多数国内外厂商与聚合网关、本地推理（Ollama / LM Studio）
 * - anthropic Anthropic Messages 协议（/v1/messages、/v1/models）
 * - gemini    Google Generative Language 协议（/v1beta/models、:generateContent）
 */

export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini'

/** 平台能力：chat 文本 / image 图像生成 / tts 语音合成 / video 视频生成 */
export type ProviderAbility = 'chat' | 'image' | 'tts' | 'video'

export interface ProviderPreset {
  id: string
  /** 展示名（中文优先） */
  name: string
  /** 原名/英文名 */
  nameEn: string
  protocol: ProviderProtocol
  /** 官方 API Base URL（OpenAI 兼容的均以 /v1 等版本段结尾） */
  baseUrl: string
  /** API Key 申请/管理入口 */
  keyUrl?: string
  /** 官网 */
  homeUrl?: string
  desc: string
  /** 该供应商在 OneTake 中可承载的能力 */
  abilities: ProviderAbility[]
  /** 徽标渐变色（tailwind 渐变类，如 from-amber-400 to-orange-500） */
  accent: string
  /** 徽标文字（1-2 字符） */
  badge: string
  /** 本地推理等无需密钥的场景 */
  needKey: boolean
}

/** 能力 → 中文（共享给 UI） */
export const ABILITY_LABEL: Record<ProviderAbility, string> = {
  chat: '对话',
  image: '生图',
  tts: '配音',
  video: '视频',
}

/** 内置服务（z-ai-web-dev-sdk，平台托管无需配置）——固定显示在供应商列表顶部 */
export const BUILTIN_PRESET = {
  id: 'builtin',
  name: '内置智谱',
  nameEn: 'Built-in Z.ai',
  desc: '平台托管的智谱大模型（GLM / CogView / CogVideoX / TTS），开箱即用无需任何配置。',
  accent: 'from-amber-400 to-orange-500',
  badge: '镜',
} as const

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    nameEn: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    homeUrl: 'https://platform.openai.com',
    desc: 'GPT 系列文本模型，DALL·E / gpt-image 图像与 TTS 语音。',
    abilities: ['chat', 'image', 'tts'],
    accent: 'from-emerald-400 to-teal-600',
    badge: 'O',
    needKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    nameEn: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    homeUrl: 'https://platform.deepseek.com',
    desc: 'DeepSeek-V3 / R1 推理模型，性价比极高，擅长中文创意写作。',
    abilities: ['chat'],
    accent: 'from-sky-400 to-blue-600',
    badge: 'D',
    needKey: true,
  },
  {
    id: 'zhipu',
    name: '智谱 BigModel',
    nameEn: 'Zhipu AI',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    homeUrl: 'https://open.bigmodel.cn',
    desc: 'GLM 系列与 CogView 图像生成，本产品内置能力同源。',
    abilities: ['chat', 'image'],
    accent: 'from-sky-400 to-cyan-600',
    badge: 'Z',
    needKey: true,
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    nameEn: 'Alibaba DashScope',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    homeUrl: 'https://bailian.console.aliyun.com',
    desc: 'Qwen 全系列（兼容模式），通义万相图像生成。',
    abilities: ['chat', 'image'],
    accent: 'from-orange-400 to-amber-600',
    badge: 'Q',
    needKey: true,
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    nameEn: 'Moonshot AI',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    homeUrl: 'https://platform.moonshot.cn',
    desc: 'Kimi 系列长上下文模型，中文理解出色。',
    abilities: ['chat'],
    accent: 'from-slate-400 to-zinc-700',
    badge: 'K',
    needKey: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameEn: 'MiniMax',
    protocol: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    homeUrl: 'https://platform.minimaxi.com',
    desc: 'MiniMax 文本大模型（海螺同源），多语言能力强。',
    abilities: ['chat'],
    accent: 'from-rose-400 to-red-600',
    badge: 'M',
    needKey: true,
  },
  {
    id: 'volcengine',
    name: '火山方舟（豆包）',
    nameEn: 'Volcengine Ark',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    keyUrl: 'https://console.volcengine.com/ark/region:ark-cn-beijing/apiKey',
    homeUrl: 'https://www.volcengine.com/product/ark',
    desc: '字节跳动豆包大模型；模型名填写推理接入点 ID（ep-xxx）。',
    abilities: ['chat'],
    accent: 'from-red-400 to-rose-600',
    badge: '豆',
    needKey: true,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    nameEn: 'SiliconFlow',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    homeUrl: 'https://siliconflow.cn',
    desc: '国产模型聚合网关：DeepSeek / Qwen / Kolors 生图 / CosyVoice 配音。',
    abilities: ['chat', 'image', 'tts'],
    accent: 'from-violet-400 to-purple-600',
    badge: 'S',
    needKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    nameEn: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    homeUrl: 'https://openrouter.ai',
    desc: '全球模型聚合网关，一个 Key 调用数百种模型（模型名带厂商前缀）。',
    abilities: ['chat'],
    accent: 'from-teal-400 to-emerald-600',
    badge: 'OR',
    needKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    nameEn: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    homeUrl: 'https://groq.com',
    desc: 'LPU 极速推理，开源模型（Llama / Mixtral）毫秒级响应。',
    abilities: ['chat'],
    accent: 'from-orange-400 to-red-600',
    badge: 'G',
    needKey: true,
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    nameEn: 'xAI',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    homeUrl: 'https://x.ai',
    desc: 'Grok 系列模型与 Aurora 图像生成。',
    abilities: ['chat', 'image'],
    accent: 'from-zinc-400 to-slate-700',
    badge: 'X',
    needKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    nameEn: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    homeUrl: 'https://www.anthropic.com',
    desc: 'Claude 系列，长文创作与剧本写作质量上乘（Messages 原生协议）。',
    abilities: ['chat'],
    accent: 'from-amber-400 to-orange-600',
    badge: 'A',
    needKey: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    nameEn: 'Google AI',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyUrl: 'https://aistudio.google.com/apikey',
    homeUrl: 'https://ai.google.dev',
    desc: 'Gemini 全系列，多模态理解与创作（GenerateContent 原生协议）。',
    abilities: ['chat'],
    accent: 'from-blue-400 to-indigo-600',
    badge: 'G',
    needKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    nameEn: 'Ollama',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    homeUrl: 'https://ollama.com',
    desc: '本地开源模型运行时，无需密钥；确保已 ollama serve 启动。',
    abilities: ['chat'],
    accent: 'from-stone-400 to-zinc-600',
    badge: 'Ol',
    needKey: false,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    nameEn: 'LM Studio',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    homeUrl: 'https://lmstudio.ai',
    desc: '本地模型服务器，无需密钥；在应用内开启 Local Server。',
    abilities: ['chat'],
    accent: 'from-fuchsia-400 to-purple-600',
    badge: 'LM',
    needKey: false,
  },
]

export const CUSTOM_PRESET_ID = 'custom'

export function getPreset(presetId: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === presetId)
}

/** 协议显示名 */
export const PROTOCOL_LABEL: Record<ProviderProtocol, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

/** 该协议支持的（OneTake 已适配的）能力：image/tts 仅 OpenAI 兼容协议通用 */
export function protocolAbilities(protocol: ProviderProtocol): ProviderAbility[] {
  if (protocol === 'openai') return ['chat', 'image', 'tts']
  return ['chat']
}
