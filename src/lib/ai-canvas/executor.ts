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
      // 静默更新：输出传播属于状态恢复 / 运行同步，不标记用户编辑（避免误触自动保存）
      updateNodeData(
        e.target,
        (d) => ({
          inputs: { ...(d.inputs ?? {}), [e.targetHandle ?? '']: out },
        }),
        { dirty: false },
      )
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
    // 恢复任务落定回调：在循环结束后按实际恢复数赋值
    // （pollExecution 首次轮询前有 1.2s 延时，同步循环内不可能提前触发）
    let onTaskSettled: (() => void) | null = null
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
          .finally(() => {
            onTaskSettled?.()
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
      // 同步运行标志：顶栏显示「停止」、阻断运行中重复触发全图运行；
      // 全部恢复任务落定后自动复位
      let pending = resumed
      useCanvasStore.getState().setRunning(true)
      onTaskSettled = () => {
        pending -= 1
        if (pending <= 0 && useCanvasStore.getState().running) {
          // 若仍有节点处于执行/排队态（如 dev HMR 场景下孤儿循环在跑其他任务），
          // 不复位运行标志，交由实际执行方收尾
          const busy = useCanvasStore
            .getState()
            .nodes.some((n) => n.data.runState === 'running' || n.data.runState === 'queued')
          if (!busy) useCanvasStore.getState().setRunning(false)
        }
      }
    }
    void restored
  } catch {
    /* 静默失败 */
  }
}

/**
 * 构建执行时刻的画布布局快照（供运行历史展示迷你图）：
 * 仅保留渲染必需字段（位置/类型/标签/运行态），体积小（每节点 ≈100B）。
 */
function buildCanvasSnapshot(nodeId: string) {
  const { nodes, edges } = useCanvasStore.getState()
  return {
    focus: nodeId,
    nodes: nodes
      .filter((n) => !n.hidden)
      .slice(0, 300) // 超大画布截断保护
      .map((n) => ({
        id: n.id,
        type: n.type ?? '',
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        label: n.data.label ?? '',
        state: n.data.runState ?? 'idle',
      })),
    edges: edges.slice(0, 600).map((e) => [e.source, e.sourceHandle ?? '', e.target, e.targetHandle ?? '']),
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
        // 执行时刻的画布布局快照：运行历史中可回看当时图结构
        snapshot: buildCanvasSnapshot(nodeId),
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

/**
 * 找回远端视频任务（超时/中断场景）：
 * 服务端凭 remoteTaskId 查询云端任务状态，成功则下载成片并回填节点输出。
 * 等待期间节点 stage 实时显示已等待秒数（本地计时器，每 2s 跳动）。
 */
export async function reclaimNodeTask(nodeId: string): Promise<boolean> {
  const { nodes, workflow, setNodeRunState } = useCanvasStore.getState()
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return false
  const start = Date.now()
  setNodeRunState(nodeId, 'running', {
    stage: '正在找回云端任务…',
    progress: 10,
    error: undefined,
  })
  /* 找回进度可视化：服务端长轮询期间，本地计时器让节点状态实时跳动 */
  const ticker = setInterval(() => {
    const sec = Math.round((Date.now() - start) / 1000)
    useCanvasStore.getState().setNodeRunState(nodeId, 'running', {
      stage: `正在找回云端任务… 已等待 ${sec}s（云端生成中）`,
      progress: Math.min(92, 10 + sec * 2),
    })
  }, 2000)
  try {
    const res = await fetch('/api/executions/reclaim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: workflow.id,
        nodeId,
        waitMs: 150000, // 最长等待 2.5 分钟云端完成
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '找回请求失败')
    if (data.status === 'success' && data.output) {
      applyOutputs(nodeId, data.output, Date.now() - start)
      useCanvasStore.getState().showToast('success', '云端任务找回成功，视频已回填节点')
      return true
    }
    if (data.status === 'failed') {
      throw new Error(data.error || '云端任务失败')
    }
    // 仍在运行：保持 failed 态（保留找回按钮），提示稍后再试
    setNodeRunState(nodeId, 'failed', {
      stage: '失败',
      error: `云端任务仍在生成中（已等待 ${data.elapsed ?? '?'}s），稍后可再次找回`,
      durationMs: Date.now() - start,
    })
    useCanvasStore.getState().showToast('info', '云端任务尚未完成，稍后可再次点击找回')
    return false
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setNodeRunState(nodeId, 'failed', {
      stage: '失败',
      error: msg,
      durationMs: Date.now() - start,
    })
    useCanvasStore.getState().showToast('error', `找回失败：${msg}`)
    return false
  } finally {
    clearInterval(ticker)
  }
}

/**
 * 拓扑分层：同一层内的节点互不依赖，可并行执行。
 * 层号 = 最长上游路径长度（保证执行某层时其全部上游已完成）。
 */
function topoLevels(nodes: Node<CanvasNodeData>[], edges: { source: string; target: string }[]): string[][] | null {
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
  let frontier = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  const levels: string[][] = []
  let remaining = nodes.length
  while (frontier.length > 0) {
    levels.push(frontier)
    remaining -= frontier.length
    const next: string[] = []
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        const d = (indeg.get(t) ?? 0) - 1
        indeg.set(t, d)
        if (d === 0) next.push(t)
      }
    }
    frontier = next
  }
  return remaining === 0 ? levels : null
}

