'use client'

/**
 * 素材库对话框：浏览 /generated 与 /uploads 的全部媒体产物，
 * 支持上传 / 删除 / 一键插入画布（生成素材引用节点）
 */
import { useEffect, useRef, useState } from 'react'
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
  PackageOpen,
  Trash2,
  Download,
  Plus,
  Music4,
  Film,
  Image as ImageIcon,
  RefreshCw,
  UploadCloud,
  Loader2,
  Search,
  ArrowDownWideNarrow,
  EyeOff,
  Eye,
  ImageOff,
  Pencil,
  HardDriveDownload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'

interface AssetItem {
  url: string
  kind: 'image' | 'video' | 'audio'
  name: string
  size: number
  mtime: number
}

type KindFilter = 'all' | 'image' | 'video' | 'audio'
type SortMode = 'newest' | 'oldest' | 'largest'

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
]

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'newest', label: '最新优先' },
  { key: 'oldest', label: '最早优先' },
  { key: 'largest', label: '体积最大' },
]

/** 系统自动生成的视频首帧海报（poster_*）默认折叠，避免干扰浏览 */
const isSystemPoster = (name: string) => name.startsWith('poster_')

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function fmtDate(ms: number) {
  try {
    return new Date(ms).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** 素材缩略预览（视频悬停自动播放） */
function AssetThumb({ item }: { item: AssetItem }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  if (item.kind === 'image') {
    return (
      <img
        src={item.url}
        alt={item.name}
        loading="lazy"
        className="h-full w-full object-cover"
        draggable={false}
      />
    )
  }
  if (item.kind === 'video') {
    return (
      <video
        ref={videoRef}
        src={item.url}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onMouseEnter={() => void videoRef.current?.play().catch(() => undefined)}
        onMouseLeave={() => {
          videoRef.current?.pause()
          if (videoRef.current) videoRef.current.currentTime = 0
        }}
      />
    )
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-rose-500/15 to-fuchsia-500/10">
      <Music4 className="h-5 w-5 text-rose-300" />
      <audio src={item.url} controls className="h-6 w-[85%] scale-90" />
    </div>
  )
}

export function AssetsDialog() {
  const open = useCanvasStore((s) => s.assetsOpen)
  const setOpen = useCanvasStore((s) => s.setAssetsOpen)
  const showToast = useCanvasStore((s) => s.showToast)
  const [items, setItems] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')
  const [showPosters, setShowPosters] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/assets', { cache: 'no-store' })
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

  const insertAsset = (item: AssetItem) => {
    window.dispatchEvent(
      new CustomEvent('ai-canvas:insert-asset', {
        detail: { kind: item.kind, url: item.url, name: item.name },
      }),
    )
    setOpen(false)
  }

  const handleUpload = async (file: File) => {
    if (file.size > 80 * 1024 * 1024) {
      showToast('error', '文件过大（上限 80MB）')
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
      showToast('success', '素材上传成功')
      await refresh()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const removeAsset = async (item: AssetItem) => {
    /* 先查询引用情况，让用户在知情下确认删除 */
    let refNote = ''
    try {
      const res = await fetch(`/api/assets?refs=${encodeURIComponent(item.url)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const j = (await res.json()) as { refs?: number; workflows?: number }
        const n = Number(j.refs ?? 0)
        const w = Number(j.workflows ?? 0)
        if (n > 0) {
          refNote = `\n\n⚠️ 该素材正被 ${w} 个工作流中的 ${n} 处节点引用，删除后这些引用将失效（节点需重新插入素材）。`
        }
      }
    } catch {
      /* 引用查询失败不阻塞删除流程 */
    }
    if (!window.confirm(`确定删除素材「${item.name}」？${refNote || '删除后不可恢复。'}`)) return
    try {
      const res = await fetch(`/api/assets?url=${encodeURIComponent(item.url)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('删除失败')
      showToast('success', '素材已删除')
      await refresh()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '删除失败')
    }
  }

  const renameAsset = async (item: AssetItem) => {
    const name = window.prompt('重命名素材（保留原扩展名）', item.name)
    if (!name || !name.trim() || name.trim() === item.name) return
    try {
      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, name: name.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '重命名失败')
      const refs = Number(j.updatedRefs ?? 0)
      showToast(
        'success',
        refs > 0
          ? `已重命名为「${j.name}」，同步更新画布引用 ${refs} 处`
          : `已重命名为「${j.name}」`,
      )
      await refresh()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '重命名失败')
    }
  }

  const exportAsset = async (item: AssetItem) => {
    try {
      const res = await fetch('/api/assets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '导出失败')
      showToast('success', `已导出到 download/${j.name}`)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '导出失败')
    }
  }

  /* 过滤：类型 + 系统海报开关 + 关键词；再按排序规则排列 */
  const posterHidden = items.filter((i) => isSystemPoster(i.name) && !showPosters).length
  const visibleItems = items.filter(
    (i) => showPosters || !isSystemPoster(i.name),
  )
  const counts = {
    all: visibleItems.length,
    image: visibleItems.filter((i) => i.kind === 'image').length,
    video: visibleItems.filter((i) => i.kind === 'video').length,
    audio: visibleItems.filter((i) => i.kind === 'audio').length,
  }
  const filtered = visibleItems
    .filter((i) => filter === 'all' || i.kind === filter)
    .filter((i) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return i.name.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sort === 'oldest') return a.mtime - b.mtime
      if (sort === 'largest') return b.size - a.size
      return b.mtime - a.mtime
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <PackageOpen className="h-4 w-4 text-sky-300" />
            素材库
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            历史生成的图片 / 视频 / 音频与上传素材，一键插入画布复用
          </DialogDescription>
        </DialogHeader>

        {/* 工具栏：筛选 + 搜索 + 排序 + 上传 + 刷新 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] transition',
                filter === t.key
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
              )}
            >
              {t.label}
              <span className="ml-1 text-[9px] opacity-60">{counts[t.key]}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              className="h-7 gap-1.5 rounded-md border-zinc-700 px-2.5 text-[11px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UploadCloud className="h-3 w-3" />
              )}
              上传素材
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 rounded-md p-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="刷新"
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* 搜索 / 排序 / 系统海报开关 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[150px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件名…"
              className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 pl-7 pr-2 text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-sky-500/50 focus:bg-zinc-900"
            />
          </div>
          <div className="flex items-center overflow-hidden rounded-md border border-zinc-800">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                title={o.label}
                className={cn(
                  'flex h-7 items-center gap-1 border-l border-zinc-800 px-2 text-[10px] transition first:border-l-0',
                  sort === o.key
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'bg-zinc-900/60 text-zinc-500 hover:text-zinc-300',
                )}
              >
                <ArrowDownWideNarrow className={cn('h-2.5 w-2.5', o.key === 'largest' && 'rotate-90')} />
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPosters((v) => !v)}
            title={showPosters ? '隐藏系统海报（视频首帧自动生成）' : '显示系统海报'}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] transition',
              showPosters
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
            )}
          >
            {showPosters ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
            海报{!showPosters && posterHidden > 0 ? ` ${posterHidden}` : ''}
          </button>
        </div>

        <ScrollArea className="max-h-[420px] pr-2">
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-video animate-pulse rounded-lg bg-zinc-900" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
              {query.trim() || filter !== 'all' ? (
                <>
                  <ImageOff className="h-8 w-8" />
                  <p className="text-xs">没有匹配的素材，试试调整筛选或关键词</p>
                  <button
                    onClick={() => {
                      setQuery('')
                      setFilter('all')
                    }}
                    className="mt-1 rounded-md border border-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    清除筛选条件
                  </button>
                </>
              ) : (
                <>
                  <PackageOpen className="h-8 w-8" />
                  <p className="text-xs">暂无素材，去画布生成或在上方上传</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {filtered.map((item) => (
                <div
                  key={item.url}
                  className="group overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/60 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
                    <AssetThumb item={item} />
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-zinc-300 backdrop-blur">
                      {item.kind === 'image' ? (
                        <ImageIcon className="h-2.5 w-2.5 text-violet-300" />
                      ) : item.kind === 'video' ? (
                        <Film className="h-2.5 w-2.5 text-amber-300" />
                      ) : (
                        <Music4 className="h-2.5 w-2.5 text-rose-300" />
                      )}
                      {fmtSize(item.size)}
                    </span>
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="truncate text-[10px] text-zinc-300" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-[9px] text-zinc-600">{fmtDate(item.mtime)}</p>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <button
                        onClick={() => insertAsset(item)}
                        className="flex h-6 min-w-[84px] flex-1 items-center justify-center gap-1 rounded-md bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-[10px] font-medium text-zinc-950 transition hover:from-amber-400 hover:to-orange-400"
                        title="插入画布（生成素材引用节点）"
                      >
                        <Plus className="h-3 w-3" />
                        插入画布
                      </button>
                      <div className="flex items-center">
                        <a
                          href={item.url}
                          download={item.name}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                          title="浏览器下载"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                        <button
                          onClick={() => void exportAsset(item)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-sky-500/15 hover:text-sky-300"
                          title="导出到 download 归档目录"
                        >
                          <HardDriveDownload className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => void renameAsset(item)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                          title="重命名"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => void removeAsset(item)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                          title="删除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4,video/webm,audio/wav,audio/mpeg,audio/mp3"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
            e.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
