const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { get length() { return values.size; }, key: i => [...values.keys()][i],
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key) };
}

function browser(offline = false) {
    const localStorage = storage({ pm2_session: '{"access_token":"old"}',
        pm2_creds: 'base64-password', 'sb-photo-auth-token': 'old-token', intimate_unlocked: 'true' });
    const sessionStorage = storage({ 'sb-photo-auth-token': 'old-token' });
    const cacheNames = new Set(['photo-api-v1', 'photo-images-v1', 'photo-manager-v6', 'unrelated']);
    let shownPage;
    const elements = new Map();
    const context = vm.createContext({ console: { ...console, log() {} }, localStorage, sessionStorage,
        setTimeout, clearTimeout, URL, btoa, atob, navigator: {},
        caches: { keys: async () => [...cacheNames], delete: async key => cacheNames.delete(key) },
        document: { body: { className: '', classList: { contains: () => false } },
            addEventListener() {}, getElementById(id) {
                if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, classList: { add() {}, remove() {} } });
                return elements.get(id);
            } }, addEventListener() {},
        __APP_CONFIG__: { SUPABASE_URL: 'https://photo.example.test', SUPABASE_ANON_KEY: 'public-key' }
    });
    context.window = context;
    const client = { auth: {
        async signOut() { if (offline) throw new Error('offline'); return { error: null }; },
        async getSession() { return { data: { session: { user: { id: 'old-user' } } } }; }
    } };
    context.__sb_client__ = client;
    vm.runInContext(fs.readFileSync(path.join(root, 'common.js'), 'utf8'), context);
    const loaded = new Map();
    function load(file) {
        const absolute = path.resolve(root, file);
        if (loaded.has(absolute)) return loaded.get(absolute).exports;
        const module = { exports: {} };
        loaded.set(absolute, module);
        const compiled = transformSync(fs.readFileSync(absolute, 'utf8'), { format: 'cjs' }).code;
        const run = vm.runInContext('(function(require,module,exports){' + compiled + '\n})', context, { filename: file });
        run(name => load(path.relative(root, path.resolve(path.dirname(absolute), name))), module, module.exports);
        return module.exports;
    }
    return { context, client, cacheNames, load, localStorage, sessionStorage, elements,
        get shownPage() { return shownPage; }, showPage(page) { shownPage = page; } };
}

for (const entry of ['app.js', 'mobile-app.js']) {
    for (const offline of [false, true]) {
        test(entry + ': logout clears every restorable session even ' + (offline ? 'offline' : 'online'), async () => {
            const env = browser(offline);
            env.load(entry);
            // Also clear stale credentials added after initial module migration.
            env.localStorage.setItem('pm2_creds', 'stale-password');
            if (entry === 'mobile-app.js') {
                env.context.mobile.showPage = page => env.showPage(page);
                env.context.mobile.showToast = () => {};
                await env.context.mobile.handleLogout();
                assert.equal(env.shownPage, 'login');
            } else {
                const main = env.load('src/desktop/main.js');
                main.setCurrentUser({ username: 'laoda' });
                await env.context.handleLogout();
                assert.equal(main.currentUser, null);
                assert.equal(env.elements.get('mainContainer').style.display, 'none');
            }
            for (const key of ['pm2_session', 'pm2_creds', 'sb-photo-auth-token', 'intimate_unlocked']) {
                assert.equal(env.localStorage.getItem(key), null, key);
            }
            assert.equal(env.sessionStorage.getItem('sb-photo-auth-token'), null);
            assert.equal(env.cacheNames.has('photo-api-v1'), false);
            assert.equal(env.cacheNames.has('photo-images-v1'), false);
            assert.equal(env.cacheNames.has('unrelated'), true);
        });
    }
}

test('mobile: explicit logout prevents a stale SDK session being restored on refresh', async () => {
    const env = browser();
    env.load('mobile-app.js');
    env.context.mobile.showPage = page => env.showPage(page);
    env.context.mobile.showToast = () => {};
    await env.context.mobile.handleLogout();
    await env.context.mobile.checkLogin();
    assert.equal(env.shownPage, 'login');
    assert.equal(env.context.mobile.currentUser, null);
});

for (const rememberMe of [true, false]) {
    test('mobile: login stores tokens without keeping a reversible password; remember=' + rememberMe, async () => {
        const env = browser();
        env.load('mobile-app.js');
        const mobile = env.context.mobile;
        env.context.document.getElementById('loginUsername').value = 'laoda';
        env.context.document.getElementById('loginPassword').value = 'correct-password';
        env.context.document.getElementById('rememberMe').checked = rememberMe;
        env.context.setTimeout = () => 0;
        env.client.auth.signInWithPassword = async () => ({ data: {
            user: { id: 'user-1' }, session: { access_token: 'new-token', refresh_token: 'refresh', expires_at: 2000000000 }
        }, error: null });
        env.client.from = () => ({ select() { return this; }, eq() { return this; },
            single: async () => ({ data: { username: 'laoda', role: 'laoda' } }) });
        mobile.loadBirthdayConfig = async () => {};
        mobile.isBirthdayToday = () => false;
        mobile.showPage = page => env.showPage(page);
        mobile.renderFeatureCards = mobile._renderFloatingBall = () => {};
        mobile._loadFeatureCardOrderFromServer = mobile.loadData = async () => {};
        await mobile.handleLogin({ preventDefault() {} });
        assert.equal(env.shownPage, 'home');
        assert.equal(env.localStorage.getItem('pm2_creds'), null);
        const expectedStorage = rememberMe ? env.localStorage : env.sessionStorage;
        const otherStorage = rememberMe ? env.sessionStorage : env.localStorage;
        assert.equal(JSON.parse(expectedStorage.getItem('pm2_session')).access_token, 'new-token');
        assert.equal(otherStorage.getItem('pm2_session'), null);
    });
}
