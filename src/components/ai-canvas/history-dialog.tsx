'use client'

/**
 * 运行历史对话框：展示节点执行记录（状态 / 耗时 / 错误 / 产物下载）
 * 每条记录可展开「画布快照」：执行时刻的图布局迷你图（SVG 渲染，标记执行节点位置）
 * 支持按状态过滤（全部 / 成功 / 失败 / 运行中）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  RefreshCw,
  FileText,
  RotateCcw,
  CloudDownload,
  Waypoints,
  Circle,
  Play,
  Volume2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { NODE_SPECS } from '@/lib/ai-canvas/types'
import { runNode, reclaimNodeTask } from '@/lib/ai-canvas/executor'
import { getAccent } from './nodes/accents'

interface HistoryOutput {
  kind?: string
  url?: string
  text?: string
  meta?: Record<string, string | number>
}

interface HistoryItem {
  id: string
  nodeId: string
  nodeType: string
  status: string
  stage: string
  error: string | null
  output: Record<string, HistoryOutput> | null
  remoteTaskId?: string | null
  snapshot: {
    focus?: string
    nodes?: { id: string; type: string; x: number; y: number; label?: string; state?: string }[]
    edges?: [string, string, string, string][]
  } | null
  createdAt: string
  durationMs: number
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

/* ---------------- 画布快照迷你图（SVG） ---------------- */

/** 快照节点在迷你图中的运行态填色（快照时刻的状态） */
const SNAP_STATE_FILL: Record<string, string> = {
  running: '#f59e0b',
  queued: '#38bdf8',
  success: '#34d399',
  failed: '#fb7185',
  skipped: '#52525b',
}

interface SnapNode {
  id: string
  type: string
  x: number
  y: number
  label?: string
  state?: string
}

/**
 * 快照迷你图（可交互）：
 * - 悬停节点矩形：DOM 直操给真实画布节点加琥珀色光环（避免全节点重渲染）
 * - 点击节点矩形：关闭对话框 + 选中并居中定位真实节点（不在画布时 toast 提示）
 */
