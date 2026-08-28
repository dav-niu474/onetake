'use client'

/**
 * 自定义边：按数据类型着色，源节点运行时显示流动光点
 */
import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { DATA_KIND_META, NODE_SPECS, type CanvasNodeData } from '@/lib/ai-canvas/types'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '@/lib/ai-canvas/store'

const KIND_HEX: Record<string, string> = {
  text: '#34d399',
  image: '#a78bfa',
  video: '#fbbf24',
  audio: '#fb7185',
}

export const CanvasEdge = memo(function CanvasEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const sourceNode = useCanvasStore((s) => s.nodes.find((n) => n.id === source)) as
    | Node<CanvasNodeData>
    | undefined
  const targetNode = useCanvasStore((s) => s.nodes.find((n) => n.id === target)) as
    | Node<CanvasNodeData>
    | undefined

  const spec = NODE_SPECS[sourceNode?.type ?? '']
  const outPort = spec?.outputs.find((o) => o.id === sourceHandleId)
  const kind = outPort?.kind ?? 'text'
  const color = KIND_HEX[kind] ?? '#a1a1aa'
  const meta = DATA_KIND_META[kind as keyof typeof DATA_KIND_META] ?? DATA_KIND_META.text

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const active =
    sourceNode?.data?.runState === 'running' || targetNode?.data?.runState === 'running'
  const done = sourceNode?.data?.runState === 'success'
  const stroke = selected ? color : active ? color : done ? `${color}bb` : `${color}77`

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: selected ? 2.4 : active ? 2.2 : 1.6,
          filter: active ? `drop-shadow(0 0 6px ${color}66)` : undefined,
        }}
      />
      {(active || selected) && (
        <>
          <circle r={3} fill={color}>
            <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={2} fill={`${color}99`}>
            <animateMotion dur="1.4s" begin="0.45s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={1.4} fill={`${color}66`}>
            <animateMotion dur="1.4s" begin="0.9s" repeatCount="indefinite" path={path} />
          </circle>
        </>
      )}
      {/* 悬停提示端口类型 */}
      <title>{`${meta.label}连接：${sourceHandleId} → ${targetHandleId}`}</title>
    </g>
  )
})
