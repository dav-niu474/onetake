import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

/** 轮询执行任务状态 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const row = await db.execution.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    return NextResponse.json({
      id: row.id,
      nodeId: row.nodeId,
      nodeType: row.nodeType,
      status: row.status,
      progress: row.progress,
      stage: row.stage,
      output: row.output ? JSON.parse(row.output) : null,
      error: row.error,
      updatedAt: row.updatedAt,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    )
  }
}
