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

interface HistoryEntry {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
}

const HISTORY_LIMIT = 60

/**
 * 移除类提交合并元数据：
 * React Flow 删除元素时会在同一同步任务内先派发连线移除、再派发节点移除，
 * 两次移除必须共享同一份「删除前」快照，否则撤销会出现中间态。
 */
const lastRemovalCommit = { at: 0, active: false }

export interface CanvasStore {
  /* 画布数据 */
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null

  /* 历史（撤销/重做） */
  past: HistoryEntry[]
  future: HistoryEntry[]
  /* 剪贴板（复制/粘贴） */
  clipboard: { nodes: Node<CanvasNodeData>[]; edges: Edge[] } | null

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
  snapToGrid: boolean
  toast: { type: 'success' | 'error' | 'info'; message: string } | null

  /* ---- actions ---- */
  onNodesChange: (changes: NodeChange<Node<CanvasNodeData>>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  commit: () => void
  commitRemoval: () => void
  undo: () => void
  redo: () => void
  copySelection: () => boolean
  pasteClipboard: () => void

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
  setSnapToGrid: (v: boolean) => void
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

  past: [],
  future: [],
  clipboard: null,

  workflow: { id: null, name: '未命名工作流' },
  dirty: false,
  saving: false,

  running: false,
  runAbort: false,

  paletteOpen: true,
  libraryOpen: false,
  templatesOpen: false,
  snapToGrid: false,
  toast: null,

  /* 结构性变更前调用：快照当前状态入历史栈 */
  commit: () => {
    lastRemovalCommit.active = false
    set((s) => ({
      past: [
        ...s.past.slice(-(HISTORY_LIMIT - 1)),
        { nodes: structuredClone(s.nodes), edges: structuredClone(s.edges) },
      ],
      future: [],
    }))
  },

  /* 移除类操作专用提交：同一移除批次（同步任务内）仅保留首份快照 */
  commitRemoval: () => {
    const now = Date.now()
    if (lastRemovalCommit.active && now - lastRemovalCommit.at < 200) {
      // 连续移除（连线 + 节点）：沿用第一份快照，避免撤销出现中间态
      lastRemovalCommit.at = now
      return
    }
    lastRemovalCommit.at = now
    lastRemovalCommit.active = true
    get().commit()
    lastRemovalCommit.active = true // commit() 会重置标记，恢复它
  },

  undo: () => {
    const { past, future, nodes, edges } = get()
    if (past.length === 0) return
    lastRemovalCommit.active = false
    const prev = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [...future.slice(-(HISTORY_LIMIT - 1)), { nodes, edges }],
      nodes: prev.nodes,
      edges: prev.edges,
      dirty: true,
    })
  },

  redo: () => {
    const { past, future, nodes, edges } = get()
    if (future.length === 0) return
    lastRemovalCommit.active = false
    const next = future[future.length - 1]
    set({
      future: future.slice(0, -1),
      past: [...past.slice(-(HISTORY_LIMIT - 1)), { nodes, edges }],
      nodes: next.nodes,
      edges: next.edges,
      dirty: true,
    })
  },

  copySelection: () => {
    const { nodes, edges } = get()
    const selected = nodes.filter((n) => n.selected)
    if (selected.length === 0) return false
    const ids = new Set(selected.map((n) => n.id))
    const innerEdges = edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    )
    set({
      clipboard: {
        nodes: structuredClone(selected),
        edges: structuredClone(innerEdges),
      },
    })
    return true
  },

  pasteClipboard: () => {
    const { clipboard, commit, nodes, edges } = get()
    if (!clipboard || clipboard.nodes.length === 0) return
    commit()
    const idMap = new Map<string, string>()
    clipboard.nodes.forEach((n) => idMap.set(n.id, makeId()))
    const OFFSET = 56
    const newNodes = clipboard.nodes.map((n) => ({
      ...structuredClone(n),
      id: idMap.get(n.id)!,
      selected: true,
      position: {
        x: n.position.x + OFFSET,
        y: n.position.y + OFFSET,
      },
      data: {
        ...structuredClone(n.data),
        runState: 'idle' as const,
        progress: 0,
        error: undefined,
        stage: undefined,
      },
    }))
    const newEdges = clipboard.edges.map((e) => ({
      ...structuredClone(e),
      id: `e_${idMap.get(e.source)}_${e.sourceHandle ?? ''}_${idMap.get(e.target)}_${e.targetHandle ?? ''}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      selected: false,
    }))
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...edges.map((e) => ({ ...e, selected: false })), ...newEdges],
      dirty: true,
    })
    useCanvasStore.getState().showToast('success', `已粘贴 ${newNodes.length} 个节点`)
  },

  onNodesChange: (changes) => {
    const removals = changes.filter(
      (c) => c.type === 'remove',
    )
    if (removals.length > 0) {
      // 节点删除与其悬挂连线清理必须原子化（单次快照），
      // React Flow 会先派发连线移除再派发节点移除，用 commitRemoval 合并同一批次
      get().commitRemoval()
      set((s) => {
        const remainingNodes = applyNodeChanges(changes, s.nodes)
        const removedIds = new Set(removals.map((c) => c.id))
        const remainingEdges = s.edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        )
        return {
          nodes: remainingNodes,
          edges: remainingEdges,
          dirty: true,
          selectedNodeId:
            removedIds.has(s.selectedNodeId ?? '') ? null : s.selectedNodeId,
        }
      })
      return
    }
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: s.dirty || changes.some((c) => c.type !== 'select'),
    }))
  },

  onEdgesChange: (changes) => {
    const removals = changes.filter((c) => c.type === 'remove')
    if (removals.length > 0) {
      const removedIds = new Set(removals.map((c) => c.id))
      const actuallyRemoved = get().edges.some((e) => removedIds.has(e.id))
      if (!actuallyRemoved) {
        // 连线已随节点删除被清理：忽略冗余 remove，避免产生多余历史快照
        const others = changes.filter((c) => c.type !== 'remove')
        if (others.length === 0) return
        set((s) => ({ edges: applyEdgeChanges(others, s.edges) }))
        return
      }
      get().commitRemoval()
      set((s) => ({
        edges: applyEdgeChanges(changes, s.edges),
        dirty: true,
      }))
      return
    }
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || changes.some((c) => c.type !== 'select'),
    }))
  },

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
    get().commit()
    set({ edges: addEdge(newEdge, filtered), dirty: true })
  },

  addNode: (type, position) => {
    const spec = NODE_SPECS[type]
    if (!spec) return ''
    const id = makeId()
    const node: Node<CanvasNodeData> = {
      id,
      type,
      position,
      data: createNodeData(type),
      // selected: true,
    }
    get().commit()
    set((s) => ({
      nodes: [...s.nodes, node],
      dirty: true,
      selectedNodeId: id,
    }))
    return id
  },

  removeNode: (id) => {
    get().commit()
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      dirty: true,
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
  },

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
    get().commit()
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
      past: [],
      future: [],
      clipboard: null,
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
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  showToast: (type, message) => set({ toast: { type, message } }),
  clearToast: () => set({ toast: null }),
}))

/* 开发/自动化测试调试句柄（不影响生产逻辑） */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__canvasStore = useCanvasStore
}
