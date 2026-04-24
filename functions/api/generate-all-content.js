// POST /api/generate-all-content — Batch generate content for all reports missing it
// One-time use: generates 2000+ word financial astrology content for each report

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const DB = context.env.DB;
  const OPENROUTER_API_KEY = context.env.OPENROUTER_API_KEY || '';

  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Migrate: add content column if missing
  try { await DB.prepare("ALTER TABLE reports ADD COLUMN content TEXT NOT NULL DEFAULT ''").run(); } catch(e) {}

  // Get all reports without content
  const result = await DB.prepare(
    "SELECT rowid as id, category, title, description FROM reports WHERE content IS NULL OR content = '' ORDER BY date DESC"
  ).all();

  const reports = result.results || [];
  if (reports.length === 0) {
    return new Response(JSON.stringify({ message: 'All reports already have content' }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const ASTRO_KB = `
## 金融占星知识库

### 行星效应
- 木星（Jupiter）：扩张、增长、机遇、乐观 → 利好风险资产、市场情绪高涨、泡沫形成
- 土星（Saturn）：收缩、限制、纪律、结构 → 利空风险资产、流动性收紧、监管加强
- 天王星（Uranus）：突变、颠覆、创新、意外 → 黑天鹅事件、市场剧烈波动、技术革命
- 海王星（Neptune）：幻象、泡沫、直觉、混沌 → 市场泡沫、非理性繁荣、流动性泛滥
- 冥王星（Pluto）：转化、重生、权力、深度变革 → 结构性变革、权力重组、深度熊市或牛市
- 火星（Mars）：冲突、行动、竞争、战争 → 地缘政治紧张、市场恐慌、能源价格波动
- 金星（Venus）：价值、财富、审美、和谐 → 消费板块活跃、奢侈品走强、市场温和
- 水星（Mercury）：沟通、交易、信息、逻辑 → 交易活跃、信息驱动波动、逆行期易出错

### 星座特质与板块
- 白羊座：先锋精神、开创勇气 → 科技、军工、新能源
- 金牛座：坚韧不拔、长期主义 → 金融、地产、消费品
- 双子座：多维智慧、信息掌控 → 通信、传媒、教育
- 巨蟹座：守护本能、深层驱动 → 房地产、食品、家庭服务
- 狮子座：王者风范、创造热情 → 娱乐、奢侈品、科技龙头
- 处女座：极致精密、工匠精神 → 医疗、精密制造、服务业
- 天秤座：平衡法则、战略眼光 → 法律、咨询、金融中介
- 天蝎座：深度洞察、转化力量 → 保险、私募、资源
- 射手座：无远弗届、扩张信念 → 国际业务、教育、旅游
- 摩羯座：纪律严明、帝国建造 → 政府、银行、传统工业
- 水瓶座：颠覆基因、先知远见 → 科技、航空、新能源
- 双鱼座：深邃直觉、超凡感知 → 医疗、艺术、能源

### 相位含义
- 合相（Conjunction）：能量叠加、主题强化
- 对冲（Opposition）：张力、冲突、抉择
- 三分相（Trine）：和谐、流畅、机遇
- 四分相（Square）：挑战、压力、转折
- 六分相（Sextile）：机会、合作、激活

### 宫位主题
第1宫：自我与形象 | 第2宫：财富与资源 | 第3宫：沟通与学习 | 第4宫：家庭与根基
第5宫：创造与投机 | 第6宫：工作与服务 | 第7宫：合作与关系 | 第8宫：转化与共享资源
第9宫：哲学与远行 | 第10宫：事业与声望 | 第11宫：社群与愿景 | 第12宫：潜意识与隐秘

### 当前天象（2025年4月）
- 天王星即将进入金牛座（7月正式进入），将引发全球资产定价体系的剧烈震荡
- 冥王星在水瓶座（2024-2044），带来科技革命与去中心化浪潮
- 土星在双鱼座（2023-2026），流动性收紧与金融监管加强
- 木星在双子座（2024年6月-2025年6月），信息过载与多维博弈
- 火星在白羊座（短期），地缘政治紧张与冲突升级
- 金星在金牛座（短期），价值回归与消费韧性
`;

  const results = [];

  for (const report of reports) {
    try {
      const prompt = `你是一位资深的金融占星分析师，为 ProofOfVibe 撰写深度市场报告。

${ASTRO_KB}

## 报告信息
- 标题：${report.title}
- 分类：${report.category}
- 摘要：${report.description}

## 写作要求
1. 请用中文撰写，字数不少于2000字
2. 必须严格基于上述金融占星知识库中的方法论进行分析
3. 文章结构：
   - 引言：从当前天象切入，引出主题（200-300字）
   - 天象分析：详细解读相关行星、星座、相位的影响（500-600字）
   - 市场影响：分析对具体板块/资产的影响（400-500字）
   - 投资策略：给出基于星象的交易建议和风险提示（400-500字）
   - 时间节点：标注关键的天象转折日期（200-300字）
   - 结语：总结核心观点（100-200字）
4. 语言风格：专业但不失生动，融合金融术语与占星概念
5. 不要使用markdown格式，用纯文本，段落之间用空行分隔
6. 不要在文中出现"作为AI"等字眼

请直接输出报告正文，不要输出标题或其他元信息。`;

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
            { role: 'system', content: '你是ProofOfVibe的资深金融占星分析师。你的分析基于严谨的金融占星方法论，结合行星运动、星座特质、相位关系和宫位主题来解读市场趋势。你的报告专业、有深度、有洞察力。请用中文撰写，不少于2000字。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 4000,
          temperature: 0.85,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error('API error for report ' + report.id + ':', errText);
        results.push({ id: report.id, title: report.title, error: 'API error' });
        continue;
      }

      const data = await apiRes.json();
      const content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content.trim() : '';

      if (!content) {
        results.push({ id: report.id, title: report.title, error: 'Empty response' });
        continue;
      }

      // Update the report with content
      await DB.prepare(
        "UPDATE reports SET content = ?, updated_at = datetime('now') WHERE rowid = ?"
      ).bind(content, report.id).run();

      const charCount = content.length;
      results.push({ id: report.id, title: report.title, chars: charCount });
    } catch (err) {
      console.error('Error for report ' + report.id + ':', err);
      results.push({ id: report.id, title: report.title, error: err.message });
    }
  }

  return new Response(JSON.stringify({
    success: true,
    processed: results.length,
    results,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
