'use client'

/**
 * 分组渲染层（overlay 方案）：
 * 分组框不作为 React Flow 节点插入 nodes 数组（避免污染执行引擎 / 复制粘贴 /
 * 持久化等全部节点遍历逻辑），而是独立图层跟随视口 transform 渲染。
 *
 * 交互：
 * - 框体跟随成员节点的包围盒自动计算位置与尺寸
 * - 拖拽框体 = 整体平移全部成员（绝对定位 + 偏移量，无累积漂移）
 * - 双击标签重命名；头部工具条支持换色 / 折叠 / 解组；右键呼出分组菜单
 * - 折叠：成员节点隐藏（node.hidden），框体收起为紧凑卡片，可拖拽移动
 */

import { useMemo, useRef } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import {
  Users,
  Ungroup as UngroupIcon,
  Pencil,
  ChevronsLeft,
  ChevronsRight,
  Boxes,
} from 'lucide-react'
import { useCanvasStore, type CanvasGroup } from '@/lib/ai-canvas/store'
import { NODE_SPECS, getGroupColor } from '@/lib/ai-canvas/types'
import { cn } from '@/lib/utils'

/** 框体相对成员包围盒的外边距（标签栏渲染于框体内部顶部） */
const PAD_X = 28
const PAD_TOP = 44
const PAD_BOTTOM = 28

/** 折叠卡片尺寸 */
const CARD_W = 216
const CARD_H = 64

/** 估算节点尺寸（优先实测值，回退注册表宽度与估计高度） */
function nodeSize(n: { id: string; type?: string; measured?: { width?: number; height?: number } | null }) {
  const w = n.measured?.width ?? NODE_SPECS[n.type ?? '']?.width ?? 280
  const h = n.measured?.height ?? 120
  return { w, h }
}

export interface GroupBounds {
  group: CanvasGroup
  x: number
  y: number
  w: number
  h: number
  missing: number
}

/** 计算全部分组的包围盒（折叠组返回锚定成员左上角的固定卡片尺寸） */
export function computeGroupBounds(
  groups: CanvasGroup[],
  nodes: { id: string; type?: string; position: { x: number; y: number }; measured?: { width?: number; height?: number } | null }[],
): GroupBounds[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: GroupBounds[] = []
  for (const g of groups) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let missing = 0
    for (const id of g.nodeIds) {
      const n = byId.get(id)
      if (!n) {
        missing++
        continue
      }
      const { w, h } = nodeSize(n)
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }
    if (minX === Infinity) continue
    if (g.collapsed) {
      out.push({ group: g, x: minX, y: minY, w: CARD_W, h: CARD_H, missing })
    } else {
      out.push({
        group: g,
        x: minX - PAD_X,
        y: minY - PAD_TOP,
        w: maxX - minX + PAD_X * 2,
        h: maxY - minY + PAD_TOP + PAD_BOTTOM,
        missing,
      })
    }
  }
  return out
}

/** 分组框/卡片通用拖拽：整体平移全部成员（含隐藏节点） */
function useGroupDrag() {
  const { screenToFlowPosition } = useReactFlow()
  const dragState = useRef<{
    startFlow: { x: number; y: number }
    starts: Record<string, { x: number; y: number }>
    moved: boolean
  } | null>(null)

  const onMouseDown = (e: React.MouseEvent, group: CanvasGroup) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-frame-ui]')) return // 头部按钮不触发拖拽
    e.stopPropagation()
    useCanvasStore.getState().setSelectedGroupId(group.id)
    const store = useCanvasStore.getState()
    const members = store.nodes.filter((n) => group.nodeIds.includes(n.id))
    if (members.length === 0) return
    const startFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const starts: Record<string, { x: number; y: number }> = {}
    members.forEach((m) => {
      starts[m.id] = { x: m.position.x, y: m.position.y }
    })
    dragState.current = { startFlow, starts, moved: false }

    const onMove = (ev: MouseEvent) => {
      const ds = dragState.current
      if (!ds) return
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const dx = p.x - ds.startFlow.x
      const dy = p.y - ds.startFlow.y
      if (!ds.moved && Math.abs(dx) + Math.abs(dy) < 3) return
      if (!ds.moved) {
        ds.moved = true
        useCanvasStore.getState().commit() // 首次实际移动前快照，供撤销
      }
      useCanvasStore.getState().translateNodesTo(ds.starts, { x: dx, y: dy })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (dragState.current?.moved) {
        useCanvasStore.getState().setDirty(true)
      }
      dragState.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return onMouseDown
}

interface GroupFrameProps {
  bounds: GroupBounds
  selected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function GroupFrame({ bounds, selected, onSelect, onContextMenu }: GroupFrameProps) {
  const { group, x, y, w, h } = bounds
  const color = getGroupColor(group.color)
  const startDrag = useGroupDrag()

  const rename = () => {
    const name = window.prompt('重命名分组', group.name)
    if (name && name.trim()) {
      useCanvasStore.getState().renameGroup(group.id, name.trim())
    }
  }

  const ungroup = (e: React.MouseEvent) => {
    e.stopPropagation()
    useCanvasStore.getState().ungroup(group.id)
  }

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    useCanvasStore.getState().toggleGroupCollapse(group.id)
  }

