/**
 * AI 视频创作画布 —— 核心类型与节点注册表
 * 参考 RunningHub / SenseTime SEKO / ComfyUI 的节点式画布设计
 */

/* ---------------------------------- 数据类型 ---------------------------------- */

export type DataKind = 'text' | 'image' | 'video' | 'audio'

export interface NodeOutput {
  kind: DataKind
  /** 生成的资源 URL（图片 / 视频 / 音频），存放在 /generated 下 */
  url?: string
  /** 文本输出 */
  text?: string
  /** 额外信息（如任务耗时、模型） */
  meta?: Record<string, string | number>
}

export const DATA_KIND_META: Record<
  DataKind,
  { label: string; color: string; dot: string; ring: string }
> = {
  text: {
    label: '文本',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400',
    ring: 'border-emerald-400/60',
  },
  image: {
    label: '图像',
    color: 'text-violet-400',
    dot: 'bg-violet-400',
    ring: 'border-violet-400/60',
  },
  video: {
    label: '视频',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
    ring: 'border-amber-400/60',
  },
  audio: {
    label: '音频',
    color: 'text-rose-400',
    dot: 'bg-rose-400',
    ring: 'border-rose-400/60',
  },
}

/* ---------------------------------- 参数系统 ---------------------------------- */

export type ParamType = 'textarea' | 'text' | 'select' | 'slider' | 'switch'

export interface ParamField {
  key: string
  label: string
  type: ParamType
  defaultValue: unknown
  placeholder?: string
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  /** 参数变化是否会使下游结果失效 */
  affectsOutput?: boolean
  hint?: string
}

/* ---------------------------------- 运行状态 ---------------------------------- */

export type RunState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export const RUN_STATE_META: Record<
  RunState,
  { label: string; color: string }
> = {
  idle: { label: '待运行', color: 'text-zinc-500' },
  queued: { label: '排队中', color: 'text-sky-300' },
  running: { label: '运行中', color: 'text-amber-300' },
  success: { label: '已完成', color: 'text-emerald-400' },
  failed: { label: '失败', color: 'text-rose-400' },
  skipped: { label: '已跳过', color: 'text-zinc-600' },
}

/* ---------------------------------- 节点数据 ---------------------------------- */

export interface CanvasNodeData {
  label?: string
  params: Record<string, unknown>
  runState: RunState
  stage?: string
  progress?: number
  error?: string
  /** 每个输出端口的最新输出 */
  outputs: Record<string, NodeOutput>
  /** 已解析的上游输入（执行编排时写入，供预览节点展示） */
  inputs?: Record<string, NodeOutput>
  /** 上次运行耗时（ms） */
  durationMs?: number
  [key: string]: unknown
}

/* ---------------------------------- 端口定义 ---------------------------------- */

export interface PortDef {
  id: string
  label: string
  kind: DataKind
  required?: boolean
  description?: string
}

/* ---------------------------------- 节点规格 ---------------------------------- */

export type NodeCategory = 'input' | 'generate' | 'process' | 'output'

export const CATEGORY_META: Record<
  NodeCategory,
  { label: string; order: number }
> = {
  input: { label: '输入', order: 0 },
  generate: { label: 'AI 生成', order: 1 },
  process: { label: '处理', order: 2 },
  output: { label: '输出', order: 3 },
}

export interface NodeSpec {
  type: string
  name: string
  description: string
  icon: string // lucide 图标名（在组件中映射）
  accent: string // tailwind 类前缀，如 "emerald"
  category: NodeCategory
  inputs: PortDef[]
  outputs: PortDef[]
  params: ParamField[]
  /** 该节点是否可执行（有副作用） */
  executable: boolean
  /** 默认尺寸（React Flow） */
  width?: number
}

/* ---------------------------------- 节点注册表 ---------------------------------- */

export const IMAGE_SIZES = [
  { label: '16:9 · 1024×576（视频推荐）', value: '1024x576' },
  { label: '9:16 · 576×1024（竖屏）', value: '576x1024' },
  { label: '1:1 · 1024×1024', value: '1024x1024' },
  { label: '4:3 · 1152×864', value: '1152x864' },
  { label: '3:4 · 864×1152', value: '864x1152' },
  { label: '3:2 · 1248×832', value: '1248x832' },
  { label: '2:3 · 832×1248', value: '832x1248' },
  { label: '21:9 · 1344×576（电影宽幅）', value: '1344x576' },
]

