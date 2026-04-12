// =============================================================================
// Cloudflare Worker API Backend — ProofOfVibe
// D1 HTTP API (no binding required)
// Database ID: 1f70c071-3549-45aa-b4a1-db998ba0b8e3
// =============================================================================

const CF_ACCOUNT_ID = '6683cf8753f914c98020e7e03b543623';
const CF_DATABASE_ID = '1f70c071-3549-45aa-b4a1-db998ba0b8e3';
const CF_API_TOKEN = 'cfut_7cL1qULjxEVJZsPsxnyh3zfCm6Ifuee2R0dEOtkob15cc55f';

let env = {};

export async function onRequest(context) {
  return handleRequest(context.request);
}

// =============================================================================
// D1 HTTP API helpers
// =============================================================================

async function d1Query(sql, params = []) {
  const token = CF_API_TOKEN;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  return data.result; // array of result objects
}

async function d1First(sql, params = []) {
  const results = await d1Query(sql, params);
  return results[0]?.results?.[0] || null;
}

async function d1All(sql, params = []) {
  const results = await d1Query(sql, params);
  return results[0]?.results || [];
}

async function d1Run(sql, params = []) {
  const results = await d1Query(sql, params);
  return results[0]?.meta || {};
}

// =============================================================================
// Request handler
// =============================================================================

async function handleRequest(request) {
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
      return await handleSignup(request);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      return await handleLogin(request);
    }
    // Google auth routes are handled by functions/api/auth/google/ directory
    if (path === '/api/auth/github' && method === 'POST') {
      return await handleGithubAuth(request);
    }

    // ── Auth routes (protected) ───────────────────────────────────────────
    if (path === '/api/auth/me' && method === 'GET') {
      return await withAuth(request, handleGetMe);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return await withAuth(request, handleLogout);
    }

    // ── User profile routes (protected) ───────────────────────────────────
    if (path === '/api/user/profile' && method === 'GET') {
      return await withAuth(request, handleGetProfile);
    }
    if (path === '/api/user/profile' && method === 'PUT') {
      return await withAuth(request, handleUpdateProfile);
    }

    // ── Trade log routes (protected) ──────────────────────────────────────
    if (path === '/api/trade-logs' && method === 'POST') {
      return await withAuth(request, handleCreateTradeLog);
    }
    if (path === '/api/trade-logs' && method === 'GET') {
      return await withAuth(request, handleGetTradeLogs);
    }
    if (path.match(/^\/api\/trade-logs\/\d+$/) && method === 'DELETE') {
      return await withAuth(request, handleDeleteTradeLog);
    }

    // ── Bookmark routes (protected) ───────────────────────────────────────
    if (path === '/api/bookmarks' && method === 'POST') {
      return await withAuth(request, handleCreateBookmark);
    }
    if (path === '/api/bookmarks' && method === 'GET') {
      return await withAuth(request, handleGetBookmarks);
    }
    if (path.match(/^\/api\/bookmarks\/\d+$/) && method === 'DELETE') {
      return await withAuth(request, handleDeleteBookmark);
    }

    // ── 404 ───────────────────────────────────────────────────────────────
    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error', detail: err.message }, 500);
  }
}

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

async function withAuth(request, handler) {
  const token = extractBearerToken(request);
  if (!token) {
    return withCors(jsonResponse({ error: 'Missing authorization token' }, 401), request);
  }

  const session = await d1First(
    `SELECT s.*, u.id as user_id, u.email, u.name, u.password_hash, u.birth_date,
            u.birth_time, u.birth_place, u.natal_chart, u.language, u.theme,
            u.created_at, u.updated_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.access_token = ? AND s.expires_at > datetime('now')`,
    [token]
  );

  if (!session) {
    return withCors(jsonResponse({ error: 'Invalid or expired token' }, 401), request);
  }

  const ctx = { user: session, token };
  const response = await handler(request, ctx);
  return withCors(response, request);
}

// =============================================================================
// Session helpers
// =============================================================================

async function createSession(userId) {
  const token = generateToken();
  // Session expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await d1Run(
    'INSERT INTO sessions (user_id, provider, access_token, expires_at) VALUES (?, ?, ?, ?)',
    [userId, 'email', token, expiresAt]
  );

  return token;
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// =============================================================================
// POST /api/auth/signup
// =============================================================================

