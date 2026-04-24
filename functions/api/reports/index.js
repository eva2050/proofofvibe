// /api/reports — Reports CRUD handler
// Delegates to the main index.js logic via shared helpers

import { handleGetReports, handleCreateReport, handleUpdateReport, handleDeleteReport } from './_reports_handlers.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const method = context.request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // GET /api/reports — list reports
  if (path === '/api/reports' && method === 'GET') {
    return await handleGetReports(context);
  }
  // POST /api/reports — create report
  if (path === '/api/reports' && method === 'POST') {
    return await handleCreateReport(context);
  }

  // PUT /api/reports/:id — update report
  if (path.match(/^\/api\/reports\/\d+$/) && method === 'PUT') {
    return await handleUpdateReport(context);
  }
  // DELETE /api/reports/:id — delete report
  if (path.match(/^\/api\/reports\/\d+$/) && method === 'DELETE') {
    return await handleDeleteReport(context);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
