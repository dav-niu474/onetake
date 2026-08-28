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

