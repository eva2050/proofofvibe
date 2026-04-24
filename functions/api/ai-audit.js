// POST /api/ai-audit — Generate AI audit analysis for a trade log entry
// Uses OpenRouter API (OpenAI-compatible)

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await context.request.json();
    const { symbol, type, action, vibe, reason, tp, sl, entryPrice, exitPrice, rr, lang } = body;

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const OPENROUTER_API_KEY = context.env.OPENROUTER_API_KEY || '';
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const langMap = {
      zh: 'Chinese',
      en: 'English',
      es: 'Spanish',
      'zh-tw': 'Traditional Chinese',
      ja: 'Japanese',
      ko: 'Korean'
    };
    const responseLang = langMap[lang] || 'English';

    const prompt = `You are a witty trading audit analyst who blends financial analysis with astrological commentary. Analyze this trade entry and provide a concise 2-3 sentence audit in ${responseLang}.

Trade details:
- Symbol: ${symbol}
- Type: ${type || 'buy'}
- Action: ${action || 'buy'}
- Vibe/Fear-Greed: ${vibe || 50}/100
- Reason: ${reason || 'N/A'}
- Entry Price: ${entryPrice || 'N/A'}
- TP: ${tp || 'N/A'}
- SL: ${sl || 'N/A'}
- Exit Price: ${exitPrice || 'N/A'}
- R/R: ${rr || 'N/A'}

Style: Mix professional trading analysis with playful astrological references. Be concise (2-3 sentences max). Mention risk management if relevant. Do NOT use markdown formatting.`;

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          { role: 'system', content: 'You are a concise trading audit analyst with astrological flair. Keep responses to 2-3 sentences max. No markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('OpenRouter API error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await apiResponse.json();
    const auditText = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : '';

    return new Response(JSON.stringify({ audit: auditText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('AI audit error:', err);
    return new Response(JSON.stringify({ error: 'Internal error: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
