// POST /api/daily-report — Generate daily AI reports and store in D1
// Can be called manually or via Cloudflare Cron Trigger (scheduled)

export async function onRequest(context) {
  const result = await generateDailyReports(context.env);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Cron Trigger handler — runs daily at 02:00 UTC
export async function scheduled(event, env, ctx) {
  ctx.waitUntil(generateDailyReports(env));
}

// Financial Astrology Knowledge Base
const ASTRO_KNOWLEDGE = {
  planets: {
    'Jupiter': { zh: '木星', effect: '扩张、增长、机遇、乐观', marketImpact: '利好风险资产、市场情绪高涨、泡沫形成' },
    'Saturn': { zh: '土星', effect: '收缩、限制、纪律、结构', marketImpact: '利空风险资产、流动性收紧、监管加强' },
    'Uranus': { zh: '天王星', effect: '突变、颠覆、创新、意外', marketImpact: '黑天鹅事件、市场剧烈波动、技术革命' },
    'Neptune': { zh: '海王星', effect: '幻象、泡沫、直觉、混沌', marketImpact: '市场泡沫、非理性繁荣、流动性泛滥' },
    'Pluto': { zh: '冥王星', effect: '转化、重生、权力、深度变革', marketImpact: '结构性变革、权力重组、深度熊市或牛市' },
    'Mars': { zh: '火星', effect: '冲突、行动、竞争、战争', marketImpact: '地缘政治紧张、市场恐慌、能源价格波动' },
    'Venus': { zh: '金星', effect: '价值、财富、审美、和谐', marketImpact: '消费板块活跃、奢侈品走强、市场温和' },
    'Mercury': { zh: '水星', effect: '沟通、交易、信息、逻辑', marketImpact: '交易活跃、信息驱动波动、逆行期易出错' },
    'Sun': { zh: '太阳', effect: '核心、领导、自我、活力', marketImpact: '市场方向明确、领导股走强' },
    'Moon': { zh: '月亮', effect: '情绪、直觉、周期、波动', marketImpact: '短期波动、情绪化交易、周期性变化' },
  },
  signs: {
    'Aries': { zh: '白羊座', trait: '先锋精神、开创勇气', sector: '科技、军工、新能源' },
    'Taurus': { zh: '金牛座', trait: '坚韧不拔、长期主义', sector: '金融、地产、消费品' },
    'Gemini': { zh: '双子座', trait: '多维智慧、信息掌控', sector: '通信、传媒、教育' },
    'Cancer': { zh: '巨蟹座', trait: '守护本能、深层驱动', sector: '房地产、食品、家庭服务' },
    'Leo': { zh: '狮子座', trait: '王者风范、创造热情', sector: '娱乐、奢侈品、科技龙头' },
    'Virgo': { zh: '处女座', trait: '极致精密、工匠精神', sector: '医疗、精密制造、服务业' },
    'Libra': { zh: '天秤座', trait: '平衡法则、战略眼光', sector: '法律、咨询、金融中介' },
    'Scorpio': { zh: '天蝎座', trait: '深度洞察、转化力量', sector: '保险、私募、资源' },
    'Sagittarius': { zh: '射手座', trait: '无远弗届、扩张信念', sector: '国际业务、教育、旅游' },
    'Capricorn': { zh: '摩羯座', trait: '纪律严明、帝国建造', sector: '政府、银行、传统工业' },
    'Aquarius': { zh: '水瓶座', trait: '颠覆基因、先知远见', sector: '科技、航空、新能源' },
    'Pisces': { zh: '双鱼座', trait: '深邃直觉、超凡感知', sector: '医疗、艺术、能源' },
  },
  aspects: {
    'conjunction': { zh: '合相', effect: '能量叠加、主题强化' },
    'opposition': { zh: '对冲', effect: '张力、冲突、抉择' },
    'trine': { zh: '三分相', effect: '和谐、流畅、机遇' },
    'square': { zh: '四分相', effect: '挑战、压力、转折' },
    'sextile': { zh: '六分相', effect: '机会、合作、激活' },
  },
  houses: {
    1: '自我与形象', 2: '财富与资源', 3: '沟通与学习', 4: '家庭与根基',
    5: '创造与投机', 6: '工作与服务', 7: '合作与关系', 8: '转化与共享资源',
    9: '哲学与远行', 10: '事业与声望', 11: '社群与愿景', 12: '潜意识与隐秘'
  }
};

// Current planetary positions (simplified for 2025)
const CURRENT_TRANSITS = `
当前天象（2025年4月）：
- 天王星即将进入金牛座（7月正式进入），将引发全球资产定价体系的剧烈震荡
- 冥王星在水瓶座（2024-2044），带来科技革命与去中心化浪潮
- 土星在双鱼座（2023-2026），流动性收紧与金融监管加强
- 木星在双子座（2024年6月-2025年6月），信息过载与多维博弈
- 火星在白羊座（短期），地缘政治紧张与冲突升级
- 金星在金牛座（短期），价值回归与消费韧性
`;

async function generateDailyReports(env) {
  const DB = env.DB;
  const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || '';

  if (!OPENROUTER_API_KEY) {
    return { status: 500, body: { error: 'OPENROUTER_API_KEY not configured' } };
  }

  try {
    // Auto-create reports table with content field
    await DB.prepare(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'MARKET OUTLOOK',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      read_time INTEGER NOT NULL DEFAULT 5,
      lang TEXT NOT NULL DEFAULT 'zh',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();

    // Check if today's reports already exist
    const today = new Date().toISOString().split('T')[0];
    const existing = await DB.prepare(
      "SELECT COUNT(*) as cnt FROM reports WHERE date = ?"
    ).bind(today).first();

    if (existing && existing.cnt > 0) {
      return { status: 200, body: { message: 'Today\'s reports already exist', count: existing.cnt } };
    }

    // Generate 1 report in Chinese (default language)
    const prompt = `你是一位专业的金融占星师，为 ProofOfVibe 撰写每日市场报告。请用中文撰写，风格要专业但不失生动，融合金融分析与占星学评论。

## 金融占星知识库

### 行星效应
${Object.entries(ASTRO_KNOWLEDGE.planets).map(([p, d]) => `- ${p}（${d.zh}）：${d.effect} → 市场影响：${d.marketImpact}`).join('\n')}

### 星座特质
${Object.entries(ASTRO_KNOWLEDGE.signs).map(([s, d]) => `- ${s}（${d.zh}）：${d.trait} → 相关板块：${d.sector}`).join('\n')}

### 相位含义
${Object.entries(ASTRO_KNOWLEDGE.aspects).map(([a, d]) => `- ${a}（${d.zh}）：${d.effect}`).join('\n')}

### 宫位主题
${Object.entries(ASTRO_KNOWLEDGE.houses).map(([h, t]) => `- 第${h}宫：${t}`).join('\n')}

## 当前天象
${CURRENT_TRANSITS}

## 今日日期
${today}

## 任务要求
请撰写一篇完整的金融占星市场报告（800-1200字），包含：

1. **标题**：吸引眼球的标题，融合金融与占星元素
2. **摘要**：100字以内的核心观点
3. **正文**：分为3-4个段落，包含：
   - 当前天象对全球市场的影响分析
   - 具体板块/资产的投资建议
   - 风险提示与时间节点
   - 占星学视角的深度解读

请以JSON格式返回：
{
  "title": "标题",
  "description": "摘要",
  "content": "正文（使用\\n\\n分段）",
  "category": "CRYPTO/TECH/GEOPOLITICS/MACRO/MARKET OUTLOOK 之一"
}

只返回JSON，不要markdown代码块。`;

    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'HTTP-Referer': 'https://proofofvibe.xyz',
        'X-Title': 'ProofOfVibe',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一位专业的金融占星师，精通行星运动与市场周期的关联。你的分析基于严谨的金融占星方法论，而非迷信。请用中文撰写专业、有深度的市场报告。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.8,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('OpenRouter API error:', errText);
      return { status: 502, body: { error: 'AI service error', details: errText } };
    }

    const data = await apiRes.json();
    let content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim() : '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { status: 500, body: { error: 'Failed to parse AI response', raw: content.substring(0, 500) } };
    }

    const report = JSON.parse(jsonMatch[0]);

    // Determine image based on category
    const categoryImages = {
      'CRYPTO': 'assets/report-crypto-1.jpg',
      'TECH': 'assets/report-tech-1.jpg',
      'GEOPOLITICS': 'assets/report-geopolitics-1.jpg',
      'MACRO': 'assets/report-macro-1.jpg',
      'MARKET OUTLOOK': 'assets/report-outlook-1.jpg',
    };

    const wordCount = (report.content || report.description || '').split(/\s+/).length;
    const readTime = Math.max(3, Math.ceil(wordCount / 300));

    await DB.prepare(
      'INSERT INTO reports (category, title, description, content, image_url, date, read_time, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      report.category || 'MARKET OUTLOOK',
      report.title || 'Daily Market Report',
      report.description || '',
      report.content || report.description || '',
      categoryImages[report.category] || categoryImages['MARKET OUTLOOK'],
      today,
      readTime,
      'zh'
    ).run();

    return {
      status: 200,
      body: {
        success: true,
        date: today,
        report: {
          title: report.title,
          category: report.category,
          wordCount,
          readTime
        }
      },
    };
  } catch (err) {
    console.error('Daily report error:', err);
    return { status: 500, body: { error: 'Internal error: ' + err.message } };
  }
}
