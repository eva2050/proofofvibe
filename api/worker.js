// =============================================================================
// Cloudflare Worker API Backend — ProofOfVibe
// D1 Binding: DB | Database ID: 1f70c071-3549-45aa-b4a1-db998ba0b8e3
// =============================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      // ── Auth routes (public) ──────────────────────────────────────────────
      if (path === '/api/auth/signup' && method === 'POST') {
        return await handleSignup(request, env);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env);
      }
      if (path === '/api/auth/google' && method === 'POST') {
        return await handleGoogleAuth(request, env);
      }
      if (path === '/api/auth/github' && method === 'POST') {
        return await handleGithubAuth(request, env);
      }

      // ── Auth routes (protected) ───────────────────────────────────────────
      if (path === '/api/auth/me' && method === 'GET') {
        return await withAuth(request, env, handleGetMe);
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        return await withAuth(request, env, handleLogout);
      }

      // ── User profile routes (protected) ───────────────────────────────────
      if (path === '/api/user/profile' && method === 'GET') {
        return await withAuth(request, env, handleGetProfile);
      }
      if (path === '/api/user/profile' && method === 'PUT') {
        return await withAuth(request, env, handleUpdateProfile);
      }

      // ── Trade log routes (protected) ──────────────────────────────────────
      if (path === '/api/trade-logs' && method === 'POST') {
        return await withAuth(request, env, handleCreateTradeLog);
      }
      if (path === '/api/trade-logs' && method === 'GET') {
        return await withAuth(request, env, handleGetTradeLogs);
      }
      if (path.match(/^\/api\/trade-logs\/\d+$/) && method === 'DELETE') {
        return await withAuth(request, env, handleDeleteTradeLog);
      }

      // ── Bookmark routes (protected) ───────────────────────────────────────
      if (path === '/api/bookmarks' && method === 'POST') {
        return await withAuth(request, env, handleCreateBookmark);
      }
      if (path === '/api/bookmarks' && method === 'GET') {
        return await withAuth(request, env, handleGetBookmarks);
      }
      if (path.match(/^\/api\/bookmarks\/\d+$/) && method === 'DELETE') {
        return await withAuth(request, env, handleDeleteBookmark);
      }

      // ── 404 ───────────────────────────────────────────────────────────────
      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonResponse({ error: 'Internal server error', detail: err.message }, 500);
    }
  },
};

// =============================================================================
// CORS
// =============================================================================

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin') || '*';
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// =============================================================================
// Helpers
// =============================================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'vibe_salt_2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

function extractBearerToken(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// =============================================================================
// Auth middleware
// =============================================================================

async function withAuth(request, env, handler) {
  const token = extractBearerToken(request);
  if (!token) {
    return withCors(jsonResponse({ error: 'Missing authorization token' }, 401), request);
  }

  const session = await env.DB.prepare(
    'SELECT s.*, u.id as user_id, u.email, u.name, u.password_hash, u.birth_date, u.birth_time, u.birth_place, u.natal_chart, u.language, u.theme, u.created_at, u.updated_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.access_token = ? AND s.expires_at > datetime(\'now\')'
  )
    .bind(token)
    .first();

  if (!session) {
    return withCors(jsonResponse({ error: 'Invalid or expired token' }, 401), request);
  }

  const ctx = { user: session, token };
  const response = await handler(request, env, ctx);
  return withCors(response, request);
}

// =============================================================================
// Session helpers
// =============================================================================

async function createSession(env, userId) {
  const token = generateToken();
  // Session expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (user_id, provider, access_token, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(userId, 'email', token, expiresAt)
    .run();

  return token;
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// =============================================================================
// POST /api/auth/signup
// =============================================================================

async function handleSignup(request, env) {
  const body = await readBody(request);
  const { email, password, name } = body;

  if (!email || !password) {
    return withCors(jsonResponse({ error: 'Email and password are required' }, 400), request);
  }

  if (password.length < 6) {
    return withCors(jsonResponse({ error: 'Password must be at least 6 characters' }, 400), request);
  }

  // Check if user already exists
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return withCors(jsonResponse({ error: 'Email already registered' }, 409), request);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(email, passwordHash, name || null, now, now)
    .run();

  const userId = result.meta.last_row_id;

  const token = await createSession(env, userId);

  return withCors(
    jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    }),
    request
  );
}

// =============================================================================
// POST /api/auth/login
// =============================================================================