async function handleSignup(request) {
  const body = await readBody(request);
  const { email, password, name } = body;

  if (!email || !password) {
    return withCors(jsonResponse({ error: 'Email and password are required' }, 400), request);
  }

  if (password.length < 6) {
    return withCors(jsonResponse({ error: 'Password must be at least 6 characters' }, 400), request);
  }

  // Check if user already exists
  const existing = await d1First('SELECT rowid as id FROM users WHERE email = ?', [email]);
  if (existing) {
    return withCors(jsonResponse({ error: 'Email already registered' }, 409), request);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const result = await d1Run(
    'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [email, passwordHash, name || null, now, now]
  );

  const userId = result.last_row_id;

  const token = await createSession(userId);

  return withCors(
    jsonResponse({
      user: { id: userId, email, name: name || null },
      token,
    }),
    request
  );
}

// =============================================================================
// GET /api/auth/google/redirect — Start OAuth2 redirect flow
// =============================================================================

async function handleGoogleRedirect(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  
  const params = new URLSearchParams({
    client_id: '958185773795-8rv61j4ek3595adk5qas4bqjk0jm2o7o.apps.googleusercontent.com',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  return Response.redirect(authUrl, 302);
}

// =============================================================================
// GET /api/auth/google/callback — Handle OAuth2 callback
// =============================================================================

async function handleGoogleCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  
  if (error) {
    return Response.redirect(`${url.origin}/?auth_error=${error}`, 302);
  }
  
  if (!code) {
    return Response.redirect(`${url.origin}/?auth_error=no_code`, 302);
  }
  
  // Exchange code for tokens
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  
  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: '958185773795-8rv61j4ek3595adk5qas4bqjk0jm2o7o.apps.googleusercontent.com',
        client_secret: '', // Public client, no secret needed for GIS
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    return Response.redirect(`${origin}/?auth_error=token_exchange_failed`, 302);
  }
  
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Token exchange failed:', errText);
    return Response.redirect(`${origin}/?auth_error=token_exchange_failed`, 302);
  }
  
  const tokenData = await tokenRes.json();
  const idToken = tokenData.id_token;
  
  // Get user info from id_token
  let googleUser;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) {
      return Response.redirect(`${origin}/?auth_error=invalid_token`, 302);
    }
    googleUser = await res.json();
  } catch (err) {
    return Response.redirect(`${origin}/?auth_error=token_verify_failed`, 302);
  }
  
  const email = googleUser.email;
  const name = googleUser.name;
  const googleId = googleUser.sub;
  
  if (!email) {
    return Response.redirect(`${origin}/?auth_error=no_email`, 302);
  }
  
  // Upsert user
  const existing = await d1First('SELECT rowid as id FROM users WHERE email = ?', [email]);
  let userId;
  
  if (existing) {
    userId = existing.id;
    const now = new Date().toISOString();
    await d1Run('UPDATE users SET updated_at = ? WHERE rowid = ?', [now, userId]);
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
  
  // Redirect back to frontend with token
  return Response.redirect(`${origin}/?auth_token=${token}&user_id=${userId}&user_email=${encodeURIComponent(email)}&user_name=${encodeURIComponent(name || '')}`, 302);
}

// =============================================================================
// POST /api/auth/login
// =============================================================================

async function handleLogin(request) {
  const body = await readBody(request);
  const { email, password } = body;

  if (!email || !password) {
    return withCors(jsonResponse({ error: 'Email and password are required' }, 400), request);
  }

  const user = await d1First('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    return withCors(jsonResponse({ error: 'Invalid email or password' }, 401), request);
  }

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.password_hash) {
    return withCors(jsonResponse({ error: 'Invalid email or password' }, 401), request);
  }

  const token = await createSession(user.id);

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

async function handleGoogleAuth(request) {
  const body = await readBody(request);
  const { idToken, email: bodyEmail, name: bodyName, sub: bodySub } = body;

  if (!idToken) {
    return withCors(jsonResponse({ error: 'Google token is required' }, 400), request);
  }

  // Verify token with Google - try both id_token and access_token
  let googleUser;
  try {
    // First try id_token verification
    let res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) {
      // If id_token fails, try as access_token via userinfo endpoint
      res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': 'Bearer ' + idToken }
      });
    }
    if (!res.ok) {
      return withCors(jsonResponse({ error: 'Invalid Google token' }, 401), request);
    }
    googleUser = await res.json();
  } catch (err) {
    console.error('Google auth error:', err);
    return withCors(jsonResponse({ error: 'Failed to verify Google token' }, 500), request);
  }

  const email = googleUser.email || bodyEmail;
  const name = googleUser.name || bodyName;
  const googleId = googleUser.sub || bodySub;
  if (!email) {
    return withCors(jsonResponse({ error: 'Google token does not contain an email' }, 400), request);
  }

  // Upsert user
  const existing = await d1First('SELECT rowid as id FROM users WHERE email = ?', [email]);
  let userId;

  if (existing) {
    userId = existing.id;
    const now = new Date().toISOString();
    await d1Run('UPDATE users SET updated_at = ? WHERE rowid = ?', [now, userId]);
  } else {
    const now = new Date().toISOString();
    const result = await d1Run(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [email, null, name || null, now, now]
    );
    userId = result.last_row_id;
  }

  // Create or update session with provider info
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await d1Run(
    'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, 'google', googleId, token, expiresAt]
  );

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

