// GET /api/auth/google/callback — Implicit flow callback
// Returns HTML that extracts token from URL fragment and sends to parent window

export async function onRequest(context) {
  const origin = new URL(context.request.url).origin;
  
  const html = `<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body>
<script>
  (function() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const error = params.get('error');
    
    if (error) {
      if (window.opener) {
        window.opener.postMessage({ type: 'google_auth_error', error: error }, '${origin}');
      }
    } else if (accessToken) {
      if (window.opener) {
        window.opener.postMessage({ type: 'google_auth_success', access_token: accessToken }, '${origin}');
      }
    }
    window.close();
    
    // Fallback if window.close() doesn't work
    setTimeout(function() {
      document.body.innerHTML = '<p style="text-align:center;margin-top:40px;font-family:sans-serif;">Login complete! You can close this window.</p>';
    }, 1000);
  })();
</script>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
