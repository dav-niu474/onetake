'use client'

/**
 * 客户端执行编排：拓扑排序 → 逐节点调用执行 API → 轮询进度 → 回写输出
 */
import { useCanvasStore } from './store'
import {
  NODE_SPECS,
  type CanvasNodeData,
  type NodeOutput,
} from './types'
import type { Node } from '@xyflow/react'

const POLL_INTERVAL = 1200

function getNodeOutputs(node: Node<CanvasNodeData>): Record<string, NodeOutput> {
  const outs: Record<string, NodeOutput> = { ...node.data.outputs }
  // 提示词节点的输出由参数实时派生
  if (node.type === 'prompt') {
    const text = String(node.data.params?.text ?? '').trim()
    if (text) outs.text = { kind: 'text', text }
  }
  return outs
}

/** 解析某节点的全部上游输入 */
function resolveInputs(
  nodeId: string,
): { inputs: Record<string, NodeOutput>; missingRequired: string[] } {
  const { nodes, edges } = useCanvasStore.getState()
  const node = nodes.find((n) => n.id === nodeId)
  const inputs: Record<string, NodeOutput> = {}
  const missingRequired: string[] = []
  if (!node) return { inputs, missingRequired }
  const spec = NODE_SPECS[node.type]
  if (!spec) return { inputs, missingRequired }

  for (const e of edges.filter((x) => x.target === nodeId)) {
    const src = nodes.find((n) => n.id === e.source)
    if (!src) continue
    const out = getNodeOutputs(src)[e.sourceHandle ?? '']
    if (out) inputs[e.targetHandle ?? ''] = out
  }
  for (const inp of spec.inputs) {
    if (inp.required && !inputs[inp.id]) missingRequired.push(inp.label)
  }
  return { inputs, missingRequired }
}

/** 将某节点的输出传播给下游节点（供预览节点实时展示） */
function propagateOutputs(nodeId: string) {
  const { nodes, edges, updateNodeData } = useCanvasStore.getState()
  const src = nodes.find((n) => n.id === nodeId)
  if (!src) return
  const outs = getNodeOutputs(src)
  edges
    .filter((e) => e.source === nodeId)
    .forEach((e) => {
      const out = outs[e.sourceHandle ?? '']
      if (!out) return
      updateNodeData(e.target, (d) => ({
        inputs: { ...(d.inputs ?? {}), [e.targetHandle ?? '']: out },
      }))
    })
}

/** 轮询单个执行任务直至完成（网络抖动自动重试） */
async function pollExecution(execId: string, nodeId: string): Promise<Record<string, NodeOutput>> {
  const { setNodeRunState } = useCanvasStore.getState()
  let fetchErrors = 0
  while (true) {
    if (useCanvasStore.getState().runAbort) {
      throw new Error('__ABORT__')
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let res: Response
    try {
      res = await fetch(`/api/executions/${execId}`, { cache: 'no-store' })
    } catch {
      if (++fetchErrors > 8) throw new Error('网络连接不稳定，已停止等待')
      continue
    }
    if (!res.ok) {
      if (++fetchErrors > 8) throw new Error('执行任务查询失败')
      continue
    }
    fetchErrors = 0
    const data = await res.json()
    if (data.stage || typeof data.progress === 'number') {
      setNodeRunState(nodeId, 'running', {
        stage: data.stage,
        progress: data.progress ?? 0,
      })
    }
    if (data.status === 'success') return data.output ?? {}
    if (data.status === 'failed') {
      throw new Error(data.error || '节点执行失败')
    }
  }
}

/** 应用执行结果到节点并传播给下游 */
function applyOutputs(nodeId: string, outputs: Record<string, NodeOutput>, durationMs?: number) {
  const { setNodeOutput, setNodeRunState } = useCanvasStore.getState()
  Object.entries(outputs).forEach(([handleId, out]) => {
    if (out) setNodeOutput(nodeId, handleId, out)
  })
  setNodeRunState(nodeId, 'success', {
    stage: '完成',
    progress: 100,
    error: undefined,
    ...(durationMs ? { durationMs } : {}),
  })
  propagateOutputs(nodeId)
}

/**
 * 打开工作流后同步状态：
 * 已保存输出的节点（或已填写内容的提示词节点）标记为就绪，并把输出传播给下游预览节点
 */
export function syncOutputsAfterLoad() {
  const { nodes, setNodeRunState } = useCanvasStore.getState()
  nodes.forEach((n) => {
    const hasOutputs = Object.keys(n.data.outputs ?? {}).length > 0
    const promptReady =
      n.type === 'prompt' && String(n.data.params?.text ?? '').trim().length > 0
    if (hasOutputs || promptReady) {
      setNodeRunState(n.id, 'success', { stage: '数据就绪', progress: 100 })
    }
  })
  useCanvasStore.getState().nodes.forEach((n) => propagateOutputs(n.id))
}

/**
 * 恢复工作流任务：页面刷新 / 状态丢失后，
 * 将仍在运行的任务重新接管轮询，将已完成的结果回填节点
 */
export async function resumeWorkflowTasks() {
  const { nodes, workflow, setNodeRunState } = useCanvasStore.getState()
  if (!workflow.id || nodes.length === 0) return
  try {
    const res = await fetch(`/api/executions?workflowId=${workflow.id}`, {
      cache: 'no-store',
    })
    if (!res.ok) return
    const { items } = (await res.json()) as {
      items: {
        id: string
        nodeId: string
        status: string
        progress: number
        stage: string
        output: Record<string, NodeOutput> | null
        error: string | null
      }[]
    }
    let resumed = 0
    let restored = 0
    for (const item of items) {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === item.nodeId)
      if (!node) continue
      if (item.status === 'running') {
        resumed++
        setNodeRunState(item.nodeId, 'running', {
          stage: item.stage || '恢复监控中…',
          progress: item.progress ?? 0,
        })
        void pollExecution(item.id, item.nodeId)
          .then((outputs) => {
            applyOutputs(item.nodeId, outputs)
            useCanvasStore.getState().showToast('success', '后台任务已完成，结果已回填')
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg !== '__ABORT__') {
              useCanvasStore
                .getState()
                .setNodeRunState(item.nodeId, 'failed', { stage: '失败', error: msg })
            }
          })
      } else if (item.status === 'success' && item.output) {
        const hasAny = Object.keys(node.data.outputs ?? {}).length > 0
        if (!hasAny) {
          restored++
          applyOutputs(item.nodeId, item.output)
        }
      } else if (item.status === 'failed' && node.data.runState === 'running') {
        setNodeRunState(item.nodeId, 'failed', {
          stage: '失败',
          error: item.error || '执行失败',
        })
      }
    }
    if (resumed > 0) {
      useCanvasStore.getState().showToast('info', `已恢复 ${resumed} 个后台任务的进度监控`)
    }
    void restored
  } catch {
    /* 静默失败 */
  }
}

