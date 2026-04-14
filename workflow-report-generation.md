# ProofOfVibe 每日报告生成工作流

## 输入
用户提供：**主题关键词** + **分类**（GEOPOLITICS / CRYPTO / TECH / MACRO / MARKET OUTLOOK）

## 输出
1. 一篇中文报告（标题 + 摘要 + 正文）
2. 一张 AI 配图（统一插画风格）
3. 写入 D1 数据库 + 更新前端 fallback 数据

---

## Step 1: 生成文章

### 文章结构
```
- category: 分类标签（英文大写）
- title: 中文标题（15-25字，包含星象隐喻+金融主题）
- description: 中文摘要（50-80字，概括核心观点）
- date: 当天日期（格式 YYYY.MM.DD）
- read_time: 阅读时间（7-15分钟）
- lang: 'zh' 或 'en'
- image_url: 配图路径（assets/report-{category}-{n}.jpg）
```

### 标题公式
`[金融事件/主体]：[星象隐喻]如何[影响/重塑/定义][市场/格局/趋势]`

### 摘要公式
`当[星象配置]的[能量特征]遇上[现实事件]，[市场/领域]正在经历[变化描述]。`

### 写作风格
- 金融专业术语 + 星象隐喻混合
- 客观分析语气，带有占星学框架
- 引用具体星象（行星、星座、相位）
- 给出时间节点预测

---

## Step 2: 生成配图

### 统一风格参数
- 模型: SDXL (内置 GenerateImage 工具)
- 尺寸: `landscape_16_9` (1280×720)
- 保存路径: `proofofvibe/assets/report-{category_slug}-{n}.jpg`

### 提示词模板
```
Editorial illustration for a {category} news article: {场景描述}. {色调描述}. Digital cel-shaded illustration style with political cartoon aesthetics, panoramic landscape composition, no text.
```

### 分类专属配色
| 分类 | 色调关键词 | 场景元素 |
|------|-----------|---------|
| GEOPOLITICS | Warm golden sunset, amber, sandy tones | 地图、国旗、领导人剪影、军事元素 |
| CRYPTO | Deep purple and gold, cosmic | 比特币/以太坊符号、区块链网络、宇宙星空 |
| TECH | Fiery orange and crimson, red | 芯片、电路、竞技场、火星/战神元素 |
| MACRO | Cool blue and teal with golden accents | 央行建筑、天平、时钟、海洋/流体 |
| MARKET OUTLOOK | Electric blue and gold, stormy | 牛/熊、闪电、金融市场图表、星座 |

### 场景设计原则
- 把抽象的「星象+金融」概念具象化为**一个戏剧性场景**
- 使用强烈的视觉隐喻（如「土星持镰刀劈开比特币」）
- 包含 3 层景深：前景（人物/主体）→ 中景（场景）→ 背景（天空/宇宙）
- 星象元素作为超自然力量出现（发光、巨大化、拟人化）

### 提示词示例库

**GEOPOLITICS:**
- `{领导人/国家} as {星座} {角色}, {动作} across {地理场景}. {行星} glows in background.`
- `Mars as fiery warrior god standing over {地区}, holding flaming sword that ignites {资源}.`

**CRYPTO:**
- `{加密货币} symbol being {动作} by {行星} figure in {场景}. {另一行星} pours {能量} as glowing waves.`
- `{代币A} and {代币B} as two cosmic titans wrestling in stellar arena. Galaxy swirls form battleground.`

**TECH:**
- `{公司A} and {公司B} as two armored warriors in Mars-red arena, clashing with {科技元素} energy swords.`
- `{产品} as magical artifact on altar, with {行星} as dark sorcerer casting transformative spells.`

**MACRO:**
- `{央行/机构} building split, {星座} twins pulling {政策} levers in opposite directions. {行星} drowning in {星座} ocean.`
- `{货币} symbol crashing through {星座} statue, shattering it. Global currency notes swirl in vortex.`

**MARKET OUTLOOK:**
- `{行星} as electric bull charging into golden {星座} arena, sending shockwaves through stock market charts.`
- `{指标} reaching critical level, {星座} constellation forming warning pattern above financial skyline.`

---

## Step 3: 写入数据

### 方式 A: D1 API（推荐，部署后使用）
```bash
curl -X POST https://proofofvibe.pages.dev/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "category": "CRYPTO",
    "title": "BTC减半后周期：土星双鱼与冥王星水瓶的世纪博弈",
    "description": "比特币第四次减半完成...",
    "image_url": "assets/report-crypto-1.jpg",
    "date": "2025.04.11",
    "read_time": 12,
    "lang": "zh"
  }'
```

### 方式 B: 更新前端 fallback 数据
在 `proof-of-vibe.html` 的 `ipReportsFallback` 数组中添加新条目，同时：
1. 将配图保存到 `proofofvibe/assets/` 和 `workspace/assets/` 两个目录
2. 更新 `image_url` 路径

---

## Step 4: 部署
```bash
cd proofofvibe
cp ../proof-of-vibe.html index.html
git add -A
git commit -m "Report: {标题摘要}"
git push origin main
```

---

## 文件命名规范
```
assets/report-{category_slug}-{number}.jpg

category_slug:
  geopolitics, crypto, tech, macro, outlook

number:
  按同分类递增 (1, 2, 3...)
```

## 每日配额
- 2-5 篇新报告
- 每篇配 1 张 AI 插画
- 优先覆盖不同分类，保持内容多样性
