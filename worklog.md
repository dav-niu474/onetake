# AI 视频创作画布平台 — 工作日志

> 项目：节点式 AI 视频创作画布（参考 RunningHub / SenseTime SEKO / ComfyUI 设计）
> 技术栈：Next.js 16 + React Flow (@xyflow/react) + zustand + Prisma(SQLite) + shadcn/ui + z-ai-web-dev-sdk

---

## Task ID: 1
Agent: main (Z.ai Code)
Task: 初始版本完整实现 — AI 视频创作画布平台

### 项目当前状态描述/评估
- **核心功能全部就绪**：暗色节点画布 + 9 种节点 + 真实 AI 执行管线（LLM/文生图/图生视频/文生视频）
- Dev server 运行中（端口 3000），`bun run lint` 0 错误
- 已通过 agent-browser 端到端验证：模板载入、节点添加、连线校验、单节点运行、进度可视化、保存

### 已完成内容

**数据库（prisma/schema.prisma）**
- `Workflow` 表：name / description / graph(JSON) / thumbnail
- `Execution` 表：异步任务记录（status/progress/stage/output/error），支持轮询

**后端 API**
- `GET/POST /api/workflows` + `GET/PUT/DELETE /api/workflows/[id]` — 工作流 CRUD
- `POST /api/executions` — 创建执行任务并后台异步运行（fire-and-forget），客户端轮询
- `GET /api/executions/[id]` — 任务状态/进度/结果轮询
- `POST /api/uploads` — 图片上传落盘 /public/uploads
- 执行引擎 `src/lib/ai-canvas/runner.ts`：
  - enhancer → LLM 提示词扩写（7 种风格 × 视频/图像目标）
  - imageGen →CogView 文生图（注意：**size 宽高必须为 32 的倍数**，SDK 类型标注的 1440x720 实测会被 400 拒绝，已修正为 1024x576 等合法尺寸）
  - imageEdit → 图生图（上游图像转 base64）
  - textToVideo / imageToVideo → 真实 AI 视频生成：`video.generations.create` + 每 4s 轮询 `async.result.query`，成功后下载 mp4 到 /public/generated
  - image_url 传 dataURL（base64），本地文件服务端读取转码

**节点注册表（src/lib/ai-canvas/types.ts）**
- 9 种节点：prompt / imageUpload / enhancer / imageGen / imageEdit / textToVideo / imageToVideo / imagePreview / videoPreview
- 数据类型端口：text(emerald) / image(violet) / video(amber)，连接类型校验 `isConnectionValid`
- 参数系统：textarea / select / switch 自动渲染

**前端画布**
- React Flow 暗色画布（dot grid + minimap + controls + 自定义彩色贝塞尔连线，运行时有流动光点动画）
- 节点：类型彩色头部/图标、状态点、进度条、参数控件、输出预览（图片/视频/文本）、错误信息、双击重命名、悬浮工具栏（运行/复制/删除）
- 交互：左侧节点面板（拖拽/点击添加）、画布右键菜单、节点右键菜单、框选、空态引导
- 执行编排 `executor.ts`：Kahn 拓扑排序 → 逐节点 POST+轮询 → 输出传播到下游 → 失败跳过下游 → 停止按钮
- 持久化 `persistence.ts`：保存/打开/删除 + 已保存工作流自动保存（防抖 1.8s）
- 顶部栏：运行/停止、保存状态指示、模板库（4 个预置模板）、作品库对话框、新建
- 状态栏：节点/连线计数、运行状态、适应视图、自动整理布局（分层）
- 快捷键：Ctrl+Enter 运行 / Ctrl+S 保存

### 验证结果（agent-browser 实测）
- ✅ 页面渲染、无控制台报错
- ✅ 模板载入（全流程 6 节点 6 连线，彩色边正确）
- ✅ 面板点击添加节点、节点删除
- ✅ LLM 提示词优化节点真实执行成功（约 6-10s，输出绿色文本）
- ✅ 文生图节点真实执行成功（约 30s，生成"太空舱橘猫宇航员"图像，落盘 /public/generated/img_*.png，88KB）
- ✅ 运行状态可视化（amber 进度条/边框光效/状态点/计数）
- ✅ 保存工作流（"已保存"状态）
- ✅ 缺少上游输入时的正确报错提示
- ⏳ 图生视频任务已提交，等待结果验证（见下轮）
- ✅ 修复：图像尺寸必须为 32 倍数（1214 错误）→ 更新 IMAGE_SIZES 与默认值

