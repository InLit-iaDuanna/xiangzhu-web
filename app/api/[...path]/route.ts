async function proxy(request: Request) {
  const base = process.env.BUSINESS_API_URL;
  if (!base)
    return Response.json(
      { error: '业务服务未连接：请配置 BUSINESS_API_URL' },
      { status: 503 },
    );
  const incoming = new URL(request.url),
    target = new URL(incoming.pathname + incoming.search, base);
  const headers = new Headers();
  for (const key of ['content-type', 'accept', 'origin']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const cookie = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter(
      (v) =>
        v.startsWith('better-auth.') || v.startsWith('__Secure-better-auth.'),
    )
    .join('; ');
  if (cookie) headers.set('cookie', cookie);
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: 'manual',
    });
    const outgoing = new Headers(response.headers);
    outgoing.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { error: '业务服务暂时无法连接，请保留本地草稿' },
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
  proxy as OPTIONS,
};
