/**
 * 专业参数系统 —— AI 生成节点的提示词注入
 *
 * 为生成类节点（文生图 / 图生图 / 文生视频 / 图生视频 / AI 配音）提供
 * 专业影像参数（风格 / 光影 / 运镜 / 构图 / 色调 / 情绪…）。
 * 用户在 Inspector 中点选后，执行引擎会在运行时把已选参数
 * 自动序列化并追加到提示词末尾，无需用户手写专业术语。
 *
 * 本文件是 前端 UI（pro-params-panel.tsx）与 服务端注入（runner.ts）
 * 的唯一数据契约：新增参数只需在此登记。
 */

export interface ProParamOption {
  /** 存储值（写入 params.pro[group.key]） */
  value: string
  /** UI 展示的短标签（chips 上的文字） */
  label: string
  /** 注入提示词的完整片段（专业术语描述） */
  prompt: string
}

export interface ProParamGroup {
  /** 参数键（如 style / lighting / camera） */
  key: string
  /** 参数名（如「画面风格」「光影氛围」） */
  label: string
  /** 该组的简短说明（UI hover 提示） */
  hint?: string
  options: ProParamOption[]
}

/* ------------------------------ 图像节点参数组 ------------------------------ */
/* （文生图 imageGen 与 图生图 imageEdit 共用） */

const IMAGE_PRO_GROUPS: ProParamGroup[] = [
  {
    key: 'style',
    label: '画面风格',
    hint: '整体视觉风格与美学流派',
    options: [
      { value: 'cinematic', label: '电影质感', prompt: '电影质感，胶片颗粒与电影级光影氛围' },
      { value: 'photoreal', label: '写实摄影', prompt: '写实摄影风格，真实光影与细腻质感' },
      { value: 'anime', label: '日系动漫', prompt: '日式动漫风格，赛璐璐上色与鲜明色彩' },
      { value: 'guofeng', label: '水墨国风', prompt: '中国水墨画风，留白意境与墨色晕染' },
      { value: 'render3d', label: '3D 渲染', prompt: '3D 渲染风格，CGI 质感与物理光照' },
      { value: 'cyberpunk', label: '赛博朋克', prompt: '赛博朋克风格，霓虹光效与未来都市感' },
      { value: 'flat', label: '扁平插画', prompt: '扁平插画风格，简洁几何形与明快配色' },
      { value: 'watercolor', label: '水彩手绘', prompt: '水彩手绘风格，柔和晕染与纸面肌理' },
      { value: 'vintage', label: '复古胶片', prompt: '复古胶片质感，褪色颗粒与怀旧影调' },
      { value: 'pixel', label: '像素艺术', prompt: '像素艺术风格，复古像素块面构成' },
    ],
  },
  {
    key: 'lighting',
    label: '光影氛围',
    hint: '光源类型与布光方案',
    options: [
      { value: 'golden', label: '黄金时刻', prompt: '黄金时刻的暖调逆光' },
      { value: 'bluehour', label: '蓝调时刻', prompt: '蓝调时刻的清冷天光' },
      { value: 'soft', label: '柔和散射', prompt: '柔和的自然散射光，过渡细腻' },
      { value: 'rembrandt', label: '伦勃朗光', prompt: '伦勃朗式侧光，明暗对比立体' },
      { value: 'rim', label: '逆光轮廓', prompt: '强烈逆光勾勒出清晰的轮廓光' },
      { value: 'neon', label: '霓虹夜色', prompt: '霓虹灯光晕染的夜色照明' },
      { value: 'candle', label: '烛光暖调', prompt: '烛光与暖黄光源的静谧氛围' },
      { value: 'studio', label: '棚拍布光', prompt: '专业棚拍三点布光，干净通透' },
    ],
  },
  {
    key: 'composition',
    label: '构图景别',
    hint: '取景范围与画面结构',
    options: [
      { value: 'closeup', label: '特写', prompt: '特写构图，聚焦主体细节' },
      { value: 'medium', label: '中景', prompt: '中景构图，主体与环境平衡' },
      { value: 'full', label: '全景', prompt: '全景构图，完整呈现场景' },
      { value: 'wide', label: '广角', prompt: '超广角视野，空间纵深强烈' },
      { value: 'top', label: '俯拍', prompt: '高角度俯拍视角' },
      { value: 'low', label: '仰拍', prompt: '低角度仰拍视角，主体高大挺拔' },
      { value: 'symmetry', label: '对称构图', prompt: '中心对称构图，画面庄重稳定' },
      { value: 'ruleof3', label: '三分法', prompt: '三分法构图，主体置于趣味点' },
    ],
  },
  {
    key: 'palette',
    label: '色调',
    hint: '色彩倾向与调色风格',
    options: [
      { value: 'warm', label: '暖色调', prompt: '暖色调，橙黄暖意弥漫' },
      { value: 'cold', label: '冷色调', prompt: '冷色调，蓝青色清冷氛围' },
      { value: 'tealorange', label: '青橙对比', prompt: '青橙对比的电影级调色' },
      { value: 'morandi', label: '莫兰迪', prompt: '莫兰迪低饱和灰色调，高级柔和' },
      { value: 'vivid', label: '高饱和', prompt: '高饱和鲜艳色彩，视觉冲击力强' },
      { value: 'mono', label: '黑白单色', prompt: '黑白单色影调，经典质感' },
    ],
  },
  {
    key: 'quality',
    label: '画质质感',
    hint: '细节密度与镜头质感',
    options: [
      { value: 'detail', label: '超清细节', prompt: '超高清细节，8K 分辨率质感' },
      { value: 'bokeh', label: '景深虚化', prompt: '浅景深背景虚化，主体突出' },
      { value: 'filmgrain', label: '胶片颗粒', prompt: '细腻的胶片颗粒质感' },
      { value: 'sharp', label: '锐利通透', prompt: '锐利通透的高清晰度成像' },
      { value: 'softfocus', label: '柔焦梦幻', prompt: '柔焦朦胧的梦幻氛围' },
      { value: 'hdr', label: 'HDR 质感', prompt: 'HDR 高动态范围，明暗层次丰富' },
    ],
  },
]

