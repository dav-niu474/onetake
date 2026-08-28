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

---

## Task ID: 4 — 视频拼接 / 素材库 / 运行历史 / 视频海报
Agent: cron-webDevReview（第 4 轮）
Task: QA 检查 + bug 修复 + 功能扩展

### 项目当前状态描述/判断
- 上轮核心链路稳定，agent-browser QA 未发现回归：页面渲染、工作流自动恢复（含输出回填）、模板/作品库对话框、添加节点、撤销重做（8→9→8→9）、TTS 真实执行均正常
- Lint 0 错误 0 警告；控制台无新增报错（仅开发期 React Flow nodeTypes HMR 警告与 Next DevTools hydration 提示）
- 节点体系从 11 种扩展到 **13 种**（新增 concat / asset）

### 本轮修复的 bug（重要）
1. **concat 叠化转场 ffmpeg 失败（CFR 校验）**
   - 现象：xfade 报 "The inputs needs to be a constant frame rate; current rate of 1/0 is invalid"，任务失败
   - 根因：归一化链中 `setpts=PTS-STARTPTS` 置于 `fps=30` 之后，破坏了帧率元数据（变为 1/0）
   - 修复：调整链序为 `…,setsar=1,setpts=PTS-STARTPTS,fps=30,format=yuv420p`（setpts 在前、fps 收尾）
   - 实证：修复前 API 复现失败（code 234）；修复后同样输入成功出片

### 本轮新增功能（全部实测验证）
1. **视频拼接节点（concat）— 打通"分镜 → 成片"创作链**
   - 4 个视频输入端口（段 1/段 2 必需，段 3/段 4 可选，按端口序拼接）
   - 参数：转场效果（硬切/叠化/擦除/上滑/圆形展开，xfade 实现及 clamp 防转场超过最短片段）、转场时长滑杆（0.2-2s）、画幅统一（以首段为准 · 留黑边 pad / 裁剪填满 crop）
   - 执行引擎：ffprobe 逐段探测（时长缺失直接报错）→ 无音轨片段自动补 anullsrc 静音轨 → 逐段归一化（同分辨率/fps/像素格式/音轨 44.1k 立体声 + atrim 裁齐）→ concat filter（硬切）或 xfade/acrossfade 链（转场）→ libx264+aac 输出
   - 实测 ×2：硬切 10.26s+5.13s → 15.39s 1080p（浏览器 E2E，19.7s 耗时）；叠化 10.26s+15.39s−0.6s → 25.07s（API 直测）✓ 注：早期怀疑的"时长不符"实为测试者记错输入时长（merge_mtccxlr7 是 10.26s 的 tpad 延长版），复算后完全吻合，引擎无误
2. **素材库（assets-dialog + /api/assets）— 产物复用，避免重复生成**
   - 浏览 /generated 与 /uploads 全部媒体（图片/视频/音频自动分类，≤300 条按时间倒序）；视频卡片 preload=metadata 显示首帧、悬停自动播放；类型筛选 tabs 带计数
   - 支持上传（image/video/audio，80MB 上限）、下载、删除（路径正则白名单 + 前缀包含校验，/etc/passwd 实测被拒）
   - **一键插入画布**：生成「素材引用」节点（sky 色，输入类），参数写入 kind/url/name，输出端口仅显示激活类型，节点即插即用（success 态直接可连线）
   - 新节点类型 asset：3 个输出端口（image/video/audio），isConnectionValid 按 assetKind 激活端口校验；Inspector 切换素材类型时自动清空失效输出
   - 实测：插入视频素材 → 连接 concat 段 1/段 2 → 真实拼接出片 ✓
3. **运行历史对话框（history-dialog + /api/executions/history）**
   - 展示最近 80 条执行记录（当前工作流维度或全局）：状态徽章/节点名/时间/耗时/错误/产物下载链接（视频/音频/图像/文本）
   - 顶栏"···"菜单新增「运行历史」入口
4. **视频首帧海报（poster）**
   - 所有视频类输出（文生视频/图生视频/成片合成/视频拼接）落盘后自动 ffmpeg 抽首帧 poster.jpg，写入输出 meta.poster
   - 节点内视频预览（生成类 + 视频预览节点）通过 <video poster> 即时显示封面，加载体验提升
5. **上传 API 扩展**：/api/uploads 从仅图片扩展为 image/video/audio（EXT_MAP 白名单 + 80MB 保护），文件名前缀区分 up_/uv_/ua_

