const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const origin = 'https://photo.example.test';

function worker() {
    const stores = new Map();
    const events = new Map();
    let offline = false;
    let networkBody = 'fresh';
    const key = req => typeof req === 'string' ? new URL(req, origin).href : req.url;
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async name => stores.delete(name),
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return { async match(req) { return store.get(key(req))?.clone(); },
                async put(req, response) { store.set(key(req), response.clone()); },
                async addAll() {} };
        },
        async match(req) {
            for (const store of stores.values()) {
                const response = store.get(key(req));
                if (response) return response.clone();
            }
        }
    };
    const context = vm.createContext({ URL, Request, Response, caches,
        fetch: async () => { if (offline) throw new Error('offline'); return new Response(networkBody); },
        self: { location: { origin }, skipWaiting() {},
            clients: { claim: async () => {}, matchAll: async () => [] },
            addEventListener: (name, fn) => events.set(name, fn) }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
    return { caches, async seed(name, url, body) {
        const cache = await caches.open(name);
        await cache.put(new Request(origin + url), new Response(body));
    }, async request(url, options) {
        let result;
        events.get('fetch')({ request: new Request(origin + url, options), respondWith(value) { result = value; } });
        return await result;
    }, async activate() {
        const pending = [];
        events.get('activate')({ waitUntil(value) { pending.push(value); } });
        await Promise.all(pending);
    }, set offline(value) { offline = value; }, set body(value) { networkBody = value; } };
}

test('config: old cached configuration is never reused, including offline', async () => {
    const sw = worker();
    await sw.seed('photo-manager-v6', '/config.js?v=2', 'stale configuration');
    assert.equal(await (await sw.request('/config.js?v=2')).text(), 'fresh');
    sw.offline = true;
    await assert.rejects(sw.request('/config.js?v=2'), /offline/);
});

test('config: each generated entry receives a new config URL on build', () => {
    const files = new Map();
    for (const name of ['index.html', 'index-mobile.html', 'share.html']) {
        files.set(path.join(root, name), fs.readFileSync(path.join(root, name), 'utf8'));
    }
    const before = new Map(files);
    const context = vm.createContext({ require(name) {
        if (name === 'path') return path;
        assert.equal(name, 'fs');
        return { existsSync: name => files.has(name), readFileSync: name => files.get(name),
            writeFileSync: (name, content) => files.set(name, content), mkdirSync() {} };
    }, __dirname: path.join(root, 'scripts'), console: { log() {} },
    process: { env: { SUPABASE_URL: 'auto', SUPABASE_ANON_KEY: 'test-public-key' } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'scripts/build-config.js'), 'utf8'), context);
    const urls = [];
    for (const name of ['index.html', 'index-mobile.html', 'share.html']) {
        const filename = path.join(root, name);
        const oldUrl = before.get(filename).match(/src="(config\.js[^\"]*)"/)[1];
        const newUrl = files.get(filename).match(/src="(config\.js[^\"]*)"/)[1];
        assert.notEqual(newUrl, oldUrl, name);
        urls.push(newUrl);
    }
    assert.equal(new Set(urls).size, 1);
    const configWindow = { location: { origin } };
    vm.runInNewContext(files.get(path.join(root, 'config.js')), { window: configWindow });
    assert.equal(configWindow.__APP_CONFIG__.SUPABASE_URL, origin);
    assert.equal(configWindow.__APP_CONFIG__.SUPABASE_STORAGE_URL, origin + '/storage/v1/object/public/photo/');
});

for (const url of ['/rest/v1/photos?select=*', '/auth/v1/user', '/storage/v1/object/public/photo/private.jpg']) {
    test('private data: never cache or restore ' + url, async () => {
        const sw = worker();
        const request = { headers: { Authorization: 'Bearer user-A' } };
        assert.equal(await (await sw.request(url, request)).text(), 'fresh');
        // Let legacy fire-and-forget writes finish, so the test detects them.
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(await sw.caches.match(new Request(origin + url)), undefined);
        sw.offline = true;
        await assert.rejects(sw.request(url, { headers: { Authorization: 'Bearer user-B' } }), /offline/);
    });
}

test('photos without Authorization and authenticated responses outside API routes are also not cached', async () => {
    for (const [url, options] of [
        ['/storage/v1/object/public/photo/private.jpg', {}],
        ['/private-export.json', { headers: { Authorization: 'Bearer user-A' } }],
        ['/storage/v1/object/photo/new.jpg', { method: 'POST', body: 'image' }]
    ]) {
        const sw = worker();
        assert.equal(await (await sw.request(url, options)).text(), 'fresh');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(await sw.caches.match(new Request(origin + url)), undefined);
    }
});

test('activation removes historical private caches while preserving unrelated caches', async () => {
    const sw = worker();
    await sw.seed('photo-api-v1', '/rest/v1/photos', 'private');
    await sw.seed('photo-images-v1', '/storage/private.jpg', 'private');
    await sw.seed('photo-manager-v6', '/config.js', 'old-config');
    await sw.seed('unrelated', '/other', 'unrelated');
    await sw.activate();
    const names = await sw.caches.keys();
    assert.equal(names.includes('photo-api-v1'), false);
    assert.equal(names.includes('photo-images-v1'), false);
    assert.equal(names.includes('photo-manager-v6'), false);
    assert.equal(names.includes('unrelated'), true);
});

test('static shell remains available offline after a successful load', async () => {
    const sw = worker();
    await sw.request('/common.js?v=new');
    await new Promise(resolve => setImmediate(resolve));
    sw.offline = true;
    assert.equal(await (await sw.request('/common.js?v=new')).text(), 'fresh');
});
