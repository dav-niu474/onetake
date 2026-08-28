import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const wf = await db.workflow.findUnique({ where: { id } })
    if (!wf) return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    return NextResponse.json(wf)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '读取失败' },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const wf = await db.workflow.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' ? { name: body.name.trim() || '未命名工作流' } : {}),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
        ...(body.graph !== undefined
          ? { graph: typeof body.graph === 'string' ? body.graph : JSON.stringify(body.graph) }
          : {}),
        ...(typeof body.thumbnail === 'string' ? { thumbnail: body.thumbnail } : {}),
      },
    })
    return NextResponse.json(wf)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '保存失败' },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.workflow.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '删除失败' },
      { status: 500 },
    )
  }
}