async function handleLogin(request, env) {
  const body = await readBody(request);
  const { email, password } = body;

  if (!email || !password) {
    return withCors(jsonResponse({ error: 'Email and password are required' }, 400), request);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    return withCors(jsonResponse({ error: 'Invalid email or password' }, 401), request);
  }

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.password_hash) {
    return withCors(jsonResponse({ error: 'Invalid email or password' }, 401), request);
  }

  const token = await createSession(env, user.id);

  return withCors(
    jsonResponse({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    }),
    request
  );
}

// =============================================================================
// POST /api/auth/google
// =============================================================================

async function handleGoogleAuth(request, env) {
  const body = await readBody(request);
  const { idToken } = body;

  if (!idToken) {
    return withCors(jsonResponse({ error: 'Google ID token is required' }, 400), request);
  }

  // Verify token with Google
  let googleUser;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) {
      const errText = await res.text();
      console.error('Google token verification failed:', errText);
      return withCors(jsonResponse({ error: 'Invalid Google token' }, 401), request);
    }
    googleUser = await res.json();
  } catch (err) {
    console.error('Google auth error:', err);
    return withCors(jsonResponse({ error: 'Failed to verify Google token' }, 500), request);
  }

  const { email, name, sub: googleId } = googleUser;
  if (!email) {
    return withCors(jsonResponse({ error: 'Google token does not contain an email' }, 400), request);
  }

  // Upsert user
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  let userId;

  if (existing) {
    userId = existing.id;
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE users SET updated_at = ? WHERE id = ?').bind(now, userId).run();
  } else {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(email, null, name || null, now, now)
      .run();
    userId = result.meta.last_row_id;
  }

  // Create or update session with provider info
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(userId, 'google', googleId, token, expiresAt)
    .run();

  return withCors(
    jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    }),
    request
  );
}

// =============================================================================
// POST /api/auth/github
// =============================================================================

async function handleGithubAuth(request, env) {
  const body = await readBody(request);
  const { code } = body;

  if (!code) {
    return withCors(jsonResponse({ error: 'GitHub authorization code is required' }, 400), request);
  }

  const clientId = env.GITHUB_CLIENT_ID || '';
  const clientSecret = env.GITHUB_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return withCors(
      jsonResponse({ error: 'GitHub OAuth is not configured on the server' }, 500),
      request
    );
  }

  // Exchange code for access token
  let accessToken;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      console.error('GitHub token exchange failed:', tokenData);
      return withCors(
        jsonResponse({ error: 'Failed to exchange GitHub code', detail: tokenData.error_description || tokenData.error }, 401),
        request
      );
    }
    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('GitHub token exchange error:', err);
    return withCors(jsonResponse({ error: 'Failed to contact GitHub' }, 500), request);
  }

  // Get user info from GitHub
  let githubUser;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!userRes.ok) {
      console.error('GitHub user fetch failed:', await userRes.text());
      return withCors(jsonResponse({ error: 'Failed to fetch GitHub user info' }, 401), request);
    }
    githubUser = await userRes.json();
  } catch (err) {
    console.error('GitHub user fetch error:', err);
    return withCors(jsonResponse({ error: 'Failed to contact GitHub API' }, 500), request);
  }

  const githubId = String(githubUser.id);
  const email = githubUser.email || `${githubUser.login}@github.placeholder`;
  const name = githubUser.name || githubUser.login;

  // Upsert user
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  let userId;

  if (existing) {
    userId = existing.id;
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE users SET updated_at = ? WHERE id = ?').bind(now, userId).run();
  } else {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(email, null, name, now, now)
      .run();
    userId = result.meta.last_row_id;
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(userId, 'github', githubId, token, expiresAt)
    .run();

  return withCors(
    jsonResponse({
      user: { id: userId, email, name },
      token,
    }),
    request
  );
}

// =============================================================================
// GET /api/auth/me  (protected)
// =============================================================================

async function handleGetMe(request, env, ctx) {
  return jsonResponse({ user: sanitizeUser(ctx.user) });
}

// =============================================================================
// POST /api/auth/logout  (protected)
// =============================================================================

async function handleLogout(request, env, ctx) {
  await env.DB.prepare('DELETE FROM sessions WHERE access_token = ?')
    .bind(ctx.token)
    .run();

  return jsonResponse({ message: 'Logged out successfully' });
}

// =============================================================================
// GET /api/user/profile  (protected)
// =============================================================================

