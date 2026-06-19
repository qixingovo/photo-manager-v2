/* ========================================
   Service Worker - 照片管理系统 v6
   离线模式：页面壳 → 缓存第一
            API → 网络优先 + 缓存兜底
            照片 → 缓存优先
   ======================================== */

const CACHE_NAME = 'photo-manager-v6';
const API_CACHE = 'photo-api-v1';
const IMG_CACHE = 'photo-images-v1';

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
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => ![CACHE_NAME, API_CACHE, IMG_CACHE].includes(key))
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
    });
});

// ---- 请求拦截 ----
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 只有同源请求才处理
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // ---- API 请求：网络优先，缓存兜底（离线可浏览已加载的数据） ----
    if (path.startsWith('/rest/') || path.startsWith('/auth/')) {
        event.respondWith(networkFirst(event.request, API_CACHE));
        return;
    }

    // ---- 照片文件：缓存优先（省流量 + 离线可看） ----
    if (path.startsWith('/storage/')) {
        event.respondWith(cacheFirst(event.request, IMG_CACHE));
        return;
    }

    // ---- 非 GET 请求：只走网络 ----
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // ---- HTML 文档：网络优先（确保最新） ----
    if (event.request.destination === 'document') {
        event.respondWith(networkFirst(event.request, CACHE_NAME));
        return;
    }

    // ---- JS/CSS/字体等静态资源：缓存优先 ----
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

// ========== 缓存策略 ==========

// 网络优先：先网络，失败则读缓存
function networkFirst(request, cacheName) {
    return fetch(request)
        .then((response) => {
            if (response.ok && response.status !== 206) {
                const clone = response.clone();
                caches.open(cacheName).then((cache) => cache.put(request, clone));
            }
            return response;
        })
        .catch(() => caches.match(request));
}

// 缓存优先：先缓存，无缓存则网络 + 缓存
function cacheFirst(request, cacheName) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
            if (response.ok && response.status !== 206) {
                const clone = response.clone();
                caches.open(cacheName).then((cache) => cache.put(request, clone));
            }
            return response;
        });
    });
}

// ========== 缓存清理：限制数量 -==========
// 照片缓存最多 200 张，超出删最旧的
async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        const toDelete = keys.slice(0, keys.length - maxItems);
        await Promise.all(toDelete.map(k => cache.delete(k)));
    }
}