async function handleGithubAuth(request) {
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
  const existing = await d1First('SELECT rowid as id FROM users WHERE email = ?', [email]);
  let userId;

  if (existing) {
    userId = existing.id;
    const now = new Date().toISOString();
    await d1Run('UPDATE users SET updated_at = ? WHERE rowid = ?', [now, userId]);
  } else {
    const now = new Date().toISOString();
    const result = await d1Run(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [email, null, name, now, now]
    );
    userId = result.last_row_id;
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await d1Run(
    'INSERT INTO sessions (user_id, provider, provider_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, 'github', githubId, token, expiresAt]
  );

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

async function handleGetMe(request, ctx) {
  return jsonResponse({ user: sanitizeUser(ctx.user) });
}

// =============================================================================
// POST /api/auth/logout  (protected)
// =============================================================================

async function handleLogout(request, ctx) {
  await d1Run('DELETE FROM sessions WHERE access_token = ?', [ctx.token]);

  return jsonResponse({ message: 'Logged out successfully' });
}

// =============================================================================
// GET /api/user/profile  (protected)
// =============================================================================

async function handleGetProfile(request, ctx) {
  const user = await d1First('SELECT * FROM users WHERE rowid = ?', [ctx.user.user_id]);

  if (!user) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  return jsonResponse({ user: sanitizeUser(user) });
}

// =============================================================================
// PUT /api/user/profile  (protected)
// =============================================================================

async function handleUpdateProfile(request, ctx) {
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

  await d1Run(`UPDATE users SET ${updates.join(', ')} WHERE rowid = ?`, values);

  // Return updated user
  const user = await d1First('SELECT * FROM users WHERE rowid = ?', [ctx.user.user_id]);

  return jsonResponse({ user: sanitizeUser(user) });
}

// =============================================================================
// POST /api/trade-logs  (protected)
// =============================================================================

async function handleCreateTradeLog(request, ctx) {
  const body = await readBody(request);
  const { date, symbol, sentiment, notes, amount } = body;

  if (!date || !symbol) {
    return jsonResponse({ error: 'date and symbol are required' }, 400);
  }

  const now = new Date().toISOString();
  const result = await d1Run(
    'INSERT INTO trade_logs (user_id, date, symbol, sentiment, notes, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ctx.user.user_id, date, symbol, sentiment || null, notes || null, amount || null, now]
  );

  return jsonResponse({
    trade_log: {
      id: result.last_row_id,
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

async function handleGetTradeLogs(request, ctx) {
  const results = await d1All(
    'SELECT * FROM trade_logs WHERE user_id = ? ORDER BY date DESC, created_at DESC',
    [ctx.user.user_id]
  );

  return jsonResponse({ trade_logs: results || [] });
}

// =============================================================================
// DELETE /api/trade-logs/:id  (protected)
// =============================================================================

async function handleDeleteTradeLog(request, ctx) {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return jsonResponse({ error: 'Invalid trade log ID' }, 400);
  }

  // Ensure the trade log belongs to the current user
  const existing = await d1First(
    'SELECT id FROM trade_logs WHERE rowid = ? AND user_id = ?',
    [id, ctx.user.user_id]
  );

  if (!existing) {
    return jsonResponse({ error: 'Trade log not found' }, 404);
  }

  await d1Run('DELETE FROM trade_logs WHERE rowid = ? AND user_id = ?', [id, ctx.user.user_id]);

  return jsonResponse({ message: 'Trade log deleted' });
}

// =============================================================================
// POST /api/bookmarks  (protected)
// =============================================================================

async function handleCreateBookmark(request, ctx) {
  const body = await readBody(request);
  const { entity_type, entity_name, entity_symbol, notes } = body;

  if (!entity_type || !entity_name) {
    return jsonResponse({ error: 'entity_type and entity_name are required' }, 400);
  }

  const now = new Date().toISOString();
  const result = await d1Run(
    'INSERT INTO bookmarks (user_id, entity_type, entity_name, entity_symbol, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [ctx.user.user_id, entity_type, entity_name, entity_symbol || null, notes || null, now]
  );

  return jsonResponse({
    bookmark: {
      id: result.last_row_id,
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

async function handleGetBookmarks(request, ctx) {
  const results = await d1All(
    'SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC',
    [ctx.user.user_id]
  );

  return jsonResponse({ bookmarks: results || [] });
}

// =============================================================================
// DELETE /api/bookmarks/:id  (protected)
// =============================================================================

async function handleDeleteBookmark(request, ctx) {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return jsonResponse({ error: 'Invalid bookmark ID' }, 400);
  }

  // Ensure the bookmark belongs to the current user
  const existing = await d1First(
    'SELECT id FROM bookmarks WHERE rowid = ? AND user_id = ?',
    [id, ctx.user.user_id]
  );

  if (!existing) {
    return jsonResponse({ error: 'Bookmark not found' }, 404);
  }

  await d1Run('DELETE FROM bookmarks WHERE rowid = ? AND user_id = ?', [id, ctx.user.user_id]);

  return jsonResponse({ message: 'Bookmark deleted' });
}