/* ------------------------------ 视频节点参数组 ------------------------------ */
/* （文生视频 textToVideo 与 图生视频 imageToVideo 共用） */

const VIDEO_PRO_GROUPS: ProParamGroup[] = [
  {
    key: 'camera',
    label: '运镜方式',
    hint: '镜头运动语言（视频生成的核心控制项）',
    options: [
      { value: 'static', label: '固定镜头', prompt: '固定机位，画面稳定从容' },
      { value: 'pushin', label: '缓慢推近', prompt: '镜头缓慢推近，逐步聚焦主体' },
      { value: 'pullout', label: '缓慢拉远', prompt: '镜头缓慢拉远，逐渐展现全貌' },
      { value: 'pan', label: '左右摇移', prompt: '镜头平稳地左右摇移' },
      { value: 'tracking', label: '跟随运镜', prompt: '跟随主体移动的跟拍运镜' },
      { value: 'orbit', label: '环绕运镜', prompt: '围绕主体环绕旋转拍摄' },
      { value: 'handheld', label: '手持晃动', prompt: '手持摄影的真实晃动感，临场感强' },
      { value: 'drone', label: '航拍俯冲', prompt: '无人机航拍俯冲视角，气势开阔' },
    ],
  },
  {
    key: 'shot',
    label: '景别',
    hint: '主体在画面中的大小范围',
    options: [
      { value: 'closeup', label: '特写', prompt: '特写景别，细节纤毫毕现' },
      { value: 'medium', label: '中景', prompt: '中景景别，主体动作清晰' },
      { value: 'wide', label: '远景', prompt: '远景景别，环境氛围浓烈' },
      { value: 'extreme', label: '大远景', prompt: '大远景，人物渺小天地辽阔' },
    ],
  },
  {
    key: 'atmosphere',
    label: '时空氛围',
    hint: '时间、天气与环境气氛',
    options: [
      { value: 'dawn', label: '黎明薄雾', prompt: '黎明时分薄雾轻笼的氛围' },
      { value: 'morning', label: '清晨柔光', prompt: '清晨柔和光线的清新氛围' },
      { value: 'dusk', label: '黄昏暮色', prompt: '黄昏暮色的暖调氛围' },
      { value: 'night', label: '深夜静谧', prompt: '深夜静谧的幽暗氛围' },
      { value: 'rain', label: '细雨绵绵', prompt: '细雨绵绵的湿润质感' },
      { value: 'snow', label: '落雪纷飞', prompt: '落雪纷飞的冬日氛围' },
      { value: 'fog', label: '雾气弥漫', prompt: '雾气弥漫的朦胧层次' },
    ],
  },
  {
    key: 'style',
    label: '画面风格',
    hint: '整体视觉风格与美学流派',
    options: [
      { value: 'cinematic', label: '电影质感', prompt: '电影质感，胶片颗粒与电影级光影' },
      { value: 'documentary', label: '写实纪录', prompt: '写实纪录片风格，自然真实' },
      { value: 'anime', label: '日系动漫', prompt: '日式动漫风格，赛璐璐上色' },
      { value: 'render3d', label: '3D 动画', prompt: '3D 动画渲染风格，CGI 质感' },
      { value: 'guofeng', label: '水墨国风', prompt: '中国水墨画风，留白意境' },
      { value: 'cyberpunk', label: '赛博朋克', prompt: '赛博朋克风格，霓虹光效' },
      { value: 'vintage', label: '复古胶片', prompt: '复古胶片质感，怀旧影调' },
    ],
  },
  {
    key: 'mood',
    label: '情绪基调',
    hint: '影片传达的情绪与叙事氛围',
    options: [
      { value: 'tense', label: '紧张悬疑', prompt: '紧张悬疑的情绪基调，节奏紧绷' },
      { value: 'warm', label: '温馨治愈', prompt: '温馨治愈的情绪基调，节奏舒缓' },
      { value: 'epic', label: '史诗恢弘', prompt: '史诗般恢弘大气的情绪基调' },
      { value: 'lively', label: '轻快活泼', prompt: '轻快活泼的情绪基调，明快灵动' },
      { value: 'melancholy', label: '忧伤唯美', prompt: '忧伤而唯美的情绪基调' },
      { value: 'mysterious', label: '神秘奇幻', prompt: '神秘奇幻的情绪基调，引人入胜' },
    ],
  },
]

