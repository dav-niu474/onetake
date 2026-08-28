'use client'

/**
 * 运行历史对话框：展示节点执行记录（状态 / 耗时 / 错误 / 产物下载）
 */
import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { NODE_SPECS } from '@/lib/ai-canvas/types'

interface HistoryItem {
  id: string
  nodeId: string
  nodeType: string
  status: string
  stage: string
  error: string | null
  output: Record<string, { kind?: string; url?: string; text?: string }> | null
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

export function HistoryDialog() {
  const open = useCanvasStore((s) => s.historyOpen)
  const setOpen = useCanvasStore((s) => s.setHistoryOpen)
  const workflow = useCanvasStore((s) => s.workflow)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)

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
        </DialogHeader>

        <ScrollArea className="max-h-[420px] pr-2">
          {loading && items.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-900" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
              <History className="h-8 w-8" />
              <p className="text-xs">暂无执行记录，运行一次工作流试试</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const spec = NODE_SPECS[item.nodeType]
                const outputs = item.output
                  ? Object.values(item.output).filter((o) => o?.url)
                  : []
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 transition hover:border-zinc-700"
                  >
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