function SnapshotThumb({
  snapshot,
  onLocate,
}: {
  snapshot: NonNullable<HistoryItem['snapshot']>
  onLocate?: () => void
}) {
  const { setCenter, getZoom } = useReactFlow()
  const hoverElRef = useRef<HTMLElement | null>(null)

  const clearHighlight = () => {
    hoverElRef.current?.classList.remove('snap-hover-highlight')
    hoverElRef.current = null
  }
  useEffect(() => clearHighlight, [])

  const highlightRealNode = (id: string | null) => {
    clearHighlight()
    if (!id) return
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(id)}"]`,
    ) as HTMLElement | null
    if (el) {
      el.classList.add('snap-hover-highlight')
      hoverElRef.current = el
    }
  }

  const locateRealNode = (id: string) => {
    const store = useCanvasStore.getState()
    const n = store.nodes.find((x) => x.id === id)
    if (!n) {
      store.showToast('info', '该节点已不在当前画布上')
      return
    }
    if (n.hidden) {
      store.showToast('info', '该节点在折叠分组中，展开分组后即可查看')
      return
    }
    onLocate?.()
    store.onNodesChange([{ id, type: 'select', selected: true }])
    void setCenter(n.position.x + 160, n.position.y + 60, {
      zoom: Math.max(getZoom(), 0.85),
      duration: 420,
    })
  }

  const layout = useMemo(() => {
    const nodes: SnapNode[] = snapshot.nodes ?? []
    if (nodes.length === 0) return null
    const NODE_W = 64
    const NODE_H = 30
    const pos = new Map(nodes.map((n) => [n.id, n]))
    const edges = (snapshot.edges ?? []).filter(
      (e) => pos.has(e[0]) && pos.has(e[2]),
    )
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + NODE_W * 4) // 近似节点实际宽度（320px 流坐标）
      maxY = Math.max(maxY, n.y + NODE_H * 4)
    }
    const PAD = 20
    const bw = Math.max(200, maxX - minX)
    const bh = Math.max(120, maxY - minY)
    const VW = 560
    const VH = 210
    const scale = Math.min((VW - PAD * 2) / bw, (VH - PAD * 2) / bh)
    // flow 坐标 → 视图坐标
    const tx = (x: number) => (x - minX) * scale + PAD
    const ty = (y: number) => (y - minY) * scale + PAD
    const w = 320 * scale
    const h = 120 * scale
    return { nodes, edges, tx, ty, w, h, VW, VH }
  }, [snapshot])

  if (!layout) {
    return (
      <p className="px-3 py-3 text-[10px] text-zinc-600">快照为空（旧记录或画布为空）</p>
    )
  }
  const { nodes, edges, tx, ty, w, h, VW, VH } = layout
  const focus = snapshot.focus
  return (
    <div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="h-auto w-full select-none rounded-lg"
        role="img"
        aria-label="执行时刻画布快照"
        onMouseLeave={() => highlightRealNode(null)}
      >
        {/* 连线 */}
        {edges.map(([s, , t], i) => {
          const sn = nodes.find((n) => n.id === s)
          const tn = nodes.find((n) => n.id === t)
          if (!sn || !tn) return null
          const x1 = tx(sn.x) + w
          const y1 = ty(sn.y) + h / 2
          const x2 = tx(tn.x)
          const y2 = ty(tn.y) + h / 2
          const mx = (x1 + x2) / 2
          const isFocusEdge = s === focus || t === focus
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={isFocusEdge ? 'rgba(251,191,36,0.75)' : 'rgba(113,113,122,0.4)'}
              strokeWidth={isFocusEdge ? 1.6 : 1}
            />
          )
        })}
        {/* 节点矩形（可交互：hover 高亮真实节点 / 点击定位） */}
        {nodes.map((n) => {
          const isFocus = n.id === focus
          const fill =
            SNAP_STATE_FILL[n.state ?? ''] ??
            getAccent(NODE_SPECS[n.type]?.accent).hex ??
            '#71717a'
          const specName = NODE_SPECS[n.type]?.name ?? n.type
          const stateLabel =
            n.state === 'running'
              ? '运行中'
              : n.state === 'success'
                ? '成功'
                : n.state === 'failed'
                  ? '失败'
                  : n.state === 'queued'
                    ? '排队中'
                    : '待运行'
          return (
            <g
              key={n.id}
              className="cursor-pointer transition-opacity hover:opacity-100"
              opacity={isFocus ? 1 : 0.88}
              onClick={() => locateRealNode(n.id)}
              onMouseEnter={() => highlightRealNode(n.id)}
            >
              <title>
                {`${n.label || specName}（${specName} · ${stateLabel}）— 点击定位到画布`}
              </title>
              <rect
                x={tx(n.x)}
                y={ty(n.y)}
                width={w}
                height={h}
                rx={4}
                fill={fill}
                fillOpacity={isFocus ? 0.95 : 0.55}
                stroke={isFocus ? '#fde68a' : 'rgba(255,255,255,0.12)'}
                strokeWidth={isFocus ? 1.8 : 0.8}
              />
              {isFocus && (
                <>
                  <rect
                    x={tx(n.x) - 3}
                    y={ty(n.y) - 3}
                    width={w + 6}
                    height={h + 6}
                    rx={6}
                    fill="none"
                    stroke="rgba(251,191,36,0.45)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  {n.label ? (
                    <text
                      x={tx(n.x) + w / 2}
                      y={ty(n.y) - 7}
                      textAnchor="middle"
                      fill="#fcd34d"
                      fontSize={9}
                      fontWeight={600}
                    >
                      {n.label.slice(0, 12)}
                    </text>
                  ) : null}
                </>
              )}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-right text-[8px] text-zinc-600">
        悬停高亮画布节点 · 点击定位
      </p>
    </div>
  )
}

