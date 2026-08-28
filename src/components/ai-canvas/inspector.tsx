'use client'

/**
 * 右侧 Inspector 属性面板：选中单个节点时展示
 * 大屏参数编辑 / 端口连接状态 / 输出详情 / 运行信息 / 快捷操作
 */
import { useMemo } from 'react'
import {
  X,
  Play,
  Copy,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Download,
  CircleDashed,
  PlugZap,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DATA_KIND_META,
  NODE_SPECS,
  RUN_STATE_META,
  type CanvasNodeData,
  type NodeOutput,
} from '@/lib/ai-canvas/types'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { runNode } from '@/lib/ai-canvas/executor'
import { getAccent } from './nodes/accents'
import { ParamControl } from './nodes/param-controls'
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
  AudioLines,
  Volume2,
  Merge,
} from 'lucide-react'

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
  AudioLines,
  Volume2,
  Merge,
}

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-b border-zinc-800/70">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
        {icon}
        {title}
        <svg
          viewBox="0 0 24 24"
          className="ml-auto h-3 w-3 text-zinc-600 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="space-y-3 px-3.5 pb-3.5">{children}</div>
    </details>
  )
}

function OutputPreview({ output }: { output: NodeOutput }) {
  const meta = DATA_KIND_META[output.kind]
  if (output.kind === 'image' && output.url) {
    return (
      <a href={output.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={output.url}
          alt="输出图像"
          className="w-full rounded-lg border border-zinc-700/60 object-cover"
        />
      </a>
    )
  }
  if (output.kind === 'video' && output.url) {
    return <video src={output.url} controls playsInline className="w-full rounded-lg border border-zinc-700/60 bg-black" />
  }
  if (output.kind === 'audio' && output.url) {
    return (
      <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-2">
        <audio src={output.url} controls className="h-8 w-full" />
        <a
          href={output.url}
          download
          className="mt-1 flex items-center gap-1 text-[9px] text-zinc-400 transition hover:text-rose-300"
        >
          <Download className="h-2.5 w-2.5" />
          下载音频
        </a>
      </div>
    )
  }
  if (output.kind === 'text' && output.text) {
    return (
      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-[10px] leading-relaxed text-emerald-300/90 scrollbar-thin">
        {output.text}
      </p>
    )
  }
  return (
    <p className="text-[10px] text-zinc-600">
      {meta.label} · 无内容
    </p>
  )
}

export function Inspector() {
  /* 选中单个节点时展示面板 */
  const node = useCanvasStore((s) => {
    const sel = s.nodes.filter((n) => n.selected)
    return sel.length === 1 ? sel[0] : null
  })
  const edges = useCanvasStore((s) => s.edges)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const updateNodeParam = useCanvasStore((s) => s.updateNodeParam)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const duplicateNode = useCanvasStore((s) => s.duplicateNode)
  const deselect = useCanvasStore((s) => s.onNodesChange)

  const inEdges = useMemo(
    () => (node ? edges.filter((e) => e.target === node.id) : []),
    [edges, node],
  )
  const outEdges = useMemo(
    () => (node ? edges.filter((e) => e.source === node.id) : []),
    [edges, node],
  )

  if (!node) return null
  const spec = NODE_SPECS[node.type ?? '']
  if (!spec) return null

  const accent = getAccent(spec.accent)
  const Icon = ICONS[spec.icon] ?? CircleDashed
  const data = node.data as CanvasNodeData
  const params = data.params ?? {}
  const outputs = data.outputs ?? {}
  const runState = data.runState ?? 'idle'
  const runMeta = RUN_STATE_META[runState]
  const connectedInputHandles = new Set(inEdges.map((e) => e.targetHandle ?? ''))

  const close = () =>
    deselect([{ id: node.id, type: 'select', selected: false }])

  return (
    <aside
      className="absolute bottom-12 right-3 top-3 z-20 hidden w-[292px] flex-col overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-950/97 shadow-2xl backdrop-blur md:flex animate-in fade-in slide-in-from-right-3 duration-200"
      nodrag=""
    >
      {/* 头部 */}
      <div className={cn('flex items-center gap-2 border-b border-zinc-800 bg-gradient-to-r px-3.5 py-3', accent.gradient)}>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', accent.chipBg, accent.text)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={data.label ?? spec.name}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-semibold text-zinc-100 outline-none transition hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900"
            spellCheck={false}
            title="点击重命名"
          />
          <p className="px-1 text-[9px] text-zinc-500">{spec.name} · {spec.category === 'input' ? '输入' : spec.category === 'generate' ? 'AI 生成' : spec.category === 'process' ? '处理' : '输出'}</p>
        </div>
        <button
          onClick={close}
          className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          title="关闭面板 (Esc 取消选中)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 内容滚动区 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {/* 运行状态 */}
        <Section title="运行状态" icon={<Info className="h-3 w-3" />}>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
            {runState === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
            ) : runState === 'success' ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : runState === 'failed' ? (
              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5 text-zinc-600" />
            )}
            <span className={cn('text-[11px] font-medium', runMeta.color)}>{runMeta.label}</span>
            {data.durationMs ? (
              <span className="ml-auto font-mono text-[9px] text-zinc-500">
                {(data.durationMs / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
          {data.stage && runState !== 'failed' && (
            <p className="text-[10px] text-zinc-500">{data.stage}</p>
          )}
          {runState === 'failed' && data.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] leading-relaxed text-rose-300">
              {data.error}
            </div>
          )}
          {spec.executable && runState !== 'running' && (
            <button
              onClick={() => void runNode(node.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20"
            >
              <Play className="h-3 w-3" />
              {runState === 'failed' ? '重试此节点' : '仅运行此节点'}
            </button>
          )}
        </Section>

        {/* 参数 */}
        {spec.params.length > 0 && (
          <Section title="参数设置" icon={<Info className="h-3 w-3" />}>
            {spec.params.map((f) => (
              <ParamControl
                key={f.key}
                field={f}
                value={params[f.key]}
                onChange={(v) => updateNodeParam(node.id, f.key, v)}
                disabled={runState === 'running'}
              />
            ))}
          </Section>
        )}

        {/* 端口与连线 */}
        <Section title="端口与连线" icon={<PlugZap className="h-3 w-3" />}>
          <div className="space-y-1.5">
            {spec.inputs.length === 0 && spec.outputs.length === 0 && (
              <p className="text-[10px] text-zinc-600">该节点无端口</p>
            )}
            {spec.inputs.map((inp) => {
              const meta = DATA_KIND_META[inp.kind]
              const connected = connectedInputHandles.has(inp.id)
              return (
                <div key={inp.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                  <span className="text-[10px] text-zinc-300">{inp.label}</span>
                  <span className="text-[8px] text-zinc-600">输入 · {meta.label}</span>
                  <span
                    className={cn(
                      'ml-auto rounded px-1.5 py-0.5 text-[8px]',
                      connected
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : inp.required
                          ? 'bg-rose-500/10 text-rose-300/80'
                          : 'bg-zinc-800 text-zinc-500',
                    )}
                  >
                    {connected ? '已连接' : inp.required ? '未连接 · 必需' : '未连接'}
                  </span>
                </div>
              )
            })}
            {spec.outputs.map((out) => {
              const meta = DATA_KIND_META[out.kind]
              const connected = outEdges.some((e) => e.sourceHandle === out.id)
              return (
                <div key={out.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                  <span className="text-[10px] text-zinc-300">{out.label}</span>
                  <span className="text-[8px] text-zinc-600">输出 · {meta.label}</span>
                  <span
                    className={cn(
                      'ml-auto rounded px-1.5 py-0.5 text-[8px]',
                      connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-500',
                    )}
                  >
                    {connected ? `已连 ${outEdges.filter((e) => e.sourceHandle === out.id).length} 项` : '未使用'}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>

        {/* 输出结果 */}
        {Object.keys(outputs).length > 0 && (
          <Section title="输出结果" icon={<Check className="h-3 w-3" />}>
            {Object.entries(outputs).map(([handleId, out]) =>
              out ? (
                <div key={handleId} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full', DATA_KIND_META[out.kind].dot)} />
                    <span className="text-[9px] font-medium text-zinc-400">
                      {handleId} · {DATA_KIND_META[out.kind].label}
                    </span>
                  </div>
                  <OutputPreview output={out} />
                  {out.meta && Object.keys(out.meta).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(out.meta).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[8px] text-zinc-400"
                        >
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null,
            )}
          </Section>
        )}

        {/* 节点说明 */}
        <Section title="节点说明" icon={<Info className="h-3 w-3" />} defaultOpen={false}>
          <p className="text-[10px] leading-relaxed text-zinc-500">{spec.description}</p>
          <p className="text-[9px] leading-relaxed text-zinc-600">
            类型 <span className="font-mono text-zinc-500">{spec.type}</span> · ID{' '}
            <span className="font-mono text-zinc-500">{node.id}</span>
          </p>
        </Section>
      </div>

      {/* 底部操作 */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-zinc-800/80 bg-zinc-950/95 p-2">
        <button
          onClick={() => duplicateNode(node.id)}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700/70 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          <Copy className="h-3 w-3" />
          复制
        </button>
        <button
          onClick={() => {
            removeNode(node.id)
          }}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 py-1.5 text-[10px] text-rose-300 transition hover:bg-rose-500/20"
        >
          <Trash2 className="h-3 w-3" />
          删除
        </button>
      </div>
    </aside>
  )
}
