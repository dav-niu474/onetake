'use client'

/**
 * 模板库对话框：一键载入预置工作流
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { LayoutTemplate, ArrowRight } from 'lucide-react'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { TEMPLATES } from '@/lib/ai-canvas/templates'

export function TemplatesDialog() {
  const open = useCanvasStore((s) => s.templatesOpen)
  const setOpen = useCanvasStore((s) => s.setTemplatesOpen)
  const loadGraph = useCanvasStore((s) => s.loadGraph)
  const showToast = useCanvasStore((s) => s.showToast)

  const apply = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    const graph = tpl.build()
    loadGraph(graph, { id: null, name: tpl.name })
    setOpen(false)
    showToast('success', `已载入模板「${tpl.name}」`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <LayoutTemplate className="h-4 w-4 text-amber-400" />
            工作流模板
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            从模板快速开始，载入后可自由修改
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => apply(tpl.id)}
              className={`group relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br ${tpl.gradient} p-4 text-left transition hover:border-zinc-500 hover:shadow-[0_8px_32px_-12px_rgba(245,158,11,0.3)]`}
            >
              <div className="flex items-start justify-between">
                <Badge className="border-0 bg-zinc-800/80 text-[9px] text-zinc-300 hover:bg-zinc-800">
                  {tpl.tag}
                </Badge>
                <ArrowRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
              </div>
              <h3 className="mt-2.5 text-[14px] font-semibold text-zinc-100">{tpl.name}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{tpl.description}</p>
              <div className="mt-3 flex items-center gap-1">
                {tpl.build().nodes.map((n, i) => (
                  <span key={n.id} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-zinc-700" />}
                    <span className="rounded border border-zinc-700/70 bg-zinc-900/80 px-1.5 py-0.5 text-[9px] text-zinc-400">
                      {n.data.label}
                    </span>
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
