'use client'

/**
 * 模型服务配置对话框：按能力维度（LLM / 图像 / TTS / 视频）配置模型供应商，
 * 支持 OpenAI 兼容协议自定义接入（Base URL + API Key + 模型名），
 * 保存后执行引擎按能力路由；视频暂锁定内置智谱。
 */
import { useEffect, useState } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Sparkles,
  Image as ImageIcon,
  AudioLines,
  Film,
  Loader2,
  Settings2,
  PlugZap,
  CheckCircle2,
  XCircle,
  Lock,
  KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'

type Capability = 'llm' | 'image' | 'tts' | 'video'

const CAPS: Capability[] = ['llm', 'image', 'tts', 'video']

interface ProviderView {
  capability: Capability
  providerKind: string
  baseUrl: string
  apiKeyMask: string
  hasKey: boolean
  model: string
  voice: string
  enabled: boolean
}

interface Draft {
  providerKind: 'builtin' | 'openai_compatible'
  baseUrl: string
  apiKey: string // '' = 不修改；'-' = 清除；其他 = 覆盖
  model: string
  voice: string
  enabled: boolean
}

interface TestState {
  status: 'testing' | 'ok' | 'fail'
  message: string
  latencyMs?: number
}

const CAP_META: Record<
  Capability,
  { title: string; desc: string; icon: React.ReactNode; accent: string; customDesc: string }
> = {
  llm: {
    title: '文本生成 LLM',
    desc: '提示词优化（enhancer 节点）',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    accent: 'text-emerald-300',
    customDesc: 'OpenAI 兼容 /chat/completions，用于提示词扩写',
  },
  image: {
    title: '图像生成',
    desc: '文生图（imageGen 节点）',
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    accent: 'text-violet-300',
    customDesc: 'OpenAI 兼容 /images/generations，兼容 b64_json 与 url 响应',
  },
  tts: {
    title: '语音合成 TTS',
    desc: '文案转配音（tts 节点）',
    icon: <AudioLines className="h-3.5 w-3.5" />,
    accent: 'text-rose-300',
    customDesc: 'OpenAI 兼容 /audio/speech，输出二进制音频（默认 wav）',
  },
  video: {
    title: '视频生成',
    desc: '文生视频 / 图生视频',
    icon: <Film className="h-3.5 w-3.5" />,
    accent: 'text-amber-300',
    customDesc: '',
  },
}

function emptyDraft(): Draft {
  return { providerKind: 'builtin', baseUrl: '', apiKey: '', model: '', voice: '', enabled: true }
}

function draftOf(v: ProviderView): Draft {
  return {
    providerKind: v.providerKind === 'openai_compatible' ? 'openai_compatible' : 'builtin',
    baseUrl: v.baseUrl ?? '',
    apiKey: '',
    model: v.model ?? '',
    voice: v.voice ?? '',
    enabled: v.enabled,
  }
}