### 未解决问题 / 下一轮建议（优先级）
1. **验证图生视频/文生视频端到端**（任务已提交，需 1-5 分钟）
2. **撤销/重做（Ctrl+Z）**：画布编辑高风险操作无回退，建议 snapshot 历史栈
3. 视频生成超时/中断后端任务仍继续，可增加任务取消
4. 增加节点参数面板（右侧 Inspector）、更多节点（TTS 配音、视频拼接、图像搜索素材）
5. 导出：画布截图/工作流 JSON 导入导出
6. 移动端适配检查（minimap 已隐藏于 md 以下）

---

---

## Task ID: 1（续）— 端到端验证与健壮性修复
Agent: main (Z.ai Code)
Task: 完整 E2E 验证 + 修复任务恢复机制

### 本轮验证与修复记录

**真实 AI 执行管线全部打通（agent-browser 实测）**
- ✅ 提示词 → LLM 优化（约 6-10s，输出专业扩写提示词）
- ✅ 文生图（约 30s，"太空舱橘猫宇航员" 1024x576，落盘 /generated）
- ✅ 图生视频（约 5 分钟，1920x1080 h264 5.13s，4.7MB mp4 落盘，浏览器播放验证 currentTime 前进正常）
- ✅ 输出传播：图片预览 / 视频预览节点自动展示上游结果
- ✅ 保存 / 已保存状态 / 快捷键 / 自动保存

**修复的问题**
1. **图像尺寸 400 错误（1214）**：API 要求宽高均为 32 的整数倍，SDK 类型标注的 1440x720 实测被拒 → 重写 IMAGE_SIZES（1024x576 / 576x1024 / 1344x576 等合法值）
2. **任务状态丢失（关键健壮性修复）**：长视频生成期间客户端状态丢失后节点永久 idle，而服务端任务照常完成。新增恢复机制：
   - `GET /api/executions?workflowId=` 返回每节点最近一次执行（output 已 JSON.parse）
   - `resumeWorkflowTasks()`：运行中任务重新接管轮询；已完成任务回填输出并传播；打开工作流/首屏自动触发
   - `POST /api/executions/attach`：保存工作流时把游离（workflowId=null）执行记录挂靠（1 小时窗口 + nodeId 匹配）
   - `syncOutputsAfterLoad()`：载入后有历史输出的节点直接标记就绪
   - 轮询网络抖动自动重试（连续 8 次失败才放弃）
3. **组件名冲突**：palette.tsx 中 lucide Palette 图标与组件同名 → 别名 PaletteIcon
4. **editor.tsx ref 渲染期访问**：移除 menuRef

### 项目当前状态
- Lint 0 错误 0 警告；页面 200；无控制台报错
- 完整链路可用：模板 → 编排 → 运行 → 进度 → 成果 → 保存 → 刷新恢复

### 下一轮建议（优先级从高到低）
1. **撤销/重做（Ctrl+Z）**：snapshot 历史栈（store 层实现，50 步上限）
2. **视频生成失败重试按钮**：失败节点一键重跑
3. **TTS 配音节点**（SDK audio.tts）→ 音频预览节点，配合 with_audio 视频形成完整创作链
4. 节点复制粘贴（Ctrl+C/V）、多选拖拽、框选删除确认
5. 导出：工作流 JSON 导入导出 / 画布 PNG 截图
6. 右侧 Inspector 属性面板（选中节点时显示大屏参数编辑）
7. 更多模板（口播视频、产品展示、故事分镜）


---

## Task ID: 2 — 功能扩展轮（撤销重做 / TTS 配音 / 复制粘贴 / 导入导出 / 新模板）
Agent: cron-webDevReview（第 2 轮）
Task: QA 检查 + 自主新功能开发

### 项目当前状态描述/判断
- 上轮核心链路稳定（无回归 bug），本轮按 worklog 建议优先级推进新功能
- Lint 0 错误、页面 200、控制台无新增报错
- 已保存演示工作流「口播视频 · 配音一条龙」（刷新自动载入）

### 本轮新增功能（全部实测验证）
1. **撤销/重做**：store 层 snapshot 历史栈（60 步上限）
   - 拦截点：增删节点/连线、拖动结束、框选删除
   - Ctrl+Z / Ctrl+Shift+Z（或 Ctrl+Y）+ 顶栏按钮（disabled 态）
   - 实测：添加→撤销→重做（7→6→7）、粘贴→撤销（8→7）✓
   - 输入框聚焦时快捷键不触发画布操作（typing guard）
