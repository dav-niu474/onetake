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
]