export function SettingsDialog() {
  const open = useCanvasStore((s) => s.settingsOpen)
  const setOpen = useCanvasStore((s) => s.setSettingsOpen)
  const showToast = useCanvasStore((s) => s.showToast)

  const [views, setViews] = useState<Record<Capability, ProviderView> | null>(null)
  const [drafts, setDrafts] = useState<Record<Capability, Draft> | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tests, setTests] = useState<Partial<Record<Capability, TestState>>>({})

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/providers', { cache: 'no-store' })
      const j = (await res.json()) as { items?: ProviderView[]; error?: string }
      if (!res.ok) throw new Error(j.error || '读取配置失败')
      const nextViews = {} as Record<Capability, ProviderView>
      const nextDrafts = {} as Record<Capability, Draft>
      for (const cap of CAPS) {
        const item = (j.items ?? []).find((i) => i.capability === cap)
        if (item) {
          nextViews[cap] = item
          nextDrafts[cap] = draftOf(item)
        } else {
          nextViews[cap] = {
            capability: cap,
            providerKind: 'builtin',
            baseUrl: '',
            apiKeyMask: '',
            hasKey: false,
            model: '',
            voice: '',
            enabled: true,
          }
          nextDrafts[cap] = emptyDraft()
        }
      }
      setViews(nextViews)
      setDrafts(nextDrafts)
      setTests({})
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '读取模型服务配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  const updateDraft = (cap: Capability, patch: Partial<Draft>) => {
    setDrafts((prev) => (prev ? { ...prev, [cap]: { ...prev[cap], ...patch } } : prev))
  }

  /** 测试连接：用当前表单值（密钥留空时服务端自动回退已保存密钥） */
  const runTest = async (cap: Capability) => {
    if (!drafts) return
    const d = drafts[cap]
    setTests((prev) => ({ ...prev, [cap]: { status: 'testing', message: '正在测试连接…' } }))
    try {
      const res = await fetch('/api/settings/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability: cap,
          baseUrl: d.baseUrl,
          ...(d.apiKey.trim() !== '' ? { apiKey: d.apiKey.trim() } : {}),
          model: d.model,
        }),
      })
      const j = (await res.json()) as { ok?: boolean; message?: string; latencyMs?: number }
      setTests((prev) => ({
        ...prev,
        [cap]: {
          status: j.ok ? 'ok' : 'fail',
          message: j.message || (j.ok ? '连接成功' : '连接失败'),
          latencyMs: j.latencyMs,
        },
      }))
    } catch {
      setTests((prev) => ({
        ...prev,
        [cap]: { status: 'fail', message: '测试请求发送失败，请检查网络' },
      }))
    }
  }

  /** 保存：逐能力 PUT（apiKey 留空=保留原值） */
  const saveAll = async () => {
    if (!drafts) return
    setSaving(true)
    try {
      const errors: string[] = []
      for (const cap of CAPS) {
        const d = drafts[cap]
        const res = await fetch('/api/settings/providers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            capability: cap,
            providerKind: cap === 'video' ? 'builtin' : d.providerKind,
            baseUrl: d.providerKind === 'openai_compatible' && cap !== 'video' ? d.baseUrl : '',
            apiKey: d.apiKey, // ''=保留；'-'=清除；新值=覆盖
            model: d.model,
            voice: d.voice,
            enabled: d.enabled,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          errors.push(`${CAP_META[cap].title}：${j.error || '保存失败'}`)
        }
      }
      if (errors.length > 0) {
        showToast('error', errors[0])
      } else {
        showToast('success', '模型服务配置已保存，后续执行将按此路由')
      }
      await refresh()
    } catch {
      showToast('error', '保存模型服务配置失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const dirty = (() => {
    if (!views || !drafts) return false
    return CAPS.some((cap) => {
      const v = views[cap]
      const d = drafts[cap]
      return (
        d.providerKind !== (v.providerKind === 'openai_compatible' ? 'openai_compatible' : 'builtin') ||
        d.baseUrl !== (v.baseUrl ?? '') ||
        d.apiKey.trim() !== '' ||
        d.model !== (v.model ?? '') ||
        d.voice !== (v.voice ?? '') ||
        d.enabled !== v.enabled
      )
    })
  })()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Settings2 className="h-4 w-4 text-amber-300" />
            模型服务配置
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            按能力维度接入自定义模型供应商（OpenAI 兼容协议）；未配置或关闭时使用内置智谱。密钥仅保存于本机数据库，不会明文回显。
          </DialogDescription>
        </DialogHeader>

        {loading && !drafts ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-900" />
            ))}
          </div>
        ) : drafts && views ? (
          <>
            <ScrollArea className="max-h-[52vh] pr-2">
              <div className="space-y-2.5">
                {CAPS.map((cap) => (
                  <CapabilityCard
                    key={cap}
                    cap={cap}
                    view={views[cap]}
                    draft={drafts[cap]}
                    test={tests[cap]}
                    disabled={saving}
                    onChange={(patch) => updateDraft(cap, patch)}
                    onTest={() => void runTest(cap)}
                  />
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
              <p className="text-[10px] leading-relaxed text-zinc-600">
                提示词优化失败会自动回落内置模型；图像 / 语音配置后执行即走自定义服务。
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                <Button
                  size="sm"
                  onClick={() => void saveAll()}
                  disabled={saving || loading}
                  className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 text-[12px] font-semibold text-zinc-950 transition hover:from-amber-400 hover:to-orange-400"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  保存配置
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-zinc-600">
            <Settings2 className="h-8 w-8" />
            <p className="text-xs">配置加载失败，关闭后重试</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ 能力分区卡片 ------------------------------ */

function CapabilityCard({
  cap,
  view,
  draft,
  test,
  disabled,
  onChange,
  onTest,
}: {
  cap: Capability
  view: ProviderView
  draft: Draft
  test?: TestState
  disabled: boolean
  onChange: (patch: Partial<Draft>) => void
  onTest: () => void
}) {
  const meta = CAP_META[cap]
  const isVideo = cap === 'video'
  const isCustom = draft.providerKind === 'openai_compatible' && !isVideo

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition',
        isVideo ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-zinc-800 bg-zinc-900/60',
      )}
    >
      {/* 头部：图标 + 标题 + 启用开关 */}
      <div className="flex items-center gap-2">
        <span className={meta.accent}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-zinc-200">
            {meta.title}
            {isVideo && <Lock className="ml-1.5 inline h-3 w-3 text-zinc-600" />}
          </p>
          <p className="text-[10px] text-zinc-600">{meta.desc}</p>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          启用
          <Switch
            checked={isVideo ? false : draft.enabled}
            disabled={isVideo || disabled}
            onCheckedChange={(v) => onChange({ enabled: v })}
            className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-zinc-700"
          />
        </label>
      </div>

      {isVideo ? (
        <p className="mt-3 rounded-md border border-zinc-800/70 bg-zinc-950/60 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
          视频供应商接入中，当前使用内置智谱（CogVideoX）。视频生成协议各平台差异较大，暂不开放自定义接入。
        </p>
      ) : (
        <>
          {/* 供应商选择 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-[190px] items-center gap-2">
              <span className="w-[52px] shrink-0 text-[10px] text-zinc-500">供应商</span>
              <Select
                value={draft.providerKind}
                onValueChange={(v) => onChange({ providerKind: v as Draft['providerKind'] })}
                disabled={disabled}
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 flex-1 border-zinc-800 bg-zinc-900 text-[11px] text-zinc-200 focus-visible:ring-zinc-700 data-[size=sm]:h-7"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                  <SelectItem value="builtin" className="text-[11px]">
                    内置智谱
                  </SelectItem>
                  <SelectItem value="openai_compatible" className="text-[11px]">
                    OpenAI 兼容
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={onTest}
              disabled={disabled || !isCustom || test?.status === 'testing'}
              title={isCustom ? '向该服务发送一次极短请求，验证连通与鉴权' : '切换到 OpenAI 兼容后可测试'}
              className="flex h-7 items-center gap-1 rounded-md border border-zinc-700 px-2.5 text-[10px] text-zinc-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:bg-transparent disabled:hover:text-zinc-300"
            >
              {test?.status === 'testing' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <PlugZap className="h-3 w-3" />
              )}
              测试连接
            </button>
          </div>

          {isCustom && (
            <>
              <p className="mt-2 text-[10px] text-zinc-600">{meta.customDesc}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Base URL" className="sm:col-span-2">
                  <input
                    value={draft.baseUrl}
                    onChange={(e) => onChange({ baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                    disabled={disabled}
                    spellCheck={false}
                    className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
                  />
                </Field>
                <Field label="API Key">
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={(e) => onChange({ apiKey: e.target.value })}
                    placeholder={
                      view.hasKey
                        ? `已保存 ${view.apiKeyMask}（留空则不修改）`
                        : '输入 API Key'
                    }
                    disabled={disabled}
                    autoComplete="new-password"
                    className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
                  />
                </Field>
                <Field label={cap === 'tts' ? '模型名（如 tts-1）' : '模型名'}>
                  <input
                    value={draft.model}
                    onChange={(e) => onChange({ model: e.target.value })}
                    placeholder={
                      cap === 'llm' ? '如 gpt-4o-mini' : cap === 'image' ? '如 dall-e-3' : '如 tts-1'
                    }
                    disabled={disabled}
                    spellCheck={false}
                    className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
                  />
                </Field>
                {cap === 'tts' && (
                  <Field label="音色 Voice" className="sm:col-span-2">
                    <input
                      value={draft.voice}
                      onChange={(e) => onChange({ voice: e.target.value })}
                      placeholder="如 alloy / echo（留空则使用节点参数或供应商默认）"
                      disabled={disabled}
                      spellCheck={false}
                      className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
                    />
                  </Field>
                )}
              </div>
            </>
          )}

          {!isCustom && (
            <p className="mt-2.5 text-[10px] leading-relaxed text-zinc-600">
              使用内置智谱能力，由平台托管，无需配置。
            </p>
          )}

          {/* 测试结果（内联） */}
          {test && (
            <div
              className={cn(
                'mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px]',
                test.status === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                test.status === 'fail' && 'border-rose-500/30 bg-rose-500/10 text-rose-200',
                test.status === 'testing' && 'border-zinc-800 bg-zinc-900 text-zinc-400',
              )}
            >
              {test.status === 'ok' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
              {test.status === 'fail' && <XCircle className="h-3 w-3 shrink-0" />}
              {test.status === 'testing' && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              <span className="min-w-0 flex-1 break-all">{test.message}</span>
              {test.latencyMs !== undefined && test.status !== 'testing' && (
                <span className="shrink-0 font-mono opacity-70">{test.latencyMs}ms</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('flex items-center gap-2', className)}>
      <span className="w-[52px] shrink-0 text-right text-[10px] text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
