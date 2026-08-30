'use client'

/**
 * 专业参数面板 —— AI 生成节点的提示词注入参数选择
 *
 * 与 src/lib/ai-canvas/pro-params.ts 的 PRO_PARAM_GROUPS 契约配合：
 * 遍历当前节点类型注册的参数组，以 chips 形式供用户点选（每组单选，可再次点击取消），
 * 选择结果写入节点 params.pro（Record<groupKey, optionValue>，经 onChange 整体替换）；
 * 底部「注入预览」实时展示运行时将追加到提示词末尾的专业参数片段
 * （tts 节点改为展示 buildTTSInstructions 的语气指令预览）。
 */
import { useMemo } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAccent } from './nodes/accents'
import {
  PRO_PARAM_GROUPS,
  buildProPrompt,
  buildTTSInstructions,
  countProParams,
  getProValues,
} from '@/lib/ai-canvas/pro-params'

interface ProParamsPanelProps {
  nodeType: string
  /** 完整节点 params（面板内部读取 params.pro） */
  params: Record<string, unknown>
  /** 整体替换 params.pro */
  onChange: (pro: Record<string, string>) => void
  /** 节点 accent 名（violet / amber / rose…），组件内经 getAccent 映射 */
  accent: string
  disabled?: boolean
}

export function ProParamsPanel({
  nodeType,
  params,
  onChange,
  accent,
  disabled,
}: ProParamsPanelProps) {
  const groups = PRO_PARAM_GROUPS[nodeType]
  const a = getAccent(accent)
  const isTTS = nodeType === 'tts'

  /* 已选参数映射（group.key → option.value）与计数、注入预览（参数变化实时刷新） */
  const pro = useMemo(() => getProValues(params), [params])
  const count = useMemo(() => countProParams(nodeType, params), [nodeType, params])
  const preview = useMemo(
    () => (isTTS ? (buildTTSInstructions(params) ?? '') : buildProPrompt(nodeType, params)),
    [isTTS, nodeType, params],
  )

  /* 该节点类型未注册参数组时不渲染（外层已用 PRO_PARAM_NODE_TYPES 过滤，双保险） */
  if (!groups || groups.length === 0) return null

  /** 点击 chip：已选 = 取消（toggle off）；未选 = 选中 */
  const toggle = (groupKey: string, value: string) => {
    if (disabled) return
    const next: Record<string, string> = { ...pro }
    if (next[groupKey] === value) delete next[groupKey]
    else next[groupKey] = value
    onChange(next)
  }

  const desc = isTTS
    ? '点选语气参数后，将通过自定义供应商的 instructions 字段生效'
    : '点选参数后，运行时将自动追加到提示词末尾'

  return (
    <div className="space-y-3">
      {/* 顶部工具行：说明 + 已选计数 + 清除全部 */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[9px] leading-tight text-zinc-500" title={desc}>
          {desc}
        </p>
        {count > 0 && (
          <>
            <span className={cn('shrink-0 text-[9px] font-medium', a.text)}>已选 {count} 项</span>
            <button
              type="button"
              onClick={() => onChange({})}
              disabled={disabled}
              title="清空全部专业参数"
              className="shrink-0 rounded px-1 py-0.5 text-[9px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-50"
            >
              清除全部
            </button>
          </>
        )}
      </div>

      {/* 参数组（chips 单选，可 toggle 取消） */}
      {groups.map((group) => {
        const selected = pro[group.key]
        const selectedOption = group.options.find((o) => o.value === selected)
        return (
          <div key={group.key} className="space-y-1.5">
            {/* 组标题行：组名 + hint（hover 提示）+ 当前选中值小徽标 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-zinc-400">{group.label}</span>
              {group.hint && (
                <span
                  title={group.hint}
                  className="cursor-help text-zinc-600 transition hover:text-zinc-400"
                >
                  <HelpCircle className="h-2.5 w-2.5" />
                </span>
              )}
              {selectedOption && (
                <span
                  title={selectedOption.label}
                  className={cn(
                    'ml-auto max-w-[110px] truncate rounded-full px-1.5 py-0.5 text-[8px] leading-none',
                    a.chipBg,
                    a.text,
                  )}
                >
                  {selectedOption.label}
                </span>
              )}
            </div>
            {/* 选项 chips */}
            <div className={cn('flex flex-wrap gap-1.5', disabled && 'pointer-events-none opacity-50')}>
              {group.options.map((opt) => {
                const active = selected === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(group.key, opt.value)}
                    disabled={disabled}
                    title={opt.prompt}
                    aria-pressed={active}
                    className={cn(
                      'rounded-full border px-2 py-1 text-[10px] leading-none transition active:scale-95',
                      active
                        ? cn(a.chipBg, a.text, a.border, 'font-medium ring-1 ring-current/40')
                        : 'border-zinc-700/70 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* 注入预览：运行时将追加到提示词的内容（tts 为语气指令） */}
      <div className="space-y-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          {isTTS ? '语气指令预览' : '注入预览'}
        </span>
        {preview ? (
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-[9px] leading-relaxed text-emerald-300/90 scrollbar-thin">
            {preview}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-2 text-[9px] leading-relaxed text-zinc-600">
            {isTTS
              ? '未选择语气参数 · 使用供应商默认语气'
              : '未选择专业参数 · 运行时将直接使用原提示词'}
          </p>
        )}
      </div>
    </div>
  )
}
