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
  GROUP_COLORS,
} from './types'

let nodeCounter = 0
let groupCounter = 0

export interface WorkflowMeta {
  id: string | null
  name: string
  updatedAt?: string
}

/** 节点分组（视觉框，成员仍可独立拖动；拖动分组框则整体平移） */
export interface CanvasGroup {
  id: string
  name: string
  color: string
  nodeIds: string[]
  /** 折叠状态：成员节点隐藏，分组框收起为单卡片 */
  collapsed?: boolean
}

interface HistoryEntry {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  groups: CanvasGroup[]
}

const HISTORY_LIMIT = 60

/**
 * 移除类提交合并元数据：
 * React Flow 删除元素时会在同一同步任务内先派发连线移除、再派发节点移除，
 * 两次移除必须共享同一份「删除前」快照，否则撤销会出现中间态。
 */
const lastRemovalCommit = { at: 0, active: false }

interface GraphPayload {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  groups?: CanvasGroup[]
}

export interface CanvasStore {
  /* 画布数据 */
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  groups: CanvasGroup[]
  selectedGroupId: string | null
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
  assetsOpen: boolean
  historyOpen: boolean
  settingsOpen: boolean
  snapToGrid: boolean
  toast: { type: 'success' | 'error' | 'info'; message: string } | null
  /* 拖拽对齐参考线（瞬态，不入撤销栈/持久化）：flow 坐标下的对齐线位置 */
  guides: { vertical: number[]; horizontal: number[] }
  /* 分组成员拖拽预览提示（瞬态）：拖拽节点悬停在分组框上时的高亮提示 */
  groupDragHint: { groupId: string; action: 'add' | 'remove' } | null

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
  /* 分组 */
  createGroupFromSelection: () => string | null
  /** 拖拽同步成员：节点拖入分组框→加入，拖出→移出；返回变更摘要（供 toast） */
  syncGroupMemberships: (nodeIds: string[]) => { added: number; removed: number } | null
  /** 拖拽中实时计算成员关系预览（不落库） */
  computeGroupDragHint: (
    nodeIds: string[],
  ) => { groupId: string; action: 'add' | 'remove' } | null
  renameGroup: (id: string, name: string) => void
  setGroupColor: (id: string, color: string) => void
  toggleGroupCollapse: (id: string) => void
  setGroupCollapsed: (id: string, collapsed: boolean, options?: { silent?: boolean }) => void
  ungroup: (id: string) => void
  deleteGroupAndNodes: (id: string) => void
  translateNodesTo: (
    starts: Record<string, { x: number; y: number }>,
    delta: { x: number; y: number },
  ) => void
  setSelectedGroupId: (id: string | null) => void
  updateNodeData: (
    id: string,
    patch: Partial<CanvasNodeData> | ((d: CanvasNodeData) => Partial<CanvasNodeData>),
    options?: { dirty?: boolean },
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
  loadGraph: (graph: GraphPayload, meta?: Partial<WorkflowMeta>) => void
  markSaved: (id: string, updatedAt?: string) => void
  setSaving: (v: boolean) => void
  setDirty: (v: boolean) => void

  setRunning: (v: boolean) => void
  requestRunAbort: () => void

  setPaletteOpen: (v: boolean) => void
  setLibraryOpen: (v: boolean) => void
  setTemplatesOpen: (v: boolean) => void
  setAssetsOpen: (v: boolean) => void
  setHistoryOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setSnapToGrid: (v: boolean) => void
  setGuides: (g: { vertical: number[]; horizontal: number[] } | null) => void
  setGroupDragHint: (h: { groupId: string; action: 'add' | 'remove' } | null) => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  clearToast: () => void
}

function makeId() {
  nodeCounter += 1
  return `n_${Date.now().toString(36)}_${nodeCounter}`
}

/* ---------- 分组成员几何规划（syncGroupMemberships / computeGroupDragHint 共用） ---------- */

/** 框体相对成员包围盒的外边距（与 group-layer.tsx 的 PAD_* 常量保持一致，改动需双方同步） */
const PLAN_PAD_X = 28
const PLAN_PAD_TOP = 44
const PLAN_PAD_BOTTOM = 28

interface MembershipPlan {
  addMap: Map<string, string[]>
  removeMap: Map<string, string[]>
}

/**
 * 计算把 nodeIds 拖到当前位置后的成员关系变更计划：
 * - 落点中心落入某展开分组框 → 加入
 * - 已是成员但落点在框外 → 移出
 * 关键：分组包围盒排除全部被拖拽节点（残余成员定义框体），否则无法检测「拖出」
 */
function planGroupMembership(
  nodes: Node<CanvasNodeData>[],
  groups: CanvasGroup[],
  nodeIds: string[],
): MembershipPlan | null {
  const expanded = groups.filter((g) => !g.collapsed)
  if (expanded.length === 0) return null

  const sizeOf = (n: Node<CanvasNodeData>) => ({
    w: n.measured?.width ?? NODE_SPECS[n.type ?? '']?.width ?? 280,
    h: n.measured?.height ?? 120,
  })

  const draggedSet = new Set(nodeIds)

  const boundsList = expanded
    .map((g) => {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of g.nodeIds) {
        // 排除被拖拽节点：残余成员定义框体，拖出的节点才能判定为框外
        if (draggedSet.has(id)) continue
        const n = nodes.find((x) => x.id === id)
        if (!n) continue
        const { w, h } = sizeOf(n)
        minX = Math.min(minX, n.position.x)
        minY = Math.min(minY, n.position.y)
        maxX = Math.max(maxX, n.position.x + w)
        maxY = Math.max(maxY, n.position.y + h)
      }
      if (minX === Infinity) return null
      return {
        g,
        x1: minX - PLAN_PAD_X,
        y1: minY - PLAN_PAD_TOP,
        x2: maxX + PLAN_PAD_X,
        y2: maxY + PLAN_PAD_BOTTOM,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  // boundsList 可能为空（如分组仅剩被拖节点）：
  // 此时被拖成员的中心不命中任何框 → 判定为拖出，分组随之解散

  const addMap = new Map<string, string[]>()
  const removeMap = new Map<string, string[]>()
  let changed = false

  for (const id of nodeIds) {
    const n = nodes.find((x) => x.id === id)
    if (!n || n.hidden) continue
    const { w, h } = sizeOf(n)
    const cx = n.position.x + w / 2
    const cy = n.position.y + h / 2
    const currentGroup = groups.find((g) => g.nodeIds.includes(id))
    // 命中的分组取面积最小者（避免嵌套大框抢占）
    const hit = boundsList
      .filter((b) => cx >= b.x1 && cx <= b.x2 && cy >= b.y1 && cy <= b.y2)
      .sort(
        (a, b) =>
          (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1),
      )[0]
    const targetId = hit?.g.id ?? null
    if (targetId === currentGroup?.id) continue
    changed = true
    if (currentGroup) {
      const arr = removeMap.get(currentGroup.id) ?? []
      arr.push(id)
      removeMap.set(currentGroup.id, arr)
    }
    if (targetId) {
      const arr = addMap.get(targetId) ?? []
      arr.push(id)
      addMap.set(targetId, arr)
    }
  }
  if (!changed) return null
  return { addMap, removeMap }
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  groups: [],
  selectedGroupId: null,
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
  assetsOpen: false,
  historyOpen: false,
  settingsOpen: false,
  snapToGrid: false,
  toast: null,
  guides: { vertical: [], horizontal: [] },
  groupDragHint: null,

  /* 结构性变更前调用：快照当前状态入历史栈 */
  commit: () => {
    lastRemovalCommit.active = false
    set((s) => ({
      past: [
        ...s.past.slice(-(HISTORY_LIMIT - 1)),
        {
          nodes: structuredClone(s.nodes),
          edges: structuredClone(s.edges),
          groups: structuredClone(s.groups),
        },
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
    const { past, future, nodes, edges, groups } = get()
    if (past.length === 0) return
    lastRemovalCommit.active = false
    const prev = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [
        ...future.slice(-(HISTORY_LIMIT - 1)),
        { nodes, edges, groups },
      ],
      nodes: prev.nodes,
      edges: prev.edges,
      groups: prev.groups,
      dirty: true,
    })
  },

  redo: () => {
    const { past, future, nodes, edges, groups } = get()
    if (future.length === 0) return
    lastRemovalCommit.active = false
    const next = future[future.length - 1]
    set({
      future: future.slice(0, -1),
      past: [
        ...past.slice(-(HISTORY_LIMIT - 1)),
        { nodes, edges, groups },
      ],
      nodes: next.nodes,
      edges: next.edges,
      groups: next.groups,
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
      // dimensions（首渲染测量）与 select 不属于用户编辑，不应触发自动保存，
      // 否则会产生「打开工作流即自动保存」的回归（每次刷新都 PUT + attach）
      dirty:
        s.dirty ||
        changes.some((c) => c.type !== 'select' && c.type !== 'dimensions'),
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
      src.data,
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
      // 同步清理分组中的空成员引用
      groups: s.groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((nid) => nid !== id) }))
        .filter((g) => g.nodeIds.length > 0),
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

  /**
   * options.dirty = false 时为「静默更新」：
   * 运行输出回写 / 打开工作流时的传播属于状态恢复而非用户编辑，
   * 不应触发自动保存（否则会产生"打开即保存"，与其他工作流切换叠加时会覆盖数据）
   */
  updateNodeData: (id, patch, options) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n
        const p = typeof patch === 'function' ? patch(n.data) : patch
        return { ...n, data: { ...n.data, ...p } }
      }),
      dirty: options?.dirty === false ? s.dirty : true,
    })),