/** 某节点沿连线方向的全部直接+间接下游 */
function downstreamOf(startId: string, edges: { source: string; target: string }[]): Set<string> {
  const adj = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  })
  const seen = new Set<string>()
  const stack = [startId]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const t of adj.get(cur) ?? []) {
      if (!seen.has(t)) {
        seen.add(t)
        stack.push(t)
      }
    }
  }
  return seen
}

/** 某组节点的全部直接+间接上游（用于分组运行时自动补齐依赖） */
function upstreamClosureOf(startIds: string[], edges: { source: string; target: string }[]): Set<string> {
  const rev = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!rev.has(e.target)) rev.set(e.target, [])
    rev.get(e.target)!.push(e.source)
  })
  const seen = new Set<string>()
  const stack = [...startIds]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const s of rev.get(cur) ?? []) {
      if (!seen.has(s)) {
        seen.add(s)
        stack.push(s)
      }
    }
  }
  return seen
}

/** 并发池：按上限并发执行任务，全部结束后统一返回结果 */
async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++
      try {
        results[idx] = { status: 'fulfilled', value: await tasks[idx]() }
      } catch (err) {
        results[idx] = { status: 'rejected', reason: err }
      }
    }
  })
  await Promise.all(workers)
  return results
}

/* ---------- 按节点类型分池限流 ----------
 * LLM / TTS 接口并发 3 时必现 429（实测），单独限 2；
 * 视频生成接口实测为「同账号同时仅允许 1 个活跃任务」：
 * 并发 2/3 提交时后者持续 429（重试 3 次共 24s 退避仍失败，Task 8 实证），
 * 因此视频池严格串行（=1），提交重试（4s/8s/12s）保留作兜底；
 * 图像生成相对宽松限 3；ffmpeg 本地进程限 2（IO 密集，避免拖垮机器）。
 */
type PoolCategory = 'llm' | 'video' | 'image' | 'ffmpeg'

const POOL_LIMITS: Record<PoolCategory, number> = {
  llm: 2,
  video: 1,
  image: 3,
  ffmpeg: 2,
}

/** 整图运行的全局最大并发度（各类池叠加后的总量上限） */
const MAX_PARALLEL = 6

function poolCategoryOf(nodeType: string): PoolCategory {
  if (nodeType === 'enhancer' || nodeType === 'tts') return 'llm'
  if (nodeType === 'textToVideo' || nodeType === 'imageToVideo') return 'video'
  if (nodeType === 'concat' || nodeType === 'avMerge') return 'ffmpeg'
  return 'image'
}

