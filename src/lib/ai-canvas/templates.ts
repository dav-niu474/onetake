/**
 * 预置工作流模板
 */
import type { Edge, Node } from '@xyflow/react'
import { createNodeData, NODE_SPECS, type CanvasNodeData } from './types'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  tag: string
  gradient: string
  build: () => { nodes: Node<CanvasNodeData>[]; edges: Edge[] }
}

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  params: Record<string, unknown> = {},
  label?: string,
): Node<CanvasNodeData> {
  const spec = NODE_SPECS[type]
  return {
    id,
    type,
    position: { x, y },
    data: {
      ...createNodeData(type),
      params: { ...createNodeData(type).params, ...params },
      label: label ?? spec?.name,
    },
  }
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge {
  return {
    id: `e_${source}_${sourceHandle}_${target}_${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'canvas',
  }
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 't2v-quick',
    name: '文生视频 · 极速出片',
    description: '输入一句创意，直接生成 AI 视频',
    tag: '新手推荐',
    gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('t1', 'prompt', 60, 160, {
          text: '清晨的江南水乡，薄雾笼罩河面，一叶乌篷船缓缓划过石桥，阳光穿透雾气形成丁达尔效应，电影质感',
        }),
        node('t2', 'textToVideo', 480, 120, { quality: 'quality', withAudio: true }),
        node('t3', 'videoPreview', 940, 140),
      ],
      edges: [edge('t1', 'text', 't2', 'text'), edge('t2', 'video', 't3', 'video')],
    }),
  },
  {
    id: 'i2v',
    name: '图生视频 · 让照片动起来',
    description: '上传一张照片，写一句运动描述，生成动态视频',
    tag: '热门',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('i1', 'imageUpload', 60, 200),
        node('i2', 'prompt', 60, 400, {
          text: '镜头缓缓推进，发丝随风轻扬，光影流动',
        }),
        node('i3', 'imageToVideo', 460, 220, { quality: 'quality' }),
        node('i4', 'videoPreview', 920, 240),
      ],
      edges: [
        edge('i1', 'image', 'i3', 'image'),
        edge('i2', 'text', 'i3', 'text'),
        edge('i3', 'video', 'i4', 'video'),
      ],
    }),
  },
  {
    id: 'full-pipeline',
    name: '全流程 · 提示词工程到成片',
    description: 'LLM 扩写提示词，文生图后转视频，一站式创作',
    tag: '进阶',
    gradient: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('f1', 'prompt', 40, 260, {
          text: '一只橘猫宇航员漂浮在太空舱内，窗外是蓝色地球',
        }),
        node('f2', 'enhancer', 360, 220, { style: 'cinematic', target: 'video' }),
        node('f3', 'imageGen', 700, 60, { size: '1024x576' }),
        node('f4', 'imageToVideo', 1080, 200, { quality: 'quality' }),
        node('f5', 'videoPreview', 1460, 220),
        node('f6', 'imagePreview', 1080, 480),
      ],
      edges: [
        edge('f1', 'text', 'f2', 'text'),
        edge('f2', 'text', 'f3', 'text'),
        edge('f2', 'text', 'f4', 'text'),
        edge('f3', 'image', 'f4', 'image'),
        edge('f4', 'video', 'f5', 'video'),
        edge('f3', 'image', 'f6', 'image'),
      ],
    }),
  },
  {
    id: 'enhance-only',
    name: '提示词工坊 · 一键扩写',
    description: '用 LLM 把一句话变成专业级提示词',
    tag: '实用工具',
    gradient: 'from-teal-500/20 via-emerald-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('e1', 'prompt', 80, 200, { text: '雨后的东京街头，霓虹灯倒映在湿漉漉的路面' }),
        node('e2', 'enhancer', 460, 180, { style: 'cyberpunk', target: 'video' }),
        node('e3', 'prompt', 840, 200),
      ],
      edges: [edge('e1', 'text', 'e2', 'text'), edge('e2', 'text', 'e3', 'text')],
    }),
  },
  {
    id: 'voiceover',
    name: '口播视频 · 配音合成成片',
    description: '文案配音 + 画面生成 + 成片合成，一键出成品',
    tag: '自媒体',
    gradient: 'from-rose-500/20 via-fuchsia-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('v1', 'prompt', 60, 120, {
          text: '欢迎来到未来科技实验室。在这里，每一份创意都会被 AI 放大百倍。今天，让我们一起见证想象力的诞生。',
        }),
        node('v2', 'tts', 460, 60, { voice: 'tongtong', speed: 1 }),
        node('v3', 'audioPreview', 860, 80),
        node('v4', 'prompt', 60, 420, {
          text: '未来感科技实验室内部，全息投影界面漂浮在空中，蓝紫色光线交织，镜头缓慢横移',
        }),
        node('v5', 'textToVideo', 460, 380, { quality: 'quality', withAudio: false }),
        node('v6', 'avMerge', 1260, 200, { keepOriginal: false, audioVolume: 1, durationMode: 'video' }),
        node('v7', 'videoPreview', 1640, 220),
      ],
      edges: [
        edge('v1', 'text', 'v2', 'text'),
        edge('v2', 'audio', 'v3', 'audio'),
        edge('v2', 'audio', 'v6', 'audio'),
        edge('v4', 'text', 'v5', 'text'),
        edge('v5', 'video', 'v6', 'video'),
        edge('v6', 'video', 'v7', 'video'),
      ],
    }),
  },
  {
    id: 'product-showcase',
    name: '产品展示 · 一图变大片',
    description: '上传产品图，AI 场景化重绘后生成展示视频',
    tag: '电商',
    gradient: 'from-orange-500/20 via-rose-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('p1', 'imageUpload', 40, 240),
        node('p2', 'imageEdit', 440, 200, {
          prompt: '将产品置于高级感展示台，柔和的摄影棚灯光，背景是渐变的暖色丝绸帷幕，商业广告质感',
        }),
        node('p3', 'prompt', 440, 460, {
          text: '镜头围绕产品缓缓环绕一周，灯光从侧面扫过，呈现高级质感',
        }),
        node('p4', 'imageToVideo', 860, 220, { quality: 'quality' }),
        node('p5', 'imagePreview', 860, 500),
        node('p6', 'videoPreview', 1280, 240),
      ],
      edges: [
        edge('p1', 'image', 'p2', 'image'),
        edge('p2', 'image', 'p4', 'image'),
        edge('p3', 'text', 'p4', 'text'),
        edge('p4', 'video', 'p6', 'video'),
        edge('p2', 'image', 'p5', 'image'),
      ],
    }),
  },
  {
    id: 'storyboard',
    name: '故事分镜 · 三幕成片',
    description: '三段分镜并行生成 → 转场拼接 → AI 配音 → 合成出片',
    tag: '大片推荐',
    gradient: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    build: () => ({
      nodes: [
        /* 三幕分镜提示词 */
        node('s1', 'prompt', 40, 60, {
          text: '清晨的山间古道，云海在脚下翻涌，一位背背包的少年独自攀登，阳光穿透云层洒在石阶上，史诗感电影镜头',
        }, '分镜一 · 登山'),
        node('s2', 'prompt', 40, 380, {
          text: '正午的古城集市，少年穿行在熙攘的人群中，红灯笼与霓虹招牌交错，镜头跟随式手持运镜，烟火气息',
        }, '分镜二 · 探索'),
        node('s3', 'prompt', 40, 700, {
          text: '黄昏的山顶悬崖，少年张开双臂眺望远方连绵群山，金色夕阳染红云层，无人机环绕拉升大远景，壮阔收尾',
        }, '分镜三 · 远望'),
        /* 三段并行文生视频 */
        node('tv1', 'textToVideo', 420, 40, { quality: 'quality', withAudio: false }),
        node('tv2', 'textToVideo', 420, 360, { quality: 'quality', withAudio: false }),
        node('tv3', 'textToVideo', 420, 680, { quality: 'quality', withAudio: false }),
        /* 拼接 + 配音双轨 */
        node('c1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三幕拼接'),
        node('n1', 'prompt', 820, 700, {
          text: '每一座山，都是一次成长的邀请。走过清晨的雾，穿过正午的城，我们终于在黄昏的顶端，遇见更辽阔的自己。',
        }, '旁白文案'),
        node('t1', 'tts', 1200, 680, { voice: 'tongtong', speed: 1 }, 'AI 配音'),
        node('ap', 'audioPreview', 1560, 700),
        /* 合成成片 */
        node('m1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('vp', 'videoPreview', 1580, 300),
      ],
      edges: [
        edge('s1', 'text', 'tv1', 'text'),
        edge('s2', 'text', 'tv2', 'text'),
        edge('s3', 'text', 'tv3', 'text'),
        edge('tv1', 'video', 'c1', 'v1'),
        edge('tv2', 'video', 'c1', 'v2'),
        edge('tv3', 'video', 'c1', 'v3'),
        edge('n1', 'text', 't1', 'text'),
        edge('t1', 'audio', 'ap', 'audio'),
        edge('t1', 'audio', 'm1', 'audio'),
        edge('c1', 'video', 'm1', 'video'),
        edge('m1', 'video', 'vp', 'video'),
      ],
    }),
  },
]
