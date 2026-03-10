// POS OAuth bounce page — receives code from Square/Clover/Shopify and
// redirects to the balanceiq:// deep link so Electron can handle the callback.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // posType passed via state param
  const posType = state || 'square';

  if (code) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': `balanceiq://oauth/${posType}?code=${encodeURIComponent(code)}` },
    });
  }

  // No code — show a simple error page
  const error = url.searchParams.get('error_description') || url.searchParams.get('error') || 'Unknown error';
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BalanceIQ</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0c0e14;color:#e8e8ec;}
    .box{text-align:center;}.logo{font-size:24px;font-weight:800;background:linear-gradient(135deg,#f97316,#ea580c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:12px;}
    p{color:#9ca3af;}</style></head>
    <body><div class="box"><div class="logo">BalanceIQ</div><p>Authorization failed: ${error}</p><p>You can close this tab.</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
});