class Semaphore {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private readonly limit: number) {}
  /** 当前是否还有空闲额度（用于预估排队提示） */
  available() {
    return this.active < this.limit
  }
  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active++
  }
  release() {
    this.active--
    const next = this.waiters.shift()
    if (next) next()
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/**
 * 运行整个工作流（拓扑分层 + 层内并行执行）
 */
export async function runWorkflow() {
  await runScope(null)
}

/**
 * 运行分组：分组内全部节点 + 缺少输出的上游依赖。
 * 上游已有输出的节点直接复用（不重跑），范围外节点状态不受影响。
 */
export async function runGroup(groupId: string) {
  const { groups, nodes, edges } = useCanvasStore.getState()
  const g = groups.find((x) => x.id === groupId)
  if (!g) return
  const coreIds = g.nodeIds.filter((id) => nodes.some((n) => n.id === id))
  if (coreIds.length === 0) {
    useCanvasStore.getState().showToast('info', '分组内没有节点')
    return
  }
  // 折叠状态先展开（便于观察执行进度）
  if (g.collapsed) {
    useCanvasStore.getState().setGroupCollapsed(groupId, false, { silent: true })
  }
  await runScope(coreIds, g.name)
}

/**
 * 运行当前选中的节点（多选批量执行）：
 * 与分组运行同一作用域语义——自动补齐缺少输出的上游依赖，已就绪上游复用。
 */
export async function runSelected() {
  const { nodes } = useCanvasStore.getState()
  const coreIds = nodes.filter((n) => n.selected).map((n) => n.id)
  if (coreIds.length === 0) {
    useCanvasStore.getState().showToast('info', '请先选中要运行的节点')
    return
  }
  await runScope(coreIds, `所选 ${coreIds.length} 节点`)
}

/**
 * 作用域运行引擎：
 * - coreIds = null：全图运行（重置全部节点状态，行为与旧版 runWorkflow 一致）
 * - coreIds = [...]：仅运行这些节点（含缺少输出的上游依赖补齐），
 *   上游已就绪则复用输出，失败跳过也仅影响作用域内的下游
 */
async function runScope(coreIds: string[] | null, scopeName?: string) {
  const store = useCanvasStore.getState()
  const { nodes, edges, setRunning, setNodeRunState, showToast } = store
  if (nodes.length === 0) {
    showToast('info', '画布为空，请先添加节点')
    return
  }
  if (store.running) return

  /* 计算作用域：core + 缺少输出的上游依赖 */
  const coreSet = coreIds ? new Set(coreIds) : null
  const scopedUpstream = new Set<string>()
  if (coreSet) {
    const upstream = upstreamClosureOf([...coreSet], edges)
    upstream.forEach((id) => {
      const n = nodes.find((x) => x.id === id)
      if (!n) return
      // 上游依赖：非可执行节点（prompt/asset 等数据即时派生）无需运行；
      // 可执行节点仅在没有输出时才补跑
      const hasOutputs = Object.keys(n.data.outputs ?? {}).length > 0
      if (NODE_SPECS[n.type]?.executable && !hasOutputs) {
        scopedUpstream.add(id)
      }
    })
  }
  const scopeIds = coreSet
    ? new Set([...coreSet, ...scopedUpstream])
    : new Set(nodes.map((n) => n.id))

  const scopeNodes = nodes.filter((n) => scopeIds.has(n.id))
  if (scopeNodes.length === 0) {
    showToast('info', '作用域内没有可运行的节点')
    return
  }

  const levels = topoLevels(scopeNodes, edges)
  if (!levels) {
    showToast('error', '图中存在循环连接，请检查')
    return
  }

  setRunning(true)
  // 重置作用域内节点状态（全图模式=全部；分组模式=仅作用域）
  scopeNodes.forEach((n) =>
    setNodeRunState(n.id, 'idle', { stage: undefined, progress: 0, error: undefined }),
  )

  const failedAt = new Set<string>()
  const skipSet = new Set<string>() // 失败节点的下游（含传递下游）

  for (let li = 0; li < levels.length; li++) {
    if (useCanvasStore.getState().runAbort) break
    const layer = levels[li]
    const live = layer.filter((id) => !skipSet.has(id))

    // 本层先处理非执行节点（纯数据派生，瞬时完成）
    for (const id of live) {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === id)
      if (!node) continue
      const spec = NODE_SPECS[node.type]
      if (!spec?.executable) {
        setNodeRunState(id, 'success', { stage: '数据就绪', progress: 100 })
        propagateOutputs(id)
      }
    }

    // 可执行节点 → 并发池
    const execIds = live.filter((id) => {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === id)
      return node && NODE_SPECS[node.type]?.executable
    })
    if (execIds.length > 0) {
      const sems: Record<PoolCategory, Semaphore> = {
        llm: new Semaphore(POOL_LIMITS.llm),
        video: new Semaphore(POOL_LIMITS.video),
        image: new Semaphore(POOL_LIMITS.image),
        ffmpeg: new Semaphore(POOL_LIMITS.ffmpeg),
      }
      const typeOf = (id: string) =>
        useCanvasStore.getState().nodes.find((n) => n.id === id)?.type ?? ''
      execIds.forEach((id) =>
        setNodeRunState(id, 'queued', { stage: '排队中' }),
      )
      const results = await runPool(
        execIds.map((id) => {
          const cat = poolCategoryOf(typeOf(id))
          return () => {
            // 同类任务池已满时，提前提示「等待并发额度」而非笼统的排队中
            if (!sems[cat].available()) {
              setNodeRunState(id, 'queued', { stage: '等待同类任务完成…' })
            }
            return sems[cat].run(() => runNode(id))
          }
        }),
        MAX_PARALLEL,
      )
      let layerFailed = false
      results.forEach((r, idx) => {
        const id = execIds[idx]
        const ok = r.status === 'fulfilled' && r.value === true
        if (!ok) {
          const aborted = useCanvasStore.getState().runAbort
          if (!aborted) {
            layerFailed = true
            failedAt.add(id)
            downstreamOf(id, edges).forEach((d) => {
              if (scopeIds.has(d)) skipSet.add(d)
            })
          }
        }
      })
      if (layerFailed) {
        // 标记失败节点的全部下游为 skipped
        skipSet.forEach((rid) => {
          const rn = useCanvasStore.getState().nodes.find((n) => n.id === rid)
          if (rn && NODE_SPECS[rn.type ?? '']?.executable && rn.data.runState !== 'failed') {
            setNodeRunState(rid, 'skipped', { stage: '上游失败，已跳过' })
          }
        })
        break
      }
    }

    // 被跳过的本层节点（上游失败）标记状态
    layer
      .filter((id) => skipSet.has(id))
      .forEach((id) => {
        const rn = useCanvasStore.getState().nodes.find((n) => n.id === id)
        if (rn && NODE_SPECS[rn.type ?? '']?.executable) {
          setNodeRunState(id, 'skipped', { stage: '上游失败，已跳过' })
        }
      })
  }

  // 刷新一次全图传播（处理手动连线后未传播的情况）
  useCanvasStore.getState().nodes.forEach((n) => propagateOutputs(n.id))

  setRunning(false)
  const st = useCanvasStore.getState()
  if (st.runAbort) {
    showToast('info', '已停止运行')
  } else if (failedAt.size > 0) {
    showToast('error', '运行中断：存在失败节点，请检查错误信息')
  } else if (coreSet) {
    const done = coreSet.size - failedAt.size
    showToast('success', `${scopeName ? `「${scopeName}」` : '分组'}运行完成（${done}/${coreSet.size} 个节点就绪）🎉`)
  } else {
    showToast('success', '工作流运行完成 🎉')
  }
}