2. **AI 配音节点（TTS）+ 音频预览节点**：
   - 新数据类型 audio（rose 色），音色 4 选（童童/默认/女声/男声，实测可用）+ 语速滑杆（0.6x-1.5x）
   - 执行器：SDK 返回 PCM 裸流（24kHz 16bit mono）→ 手写 44 字节 WAV 头封装（无子进程）
   - 实测：真实合成 10.26s 配音（492KB WAV），浏览器 audio 播放验证 currentTime 前进 ✓
3. **失败节点一键重试**：节点头部失败态显示 RotateCcw 重试按钮
4. **节点复制/粘贴**：Ctrl+C/V，带内部连线与参数，ID 全新映射，实测 8→9 ✓
5. **JSON 导出/导入**：顶栏"···"菜单；导出 {format, version, name, graph}；导入作为新工作流（含 syncOutputsAfterLoad）✓
6. **新模板 ×2**：口播视频（文案配音+画面双轨）、产品展示（上传→图生图→图生视频）
7. **参数系统增强**：slider 类型（rose 主题滑杆 + 数值徽章）；生成类节点通用渲染所有文本参数

### 本轮修复的 bug
1. **TTS 文本参数不渲染**（关键）：NodeBody 硬编码只渲染 key='prompt' 的 textarea → 改为通用渲染全部 textarea/text 类型参数（fallbackText 由此可见可编辑）
2. **TTS 必需输入误判**：text 端口标记 required 但节点支持参数覆盖 → 改为可选（与文生图模式一致）
3. 顶栏响应式优化（md 以下隐藏文字仅留图标，防溢出）

### 已知问题 / 风险
- React Flow nodeTypes 警告：仅开发期 HMR 模块重载导致（nodeTypes 本身是模块常量），生产构建无此问题
- 本次测试中文案曾误填入全流程模板的文生图节点 prompt 参数（"欢迎来到…"）——该工作流下次打开时建议清理该参数
- 口播模板的双轨产物（音频+视频）暂无合并节点（合成成品需下一轮"视频拼接/音视频合成"节点，可用 ffmpeg wasm 或服务端 ffmpeg）

### 下一轮建议（优先级从高到低）
1. **音视频合成节点**：输入 [video, audio(可选)] → ffmpeg 混流输出成品视频（服务端 ffmpeg 已就绪，child_process 调用）
2. **右侧 Inspector 属性面板**：选中节点显示大屏参数编辑 + 输出信息
3. **画布缩略图**：保存工作流时截取画布 PNG 存 thumbnail（作品库卡片展示）
4. 框选批量删除的确认提示、节点对齐吸附
5. 移动端：面板抽屉化（md 以下）
6. 更多音色探测（TTS voice 列表探测接口未知，当前 4 个实测可用）

---

## Task ID: 3 — 成片合成 / Inspector 面板 / 画布缩略图 / 撤销快照修复
Agent: cron-webDevReview（第 3 轮）
Task: QA 检查 + bug 修复 + 功能扩展

### 项目当前状态描述/判断
- 上轮核心链路稳定，QA（agent-browser 实测）未发现功能性回归：页面渲染、模板/作品库/导入导出菜单、添加节点、撤销重做、自动保存均正常
- 本轮既有 bug 修复，也有 4 项新功能落地，全部实测通过

### 本轮修复的 bug（重要）
1. **撤销/重做在"删除节点"场景下丢失连线（关键架构修复）**
   - 根因：React Flow `deleteElements` 在**同一同步任务内先派发连线 remove、再派发节点 remove**（源码实证），旧逻辑对两类移除各做一次 `commit()`，产生两个快照；单次撤销后出现「节点已恢复但连线丢失」的中间态（实测复现 8 节点/2 连线）
   - 修复（store.ts）：
     - 新增 `commitRemoval()`：同一移除批次（200ms 窗口内的连续移除）仅保留**首份删除前快照**，其余跳过
     - `onNodesChange` 删除分支原子化：应用节点移除的同时清理悬挂连线（单次 set）
     - `onEdgesChange` 增加冗余 remove 守卫：连线已随节点清理时忽略重复派发、不产生快照
     - undo/redo 重置合并标记
   - 实测：删除 2 节点（confirm 后）→ pastTop={8,7} → 单次撤销完整恢复 8 节点 7 连线 → 重做/再撤销均正确 ✓
