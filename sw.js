/* ========================================
   Service Worker - 照片管理系统
   缓存静态资源，支持离线访问
   ======================================== */

const CACHE_NAME = 'photo-manager-v3';

// 需要预缓存的静态资源
const STATIC_ASSETS = [
    './index-mobile.html',
    './mobile.css',
    './mobile-app.js',
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
    // 立即激活，不等待旧 SW 失效
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
    // 通知所有页面刷新以使用新缓存
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
    });
});

// 请求拦截：区分静态资源与动态请求
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Supabase API / 存储请求 / CDN：直接走网络，不缓存
    if (url.hostname.includes('supabase') || url.hostname.includes('jsdelivr')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 非 GET 请求：直接走网络
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // GET 请求：优先从缓存读取，缓存未命中时请求网络并写入缓存
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    // 只缓存成功的响应
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // 离线且缓存未命中时，尝试返回移动端主页作为兜底
                    if (event.request.destination === 'document') {
                        return caches.match('./index-mobile.html').then((fallback) => {
                            return fallback || new Response('暂无网络，请检查网络连接后重试', {
                                status: 503,
                                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                            });
                        });
                    }
                    return new Response('', { status: 503 });
                });
        })
    );
});
