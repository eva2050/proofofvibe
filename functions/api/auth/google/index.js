// POST /api/auth/google — Handle Google auth (called from frontend)

const CF_ACCOUNT_ID = '6683cf8753f914c98020e7e03b543623';
const CF_DATABASE_ID = '1f70c071-3549-45aa-b4a1-db998ba0b8e3';
const CF_API_TOKEN = 'cfut_7cL1qULjxEVJZsPsxnyh3zfCm6Ifuee2R0dEOtkob15cc55f';

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + CF_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) {
    console.error('D1 error:', JSON.stringify(data.errors));
    throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  }
  return data.result;
}

async function d1First(sql, params = []) {
  const results = await d1Query(sql, params);
  return results[0]?.results?.[0] || null;
}

async function d1Run(sql, params = []) {
  const results = await d1Query(sql, params);
  return results[0]?.meta || {};
}

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
    const { idToken, email: bodyEmail, name: bodyName, sub: bodySub } = body;

    if (!idToken) {
      return jsonResponse({ error: 'Google token is required' }, 400);
    }

    // Verify token with Google - try id_token first, then access_token
    let googleUser;
    try {
      // Try as id_token
      let res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (!res.ok) {
        // Try as access_token via userinfo
        res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + idToken },
        });
      }
      if (!res.ok) {
        console.error('Google token verification failed:', await res.text());
        return jsonResponse({ error: 'Invalid Google token' }, 401);
      }
      googleUser = await res.json();
    } catch (err) {
      console.error('Google verify error:', err.message);
      return jsonResponse({ error: 'Failed to verify Google token: ' + err.message }, 500);
    }

    const email = googleUser.email || bodyEmail;
    const name = googleUser.name || bodyName;
    const googleId = googleUser.sub || bodySub;

    if (!email) {
      return jsonResponse({ error: 'Google token does not contain an email' }, 400);
    }

    // Upsert user
    const existing = await d1First('SELECT id FROM users WHERE email = ?', [email]);
    let userId;

    if (existing) {
      userId = existing.id;
      const now = new Date().toISOString();
      await d1Run('UPDATE users SET updated_at = ? WHERE id = ?', [now, userId]);
    } else {
      const now = new Date().toISOString();
      const result = await d1Run(
        'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [email, null, name || null, now, now]
      );
      userId = result.last_row_id;
    }

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await d1Run(
      'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [userId, 'google', googleId, token, expiresAt]
    );

    return jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return jsonResponse({ error: 'Internal error: ' + err.message }, 500);
  }
}
