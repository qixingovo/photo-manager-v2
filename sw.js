/* ========================================
   Service Worker - 照片管理系统 v7
   页面壳与静态资源：网络优先，离线回退
   配置、API、照片及带身份的请求：仅网络，不缓存
   ======================================== */

const CACHE_NAME = 'photo-manager-v7';

// 预缓存壳资源
const SHELL_ASSETS = [
    './index.html',
    './index-mobile.html',
    './share.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// ---- 安装：预缓存壳 ----
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(SHELL_ASSETS).catch(() => {});
        })
    );
    self.skipWaiting();
});

// ---- 激活：清理旧缓存，通知客户端 ----
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys
                .filter(key => /^photo-(manager|api|images)-/.test(key) && key !== CACHE_NAME)
                .map(key => caches.delete(key)));
            await self.clients.claim();
            const clients = await self.clients.matchAll();
            clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        })()
    );
});

// ---- 请求拦截 ----
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 只有同源请求才处理
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // Runtime config must bypass both Cache Storage and the HTTP cache.
    if (path === '/config.js' || path === '/src/core/config.js') {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }

    // Private responses must never be reused between users or after logout.
    // Check methods before any cache access (Cache.put only supports GET).
    if (event.request.method !== 'GET' || event.request.headers.has('Authorization') ||
        path.startsWith('/rest/') || path.startsWith('/auth/') || path.startsWith('/storage/')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }

    // ---- HTML 文档：网络优先（确保最新） ----
    if (event.request.destination === 'document') {
        event.respondWith(networkFirst(event.request, CACHE_NAME));
        return;
    }

    // Unversioned ES module dependencies must also receive security updates.
    event.respondWith(networkFirst(event.request, CACHE_NAME));
});

// ========== 缓存策略 ==========

// 网络优先：先网络，失败则读缓存
async function networkFirst(request, cacheName) {
    let response;
    try {
        // Revalidate even resources served with immutable headers in old releases.
        response = await fetch(request, { cache: 'no-cache' });
    } catch (err) {
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
    if (response.ok && response.status !== 206 &&
        !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
        try {
            const cache = await caches.open(cacheName);
            await cache.put(request, response.clone());
        } catch (err) { /* A full/disabled cache must not break a network response. */ }
    }
    return response;
}