### 验证结果汇总
- concat 硬切 ×1（浏览器 E2E）+ 叠化 ×2（API）：出片时长逐帧吻合、aac 音轨、poster 生成 ✓
- 素材库：16 项列表/筛选/上传 wav+mp4/删除/安全校验 ✓；插入画布 → concat 连线 → 执行 ✓
- 运行历史：工作流维度记录（拼接 19.2s/配音 3.6s/合成 11s 等）+ 产物下载 ✓
- lint 0/0；页面 200；工作流测试节点已清理并自动保存恢复原状

### 未解决问题 / 风险
- asset 节点在 Inspector 里切换素材类型后仅清空输出，assetUrl 仍指旧文件——建议下轮在切换时同时校验 url 后缀并提示"重新从素材库插入"
- xfade 拼接为全量重编码（1080p 约 1x 实时耗时），长片拼接偏慢；可考虑预览用 speed 档（crf 23 + superfast）
- html-to-image 缩略图仍排除 video/audio 元素（poster 无法参与缩略图捕获，该区域为空框）
- 素材库无搜索/分页（当前 ≤300 条可接受）；删除素材不会清理引用它的工作流节点（有 confirm 提示兜底）
- concat 段数上限 4（端口静态定义），更多段需动态端口方案

### 下一轮建议（优先级从高到低）
1. **「故事分镜」模板**：多段提示词 → 并行文生视频 → concat 拼接 → TTS 配音 → avMerge 成片（全链路 10+ 节点大模板，展示平台编排能力）
2. asset 节点 Inspector 增强：类型切换时同步校验/更新 assetUrl，支持从 Inspector 直接打开素材库替换
3. 素材库搜索框 + 按 kind/mtime 排序选项；poster 文件（poster_*）在素材库中默认折叠或归类
4. 拼接性能优化：提供"快速预览"开关（crf 28 + superfast），导出时再全质量渲染
5. 画布缩略图：截取视频首帧 poster 拼入缩略图（解决 video 元素空框）
6. 移动端 Inspector 底部抽屉化；concat 动态端口（"添加分段"按钮，>4 段）

---

## Task ID: 5 — 并行执行引擎 / 故事分镜模板 / 数据覆盖事故修复 / 素材库与 Inspector 增强
Agent: cron-webDevReview（第 5 轮）
Task: QA 检查 + bug 修复 + 功能扩展

### 项目当前状态描述/判断
- 上轮 13 节点体系与全链路稳定，agent-browser QA 未发现回归（渲染/模板/素材库/运行历史/添加节点/撤销重做/Inspector 均正常）
- 本轮 **发现并修复了一起严重数据覆盖事故**（详见下文， важно），并落地 6 项新功能，全部实测通过
- 节点体系仍为 13 种；模板从 6 个增至 **7 个**（新增 12 节点「故事分镜」大模板）

### 🔴 本轮修复的严重 bug（数据覆盖事故 + 回归）
1. **自动保存竞态导致工作流数据被覆盖（关键事故，已修复 + 数据已恢复）**
   - 现象：「口播视频·配音一条龙」工作流（id=cmtccd6kh…）的 name/graph 被测试画布「并行执行测试2」覆盖
   - 根因链（三因叠加）：
     a) `propagateOutputs` 走 `updateNodeData`，而后者无条件 `dirty: true` → **打开工作流**（syncOutputsAfterLoad 全图传播）即触发"打开即保存"的 1.8s 定时器
     b) 定时器到点仅检查 `st.workflow.id` 存在，**不校验与发起时刻是否同一工作流** → 窗口期内画布切换到其他工作流（loadGraph id=null → 运行后再切回/打开别的工作流）时，新内容被 PUT 进旧 id
     c) `POST /api/executions/attach` 按 nodeId 匹配挂靠，进一步把测试执行的输出错误关联到被覆盖工作流
   - 修复（三重防护）：
     - `updateNodeData` 新增 `options.dirty` 参数；`propagateOutputs` 传 `{ dirty: false }`（输出传播/状态恢复不是用户编辑，**打开即保存彻底消除**）
     - 自动保存定时器**捕获发起时刻的 workflow.id**，到点时 id 不一致直接放弃（防漂移覆盖）
     - 实测回归：正常编辑自动保存 ✓（PUT 计数 +1）；定时器窗口内切换画布 → 放弃保存 ✓（PUT 计数不变）；reload 打开工作流 → 无多余 PUT ✓
   - 数据恢复：口播工作流已从内置 voiceover 模板结构重建并保存为新 id（cmtcfq3zg…），被污染的旧记录已删除；历史生成的媒体文件（/generated）未受影响
