/**
 * 节点强调色映射（字面量 Tailwind 类，保证 JIT 生成）
 */
export interface AccentClasses {
  text: string
  chipBg: string
  softBg: string
  border: string
  solid: string
  gradient: string
  glow: string
  hex: string
}

export const ACCENTS: Record<string, AccentClasses> = {
  emerald: {
    text: 'text-emerald-400',
    chipBg: 'bg-emerald-500/15',
    softBg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    solid: 'bg-emerald-500',
    gradient: 'from-emerald-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(16,185,129,0.55)]',
    hex: '#34d399',
  },
  violet: {
    text: 'text-violet-400',
    chipBg: 'bg-violet-500/15',
    softBg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    solid: 'bg-violet-500',
    gradient: 'from-violet-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(139,92,246,0.55)]',
    hex: '#a78bfa',
  },
  teal: {
    text: 'text-teal-300',
    chipBg: 'bg-teal-500/15',
    softBg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    solid: 'bg-teal-500',
    gradient: 'from-teal-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(20,184,166,0.55)]',
    hex: '#2dd4bf',
  },
  fuchsia: {
    text: 'text-fuchsia-400',
    chipBg: 'bg-fuchsia-500/15',
    softBg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/30',
    solid: 'bg-fuchsia-500',
    gradient: 'from-fuchsia-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(217,70,239,0.55)]',
    hex: '#e879f9',
  },
  amber: {
    text: 'text-amber-400',
    chipBg: 'bg-amber-500/15',
    softBg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    solid: 'bg-amber-500',
    gradient: 'from-amber-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(245,158,11,0.55)]',
    hex: '#fbbf24',
  },
  orange: {
    text: 'text-orange-400',
    chipBg: 'bg-orange-500/15',
    softBg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    solid: 'bg-orange-500',
    gradient: 'from-orange-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(249,115,22,0.55)]',
    hex: '#fb923c',
  },
  zinc: {
    text: 'text-zinc-300',
    chipBg: 'bg-zinc-500/15',
    softBg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    solid: 'bg-zinc-500',
    gradient: 'from-zinc-500/15 to-transparent',
    glow: 'shadow-[0_0_28px_-8px_rgba(113,113,122,0.55)]',
    hex: '#a1a1aa',
  },
}

export function getAccent(name: string | undefined): AccentClasses {
  return ACCENTS[name ?? 'zinc'] ?? ACCENTS.zinc
}
