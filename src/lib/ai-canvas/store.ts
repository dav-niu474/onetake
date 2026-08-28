'use client'

/**
 * 画布全局状态（zustand）
 * 管理 React Flow 节点/边、工作流元信息、运行状态与 UI 状态
 */
import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import {
  createNodeData,
  isConnectionValid,
  NODE_SPECS,
  type CanvasNodeData,
  type NodeOutput,
  type RunState,
} from './types'

let nodeCounter = 0

export interface WorkflowMeta {
  id: string | null
  name: string
  updatedAt?: string
}

export interface CanvasStore {
  /* 画布数据 */
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null

  /* 工作流元信息 */
  workflow: WorkflowMeta
  dirty: boolean
  saving: boolean

  /* 运行状态 */
  running: boolean
  runAbort: boolean

  /* UI */
  paletteOpen: boolean
  libraryOpen: boolean
  templatesOpen: boolean
  toast: { type: 'success' | 'error' | 'info'; message: string } | null

  /* ---- actions ---- */
  onNodesChange: (changes: NodeChange<Node<CanvasNodeData>>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void

  addNode: (type: string, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  updateNodeData: (
    id: string,
    patch: Partial<CanvasNodeData> | ((d: CanvasNodeData) => Partial<CanvasNodeData>),
  ) => void
  updateNodeParam: (id: string, key: string, value: unknown) => void
  setNodeRunState: (
    id: string,
    state: RunState,
    extra?: Partial<CanvasNodeData>,
  ) => void
  setNodeOutput: (id: string, handleId: string, output: NodeOutput) => void
  clearAllRunStates: () => void
  setEdges: (edges: Edge[]) => void

  setWorkflow: (meta: Partial<WorkflowMeta>) => void
  loadGraph: (
    graph: { nodes: Node<CanvasNodeData>[]; edges: Edge[] },
    meta?: Partial<WorkflowMeta>,
  ) => void
  markSaved: (id: string, updatedAt?: string) => void
  setSaving: (v: boolean) => void
  setDirty: (v: boolean) => void

  setRunning: (v: boolean) => void
  requestRunAbort: () => void

  setPaletteOpen: (v: boolean) => void
  setLibraryOpen: (v: boolean) => void
  setTemplatesOpen: (v: boolean) => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  clearToast: () => void
}

function makeId() {
  nodeCounter += 1
  return `n_${Date.now().toString(36)}_${nodeCounter}`
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  workflow: { id: null, name: '未命名工作流' },
  dirty: false,
  saving: false,

  running: false,
  runAbort: false,

  paletteOpen: true,
  libraryOpen: false,
  templatesOpen: false,
  toast: null,

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: s.dirty || changes.some((c) => c.type !== 'select'),
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || changes.some((c) => c.type !== 'select'),
    })),

  onConnect: (conn) => {
    const { nodes, edges } = get()
    const src = nodes.find((n) => n.id === conn.source)
    const tgt = nodes.find((n) => n.id === conn.target)
    if (!src || !tgt) return
    const ok = isConnectionValid(
      { type: src.type as string, handleId: conn.sourceHandle },
      { type: tgt.type as string, handleId: conn.targetHandle },
    )
    if (!ok) {
      get().showToast('error', '端口类型不匹配，无法连接')
      return
    }
    // 同一目标输入端口仅保留一条连线
    const filtered = edges.filter(
      (e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle),
    )
    const newEdge: Edge = {
      id: `e_${conn.source}_${conn.sourceHandle}_${conn.target}_${conn.targetHandle}`,
      source: conn.source,
      sourceHandle: conn.sourceHandle,
      target: conn.target,
      targetHandle: conn.targetHandle,
      type: 'canvas',
    }
    set({ edges: addEdge(newEdge, filtered), dirty: true })
  },

  addNode: (type, position) => {
    const spec = NODE_SPECS[type]
    if (!spec) return ''
    const count = get().nodes.filter((n) => n.type === type).length + 1
    const id = makeId()
    const node: Node<CanvasNodeData> = {
      id,
      type,
      position,
      data: createNodeData(type),
      // selected: true,
    }
    set((s) => ({
      nodes: [...s.nodes, node],
      dirty: true,
      selectedNodeId: id,
    }))
    return id
  },

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      dirty: true,
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    })),

  duplicateNode: (id) => {
    const src = get().nodes.find((n) => n.id === id)
    if (!src) return
    const newId = makeId()
    const copy: Node<CanvasNodeData> = {
      ...src,
      id: newId,
      position: { x: src.position.x + 48, y: src.position.y + 48 },
      selected: false,
      data: {
        ...structuredClone(src.data),
        runState: 'idle',
        outputs: {},
        error: undefined,
        progress: 0,
      },
    }
    set((s) => ({ nodes: [...s.nodes, copy], dirty: true }))
  },

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n
        const p = typeof patch === 'function' ? patch(n.data) : patch
        return { ...n, data: { ...n.data, ...p } }
      }),
      dirty: true,
    })),

  updateNodeParam: (id, key, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                params: { ...n.data.params, [key]: value },
              },
            }
          : n,
      ),
      dirty: true,
    })),

  setNodeRunState: (id, state, extra) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, runState: state, ...extra } }
          : n,
      ),
    })),

  setNodeOutput: (id, handleId, output) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                outputs: { ...n.data.outputs, [handleId]: output },
              },
            }
          : n,
      ),
    })),

  clearAllRunStates: () =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          runState: 'idle' as RunState,
          progress: 0,
          stage: undefined,
          error: undefined,
        },
      })),
    })),

  setEdges: (edges) => set({ edges, dirty: true }),

  setWorkflow: (meta) =>
    set((s) => ({ workflow: { ...s.workflow, ...meta }, dirty: true })),

  loadGraph: (graph, meta) =>
    set((s) => ({
      nodes: graph.nodes ?? [],
      edges: graph.edges ?? [],
      workflow: meta ? { ...s.workflow, ...meta } : s.workflow,
      dirty: false,
      running: false,
    })),

  markSaved: (id, updatedAt) =>
    set((s) => ({
      workflow: { ...s.workflow, id, updatedAt },
      dirty: false,
      saving: false,
    })),

  setSaving: (v) => set({ saving: v }),
  setDirty: (v) => set({ dirty: v }),

  setRunning: (v) => set({ running: v, runAbort: v ? false : get().runAbort }),
  requestRunAbort: () => set({ runAbort: true }),

  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setLibraryOpen: (v) => set({ libraryOpen: v }),
  setTemplatesOpen: (v) => set({ templatesOpen: v }),
  showToast: (type, message) => set({ toast: { type, message } }),
  clearToast: () => set({ toast: null }),
}))