const PROMPT_STYLE_OPTIONS = [
  { label: '自动（忠实增强）', value: 'auto' },
  { label: '电影质感', value: 'cinematic' },
  { label: '写实摄影', value: 'photoreal' },
  { label: '动漫风格', value: 'anime' },
  { label: '3D 渲染', value: '3d' },
  { label: '水墨国风', value: 'ink' },
  { label: '赛博朋克', value: 'cyberpunk' },
]

export const NODE_SPECS: Record<string, NodeSpec> = {
  prompt: {
    type: 'prompt',
    name: '提示词',
    description: '输入创意描述，作为生成节点的文本输入',
    icon: 'Type',
    accent: 'emerald',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'text', label: '文本', kind: 'text' }],
    params: [
      {
        key: 'text',
        label: '提示词内容',
        type: 'textarea',
        defaultValue: '',
        placeholder: '例：一只橘猫在洒满阳光的窗台上伸懒腰，胶片质感…',
        hint: '描述越具体，生成效果越好',
      },
    ],
    executable: false,
    width: 300,
  },
  imageUpload: {
    type: 'imageUpload',
    name: '图片上传',
    description: '上传本地图片，作为图生视频 / 图生图节点的输入',
    icon: 'ImagePlus',
    accent: 'violet',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'image', label: '图像', kind: 'image' }],
    params: [],
    executable: false,
    width: 260,
  },
  enhancer: {
    type: 'enhancer',
    name: '提示词优化',
    description: '使用 LLM 将简短想法扩写为专业的视频/图像提示词',
    icon: 'Sparkles',
    accent: 'teal',
    category: 'process',
    inputs: [{ id: 'text', label: '文本', kind: 'text' }],
    outputs: [{ id: 'text', label: '文本', kind: 'text' }],
    params: [
      {
        key: 'style',
        label: '目标风格',
        type: 'select',
        defaultValue: 'auto',
        options: PROMPT_STYLE_OPTIONS,
      },
      {
        key: 'target',
        label: '优化目标',
        type: 'select',
        defaultValue: 'video',
        options: [
          { label: '视频生成', value: 'video' },
          { label: '图像生成', value: 'image' },
        ],
      },
    ],
    executable: true,
    width: 280,
  },
  imageGen: {
    type: 'imageGen',
    name: '文生图',
    description: '根据提示词生成图像（可接上游提示词）',
    icon: 'Palette',
    accent: 'violet',
    category: 'generate',
    inputs: [{ id: 'text', label: '文本', kind: 'text', description: '可选' }],
    outputs: [{ id: 'image', label: '图像', kind: 'image' }],
    params: [
      {
        key: 'prompt',
        label: '本节点提示词（覆盖上游）',
        type: 'textarea',
        defaultValue: '',
        placeholder: '留空则使用上游提示词输入',
      },
      {
        key: 'size',
        label: '画面比例',
        type: 'select',
        defaultValue: '1024x576',
        options: IMAGE_SIZES,
      },
    ],
    executable: true,
    width: 300,
  },
  imageEdit: {
    type: 'imageEdit',
    name: '图生图',
    description: '以上游图像为底，按提示词进行风格化重绘',
    icon: 'Wand2',
    accent: 'fuchsia',
    category: 'generate',
    inputs: [
      { id: 'image', label: '图像', kind: 'image', required: true },
      { id: 'text', label: '文本', kind: 'text', description: '可选' },
    ],
    outputs: [{ id: 'image', label: '图像', kind: 'image' }],
    params: [
      {
        key: 'prompt',
        label: '本节点提示词（覆盖上游）',
        type: 'textarea',
        defaultValue: '',
        placeholder: '例：把背景改成黄昏的赛博都市',
      },
      {
        key: 'size',
        label: '输出尺寸',
        type: 'select',
        defaultValue: 'auto',
        options: [{ label: '跟随原图', value: 'auto' }, ...IMAGE_SIZES],
      },
    ],
    executable: true,
    width: 300,
  },
  textToVideo: {
    type: 'textToVideo',
    name: '文生视频',
    description: '根据提示词直接生成 AI 视频（支持音轨）',
    icon: 'Clapperboard',
    accent: 'amber',
    category: 'generate',
    inputs: [{ id: 'text', label: '文本', kind: 'text', required: true }],
    outputs: [{ id: 'video', label: '视频', kind: 'video' }],
    params: [
      {
        key: 'prompt',
        label: '本节点提示词（覆盖上游）',
        type: 'textarea',
        defaultValue: '',
        placeholder: '留空则使用上游提示词输入',
      },
      {
        key: 'quality',
        label: '生成质量',
        type: 'select',
        defaultValue: 'quality',
        options: [
          { label: '极速', value: 'speed' },
          { label: '高清', value: 'quality' },
        ],
      },
      {
        key: 'withAudio',
        label: '生成音轨',
        type: 'switch',
        defaultValue: false,
      },
    ],
    executable: true,
    width: 320,
  },
  imageToVideo: {
    type: 'imageToVideo',
    name: '图生视频',
    description: '让静态图片动起来，生成动态视频',
    icon: 'Film',
    accent: 'orange',
    category: 'generate',
    inputs: [
      { id: 'image', label: '图像', kind: 'image', required: true },
      { id: 'text', label: '文本', kind: 'text', description: '运动描述，可选' },
    ],
    outputs: [{ id: 'video', label: '视频', kind: 'video' }],
    params: [
      {
        key: 'prompt',
        label: '运动提示词（覆盖上游）',
        type: 'textarea',
        defaultValue: '',
        placeholder: '例：镜头缓缓推进，人物微笑并挥手，发丝随风飘动',
      },
      {
        key: 'quality',
        label: '生成质量',
        type: 'select',
        defaultValue: 'quality',
        options: [
          { label: '极速', value: 'speed' },
          { label: '高清', value: 'quality' },
        ],
      },
      {
        key: 'withAudio',
        label: '生成音轨',
        type: 'switch',
        defaultValue: false,
      },
    ],
    executable: true,
    width: 320,
  },
  imagePreview: {
    type: 'imagePreview',
    name: '图片预览',
    description: '大尺寸预览上游生成的图像',
    icon: 'Image',
    accent: 'zinc',
    category: 'output',
    inputs: [{ id: 'image', label: '图像', kind: 'image', required: true }],
    outputs: [],
    params: [],
    executable: false,
    width: 300,
  },
  videoPreview: {
    type: 'videoPreview',
    name: '视频预览',
    description: '播放上游生成的视频，支持全屏与下载',
    icon: 'MonitorPlay',
    accent: 'zinc',
    category: 'output',
    inputs: [{ id: 'video', label: '视频', kind: 'video', required: true }],
    outputs: [],
    params: [],
    executable: false,
    width: 340,
  },
}