/** 执行单个节点（含状态回写与输出传播） */
export async function runNode(nodeId: string): Promise<boolean> {
  const store = useCanvasStore.getState()
  const { nodes, setNodeRunState, setNodeOutput, updateNodeData, workflow } = store
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return false
  const spec = NODE_SPECS[node.type]
  if (!spec?.executable) return true

  const start = Date.now()
  try {
    const { inputs, missingRequired } = resolveInputs(nodeId)
    if (missingRequired.length > 0) {
      setNodeRunState(nodeId, 'failed', {
        error: `缺少必需输入：${missingRequired.join('、')}`,
        stage: '失败',
      })
      return false
    }
    setNodeRunState(nodeId, 'running', { stage: '任务提交中…', progress: 2, error: undefined })

    const res = await fetch('/api/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: workflow.id,
        nodeId,
        nodeType: node.type,
        inputs,
        params: node.data.params,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || '创建执行任务失败')
    }
    const { id: execId } = await res.json()
    const outputs = await pollExecution(execId, nodeId)

    // 写回输出
    Object.entries(outputs).forEach(([handleId, out]) => {
      if (out) setNodeOutput(nodeId, handleId, out)
    })
    setNodeRunState(nodeId, 'success', {
      stage: '完成',
      progress: 100,
      durationMs: Date.now() - start,
      error: undefined,
    })
    propagateOutputs(nodeId)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === '__ABORT__') {
      setNodeRunState(nodeId, 'idle', { stage: undefined, progress: 0 })
      return false
    }
    setNodeRunState(nodeId, 'failed', {
      stage: '失败',
      error: msg,
      durationMs: Date.now() - start,
    })
    return false
  }
}

/** 拓扑排序（Kahn） */
function topoSort(nodes: Node<CanvasNodeData>[], edges: { source: string; target: string }[]): string[] | null {
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  nodes.forEach((n) => {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  })
  edges.forEach((e) => {
    if (!indeg.has(e.source) || !indeg.has(e.target)) return
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  })
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const t of adj.get(id) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1
      indeg.set(t, d)
      if (d === 0) queue.push(t)
    }
  }
  return order.length === nodes.length ? order : null
}

/** 运行整个工作流 */
export async function runWorkflow() {
  const store = useCanvasStore.getState()
  const { nodes, edges, setRunning, setNodeRunState, showToast } = store
  if (nodes.length === 0) {
    showToast('info', '画布为空，请先添加节点')
    return
  }
  if (store.running) return

  const order = topoSort(nodes, edges)
  if (!order) {
    showToast('error', '图中存在循环连接，请检查')
    return
  }

  setRunning(true)
  // 重置全部状态
  nodes.forEach((n) =>
    setNodeRunState(n.id, 'idle', { stage: undefined, progress: 0, error: undefined }),
  )

  const failedAt = new Set<string>()
  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (useCanvasStore.getState().runAbort) break
    const node = useCanvasStore.getState().nodes.find((n) => n.id === id)
    if (!node) continue
    const spec = NODE_SPECS[node.type]

    if (spec?.executable) {
      setNodeRunState(id, 'queued', { stage: '排队中' })
      const ok = await runNode(id)
      if (!ok) {
        // 标记所有后续节点为 skipped
        order.slice(i + 1).forEach((rid) => {
          const rn = useCanvasStore.getState().nodes.find((n) => n.id === rid)
          if (rn && NODE_SPECS[rn.type ?? '']?.executable) {
            setNodeRunState(rid, 'skipped', { stage: '上游失败，已跳过' })
          }
        })
        failedAt.add(id)
        break
      }
    } else {
      // 非执行节点：派生输出并传播（提示词就绪）
      setNodeRunState(id, 'success', { stage: '数据就绪', progress: 100 })
      propagateOutputs(id)
    }
  }

  // 刷新一次全图传播（处理手动连线后未传播的情况）
  useCanvasStore.getState().nodes.forEach((n) => propagateOutputs(n.id))

  setRunning(false)
  const st = useCanvasStore.getState()
  if (st.runAbort) {
    showToast('info', '已停止运行')
  } else if (failedAt.size > 0) {
    showToast('error', '运行中断：存在失败节点，请检查错误信息')
  } else {
    showToast('success', '工作流运行完成 🎉')
  }
}
