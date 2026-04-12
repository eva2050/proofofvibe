// POST /api/auth/google — Handle Google auth using D1 binding

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest(context) {
  const DB = context.env.DB;

  try {
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (context.request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // Auto-create tables if not exist
    await DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password_hash TEXT,
      name TEXT,
      created_at TEXT,
      updated_at TEXT
    )`).run();
    await DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT,
      provider_id TEXT,
      access_token TEXT,
      expires_at TEXT
    )`).run();

    const body = await context.request.json();
    const { idToken, email, name, sub } = body;

    if (!email) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }

    // Upsert user
    const existing = await DB.prepare('SELECT rowid as id FROM users WHERE email = ?').bind(email).first();
    let userId;

    if (existing) {
      userId = existing.id;
      const now = new Date().toISOString();
      await DB.prepare('UPDATE users SET updated_at = ? WHERE rowid = ?').bind(now, userId).run();
    } else {
      const now = new Date().toISOString();
      const result = await DB.prepare(
        'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(email, null, name || null, now, now).run();
      userId = result.meta.last_row_id;
    }

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(
      'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, 'google', sub, token, expiresAt).run();

    return jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return jsonResponse({ error: 'Internal error: ' + err.message }, 500);
  }
}
