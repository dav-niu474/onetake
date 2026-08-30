'use client'

/**
 * 模型服务设置对话框（v2：供应商预置体系）
 *
 * Tab1 模型服务：左侧 = 内置服务 + 已配置供应商列表 +「添加供应商」；
 *   点击预置目录卡片新建账户 → 填 API Key → 「测试连接并获取模型列表」（拉取即验证连通与鉴权）
 *   → 测试通过方可保存（未测试时保存会先自动测试）。支持手动补充模型名、本地服务免密钥。
 * Tab2 能力路由：4 个能力（LLM/图像/TTS/视频）各自指向「内置智谱」或某供应商账户的某模型。
 *
 * 密钥仅保存于本机 SQLite，接口一律脱敏返回，绝不明文回显。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Cpu,
  MessageSquareText,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvasStore } from '@/lib/ai-canvas/store'
import {
  filterModelsForAbility,
  MODEL_ABILITY_BADGE,
  modelAbilities,
  modelPrimaryAbility,
  type ModelAbility,
} from '@/lib/ai-canvas/model-abilities'
import {
  ABILITY_LABEL,
  BUILTIN_PRESET,
  CUSTOM_PRESET_ID,
  PROVIDER_PRESETS,
  PROTOCOL_LABEL,
  getPreset,
  protocolAbilities,
  type ProviderAbility,
  type ProviderPreset,
  type ProviderProtocol,
} from '@/lib/ai-canvas/provider-presets'

type Capability = 'llm' | 'image' | 'tts' | 'video'

/** 账户模型列表的能力过滤（other = 向量/重排/识别等非创作能力） */
type ListAbilityFilter = 'all' | ModelAbility

const LIST_FILTERS: { key: ListAbilityFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'chat', label: '对话' },
  { key: 'image', label: '生图' },
  { key: 'tts', label: '配音' },
  { key: 'video', label: '视频' },
  { key: 'other', label: '其他' },
]

function matchesListFilter(m: string, f: ListAbilityFilter): boolean {
  if (f === 'all') return true
  if (f === 'other') {
    return modelAbilities(m).every((x) => !['chat', 'image', 'tts', 'video'].includes(x))
  }
  return modelAbilities(m).includes(f)
}

const CAPS: Capability[] = ['llm', 'image', 'tts', 'video']
const CAP_OF_ABILITY: Record<ProviderAbility, Capability> = {
  chat: 'llm',
  image: 'image',
  tts: 'tts',
  video: 'video',
}

interface AccountView {
  id: string
  presetId: string
  name: string
  protocol: string
  baseUrl: string
  apiKeyMask: string
  hasKey: boolean
  models: string[]
  enabled: boolean
  status: string // unverified | ok | error
  statusMessage: string
  latencyMs: number | null
  updatedAt: string
}

interface CapabilityRoute {
  capability: Capability
  providerKind: string
  accountId: string | null
  accountName: string
  model: string
  voice: string
  enabled: boolean
  protocol: string | null
}

/** 账户编辑草稿（apiKey：'' = 保留原值；hasKeyRetained/keyMask = 服务端已存密钥的只读快照） */
interface Draft {
  id: string | null
  presetId: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  apiKey: string
  models: string[]
  enabled: boolean
  status: string
  statusMessage: string
  latencyMs: number | null
  /** 服务端已保存过密钥（前端不持有明文，留空即保留） */
  hasKeyRetained: boolean
  /** 已保存密钥的掩码展示 */
  keyMask: string
}

interface RouteDraft {
  providerKind: 'builtin' | 'account'
  accountId: string
  model: string
  voice: string
  enabled: boolean
}

const CAP_META: Record<
  Capability,
  { title: string; desc: string; icon: React.ReactNode; accent: string; ability: ProviderAbility }
> = {
  llm: {
    title: '文本生成 LLM',
    desc: '提示词优化 / 剧本扩写',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    accent: 'text-emerald-300',
    ability: 'chat',
  },
  image: {
    title: '图像生成',
    desc: '文生图节点（OpenAI 兼容）',
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    accent: 'text-violet-300',
    ability: 'image',
  },
  tts: {
    title: '语音合成 TTS',
    desc: 'AI 配音节点（OpenAI 兼容）',
    icon: <AudioLines className="h-3.5 w-3.5" />,
    accent: 'text-rose-300',
    ability: 'tts',
  },
  video: {
    title: '视频生成',
    desc: '文生视频 / 图生视频',
    icon: <Film className="h-3.5 w-3.5" />,
    accent: 'text-amber-300',
    ability: 'video',
  },
}

function newDraftFromPreset(p: ProviderPreset): Draft {
  return {
    id: null,
    presetId: p.id,
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    apiKey: '',
    models: [],
    enabled: true,
    status: 'unverified',
    statusMessage: '',
    latencyMs: null,
    hasKeyRetained: false,
    keyMask: '',
  }
}