2. **Inspector 重构引入的 zustand 无限循环**：selector 内 `.filter()` 每次返回新数组 → `Maximum update depth exceeded`；改为原始值 selector（`reduce` 计数 + `find` 稳定引用）
3. **Inspector 空壳渲染**：重构后 aside 无选中时仍渲染（画布右侧出现空黑框）→ 加 `if (!nodeId) return null`
4. **并行执行触发上游 429 限流**（LLM 接口并发 3 时必现）：新增 `withRetry` 指数退避重试（429/5xx 瞬时错误，2 次重试 + 2.5s/5s 退避），包装全部 6 类 AI 调用（LLM 扩写/文生图/图生图/视频提交×2/TTS），重试期间节点 stage 实时显示「请求受限，Ns 后自动重试」
5. **模板卡片节点链 chips 竖排**（窄卡片内文字逐字换行）：chips 改 `whitespace-nowrap` + 横向滚动，超出 6 个折叠为「+N 节点」，卡片右上角新增总节点数徽章；`tpl.build()` 预览改为 useMemo 一次计算
6. 清理一个 0 字节损坏文件（concat_mtcebu5x_ld3xko.mp4，历史 416 错误残留）

### 本轮新增功能（全部实测验证）
1. **并行批次执行引擎（性能大升级）**
   - `topoLevels` 拓扑分层（层号=最长上游路径），同层可执行节点进并发池（`MAX_PARALLEL=3`），取代原严格串行
   - 失败语义精确化：仅失败节点的**传递下游**被标记 skipped（原实现是"失败节点之后的所有节点"），且同层其余分支继续执行
   - 实测：3 个 enhancer 并行，采样 maxConcurrent=3；含一次 429 退避重试后全部成功（3.1~5.2s，串行需 ~10s+）
   - 故事分镜模板的 3 段文生视频由此 **并行生成，总耗时≈单段耗时**
2. **「故事分镜 · 三幕成片」大模板（12 节点 11 连线）**
   - 三幕分镜提示词 → 3×文生视频（并行）→ 三幕拼接（叠化 0.8s）∥ 旁白文案→AI 配音 → 成片合成（以音频为准延长画面）→ 视频预览；平台编排能力展示样板
3. **视频拼接快速预览档（concat fastPreview）**
   - 开关参数：superfast + crf28（约为正式档 2 倍速、码率减半）；输出 meta 新增 `quality: preview/final`
   - API 实测：2×1080p 硬切拼接 40.5s 输出成功，quality=preview ✓
4. **素材库增强**
   - 文件名搜索框（实时过滤）；排序切换（最新优先/最早优先/体积最大）分段控件
   - **系统海报归类**：`poster_*`（视频首帧自动产物）默认折叠，工具栏「海报 N」开关一键显示/隐藏（N=隐藏计数）；空态区分"无素材"与"筛选无结果"（后者一键清除筛选）
   - 实测：14 项中 3 个海报默认隐藏，搜索/三种排序均正确
5. **素材引用（asset）节点类型切换校验**
   - Inspector 切换 assetKind 时校验 assetUrl 后缀与类型匹配，不匹配 → 清空地址/名称 + toast 明确提示「当前素材是X，与新类型不匹配，已清空地址」（实测 ✓）
   - Inspector 新增「当前素材」预览区块（图/视频/音频内嵌预览 + 下载链接）；端口列表中未激活的 asset 输出端口置灰标注「未激活」
6. **移动端 Inspector 底部抽屉**
   - <768px 时选中节点从右侧悬浮面板改为 vaul 底部抽屉（85dvh，含把手），内容与桌面版完全共享（InspectorBody 抽取复用）；实测 390×844 视口渲染/滚动/关闭（含节点取消选中）✓

### 验证结果汇总
- lint 0 错误 0 警告；全新浏览器会话控制台 0 错误（历史日志中的 getSnapshot 报错为 HMR 中间态残留，Fast Refresh 已自动恢复）
- 并行引擎 ×1（3 并发采样实证）、429 重试 ×1（退避特征吻合）、concat 快速档 ×1（API 实测）、asset 校验 ×1、移动抽屉 ×1、自动保存三态（正常/竞态防护/打开不保存）×3 —— 全部通过
- 数据库已清理：删除被污染记录，口播工作流重建（7 节点 6 连线，不含历史输出，产物可从素材库重新引用）

