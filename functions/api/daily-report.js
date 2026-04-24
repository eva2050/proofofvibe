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

async function generateDailyReports(env) {
  const DB = env.DB;
  const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || '';

  if (!OPENROUTER_API_KEY) {
    return { status: 500, body: { error: 'OPENROUTER_API_KEY not configured' } };
  }

  try {
    // Auto-create reports table
    await DB.prepare(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'MARKET OUTLOOK',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      read_time INTEGER NOT NULL DEFAULT 5,
      lang TEXT NOT NULL DEFAULT 'en',
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

    // Generate 2 reports: one in English, one in Chinese
    const reportConfigs = [
      { lang: 'en', category: 'MARKET OUTLOOK' },
      { lang: 'zh', category: 'MARKET OUTLOOK' },
    ];

    const results = [];

    for (const config of reportConfigs) {
      const langInstruction = config.lang === 'zh'
        ? '用中文撰写。标题和内容都用中文。'
        : 'Write in English.';

      const prompt = `You are a financial astrologer writing a daily market report for ProofOfVibe. ${langInstruction}

Today's date: ${today}

Write a concise daily market report (3-4 paragraphs) that blends:
1. Current global market themes (inflation, interest rates, geopolitics, crypto trends, tech earnings)
2. Astrological commentary (current planetary transits, retrogrades, eclipses)
3. Actionable vibe-based trading sentiment

Format your response as JSON with these fields:
- "title": A catchy headline (under 80 characters)
- "description": The report body (3-4 paragraphs, 300-500 words)
- "category": One of: "CRYPTO", "TECH", "GEOPOLITICS", "MACRO", "MARKET OUTLOOK"

Return ONLY valid JSON, no markdown.`;

      try {
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
              { role: 'system', content: 'You are a financial astrologer writing daily market reports. Always respond with valid JSON only, no markdown.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.9,
          }),
        });

        if (!apiRes.ok) {
          console.error('OpenRouter API error for lang=' + config.lang + ':', await apiRes.text());
          continue;
        }

        const data = await apiRes.json();
        let content = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content.trim() : '';

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        const report = JSON.parse(jsonMatch[0]);

        // Determine image based on category
        const categoryImages = {
          'CRYPTO': '/assets/report-crypto-1.jpg',
          'TECH': '/assets/report-tech-1.jpg',
          'GEOPOLITICS': '/assets/report-geopolitics-1.jpg',
          'MACRO': '/assets/report-macro-1.jpg',
          'MARKET OUTLOOK': '/assets/report-outlook-1.jpg',
        };

        await DB.prepare(
          'INSERT INTO reports (category, title, description, image_url, date, read_time, lang) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          report.category || config.category,
          report.title || 'Daily Market Report',
          report.description || '',
          categoryImages[report.category] || categoryImages['MARKET OUTLOOK'],
          today,
          Math.ceil((report.description || '').split(/\s+/).length / 200) || 5,
          config.lang
        ).run();

        results.push({ lang: config.lang, title: report.title, category: report.category });
      } catch (err) {
        console.error('Error generating report for lang=' + config.lang + ':', err);
      }
    }

    return {
      status: 200,
      body: { success: true, date: today, generated: results.length, reports: results },
    };
  } catch (err) {
    console.error('Daily report error:', err);
    return { status: 500, body: { error: 'Internal error: ' + err.message } };
  }
}