function draftOfView(v: AccountView): Draft {
  return {
    id: v.id,
    presetId: v.presetId,
    name: v.name,
    protocol: (v.protocol as ProviderProtocol) || 'openai',
    baseUrl: v.baseUrl,
    apiKey: '',
    models: [...v.models],
    enabled: v.enabled,
    status: v.status,
    statusMessage: v.statusMessage,
    latencyMs: v.latencyMs,
    hasKeyRetained: v.hasKey,
    keyMask: v.apiKeyMask,
  }
}

export function SettingsDialog() {
  const open = useCanvasStore((s) => s.settingsOpen)
  const setOpen = useCanvasStore((s) => s.setSettingsOpen)
  const showToast = useCanvasStore((s) => s.showToast)

  const [tab, setTab] = useState<'accounts' | 'routing'>('accounts')
  const [accounts, setAccounts] = useState<AccountView[] | null>(null)
  const [routes, setRoutes] = useState<CapabilityRoute[] | null>(null)
  const [loading, setLoading] = useState(false)

  // 账户编辑
  const [selectedId, setSelectedId] = useState<string | 'builtin' | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [listFilter, setListFilter] = useState<ListAbilityFilter>('all')
  const [newModel, setNewModel] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  // 能力路由草稿
  const [routeDrafts, setRouteDrafts] = useState<Record<Capability, RouteDraft> | null>(null)
  const [savingRoutes, setSavingRoutes] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/providers', { cache: 'no-store' })
      const j = (await res.json()) as { accounts?: AccountView[]; capabilities?: CapabilityRoute[]; error?: string }
      if (!res.ok) throw new Error(j.error || '读取供应商配置失败')
      const list = j.accounts ?? []
      const caps = j.capabilities ?? []
      setAccounts(list)
      setRoutes(caps)
      setRouteDrafts(fromRoutes(caps))
      return list
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '读取供应商配置失败')
      return []
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (open) {
      setTab('accounts')
      setPickerOpen(false)
      setConfirmDelete(false)
      void refresh().then((list) => {
        if (list.length > 0) {
          setSelectedId(list[0].id)
          setDraft(draftOfView(list[0]))
        } else {
          setSelectedId('builtin')
          setDraft(null)
        }
        setIsNew(false)
      })
    }
  }, [open, refresh])

  /* ------------------------------ 账户操作 ------------------------------ */

  const selectAccount = (v: AccountView) => {
    setSelectedId(v.id)
    setDraft(draftOfView(v))
    setIsNew(false)
    setConfirmDelete(false)
    setModelSearch('')
    setListFilter('all')
    setNewModel('')
  }

  const selectBuiltin = () => {
    setSelectedId('builtin')
    setDraft(null)
    setIsNew(false)
  }

  const startNew = (preset: ProviderPreset) => {
    setSelectedId(null)
    setDraft(newDraftFromPreset(preset))
    setIsNew(true)
    setPickerOpen(false)
    setConfirmDelete(false)
    setModelSearch('')
    setListFilter('all')
    setNewModel('')
  }

  const patchDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  /** 测试连接并获取模型列表（拉取成功 = 连通 + 鉴权通过） */
  const runTest = async (): Promise<{ ok: boolean; models: string[]; latencyMs: number | null; message: string }> => {
    if (!draft) return { ok: false, models: [], latencyMs: null, message: '未选择账户' }
    setTesting(true)
    try {
      const res = await fetch('/api/providers/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: draft.protocol,
          baseUrl: draft.baseUrl,
          // 密钥留空且是已保存账户 → 服务端用已存密钥
          ...(draft.apiKey.trim() !== '' ? { apiKey: draft.apiKey.trim() } : {}),
          ...(draft.id ? { accountId: draft.id } : {}),
        }),
      })
      const j = (await res.json()) as { ok?: boolean; models?: string[]; latencyMs?: number; message?: string; error?: string }
      if (j.ok) {
        const models = j.models ?? []
        patchDraft({
          models: Array.from(new Set([...models, ...draft.models])),
          status: 'ok',
          statusMessage: j.message ?? '连接正常',
          latencyMs: j.latencyMs ?? null,
        })
        return { ok: true, models, latencyMs: j.latencyMs ?? null, message: j.message ?? '连接正常' }
      }
      patchDraft({ status: 'error', statusMessage: j.error ?? '测试失败', latencyMs: null })
      return { ok: false, models: [], latencyMs: null, message: j.error ?? '测试失败' }
    } catch {
      const msg = '测试请求发送失败，请检查网络'
      patchDraft({ status: 'error', statusMessage: msg, latencyMs: null })
      return { ok: false, models: [], latencyMs: null, message: msg }
    } finally {
      setTesting(false)
    }
  }

  /** 保存：未验证时自动先测试（测试通过才保存） */
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const name = draft.name.trim()
      if (!name) {
        showToast('error', '请填写供应商名称')
        return
      }
      if (!draft.baseUrl.trim()) {
        showToast('error', '请填写 Base URL')
        return
      }
      const preset = getPreset(draft.presetId)
      const needKey = preset ? preset.needKey : !/^http:\/\/(localhost|127\.0\.0\.1)/.test(draft.baseUrl)
      if (needKey && !draft.hasKeyRetained && draft.apiKey.trim() === '') {
        showToast('error', '请填写 API Key（本地服务除外）')
        return
      }

      // 需要重新测试的情形：未验证过 / 处于失败态 / 关键字段有改动
      let d: Draft = { ...draft, name }
      const keyChanged = draft.apiKey.trim() !== ''
      const testedNow = draft.status !== 'ok' || keyChanged
      if (testedNow) {
        showToast('info', '正在测试连接，通过后自动保存…')
        const r = await runTest()
        if (!r.ok) {
          showToast('error', `测试未通过，未保存：${r.message}`)
          return
        }
        // runTest 已 patchDraft；取最新快照
        d = { ...d, status: 'ok', latencyMs: r.latencyMs, statusMessage: r.message }
      }

      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(d.id ? { id: d.id } : {}),
          presetId: d.presetId,
          name: d.name,
          protocol: d.protocol,
          baseUrl: d.baseUrl,
          apiKey: d.apiKey, // '' = 保留原值
          models: d.models,
          enabled: d.enabled,
          status: d.status,
          statusMessage: d.statusMessage,
          latencyMs: d.latencyMs,
        }),
      })
      const j = (await res.json()) as { ok?: boolean; item?: AccountView; error?: string; message?: string }
      if (!res.ok || !j.ok || !j.item) {
        throw new Error(j.error || '保存失败')
      }
      showToast('success', j.message ?? '供应商已保存')
      await refresh()
      setSelectedId(j.item.id)
      setDraft(draftOfView(j.item))
      setIsNew(false)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '保存供应商失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/providers/${draft.id}`, { method: 'DELETE' })
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败')
      showToast('success', j.message ?? '已删除')
      await refresh()
      selectBuiltin()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '删除供应商失败')
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  /* ------------------------------ 能力路由操作 ------------------------------ */

  const patchRoute = (cap: Capability, patch: Partial<RouteDraft>) => {
    setRouteDrafts((prev) => (prev ? { ...prev, [cap]: { ...prev[cap], ...patch } } : prev))
  }

  const saveRoutes = async () => {
    if (!routeDrafts) return
    setSavingRoutes(true)
    try {
      const errors: string[] = []
      for (const cap of CAPS) {
        const r = routeDrafts[cap]
        const res = await fetch('/api/providers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            capability: cap,
            providerKind: r.providerKind,
            ...(r.providerKind === 'account' ? { accountId: r.accountId } : {}),
            model: r.model,
            voice: r.voice,
            enabled: r.enabled,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) errors.push(`${CAP_META[cap].title}：${j.error || '保存失败'}`)
      }
      if (errors.length > 0) showToast('error', errors[0])
      else showToast('success', '能力路由已保存，节点执行将按此调用')
      await refresh()
    } catch {
      showToast('error', '保存能力路由失败，请稍后重试')
    } finally {
      setSavingRoutes(false)
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */

  const selectedAccount = accounts?.find((a) => a.id === selectedId) ?? null
  const filteredModels = useMemo(() => {
    if (!draft) return []
    const kw = modelSearch.trim().toLowerCase()
    const list = [...draft.models].sort((a, b) => a.localeCompare(b)).filter((m) => matchesListFilter(m, listFilter))
    return kw ? list.filter((m) => m.toLowerCase().includes(kw)) : list
  }, [draft, modelSearch, listFilter])

  /** 模型能力分布计数（能力 chips 用） */
  const listAbilityCounts = useMemo(() => {
    const c: Record<ListAbilityFilter, number> = { all: 0, chat: 0, image: 0, tts: 0, video: 0, other: 0 }
    for (const m of draft?.models ?? []) {
      c.all++
      if (matchesListFilter(m, 'chat')) c.chat++
      if (matchesListFilter(m, 'image')) c.image++
      if (matchesListFilter(m, 'tts')) c.tts++
      if (matchesListFilter(m, 'video')) c.video++
      if (matchesListFilter(m, 'other')) c.other++
    }
    return c
  }, [draft])

  const presetAdded = (presetId: string) => accounts?.some((a) => a.presetId === presetId) ?? false

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] overflow-hidden border-zinc-800 bg-zinc-950 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Settings2 className="h-4 w-4 text-amber-300" />
            模型服务
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            预置主流供应商，填入 API Key 测试连接后即可使用；密钥仅存于本机数据库，不会明文回显。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          {(
            [
              { id: 'accounts', label: '模型服务', icon: <Cpu className="h-3.5 w-3.5" /> },
              { id: 'routing', label: '能力路由', icon: <Settings2 className="h-3.5 w-3.5" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition',
                tab === t.id
                  ? 'bg-amber-500/15 text-amber-200 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'accounts' ? (
          <div className="flex h-[54vh] gap-3">
            {/* 左列：内置 + 已配置 + 添加 */}
            <aside className="flex w-48 shrink-0 flex-col gap-1.5">
              <button
                onClick={selectBuiltin}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition',
                  selectedId === 'builtin'
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[11px] font-bold text-zinc-950',
                    BUILTIN_PRESET.accent,
                  )}
                >
                  {BUILTIN_PRESET.badge}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-zinc-200">{BUILTIN_PRESET.name}</span>
                  <span className="block text-[9px] text-zinc-500">平台托管 · 免配置</span>
                </span>
              </button>

              <div className="px-1 pt-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
                已配置供应商
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 pr-1.5">
                  {loading && !accounts && [1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-zinc-900" />)}
                  {accounts?.length === 0 && (
                    <p className="px-1 py-2 text-[10px] leading-relaxed text-zinc-600">
                      还没有接入供应商，点击下方「添加供应商」从预置目录开始。
                    </p>
                  )}
                  {accounts?.map((a) => (
                    <AccountListItem
                      key={a.id}
                      account={a}
                      active={selectedId === a.id}
                      onClick={() => selectAccount(a)}
                    />
                  ))}
                </div>
              </ScrollArea>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setPickerOpen(true)}
                className="h-8 w-full shrink-0 gap-1.5 border-dashed border-zinc-700 text-[11px] text-zinc-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200"
              >
                <Plus className="h-3.5 w-3.5" />
                添加供应商
              </Button>
            </aside>

            {/* 右侧：详情 */}
            <section className="min-w-0 flex-1">
              <ScrollArea className="h-full pr-1.5">
                {selectedId === 'builtin' ? (
                  <BuiltinPane routes={routes} />
                ) : draft ? (
                  <AccountPane
                    draft={draft}
                    isNew={isNew}
                    testing={testing}
                    saving={saving}
                    confirmDelete={confirmDelete}
                    filteredModels={filteredModels}
                    abilityCounts={listAbilityCounts}
                    abilityFilter={listFilter}
                    modelSearch={modelSearch}
                    newModel={newModel}
                    onPatch={patchDraft}
                    onTest={() => void runTest()}
                    onSave={() => void save()}
                    onDelete={() => void remove()}
                    onModelSearch={setModelSearch}
                    onAbilityFilter={setListFilter}
                    onNewModel={setNewModel}
                    onAddModel={() => {
                      const m = newModel.trim()
                      if (m && !draft.models.includes(m)) patchDraft({ models: [...draft.models, m] })
                      setNewModel('')
                    }}
                    onRemoveModel={(m) => patchDraft({ models: draft.models.filter((x) => x !== m) })}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                    <PlugZap className="h-8 w-8" />
                    <p className="text-xs">从左侧选择供应商，或点击「添加供应商」接入新服务</p>
                  </div>
                )}
              </ScrollArea>
            </section>
          </div>
        ) : (
          <RoutingPane
            routes={routeDrafts}
            accounts={accounts ?? []}
            saving={savingRoutes}
            onPatch={patchRoute}
            onSave={() => void saveRoutes()}
          />
        )}

        {/* 预置选择器 */}
        <PresetPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          addedIds={accounts?.map((a) => a.presetId) ?? []}
          onPick={(p) => startNew(p)}
        />
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ 左列账户项 ------------------------------ */

function AccountListItem({
  account,
  active,
  onClick,
}: {
  account: AccountView
  active: boolean
  onClick: () => void
}) {
  const preset = getPreset(account.presetId)
  const accent = preset?.accent ?? 'from-zinc-400 to-zinc-600'
  const badge = preset?.badge ?? '⌘'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition',
        active ? 'border-amber-500/50 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
        !account.enabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[10px] font-bold text-zinc-950',
          accent,
        )}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium text-zinc-200">{account.name}</span>
        <span className="block truncate text-[9px] text-zinc-500">
          {PROTOCOL_LABEL[account.protocol as ProviderProtocol] ?? account.protocol}
          {account.models.length > 0 ? ` · ${account.models.length} 模型` : ''}
        </span>
      </span>
      <StatusDot status={account.status} enabled={account.enabled} />
    </button>
  )
}