### 未解决问题 / 风险
- **自动保存的 attach 副作用**：保存时把 1 小时窗口内 nodeId 匹配的游离执行挂靠到该工作流——若不同工作流存在**同名节点 id**（如 v1），可能错误挂靠；概率低（id 多为随机串）但模板节点 id 固定（v1/t1 等），建议后续 attach 增加 workflow 维度校验或时间窗缩短
- 上游 429 的重试在节点级仍有上限（2 次退避）；若三路并发仍频繁限流，可考虑把 LLM 类节点的并发度单独降为 2（按节点类型分池）
- 重建的口播工作流丢失了历史输出回填（节点显示待运行）；素材库中对应产物完好，运行一次即可恢复
- 移动端抽屉内的 vaul 拖拽把手与参数滑杆偶发手势冲突（未观察到实际问题，标记为观察项）
- React Flow nodeTypes HMR 警告仍仅开发期存在（生产无影响）

### 下一轮建议（优先级从高到低）
1. **故事分镜模板端到端实跑**（3 路文生视频并行 + 拼接 + 配音 + 合成，预计 6~10 分钟）：验证并行管线在真实重负载下的稳定性与 attach 挂靠正确性
2. attach 挂靠加固：仅挂靠 nodeId 唯一（或按 workflow 历史节点集合匹配）的执行记录
3. 按节点类型分池限流（LLM/TTS 池并发 2，视频/图像池并发 3），进一步压低 429 概率
4. 节点分组/框选编组（对齐 RunningHub 的 group 能力）；画布 minimap 缩略图高亮运行节点
5. 素材库分页/虚拟滚动（>300 项后）；素材重命名
6. 工作流执行历史的「重跑失败节点」入口（从 history-dialog 一键重试）
7. 导出成片到 download 目录（成品视频一键归档）

---

## Task ID: 6 — QA 回归修复 / 节点分组 / 分池限流 / 素材管理增强
Agent: cron-webDevReview（第 6 轮）
Task: 状态评估 + agent-browser QA + bug 修复 + 功能扩展

### 项目当前状态描述/判断
- 上轮 13 节点体系稳定，agent-browser 首轮 QA **发现 1 个回归 bug**（打开即保存）并已修复
- 本轮落地 4 项新功能 + 4 项修复，全部实测通过；节点体系仍为 13 种，新增「分组」画布能力
- Lint 0 错误 0 警告；控制台无报错（仅开发期 React Flow nodeTypes HMR 警告）

### 🐛 本轮修复的 bug
1. **「打开即保存」回归（Task 5 修复不彻底）**
   - 现象：每次刷新页面都触发 PUT + attach（dev.log 实证），顶栏误导性显示「未保存」
   - 根因：React Flow 首渲染会对节点做尺寸测量并派发 `dimensions` 变化，`onNodesChange` 的 `changes.some(c => c.type !== 'select')` 把它误判为用户编辑 → dirty=true → 1.8s 后自动保存
   - 修复：dirty 判定排除 `dimensions` 类型（store.ts）
   - 实证：刷新后 dirty=false ✓、等待 3s+ 无任何 PUT/attach ✓
2. **attach 挂靠误关联风险（Task 5 已知风险项）**
   - 模板节点 id 固定（v1/t1），不同工作流同名节点会把游离执行记录错误挂靠
   - 修复：客户端改传 `nodes: [{id, type}]`；服务端 nodeId + nodeType 双重匹配后才挂靠（attach/route.ts 重写）
3. **编组后 Delete 键双重触发（新功能自测发现）**
   - 建组后成员节点仍处于 RF 选中态，按 Delete 会同时「解组 + 删除成员节点」并弹确认框
   - 修复：createGroupFromSelection 建组时清除成员 RF 选中态，使 Delete 仅作用于分组（解组）
4. **素材重命名 API 两处缺陷（自测发现）**
   - 严格正则 `A-Za-z0-9` 导致中文重命名后的文件无法再被删除/操作 → 放宽为拒绝路径分隔符的通用校验（`parseAssetUrl`，仍含 startsWith 穿越防御）
   - 新名清洗未去前导点（可能生成隐藏文件）→ 补 `replace(/^\./+'')`；PATCH 增加源文件存在性检查（404 友好报错）

