'use client'

/**
 * 作品库对话框：已保存工作流列表（支持按名称搜索）
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
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FolderOpen,
  Trash2,
  Clock3,
  Workflow as WorkflowIcon,
  PenLine,
  Search,
  SearchX,
} from 'lucide-react'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { deleteWorkflow, openWorkflow } from '@/lib/ai-canvas/persistence'

interface WorkflowItem {
  id: string
  name: string
  description: string
  thumbnail?: string | null
  updatedAt: string
}

export function LibraryDialog() {
  const open = useCanvasStore((s) => s.libraryOpen)
  const setOpen = useCanvasStore((s) => s.setLibraryOpen)
  const [items, setItems] = useState<WorkflowItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' })
      const j = await res.json()
      setItems(j.items ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setQuery('') // 每次打开重置搜索，避免残留过滤态
      void refresh()
    }
  }, [open])

  /* 按名称实时过滤（大小写不敏感） */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, query])

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false })
    } catch {
      return iso
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <FolderOpen className="h-4 w-4 text-amber-400" />
            作品库
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            打开已保存的工作流继续创作{items.length > 0 && `（共 ${items.length} 个作品）`}
          </DialogDescription>
        </DialogHeader>

        {/* 名称搜索 */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索作品名称…"
            className="h-8 rounded-lg border-zinc-800 bg-zinc-900/60 pl-8 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-amber-500/50"
          />
        </div>

        <ScrollArea className="max-h-[340px] pr-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-lg bg-zinc-900" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
              <WorkflowIcon className="h-8 w-8" />
              <p className="text-xs">还没有保存的作品，去画布创作吧</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
              <SearchX className="h-8 w-8" />
              <p className="text-xs">没有匹配「{query.trim()}」的作品</p>
              <button
                onClick={() => setQuery('')}
                className="text-[11px] text-amber-300/90 transition hover:text-amber-200"
              >
                清除搜索
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const isCurrent = useCanvasStore.getState().workflow.id === item.id
                return (
                  <div
                    key={item.id}
                    className="group flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3 transition hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={`${item.name} 缩略图`}
                        className="h-11 w-[68px] shrink-0 rounded-md border border-zinc-700/70 object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-[68px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500/20 to-fuchsia-500/20 text-amber-300">
                        <PenLine className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-200">
                        {item.name}
                        {isCurrent && (
                          <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                            当前
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                        <Clock3 className="h-3 w-3" />
                        {fmt(item.updatedAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md border-zinc-700 px-2.5 text-[11px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                      onClick={() => void openWorkflow(item.id)}
                    >
                      打开
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 rounded-md p-0 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300"
                      title="删除"
                      onClick={() => {
                        if (window.confirm(`确定删除「${item.name}」？`)) void deleteWorkflow(item.id).then(refresh)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