export const NODE_TYPE_LIST = Object.values(NODE_SPECS)

/** 判断连接是否合法（类型匹配） */
export function isConnectionValid(
  source: { type: string; handleId: string | null },
  target: { type: string; handleId: string | null },
): boolean {
  const srcSpec = NODE_SPECS[source.type]
  const tgtSpec = NODE_SPECS[target.type]
  if (!srcSpec || !tgtSpec) return false
  const out = srcSpec.outputs.find((o) => o.id === source.handleId)
  const inp = tgtSpec.inputs.find((i) => i.id === target.handleId)
  if (!out || !inp) return false
  return out.kind === inp.kind
}

export function getSpec(type: string): NodeSpec | undefined {
  return NODE_SPECS[type]
}

/** 创建节点默认数据 */
export function createNodeData(type: string): CanvasNodeData {
  const spec = NODE_SPECS[type]
  const params: Record<string, unknown> = {}
  spec?.params.forEach((p) => {
    params[p.key] = p.defaultValue
  })
  return {
    params,
    runState: 'idle',
    outputs: {},
    progress: 0,
  }
}

/** 生成节点实例标题（带序号） */
export function defaultNodeLabel(type: string, index: number): string {
  return `${NODE_SPECS[type]?.name ?? type} ${index}`
}
