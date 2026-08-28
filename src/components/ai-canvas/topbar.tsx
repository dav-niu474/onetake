'use client'

/**
 * 顶部工具栏：标识 / 工作流命名 / 撤销重做 / 运行 / 保存 / 模板 / 作品库 / 导入导出
 */
import { useRef } from 'react'
import {
  Clapperboard,
  Play,
  Square,
  Save,
  FolderOpen,
  LayoutTemplate,
  FilePlus2,
  Check,
  CloudUpload,
  Loader2,
  Undo2,
  Redo2,
  MoreHorizontal,
  FileDown,
  FileUp,
  PackageOpen,
  History,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import { runWorkflow } from '@/lib/ai-canvas/executor'
import {
  saveWorkflow,
  exportWorkflowJson,
  importWorkflowJson,
} from '@/lib/ai-canvas/persistence'

export function TopBar() {
  const workflow = useCanvasStore((s) => s.workflow)
  const dirty = useCanvasStore((s) => s.dirty)
  const saving = useCanvasStore((s) => s.saving)
  const running = useCanvasStore((s) => s.running)
  const pastLen = useCanvasStore((s) => s.past.length)
  const futureLen = useCanvasStore((s) => s.future.length)
  const setWorkflow = useCanvasStore((s) => s.setWorkflow)
  const setLibraryOpen = useCanvasStore((s) => s.setLibraryOpen)
  const setTemplatesOpen = useCanvasStore((s) => s.setTemplatesOpen)
  const setAssetsOpen = useCanvasStore((s) => s.setAssetsOpen)
  const setHistoryOpen = useCanvasStore((s) => s.setHistoryOpen)
  const setSettingsOpen = useCanvasStore((s) => s.setSettingsOpen)
  const importInputRef = useRef<HTMLInputElement>(null)

  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-zinc-950/95 px-4 backdrop-blur">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-fuchsia-500 shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)]">
          <Clapperboard className="h-4 w-4 text-zinc-950" />
        </span>
        <div className="leading-tight">
          <p className="bg-gradient-to-r from-amber-200 via-orange-200 to-fuchsia-200 bg-clip-text text-[13px] font-bold tracking-wide text-transparent">
            一镜 OneTake
          </p>
          <p className="hidden text-[9px] text-zinc-500 sm:block">节点式 AI 视频创作画布 · 一镜到底一条过</p>
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-zinc-800" />

      {/* 工作流名称 */}
      <input
        value={workflow.name}
        onChange={(e) => setWorkflow({ name: e.target.value })}
        className="w-44 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium text-zinc-200 outline-none transition placeholder:text-zinc-600 hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 lg:w-56"
        placeholder="未命名工作流"
        spellCheck={false}
      />

      {/* 保存状态 */}
      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
        {saving ? (
          <>
            <CloudUpload className="h-3 w-3 animate-pulse text-amber-300" />
            保存中…
          </>
        ) : dirty ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="hidden md:inline">未保存</span>
          </>
        ) : workflow.id ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            <span className="hidden md:inline">已保存</span>
          </>
        ) : null}
      </span>

      <div className="ml-auto flex items-center gap-1">
        {/* 撤销 / 重做 */}
        <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
          <button
            onClick={() => useCanvasStore.getState().undo()}
            disabled={pastLen === 0}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => useCanvasStore.getState().redo()}
            disabled={futureLen === 0}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
            title="重做 (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTemplatesOpen(true)}
          className="h-8 gap-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          <span className="hidden md:inline">模板</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLibraryOpen(true)}
          className="h-8 gap-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="hidden md:inline">作品库</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAssetsOpen(true)}
          className="h-8 gap-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <PackageOpen className="h-3.5 w-3.5" />
          <span className="hidden md:inline">素材库</span>
        </Button>
        <NewWorkflowButton />

        {/* 模型服务设置 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className="h-8 w-8 rounded-md p-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          title="模型服务配置"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* 更多操作 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-md p-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              title="更多操作"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="rounded-lg border-zinc-700/70 bg-zinc-900 text-zinc-200"
          >
            <DropdownMenuItem
              onClick={() => setHistoryOpen(true)}
              className="text-[12px] gap-2 cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-teal-300" />
              运行历史
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={exportWorkflowJson}
              className="text-[12px] gap-2 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5 text-emerald-400" />
              导出工作流 JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => importInputRef.current?.click()}
              className="text-[12px] gap-2 cursor-pointer"
            >
              <FileUp className="h-3.5 w-3.5 text-violet-400" />
              导入工作流 JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importWorkflowJson(f)
            e.target.value = ''
          }}
        />

        <div className="mx-1 h-6 w-px bg-zinc-800" />

        {running ? (
          <Button
            size="sm"
            onClick={() => useCanvasStore.getState().requestRunAbort()}
            className="h-8 gap-1.5 rounded-lg bg-rose-500/90 px-3 text-[12px] font-medium text-white transition hover:bg-rose-500 md:px-4"
          >
            <Square className="h-3 w-3 fill-current" />
            停止
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void runWorkflow()}
            className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 text-[12px] font-semibold text-zinc-950 shadow-[0_0_20px_-6px_rgba(245,158,11,0.7)] transition hover:from-amber-400 hover:to-orange-400 md:px-4"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            运行
          </Button>
        )}
        <SaveButton />
      </div>
    </header>
  )
}

function NewWorkflowButton() {
  const loadGraph = useCanvasStore((s) => s.loadGraph)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      onClick={() => {
        loadGraph({ nodes: [], edges: [] }, { id: null, name: '未命名工作流' })
        useCanvasStore.getState().showToast('info', '已创建空白画布')
      }}
    >
      <FilePlus2 className="h-3.5 w-3.5" />
      <span className="hidden md:inline">新建</span>
    </Button>
  )
}

function SaveButton() {
  const dirty = useCanvasStore((s) => s.dirty)
  const saving = useCanvasStore((s) => s.saving)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void saveWorkflow()}
      disabled={saving}
      className="h-8 gap-1.5 rounded-lg border-zinc-700 bg-zinc-900 px-2.5 text-[12px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 md:px-3"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      <span className="hidden md:inline">保存</span>
      {dirty && <span className="ml-0.5 h-1 w-1 rounded-full bg-amber-400" />}
    </Button>
  )
}
