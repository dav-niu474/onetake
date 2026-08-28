'use client'

/**
 * 左侧节点面板：分组展示全部节点，支持拖拽 / 点击添加
 */
import { useReactFlow } from '@xyflow/react'
import {
  Type,
  ImagePlus,
  Sparkles,
  Palette as PaletteIcon,
  Wand2,
  Clapperboard,
  Film,
  Image as ImageIcon,
  MonitorPlay,
  ChevronDown,
  GripVertical,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  CATEGORY_META,
  NODE_TYPE_LIST,
  type NodeCategory,
} from '@/lib/ai-canvas/types'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { getAccent } from './nodes/accents'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Type,
  ImagePlus,
  Sparkles,
  Palette: PaletteIcon,
  Wand2,
  Clapperboard,
  Film,
  Image: ImageIcon,
  MonitorPlay,
}

export function Palette() {
  const open = useCanvasStore((s) => s.paletteOpen)
  const setOpen = useCanvasStore((s) => s.setPaletteOpen)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-3 top-1/2 z-10 flex h-16 w-7 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-700/70 bg-zinc-900/90 text-zinc-400 shadow-xl backdrop-blur transition hover:text-zinc-200"
        title="展开节点面板"
      >
        <span className="h-1 w-1 rounded-full bg-zinc-500" />
        <span className="h-1 w-1 rounded-full bg-zinc-500" />
        <span className="h-1 w-1 rounded-full bg-zinc-500" />
      </button>
    )
  }

  const categories = Object.keys(CATEGORY_META).sort(
    (a, b) => CATEGORY_META[a as NodeCategory].order - CATEGORY_META[b as NodeCategory].order,
  )

  return (
    <aside className="relative z-10 flex h-full w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div>
          <h2 className="text-[13px] font-semibold text-zinc-100">节点库</h2>
          <p className="text-[10px] text-zinc-500">拖拽或点击添加到画布</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          title="收起面板"
        >
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {categories.map((cat) => {
          const key = cat as NodeCategory
          const items = NODE_TYPE_LIST.filter((n) => n.category === key)
          if (items.length === 0) return null
          const isCollapsed = collapsed[key]
          return (
            <div key={key}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
                className="mb-1.5 flex w-full items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', isCollapsed && '-rotate-90')} />
                {CATEGORY_META[key].label}
                <span className="ml-auto font-normal text-zinc-700">{items.length}</span>
              </button>
              {!isCollapsed && (
                <div className="space-y-1.5">
                  {items.map((item) => {
                    const accent = getAccent(item.accent)
                    const Icon = ICONS[item.icon] ?? GripVertical
                    return (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/ai-node', item.type)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('ai-canvas:add-node', { detail: item.type }),
                          )
                        }}
                        className={cn(
                          'group cursor-grab rounded-lg border border-zinc-800/80 bg-zinc-900/70 p-2.5 transition active:cursor-grabbing',
                          'hover:border-zinc-600 hover:bg-zinc-800/70',
                        )}
                        title={item.description}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition group-hover:scale-105',
                              accent.chipBg,
                              accent.text,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium text-zinc-200">{item.name}</p>
                            <p className="truncate text-[9px] text-zinc-500">{item.description}</p>
                          </div>
                          <GripVertical className="ml-auto h-3 w-3 shrink-0 text-zinc-700 opacity-0 transition group-hover:opacity-100" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t border-zinc-800/80 px-4 py-2.5">
        <p className="text-[9px] leading-relaxed text-zinc-600">
          快捷键：<kbd className="rounded bg-zinc-800 px-1">Ctrl+Enter</kbd> 运行 ·{' '}
          <kbd className="rounded bg-zinc-800 px-1">Ctrl+S</kbd> 保存 · 画布右键添加节点
        </p>
      </div>
    </aside>
  )
}
