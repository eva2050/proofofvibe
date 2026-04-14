// POST /api/auth/login — Email login

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

    const body = await context.request.json();
    const { email, password } = body;

    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }

    const user = await DB.prepare(
      'SELECT rowid as id, email, name, password_hash FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    // Simple password check (in production, use bcrypt)
    if (user.password_hash && user.password_hash !== password) {
      return jsonResponse({ error: 'Invalid password' }, 401);
    }

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.id, 'email', null, token, expiresAt).run();

    return jsonResponse({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return jsonResponse({ error: 'Internal error: ' + err.message }, 500);
  }
}