### ✨ 本轮新增功能（全部实测验证）
1. **节点分组（RunningHub 风格编组能力）**
   - 创建：框选/多选 ≥2 节点 → 画布右键「将 N 个所选节点编组」或 Ctrl+G
   - 渲染：**overlay 独立图层**方案（不污染 nodes 数组，执行引擎/复制粘贴/持久化零改动），虚线圆角框 + 色彩标签 chip（名称 · 成员数），四角装饰，跟随成员包围盒自动计算位置尺寸
   - 交互：拖拽框体 = 整体平移成员（绝对定位 + 偏移量，无累积漂移；首次实际移动才入快照栈）；成员仍可独立拖动（框实时跟随）
   - 管理：右键框体菜单（重命名 prompt / 8 色换色圆点 / 解组保留节点 / 删除分组与全部成员带确认）；双击标签重命名；选中框后工具条快捷按钮
   - 快捷键：Ctrl+G 编组、Ctrl+Shift+G 解组、Delete/Escape 处理选中分组
   - 状态栏显示「N 分组」；撤销/重做完整覆盖（快照含 groups）
   - 持久化：graph JSON 新增 groups 字段（向后兼容缺失时为 []），自动保存/手动保存/打开/导入导出全链路；实测建组→换色(amber→emerald)→重命名「分镜素材组」→刷新恢复 ✓
2. **按节点类型分池限流（并发引擎升级）**
   - LLM/TTS 池并发 2（429 高发接口）、AI 媒体池并发 3、ffmpeg 池并发 2；全局上限 6
   - 信号量实现（acquire/release/run + available()），同类池满时节点实时显示「等待同类任务完成…」
   - **真实负载实证**：3 条提示词→优化链整图运行，采样捕获「等待同类任务完成…」阶段，3 节点全部成功（429 重试包装保持有效）
3. **minimap 运行状态高亮**：运行中（amber 高亮 + 描边）、排队（sky）、失败（rose 高亮 + 描边），一眼定位执行热点
4. **运行历史「重跑失败节点」**：失败记录一键重跑（仅当节点仍在画布时显示），提交后 2.5s 自动刷新列表
5. **素材库增强**
   - 重命名（PATCH /api/assets，保留扩展名、同名 409、中文名支持）
   - 导出到 download 归档目录（POST /api/assets/export，服务端复制不删源，同名自动加时间戳；实测 7.6MB 成片成功归档）
   - 卡片操作行：插入画布 / 浏览器下载 / 导出到 download / 重命名 / 删除

### 验证结果汇总
- 打开即保存修复 ×3（dirty 标志、PUT 计数、attach 副作用）；分组 ×8（创建/渲染/拖拽平移/撤销重做/重命名/换色/解组/持久化）；分池 ×1（3 并发采样实证）；素材 API ×6（重命名/中文名/穿越攻击拒绝/导出/404/409）；minimap 与历史重跑（渲染 + 编译路径）—— 全部通过
- 工作流数据无污染：测试节点/分组已清理并自动保存恢复

### 未解决问题 / 风险
- 分组框标签在框体接近画布顶部时会被顶栏遮挡（z 序低于 header），可接受但后续可改为框内渲染
- 分组不随复制/粘贴传递（粘贴的是裸成员节点）；框选删除成员时分组会自动收缩/清理空分组（行为正确）
- openGroupMenu 的 flow 坐标占位为 {0,0}（分组菜单不需要 flow 坐标，无影响）
- 移动端（<md）分组操作未做专门适配（overlay 框可交互但菜单项较密集）
- 素材重命名后，历史工作流节点中引用旧 url 的 asset 节点会失效（API 不做级联更新，需用户重新插入；后续可在重命名 confirm 中提示）

### 下一轮建议（优先级从高到低）
1. **故事分镜模板端到端实跑**（3 路文生视频并行 + 拼接 + 配音 + 合成，预计 6-10 分钟）：新分池引擎在真实重负载下的稳定性验证（本轮仅验证了 LLM 池）
2. 分组增强：组成员增减（拖入/拖出）、分组折叠（收起为单卡片）、分组整体运行
3. 素材重命名级联：更新引用旧 url 的工作流 asset 节点（或至少提示受影响节点数）
4. 移动端分组菜单适配（sheet 化）；分组标签框内渲染防遮挡
5. 画布快照对比：执行历史条目附带当时的画布缩略图
6. 导出成片入口前移：视频预览节点头部加「导出到 download」按钮（当前仅素材库入口）