/* ------------------------------ 配音节点参数组 ------------------------------ */
/* prompt 字段 = TTS 语气指令（OpenAI 兼容 /audio/speech 的 instructions） */

const TTS_PRO_GROUPS: ProParamGroup[] = [
  {
    key: 'emotion',
    label: '语气情感',
    hint: '朗读的情感倾向（自定义 OpenAI 兼容供应商时作为语气指令生效）',
    options: [
      { value: 'calm', label: '平静叙述', prompt: '用平静沉稳的语气自然朗读，不夸张不刻意' },
      { value: 'gentle', label: '温柔亲切', prompt: '用温柔亲切的语气朗读，像知心朋友娓娓道来' },
      { value: 'healing', label: '暖心治愈', prompt: '用温暖治愈的语气朗读，柔和放松' },
      { value: 'energetic', label: '热情洋溢', prompt: '用热情洋溢的语气朗读，充满活力与感染力' },
      { value: 'deep', label: '深沉庄重', prompt: '用深沉庄重的语气朗读，稳重有力' },
      { value: 'lively', label: '活泼俏皮', prompt: '用活泼俏皮的语气朗读，轻快灵动' },
      { value: 'sad', label: '低沉忧伤', prompt: '用低沉忧伤的语气朗读，情绪内敛' },
      { value: 'magnetic', label: '广告磁性', prompt: '用广告配音般的磁性声线朗读，张力十足' },
    ],
  },
]

/* ------------------------------ 注册表 ------------------------------ */

/** 按节点类型注册的专业参数组（共用组按引用复用） */
export const PRO_PARAM_GROUPS: Record<string, ProParamGroup[]> = {
  imageGen: IMAGE_PRO_GROUPS,
  imageEdit: IMAGE_PRO_GROUPS,
  textToVideo: VIDEO_PRO_GROUPS,
  imageToVideo: VIDEO_PRO_GROUPS,
  tts: TTS_PRO_GROUPS,
}

/** 支持专业参数的节点类型 */
export const PRO_PARAM_NODE_TYPES = new Set(Object.keys(PRO_PARAM_GROUPS))

/** params.pro 的存储结构：group.key → option.value */
export type ProParamValues = Record<string, string>

/** 安全读取节点 params.pro（兼容旧节点无该字段） */
export function getProValues(params: Record<string, unknown> | undefined): ProParamValues {
  const pro = params?.pro
  if (!pro || typeof pro !== 'object' || Array.isArray(pro)) return {}
  const out: ProParamValues = {}
  for (const [k, v] of Object.entries(pro as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

/** 已设置的参数个数（用于 UI 徽标与运行 meta） */
export function countProParams(nodeType: string, params: Record<string, unknown>): number {
  const values = getProValues(params)
  return Object.keys(values).filter((k) =>
    PRO_PARAM_GROUPS[nodeType]?.some((g) => g.key === k),
  ).length
}

/**
 * 将已设置的专业参数序列化为提示词注入片段（图像 / 视频节点用）。
 * 输出形如：`画面风格：电影质感；光影氛围：黄金时刻的暖调逆光；色调：暖色调`
 * 未设置任何参数时返回空字符串。
 */
export function buildProPrompt(nodeType: string, params: Record<string, unknown>): string {
  const groups = PRO_PARAM_GROUPS[nodeType]
  if (!groups) return ''
  const values = getProValues(params)
  const parts: string[] = []
  for (const g of groups) {
    const v = values[g.key]
    if (!v) continue
    const opt = g.options.find((o) => o.value === v)
    if (opt) parts.push(`${g.label}：${opt.prompt}`)
  }
  return parts.join('；')
}

/**
 * 将已设置的专业参数序列化为 TTS 语气指令（供 OpenAI 兼容 /audio/speech 的
 * instructions 字段使用）。未设置时返回 undefined。
 */
export function buildTTSInstructions(params: Record<string, unknown>): string | undefined {
  const groups = PRO_PARAM_GROUPS.tts
  const values = getProValues(params)
  const parts: string[] = []
  for (const g of groups) {
    const v = values[g.key]
    if (!v) continue
    const opt = g.options.find((o) => o.value === v)
    if (opt) parts.push(opt.prompt)
  }
  return parts.length > 0 ? parts.join('，') : undefined
}
