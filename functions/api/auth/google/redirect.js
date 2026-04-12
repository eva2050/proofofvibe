// GET /api/auth/google/redirect — Redirect to Google OAuth
// Uses implicit flow: Google returns id_token in URL fragment, frontend handles it

const GOOGLE_CLIENT_ID = '958185773795-8rv61j4ek3595adk5qas4bqjk0jm2o7o.apps.googleusercontent.com';

export async function onRequest(context) {
  const origin = new URL(context.request.url).origin;
  // Redirect back to frontend with a special param, frontend will handle Google login
  const frontendUrl = `${origin}/?google_login=1`;
  return Response.redirect(frontendUrl, 302);
}
