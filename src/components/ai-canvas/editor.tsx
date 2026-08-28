'use client'

/**
 * AI 视频创作画布 —— 主编辑器
 */
import { useCallback, useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isConnectionValid,
  NODE_SPECS,
  NODE_TYPE_LIST,
  type CanvasNodeData,
} from '@/lib/ai-canvas/types'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { runNode, runWorkflow } from '@/lib/ai-canvas/executor'
import { saveWorkflow, openWorkflow } from '@/lib/ai-canvas/persistence'
import { getAccent } from './nodes/accents'
import { GraphNode } from './nodes/graph-node'
import { CanvasEdge } from './canvas-edge'
import { TopBar } from './topbar'
import { Palette } from './palette'
import { LibraryDialog } from './library-dialog'
import { TemplatesDialog } from './templates-dialog'

const nodeTypes: NodeTypes = Object.fromEntries(
  NODE_TYPE_LIST.map((s) => [s.type, GraphNode]),
)
const edgeTypes: EdgeTypes = { canvas: CanvasEdge }

interface MenuState {
  screen: { x: number; y: number }
  flow: { x: number; y: number }
  nodeId?: string
}

function StatusBar() {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const running = useCanvasStore((s) => s.running)
  const zoom = useStore((s) => s.transform[2])
  const { fitView } = useReactFlow()
  const successCount = nodes.filter((n) => n.data.runState === 'success').length

  return (
    <footer className="mt-auto flex h-7 shrink-0 items-center gap-4 border-t border-zinc-800/80 bg-zinc-950/95 px-4 text-[10px] text-zinc-500 backdrop-blur">
      <span className="flex items-center gap-1.5">
        <Layers className="h-3 w-3" />
        {nodes.length} 节点 · {edges.length} 连线
      </span>
      {running && (
        <span className="flex items-center gap-1.5 text-amber-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          工作流运行中…
        </span>
      )}
      {!running && successCount > 0 && (
        <span className="text-emerald-400/80">✓ {successCount} 个节点已就绪</span>
      )}
      <span className="ml-auto hidden sm:inline">
        拖入节点 → 连线 → 点击「运行」生成 AI 视频
      </span>
      <button
        onClick={() => void fitView({ duration: 400, padding: 0.15 })}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-zinc-300"
        title="适应视图"
      >
        <Maximize className="h-3 w-3" />
        适应视图
      </button>
      <button
        onClick={() => autoLayout()}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-zinc-300"
        title="自动整理布局"
      >
        <Wand2 className="h-3 w-3" />
        整理布局
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
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
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
      addNode(type, position)
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
      addNode(type, position)
    }
    window.addEventListener('ai-canvas:add-node', handler)
    return () => window.removeEventListener('ai-canvas:add-node', handler)
  }, [screenToFlowPosition, addNode])

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
        clearTimeout(timer)
        timer = setTimeout(() => {
          const st = useCanvasStore.getState()
          if (st.dirty && !st.running && st.workflow.id) void saveWorkflow()
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
      if (meta && e.key === 's') {
        e.preventDefault()
        void saveWorkflow()
      }
      if (meta && e.key === 'Enter') {
        e.preventDefault()
        void runWorkflow()
      }
      if (e.key === 'Escape') setMenu(null)
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

  const closeMenu = useCallback(() => setMenu(null), [])

  /* ---------- 连线校验 ---------- */
  const isValidConnection = useCallback(
    (conn: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null }) => {
      const src = useCanvasStore.getState().nodes.find((n) => n.id === conn.source)
      const tgt = useCanvasStore.getState().nodes.find((n) => n.id === conn.target)
      if (!src || !tgt || src.id === tgt.id) return false
      return isConnectionValid(
        { type: src.type as string, handleId: conn.sourceHandle },
        { type: tgt.type as string, handleId: conn.targetHandle },
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
            onPaneContextMenu={openPaneMenu}
            onPaneClick={closeMenu}
            onMoveStart={closeMenu}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              setMenu({
                screen: { x: e.clientX, y: e.clientY },
                flow: node.position,
                nodeId: node.id,
              })
            }}
            onNodeDragStart={closeMenu}
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
              nodeColor={(n) => getAccent(NODE_SPECS[n.type ?? '']?.accent).hex}
              nodeStrokeWidth={2}
            />
          </ReactFlow>

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
                top: Math.min(menu.screen.y, window.innerHeight - 320),
              }}
              onMouseLeave={closeMenu}
            >
              {menu.nodeId ? (
                <>
                  <p className="border-b border-zinc-800 px-3 pb-1.5 pt-1 text-[9px] uppercase tracking-wider text-zinc-600">
                    节点操作
                  </p>
                  <MenuItem
                    icon={<Play className="h-3.5 w-3.5 text-amber-300" />}
                    label="仅运行此节点"
                    onClick={() => {
                      void runNode(menu.nodeId!)
                      closeMenu()
                    }}
                  />
                  <MenuItem
                    icon={<Copy className="h-3.5 w-3.5" />}
                    label="复制节点"
                    onClick={() => {
                      duplicateNode(menu.nodeId!)
                      closeMenu()
                    }}
                  />
                  <MenuItem
                    icon={<Trash2 className="h-3.5 w-3.5 text-rose-300" />}
                    label="删除节点"
                    danger
                    onClick={() => {
                      removeNode(menu.nodeId!)
                      closeMenu()
                    }}
                  />
                </>
              ) : (
                <>
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

export function Editor() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
