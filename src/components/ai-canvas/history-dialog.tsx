'use client'

/**
 * 运行历史对话框：展示节点执行记录（状态 / 耗时 / 错误 / 产物下载）
 * 每条记录可展开「画布快照」：执行时刻的图布局迷你图（SVG 渲染，标记执行节点位置）
 * 支持按状态过滤（全部 / 成功 / 失败 / 运行中）
 */
import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { NODE_SPECS } from '@/lib/ai-canvas/types'
import { runNode, reclaimNodeTask } from '@/lib/ai-canvas/executor'
import { getAccent } from './nodes/accents'

interface HistoryItem {
  id: string
  nodeId: string
  nodeType: string
  status: string
  stage: string
  error: string | null
  output: Record<string, { kind?: string; url?: string; text?: string }> | null
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

function SnapshotThumb({
  snapshot,
}: {
  snapshot: NonNullable<HistoryItem['snapshot']>
}) {
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
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-auto w-full select-none rounded-lg"
      role="img"
      aria-label="执行时刻画布快照"
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
      {/* 节点矩形 */}
      {nodes.map((n) => {
        const isFocus = n.id === focus
        const fill =
          SNAP_STATE_FILL[n.state ?? ''] ??
          getAccent(NODE_SPECS[n.type]?.accent).hex ??
          '#71717a'
        return (
          <g key={n.id}>
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
  )
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
                        <SnapshotThumb snapshot={item.snapshot} />
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
