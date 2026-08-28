'use client'

/**
 * AI 视频创作画布 —— 主编辑器
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Sparkles,
  MousePointer2,
  Play,
  Copy,
  Trash2,
  Wand2,
  Maximize,
  Layers,
  Grid3x3,
  Boxes,
  Pencil,
  Ungroup as UngroupIcon,
  ChevronsLeft,
  ChevronsRight,
  FoldVertical,
  PanelRight,
  FolderInput,
  FolderMinus,
  AlignStartVertical,
  AlignStartHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  AlignHorizontalJustifyCenter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Node } from '@xyflow/react'
import {
  isConnectionValid,
  NODE_SPECS,
  NODE_TYPE_LIST,
  GROUP_COLORS,
  getGroupColor,
  type CanvasNodeData,
} from '@/lib/ai-canvas/types'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { runNode, runWorkflow, runGroup, runSelected } from '@/lib/ai-canvas/executor'
import { saveWorkflow, openWorkflow } from '@/lib/ai-canvas/persistence'
import { getAccent } from './nodes/accents'
import { GraphNode } from './nodes/graph-node'
import { CanvasEdge } from './canvas-edge'
import { TopBar } from './topbar'
import { Palette } from './palette'
import { Inspector } from './inspector'
import { LibraryDialog } from './library-dialog'
import { TemplatesDialog } from './templates-dialog'
import { AssetsDialog } from './assets-dialog'
import { HistoryDialog } from './history-dialog'
import { SettingsDialog } from './settings-dialog'
import { GroupLayer } from './group-layer'
import { AlignmentGuides } from './alignment-guides'

const nodeTypes: NodeTypes = Object.fromEntries(
  NODE_TYPE_LIST.map((s) => [s.type, GraphNode]),
)
const edgeTypes: EdgeTypes = { canvas: CanvasEdge }

interface MenuState {
  screen: { x: number; y: number }
  flow: { x: number; y: number }
  nodeId?: string
  groupId?: string
}

function StatusBar() {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const groups = useCanvasStore((s) => s.groups)
  const running = useCanvasStore((s) => s.running)
  const snapToGrid = useCanvasStore((s) => s.snapToGrid)
  const setSnapToGrid = useCanvasStore((s) => s.setSnapToGrid)
  const zoom = useStore((s) => s.transform[2])
  const { fitView } = useReactFlow()
  const successCount = nodes.filter((n) => n.data.runState === 'success').length
  const runningCount = nodes.filter((n) => n.data.runState === 'running').length
  const selectedCount = nodes.filter((n) => n.selected).length

  return (
    <footer className="mt-auto flex h-7 shrink-0 items-center gap-4 border-t border-zinc-800/80 bg-zinc-950/95 px-4 text-[10px] text-zinc-500 backdrop-blur">
      <span className="flex items-center gap-1.5">
        <Layers className="h-3 w-3" />
        {nodes.length} 节点 · {edges.length} 连线
        {groups.length > 0 && <span className="text-zinc-400"> · {groups.length} 分组</span>}
      </span>
      {selectedCount > 0 && (
        <span className="hidden text-zinc-400 sm:inline">已选 {selectedCount} 项</span>
      )}
      {running && (
        <span className="flex items-center gap-1.5 text-amber-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          <span className="hidden sm:inline">
            工作流运行中…{runningCount > 0 ? `（${runningCount} 个节点）` : ''}
          </span>
        </span>
      )}
      {!running && successCount > 0 && (
        <span className="hidden text-emerald-400/80 sm:inline">✓ {successCount} 个节点已就绪</span>
      )}
      <span className="ml-auto hidden sm:inline">
        拖入节点 → 连线 → 点击「运行」生成 AI 视频
      </span>
      <button
        onClick={() => setSnapToGrid(!snapToGrid)}
        className={cn(
          'flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-800',
          snapToGrid ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-300',
        )}
        title="网格吸附（拖动节点时对齐 16px 网格）"
      >
        <Grid3x3 className="h-3 w-3" />
        <span className="hidden lg:inline">网格吸附</span>
      </button>
      <button
        onClick={() => void fitView({ duration: 400, padding: 0.15 })}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-zinc-300"
        title="适应视图"
      >
        <Maximize className="h-3 w-3" />
        <span className="hidden sm:inline">适应视图</span>
      </button>
      <button
        onClick={() => autoLayout()}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-zinc-300"
        title="自动整理布局"
      >
        <Wand2 className="h-3 w-3" />
        <span className="hidden sm:inline">整理布局</span>
      </button>
      <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
    </footer>
  )
}

/** 自动分层布局 */
function autoLayout() {
  const { nodes, edges } = useCanvasStore.getState()
  if (nodes.length === 0) return
  const depth: Record<string, number> = {}
  nodes.forEach((n) => (depth[n.id] = 0))
  for (let i = 0; i < nodes.length; i++) {
    edges.forEach((e) => {
      depth[e.target] = Math.max(depth[e.target] ?? 0, (depth[e.source] ?? 0) + 1)
    })
  }
  const layers = new Map<number, string[]>()
  nodes.forEach((n) => {
    const d = depth[n.id] ?? 0
    layers.set(d, [...(layers.get(d) ?? []), n.id])
  })
  const pos: Record<string, { x: number; y: number }> = {}
  layers.forEach((ids, d) => {
    ids.forEach((id, i) => {
      pos[id] = { x: d * 400, y: i * 280 + 60 }
    })
  })
  useCanvasStore.setState({
    nodes: nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position })),
    dirty: true,
  })
}

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, getZoom } = useReactFlow()
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const snapToGrid = useCanvasStore((s) => s.snapToGrid)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnect = useCanvasStore((s) => s.onConnect)
  const addNode = useCanvasStore((s) => s.addNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const duplicateNode = useCanvasStore((s) => s.duplicateNode)
  const setTemplatesOpen = useCanvasStore((s) => s.setTemplatesOpen)
  const showToast = useCanvasStore((s) => s.showToast)
  const toast = useCanvasStore((s) => s.toast)
  const clearToast = useCanvasStore((s) => s.clearToast)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [nodeDragging, setNodeDragging] = useState(false)
  const selectedNodeCount = useCanvasStore(
    (s) => s.nodes.reduce((acc, n) => acc + (n.selected ? 1 : 0), 0),
  )

  /* ---------- 拖拽添加 ---------- */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/ai-node')
      if (!type || !NODE_SPECS[type]) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const id = addNode(type, position)
      // 落点在分组框内则自动加入该分组（与节点拖拽成员同步同一套几何逻辑）
      if (id) useCanvasStore.getState().syncGroupMemberships([id])
    },
    [screenToFlowPosition, addNode],
  )

  /* ---------- 面板点击添加（画布中央） ---------- */
  useEffect(() => {
    const handler = (e: Event) => {
      const type = (e as CustomEvent<string>).detail
      if (!NODE_SPECS[type]) return
      const rect = wrapper.current?.getBoundingClientRect()
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
      const position = screenToFlowPosition({ x: cx, y: cy })
      position.x += (Math.random() - 0.5) * 80
      position.y += (Math.random() - 0.5) * 60
      const id = addNode(type, position)
      // 画布中央若落在某个分组框内，同样自动入组
      if (id) useCanvasStore.getState().syncGroupMemberships([id])
    }
    window.addEventListener('ai-canvas:add-node', handler)
    return () => window.removeEventListener('ai-canvas:add-node', handler)
  }, [screenToFlowPosition, addNode])

  /* ---------- 素材库：一键插入素材引用节点 ---------- */
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; url: string; name: string }>).detail
      if (!d?.url || !NODE_SPECS.asset) return
      const rect = wrapper.current?.getBoundingClientRect()
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
      const position = screenToFlowPosition({ x: cx, y: cy })
      position.x += (Math.random() - 0.5) * 100
      position.y += (Math.random() - 0.5) * 80
      const store = useCanvasStore.getState()
      const id = store.addNode('asset', position)
      if (!id) return
      store.updateNodeParam(id, 'assetKind', d.kind)
      store.updateNodeParam(id, 'assetUrl', d.url)
      store.updateNodeParam(id, 'assetName', d.name)
      store.updateNodeData(id, { label: d.name || '素材引用' })
      store.setNodeOutput(id, d.kind, {
        kind: d.kind as 'image' | 'video' | 'audio',
        url: d.url,
        meta: { source: 'asset-library' },
      })
      store.setNodeRunState(id, 'success', { stage: '素材就绪', progress: 100 })
      store.showToast('success', `已插入素材「${d.name}」`)
    }
    window.addEventListener('ai-canvas:insert-asset', handler)
    return () => window.removeEventListener('ai-canvas:insert-asset', handler)
  }, [screenToFlowPosition])

  /* ---------- 首次进入：自动载入最近作品 ---------- */
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/workflows', { cache: 'no-store' })
        const j = await res.json()
        if (j.items?.length > 0) {
          await openWorkflow(j.items[0].id)
        }
      } catch {
        /* 忽略 */
      }
    })()
     
  }, [])

  /* ---------- 自动保存 ---------- */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const unsub = useCanvasStore.subscribe((s, prev) => {
      if (s.dirty && !prev?.dirty && s.workflow.id) {
        // 捕获发起时刻的工作流 id：若到点时画布已切换为其他工作流，
        // 绝不能用旧 id 保存新内容（会造成数据覆盖），直接放弃本次自动保存
        const capturedId = s.workflow.id
        clearTimeout(timer)
        timer = setTimeout(() => {
          const st = useCanvasStore.getState()
          if (
            st.dirty &&
            !st.running &&
            st.workflow.id &&
            st.workflow.id === capturedId
          ) {
            void saveWorkflow()
          }
        }, 1800)
      }
    })
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  /* ---------- 快捷键 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (meta && e.key === 's') {
        e.preventDefault()
        void saveWorkflow()
        return
      }
      if (meta && e.key === 'Enter') {
        e.preventDefault()
        void runWorkflow()
        return
      }
      if (typing) return
      const store = useCanvasStore.getState()
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        store.undo()
      } else if (
        ((meta && e.shiftKey && e.key.toLowerCase() === 'z') ||
          (meta && e.key.toLowerCase() === 'y'))
      ) {
        e.preventDefault()
        store.redo()
      } else if (meta && e.key.toLowerCase() === 'c') {
        store.copySelection()
      } else if (meta && e.key.toLowerCase() === 'v') {
        store.pasteClipboard()
      } else if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+G：解组当前选中分组（或包含所选节点的分组）
          const st = useCanvasStore.getState()
          let gid = st.selectedGroupId
          if (!gid) {
            const selectedIds = new Set(st.nodes.filter((n) => n.selected).map((n) => n.id))
            const hit = st.groups.find((g) => g.nodeIds.some((id) => selectedIds.has(id)))
            gid = hit?.id ?? null
          }
          if (gid) {
            st.ungroup(gid)
          } else {
            st.showToast('info', '请先选中一个分组再解组')
          }
        } else {
          store.createGroupFromSelection()
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 分组框选中时 Delete = 解组（保留节点）；节点选中时交由 React Flow 删除
        const st = useCanvasStore.getState()
        if (st.selectedGroupId) {
          e.preventDefault()
          st.ungroup(st.selectedGroupId)
          return
        }
      }
      if (e.key === 'Escape') {
        setMenu(null)
        useCanvasStore.getState().setSelectedGroupId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---------- Toast ---------- */
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 3200)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  /* ---------- 右键菜单 ---------- */
  const openPaneMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault()
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setMenu({ screen: { x: e.clientX, y: e.clientY }, flow: position })
    },
    [screenToFlowPosition],
  )

  const openGroupMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      setMenu({
        screen: { x: e.clientX, y: e.clientY },
        flow: { x: 0, y: 0 },
        groupId,
      })
    },
    [],
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  /* ---------- 拖拽对齐参考线（Smart Alignment Guides） ---------- */
  /**
   * 拖动节点时与其他节点的左/中/右、上/中/下边缘比对：
   * 屏幕距离阈值 6px 内吸附到精确对齐，并显示虚线参考线。
   * 多选拖拽 / 隐藏节点（折叠分组成员）不参与。
   */
  const ALIGN_THRESHOLD_SCREEN = 6
  const applyAlignment = useCallback(
    (dragged: Node<CanvasNodeData>, all: Node<CanvasNodeData>[]) => {
      const zoom = getZoom()
      const threshold = ALIGN_THRESHOLD_SCREEN / zoom
      const dw = dragged.measured?.width ?? 0
      const dh = dragged.measured?.height ?? 0
      const dxs = [dragged.position.x, dragged.position.x + dw / 2, dragged.position.x + dw]
      const dys = [dragged.position.y, dragged.position.y + dh / 2, dragged.position.y + dh]

      let bestV: { diff: number; line: number } | null = null
      let bestH: { diff: number; line: number } | null = null

      for (const other of all) {
        if (other.id === dragged.id || other.hidden) continue
        const ow = other.measured?.width ?? 0
        const oh = other.measured?.height ?? 0
        const oxs = [other.position.x, other.position.x + ow / 2, other.position.x + ow]
        const oys = [other.position.y, other.position.y + oh / 2, other.position.y + oh]
        for (const dx of dxs) {
          for (const ox of oxs) {
            const diff = ox - dx
            if (
              Math.abs(diff) <= threshold &&
              (!bestV || Math.abs(diff) < Math.abs(bestV.diff))
            ) {
              bestV = { diff, line: ox }
            }
          }
        }
        for (const dy of dys) {
          for (const oy of oys) {
            const diff = oy - dy
            if (
              Math.abs(diff) <= threshold &&
              (!bestH || Math.abs(diff) < Math.abs(bestH.diff))
            ) {
              bestH = { diff, line: oy }
            }
          }
        }
      }

      const snapX = bestV?.diff ?? 0
      const snapY = bestH?.diff ?? 0
      if (snapX !== 0 || snapY !== 0) {
        onNodesChange([
          {
            id: dragged.id,
            type: 'position',
            position: { x: dragged.position.x + snapX, y: dragged.position.y + snapY },
          },
        ])
      }
      useCanvasStore.getState().setGuides({
        vertical: bestV ? [bestV.line] : [],
        horizontal: bestH ? [bestH.line] : [],
      })
    },
    [getZoom, onNodesChange],
  )

  const onNodeDrag = useCallback(
    (_e: unknown, dragged: Node<CanvasNodeData>, draggedNodes: Node<CanvasNodeData>[]) => {
      const store = useCanvasStore.getState()
      const ids = (draggedNodes as { id: string }[]).map((n) => n.id)
      /* 分组成员拖拽预览：悬停命中分组框时实时高亮（多选拖拽也生效） */
      store.setGroupDragHint(ids.length > 0 ? store.computeGroupDragHint(ids) : null)
      if (draggedNodes.length !== 1) {
        store.setGuides(null)
        return
      }
      applyAlignment(dragged, useCanvasStore.getState().nodes)
    },
    [applyAlignment],
  )

  /* ---------- 连线校验 ---------- */
  const isValidConnection = useCallback(
    (conn: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null }) => {
      const src = useCanvasStore.getState().nodes.find((n) => n.id === conn.source)
      const tgt = useCanvasStore.getState().nodes.find((n) => n.id === conn.target)
      if (!src || !tgt || src.id === tgt.id) return false
      return isConnectionValid(
        { type: src.type as string, handleId: conn.sourceHandle },
        { type: tgt.type as string, handleId: conn.targetHandle },
        src.data,
      )
    },
    [],
  )

  return (
    <div className="dark flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <Palette />
        <div ref={wrapper} className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow<CanvasNodeData>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            snapToGrid={snapToGrid}
            snapGrid={[16, 16]}
            onBeforeDelete={async ({ nodes: delNodes }) => {
              if (delNodes.length > 1) {
                return window.confirm(
                  `确定删除选中的 ${delNodes.length} 个节点及其连线？`,
                )
              }
              return true
            }}
            onPaneContextMenu={openPaneMenu}
            onPaneClick={(e) => {
              closeMenu()
              useCanvasStore.getState().setSelectedGroupId(null)
            }}
            onMoveStart={closeMenu}
            onNodeClick={() => useCanvasStore.getState().setSelectedGroupId(null)}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              setMenu({
                screen: { x: e.clientX, y: e.clientY },
                flow: node.position,
                nodeId: node.id,
              })
            }}
            onNodeDragStart={() => {
              closeMenu()
              setNodeDragging(true)
            }}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={(_e, node, draggedNodes) => {
              setNodeDragging(false)
              // 单节点拖拽：落点最终吸附（防止 mouseup 原始位置覆盖拖拽中的吸附）
              if ((draggedNodes as unknown[]).length === 1) {
                applyAlignment(node, useCanvasStore.getState().nodes)
              }
              // 清除对齐参考线
              useCanvasStore.getState().setGuides(null)
              // 清除分组成员拖拽预览
              useCanvasStore.getState().setGroupDragHint(null)
              // 拖拽落点同步分组成员关系（拖入分组框=加入，拖出=移出）
              const ids = (draggedNodes as { id: string }[]).map((n) => n.id)
              if (ids.length > 0) {
                useCanvasStore.getState().syncGroupMemberships(ids)
              }
            }}
            defaultEdgeOptions={{ type: 'canvas' }}
            deleteKeyCode={['Delete', 'Backspace']}
            multiSelectionKeyCode={['Shift', 'Meta']}
            selectionOnDrag
            panOnDrag={[1, 2]}
            panOnScroll
            zoomOnDoubleClick={false}
            colorMode="dark"
            minZoom={0.2}
            maxZoom={2.2}
            proOptions={{ hideAttribution: false }}
            className="canvas-bg"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.4}
              color="#3f3f46"
              className="opacity-70"
            />
            {/*
              节点分组渲染层：作为 ReactFlow 子元素渲染（z-1 < 视口 z-2），
              框体在节点之下——成员节点可正常拖拽/点选，框体空白区域可拖动整组；
              之前作为外部 overlay（z-1 > 画布 z-0 stacking context）会拦截全部成员节点的鼠标事件
            */}
            <GroupLayer onGroupContextMenu={openGroupMenu} />
            <Controls
              showInteractive={false}
              position="bottom-right"
              className="!mb-10 !shadow-none"
            />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="!mb-10 !mr-14 hidden md:block"
              style={{ width: 168, height: 108, borderRadius: 12 }}
              maskColor="rgba(9,9,11,0.72)"
              nodeColor={(n) => {
                const rs = (n.data as CanvasNodeData | undefined)?.runState
                if (rs === 'running') return '#f59e0b'
                if (rs === 'queued') return '#38bdf8'
                if (rs === 'failed') return '#f43f5e'
                return getAccent(NODE_SPECS[n.type ?? '']?.accent).hex
              }}
              nodeStrokeColor={(n) => {
                const rs = (n.data as CanvasNodeData | undefined)?.runState
                if (rs === 'running') return '#fde68a'
                if (rs === 'failed') return '#fda4af'
                return 'transparent'
              }}
              nodeStrokeWidth={2}
            />
          </ReactFlow>

          {/* 拖拽对齐参考线（overlay，pointer-events-none 不拦截事件） */}
          <AlignmentGuides />

          {/* 多选浮动工具栏（Figma 式：编组 / 运行所选 / 批量加入分组 / 删除） */}
          <MultiSelectToolbar dragging={nodeDragging} />

          {/* 右侧 Inspector 属性面板（选中单个节点时） */}
          <Inspector />

          {/* 空画布引导 */}
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-8 py-8 text-center shadow-2xl backdrop-blur">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/25 to-fuchsia-500/25">
                  <Sparkles className="h-6 w-6 text-amber-300" />
                </span>
                <h3 className="text-[15px] font-semibold text-zinc-100">开始你的 AI 视频创作</h3>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  从左侧节点库拖入「提示词」「文生视频」等节点，
                  <br />
                  连线编排工作流，一键运行生成
                </p>
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="mt-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-[12px] font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(245,158,11,0.7)] transition hover:from-amber-400 hover:to-orange-400"
                >
                  浏览模板快速开始
                </button>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-600">
                  <MousePointer2 className="h-3 w-3" />
                  也可以在画布任意处右键添加节点
                </p>
              </div>
            </div>
          )}

          {/* 右键菜单 */}
          {menu && (
            <div
              className="fixed z-50 w-52 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/97 py-1 shadow-2xl backdrop-blur"
              style={{
                left: Math.min(menu.screen.x, window.innerWidth - 220),
                top: Math.min(menu.screen.y, window.innerHeight - 380),
              }}
              onMouseLeave={closeMenu}
            >
              {menu.groupId ? (
                <GroupMenuItems
                  groupId={menu.groupId}
                  closeMenu={closeMenu}
                />
              ) : menu.nodeId ? (
                <NodeMenuItems
                  nodeId={menu.nodeId}
                  closeMenu={closeMenu}
                  batchIds={
                    selectedNodeCount > 1 &&
                    useCanvasStore.getState().nodes.find((n) => n.id === menu.nodeId)?.selected
                      ? useCanvasStore.getState().nodes.filter((n) => n.selected).map((n) => n.id)
                      : []
                  }
                />
              ) : (
                <>
                  {selectedNodeCount >= 2 && (
                    <>
                      <MenuItem
                        icon={<Boxes className="h-3.5 w-3.5 text-sky-300" />}
                        label={`将 ${selectedNodeCount} 个所选节点编组`}
                        onClick={() => {
                          useCanvasStore.getState().createGroupFromSelection()
                          closeMenu()
                        }}
                      />
                      <div className="mx-2 my-1 h-px bg-zinc-800" />
                    </>
                  )}
                  <p className="border-b border-zinc-800 px-3 pb-1.5 pt-1 text-[9px] uppercase tracking-wider text-zinc-600">
                    添加节点
                  </p>
                  <div className="max-h-72 overflow-y-auto scrollbar-thin">
                    {NODE_TYPE_LIST.map((s) => {
                      const accent = getAccent(s.accent)
                      return (
                        <MenuItem
                          key={s.type}
                          icon={
                            <span className={cn('h-2 w-2 rounded-full', accent.solid)} />
                          }
                          label={s.name}
                          onClick={() => {
                            addNode(s.type, menu.flow)
                            closeMenu()
                          }}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div
              className={cn(
                'absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-[12px] shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-300',
                toast.type === 'success' && 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
                toast.type === 'error' && 'border-rose-500/30 bg-rose-500/15 text-rose-200',
                toast.type === 'info' && 'border-zinc-600/40 bg-zinc-800/90 text-zinc-200',
              )}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>
      <StatusBar />
      <LibraryDialog />
      <TemplatesDialog />
      <AssetsDialog />
      <HistoryDialog />
      <SettingsDialog />
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition',
        danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-zinc-300 hover:bg-zinc-800',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * 节点右键菜单：多选批量区（编组/运行所选/批量入组/删除所选） + 单节点区
 * 分组加入/移出直接操作 groups（commit 入撤销栈），与拖拽同步同一套空组自动解散逻辑
 */
function NodeMenuItems({
  nodeId,
  closeMenu,
  batchIds = [],
}: {
  nodeId: string
  closeMenu: () => void
  batchIds?: string[]
}) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId))
  const groups = useCanvasStore((s) => s.groups)
  if (!node) return null
  const spec = NODE_SPECS[node.type ?? '']
  const ownGroup = groups.find((g) => g.nodeIds.includes(nodeId))
  const joinableGroups = groups.filter((g) => g.id !== ownGroup?.id)
  const isBatch = batchIds.length > 1
  const batchJoinable = groups.filter(
    (g) => !batchIds.every((id) => g.nodeIds.includes(id)),
  )

  /** 加入/移出分组：直接变更 nodeIds，空组自动解散（可撤销） */
  const mutateMembership = (target: 'remove' | string) => {
    const st = useCanvasStore.getState()
    st.commit()
    let nextGroups = st.groups.map((g) => ({ ...g, nodeIds: [...g.nodeIds] }))
    if (target === 'remove' && ownGroup) {
      nextGroups = nextGroups
        .map((g) =>
          g.id === ownGroup.id
            ? { ...g, nodeIds: g.nodeIds.filter((x) => x !== nodeId) }
            : g,
        )
        .filter((g) => g.nodeIds.length > 0)
      const dissolved = nextGroups.length < st.groups.length
      useCanvasStore.setState({
        groups: nextGroups,
        selectedGroupId:
          st.selectedGroupId === ownGroup.id && dissolved ? null : st.selectedGroupId,
        dirty: true,
      })
      st.showToast('success', `已将「${node.data.label ?? spec?.name ?? nodeId}」移出「${ownGroup.name}」`)
    } else if (target !== 'remove') {
      const g = nextGroups.find((x) => x.id === target)
      if (!g) return
      // 先移出原有分组再加入新组（一个节点同时只属于一个分组）
      nextGroups = nextGroups.map((x) => ({
        ...x,
        nodeIds: x.nodeIds.filter((id) => id !== nodeId),
      }))
      nextGroups = nextGroups
        .map((x) => (x.id === target ? { ...x, nodeIds: [...x.nodeIds, nodeId] } : x))
        .filter((x) => x.nodeIds.length > 0)
      useCanvasStore.setState({ groups: nextGroups, dirty: true })
      st.showToast('success', `已将「${node.data.label ?? spec?.name ?? nodeId}」加入「${g.name}」`)
    }
  }

  return (
    <>
      <p className="truncate border-b border-zinc-800 px-3 pb-1.5 pt-1 text-[9px] uppercase tracking-wider text-zinc-600">
        {isBatch ? `已选 ${batchIds.length} 个节点` : node.data.label ?? spec?.name ?? '节点操作'}
      </p>
      {/* 批量操作区（多选右键时置顶） */}
      {isBatch && (
        <>
          <MenuItem
            icon={<Boxes className="h-3.5 w-3.5 text-sky-300" />}
            label={`将 ${batchIds.length} 个节点编组`}
            onClick={() => {
              useCanvasStore.getState().createGroupFromSelection()
              closeMenu()
            }}
          />
          <MenuItem
            icon={<Play className="h-3.5 w-3.5 text-amber-300" />}
            label={`运行所选（自动补齐上游）`}
            onClick={() => {
              void runSelected()
              closeMenu()
            }}
          />
          {batchJoinable.length > 0 && (
            <div className="px-1.5 pb-0.5 pt-0.5">
              <p className="px-1.5 pb-1 text-[9px] text-zinc-600">批量加入分组</p>
              <div className={cn('space-y-0.5', batchJoinable.length > 4 && 'max-h-36 overflow-y-auto scrollbar-thin')}>
                {batchJoinable.map((g) => {
                  const c = getGroupColor(g.color)
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        addNodesToGroup(batchIds, g.id)
                        closeMenu()
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-zinc-300 transition hover:bg-zinc-800"
                    >
                      <FolderInput className="h-3 w-3 text-emerald-300" />
                      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
                      <span className="truncate">{g.name}</span>
                      <span className="ml-auto text-[9px] text-zinc-600">{g.nodeIds.length}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <MenuItem
            icon={<Trash2 className="h-3.5 w-3.5 text-rose-300" />}
            label={`删除所选 ${batchIds.length} 个节点`}
            danger
            onClick={() => {
              batchIds.forEach((id) => removeNode(id))
              closeMenu()
            }}
          />
          <div className="mx-2 my-1 h-px bg-zinc-800" />
          <p className="px-3 pb-0.5 pt-0.5 text-[9px] text-zinc-600">
            指向节点：{node.data.label ?? spec?.name}
          </p>
        </>
      )}
      {spec?.executable && !isBatch && (
        <MenuItem
          icon={<Play className="h-3.5 w-3.5 text-amber-300" />}
          label="仅运行此节点"
          onClick={() => {
            void runNode(nodeId)
            closeMenu()
          }}
        />
      )}
      <MenuItem
        icon={<Copy className="h-3.5 w-3.5" />}
        label="复制节点"
        onClick={() => {
          duplicateNode(nodeId)
          closeMenu()
        }}
      />
      <MenuItem
        icon={<Pencil className="h-3.5 w-3.5 text-sky-300" />}
        label="重命名"
        onClick={() => {
          const name = window.prompt('重命名节点', String(node.data.label ?? spec?.name ?? ''))
          if (name && name.trim()) {
            useCanvasStore.getState().updateNodeData(nodeId, { label: name.trim() })
          }
          closeMenu()
        }}
      />
      <MenuItem
        icon={<PanelRight className="h-3.5 w-3.5 text-teal-300" />}
        label="属性面板"
        onClick={() => {
          useCanvasStore
            .getState()
            .onNodesChange([
              ...useCanvasStore.getState().nodes.map((n) => ({ id: n.id, type: 'select' as const, selected: n.id === nodeId })),
            ])
          closeMenu()
        }}
      />
      {/* 分组操作（单节点模式） */}
      {!isBatch && (joinableGroups.length > 0 || ownGroup) && (
        <div className="mx-2 my-1 h-px bg-zinc-800" />
      )}
      {!isBatch && joinableGroups.length > 0 && (
        <div className="px-1.5 pb-0.5 pt-1">
          <p className="px-1.5 pb-1 text-[9px] text-zinc-600">加入分组</p>
          <div className={cn('space-y-0.5', joinableGroups.length > 4 && 'max-h-36 overflow-y-auto scrollbar-thin')}>
            {joinableGroups.map((g) => {
              const c = getGroupColor(g.color)
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    mutateMembership(g.id)
                    closeMenu()
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-zinc-300 transition hover:bg-zinc-800"
                >
                  <FolderInput className="h-3 w-3 text-emerald-300" />
                  <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
                  <span className="truncate">{g.name}</span>
                  <span className="ml-auto text-[9px] text-zinc-600">{g.nodeIds.length}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {!isBatch && ownGroup && (
        <MenuItem
          icon={<FolderMinus className="h-3.5 w-3.5 text-rose-300" />}
          label={`移出「${ownGroup.name}」`}
          onClick={() => {
            mutateMembership('remove')
            closeMenu()
          }}
        />
      )}
      {!isBatch && (
        <>
          <div className="mx-2 my-1 h-px bg-zinc-800" />
          <MenuItem
            icon={<Trash2 className="h-3.5 w-3.5 text-rose-300" />}
            label="删除节点"
            danger
            onClick={() => {
              removeNode(nodeId)
              closeMenu()
            }}
          />
        </>
      )}
    </>
  )
}

/**
 * 批量把节点加入分组：直接变更 nodeIds（commit 入撤销栈），
 * 每个节点单归属——加入前先从原有分组移除，空组自动解散。
 * 供多选工具栏 / 节点右键菜单共用。
 */
function addNodesToGroup(nodeIds: string[], groupId: string) {
  const st = useCanvasStore.getState()
  const g = st.groups.find((x) => x.id === groupId)
  if (!g || nodeIds.length === 0) return
  st.commit()
  const idSet = new Set(nodeIds)
  let nextGroups = st.groups.map((x) => ({
    ...x,
    nodeIds: x.nodeIds.filter((id) => !idSet.has(id)),
  }))
  nextGroups = nextGroups
    .map((x) => (x.id === groupId ? { ...x, nodeIds: [...x.nodeIds, ...nodeIds] } : x))
    .filter((x) => x.nodeIds.length > 0)
  const dissolved = nextGroups.length < st.groups.length
  useCanvasStore.setState({
    groups: nextGroups,
    selectedGroupId:
      st.selectedGroupId && dissolved && !nextGroups.some((x) => x.id === st.selectedGroupId)
        ? null
        : st.selectedGroupId,
    dirty: true,
  })
  st.showToast('success', `已将 ${nodeIds.length} 个节点加入「${g.name}」`)
}

/**
 * 多选对齐/分布：左对齐 / 顶对齐 / 水平等距 / 垂直等距（Figma 式，commit 可撤销）
 */
function alignSelected(mode: 'left' | 'top' | 'hdist' | 'vdist') {
  const st = useCanvasStore.getState()
  const sel = st.nodes.filter((n) => n.selected)
  if (sel.length < 2) return
  st.commit()
  const items = sel.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? 300,
    h: n.measured?.height ?? 120,
  }))
  const pos = new Map<string, { x: number; y: number }>(items.map((n) => [n.id, { x: n.x, y: n.y }]))
  if (mode === 'left') {
    const L = Math.min(...items.map((n) => n.x))
    items.forEach((n) => pos.set(n.id, { x: L, y: n.y }))
  } else if (mode === 'top') {
    const T = Math.min(...items.map((n) => n.y))
    items.forEach((n) => pos.set(n.id, { x: n.x, y: T }))
  } else if (mode === 'hdist') {
    if (items.length < 3) return
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalW = sorted.reduce((a, n) => a + n.w, 0)
    const gap = (last.x + last.w - first.x - totalW) / (sorted.length - 1)
    let cur = first.x
    sorted.forEach((n) => {
      pos.set(n.id, { x: Math.round(cur), y: n.y })
      cur += n.w + gap
    })
  } else if (mode === 'vdist') {
    if (items.length < 3) return
    const sorted = [...items].sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalH = sorted.reduce((a, n) => a + n.h, 0)
    const gap = (last.y + last.h - first.y - totalH) / (sorted.length - 1)
    let cur = first.y
    sorted.forEach((n) => {
      pos.set(n.id, { x: n.x, y: Math.round(cur) })
      cur += n.h + gap
    })
  }
  st.onNodesChange(
    [...pos.entries()].map(([id, position]) => ({ id, type: 'position' as const, position })),
  )
}

/**
 * 多选浮动工具栏（Figma 式）：选中 ≥2 个节点时浮现在选区上方，
 * 提供编组 / 运行所选 / 批量加入分组 / 对齐分布 / 删除；拖拽过程中隐藏避免闪烁。
 */
function MultiSelectToolbar({ dragging }: { dragging: boolean }) {
  const nodes = useCanvasStore((s) => s.nodes)
  const groups = useCanvasStore((s) => s.groups)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const transform = useStore((s) => s.transform)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [alignMenuOpen, setAlignMenuOpen] = useState(false)

  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const bounds = useMemo(() => {
    if (selected.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of selected) {
      const w = n.measured?.width ?? 300
      const h = n.measured?.height ?? 120
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }
    return { minX, minY, maxX, maxY }
  }, [selected])

  if (!bounds || dragging) return null
  const [tx, ty, zoom] = transform
  const left = bounds.minX * zoom + tx
  const top = bounds.minY * zoom + ty - 46

  const selectedIds = selected.map((n) => n.id)
  const joinableGroups = groups.filter(
    (g) => !selected.every((n) => g.nodeIds.includes(n.id)),
  )

  return (
    <div
      nodrag=""
      className="absolute z-20 flex animate-in fade-in slide-in-from-bottom-1 items-center gap-0.5 rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur duration-150"
      style={{
        left: Math.max(8, left),
        top: Math.max(8, top),
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="px-1.5 text-[10px] font-medium text-zinc-500">
        已选 {selected.length}
      </span>
      <div className="mx-0.5 h-4 w-px bg-zinc-800" />
      <ToolButton
        icon={<Boxes className="h-3.5 w-3.5" />}
        label="编组"
        tone="sky"
        title={`将 ${selected.length} 个节点编组（Ctrl+G）`}
        onClick={() => useCanvasStore.getState().createGroupFromSelection()}
      />
      <ToolButton
        icon={<Play className="h-3.5 w-3.5" />}
        label="运行所选"
        tone="amber"
        title="运行选中节点（自动补齐缺少输出的上游依赖）"
        onClick={() => void runSelected()}
      />
      {joinableGroups.length > 0 && (
        <div className="relative">
          <ToolButton
            icon={<FolderInput className="h-3.5 w-3.5" />}
            label="加入分组"
            tone="emerald"
            title="把所选节点批量加入分组"
            active={groupMenuOpen}
            onClick={() => {
              setGroupMenuOpen((v) => !v)
              setAlignMenuOpen(false)
            }}
          />
          {groupMenuOpen && (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/97 py-1 shadow-2xl backdrop-blur">
              <p className="px-2.5 pb-1 pt-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
                加入到…
              </p>
              {joinableGroups.map((g) => {
                const c = getGroupColor(g.color)
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      addNodesToGroup(selectedIds, g.id)
                      setGroupMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 transition hover:bg-zinc-800"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
                    <span className="truncate">{g.name}</span>
                    <span className="ml-auto text-[9px] text-zinc-600">{g.nodeIds.length}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      <div className="mx-0.5 h-4 w-px bg-zinc-800" />
      {/* 对齐 / 分布 */}
      <div className="relative">
        <ToolButton
          icon={<AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />}
          label="对齐"
          tone="sky"
          title="对齐与分布"
          active={alignMenuOpen}
          onClick={() => {
            setAlignMenuOpen((v) => !v)
            setGroupMenuOpen(false)
          }}
        />
        {alignMenuOpen && (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/97 py-1 shadow-2xl backdrop-blur">
            {([
              { mode: 'left', label: '左对齐', icon: <AlignStartVertical className="h-3.5 w-3.5 text-sky-300" /> },
              { mode: 'top', label: '顶对齐', icon: <AlignStartHorizontal className="h-3.5 w-3.5 text-sky-300" /> },
              { mode: 'hdist', label: '水平等距分布', icon: <AlignHorizontalDistributeCenter className="h-3.5 w-3.5 text-sky-300" />, disabled: selected.length < 3 },
              { mode: 'vdist', label: '垂直等距分布', icon: <AlignVerticalDistributeCenter className="h-3.5 w-3.5 text-sky-300" />, disabled: selected.length < 3 },
            ] as { mode: 'left' | 'top' | 'hdist' | 'vdist'; label: string; icon: React.ReactNode; disabled?: boolean }[]).map(
              ({ mode, label, icon, disabled }) => (
                <button
                  key={mode}
                  disabled={disabled}
                  onClick={() => {
                    alignSelected(mode)
                    setAlignMenuOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition',
                    disabled
                      ? 'cursor-not-allowed text-zinc-700'
                      : 'text-zinc-300 hover:bg-zinc-800',
                  )}
                  title={disabled ? '等距分布需要至少 3 个节点' : undefined}
                >
                  {icon}
                  {label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
      <div className="mx-0.5 h-4 w-px bg-zinc-800" />
      <ToolButton
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label="删除"
        tone="rose"
        danger
        title={`删除所选 ${selected.length} 个节点（可撤销）`}
        onClick={() => {
          selectedIds.forEach((id) => removeNode(id))
        }}
      />
    </div>
  )
}

function ToolButton({
  icon,
  label,
  tone,
  title,
  onClick,
  danger,
  active,
}: {
  icon: React.ReactNode
  label: string
  tone: 'sky' | 'amber' | 'emerald' | 'rose'
  title: string
  onClick: () => void
  danger?: boolean
  active?: boolean
}) {
  const tones: Record<string, string> = {
    sky: 'text-sky-300 hover:bg-sky-500/15',
    amber: 'text-amber-300 hover:bg-amber-500/15',
    emerald: 'text-emerald-300 hover:bg-emerald-500/15',
    rose: 'text-rose-300 hover:bg-rose-500/15',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition',
        danger ? 'text-rose-300 hover:bg-rose-500/15' : tones[tone],
        active && 'bg-zinc-800',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}

/** 分组右键菜单项：重命名 / 换色 / 解组 / 删除分组与成员 */
function GroupMenuItems({
  groupId,
  closeMenu,
}: {
  groupId: string
  closeMenu: () => void
}) {
  const group = useCanvasStore((s) => s.groups.find((g) => g.id === groupId))
  if (!group) return null
  const color = getGroupColor(group.color)
  return (
    <>
      <p className="flex items-center gap-1.5 border-b border-zinc-800 px-3 pb-1.5 pt-1 text-[9px] uppercase tracking-wider text-zinc-600">
        <span className={cn('h-2 w-2 rounded-full', color.dot)} />
        分组 · {group.nodeIds.length} 节点
      </p>
      <MenuItem
        icon={<Play className="h-3.5 w-3.5 text-amber-300" />}
        label="运行分组（自动补齐上游）"
        onClick={() => {
          void runGroup(group.id)
          closeMenu()
        }}
      />
      <MenuItem
        icon={
          group.collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5 text-sky-300" />
          )
        }
        label={group.collapsed ? '展开分组' : '折叠分组（收起为卡片）'}
        onClick={() => {
          useCanvasStore.getState().toggleGroupCollapse(group.id)
          closeMenu()
        }}
      />
      <MenuItem
        icon={<FoldVertical className="h-3.5 w-3.5 text-zinc-300" />}
        label="折叠全部分组 / 展开"
        onClick={() => {
          const st = useCanvasStore.getState()
          const anyOpen = st.groups.some((g) => !g.collapsed)
          st.groups.forEach((g) => {
            if (anyOpen !== !!g.collapsed) {
              st.setGroupCollapsed(g.id, anyOpen, { silent: true })
            }
          })
          st.showToast('info', anyOpen ? '已折叠全部分组' : '已展开全部分组')
          closeMenu()
        }}
      />
      <MenuItem
        icon={<Pencil className="h-3.5 w-3.5" />}
        label="重命名分组"
        onClick={() => {
          const name = window.prompt('重命名分组', group.name)
          if (name && name.trim()) {
            useCanvasStore.getState().renameGroup(group.id, name.trim())
          }
          closeMenu()
        }}
      />
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <span className="text-[10px] text-zinc-500">颜色</span>
        <span className="flex items-center gap-1">
          {GROUP_COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => useCanvasStore.getState().setGroupColor(group.id, c.key)}
              className={cn(
                'h-3.5 w-3.5 rounded-full border transition hover:scale-110',
                c.dot,
                group.color === c.key
                  ? 'border-white/80 ring-1 ring-white/40'
                  : 'border-transparent',
              )}
              title={c.label}
            />
          ))}
        </span>
      </div>
      <div className="mx-2 my-0.5 h-px bg-zinc-800" />
      <MenuItem
        icon={<UngroupIcon className="h-3.5 w-3.5 text-zinc-300" />}
        label="解组（保留节点）"
        onClick={() => {
          useCanvasStore.getState().ungroup(group.id)
          closeMenu()
        }}
      />
      <MenuItem
        icon={<Trash2 className="h-3.5 w-3.5 text-rose-300" />}
        label="删除分组与全部成员"
        danger
        onClick={() => {
          if (
            window.confirm(
              `确定删除分组「${group.name}」及其 ${group.nodeIds.length} 个节点？可用撤销恢复。`,
            )
          ) {
            useCanvasStore.getState().deleteGroupAndNodes(group.id)
          }
          closeMenu()
        }}
      />
    </>
  )
}