  updateNodeParam: (id, key, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n
        const params = { ...n.data.params, [key]: value }
        // 素材引用节点切换类型时清空输出（旧输出类型已不匹配）
        const assetReset: Partial<CanvasNodeData> =
          n.type === 'asset' && key === 'assetKind'
            ? { outputs: {}, runState: 'idle' as RunState, stage: undefined, progress: 0 }
            : {}
        return {
          ...n,
          data: {
            ...n.data,
            params,
            ...assetReset,
          },
        }
      }),
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

  /* ---------- 分组 ---------- */

  createGroupFromSelection: () => {
    const { nodes, groups } = get()
    const selected = nodes.filter((n) => n.selected)
    if (selected.length < 2) {
      get().showToast('info', '请先框选至少 2 个节点再编组（Shift + 点击多选）')
      return null
    }
    get().commit()
    groupCounter += 1
    const id = `g_${Date.now().toString(36)}_${groupCounter}`
    const group: CanvasGroup = {
      id,
      name: `分组 ${groups.length + 1}`,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length].key,
      nodeIds: selected.map((n) => n.id),
    }
    set({
      groups: [...groups, group],
      selectedGroupId: id,
      dirty: true,
      // 清除成员节点的 RF 选中态：使 Delete 键仅作用于分组（解组），
      // 避免「解组 + 删除成员」同时触发的意外破坏性交互
      nodes: get().nodes.map((n) =>
        group.nodeIds.includes(n.id) ? { ...n, selected: false } : n,
      ),
    })
    get().showToast('success', `已创建「${group.name}」（${selected.length} 个节点）`)
    return id
  },

  renameGroup: (id, name) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      dirty: true,
    })),

  setGroupColor: (id, color) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, color } : g)),
      dirty: true,
    })),

  /** 折叠/展开分组：成员节点同步隐藏/恢复（快照可撤销） */
  toggleGroupCollapse: (id) => {
    const g = get().groups.find((x) => x.id === id)
    if (!g) return
    get().setGroupCollapsed(id, !g.collapsed)
    get().showToast(
      'info',
      g.collapsed ? `已展开「${g.name}」` : `已折叠「${g.name}」，点击卡片可重新展开`,
    )
  },

  setGroupCollapsed: (id, collapsed, options) => {
    const g = get().groups.find((x) => x.id === id)
    if (!g) return
    if (!options?.silent) get().commit()
    const ids = new Set(g.nodeIds)
    set((s) => ({
      groups: s.groups.map((x) =>
        x.id === id ? { ...x, collapsed } : x,
      ),
      nodes: s.nodes.map((n) =>
        ids.has(n.id) ? { ...n, hidden: collapsed } : n,
      ),
      dirty: true,
    }))
  },

  ungroup: (id) => {
    const { groups } = get()
    const g = groups.find((x) => x.id === id)
    if (!g) return
    get().commit()
    const ids = new Set(g.nodeIds)
    set({
      groups: groups.filter((x) => x.id !== id),
      selectedGroupId: null,
      dirty: true,
      // 折叠状态下解组：恢复成员可见性，避免节点“消失”
      nodes: get().nodes.map((n) =>
        ids.has(n.id) ? { ...n, hidden: false } : n,
      ),
    })
  },

  deleteGroupAndNodes: (id) => {
    const { groups } = get()
    const g = groups.find((x) => x.id === id)
    if (!g) return
    get().commit()
    const ids = new Set(g.nodeIds)
    set((s) => ({
      nodes: s.nodes.filter((n) => !ids.has(n.id)),
      edges: s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      groups: s.groups.filter((x) => x.id !== id),
      selectedGroupId: null,
      dirty: true,
    }))
    get().showToast('success', `已删除「${g.name}」及其 ${ids.size} 个节点`)
  },

  /** 分组框拖拽：按拖拽起点 + 偏移量绝对定位成员（无累积漂移） */
  translateNodesTo: (starts, delta) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        const st = starts[n.id]
        return st
          ? { ...n, position: { x: st.x + delta.x, y: st.y + delta.y } }
          : n
      }),
    })),

  setSelectedGroupId: (id) => set({ selectedGroupId: id }),

  /**
   * 拖拽同步分组成员关系：
   * - 节点拖拽落点中心落入某个展开分组框 → 加入该分组
   * - 落点在自身分组框外 → 移出分组；成员不足的分组自动解散
   * 关键：分组包围盒计算时**排除全部被拖拽节点**，
   * 否则包围盒会跟随被拖成员伸展，节点永远在自身分组框内，无法检测「拖出」。
   * 包围盒与 group-layer.tsx 的 PAD_* 常量保持一致（改动需双方同步）
   */
  syncGroupMemberships: (nodeIds) => {
    const { nodes, groups } = get()
    const plan = planGroupMembership(nodes, groups, nodeIds)
    if (!plan) return null

    get().commit()
    let nextGroups = groups.map((g) => ({ ...g, nodeIds: [...g.nodeIds] }))
    plan.removeMap.forEach((ids, gid) => {
      nextGroups = nextGroups.map((g) =>
        g.id === gid ? { ...g, nodeIds: g.nodeIds.filter((x) => !ids.includes(x)) } : g,
      )
    })
    plan.addMap.forEach((ids, gid) => {
      nextGroups = nextGroups.map((g) =>
        g.id === gid ? { ...g, nodeIds: [...g.nodeIds, ...ids] } : g,
      )
    })
    // 解散空分组
    const dissolved = nextGroups.filter((g) => g.nodeIds.length === 0)
    if (dissolved.length > 0) {
      const dissolvedIds = new Set(dissolved.map((g) => g.id))
      nextGroups = nextGroups.filter((g) => g.nodeIds.length > 0)
      if (get().selectedGroupId && dissolvedIds.has(get().selectedGroupId!)) {
        set({ selectedGroupId: null })
      }
    }
    set({ groups: nextGroups, dirty: true })

    const added = [...plan.addMap.values()].reduce((a, b) => a + b.length, 0)
    const removed = [...plan.removeMap.values()].reduce((a, b) => a + b.length, 0)
    const parts: string[] = []
    plan.addMap.forEach((ids, gid) => {
      const g = nextGroups.find((x) => x.id === gid)
      if (g) parts.push(`${ids.length} 个节点加入「${g.name}」`)
    })
    plan.removeMap.forEach((ids, gid) => {
      const g = nextGroups.find((x) => x.id === gid)
      if (g) parts.push(`${ids.length} 个节点移出「${g.name}」`)
    })
    if (dissolved.length > 0) {
      parts.push(
        dissolved.length === 1 ? `「${dissolved[0].name}」已解散` : `${dissolved.length} 个空分组已解散`,
      )
    }
    if (parts.length > 0) get().showToast('success', parts.join('，'))
    return { added, removed }
  },

  /** 拖拽中实时预览：拖拽节点对分组框的加入/移出提示（与 syncGroupMemberships 同一几何规划） */
  computeGroupDragHint: (nodeIds) => {
    const { nodes, groups } = get()
    const plan = planGroupMembership(nodes, groups, nodeIds)
    if (!plan) return null
    /* 多分组同时命中时取变更节点数最多者（拖拽提示一次只强调一个框体） */
    let best: { groupId: string; action: 'add' | 'remove'; weight: number } | null = null
    plan.addMap.forEach((ids, gid) => {
      if (!best || ids.length > best.weight) best = { groupId: gid, action: 'add', weight: ids.length }
    })
    plan.removeMap.forEach((ids, gid) => {
      const w = ids.length + 0.5 // 移出（可能伴随解散）稍优先展示
      if (!best || w > best.weight) best = { groupId: gid, action: 'remove', weight: w }
    })
    return best ? { groupId: best.groupId, action: best.action } : null
  },

  setEdges: (edges) => set({ edges, dirty: true }),

  setWorkflow: (meta) =>
    set((s) => ({ workflow: { ...s.workflow, ...meta }, dirty: true })),

  loadGraph: (graph, meta) => {
    const groups = graph.groups ?? []
    // 恢复折叠状态：折叠组的成员节点载入即隐藏
    const collapsedIds = new Set(
      groups.filter((g) => g.collapsed).flatMap((g) => g.nodeIds),
    )
    set((s) => ({
      nodes: collapsedIds.size
        ? (graph.nodes ?? []).map((n) =>
            collapsedIds.has(n.id) ? { ...n, hidden: true } : n,
          )
        : graph.nodes ?? [],
      edges: graph.edges ?? [],
      groups,
      selectedGroupId: null,
      past: [],
      future: [],
      clipboard: null,
      workflow: meta ? { ...s.workflow, ...meta } : s.workflow,
      dirty: false,
      running: false,
    }))
  },

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
  setAssetsOpen: (v) => set({ assetsOpen: v }),
  setHistoryOpen: (v) => set({ historyOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  setGuides: (g) =>
    set({ guides: g ?? { vertical: [], horizontal: [] } }),
  setGroupDragHint: (h) => {
    const prev = get().groupDragHint
    /* 值未变化时跳过 set，避免拖拽中高频触发重渲染 */
    if (prev?.groupId === h?.groupId && prev?.action === h?.action) return
    set({ groupDragHint: h })
  },
  showToast: (type, message) => set({ toast: { type, message } }),
  clearToast: () => set({ toast: null }),
}))

/* 开发/自动化测试调试句柄（不影响生产逻辑） */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__canvasStore = useCanvasStore
}
