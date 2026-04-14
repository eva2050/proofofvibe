// POST /api/auth/signup — Email signup

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
    const { email, password, name } = body;

    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }

    // Check if user exists
    const existing = await DB.prepare('SELECT rowid FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return jsonResponse({ error: 'Email already registered' }, 409);
    }

    const now = new Date().toISOString();
    const result = await DB.prepare(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, password, name || null, now, now).run();
    const userId = result.meta.last_row_id;

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, 'email', null, token, expiresAt).run();

    return jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return jsonResponse({ error: 'Internal error: ' + err.message }, 500);
  }
}
