/**
 * 预置工作流模板
 */
import type { Edge, Node } from '@xyflow/react'
import { createNodeData, NODE_SPECS, type CanvasNodeData } from './types'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  /** 模板分类（模板库顶部 chips 过滤用） */
  category: string
  tag: string
  gradient: string
  build: () => { nodes: Node<CanvasNodeData>[]; edges: Edge[] }
}

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  params: Record<string, unknown> = {},
  label?: string,
): Node<CanvasNodeData> {
  const spec = NODE_SPECS[type]
  return {
    id,
    type,
    position: { x, y },
    data: {
      ...createNodeData(type),
      params: { ...createNodeData(type).params, ...params },
      label: label ?? spec?.name,
    },
  }
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge {
  return {
    id: `e_${source}_${sourceHandle}_${target}_${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'canvas',
  }
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 't2v-quick',
    name: '文生视频 · 极速出片',
    description: '输入一句创意，直接生成 AI 视频',
    category: '基础入门',
    tag: '新手推荐',
    gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('t1', 'prompt', 60, 160, {
          text: '清晨的江南水乡，薄雾笼罩河面，一叶乌篷船缓缓划过石桥，阳光穿透雾气形成丁达尔效应，电影质感',
        }),
        node('t2', 'textToVideo', 480, 120, { quality: 'quality', withAudio: true }),
        node('t3', 'videoPreview', 940, 140),
      ],
      edges: [edge('t1', 'text', 't2', 'text'), edge('t2', 'video', 't3', 'video')],
    }),
  },
  {
    id: 'i2v',
    name: '图生视频 · 让照片动起来',
    description: '上传一张照片，写一句运动描述，生成动态视频',
    category: '基础入门',
    tag: '热门',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('i1', 'imageUpload', 60, 200),
        node('i2', 'prompt', 60, 400, {
          text: '镜头缓缓推进，发丝随风轻扬，光影流动',
        }),
        node('i3', 'imageToVideo', 460, 220, { quality: 'quality' }),
        node('i4', 'videoPreview', 920, 240),
      ],
      edges: [
        edge('i1', 'image', 'i3', 'image'),
        edge('i2', 'text', 'i3', 'text'),
        edge('i3', 'video', 'i4', 'video'),
      ],
    }),
  },
  {
    id: 'full-pipeline',
    name: '全流程 · 提示词工程到成片',
    description: 'LLM 扩写提示词，文生图后转视频，一站式创作',
    category: '基础入门',
    tag: '进阶',
    gradient: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('f1', 'prompt', 40, 260, {
          text: '一只橘猫宇航员漂浮在太空舱内，窗外是蓝色地球',
        }),
        node('f2', 'enhancer', 360, 220, { style: 'cinematic', target: 'video' }),
        node('f3', 'imageGen', 700, 60, { size: '1024x576' }),
        node('f4', 'imageToVideo', 1080, 200, { quality: 'quality' }),
        node('f5', 'videoPreview', 1460, 220),
        node('f6', 'imagePreview', 1080, 480),
      ],
      edges: [
        edge('f1', 'text', 'f2', 'text'),
        edge('f2', 'text', 'f3', 'text'),
        edge('f2', 'text', 'f4', 'text'),
        edge('f3', 'image', 'f4', 'image'),
        edge('f4', 'video', 'f5', 'video'),
        edge('f3', 'image', 'f6', 'image'),
      ],
    }),
  },
  {
    id: 'enhance-only',
    name: '提示词工坊 · 一键扩写',
    description: '用 LLM 把一句话变成专业级提示词',
    category: '基础入门',
    tag: '实用工具',
    gradient: 'from-teal-500/20 via-emerald-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('e1', 'prompt', 80, 200, { text: '雨后的东京街头，霓虹灯倒映在湿漉漉的路面' }),
        node('e2', 'enhancer', 460, 180, { style: 'cyberpunk', target: 'video' }),
        node('e3', 'prompt', 840, 200),
      ],
      edges: [edge('e1', 'text', 'e2', 'text'), edge('e2', 'text', 'e3', 'text')],
    }),
  },
  {
    id: 'voiceover',
    name: '口播视频 · 配音合成成片',
    description: '文案配音 + 画面生成 + 成片合成，一键出成品',
    category: '营销带货',
    tag: '自媒体',
    gradient: 'from-rose-500/20 via-fuchsia-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('v1', 'prompt', 60, 120, {
          text: '欢迎来到未来科技实验室。在这里，每一份创意都会被 AI 放大百倍。今天，让我们一起见证想象力的诞生。',
        }),
        node('v2', 'tts', 460, 60, { voice: 'tongtong', speed: 1 }),
        node('v3', 'audioPreview', 860, 80),
        node('v4', 'prompt', 60, 420, {
          text: '未来感科技实验室内部，全息投影界面漂浮在空中，蓝紫色光线交织，镜头缓慢横移',
        }),
        node('v5', 'textToVideo', 460, 380, { quality: 'quality', withAudio: false }),
        node('v6', 'avMerge', 1260, 200, { keepOriginal: false, audioVolume: 1, durationMode: 'video' }),
        node('v7', 'videoPreview', 1640, 220),
      ],
      edges: [
        edge('v1', 'text', 'v2', 'text'),
        edge('v2', 'audio', 'v3', 'audio'),
        edge('v2', 'audio', 'v6', 'audio'),
        edge('v4', 'text', 'v5', 'text'),
        edge('v5', 'video', 'v6', 'video'),
        edge('v6', 'video', 'v7', 'video'),
      ],
    }),
  },
  {
    id: 'product-showcase',
    name: '产品展示 · 一图变大片',
    description: '上传产品图，AI 场景化重绘后生成展示视频',
    category: '基础入门',
    tag: '电商',
    gradient: 'from-orange-500/20 via-rose-500/10 to-transparent',
    build: () => ({
      nodes: [
        node('p1', 'imageUpload', 40, 240),
        node('p2', 'imageEdit', 440, 200, {
          prompt: '将产品置于高级感展示台，柔和的摄影棚灯光，背景是渐变的暖色丝绸帷幕，商业广告质感',
        }),
        node('p3', 'prompt', 440, 460, {
          text: '镜头围绕产品缓缓环绕一周，灯光从侧面扫过，呈现高级质感',
        }),
        node('p4', 'imageToVideo', 860, 220, { quality: 'quality' }),
        node('p5', 'imagePreview', 860, 500),
        node('p6', 'videoPreview', 1280, 240),
      ],
      edges: [
        edge('p1', 'image', 'p2', 'image'),
        edge('p2', 'image', 'p4', 'image'),
        edge('p3', 'text', 'p4', 'text'),
        edge('p4', 'video', 'p6', 'video'),
        edge('p2', 'image', 'p5', 'image'),
      ],
    }),
  },
  {
    id: 'storyboard',
    name: '故事分镜 · 三幕成片',
    description: '三段分镜并行生成 → 转场拼接 → AI 配音 → 合成出片',
    category: '短剧创作',
    tag: '大片推荐',
    gradient: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    build: () => ({
      nodes: [
        /* 三幕分镜提示词 */
        node('s1', 'prompt', 40, 60, {
          text: '清晨的山间古道，云海在脚下翻涌，一位背背包的少年独自攀登，阳光穿透云层洒在石阶上，史诗感电影镜头',
        }, '分镜一 · 登山'),
        node('s2', 'prompt', 40, 380, {
          text: '正午的古城集市，少年穿行在熙攘的人群中，红灯笼与霓虹招牌交错，镜头跟随式手持运镜，烟火气息',
        }, '分镜二 · 探索'),
        node('s3', 'prompt', 40, 700, {
          text: '黄昏的山顶悬崖，少年张开双臂眺望远方连绵群山，金色夕阳染红云层，无人机环绕拉升大远景，壮阔收尾',
        }, '分镜三 · 远望'),
        /* 三段并行文生视频 */
        node('tv1', 'textToVideo', 420, 40, { quality: 'quality', withAudio: false }),
        node('tv2', 'textToVideo', 420, 360, { quality: 'quality', withAudio: false }),
        node('tv3', 'textToVideo', 420, 680, { quality: 'quality', withAudio: false }),
        /* 拼接 + 配音双轨 */
        node('c1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三幕拼接'),
        node('n1', 'prompt', 820, 700, {
          text: '每一座山，都是一次成长的邀请。走过清晨的雾，穿过正午的城，我们终于在黄昏的顶端，遇见更辽阔的自己。',
        }, '旁白文案'),
        node('t1', 'tts', 1200, 680, { voice: 'tongtong', speed: 1 }, 'AI 配音'),
        node('ap', 'audioPreview', 1560, 700),
        /* 合成成片 */
        node('m1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('vp', 'videoPreview', 1580, 300),
      ],
      edges: [
        edge('s1', 'text', 'tv1', 'text'),
        edge('s2', 'text', 'tv2', 'text'),
        edge('s3', 'text', 'tv3', 'text'),
        edge('tv1', 'video', 'c1', 'v1'),
        edge('tv2', 'video', 'c1', 'v2'),
        edge('tv3', 'video', 'c1', 'v3'),
        edge('n1', 'text', 't1', 'text'),
        edge('t1', 'audio', 'ap', 'audio'),
        edge('t1', 'audio', 'm1', 'audio'),
        edge('c1', 'video', 'm1', 'video'),
        edge('m1', 'video', 'vp', 'video'),
      ],
    }),
  },
  {
    id: 'novel-drama',
    name: '小说转剧本 · 短剧成片',
    description:
      '粘贴小说原文，AI 改编剧本并分镜为三幕，成片 + 旁白配音（示例为古城少年题材，可替换为任意小说文本）',
    category: '短剧创作',
    tag: 'AI 编剧',
    gradient: 'from-fuchsia-500/20 via-violet-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'nd1',
          'prompt',
          40,
          340,
          {
            text: '【短剧原文 · 可整体替换】古城少年沈砚自幼随祖父学修钟表。祖父走后，铺中那座老座钟也停了。整理遗物时，他在钟摆夹层里发现一枚黄铜钥匙，柄上刻着小字：灯亮时，替我上弦。入夜，他提灯走进古城深处，长巷尽头的守钟人抬手指向钟楼。他穿过喧闹的夜市，糖画摊与皮影戏从身旁流过。登上钟楼，钥匙插入锈锁，用力一转——千年古钟轰然复响，满城灯火次第亮起，人群仰头惊呼，仿佛时光倒流。',
          },
          '小说原文',
        ),
        node(
          'nd2',
          'enhancer',
          380,
          340,
          { style: 'cinematic', target: 'video' },
          '剧本改编',
        ),
        node(
          'nd3',
          'enhancer',
          740,
          20,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '第一幕 · 钟表铺之夜：暖黄台灯下的老铺内景，少年摩挲祖父留下的停摆座钟，从钟摆夹层取出黄铜钥匙，钥匙特写铭刻微光，静谧思念氛围，浅景深电影镜头',
          },
          '分镜 · 第一幕',
        ),
        node(
          'nd4',
          'enhancer',
          740,
          360,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '第二幕 · 长巷与夜市：少年提灯走过古城长巷，红灯笼摇曳，守钟人剪影指向钟楼方向；转入熙攘夜市，糖画与皮影流光溢彩，跟随式运镜，烟火气息',
          },
          '分镜 · 第二幕',
        ),
        node(
          'nd5',
          'enhancer',
          740,
          700,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '第三幕 · 钟楼复响：少年登上钟楼顶端，将钥匙插入锈蚀锁孔用力一转，巨大齿轮转动，满城灯火次第点亮如星河苏醒，无人机环绕拉升大远景，史诗收尾',
          },
          '分镜 · 第三幕',
        ),
        node('nd6', 'textToVideo', 1100, 20, { quality: 'quality', withAudio: false }, '文生视频 · 第一幕'),
        node('nd7', 'textToVideo', 1100, 360, { quality: 'quality', withAudio: false }, '文生视频 · 第二幕'),
        node('nd8', 'textToVideo', 1100, 700, { quality: 'quality', withAudio: false }, '文生视频 · 第三幕'),
        node(
          'nd9',
          'concat',
          1480,
          320,
          { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false },
          '三幕拼接',
        ),
        node(
          'nd10',
          'tts',
          1480,
          700,
          {
            voice: 'tongtong',
            speed: 1,
            fallbackText:
              '在古城的一隅，少年沈砚守着一屋子的滴答声。祖父留下的老座钟停在了某个黄昏，钟摆深处，藏着一把黄铜钥匙。灯亮时，替我上弦——他循着这行小字走进长巷，穿过鼎沸的夜市，终于在钟楼之巅，让时间重新流动。灯火次第亮起的那一刻，整座古城，都听见了心跳。',
          },
          '旁白配音',
        ),
        node('nd11', 'avMerge', 1860, 340, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('nd12', 'videoPreview', 2220, 360, {}, '成片预览'),
      ],
      edges: [
        edge('nd1', 'text', 'nd2', 'text'),
        edge('nd2', 'text', 'nd3', 'text'),
        edge('nd2', 'text', 'nd4', 'text'),
        edge('nd2', 'text', 'nd5', 'text'),
        edge('nd3', 'text', 'nd6', 'text'),
        edge('nd4', 'text', 'nd7', 'text'),
        edge('nd5', 'text', 'nd8', 'text'),
        edge('nd6', 'video', 'nd9', 'v1'),
        edge('nd7', 'video', 'nd9', 'v2'),
        edge('nd8', 'video', 'nd9', 'v3'),
        edge('nd9', 'video', 'nd11', 'video'),
        edge('nd10', 'audio', 'nd11', 'audio'),
        edge('nd11', 'video', 'nd12', 'video'),
      ],
    }),
  },
  {
    id: 'mv-video',
    name: 'MV 音乐视频 · 画面成片',
    description:
      '从素材库选择已上传的音乐，AI 生成三段意境画面，叠化拼接后与音乐合成 MV 成片（载入后请先把音乐插入画布并接通音频线）',
    category: '音乐 MV',
    tag: '音乐创作',
    gradient: 'from-pink-500/20 via-rose-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'mv1',
          'asset',
          40,
          420,
          { assetKind: 'audio', assetUrl: '', assetName: '' },
          '音乐素材（待选择）',
        ),
        node('mv2', 'audioPreview', 420, 160, {}, '音频预览'),
        node(
          'mv3',
          'textToVideo',
          420,
          440,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '晨光中的空旷天台，白色窗帘随风扬起，微尘在光柱中浮动，主人公剪影静立远眺，镜头缓慢推进，朦胧诗意，电影质感',
          },
          '画面 · 序章',
        ),
        node(
          'mv4',
          'textToVideo',
          420,
          780,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '霓虹雨夜的城市街头，主人公奔跑穿过水洼，霓虹倒影被脚步打碎又聚拢，光斑炸裂成粒子，跟拍运镜节奏强烈，音乐 MV 质感',
          },
          '画面 · 副歌',
        ),
        node(
          'mv5',
          'textToVideo',
          420,
          1120,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '黎明时分的海岸公路，主人公张开双臂迎风而行，云海翻涌金光破晓，无人机环绕拉升大远景，自由与希望，史诗感收尾',
          },
          '画面 · 尾声',
        ),
        node(
          'mv6',
          'concat',
          820,
          760,
          { transition: 'fade', transitionDuration: 1, fitMode: 'crop', fastPreview: false },
          '段落拼接',
        ),
        node(
          'mv7',
          'avMerge',
          1200,
          560,
          { keepOriginal: false, audioVolume: 1, durationMode: 'audio' },
          '成片合成',
        ),
        node('mv8', 'videoPreview', 1560, 580, {}, '成片预览'),
      ],
      edges: [
        edge('mv1', 'audio', 'mv2', 'audio'),
        edge('mv1', 'audio', 'mv7', 'audio'),
        edge('mv3', 'video', 'mv6', 'v1'),
        edge('mv4', 'video', 'mv6', 'v2'),
        edge('mv5', 'video', 'mv6', 'v3'),
        edge('mv6', 'video', 'mv7', 'video'),
        edge('mv7', 'video', 'mv8', 'video'),
      ],
    }),
  },
  {
    id: 'city-promo',
    name: '文旅宣传片 · 城市印象',
    description:
      '输入城市与亮点，AI 改编宣传片文案与画面基调，三路画面（地标 / 人文 / 夜景）与城市旁白合成文旅大片（示例为虚构古城澜溪）',
    category: '营销宣传',
    tag: '文旅',
    gradient: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'cp1',
          'prompt',
          40,
          300,
          {
            text: '江南古城「澜溪」：千年运河穿城而过，青石板老街与当代美术馆隔水相望；晨有摇橹船与早点铺的烟火气，夜有闻名遐迩的灯会与水幕光影秀。',
          },
          '城市与亮点',
        ),
        node(
          'cp2',
          'enhancer',
          380,
          300,
          { style: 'cinematic', target: 'video' },
          '宣传片改编',
        ),
        node(
          'cp3',
          'tts',
          740,
          60,
          {
            voice: 'tongtong',
            speed: 1,
            fallbackText:
              '一条运河，流淌千年。晨雾里，摇橹船划开澜溪的清晨；青石板上，是刚出炉的蟹壳黄的香气。老街的尽头，当代美术馆的曲线屋顶与马头墙温柔相望。入夜，千盏花灯次第亮起，水幕光影在河面铺开星辰。澜溪——一步一景，一眼千年。',
          },
          '城市宣传旁白',
        ),
        node(
          'cp4',
          'textToVideo',
          740,
          360,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '江南古城澜溪航拍大远景：千年运河穿城而过，晨雾轻笼，摇橹船划过水面，青石板老街与当代美术馆曲线屋顶隔水相望，电影质感',
          },
          '画面 · 地标',
        ),
        node(
          'cp5',
          'textToVideo',
          740,
          700,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '澜溪老街人文掠影：早点铺蒸笼掀开白雾弥漫，手艺人竹篾编织，孩童举着糖画跑过石桥，游客与原住民交织的市井烟火，手持跟拍运镜',
          },
          '画面 · 人文',
        ),
        node(
          'cp6',
          'textToVideo',
          740,
          1040,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '澜溪夜间灯会盛景：千盏花灯沿河次第亮起，水幕光影秀在河面铺开星河，游人如织衣袂飘飘，无人机穿越镜头掠过灯船，璀璨梦幻',
          },
          '画面 · 夜景',
        ),
        node(
          'cp7',
          'concat',
          1120,
          660,
          { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false },
          '三景拼接',
        ),
        node(
          'cp8',
          'avMerge',
          1480,
          420,
          { keepOriginal: false, audioVolume: 1, durationMode: 'audio' },
          '成片合成',
        ),
        node('cp9', 'videoPreview', 1840, 440, {}, '成片预览'),
      ],
      edges: [
        edge('cp1', 'text', 'cp2', 'text'),
        edge('cp2', 'text', 'cp3', 'text'),
        edge('cp2', 'text', 'cp4', 'text'),
        edge('cp2', 'text', 'cp5', 'text'),
        edge('cp2', 'text', 'cp6', 'text'),
        edge('cp4', 'video', 'cp7', 'v1'),
        edge('cp5', 'video', 'cp7', 'v2'),
        edge('cp6', 'video', 'cp7', 'v3'),
        edge('cp7', 'video', 'cp8', 'video'),
        edge('cp3', 'audio', 'cp8', 'audio'),
        edge('cp8', 'video', 'cp9', 'video'),
      ],
    }),
  },
  {
    id: 'science-viz',
    name: '知识科普 · 图解动画',
    description:
      '知识点文案配音讲解，AI 绘制两张科普示意图并让插图动起来，拼接合成图解动画（示例为「天空为什么是蓝色的」，可替换任意知识点）',
    category: '知识创作',
    tag: '科普',
    gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'sv1',
          'prompt',
          40,
          80,
          {
            text: '为什么天空是蓝色的？太阳光包含七种颜色，当它进入大气层时，波长较短的蓝光最容易被空气分子散射到四面八方，于是整片天空都被「染」成了蓝色；而傍晚阳光斜射、蓝光被散射殆尽，剩下的红橙光让我们看到绚烂晚霞。',
          },
          '知识点文案',
        ),
        node('sv2', 'tts', 400, 60, { voice: 'tongtong', speed: 1 }, '亲切讲解'),
        node(
          'sv3',
          'prompt',
          40,
          460,
          {
            text: '科普图解，扁平插画风格，简洁明快：太阳光进入大气层后被空气分子散射，波长较短的蓝光向四面八方散射开来铺满天空，光路示意搭配简短标注',
          },
          '图解提示词',
        ),
        node('sv4', 'imageGen', 400, 400, { size: '1024x576' }, '示意图 · 原理'),
        node(
          'sv5',
          'imageGen',
          400,
          720,
          {
            size: '1024x576',
            prompt:
              '同一画面上下对比构图：上半是湛蓝晴空与白色云朵，下半是黄昏时分的橙红色晚霞与地平线剪影，扁平科普插画风格，色彩明快',
          },
          '示意图 · 对比',
        ),
        node(
          'sv6',
          'imageToVideo',
          800,
          380,
          {
            quality: 'quality',
            withAudio: false,
            prompt: '光线缓缓流动，散射光粒子向四周轻轻飘散，镜头轻微推进，画面元素带微妙的呼吸感',
          },
          '图解动画 · 原理',
        ),
        node(
          'sv7',
          'imageToVideo',
          800,
          700,
          {
            quality: 'quality',
            withAudio: false,
            prompt: '云朵缓缓飘动，晚霞光线渐变流动，色彩柔和过渡，镜头轻微横移',
          },
          '图解动画 · 对比',
        ),
        node(
          'sv8',
          'concat',
          1200,
          540,
          { transition: 'fade', transitionDuration: 0.6, fitMode: 'crop', fastPreview: false },
          '两段拼接',
        ),
        node(
          'sv9',
          'avMerge',
          1560,
          360,
          { keepOriginal: false, audioVolume: 1, durationMode: 'audio' },
          '成片合成',
        ),
        node('sv10', 'videoPreview', 1920, 380, {}, '成片预览'),
      ],
      edges: [
        edge('sv1', 'text', 'sv2', 'text'),
        edge('sv3', 'text', 'sv4', 'text'),
        edge('sv3', 'text', 'sv5', 'text'),
        edge('sv4', 'image', 'sv6', 'image'),
        edge('sv5', 'image', 'sv7', 'image'),
        edge('sv6', 'video', 'sv8', 'v1'),
        edge('sv7', 'video', 'sv8', 'v2'),
        edge('sv8', 'video', 'sv9', 'video'),
        edge('sv2', 'audio', 'sv9', 'audio'),
        edge('sv9', 'video', 'sv10', 'video'),
      ],
    }),
  },
  {
    id: 'unbox-sale',
    name: '好物开箱 · 口播带货',
    description:
      '产品卖点一键扩写为口播文案并 AI 配音，上传产品图生成动态展示镜头，合成带货成片（载入后请上传产品图，可按需修改口播文案）',
    category: '营销带货',
    tag: '开箱',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'ub1',
          'prompt',
          40,
          100,
          {
            text: '便携榨汁杯「鲜沏 S1」核心卖点：六叶不锈钢刀头 8 秒出汁；主机仅矿泉水瓶大小，Type-C 快充一次可用 10 天；杯盖分离不漏汁，通勤健身随身带；食品级材质，宝宝辅食也能打。',
          },
          '产品卖点',
        ),
        node('ub2', 'enhancer', 400, 100, { style: 'auto', target: 'video' }, '带货文案'),
        node('ub3', 'tts', 760, 80, { voice: 'tongtong', speed: 1 }, 'AI 口播'),
        node('ub4', 'imageUpload', 40, 500, {}, '产品图'),
        node(
          'ub5',
          'imageToVideo',
          400,
          480,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '镜头围绕产品缓缓环绕一周，灯光从侧面扫过杯身，杯中果汁晃动泛起细腻泡沫，冰块与水果切片环绕飞入构图，高级广告质感',
          },
          '产品动态展示',
        ),
        node(
          'ub6',
          'avMerge',
          780,
          300,
          { keepOriginal: false, audioVolume: 1, durationMode: 'audio' },
          '成片合成',
        ),
        node('ub7', 'videoPreview', 1140, 320, {}, '成片预览'),
      ],
      edges: [
        edge('ub1', 'text', 'ub2', 'text'),
        edge('ub2', 'text', 'ub3', 'text'),
        edge('ub3', 'audio', 'ub6', 'audio'),
        edge('ub4', 'image', 'ub5', 'image'),
        edge('ub5', 'video', 'ub6', 'video'),
        edge('ub6', 'video', 'ub7', 'video'),
      ],
    }),
  },
]
