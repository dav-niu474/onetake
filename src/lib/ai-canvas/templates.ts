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
  {
    id: 'suspense-drama',
    name: '悬疑反转 · 三幕短剧',
    description:
      '三幕悬疑短剧：铺垫 → 异常 → 反转，纯提示词分镜直接生成三段画面，叠化拼接后配旁白成片（示例为「当票之谜」题材，三段分镜可整体替换）',
    category: '短剧创作',
    tag: '悬疑反转',
    gradient: 'from-rose-500/20 via-zinc-500/10 to-transparent',
    build: () => ({
      nodes: [
        /* 三幕分镜提示词 */
        node(
          'sd1',
          'prompt',
          40,
          60,
          {
            text: '深夜老公寓书房，妻子在昏黄台灯下整理丈夫的公文包，指尖抽出一张陌生当票，纸面在灯光下泛黄；窗外雨痕密布玻璃，冷蓝夜色与暖黄台灯形成对撞，镜头从背后缓缓推近她皱起的眉头，浅景深特写，悬疑氛围电影质感',
          },
          '第一幕 · 铺垫',
        ),
        node(
          'sd2',
          'prompt',
          40,
          380,
          {
            text: '凌晨三点的卧室，丈夫以为妻子熟睡，蹑手蹑脚披上外套开门离去；门缝漏进走廊一线冷光，妻子在黑暗中缓缓睁眼，瞳孔里映着那道门缝光；手持跟拍镜头轻微晃动，压抑紧张，冷暖对比强烈，惊悚氛围',
          },
          '第二幕 · 异常',
        ),
        node(
          'sd3',
          'prompt',
          40,
          700,
          {
            text: '老照相馆暖光橱窗前，丈夫戴着白手套小心翼翼修复一张泛黄结婚照，玻璃相框里是年轻时的妻子；妻子立在雨中门外怔住，眼眶泛红，冷雨夜色渐渐被橱窗暖光晕染，反转揭示的温情一刻，缓慢推镜，情绪电影质感',
          },
          '第三幕 · 反转',
        ),
        /* 三段并行文生视频 */
        node('stv1', 'textToVideo', 420, 40, { quality: 'quality', withAudio: false }, '文生视频 · 第一幕'),
        node('stv2', 'textToVideo', 420, 360, { quality: 'quality', withAudio: false }, '文生视频 · 第二幕'),
        node('stv3', 'textToVideo', 420, 680, { quality: 'quality', withAudio: false }, '文生视频 · 第三幕'),
        /* 拼接 + 旁白双轨 */
        node('sc1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三幕拼接'),
        node(
          'sn1',
          'prompt',
          820,
          700,
          {
            text: '三年来，丈夫总在凌晨三点悄悄出门。妻子以为婚姻藏着秘密，直到那张当票带她找到老街深处的照相馆——原来他偷偷当掉自己的怀表，只为赎回并修复那张被水泡坏、她以为早已遗失的结婚照。有些沉默不是隐瞒，而是把爱意，藏进了每一个深夜。',
          },
          '旁白文案',
        ),
        node('st1', 'tts', 1200, 680, { voice: 'tongtong', speed: 0.9 }, 'AI 配音'),
        node('sap', 'audioPreview', 1560, 700),
        /* 合成成片 */
        node('sm1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('svp', 'videoPreview', 1580, 300, {}, '成片预览'),
      ],
      edges: [
        edge('sd1', 'text', 'stv1', 'text'),
        edge('sd2', 'text', 'stv2', 'text'),
        edge('sd3', 'text', 'stv3', 'text'),
        edge('stv1', 'video', 'sc1', 'v1'),
        edge('stv2', 'video', 'sc1', 'v2'),
        edge('stv3', 'video', 'sc1', 'v3'),
        edge('sn1', 'text', 'st1', 'text'),
        edge('st1', 'audio', 'sap', 'audio'),
        edge('st1', 'audio', 'sm1', 'audio'),
        edge('sc1', 'video', 'sm1', 'video'),
        edge('sm1', 'video', 'svp', 'video'),
      ],
    }),
  },
  {
    id: 'vertical-emotion',
    name: '竖屏情感 · 快节奏短剧',
    description:
      '都市情感竖屏短剧：深夜加班 → 末班地铁 → 天台日出三段直切快剪，提示词内置竖屏 9:16 构图描述，无需配音直出成片',
    category: '短剧创作',
    tag: '竖屏 9:16',
    gradient: 'from-fuchsia-500/20 via-pink-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          've1',
          'prompt',
          40,
          60,
          {
            text: '竖屏 9:16 构图，深夜写字楼格子间只剩一盏台灯亮着，女生对着电脑揉了揉酸涩的眼睛，玻璃幕墙倒映整城霓虹；冷白顶光打在脸侧，竖幅画面上方留出大片暗色楼宇，手持镜头轻微呼吸感，都市孤独氛围，电影质感',
          },
          '第一镜 · 深夜加班',
        ),
        node(
          've2',
          'prompt',
          40,
          380,
          {
            text: '竖屏 9:16 构图，末班地铁车厢空荡，女生靠着车门闭眼假寐，隧道灯光一格一格快速扫过她的侧脸，明暗交替频闪；竖幅纵深构图强调车厢狭长，浅景深面部特写，疲惫与倔强交织，电影感',
          },
          '第二镜 · 末班地铁',
        ),
        node(
          've3',
          'prompt',
          40,
          700,
          {
            text: '竖屏 9:16 构图，清晨天台，女生举起手机迎着朝阳按下快门，第一缕金光越过楼宇天际线洒在她脸上，逆光剪影缓缓转成微笑正脸；竖幅仰拍构图，天空占画面三分之二，缓慢拉升运镜，治愈收尾',
          },
          '第三镜 · 天台日出',
        ),
        node('vetv1', 'textToVideo', 420, 40, { quality: 'quality', withAudio: false }, '文生视频 · 加班'),
        node('vetv2', 'textToVideo', 420, 360, { quality: 'quality', withAudio: false }, '文生视频 · 地铁'),
        node('vetv3', 'textToVideo', 420, 680, { quality: 'quality', withAudio: false }, '文生视频 · 日出'),
        node('vec1', 'concat', 820, 300, { transition: 'none', transitionDuration: 0.5, fitMode: 'crop', fastPreview: false }, '三镜快切'),
        node('vevp', 'videoPreview', 1200, 320, {}, '成片预览'),
      ],
      edges: [
        edge('ve1', 'text', 'vetv1', 'text'),
        edge('ve2', 'text', 'vetv2', 'text'),
        edge('ve3', 'text', 'vetv3', 'text'),
        edge('vetv1', 'video', 'vec1', 'v1'),
        edge('vetv2', 'video', 'vec1', 'v2'),
        edge('vetv3', 'video', 'vec1', 'v3'),
        edge('vec1', 'video', 'vevp', 'video'),
      ],
    }),
  },
  {
    id: 'lyric-mv',
    name: '歌词意象 · 写意 MV',
    description:
      '歌词或主题经 AI 提炼意象，生成起承转三段写意画面，叠化拼接后与素材库音乐合成 MV 成片（示例歌词可整体替换；载入后请先把音乐插入画布并接通音频线）',
    category: '音乐 MV',
    tag: '写意',
    gradient: 'from-violet-500/20 via-pink-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'lm1',
          'prompt',
          40,
          60,
          {
            text: '歌词：晚风轻踩着云朵，邮差路过黄昏的邮筒；我把心事折成纸船，放进涨潮的河；若你收到今晚的晚霞，请替我说一声——晚安。',
          },
          '歌词 / 主题',
        ),
        node('lm2', 'enhancer', 380, 60, { style: 'cinematic', target: 'video' }, '意象提炼'),
        node(
          'lm3',
          'enhancer',
          740,
          20,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '起 · 纸船入河：暮色河面泛着碎金波光，少女俯身将白色纸船轻推入水，涟漪一圈圈荡开，芦苇剪影在晚风中摇曳，逆光暖橙色调，浅景深特写空镜，写意诗意',
          },
          '意象 · 起',
        ),
        node(
          'lm4',
          'enhancer',
          740,
          360,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '承 · 风掠麦浪：黄昏麦田一望无际，晚风掀起金色麦浪层层翻涌，木屋檐下风铃轻晃，白色纱帘飞出窗棂，缓慢横移运镜，柔焦诗意，日系治愈色调',
          },
          '意象 · 承',
        ),
        node(
          'lm5',
          'enhancer',
          740,
          700,
          {
            style: 'cinematic',
            target: 'video',
            fallbackText:
              '转 · 星海铁轨：夜晚铁轨笔直延伸向天际，萤火虫光点漂浮闪烁，银河横贯夜空与铁轨尽头相接，空灵静谧，深蓝紫夜色点缀暖黄灯影，缓慢推进镜头，梦幻写意',
          },
          '意象 · 转',
        ),
        node('lm6', 'textToVideo', 1100, 20, { quality: 'quality', withAudio: false }, '画面 · 起'),
        node('lm7', 'textToVideo', 1100, 360, { quality: 'quality', withAudio: false }, '画面 · 承'),
        node('lm8', 'textToVideo', 1100, 700, { quality: 'quality', withAudio: false }, '画面 · 转'),
        node('lm9', 'concat', 1460, 320, { transition: 'fade', transitionDuration: 1, fitMode: 'crop', fastPreview: false }, '三段拼接'),
        node('lm10', 'asset', 40, 560, { assetKind: 'audio', assetUrl: '', assetName: '' }, '音乐素材（待选择）'),
        node('lm11', 'audioPreview', 1820, 680, {}, '音频预览'),
        node('lm12', 'avMerge', 1820, 340, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('lm13', 'videoPreview', 2180, 360, {}, '成片预览'),
      ],
      edges: [
        edge('lm1', 'text', 'lm2', 'text'),
        edge('lm2', 'text', 'lm3', 'text'),
        edge('lm2', 'text', 'lm4', 'text'),
        edge('lm2', 'text', 'lm5', 'text'),
        edge('lm3', 'text', 'lm6', 'text'),
        edge('lm4', 'text', 'lm7', 'text'),
        edge('lm5', 'text', 'lm8', 'text'),
        edge('lm6', 'video', 'lm9', 'v1'),
        edge('lm7', 'video', 'lm9', 'v2'),
        edge('lm8', 'video', 'lm9', 'v3'),
        edge('lm10', 'audio', 'lm11', 'audio'),
        edge('lm10', 'audio', 'lm12', 'audio'),
        edge('lm9', 'video', 'lm12', 'video'),
        edge('lm12', 'video', 'lm13', 'video'),
      ],
    }),
  },
  {
    id: 'beat-cut-mv',
    name: '节奏混剪 · 快切 MV',
    description:
      '四段强节奏画面按运动动词卡点硬切：点火 → 爆发 → 飞驰 → 水花炸裂，无转场直切冲击力拉满（可自行在拼接后接入音乐素材合成完整 MV）',
    category: '音乐 MV',
    tag: '卡点混剪',
    gradient: 'from-amber-500/20 via-rose-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'bc1',
          'prompt',
          40,
          40,
          {
            text: '漆黑舞台中央一根火柴猛然划燃，火星四溅迸射，火焰瞬间升腾吞没画面，慢动作爆发后急速恢复正常速度，粒子火星扑向镜头，强节奏动感，暗黑高对比光影',
          },
          '镜头一 · 点火',
        ),
        node(
          'bc2',
          'prompt',
          40,
          360,
          {
            text: '地下车库频闪灯急闪，舞者从静止猛然下地旋转爆发，汗水甩出弧线，衣摆剧烈翻飞，镜头急推急拉贴身跟拍，湿滑地面反光映出剪影，卡点节奏，街头能量感',
          },
          '镜头二 · 爆发',
        ),
        node(
          'bc3',
          'prompt',
          40,
          680,
          {
            text: '机车骑士压弯穿越霓虹隧道，红白灯带拉成流动光轨，镜头贴地飞驰追拍，风压掀起衣角，火花从排气管喷出，速度线拉满，赛博夜色，肾上腺素飙升',
          },
          '镜头三 · 飞驰',
        ),
        node(
          'bc4',
          'prompt',
          40,
          1000,
          {
            text: '舞者从跳台纵身跃入泳池瞬间，水花在逆光中炸裂成千万颗悬浮液滴，如钻石颗粒缓缓升腾又急速坠落，蓝白金三色光碰撞交叠，高速摄影慢镜，收尾定格冲击力十足',
          },
          '镜头四 · 炸裂',
        ),
        node('bctv1', 'textToVideo', 420, 20, { quality: 'quality', withAudio: false }, '文生视频 · 点火'),
        node('bctv2', 'textToVideo', 420, 340, { quality: 'quality', withAudio: false }, '文生视频 · 爆发'),
        node('bctv3', 'textToVideo', 420, 660, { quality: 'quality', withAudio: false }, '文生视频 · 飞驰'),
        node('bctv4', 'textToVideo', 420, 980, { quality: 'quality', withAudio: false }, '文生视频 · 炸裂'),
        node('bcc1', 'concat', 820, 480, { transition: 'none', transitionDuration: 0.5, fitMode: 'crop', fastPreview: false }, '四段硬切'),
        node('bcvp', 'videoPreview', 1200, 500, {}, '成片预览'),
      ],
      edges: [
        edge('bc1', 'text', 'bctv1', 'text'),
        edge('bc2', 'text', 'bctv2', 'text'),
        edge('bc3', 'text', 'bctv3', 'text'),
        edge('bc4', 'text', 'bctv4', 'text'),
        edge('bctv1', 'video', 'bcc1', 'v1'),
        edge('bctv2', 'video', 'bcc1', 'v2'),
        edge('bctv3', 'video', 'bcc1', 'v3'),
        edge('bctv4', 'video', 'bcc1', 'v4'),
        edge('bcc1', 'video', 'bcvp', 'video'),
      ],
    }),
  },
  {
    id: 'product-launch',
    name: '新品发布 · 悬念预热片',
    description:
      '悬念开场三秒钩子 → 产品场景化特写 → 揭晓亮相：上传产品图 AI 重绘后动态展示，配悬念旁白合成预热片（载入后请上传产品图，悬念开场可先跑）',
    category: '营销宣传',
    tag: '发布会',
    gradient: 'from-yellow-500/20 via-amber-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'pl1',
          'prompt',
          40,
          60,
          {
            text: '纯黑背景中一束顶光缓缓亮起，照亮悬浮的神秘产品剪影，轮廓在薄雾中若隐若现，光斑从侧面扫过又隐去，始终不见全貌，镜头缓慢环绕半圈，高级发布会预告质感，悬念拉满',
          },
          '悬念开场提示词',
        ),
        node('pl2', 'textToVideo', 420, 40, { quality: 'quality', withAudio: false }, '悬念开场画面'),
        node('pl3', 'imageUpload', 40, 520, {}, '产品图（待上传）'),
        node(
          'pl4',
          'imageEdit',
          420,
          500,
          {
            prompt:
              '将产品置于极简发布会舞台中央，纯黑背景配一束聚光顶灯，底座反光台倒映产品轮廓，薄雾轻笼，暗金与黑色高级配色，商业广告大片质感',
          },
          '场景化重绘',
        ),
        node('pl5', 'imagePreview', 820, 500, {}, '重绘预览'),
        node(
          'pl6',
          'imageToVideo',
          820,
          80,
          {
            quality: 'quality',
            withAudio: false,
            prompt:
              '聚光灯自下而上缓缓亮起，薄雾向两侧散开，产品缓缓旋转展示细节，光斑扫过金属边缘流转生辉，镜头缓慢推进定格正面，揭晓时刻，高级广告质感',
          },
          '产品揭晓动画',
        ),
        node('pl7', 'concat', 1200, 260, { transition: 'fade', transitionDuration: 0.6, fitMode: 'crop', fastPreview: false }, '悬念 + 揭晓'),
        node(
          'pl8',
          'prompt',
          1200,
          640,
          {
            text: '三、二、一。有些答案，值得等待。全新一代，静默登场——这一次，超出你的想象。',
          },
          '悬念旁白',
        ),
        node('pl9', 'tts', 1560, 620, { voice: 'tongtong', speed: 0.9 }, 'AI 配音'),
        node('pl10', 'avMerge', 1560, 240, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('pl11', 'videoPreview', 1920, 260, {}, '成片预览'),
      ],
      edges: [
        edge('pl1', 'text', 'pl2', 'text'),
        edge('pl3', 'image', 'pl4', 'image'),
        edge('pl4', 'image', 'pl5', 'image'),
        edge('pl4', 'image', 'pl6', 'image'),
        edge('pl2', 'video', 'pl7', 'v1'),
        edge('pl6', 'video', 'pl7', 'v2'),
        edge('pl8', 'text', 'pl9', 'text'),
        edge('pl9', 'audio', 'pl10', 'audio'),
        edge('pl7', 'video', 'pl10', 'video'),
        edge('pl10', 'video', 'pl11', 'video'),
      ],
    }),
  },
  {
    id: 'festival-greeting',
    name: '节日贺岁 · 品牌祝福',
    description:
      '节日氛围三景（灯火 / 团圆 / 烟花）拼接，配品牌祝福语 AI 配音合成贺岁祝福片（示例为春节题材，可替换为中秋 / 圣诞等任意节日）',
    category: '营销宣传',
    tag: '节日祝福',
    gradient: 'from-red-500/20 via-orange-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'fg1',
          'prompt',
          40,
          40,
          {
            text: '除夕古镇长街挂满红灯笼，细雪飘落，孩童提着兔子灯在青石板上奔跑，灯笼暖光映亮沿途白墙黛瓦，镜头低角度跟随奔跑，雪粒在光柱中飞舞，年味烟火气，暖金色调',
          },
          '第一景 · 灯火',
        ),
        node(
          'fg2',
          'prompt',
          40,
          360,
          {
            text: '除夕夜圆桌上蒸汽升腾，饺子与红烧鱼热气缭绕，一家人举杯相碰笑声洋溢，窗外烟花绽放的光映进玻璃窗，暖黄灯光笼罩全屋，缓慢环绕运镜，温情团圆氛围',
          },
          '第二景 · 团圆',
        ),
        node(
          'fg3',
          'prompt',
          40,
          680,
          {
            text: '午夜钟声敲响，漫天烟花在古镇上空炸开成金色花雨，全家人站在天井仰望，烟花的光流转在每张笑脸上，无人机缓慢拉升大远景，万家灯火与烟花同框，璀璨收尾',
          },
          '第三景 · 烟花',
        ),
        node('fgtv1', 'textToVideo', 420, 20, { quality: 'quality', withAudio: false }, '文生视频 · 灯火'),
        node('fgtv2', 'textToVideo', 420, 340, { quality: 'quality', withAudio: false }, '文生视频 · 团圆'),
        node('fgtv3', 'textToVideo', 420, 660, { quality: 'quality', withAudio: false }, '文生视频 · 烟花'),
        node('fgc1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三景拼接'),
        node(
          'fg4',
          'prompt',
          820,
          700,
          {
            text: '灯火可亲，团圆有味。新的一年，愿你眼里有光，心中有爱；所求皆如愿，所行化坦途。多喜乐，长安宁——恭贺新岁，万事胜意。',
          },
          '祝福语文案',
        ),
        node('fgt1', 'tts', 1200, 680, { voice: 'tongtong', speed: 1 }, 'AI 配音'),
        node('fgap', 'audioPreview', 1560, 700),
        node('fgm1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('fgvp', 'videoPreview', 1580, 300, {}, '成片预览'),
      ],
      edges: [
        edge('fg1', 'text', 'fgtv1', 'text'),
        edge('fg2', 'text', 'fgtv2', 'text'),
        edge('fg3', 'text', 'fgtv3', 'text'),
        edge('fgtv1', 'video', 'fgc1', 'v1'),
        edge('fgtv2', 'video', 'fgc1', 'v2'),
        edge('fgtv3', 'video', 'fgc1', 'v3'),
        edge('fg4', 'text', 'fgt1', 'text'),
        edge('fgt1', 'audio', 'fgap', 'audio'),
        edge('fgt1', 'audio', 'fgm1', 'audio'),
        edge('fgc1', 'video', 'fgm1', 'video'),
        edge('fgm1', 'video', 'fgvp', 'video'),
      ],
    }),
  },
  {
    id: 'history-doc',
    name: '历史人文 · 微纪录片',
    description:
      '文明古迹微纪录片：凿窟 / 盛世 / 守护三段历史场景重现，电影级画面配沉稳解说词 AI 配音合成（示例为敦煌石窟题材，可替换任意文明 / 古迹主题）',
    category: '知识创作',
    tag: '纪录片',
    gradient: 'from-amber-500/20 via-yellow-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'hd1',
          'prompt',
          40,
          60,
          {
            text: '一千六百年前，第一批工匠在鸣沙山东麓的崖壁上凿下第一锤。此后十个朝代，无数画师在幽暗洞窟中点亮油灯，把信仰画进石壁。飞天衣袂掠过盛唐的风，也掠过乱世的风沙。今天，仍有一群人守着这些斑斓的梦——他们修补的是壁画，守护的，是我们共同的记忆。',
          },
          '解说词文案',
        ),
        node('hd2', 'tts', 400, 40, { voice: 'tongtong', speed: 0.9 }, '沉稳解说'),
        node(
          'hd3',
          'prompt',
          400,
          420,
          {
            text: '北魏年间大漠崖壁，工匠悬索半空凿石开窟，砂粒簌簌坠落，驼队由远及近行过戈壁，黄昏侧逆光勾勒人物剪影，尘土在光柱中浮动，广角大远景与凿击特写交切，史诗电影质感',
          },
          '场景一 · 凿窟',
        ),
        node(
          'hd4',
          'prompt',
          400,
          760,
          {
            text: '盛唐洞窟内部，画师执笔为飞天敷彩，石青与朱砂在油灯烛光中流转生辉，满壁飞天衣袂飘飘若乘风而行，缓慢横移长镜头扫过壁画长卷，金碧辉煌，庄严绚丽，历史重现质感',
          },
          '场景二 · 盛世',
        ),
        node(
          'hd5',
          'prompt',
          400,
          1100,
          {
            text: '现代敦煌研究院修复室，白发研究员俯身于壁画前，用细笔轻轻填补剥落的颜料，台灯照亮斑驳石壁，窗外鸣沙山月色如水；专注眼神特写与洞窟远景交叠，静穆深情，人文纪录片质感',
          },
          '场景三 · 守护',
        ),
        node('hdtv1', 'textToVideo', 780, 400, { quality: 'quality', withAudio: false }, '文生视频 · 凿窟'),
        node('hdtv2', 'textToVideo', 780, 740, { quality: 'quality', withAudio: false }, '文生视频 · 盛世'),
        node('hdtv3', 'textToVideo', 780, 1080, { quality: 'quality', withAudio: false }, '文生视频 · 守护'),
        node('hdc1', 'concat', 1160, 720, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三段拼接'),
        node('hdm1', 'avMerge', 1520, 440, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('hdvp', 'videoPreview', 1880, 460, {}, '成片预览'),
      ],
      edges: [
        edge('hd1', 'text', 'hd2', 'text'),
        edge('hd3', 'text', 'hdtv1', 'text'),
        edge('hd4', 'text', 'hdtv2', 'text'),
        edge('hd5', 'text', 'hdtv3', 'text'),
        edge('hdtv1', 'video', 'hdc1', 'v1'),
        edge('hdtv2', 'video', 'hdc1', 'v2'),
        edge('hdtv3', 'video', 'hdc1', 'v3'),
        edge('hd2', 'audio', 'hdm1', 'audio'),
        edge('hdc1', 'video', 'hdm1', 'video'),
        edge('hdm1', 'video', 'hdvp', 'video'),
      ],
    }),
  },
  {
    id: 'kids-picturebook',
    name: '儿童绘本 · 故事动画',
    description:
      '童话绘本三页插画（明快扁平风）由 AI 绘制并生成轻动画，串成翻页故事，配温柔讲述配音合成（示例为「小云朵棉花糖」，故事与插画可整体替换）',
    category: '知识创作',
    tag: '亲子',
    gradient: 'from-lime-500/20 via-emerald-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'kp1',
          'prompt',
          40,
          60,
          {
            text: '小云朵棉花糖住在天空幼儿园里。有一天，她看见山脚下的花园渴得低下了头，就鼓起勇气飘了过去。风婆婆帮她挤了挤身子，她掉下一颗颗小眼泪，变成了淅淅沥沥的小雨。花园咕嘟咕嘟喝饱了水，抬起头，开出一整片彩虹色的花。小云朵变得薄薄的、亮亮的——原来帮助别人，自己也会发光呀。',
          },
          '故事旁白',
        ),
        node('kp2', 'tts', 400, 40, { voice: 'tongtong', speed: 0.9 }, '温柔讲述'),
        node(
          'kp3',
          'imageGen',
          40,
          460,
          {
            size: '1024x576',
            prompt:
              '儿童绘本扁平插画，明快色块：圆滚滚的白色小云朵带着期待的表情飘在浅蓝天空，下方花园里的花朵微微低头，太阳公公微笑注视，简洁几何造型，柔和渐变，治愈童趣',
          },
          '插画一 · 出发',
        ),
        node(
          'kp4',
          'imageGen',
          40,
          810,
          {
            size: '1024x576',
            prompt:
              '儿童绘本扁平插画，明快色块：风婆婆鼓起腮帮吹气，小云朵挤出一颗颗晶莹雨滴纷纷飘落，雨滴在空中划出可爱弧线，蓝绿色调清新，构图活泼有张力，童趣十足',
          },
          '插画二 · 落雨',
        ),
        node(
          'kp5',
          'imageGen',
          40,
          1160,
          {
            size: '1024x576',
            prompt:
              '儿童绘本扁平插画，明快色块：雨后花园开满彩虹色小花，一道彩虹横跨天空，变薄变亮的小云朵在彩虹旁开心微笑，暖黄粉紫色块，温馨明亮收尾',
          },
          '插画三 · 归来',
        ),
        node(
          'kpiv1',
          'imageToVideo',
          400,
          440,
          {
            quality: 'quality',
            withAudio: false,
            prompt: '小云朵轻轻上下漂浮并眨眼微笑，云絮缓缓流动，太阳光晕呼吸般柔和闪烁，微动画循环质感',
          },
          '轻动画 · 出发',
        ),
        node(
          'kpiv2',
          'imageToVideo',
          400,
          790,
          {
            quality: 'quality',
            withAudio: false,
            prompt: '雨滴缓缓飘落，风婆婆衣带轻扬，小云朵轻轻摇晃，雨丝节奏性落下，柔和循环动画',
          },
          '轻动画 · 落雨',
        ),
        node(
          'kpiv3',
          'imageToVideo',
          400,
          1140,
          {
            quality: 'quality',
            withAudio: false,
            prompt: '花朵轻轻摇曳绽放，彩虹色带微微流动，小云朵缓缓飘移，光斑温柔闪烁，轻快收尾',
          },
          '轻动画 · 归来',
        ),
        node('kpc1', 'concat', 780, 760, { transition: 'fade', transitionDuration: 0.6, fitMode: 'crop', fastPreview: false }, '三页拼接'),
        node('kpm1', 'avMerge', 1140, 440, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('kpvp', 'videoPreview', 1500, 460, {}, '成片预览'),
      ],
      edges: [
        edge('kp1', 'text', 'kp2', 'text'),
        edge('kp3', 'image', 'kpiv1', 'image'),
        edge('kp4', 'image', 'kpiv2', 'image'),
        edge('kp5', 'image', 'kpiv3', 'image'),
        edge('kpiv1', 'video', 'kpc1', 'v1'),
        edge('kpiv2', 'video', 'kpc1', 'v2'),
        edge('kpiv3', 'video', 'kpc1', 'v3'),
        edge('kp2', 'audio', 'kpm1', 'audio'),
        edge('kpc1', 'video', 'kpm1', 'video'),
        edge('kpm1', 'video', 'kpvp', 'video'),
      ],
    }),
  },
  {
    id: 'travel-vlog',
    name: '旅行 Vlog · 风光混剪',
    description:
      '三段治愈系风光（湖畔晨雾 / 山间公路 / 海岸日落）叠化拼接，配轻松旁白合成慢节奏旅行 Vlog（示例为滇西北题材，可替换任意目的地与行程）',
    category: '生活记录',
    tag: '治愈',
    gradient: 'from-teal-500/20 via-emerald-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'tv1',
          'prompt',
          40,
          40,
          {
            text: '清晨高原湖泊，湖面如镜倒映雪山与粉紫渐变天空，薄雾贴水缓缓流动，牦牛在岸边悠闲低头吃草，第一缕阳光染金雪顶，缓慢推进空镜，通透空气感，治愈系风光大片',
          },
          '第一站 · 湖畔晨雾',
        ),
        node(
          'tv2',
          'prompt',
          40,
          360,
          {
            text: '盘山公路在草甸与云杉林间蜿蜒伸展，越野车驶过发卡弯扬起细尘，五彩经幡在风中翻飞作响，侧逆光勾出山脊轮廓，无人机侧飞跟拍，自由松弛，公路旅行质感',
          },
          '第二站 · 山间公路',
        ),
        node(
          'tv3',
          'prompt',
          40,
          680,
          {
            text: '黄昏海岸线，浪花轻吻沙滩又缓缓退去，旅人坐在礁石上眺望落日熔金，海鸥掠过橙红天际，剪影与粼粼波光交相辉映，缓慢环绕运镜收近人物剪影，温柔治愈，慢节奏收尾',
          },
          '第三站 · 海岸日落',
        ),
        node('tvtv1', 'textToVideo', 420, 20, { quality: 'quality', withAudio: false }, '文生视频 · 湖畔'),
        node('tvtv2', 'textToVideo', 420, 340, { quality: 'quality', withAudio: false }, '文生视频 · 公路'),
        node('tvtv3', 'textToVideo', 420, 660, { quality: 'quality', withAudio: false }, '文生视频 · 海岸'),
        node('tvc1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.8, fitMode: 'crop', fastPreview: false }, '三站拼接'),
        node(
          'tvn1',
          'prompt',
          820,
          700,
          {
            text: '把闹钟留在城市，把自己交给山野。清晨的湖替我醒着，雪山替我记着来路；风穿过经幡，也吹散了没说出口的心事。原来最好的旅行，不是去了多远，而是终于慢了下来——黄昏的海跟我说：明天见呀，世界。',
          },
          'Vlog 旁白',
        ),
        node('tvt1', 'tts', 1200, 680, { voice: 'tongtong', speed: 1 }, 'AI 配音'),
        node('tvap', 'audioPreview', 1560, 700),
        node('tvm1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('tvvp', 'videoPreview', 1580, 300, {}, '成片预览'),
      ],
      edges: [
        edge('tv1', 'text', 'tvtv1', 'text'),
        edge('tv2', 'text', 'tvtv2', 'text'),
        edge('tv3', 'text', 'tvtv3', 'text'),
        edge('tvtv1', 'video', 'tvc1', 'v1'),
        edge('tvtv2', 'video', 'tvc1', 'v2'),
        edge('tvtv3', 'video', 'tvc1', 'v3'),
        edge('tvn1', 'text', 'tvt1', 'text'),
        edge('tvt1', 'audio', 'tvap', 'audio'),
        edge('tvt1', 'audio', 'tvm1', 'audio'),
        edge('tvc1', 'video', 'tvm1', 'video'),
        edge('tvm1', 'video', 'tvvp', 'video'),
      ],
    }),
  },
  {
    id: 'food-film',
    name: '美食短片 · 治愈烟火',
    description:
      '一碗葱油拌面的治愈短片：食材特写 → 烹饪烟火 → 成品挑面三镜成片，暖色调烟火气提示词，配旁白（不需要配音时可断开音频线直接预览拼接）',
    category: '生活记录',
    tag: '烟火气',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    build: () => ({
      nodes: [
        node(
          'ff1',
          'prompt',
          40,
          40,
          {
            text: '清晨厨房木案板，翠绿小葱挂着水珠、金黄细面束、琥珀色生抽瓶并排陈列，晨光从侧窗斜射进来，微尘在光柱中浮动，浅景深缓慢横移特写，日系治愈食光质感，暖色调',
          },
          '第一镜 · 食材特写',
        ),
        node(
          'ff2',
          'prompt',
          40,
          360,
          {
            text: '铁锅热油滋滋作响，葱段滑入炸至边缘焦卷，油面泛起金色细泡，热酱油沿锅边淋入瞬间腾起酱香浓烟，灶火轻窜映亮锅沿，高速特写与微距慢动作交切，烟火气十足，暖黄色调',
          },
          '第二镜 · 烹饪过程',
        ),
        node(
          'ff3',
          'prompt',
          40,
          680,
          {
            text: '白瓷碗中面条根根油亮，翠绿葱花与金黄虾米点缀其上，热气袅袅升腾，筷子挑起面条拉出柔韧弧线，酱汁缓缓垂淌，暖黄灯光下浅景深特写，治愈满足，收尾定格',
          },
          '第三镜 · 成品呈现',
        ),
        node('fftv1', 'textToVideo', 420, 20, { quality: 'quality', withAudio: false }, '文生视频 · 食材'),
        node('fftv2', 'textToVideo', 420, 340, { quality: 'quality', withAudio: false }, '文生视频 · 烹饪'),
        node('fftv3', 'textToVideo', 420, 660, { quality: 'quality', withAudio: false }, '文生视频 · 成品'),
        node('ffc1', 'concat', 820, 300, { transition: 'fade', transitionDuration: 0.6, fitMode: 'crop', fastPreview: false }, '三镜拼接'),
        node(
          'ffn1',
          'prompt',
          820,
          700,
          {
            text: '唤醒一座城市的，往往不是闹钟，而是一碗面的香气。小葱在热油里慢慢变成焦糖色，酱油沿着锅边淋下，那一声「滋啦」，是人间最踏实的回响。趁热拌匀，嗦上一口——今天所有的疲惫，就都值得了。',
          },
          '旁白文案',
        ),
        node('fft1', 'tts', 1200, 680, { voice: 'tongtong', speed: 1 }, 'AI 配音（可选）'),
        node('ffap', 'audioPreview', 1560, 700),
        node('ffm1', 'avMerge', 1200, 280, { keepOriginal: false, audioVolume: 1, durationMode: 'audio' }, '成片合成'),
        node('ffvp', 'videoPreview', 1580, 300, {}, '成片预览'),
      ],
      edges: [
        edge('ff1', 'text', 'fftv1', 'text'),
        edge('ff2', 'text', 'fftv2', 'text'),
        edge('ff3', 'text', 'fftv3', 'text'),
        edge('fftv1', 'video', 'ffc1', 'v1'),
        edge('fftv2', 'video', 'ffc1', 'v2'),
        edge('fftv3', 'video', 'ffc1', 'v3'),
        edge('ffn1', 'text', 'fft1', 'text'),
        edge('fft1', 'audio', 'ffap', 'audio'),
        edge('fft1', 'audio', 'ffm1', 'audio'),
        edge('ffc1', 'video', 'ffm1', 'video'),
        edge('ffm1', 'video', 'ffvp', 'video'),
      ],
    }),
  },
]