2. **端口连接状态不实时**：GraphNode 原先用 `data.inputs` 近似（上游运行后才点亮）→ 改为基于 edges 实时计算（useMemo），连线后端口立即点亮

### 本轮新增功能（全部实测验证）
1. **成片合成节点（avMerge）— 打通"最后一公里"**
   - 注册表：处理类 / cyan 色 / 输入 [视频(必需) + 音频(必需)] / 输出视频；参数：保留原声(混音)、原声音量、配音音量、时长对齐（以视频为准=截去多余配音 / 以音频为准=tpad 克隆末帧延长画面）
   - 执行引擎（runner.ts）：ffprobe 探测（音轨/时长/分辨率）→ 动态构造 ffmpeg filter_complex（amix normalize=0 混音 / apad 补齐 / tpad 延长）→ spawn 解析 stderr `time=` 汇报真实进度 → aac 192k + faststart 输出
   - 三种场景实测全部通过：
     - 替换配音·以视频为准：10.3s WAV + 5.1s MP4 → 5.1s 输出（aac ✓）
     - 延长画面·以音频为准：→ 10.26s 输出（h264 重编码 1080p ✓）
     - 混音模式（API 直测）：testsrc 带音轨视频 + amix → mixed:1 ✓
   - 口播模板升级为「口播视频 · 配音合成成片」：文案→配音→画面→**成片合成**→预览，7 节点全链路
2. **右侧 Inspector 属性面板（inspector.tsx）**
   - 选中单个节点时滑出：可重命名、运行状态徽章+耗时+错误、全部参数大屏编辑、端口与连线连接状态（已连接/已连 N 项/未连接·必需）、输出结果（图/视频/音频/文本预览 + meta 徽章）、节点说明（类型/ID）、底部复制/删除
   - 移动端（<md）自动隐藏
3. **画布缩略图**
   - 保存时 html-to-image 捕获 React Flow viewport → canvas 降采样 640px → JPEG q0.72 dataURL（约 13-30KB）；运行中跳过、失败不阻塞保存
   - 作品库卡片左侧展示 68×44 缩略图（无图回退图标）；API POST/PUT 均支持 thumbnail
4. **细节打磨**
   - 网格吸附开关（状态栏 Grid3x3，16px 网格，拖动实测对齐 ✓）
   - 框选批量删除确认（onBeforeDelete，>1 节点时 window.confirm，实测取消/确认/撤销 ✓）
   - 状态栏：显示已选项数；移动端响应式优化（窄屏隐藏次要文本，单行不换行）
   - 左侧节点面板移动端改为浮层抽屉（<md 绝对定位覆盖画布，≥md 恢复常规布局）
   - store 暴露 `window.__canvasStore` 调试句柄（自动化测试/排障用）

### 验证结果汇总
- lint 0 错误 0 警告；页面 200；控制台无报错（仅开发期 React Flow nodeTypes HMR 警告）
- 真实 ffmpeg 合成 ×3 场景、撤销重做原子性、缩略图落库、Inspector 全区块、网格吸附、批量删除确认、移动端布局 —— 全部通过

### 未解决问题 / 风险
- Inspector 订阅整个 nodes 数组：拖动节点时面板会随位置更新重渲染（当前规模无感知卡顿，节点 >50 时可优化为按 id 订阅）
- html-to-image 捕获对 video/audio 元素做了排除（画布中有视频预览时缩略图该区域为空框），可考虑后续截取视频首帧海报
- avMerge "以音频为准"模式需重编码（libx264 veryfast），1080p 5s 视频约 10s 耗时，可接受
- 上轮遗留：React Flow nodeTypes 警告仅开发期 HMR 导致，生产无影响

### 下一轮建议（优先级从高到低）
1. **视频拼接节点（concat）**：多段视频顺序拼接 + 转场，配合成片合成形成"分镜→成片"完整创作链（ffmpeg concat 已具备条件）
2. **素材库节点**：浏览 /generated 与 /uploads 历史产物，一键引用到新节点输入（避免重复生成）
3. **缩略图视频海报**：videoPreview/avMerge 节点输出时生成首帧 poster，参与缩略图捕获
4. Inspector 虚拟化/按 id 订阅优化；节点对齐参考线（对齐吸附之外的智能参考线）
5. 工作流执行历史对话框（Execution 表已有数据，做 UI 展示耗时/状态/产物）
6. 移动端 Inspector 以底部抽屉形式开放