/* ---------------- 产物预览缩略图 ---------------- */

/**
 * 历史条目右侧的产物预览小缩略图：
 * 图像直接展示；视频优先用 poster（无则用 preload=metadata 抓首帧）；文本展示截断片段。
 * 点击在新标签页打开原文件。
 */
function OutputThumb({ out }: { out: HistoryOutput }) {
  const [failed, setFailed] = useState(false)
  if (out.kind === 'image' && out.url) {
    return (
      <a
        href={out.url}
        target="_blank"
        rel="noreferrer"
        className="group/th relative block h-10 w-[68px] shrink-0 overflow-hidden rounded-md border border-zinc-700/70"
        title="点击查看原图"
      >
        <img
          src={out.url}
          alt="产物图像"
          className="h-full w-full object-cover transition duration-200 group-hover/th:scale-110"
          loading="lazy"
        />
        <span className="absolute inset-0 bg-sky-400/0 transition group-hover/th:bg-sky-400/15" />
      </a>
    )
  }
  if (out.kind === 'video' && out.url) {
    const poster = out.meta?.poster ? String(out.meta.poster) : undefined
    return (
      <a
        href={out.url}
        target="_blank"
        rel="noreferrer"
        className="group/th relative block h-10 w-[68px] shrink-0 overflow-hidden rounded-md border border-zinc-700/70 bg-black"
        title="点击播放视频"
      >
        {poster && !failed ? (
          <img
            src={poster}
            alt="视频首帧"
            className="h-full w-full object-cover opacity-90 transition duration-200 group-hover/th:scale-110"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <video
            src={`${out.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover opacity-90"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm ring-1 ring-white/25 transition group-hover/th:scale-110 group-hover/th:bg-amber-500/80">
            <Play className="h-2.5 w-2.5 fill-zinc-100 text-zinc-100" />
          </span>
        </span>
      </a>
    )
  }
  if (out.kind === 'audio' && out.url) {
    return (
      <a
        href={out.url}
        target="_blank"
        rel="noreferrer"
        className="flex h-10 w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-rose-500/25 bg-gradient-to-br from-rose-500/15 to-fuchsia-500/5 transition hover:border-rose-400/50"
        title="点击播放音频"
      >
        <Volume2 className="h-3.5 w-3.5 text-rose-300" />
        {/* 装饰性波形条 */}
        <span className="flex h-2.5 items-end gap-[2px]">
          {[6, 10, 4, 8, 5].map((h, i) => (
            <span
              key={i}
              className="w-[2px] rounded-sm bg-rose-400/60"
              style={{ height: `${h}px` }}
            />
          ))}
        </span>
      </a>
    )
  }
  if (out.kind === 'text' && out.text) {
    return (
      <span
        className="flex h-10 w-[68px] shrink-0 flex-col justify-center overflow-hidden rounded-md border border-emerald-500/25 bg-emerald-500/5 px-1.5"
        title={out.text.slice(0, 160)}
      >
        <span className="line-clamp-3 text-[8px] leading-[1.35] text-emerald-300/80">
          {out.text.slice(0, 80)}
        </span>
      </span>
    )
  }
  return null
}

/* ---------------- 状态过滤 ---------------- */

type StatusFilter = 'all' | 'success' | 'failed' | 'running'

const FILTER_META: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'success', label: '成功' },
  { key: 'failed', label: '失败' },
  { key: 'running', label: '运行中' },
]

function matchFilter(item: HistoryItem, filter: StatusFilter) {
  if (filter === 'all') return true
  if (filter === 'running') return item.status === 'running'
  return item.status === filter
}

/* ---------------- 主对话框 ---------------- */

export function HistoryDialog() {
  const open = useCanvasStore((s) => s.historyOpen)
  const setOpen = useCanvasStore((s) => s.setHistoryOpen)
  const workflow = useCanvasStore((s) => s.workflow)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [snapOpen, setSnapOpen] = useState<Set<string>>(new Set())

  const refresh = async () => {
    setLoading(true)
    try {
      const qs = workflow.id ? `?workflowId=${encodeURIComponent(workflow.id)}` : ''
      const res = await fetch(`/api/executions/history${qs}`, { cache: 'no-store' })
      const j = await res.json()
      setItems(j.items ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => matchFilter(i, filter))),
    [items, filter],
  )
  const counts = useMemo(
    () => ({
      all: items.length,
      success: items.filter((i) => i.status === 'success').length,
      failed: items.filter((i) => i.status === 'failed').length,
      running: items.filter((i) => i.status === 'running').length,
    }),
    [items],
  )

  const toggleSnap = (id: string) =>
    setSnapOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <History className="h-4 w-4 text-teal-300" />
            运行历史
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-zinc-500">
            {workflow.id ? `「${workflow.name}」的` : '全部'}节点执行记录（最多 80 条）
            <button
              onClick={() => void refresh()}
              className="ml-1 inline-flex items-center gap-0.5 rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="刷新"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </button>
          </DialogDescription>
          {/* 状态过滤 chips */}
          <div className="flex items-center gap-1.5 pt-1">
            {FILTER_META.map((f) => {
              const active = filter === f.key
              const n = counts[f.key]
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] transition',
                    active
                      ? 'border-teal-400/60 bg-teal-500/15 text-teal-200'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
                  )}
                >
                  {f.key === 'success' && <CheckCircle2 className="h-2.5 w-2.5" />}
                  {f.key === 'failed' && <XCircle className="h-2.5 w-2.5" />}
                  {f.key === 'running' && <Circle className="h-2.5 w-2.5 text-amber-300" />}
                  {f.label}
                  <span className={cn('font-mono text-[9px]', active ? 'text-teal-300/80' : 'text-zinc-600')}>
                    {n}
                  </span>
                </button>
              )
            })}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[420px] pr-2">
          {loading && items.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-900" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
              <History className="h-8 w-8" />
              <p className="text-xs">
                {filter === 'all' ? '暂无执行记录，运行一次工作流试试' : '该状态下暂无记录'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const spec = NODE_SPECS[item.nodeType]
                const outputs = item.output
                  ? Object.values(item.output).filter((o) => o?.url)
                  : []
                const snapExpanded = snapOpen.has(item.id)
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/60 transition hover:border-zinc-700"
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2">
                      {item.status === 'success' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : item.status === 'failed' ? (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                      ) : item.status === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-300" />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-700" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[11px] text-zinc-200">
                          <span className="font-medium">{spec?.name ?? item.nodeType}</span>
                          <span className="text-[9px] text-zinc-600">
                            {item.nodeId.length > 14 ? `${item.nodeId.slice(0, 14)}…` : item.nodeId}
                          </span>
                          <span
                            className={cn(
                              'rounded px-1 py-0.5 text-[9px]',
                              item.status === 'success' && 'bg-emerald-500/15 text-emerald-300',
                              item.status === 'failed' && 'bg-rose-500/15 text-rose-300',
                              item.status === 'running' && 'bg-amber-500/15 text-amber-300',
                            )}
                          >
                            {item.status === 'success'
                              ? '成功'
                              : item.status === 'failed'
                                ? '失败'
                                : item.status === 'running'
                                  ? '运行中'
                                  : item.status}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-[9px] text-zinc-500">
                          {item.error
                            ? item.error
                            : `${fmtTime(item.createdAt)} · 耗时 ${fmtDuration(item.durationMs)}`}
                        </p>
                      </div>
                      {/* 产物预览缩略图（图像直接展示 / 视频首帧 / 音频波形 / 文本片段） */}
                      {outputs.length > 0 && (
                        <div className="flex shrink-0 items-center gap-1">
                          {outputs.slice(0, 2).map((o, i) =>
                            (o.url || o.text) ? <OutputThumb key={i} out={o} /> : null,
                          )}
                        </div>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        {item.snapshot?.nodes && item.snapshot.nodes.length > 0 && (
                          <button
                            onClick={() => toggleSnap(item.id)}
                            className={cn(
                              'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[9px] transition',
                              snapExpanded
                                ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-200',
                            )}
                            title="展开执行时刻的画布布局快照"
                          >
                            <Waypoints className="h-3 w-3" />
                            快照
                          </button>
                        )}
                        {item.status === 'failed' &&
                          item.remoteTaskId &&
                          (item.nodeType === 'textToVideo' || item.nodeType === 'imageToVideo') &&
                          useCanvasStore
                            .getState()
                            .nodes.some((n) => n.id === item.nodeId) && (
                            <button
                              onClick={() => {
                                void reclaimNodeTask(item.nodeId)
                                useCanvasStore
                                  .getState()
                                  .showToast('info', '正在找回云端任务…')
                                setTimeout(() => void refresh(), 3000)
                              }}
                              className="flex h-6 items-center gap-1 rounded-md border border-teal-500/40 bg-teal-500/10 px-1.5 text-[9px] text-teal-200 transition hover:bg-teal-500/20"
                              title="凭远端任务 ID 查询云端状态，成功则把成片回填节点"
                            >
                              <CloudDownload className="h-3 w-3" />
                              找回
                            </button>
                          )}
                        {item.status === 'failed' &&
                          useCanvasStore
                            .getState()
                            .nodes.some((n) => n.id === item.nodeId) && (
                            <button
                              onClick={() => {
                                void runNode(item.nodeId)
                                useCanvasStore
                                  .getState()
                                  .showToast('info', '已重新提交该节点执行')
                                setTimeout(() => void refresh(), 2500)
                              }}
                              className="flex h-6 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 text-[9px] text-amber-200 transition hover:bg-amber-500/20"
                              title="重跑该节点"
                            >
                              <RotateCcw className="h-3 w-3" />
                              重跑
                            </button>
                          )}
                        {outputs.map((o, i) =>
                          o.url ? (
                            <a
                              key={i}
                              href={o.url}
                              download
                              className="flex h-6 items-center gap-1 rounded-md border border-zinc-700 px-1.5 text-[9px] text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
                              title={`下载产物（${o.kind}）`}
                            >
                              <Download className="h-3 w-3" />
                              {o.kind === 'video' ? '视频' : o.kind === 'audio' ? '音频' : '图像'}
                            </a>
                          ) : o.text ? (
                            <span
                              className="flex h-6 items-center gap-1 rounded-md border border-zinc-800 px-1.5 text-[9px] text-zinc-500"
                              title={o.text.slice(0, 120)}
                            >
                              <FileText className="h-3 w-3" />
                              文本
                            </span>
                          ) : null,
                        )}
                      </div>
                    </div>
                    {/* 画布快照展开区 */}
                    {snapExpanded && item.snapshot && (
                      <div className="border-t border-zinc-800/70 bg-zinc-950/70 px-3 py-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                            执行时刻画布快照 · {item.snapshot.nodes?.length ?? 0} 节点
                          </p>
                          <p className="flex items-center gap-1 text-[9px] text-amber-300/80">
                            <span className="inline-block h-1.5 w-3 rounded-sm bg-amber-400" />
                            本节点（{item.snapshot.focus?.slice(0, 10)}…）
                          </p>
                        </div>
                        <SnapshotThumb
                          snapshot={item.snapshot}
                          onLocate={() => setOpen(false)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="pt-1 text-center text-[9px] text-zinc-700">
                — 最多保留最近 80 条记录 —
              </p>
              {items.length > 20 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-full text-[10px] text-zinc-600 hover:text-zinc-300"
                  onClick={() => void refresh()}
                >
                  刷新列表
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
