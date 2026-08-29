import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidateProviderConfigCache } from '@/lib/ai-canvas/provider-config'

/**
 * 删除供应商账户：
 * - 同步把引用该账户的能力路由重置为内置（builtin），避免悬空引用
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await db.providerAccount.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '供应商账户不存在' }, { status: 404 })
    }

    // 引用此账户的能力路由 → 重置为内置
    const routes = await db.providerSetting.findMany({ where: { accountId: id } })
    for (const r of routes) {
      await db.providerSetting.update({
        where: { capability: r.capability },
        data: { providerKind: 'builtin', accountId: null, model: null },
      })
    }
    await db.providerAccount.delete({ where: { id } })

    invalidateProviderConfigCache()

    return NextResponse.json({
      ok: true,
      message: `「${existing.name}」已删除${routes.length ? `，${routes.length} 个能力路由已重置为内置服务` : ''}`,
      resetRoutes: routes.map((r) => r.capability),
    })
  } catch (err) {
    console.error('[providers/id] DELETE 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '删除供应商失败，请稍后重试' }, { status: 500 })
  }
}