function StatusDot({ status, enabled }: { status: string; enabled: boolean }) {
  if (!enabled) return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" title="已停用" />
  if (status === 'ok')
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" title="连接正常" />
  if (status === 'error') return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" title="上次测试失败" />
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700" title="未验证" />
}

/* ------------------------------ 内置服务面板 ------------------------------ */

function BuiltinPane({ routes }: { routes: CapabilityRoute[] | null }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold text-zinc-950',
              BUILTIN_PRESET.accent,
            )}
          >
            {BUILTIN_PRESET.badge}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-zinc-100">{BUILTIN_PRESET.name}</p>
            <p className="text-[10px] text-zinc-500">{BUILTIN_PRESET.nameEn}</p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> 默认可用
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">{BUILTIN_PRESET.desc}</p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="mb-2.5 text-[11px] font-medium text-zinc-300">当前能力路由</p>
        <div className="space-y-1.5">
          {CAPS.map((cap) => {
            const r = routes?.find((x) => x.capability === cap)
            const usingBuiltin = !r || r.providerKind !== 'account' || !r.enabled
            return (
              <div key={cap} className="flex items-center gap-2 text-[11px]">
                <span className={CAP_META[cap].accent}>{CAP_META[cap].icon}</span>
                <span className="w-20 shrink-0 text-zinc-400">{CAP_META[cap].title}</span>
                <span className={cn('font-mono', usingBuiltin ? 'text-emerald-300/80' : 'text-amber-200')}>
                  {usingBuiltin ? '内置智谱' : `${r?.accountName} · ${r?.model || '默认模型'}`}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
          前往「能力路由」标签页可把任意能力切换到自定义供应商；未配置或执行失败时自动回落内置服务。
        </p>
      </div>
    </div>
  )
}

/* ------------------------------ 账户编辑面板 ------------------------------ */

interface AccountPaneProps {
  draft: Draft
  isNew: boolean
  testing: boolean
  saving: boolean
  confirmDelete: boolean
  filteredModels: string[]
  abilityCounts: Record<ListAbilityFilter, number>
  abilityFilter: ListAbilityFilter
  modelSearch: string
  newModel: string
  onPatch: (patch: Partial<Draft>) => void
  onTest: () => void
  onSave: () => void
  onDelete: () => void
  onModelSearch: (v: string) => void
  onAbilityFilter: (v: ListAbilityFilter) => void
  onNewModel: (v: string) => void
  onAddModel: () => void
  onRemoveModel: (m: string) => void
}

function AccountPane(p: AccountPaneProps) {
  const { draft } = p
  const preset = getPreset(draft.presetId)
  const isCustom = draft.presetId === CUSTOM_PRESET_ID
  const needKey = preset ? preset.needKey : true
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(draft.baseUrl)

  return (
    <div className="space-y-3 pb-2">
      {/* 头部：预置信息 */}
      {preset && (
        <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-[12px] font-bold text-zinc-950',
              preset.accent,
            )}
          >
            {preset.badge}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-100">
              {preset.name}
              <span className="text-[9px] font-normal text-zinc-500">{preset.nameEn}</span>
            </p>
            <p className="truncate text-[10px] text-zinc-500">{preset.desc}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {preset.abilities.map((ab) => (
              <span key={ab} className="rounded border border-zinc-700/60 px-1.5 py-0.5 text-[9px] text-zinc-400">
                {ABILITY_LABEL[ab]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 基础字段 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="名称">
          <input
            value={draft.name}
            onChange={(e) => p.onPatch({ name: e.target.value })}
            placeholder="供应商名称"
            disabled={p.saving}
            className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
          />
        </Field>
        <Field label="协议">
          <Select
            value={draft.protocol}
            onValueChange={(v) => p.onPatch({ protocol: v as ProviderProtocol })}
            disabled={!isCustom || p.saving}
          >
            <SelectTrigger
              size="sm"
              className={cn(
                'h-7 w-full border-zinc-800 bg-zinc-900 text-[11px] text-zinc-200 focus-visible:ring-zinc-700 data-[size=sm]:h-7',
                !isCustom && 'opacity-70',
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
              {(Object.keys(PROTOCOL_LABEL) as ProviderProtocol[]).map((pr) => (
                <SelectItem key={pr} value={pr} className="text-[11px]">
                  {PROTOCOL_LABEL[pr]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Base URL" className="sm:col-span-2">
          <input
            value={draft.baseUrl}
            onChange={(e) => p.onPatch({ baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            disabled={p.saving}
            spellCheck={false}
            className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
          />
        </Field>
        <Field label="API Key" className="sm:col-span-2">
          <div className="flex w-full items-center gap-1.5">
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => p.onPatch({ apiKey: e.target.value })}
              placeholder={
                isLocal || !needKey
                  ? '本地服务无需密钥'
                  : draft.hasKeyRetained
                    ? `已保存 ${draft.keyMask}（留空则不修改）`
                    : '粘贴 API Key 后点击「测试连接」'
              }
              disabled={p.saving}
              autoComplete="new-password"
              spellCheck={false}
              className="h-7 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-zinc-900"
            />
            {preset?.keyUrl && (
              <a
                href={preset.keyUrl}
                target="_blank"
                rel="noreferrer"
                title={`前往 ${preset.name} 控制台获取密钥`}
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 text-[10px] text-zinc-400 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200"
              >
                获取密钥
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </Field>
      </div>

      {/* 测试 + 保存 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={p.onTest}
          disabled={p.testing || p.saving || (!isLocal && needKey && draft.apiKey.trim() === '' && !draft.hasKeyRetained)}
          className="h-8 gap-1.5 border-zinc-700 text-[11px] text-zinc-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200"
        >
          {p.testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          测试连接并获取模型
        </Button>
        <Button
          size="sm"
          onClick={p.onSave}
          disabled={p.testing || p.saving}
          className="h-8 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-[11px] font-semibold text-zinc-950 transition hover:from-amber-400 hover:to-orange-400"
        >
          {p.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          {p.isNew ? '测试通过后保存' : '保存'}
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500">
          启用
          <Switch
            checked={draft.enabled}
            disabled={p.saving}
            onCheckedChange={(v) => p.onPatch({ enabled: v })}
            className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-zinc-700"
          />
        </label>
      </div>

      {/* 测试结果条 */}
      {(draft.status !== 'unverified' || draft.statusMessage) && (
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px]',
            draft.status === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
            draft.status === 'error' && 'border-rose-500/30 bg-rose-500/10 text-rose-200',
            draft.status === 'unverified' && 'border-zinc-800 bg-zinc-900 text-zinc-400',
          )}
        >
          {draft.status === 'ok' ? (
            <CheckCircle2 className="h-3 w-3 shrink-0" />
          ) : draft.status === 'error' ? (
            <XCircle className="h-3 w-3 shrink-0" />
          ) : null}
          <span className="min-w-0 flex-1 break-all">{draft.statusMessage || '未验证'}</span>
          {draft.latencyMs !== null && draft.status === 'ok' && (
            <span className="shrink-0 font-mono opacity-70">{draft.latencyMs}ms</span>
          )}
        </div>
      )}

      {/* 模型列表（能力过滤 chips + 原生滚动适配，模型再多也不撑破容器） */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <input
            value={p.modelSearch}
            onChange={(e) => p.onModelSearch(e.target.value)}
            placeholder={draft.models.length > 0 ? `在 ${draft.models.length} 个模型中搜索…` : '测试连接后自动获取模型列表'}
            disabled={draft.models.length === 0}
            className="h-6 min-w-0 flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
          />
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
            {p.abilityFilter === 'all' ? draft.models.length : `${p.filteredModels.length}/${draft.models.length}`}
          </span>
        </div>
        {draft.models.length > 6 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 px-2.5 py-1.5">
            {LIST_FILTERS.map((f) => {
              const n = p.abilityCounts[f.key]
              if (f.key !== 'all' && n === 0) return null
              return (
                <button
                  key={f.key}
                  onClick={() => p.onAbilityFilter(f.key)}
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[9px] transition',
                    p.abilityFilter === f.key
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                  )}
                >
                  {f.label}
                  <span className="ml-0.5 opacity-60">{n}</span>
                </button>
              )
            })}
          </div>
        )}
        {draft.models.length > 0 && (
          <div className="scrollbar-thin max-h-56 overflow-y-auto overscroll-contain">
            <div className="p-1.5">
              {p.filteredModels.map((m) => {
                const ab = modelPrimaryAbility(m)
                const badge = MODEL_ABILITY_BADGE[ab]
                return (
                  <div
                    key={m}
                    className="group flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-zinc-800/60"
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1 py-px text-[8px] leading-none',
                        badge?.cls ?? 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
                      )}
                    >
                      {badge?.label ?? '模型'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-zinc-300" title={m}>
                      {m}
                    </span>
                    <button
                      onClick={() => p.onRemoveModel(m)}
                      title="移除该模型"
                      className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              {p.filteredModels.length === 0 && (
                <p className="px-2 py-3 text-center text-[10px] text-zinc-600">当前筛选条件下没有模型</p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5 border-t border-zinc-800 px-2.5 py-2">
          <input
            value={p.newModel}
            onChange={(e) => p.onNewModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') p.onAddModel()
            }}
            placeholder="手动添加模型名（部分服务不开放列表接口）"
            disabled={p.saving}
            spellCheck={false}
            className="h-6 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950/60 px-2 font-mono text-[10.5px] text-zinc-200 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-amber-500/50"
          />
          <button
            onClick={p.onAddModel}
            disabled={p.saving || !p.newModel.trim()}
            className="flex h-6 shrink-0 items-center gap-1 rounded border border-zinc-700 px-2 text-[10px] text-zinc-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
      </div>

      {/* 危险区 */}
      {!p.isNew && draft.id && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
          <div>
            <p className="text-[11px] text-rose-200">删除该供应商</p>
            <p className="text-[9px] text-zinc-500">引用它的能力路由将自动重置为内置服务</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={p.onDelete}
            disabled={p.saving}
            className={cn(
              'h-7 gap-1.5 border-rose-500/40 text-[10px] text-rose-300 hover:bg-rose-500/15 hover:text-rose-200',
              p.confirmDelete && 'border-rose-500 bg-rose-500/20',
            )}
          >
            {p.confirmDelete ? <XCircle className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
            {p.confirmDelete ? '再点一次确认删除' : '删除'}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ 能力路由面板 ------------------------------ */

function RoutingPane({
  routes,
  accounts,
  saving,
  onPatch,
  onSave,
}: {
  routes: Record<Capability, RouteDraft> | null
  accounts: AccountView[]
  saving: boolean
  onPatch: (cap: Capability, patch: Partial<RouteDraft>) => void
  onSave: () => void
}) {
  if (!routes) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-900" />
        ))}
      </div>
    )
  }
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  return (
    <div className="space-y-2.5">
      <ScrollArea className="max-h-[54vh] pr-1.5">
        <div className="space-y-2.5">
          {CAPS.map((cap) => {
            const meta = CAP_META[cap]
            const r = routes[cap]
            const isVideo = cap === 'video'
            // 该能力可选的账户：协议支持该能力 且 已启用
            const eligible = accounts.filter(
              (a) => a.enabled && protocolAbilities(a.protocol as ProviderProtocol).includes(meta.ability),
            )
            const current = r.providerKind === 'account' ? accountById.get(r.accountId) : undefined
            const currentIneligible = current && !eligible.some((e) => e.id === current.id)
            const allModels = current?.models ?? []
            // 按能力域过滤：文本模型只能进 LLM 路由、图像只能进图像路由（当前已选值强制保留）
            const models = filterModelsForAbility(allModels, meta.ability, r.model)
            const hiddenCount = Math.max(0, allModels.length - models.length)

            return (
              <div
                key={cap}
                className={cn('rounded-lg border p-3.5', isVideo ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-zinc-800 bg-zinc-900/60')}
              >
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
                      checked={isVideo ? false : r.enabled}
                      disabled={isVideo || saving}
                      onCheckedChange={(v) => onPatch(cap, { enabled: v })}
                      className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-zinc-700"
                    />
                  </label>
                </div>

                {isVideo ? (
                  <p className="mt-2.5 rounded-md border border-zinc-800/70 bg-zinc-950/60 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
                    视频生成协议各平台差异较大，默认使用内置智谱（CogVideoX）；自定义视频供应商接入已在规划中。
                  </p>
                ) : r.providerKind === 'account' ? (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex min-w-[200px] items-center gap-2">
                        <span className="w-[40px] shrink-0 text-[10px] text-zinc-500">供应商</span>
                        <Select
                          value={current?.id ?? r.accountId}
                          onValueChange={(v) => onPatch(cap, { accountId: v, model: '' })}
                          disabled={saving}
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-7 flex-1 border-zinc-800 bg-zinc-900 text-[11px] text-zinc-200 focus-visible:ring-zinc-700 data-[size=sm]:h-7"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                            {eligible.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-[11px]">
                                {a.name}
                              </SelectItem>
                            ))}
                            {currentIneligible && (
                              <SelectItem value={current.id} className="text-[11px] text-rose-300">
                                {current.name}（协议不支持该能力）
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex min-w-[210px] flex-1 items-center gap-2">
                        <span className="w-[40px] shrink-0 text-[10px] text-zinc-500">模型</span>
                        {models.length > 0 ? (
                          <Select value={r.model} onValueChange={(v) => onPatch(cap, { model: v })} disabled={saving}>
                            <SelectTrigger
                              size="sm"
                              className="h-7 flex-1 border-zinc-800 bg-zinc-900 font-mono text-[10.5px] text-zinc-200 focus-visible:ring-zinc-700 data-[size=sm]:h-7"
                            >
                              <SelectValue placeholder="选择模型" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72 border-zinc-700 bg-zinc-900 text-zinc-200">
                              {hiddenCount > 0 && (
                                <div className="border-b border-zinc-800 px-2 pb-1.5 pt-1 text-[9px] leading-relaxed text-zinc-500">
                                  已按「{ABILITY_LABEL[meta.ability]}」能力过滤 {hiddenCount} 个无关模型
                                </div>
                              )}
                              {models.map((m) => (
                                <SelectItem key={m} value={m} className="font-mono text-[10.5px]">
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <input
                            value={r.model}
                            onChange={(e) => onPatch(cap, { model: e.target.value })}
                            placeholder={
                              allModels.length > 0
                                ? `未识别到「${ABILITY_LABEL[meta.ability]}」模型，手输模型名`
                                : '该账户尚未获取模型列表，手输模型名'
                            }
                            disabled={saving}
                            spellCheck={false}
                            className="h-7 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[10.5px] text-zinc-200 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-amber-500/50"
                          />
                        )}
                      </div>
                      <button
                        onClick={() =>
                          onPatch(cap, { providerKind: 'builtin', accountId: '', model: '', voice: '' })
                        }
                        disabled={saving}
                        title="停用该供应商，恢复默认内置智谱"
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-zinc-800 px-2 text-[10px] text-zinc-400 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-40"
                      >
                        <Undo2 className="h-3 w-3" />
                        恢复内置
                      </button>
                    </div>
                    {cap === 'tts' && (
                      <div className="flex items-center gap-2">
                        <span className="w-[40px] shrink-0 text-[10px] text-zinc-500">音色</span>
                        <input
                          value={r.voice}
                          onChange={(e) => onPatch(cap, { voice: e.target.value })}
                          placeholder="如 alloy / echo（留空使用节点参数或默认音色）"
                          disabled={saving}
                          spellCheck={false}
                          className="h-7 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50"
                        />
                      </div>
                    )}
                    {!r.enabled && (
                      <p className="text-[10px] text-amber-400/70">已停用：执行时将回落内置智谱。</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] leading-relaxed text-emerald-200/90">
                          默认使用内置智谱（GLM / CogView / TTS），开箱即用无需配置
                        </p>
                        <p className="mt-0.5 text-[9px] leading-relaxed text-zinc-600">
                          下方接入供应商后执行将改走该模型；失败时仍自动回落内置服务
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-[40px] shrink-0 text-[10px] text-zinc-500">覆盖</span>
                      <Select
                        value={undefined}
                        onValueChange={(v) =>
                          onPatch(cap, { providerKind: 'account', accountId: v, model: '' })
                        }
                        disabled={saving || eligible.length === 0}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-7 flex-1 border-zinc-800 bg-zinc-900 text-[11px] text-zinc-200 focus-visible:ring-zinc-700 data-[size=sm]:h-7 data-[placeholder]:text-zinc-500"
                        >
                          <SelectValue
                            placeholder={
                              eligible.length > 0 ? '选择供应商覆盖内置…' : '暂无支持该能力的供应商'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                          {eligible.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-[11px]">
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {eligible.length === 0 && (
                      <p className="text-[9px] leading-relaxed text-zinc-600">
                        先在「模型服务」标签页接入一家支持该能力的供应商（协议需匹配）。
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
        <p className="text-[10px] leading-relaxed text-zinc-600">
          各能力默认使用内置智谱；接入供应商后按需切换，模型下拉只展示匹配能力域的模型。
        </p>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="h-8 shrink-0 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 text-[12px] font-semibold text-zinc-950 transition hover:from-amber-400 hover:to-orange-400"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          保存路由
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ 预置选择器 ------------------------------ */

function PresetPicker({
  open,
  onOpenChange,
  addedIds,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  addedIds: string[]
  onPick: (p: ProviderPreset) => void
}) {
  const [kw, setKw] = useState('')
  const list = useMemo(() => {
    const k = kw.trim().toLowerCase()
    if (!k) return PROVIDER_PRESETS
    return PROVIDER_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(k) ||
        p.nameEn.toLowerCase().includes(k) ||
        p.desc.toLowerCase().includes(k),
    )
  }, [kw])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <MessageSquareText className="h-4 w-4 text-amber-300" />
            从预置目录添加供应商
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            已内置 {PROVIDER_PRESETS.length} 家常见服务商的接入参数；也可以添加完全自定义的 OpenAI 兼容服务。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索供应商（如 DeepSeek / 聚合 / 本地）"
            className="h-8 w-full bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>

        <ScrollArea className="max-h-[46vh] pr-1.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((p) => {
              const added = addedIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  disabled={added}
                  className={cn(
                    'group flex items-start gap-2.5 rounded-lg border p-3 text-left transition',
                    added
                      ? 'cursor-not-allowed border-zinc-800/60 bg-zinc-900/20 opacity-45'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-amber-500/40 hover:bg-amber-500/5',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[12px] font-bold text-zinc-950',
                      p.accent,
                    )}
                  >
                    {p.badge}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-zinc-100">{p.name}</span>
                      <span className="shrink-0 text-[9px] text-zinc-500">{p.nameEn}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-zinc-500">
                      {p.desc}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1">
                      {p.abilities.map((ab) => (
                        <span key={ab} className="rounded border border-zinc-700/60 px-1 py-px text-[8.5px] text-zinc-400">
                          {ABILITY_LABEL[ab]}
                        </span>
                      ))}
                      {added && (
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-px text-[8.5px] text-emerald-300">
                          已添加
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => onPick(CUSTOM_PLACEHOLDER)}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-zinc-700 p-3 text-left transition hover:border-amber-500/40 hover:bg-amber-500/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-600 text-zinc-400">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-zinc-100">自定义供应商</span>
              <span className="block text-[10px] text-zinc-500">
                任意 OpenAI 兼容 / Anthropic / Gemini 服务（中转站、自建网关等）
              </span>
            </span>
          </button>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

const CUSTOM_PLACEHOLDER: ProviderPreset = {
  id: CUSTOM_PRESET_ID,
  name: '',
  nameEn: 'Custom Provider',
  protocol: 'openai',
  baseUrl: '',
  keyUrl: undefined,
  homeUrl: undefined,
  desc: '',
  abilities: ['chat'],
  accent: 'from-zinc-400 to-zinc-600',
  badge: '+',
  needKey: true,
}

/* ------------------------------ 小组件 ------------------------------ */

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

/* ------------------------------ 工具 ------------------------------ */

function fromRoutes(routes: CapabilityRoute[]): Record<Capability, RouteDraft> {
  const out = {} as Record<Capability, RouteDraft>
  for (const cap of CAPS) {
    const r = routes.find((x) => x.capability === cap)
    out[cap] = {
      providerKind: r && r.providerKind === 'account' ? 'account' : 'builtin',
      accountId: r?.accountId ?? '',
      model: r?.model ?? '',
      voice: r?.voice ?? '',
      enabled: r?.enabled ?? true,
    }
  }
  return out
}
