/* ========================================
   Service Worker - 照片管理系统 v5
   缓存静态资源，支持离线访问
   ======================================== */

const CACHE_NAME = 'photo-manager-v5';

// 需要预缓存的静态资源
const STATIC_ASSETS = [
    './index.html',
    './index-mobile.html',
    './share.html',
    './style.css',
    './mobile.css',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// 安装阶段：预缓存静态资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// 激活阶段：清理旧版本缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
    });
});

// 请求拦截
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API 请求（/rest/, /auth/, /storage/）：直接走网络，不缓存
    if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/storage/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // CDN：直接走网络，不缓存
    if (url.hostname.includes('jsdelivr') || url.hostname.includes('unpkg')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 非 GET 请求：直接走网络
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // HTML 文件：网络优先（确保总是拿到最新版本）
    if (event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 其他静态资源：缓存优先，网络更新
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
            return cached || fetchPromise;
        })
    );
});
