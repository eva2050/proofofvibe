// /api/reports/:id — Single report CRUD handler

import { handleUpdateReport, handleDeleteReport } from './_reports_handlers.js';

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
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
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
