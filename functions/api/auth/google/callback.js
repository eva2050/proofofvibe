// GET /api/auth/google/callback — Handle OAuth2 callback

const CF_ACCOUNT_ID = '6683cf8753f914c98020e7e03b543623';
const CF_DATABASE_ID = '1f70c071-3549-45aa-b4a1-db998ba0b8e3';
const CF_API_TOKEN = 'cfut_BvXmhFMquHRioW3LEwpabnQvcnabFBnODeHUfkvOee966569';
const GOOGLE_CLIENT_ID = '958185773795-8rv61j4ek3595adk5qas4bqjk0jm2o7o.apps.googleusercontent.com';

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + CF_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 query failed');
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

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const origin = url.origin;
  
  if (error) {
    return Response.redirect(`${origin}/?auth_error=${error}`, 302);
  }
  
  if (!code) {
    return Response.redirect(`${origin}/?auth_error=no_code`, 302);
  }
  
  // Exchange code for tokens
  const redirectUri = `${origin}/api/auth/google/callback`;
  
  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: '',
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
  
  // Redirect back to frontend with token
  return Response.redirect(
    `${origin}/?auth_token=${token}&user_id=${userId}&user_email=${encodeURIComponent(email)}&user_name=${encodeURIComponent(name || '')}`,
    302
  );
}
