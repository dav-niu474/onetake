'use client'

/**
 * 节点参数控件（按参数定义自动渲染）
 */
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ParamField } from '@/lib/ai-canvas/types'

interface Props {
  field: ParamField
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}

export function ParamControl({ field, value, onChange, disabled }: Props) {
  switch (field.type) {
    case 'textarea':
      return (
        <div className="space-y-1">
          {field.label && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-zinc-400">{field.label}</span>
              {field.key === 'text' && typeof value === 'string' && value.length > 0 && (
                <span className="text-[9px] text-zinc-600">{value.length} 字</span>
              )}
            </div>
          )}
          <Textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={field.key === 'text' ? 4 : 3}
            className="min-h-[64px] resize-none border-zinc-700/70 bg-zinc-900/80 text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-500 rounded-lg"
          />
          {field.hint && <p className="text-[9px] text-zinc-600">{field.hint}</p>}
        </div>
      )
    case 'text':
      return (
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-zinc-400">{field.label}</span>
          <input
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className="w-full rounded-lg border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>
      )
    case 'select':
      return (
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-zinc-400">{field.label}</span>
          <Select
            value={typeof value === 'string' ? value : String(field.defaultValue)}
            onValueChange={(v) => onChange(v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 rounded-lg border-zinc-700/70 bg-zinc-900/80 px-2.5 text-[11px] text-zinc-200 focus:ring-1 focus:ring-zinc-500">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700/70 bg-zinc-900 text-zinc-200 text-[11px] rounded-lg">
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case 'switch':
      return (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-zinc-400">{field.label}</span>
          <Switch
            checked={value === true}
            onCheckedChange={(v) => onChange(v)}
            disabled={disabled}
            className="data-[state=checked]:bg-amber-500/80 scale-90"
          />
        </div>
      )
    default:
      return null
  }
}
