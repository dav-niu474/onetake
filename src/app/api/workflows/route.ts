import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** 工作流列表 */
export async function GET() {
  try {
    const list = await db.workflow.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ items: list })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '读取失败' },
      { status: 500 },
    )
  }
}

/** 创建工作流 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const wf = await db.workflow.create({
      data: {
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '未命名工作流',
        description: typeof body.description === 'string' ? body.description : '',
        graph: typeof body.graph === 'string' ? body.graph : JSON.stringify(body.graph ?? { nodes: [], edges: [] }),
        ...(typeof body.thumbnail === 'string' ? { thumbnail: body.thumbnail } : {}),
      },
    })
    return NextResponse.json(wf)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '创建失败' },
      { status: 500 },
    )
  }
}
