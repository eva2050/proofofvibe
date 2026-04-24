// POST /api/seed-reports — One-time seed of hardcoded reports into D1
// Run once, then delete this file

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

  // Create table
  await DB.prepare(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'MARKET OUTLOOK',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    read_time INTEGER NOT NULL DEFAULT 5,
    lang TEXT NOT NULL DEFAULT 'zh',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  // Check if already seeded
  const existing = await DB.prepare('SELECT COUNT(*) as cnt FROM reports').first();
  if (existing && existing.cnt > 0) {
    return new Response(JSON.stringify({ message: 'Already seeded with ' + existing.cnt + ' reports' }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const reports = [
    { category: 'GEOPOLITICS', title: '特朗普关税风暴：木星射手座的扩张主义如何重塑全球贸易格局', description: '当木星进入射手座的扩张能量遇上特朗普的保护主义政策，全球供应链正在经历一场星象级别的重构。', date: '2025-04-12', read_time: 8, image_url: 'assets/report-geopolitics-1.jpg', lang: 'zh' },
    { category: 'CRYPTO', title: 'BTC减半后周期：土星双鱼与冥王星水瓶的世纪博弈', description: '比特币第四次减半完成，土星在双鱼座的限制力与冥王星在水瓶座的颠覆力正在争夺加密市场的叙事主导权。', date: '2025-04-11', read_time: 12, image_url: 'assets/report-crypto-1.jpg', lang: 'zh' },
    { category: 'TECH', title: 'AI军备竞赛：NVDA与AMD的火星对冲如何定义算力霸权', description: 'NVIDIA与AMD的竞争已超越商业范畴，成为火星白羊的进攻性对决。星盘显示，这场博弈将在2025年Q3达到高潮。', date: '2025-04-10', read_time: 10, image_url: 'assets/report-tech-1.jpg', lang: 'zh' },
    { category: 'MACRO', title: '美联储降息周期：木星双子与土星双鱼的政策十字路口', description: '美联储正面临星象级别的决策困境：木星双子的信息过载与土星双鱼的流动性焦虑正在拉扯政策方向。', date: '2025-04-09', read_time: 9, image_url: 'assets/report-macro-1.jpg', lang: 'zh' },
    { category: 'MARKET OUTLOOK', title: '2025下半年星象预警：天王星进入金牛的全球市场冲击波', description: '天王星即将进入金牛座，这将引发全球资产定价体系的剧烈震荡。历史数据显示，天王星换座往往伴随黑天鹅事件。', date: '2025-04-08', read_time: 15, image_url: 'assets/report-outlook-1.jpg', lang: 'zh' },
    { category: 'CRYPTO', title: 'SOL vs ETH：公链之王的星盘对决与2025格局预判', description: 'Solana和Ethereum的竞争已进入白热化阶段。从星盘角度看，两者的创始星象呈现出截然不同的金融DNA。', date: '2025-04-07', read_time: 11, image_url: 'assets/report-crypto-2.jpg', lang: 'zh' },
    { category: 'GEOPOLITICS', title: '中东局势升级：火星白羊的战争冲动与原油市场的星象共振', description: '火星在白羊座的位置正在加剧地缘政治紧张局势。从星盘分析，原油价格将在4月底迎来关键转折点。', date: '2025-04-06', read_time: 7, image_url: 'assets/report-geopolitics-2.jpg', lang: 'zh' },
    { category: 'TECH', title: '苹果Vision Pro的冥王星时刻：空间计算能否重演iPhone奇迹', description: 'Apple Vision Pro正处于冥王星摩羯的深度转型期。星盘分析显示，其成功与否取决于2025年秋季的木星相位。', date: '2025-04-05', read_time: 8, image_url: 'assets/report-tech-2.jpg', lang: 'zh' },
    { category: 'MACRO', title: '日元套利交易逆转：金星金牛崩塌与全球流动性收缩信号', description: '日元正在经历金星金牛座的崩塌周期。当金星失去金牛座的稳定支撑，套利交易的平仓潮将席卷全球市场。', date: '2025-04-04', read_time: 10, image_url: 'assets/report-macro-2.jpg', lang: 'zh' },
    { category: 'MARKET OUTLOOK', title: '巴菲特指标与星盘周期：2025年美股大顶的天象预警', description: '巴菲特指标已达到历史高位。结合当前的天象周期分析，美股正接近一个关键的顶部区域。', date: '2025-04-03', read_time: 13, image_url: 'assets/report-outlook-1.jpg', lang: 'zh' },
  ];

  let inserted = 0;
  for (const r of reports) {
    await DB.prepare(
      'INSERT INTO reports (category, title, description, image_url, date, read_time, lang) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(r.category, r.title, r.description, r.image_url, r.date, r.read_time, r.lang).run();
    inserted++;
  }

  return new Response(JSON.stringify({ success: true, inserted }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
