// Shared report handlers for Cloudflare Pages Functions

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'MARKET OUTLOOK',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  read_time INTEGER NOT NULL DEFAULT 5,
  lang TEXT NOT NULL DEFAULT 'zh',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

// GET /api/reports
export async function handleGetReports(context) {
  const DB = context.env.DB;
  await DB.prepare(CREATE_TABLE_SQL).run();

  // Migrate: add content column if missing
  try { await DB.prepare('ALTER TABLE reports ADD COLUMN content TEXT NOT NULL DEFAULT \'\'').run(); } catch(e) {}

  const url = new URL(context.request.url);
  const lang = url.searchParams.get('lang') || '';
  const category = url.searchParams.get('category') || '';
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = 'SELECT rowid as id, * FROM reports WHERE 1=1';
  const params = [];
  if (lang) { query += ' AND lang = ?'; params.push(lang); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await DB.prepare(query).bind(...params).all();
  return withCors(jsonResponse({ success: true, data: result.results || [] }), context.request);
}

// POST /api/reports
export async function handleCreateReport(context) {
  const DB = context.env.DB;
  await DB.prepare(CREATE_TABLE_SQL).run();

  const body = await readBody(context.request);
  const { category, title, description, content, image_url, date, read_time, lang } = body;

  if (!title) {
    return withCors(jsonResponse({ error: 'title is required' }, 400), context.request);
  }

  const now = new Date().toISOString();
  const result = await DB.prepare(
    'INSERT INTO reports (category, title, description, content, image_url, date, read_time, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    category || 'MARKET OUTLOOK', title, description || '', content || '', image_url || '',
    date || now.split('T')[0], read_time || 5, lang || 'zh', now, now
  ).run();

  return withCors(jsonResponse({ success: true, id: result.meta.last_row_id }, 201), context.request);
}

// PUT /api/reports/:id
export async function handleUpdateReport(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return withCors(jsonResponse({ error: 'Invalid report ID' }, 400), context.request);
  }

  const existing = await DB.prepare('SELECT id FROM reports WHERE rowid = ?').bind(id).first();
  if (!existing) {
    return withCors(jsonResponse({ error: 'Report not found' }, 404), context.request);
  }

  const body = await readBody(context.request);
  const allowedFields = ['category', 'title', 'description', 'content', 'image_url', 'date', 'read_time', 'lang'];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return withCors(jsonResponse({ error: 'No valid fields to update' }, 400), context.request);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await DB.prepare(`UPDATE reports SET ${updates.join(', ')} WHERE rowid = ?`).bind(...values).run();

  return withCors(jsonResponse({ success: true, message: 'Report updated' }), context.request);
}

// DELETE /api/reports/:id
export async function handleDeleteReport(context) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const id = parseInt(url.pathname.split('/').pop(), 10);

  if (!id || isNaN(id)) {
    return withCors(jsonResponse({ error: 'Invalid report ID' }, 400), context.request);
  }

  const existing = await DB.prepare('SELECT id FROM reports WHERE rowid = ?').bind(id).first();
  if (!existing) {
    return withCors(jsonResponse({ error: 'Report not found' }, 404), context.request);
  }

  await DB.prepare('DELETE FROM reports WHERE rowid = ?').bind(id).run();

  return withCors(jsonResponse({ success: true, message: 'Report deleted' }), context.request);
}
