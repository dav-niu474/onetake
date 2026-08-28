'use client'

/**
 * 通用画布节点：根据节点注册表渲染端口 / 参数 / 预览 / 运行状态
 */
import { memo, useCallback, useRef, useState } from 'react'
import { Handle, Position, NodeToolbar, type NodeProps } from '@xyflow/react'
import {
  Type,
  ImagePlus,
  Sparkles,
  Palette,
  Wand2,
  Clapperboard,
  Film,
  Image as ImageIcon,
  MonitorPlay,
  Play,
  Copy,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  UploadCloud,
  Download,
  CircleDashed,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DATA_KIND_META,
  NODE_SPECS,
  type CanvasNodeData,
  type NodeOutput,
  type PortDef,
} from '@/lib/ai-canvas/types'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { runNode } from '@/lib/ai-canvas/executor'
import { getAccent } from './accents'
import { ParamControl } from './param-controls'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Type,
  ImagePlus,
  Sparkles,
  Palette,
  Wand2,
  Clapperboard,
  Film,
  Image: ImageIcon,
  MonitorPlay,
}

/* --------------------------------- 端口行 --------------------------------- */

function PortRow({
  port,
  kind,
  connected,
  side,
}: {
  port: PortDef
  kind: 'target' | 'source'
  connected: boolean
  side: 'left' | 'right'
}) {
  const meta = DATA_KIND_META[port.kind]
  return (
    <div className="relative flex h-6 items-center">
      <Handle
        type={kind}
        position={side === 'left' ? Position.Left : Position.Right}
        id={port.id}
        className={cn(
          '!h-3.5 !w-3.5 !rounded-full !border-2 !bg-zinc-900 transition-transform hover:!scale-125',
          meta.ring,
          side === 'left' ? '!-left-[13px]' : '!-right-[13px]',
          !connected && 'opacity-70',
        )}
        title={port.description ?? `${meta.label} · ${port.label}`}
      />
      <span
        className={cn(
          'pointer-events-none select-none text-[9px] leading-none',
          side === 'left' ? 'pl-0.5' : 'ml-auto pr-0.5',
          connected ? 'text-zinc-400' : 'text-zinc-600',
        )}
      >
        <span className={cn('mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle', meta.dot)} />
        {port.label}
        {port.required === true && side === 'left' && <span className="ml-0.5 text-rose-400/70">*</span>}
        {port.required !== true && side === 'left' && (
          <span className="ml-0.5 text-zinc-700">·可选</span>
        )}
      </span>
    </div>
  )
}

/* ------------------------------ 输出内容预览 ------------------------------ */

function OutputImage({ url, className }: { url?: string; className?: string }) {
  if (!url) return null
  return (
     
    <img
      src={url}
      alt="生成结果"
      className={cn('w-full rounded-lg border border-zinc-700/60 object-cover', className)}
      draggable={false}
    />
  )
}

function OutputVideo({ url }: { url?: string }) {
  if (!url) return null
  return (
    <div className="group/video relative">
      <video
        src={url}
        controls
        playsInline
        className="w-full rounded-lg border border-zinc-700/60 bg-black"
      />
      <a
        href={url}
        download
        nodrag=""
        className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/60 p-1.5 text-zinc-300 backdrop-blur transition hover:bg-black/80 hover:text-white group-hover/video:block"
        title="下载视频"
      >
        <Download className="h-3 w-3" />
      </a>
    </div>
  )
}

function RunningPlaceholder({ label, progress, stage }: { label: string; progress: number; stage?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
        <span className="text-[10px] text-amber-200/90">{stage || label}</span>
        <span className="ml-auto text-[10px] font-mono text-amber-300/80">{progress}%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
        />
      </div>
    </div>
  )
}

/* --------------------------------- 上传区 --------------------------------- */

function UploadZone({ nodeId }: { nodeId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const setNodeOutput = useCanvasStore((s) => s.setNodeOutput)
  const showToast = useCanvasStore((s) => s.showToast)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        showToast('error', '请选择图片文件')
        return
      }
      setUploading(true)
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('读取失败'))
          reader.readAsDataURL(file)
        })
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || '上传失败')
        setNodeOutput(nodeId, 'image', { kind: 'image', url: j.url })
        showToast('success', '图片上传成功')
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : '上传失败')
      } finally {
        setUploading(false)
      }
    },
    [nodeId, setNodeOutput, showToast],
  )

  return (
    <div
      nodrag=""
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files?.[0]
        if (f) void handleFile(f)
      }}
      onClick={() => inputRef.current?.click()}
      className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 py-6 transition hover:border-violet-500/50 hover:bg-violet-500/5"
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
      ) : (
        <UploadCloud className="h-4 w-4 text-zinc-500" />
      )}
      <span className="text-[10px] text-zinc-500">点击或拖拽图片到此处</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* --------------------------------- 节点主体 --------------------------------- */

