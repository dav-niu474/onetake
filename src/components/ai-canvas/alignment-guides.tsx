'use client'

/**
 * 节点拖拽对齐参考线（Smart Alignment Guides）
 * 拖动节点时与其他节点的左/中/右、上/中/下边缘接近对齐时显示参考线，
 * editor.tsx 的 onNodeDrag 负责计算并写入 store.guides，本组件只做渲染。
 */
import { useMemo } from 'react'
import { useStore } from '@xyflow/react'
import { useCanvasStore } from '@/lib/ai-canvas/store'

const V_COLOR = '#f0abfc' /* fuchsia-300 */
const H_COLOR = '#f0abfc'

export function AlignmentGuides() {
  const guides = useCanvasStore((s) => s.guides)
  const tx = useStore((s) => s.transform[0])
  const ty = useStore((s) => s.transform[1])
  const zoom = useStore((s) => s.transform[2])

  const hasGuides = guides.vertical.length > 0 || guides.horizontal.length > 0

  /* 线宽按 zoom 取倒数缩放，保证屏幕上是恒定 1px */
  const style = useMemo(
    () => ({
      transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
      transformOrigin: '0 0',
    }),
    [tx, ty, zoom],
  )

  if (!hasGuides) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      <div className="absolute left-0 top-0 h-0 w-0" style={style}>
        {guides.vertical.map((x) => (
          <div
            key={`v-${x}`}
            className="absolute top-[-20000px] h-[40000px] w-0"
            style={{
              left: x,
              borderLeft: `${1 / zoom}px dashed ${V_COLOR}`,
              opacity: 0.85,
              boxShadow: `0 0 ${6 / zoom}px rgba(240,171,252,0.55)`,
            }}
          />
        ))}
        {guides.horizontal.map((y) => (
          <div
            key={`h-${y}`}
            className="absolute left-[-20000px] w-[40000px] h-0"
            style={{
              top: y,
              borderTop: `${1 / zoom}px dashed ${H_COLOR}`,
              opacity: 0.85,
              boxShadow: `0 0 ${6 / zoom}px rgba(240,171,252,0.55)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
