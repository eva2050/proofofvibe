// GET /api/auth/google/redirect — Start OAuth2 redirect flow

const CF_ACCOUNT_ID = '6683cf8753f914c98020e7e03b543623';
const CF_DATABASE_ID = '1f70c071-3549-45aa-b4a1-db998ba0b8e3';
const CF_API_TOKEN = 'cfut_BvXmhFMquHRioW3LEwpabnQvcnabFBnODeHUfkvOee966569';
const GOOGLE_CLIENT_ID = '958185773795-8rv61j4ek3595adk5qas4bqjk0jm2o7o.apps.googleusercontent.com';

export async function onRequest(context) {
  const origin = context.request.headers.get('origin') || new URL(context.request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  return Response.redirect(authUrl, 302);
}
