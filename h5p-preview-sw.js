'use strict';

const PREVIEW_PREFIX = '/__h5p_preview__/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREVIEW_PREFIX)) return;
  event.respondWith(servePreviewFile(event.request));
});

async function servePreviewFile(request) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {status: 405});
  }

  const lookup = new Request(request.url, {method: 'GET'});
  const cached = await caches.match(lookup, {ignoreSearch: true});
  if (!cached) {
    return new Response('H5P preview file not found', {
      status: 404,
      headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}
    });
  }

  const baseHeaders = new Headers(cached.headers);
  baseHeaders.set('Cache-Control', 'no-store');
  baseHeaders.set('Accept-Ranges', 'bytes');
  baseHeaders.set('X-Content-Type-Options', 'nosniff');

  if (request.method === 'HEAD') {
    return new Response(null, {status: 200, headers: baseHeaders});
  }

  const range = request.headers.get('range');
  if (!range) {
    return new Response(cached.body, {status: cached.status || 200, headers: baseHeaders});
  }

  const buffer = await cached.arrayBuffer();
  const size = buffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || size === 0) {
    return new Response(null, {
      status: 416,
      headers: {'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store'}
    });
  }

  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Math.min(size, Number(match[2]));
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = match[1] === '' ? 0 : Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return new Response(null, {
      status: 416,
      headers: {'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store'}
    });
  }

  end = Math.min(end, size - 1);
  const chunk = buffer.slice(start, end + 1);
  baseHeaders.set('Content-Range', `bytes ${start}-${end}/${size}`);
  baseHeaders.set('Content-Length', String(chunk.byteLength));

  return new Response(chunk, {status: 206, headers: baseHeaders});
}