async function handleGetProfile(request, env, ctx) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(ctx.user.user_id)
    .first();

  if (!user) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  return jsonResponse({ user: sanitizeUser(user) });
}

// =============================================================================
// PUT /api/user/profile  (protected)
// =============================================================================

async function handleUpdateProfile(request, env, ctx) {
  const body = await readBody(request);
  const allowedFields = ['name', 'birth_date', 'birth_time', 'birth_place', 'natal_chart', 'language', 'theme'];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, 400);
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(ctx.user.user_id);

  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  // Return updated user
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(ctx.user.user_id)
    .first();

  return jsonResponse({ user: sanitizeUser(user) });
}

// =============================================================================
// POST /api/trade-logs  (protected)
// =============================================================================

async function handleCreateTradeLog(request, env, ctx) {
  const body = await readBody(request);
  const { date, symbol, sentiment, notes, amount } = body;

  if (!date || !symbol) {
    return jsonResponse({ error: 'date and symbol are required' }, 400);
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO trade_logs (user_id, date, symbol, sentiment, notes, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(ctx.user.user_id, date, symbol, sentiment || null, notes || null, amount || null, now)
    .run();

  return jsonResponse({
    trade_log: {
      id: result.meta.last_row_id,
      user_id: ctx.user.user_id,
      date,
      symbol,
      sentiment: sentiment || null,
      notes: notes || null,
      amount: amount || null,
      created_at: now,
    },
  }, 201);
}

// =============================================================================
// GET /api/trade-logs  (protected)
// =============================================================================

async function handleGetTradeLogs(request, env, ctx) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM trade_logs WHERE user_id = ? ORDER BY date DESC, created_at DESC'
  )
    .bind(ctx.user.user_id)
    .all();

  return jsonResponse({ trade_logs: results || [] });
}

// =============================================================================
// DELETE /api/trade-logs/:id  (protected)
// =============================================================================

async function handleDeleteTradeLog(request, env, ctx) {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return jsonResponse({ error: 'Invalid trade log ID' }, 400);
  }

  // Ensure the trade log belongs to the current user
  const existing = await env.DB.prepare('SELECT id FROM trade_logs WHERE id = ? AND user_id = ?')
    .bind(id, ctx.user.user_id)
    .first();

  if (!existing) {
    return jsonResponse({ error: 'Trade log not found' }, 404);
  }

  await env.DB.prepare('DELETE FROM trade_logs WHERE id = ? AND user_id = ?')
    .bind(id, ctx.user.user_id)
    .run();

  return jsonResponse({ message: 'Trade log deleted' });
}

// =============================================================================
// POST /api/bookmarks  (protected)
// =============================================================================

async function handleCreateBookmark(request, env, ctx) {
  const body = await readBody(request);
  const { entity_type, entity_name, entity_symbol, notes } = body;

  if (!entity_type || !entity_name) {
    return jsonResponse({ error: 'entity_type and entity_name are required' }, 400);
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO bookmarks (user_id, entity_type, entity_name, entity_symbol, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      ctx.user.user_id,
      entity_type,
      entity_name,
      entity_symbol || null,
      notes || null,
      now
    )
    .run();

  return jsonResponse({
    bookmark: {
      id: result.meta.last_row_id,
      user_id: ctx.user.user_id,
      entity_type,
      entity_name,
      entity_symbol: entity_symbol || null,
      notes: notes || null,
      created_at: now,
    },
  }, 201);
}

// =============================================================================
// GET /api/bookmarks  (protected)
// =============================================================================

async function handleGetBookmarks(request, env, ctx) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(ctx.user.user_id)
    .all();

  return jsonResponse({ bookmarks: results || [] });
}

// =============================================================================
// DELETE /api/bookmarks/:id  (protected)
// =============================================================================

async function handleDeleteBookmark(request, env, ctx) {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return jsonResponse({ error: 'Invalid bookmark ID' }, 400);
  }

  // Ensure the bookmark belongs to the current user
  const existing = await env.DB.prepare('SELECT id FROM bookmarks WHERE id = ? AND user_id = ?')
    .bind(id, ctx.user.user_id)
    .first();

  if (!existing) {
    return jsonResponse({ error: 'Bookmark not found' }, 404);
  }

  await env.DB.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
    .bind(id, ctx.user.user_id)
    .run();

  return jsonResponse({ message: 'Bookmark deleted' });
}