  if (group.collapsed) {
    return (
      <div
        data-group-frame={group.id}
        className={cn(
          'pointer-events-auto group absolute cursor-grab overflow-hidden rounded-xl border shadow-[0_10px_36px_-14px_rgba(0,0,0,0.9)] backdrop-blur transition-all hover:shadow-[0_14px_44px_-14px_rgba(0,0,0,1)] active:cursor-grabbing',
          color.border,
          color.bg,
          selected && 'ring-1 ring-white/20',
        )}
        style={{ left: x, top: y, width: w, height: h }}
        onMouseDown={(e) => startDrag(e, group)}
        onContextMenu={onContextMenu}
        onDoubleClick={toggleCollapse}
        title="双击展开分组"
      >
        {/* 渐变装饰条 */}
        <span className={cn('absolute inset-x-0 top-0 h-[3px] opacity-80', color.dot)} />
        <div className="flex h-full items-center gap-2.5 px-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
              color.border,
              color.chip,
            )}
          >
            <Boxes className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-zinc-100">{group.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-500">
              <Users className="h-2.5 w-2.5" />
              {group.nodeIds.length} 个节点 · 已折叠
            </p>
          </div>
          {selected && (
            <span className="flex items-center gap-0.5 rounded-md border border-zinc-700/80 bg-zinc-900/90 p-0.5 shadow-sm" data-frame-ui>
              <button
                onClick={toggleCollapse}
                className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-emerald-300"
                title="展开分组"
              >
                <ChevronsRight className="h-3 w-3" />
              </button>
              <button
                onClick={ungroup}
                className="rounded p-1 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                title="解组（保留节点）"
              >
                <UngroupIcon className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-group-frame={group.id}
      className={cn(
        'pointer-events-auto absolute cursor-grab rounded-2xl border-2 border-dashed transition-shadow active:cursor-grabbing',
        color.border,
        color.bg,
        selected && 'shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_40px_-12px_rgba(0,0,0,0.8)]',
      )}
      style={{ left: x, top: y, width: w, height: h }}
      onMouseDown={(e) => startDrag(e, group)}
      onContextMenu={onContextMenu}
    >
      {/* 标签栏（框体内部顶部，避免被顶栏遮挡） */}
      <div
        className="pointer-events-auto absolute left-2.5 top-2 flex max-w-[calc(100%-16px)] items-center gap-1.5"
        onDoubleClick={(e) => {
          e.stopPropagation()
          rename()
        }}
      >
        <span
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium shadow-sm backdrop-blur',
            color.chip,
          )}
        >
          <Users className="h-3 w-3 opacity-70" />
          <span className="max-w-[160px] truncate">{group.name}</span>
          <span className="opacity-60">· {group.nodeIds.length}</span>
        </span>
        {selected && (
          <span className="flex items-center gap-0.5 rounded-md border border-zinc-700/80 bg-zinc-900/90 p-0.5 shadow-sm backdrop-blur" data-frame-ui>
            <button
              onClick={toggleCollapse}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-sky-300"
              title="折叠分组（收起为卡片）"
            >
              <ChevronsLeft className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                rename()
              }}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              title="重命名（双击标签同效）"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={ungroup}
              className="rounded p-1 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-300"
              title="解组（保留节点）"
            >
              <UngroupIcon className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {/* 四角装饰 */}
      <span className={cn('absolute -left-[2px] -top-[2px] h-2.5 w-2.5 rounded-tl-xl border-l-2 border-t-2', color.border)} />
      <span className={cn('absolute -right-[2px] -top-[2px] h-2.5 w-2.5 rounded-tr-xl border-r-2 border-t-2', color.border)} />
      <span className={cn('absolute -bottom-[2px] -left-[2px] h-2.5 w-2.5 rounded-bl-xl border-b-2 border-l-2', color.border)} />
      <span className={cn('absolute -bottom-[2px] -right-[2px] h-2.5 w-2.5 rounded-br-xl border-b-2 border-r-2', color.border)} />
    </div>
  )
}

export function GroupLayer({
  onGroupContextMenu,
}: {
  onGroupContextMenu: (e: React.MouseEvent, groupId: string) => void
}) {
  const groups = useCanvasStore((s) => s.groups)
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedGroupId = useCanvasStore((s) => s.selectedGroupId)
  const setSelectedGroupId = useCanvasStore((s) => s.setSelectedGroupId)
  const tx = useStore((s) => s.transform[0])
  const ty = useStore((s) => s.transform[1])
  const zoom = useStore((s) => s.transform[2])

  const bounds = useMemo(() => computeGroupBounds(groups, nodes), [groups, nodes])

  if (groups.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div
        className="absolute left-0 top-0 h-0 w-0"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {bounds.map((b) => (
          <GroupFrame
            key={b.group.id}
            bounds={b}
            selected={selectedGroupId === b.group.id}
            onSelect={() => setSelectedGroupId(b.group.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setSelectedGroupId(b.group.id)
              onGroupContextMenu(e, b.group.id)
            }}
          />
        ))}
      </div>
    </div>
  )
}
