import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 执行历史：查询最近的节点执行记录（原始记录，不去重）
 * GET /api/executions/history?workflowId=xxx
 * 不传 workflowId 时返回全部最近记录
 */
export async function GET(req: NextRequest) {
  try {
    const workflowId = req.nextUrl.searchParams.get('workflowId')
    const rows = await db.execution.findMany({
      where: workflowId ? { workflowId } : {},
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        nodeId: true,
        nodeType: true,
        status: true,
        stage: true,
        error: true,
        output: true,
        createdAt: true,
        updatedAt: true,
        workflowId: true,
      },
    })
    // remoteTaskId 原生 SQL 读取（兼容旧客户端运行时，重启后可改回类型化字段）
    const rids = rows.map((r) => r.id)
    const remoteMap = new Map<string, string | null>()
    if (rids.length > 0) {
      try {
        const placeholders = rids.map(() => '?').join(',')
        const remoteRows = await db.$queryRawUnsafe<
          { id: string; remoteTaskId: string | null }[]
        >(`SELECT id, remoteTaskId FROM Execution WHERE id IN (${placeholders})`, ...rids)
        remoteRows.forEach((r) => remoteMap.set(r.id, r.remoteTaskId))
      } catch {
        /* 列尚不存在时忽略 */
      }
    }
    const items = rows.map((row) => {
      let output: Record<string, { kind?: string; url?: string; text?: string }> | null = null
      try {
        output = row.output ? JSON.parse(row.output) : null
      } catch {
        output = null
      }
      return {
        ...row,
        output,
        remoteTaskId: remoteMap.get(row.id) ?? null,
        durationMs: Math.max(
          0,
          new Date(row.updatedAt).getTime() - new Date(row.createdAt).getTime(),
        ),
      }
    })
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    )
  }
}
