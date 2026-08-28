const S3 = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

function parseTile(value: string): number | null {
  const n = Number.parseInt(value.replace(/\.png$/i, ''), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: zRaw, x: xRaw, y: yRaw } = await context.params;
  const z = parseTile(zRaw);
  const x = parseTile(xRaw);
  const y = parseTile(yRaw);
  if (z === null || x === null || y === null || z > 15) {
    return new Response('invalid tile', { status: 400 });
  }
  const limit = 2 ** z;
  if (x >= limit || y >= limit) {
    return new Response('out of range', { status: 400 });
  }

  const upstream = await fetch(`${S3}/${z}/${x}/${y}.png`, {
    headers: { Accept: 'image/png' },
    next: { revalidate: 60 * 60 * 24 * 14 },
  });
  if (!upstream.ok) {
    return new Response('tile missing', { status: upstream.status === 404 ? 404 : 502 });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