function NodeBody({
  id,
  type,
  data,
  disabled,
}: {
  id: string
  type: string
  data: CanvasNodeData
  disabled: boolean
}) {
  const updateNodeParam = useCanvasStore((s) => s.updateNodeParam)
  const spec = NODE_SPECS[type]
  const params = data.params ?? {}
  const outputs = data.outputs ?? {}
  const resolvedInputs = data.inputs ?? {}
  const running = data.runState === 'running'

  const setParam = (key: string) => (v: unknown) => updateNodeParam(id, key, v)

  /* 提示词节点 */
  if (type === 'prompt') {
    return (
      <div className="space-y-2">
        <ParamControl
          field={spec!.params[0]}
          value={params.text ?? ''}
          onChange={setParam('text')}
          disabled={disabled}
        />
      </div>
    )
  }

  /* 图片上传节点 */
  if (type === 'imageUpload') {
    const url = outputs.image?.url
    return (
      <div className="space-y-2">
        {url ? (
          <div className="space-y-2">
            <OutputImage url={url} className="max-h-36" />
            <UploadZone nodeId={id} />
          </div>
        ) : (
          <UploadZone nodeId={id} />
        )}
      </div>
    )
  }

  /* 图片/视频预览节点 */
  if (type === 'imagePreview' || type === 'videoPreview') {
    const kind = type === 'imagePreview' ? 'image' : 'video'
    const input: NodeOutput | undefined = resolvedInputs[kind]
    return (
      <div className="space-y-2">
        {input?.url ? (
          kind === 'image' ? (
            <a href={input.url} target="_blank" rel="noreferrer" nodrag="">
              <OutputImage url={input.url} className="max-h-52" />
            </a>
          ) : (
            <OutputVideo url={input.url} />
          )
        ) : (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-zinc-800 py-8">
            {kind === 'image' ? (
              <ImageIcon className="h-5 w-5 text-zinc-700" />
            ) : (
              <MonitorPlay className="h-5 w-5 text-zinc-700" />
            )}
            <span className="text-[10px] text-zinc-600">连接上游后自动展示{kind === 'image' ? '图像' : '视频'}</span>
          </div>
        )}
      </div>
    )
  }

  /* 生成类节点 */
  const showPromptField = spec!.params.some((p) => p.key === 'prompt')
  return (
    <div className="space-y-2">
      {showPromptField && (
        <ParamControl
          field={spec!.params.find((p) => p.key === 'prompt')!}
          value={params.prompt ?? ''}
          onChange={setParam('prompt')}
          disabled={disabled}
        />
      )}
      {spec!.params
        .filter((p) => p.type === 'select' || p.type === 'switch' || p.type === 'slider')
        .map((f) => (
          <ParamControl key={f.key} field={f} value={params[f.key]} onChange={setParam(f.key)} disabled={disabled} />
        ))}

      {type === 'enhancer' && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          {outputs.text?.text ? (
            <p className="max-h-24 overflow-y-auto text-[10px] leading-relaxed text-emerald-300/90 nowheel">
              {outputs.text.text}
            </p>
          ) : (
            <p className="text-[10px] text-zinc-600">运行后此处展示优化后的提示词</p>
          )}
        </div>
      )}

      {(type === 'imageGen' || type === 'imageEdit') && (
        <>
          {running ? (
            <RunningPlaceholder label="生成中" progress={data.progress ?? 0} stage={data.stage} />
          ) : outputs.image?.url ? (
            <OutputImage url={outputs.image.url} className="max-h-44" />
          ) : data.runState === 'failed' ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] text-rose-300">
              {data.error || '生成失败'}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 py-5">
              <CircleDashed className="h-4 w-4 text-zinc-700" />
              <span className="text-[10px] text-zinc-600">尚未生成</span>
            </div>
          )}
        </>
      )}

      {(type === 'textToVideo' || type === 'imageToVideo') && (
        <>
          {running ? (
            <RunningPlaceholder label="视频生成中" progress={data.progress ?? 0} stage={data.stage} />
          ) : outputs.video?.url ? (
            <OutputVideo url={outputs.video.url} />
          ) : data.runState === 'failed' ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] text-rose-300">
              {data.error || '生成失败'}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 py-5">
              <Film className="h-4 w-4 text-zinc-700" />
              <span className="text-[10px] text-zinc-600">尚未生成视频</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ================================== 节点 ================================== */

export const GraphNode = memo(function GraphNode({ id, type, data, selected }: NodeProps) {
  const spec = NODE_SPECS[type ?? '']
  const accent = getAccent(spec?.accent)
  const Icon = ICONS[spec?.icon ?? ''] ?? CircleDashed
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const duplicateNode = useCanvasStore((s) => s.duplicateNode)

  const [editing, setEditing] = useState(false)
  const label = data.label ?? spec?.name ?? type
  const runState = data.runState ?? 'idle'
  const connectedSources = new Set<string>()
  // 端口连接状态用于展示（从 store 读取会带来订阅压力，用 data.inputs 近似）
  Object.keys(data.inputs ?? {}).forEach((k) => connectedSources.add(k))

  if (!spec) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-zinc-900 px-4 py-3 text-xs text-rose-300">
        未知节点类型：{type}
      </div>
    )
  }

  const statusDot =
    runState === 'running'
      ? 'bg-amber-400 animate-pulse'
      : runState === 'success'
        ? 'bg-emerald-400'
        : runState === 'failed'
          ? 'bg-rose-400'
          : runState === 'queued'
            ? 'bg-sky-300 animate-pulse'
            : runState === 'skipped'
              ? 'bg-zinc-600'
              : 'bg-zinc-600/50'

  const borderTone =
    runState === 'running'
      ? 'border-amber-500/50 shadow-[0_0_36px_-10px_rgba(245,158,11,0.45)]'
      : runState === 'failed'
        ? 'border-rose-500/50'
        : selected
          ? 'border-zinc-400/40 shadow-[0_0_36px_-12px_rgba(255,255,255,0.25)]'
          : 'border-zinc-700/80 hover:border-zinc-600'

  return (
    <div
      className={cn(
        'rounded-xl border bg-zinc-900/95 backdrop-blur transition-all duration-200',
        'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.8)]',
        borderTone,
      )}
      style={{ width: spec.width ?? 300 }}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900/95 p-0.5 shadow-xl">
          {spec.executable && (
            <button
              nodrag=""
              className="rounded-md p-1.5 text-amber-300 transition hover:bg-amber-500/15"
              title="仅运行此节点"
              onClick={() => void runNode(id)}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            nodrag=""
            className="rounded-md p-1.5 text-zinc-300 transition hover:bg-zinc-700/60"
            title="复制节点"
            onClick={() => duplicateNode(id)}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            nodrag=""
            className="rounded-md p-1.5 text-rose-300 transition hover:bg-rose-500/15"
            title="删除节点"
            onClick={() => removeNode(id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </NodeToolbar>

      {/* 头部 */}
      <div className={cn('flex items-center gap-2 rounded-t-xl border-b border-zinc-800 bg-gradient-to-r px-3 py-2', accent.gradient)}>
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', accent.chipBg, accent.text)}>
          {runState === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </span>
        {editing ? (
          <input
            autoFocus
            nodrag=""
            defaultValue={label}
            onBlur={(e) => {
              updateNodeData(id, { label: e.target.value.trim() || spec.name })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-100 outline-none"
          />
        ) : (
          <button
            nodrag=""
            onDoubleClick={() => setEditing(true)}
            className="truncate text-left text-[11px] font-semibold text-zinc-100"
            title="双击重命名"
          >
            {label}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {spec.executable && runState !== 'running' && (
            <button
              nodrag=""
              className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-700/50 hover:text-amber-300"
              title="仅运行此节点"
              onClick={() => void runNode(id)}
            >
              <Play className="h-3 w-3" />
            </button>
          )}
          {runState === 'success' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
          {runState === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
          <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
        </div>
      </div>

      {/* 内容 */}
      <div className="space-y-1.5 px-3 py-2.5">
        {spec.inputs.map((inp) => (
          <PortRow key={inp.id} port={inp} kind="target" connected={!!(data.inputs ?? {})[inp.id]} side="left" />
        ))}
        <NodeBody id={id} type={type ?? ''} data={data} disabled={runState === 'running'} />
        {spec.outputs.map((out) => (
          <PortRow key={out.id} port={out} kind="source" connected={!!(data.outputs ?? {})[out.id]} side="right" />
        ))}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center gap-1.5 border-t border-zinc-800/70 px-3 py-1.5">
        <span className={cn('text-[9px]', runState === 'failed' ? 'text-rose-400' : 'text-zinc-600')}>
          {runState === 'failed'
            ? data.error || '执行失败'
            : data.durationMs
              ? `${(data.durationMs / 1000).toFixed(1)}s · ${spec.name}`
              : spec.description.length > 22
                ? spec.description.slice(0, 22) + '…'
                : spec.description}
        </span>
      </div>
    </div>
  )
})
