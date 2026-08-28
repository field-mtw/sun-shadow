const UPSTREAM =
  'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-08-19.0/buildings.pmtiles';

const PASS_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
] as const;

async function proxy(request: Request): Promise<Response> {
  const range = request.headers.get('range');
  const headers: HeadersInit = { Accept: '*/*' };
  if (range) headers.Range = range;

  const upstream = await fetch(UPSTREAM, {
    method: request.method,
    headers,
    cache: 'force-cache',
  });

  const out = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('Cache-Control', 'public, max-age=86400');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export function GET(request: Request) {
  return proxy(request);
}

export function HEAD(request: Request) {
  return proxy(request);
}
