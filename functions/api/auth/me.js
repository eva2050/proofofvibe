// GET /api/auth/me — Validate token and return user

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
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (context.request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'No token provided' }, 401);
    }

    const token = authHeader.slice(7);

    // Look up session
    const session = await DB.prepare(
      `SELECT s.*, u.email, u.name, u.rowid as user_id
       FROM sessions s
       JOIN users u ON u.rowid = s.user_id
       WHERE s.access_token = ? AND s.expires_at > datetime('now')`
    ).bind(token).first();

    if (!session) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    return jsonResponse({
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
      },
    });
  } catch (err) {
    console.error('Auth me error:', err);
    return jsonResponse({ error: 'Internal error: ' + err.message }, 500);
  }
}
