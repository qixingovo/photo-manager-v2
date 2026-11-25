const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bcryptHash = '$2b$10$' + 'a'.repeat(53);

// Execute the actual route handlers; external DB/JWT/bcrypt adapters are not
// installed in this frontend repository. File operations remain real.
function loadServer(t, file, options = {}) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-security-'));
    const uploadDir = path.join(fixtureDir, 'uploads');
    t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
    fs.mkdirSync(uploadDir);
    const routes = new Map();
    const insertedUsers = [];
    const user = { id: 1, email: 'user@example.test', username: 'laoda', role: 'laoda',
        password_hash: options.passwordHash ?? bcryptHash };
    const pool = { async query(sql, params) {
        if (sql.startsWith('SELECT')) return { rows: [user] };
        if (sql.startsWith('UPDATE')) user.password_hash = params[0];
        if (sql.startsWith('INSERT')) insertedUsers.push({ email: params[0], passwordHash: params[2] });
        return { rows: [] };
    } };
    const app = { use() {}, listen() {} };
    for (const method of ['get', 'post', 'put', 'delete']) {
        app[method] = (url, ...handlers) => routes.set(method + ' ' + url, handlers);
    }
    const express = () => app;
    express.Router = () => app;
    express.json = express.static = () => () => {};
    const bcrypt = {
        compare: async (password, hash) => password === 'correct-password' && hash === bcryptHash,
        hash: async () => bcryptHash
    };
    const jwt = {
        sign: () => 'signed-token',
        verify(token) {
            if (token === 'valid-token') return { sub: '1', role: 'authenticated' };
            if (token === 'anon-token') return { role: 'anon' };
            throw Object.assign(new Error('invalid token'), { name: 'JsonWebTokenError' });
        }
    };
    const multer = () => ({ single: () => (req, res, next) => next() });
    const secret = options.secret === undefined ? 'test-secret-with-at-least-32-characters' : options.secret;
    const dependencies = { express, bcryptjs: bcrypt, jsonwebtoken: jwt, multer,
        pg: { Pool: function () { return pool; } },
        '../config': { PHOTO_JWT_SECRET: secret, pool }, '../../../db/pg': pool, path, fs };
    const context = vm.createContext({
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), 'unexpected dependency: ' + name);
            return dependencies[name];
        },
        process: { env: { JWT_SECRET: secret, UPLOAD_DIR: uploadDir, ...options.env } },
        console, module: { exports: {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    return { uploadDir, user, insertedUsers,
        async initialize() {
            if (file === 'server-deploy/initUsers.js') await context.module.exports();
            else await vm.runInContext('initUsers()', context);
        }, async request(method, url, overrides = {}) {
        const handlers = routes.get(method + ' ' + url);
        assert.ok(handlers, 'route missing: ' + method + ' ' + url);
        const req = { headers: {}, query: {}, params: {}, body: {}, ...overrides };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; } };
        async function run(index) {
            if (index >= handlers.length) return;
            let pending;
            await handlers[index](req, res, () => { pending = run(index + 1); });
            await pending;
        }
        await run(0);
        return res;
    } };
}

for (const file of ['api-server.js', 'server-deploy/auth.js']) {
    const tokenRoute = file === 'api-server.js' ? '/auth/v1/token' : '/v1/token';
    test(file + ': legacy password cannot be replaced by an unauthenticated login', async t => {
        const server = loadServer(t, file, { passwordHash: 'old-plaintext-password' });
        const response = await server.request('post', tokenRoute, {
            query: { grant_type: 'password' },
            body: { email: 'user@example.test', password: 'attacker-password' }
        });
        assert.equal(response.statusCode, 400);
        assert.equal(server.user.password_hash, 'old-plaintext-password');
        assert.equal(response.body.access_token, undefined);
    });
    test(file + ': valid bcrypt login works and wrong password is rejected', async t => {
        const server = loadServer(t, file);
        for (const [password, status] of [['correct-password', 200], ['wrong-password', 400]]) {
            const response = await server.request('post', tokenRoute, {
                query: { grant_type: 'password' }, body: { email: 'user@example.test', password }
            });
            assert.equal(response.statusCode, status);
        }
    });
}

for (const file of ['api-server.js', 'server-deploy/auth.js']) {
    test(file + ': server refuses missing or public placeholder signing secrets', t => {
        for (const secret of ['', 'change-me-in-production']) {
            assert.throws(() => loadServer(t, file, { secret }), /secret/i);
        }
    });
}

for (const method of ['post', 'delete']) {
    test('storage ' + method + ': anonymous and invalid tokens cannot mutate files', async t => {
        const server = loadServer(t, 'api-server.js');
        const photo = path.join(server.uploadDir, 'photo.jpg');
        fs.writeFileSync(photo, 'original');
        for (const token of ['', 'invalid-token', 'anon-token']) {
            const response = await server.request(method, '/storage/v1/object/photo/*', {
                params: { 0: 'photo.jpg' },
                headers: token ? { authorization: 'Bearer ' + token } : {}
            });
            assert.equal(response.statusCode, 401);
            assert.equal(fs.readFileSync(photo, 'utf8'), 'original');
        }
    });

    test('storage ' + method + ': rejects traversal, absolute paths and empty keys', async t => {
        const server = loadServer(t, 'api-server.js');
        for (const key of ['../outside.jpg', '..\\outside.jpg', '/outside.jpg', 'C:\\outside.jpg', '', 'nested/../photo.jpg', 'a\0.jpg']) {
            // A real file ensures upload rejection is caused by the path guard,
            // not merely by a missing multipart file.
            const temporary = path.join(server.uploadDir, 'test-upload');
            fs.writeFileSync(temporary, 'bytes');
            const response = await server.request(method, '/storage/v1/object/photo/*', {
                params: { 0: key }, headers: { authorization: 'Bearer valid-token' },
                file: { path: temporary, originalname: 'photo.jpg' }
            });
            assert.equal(response.statusCode, 400, JSON.stringify(key));
        }
    });

    test('storage ' + method + ': rejects a symlink escaping the upload directory', async t => {
        const server = loadServer(t, 'api-server.js');
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-outside-'));
        t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
        fs.writeFileSync(path.join(outside, 'photo.jpg'), 'private');
        fs.symlinkSync(outside, path.join(server.uploadDir, 'linked'), 'junction');
        const temporary = path.join(server.uploadDir, 'test-upload');
        fs.writeFileSync(temporary, 'attacker bytes');
        const response = await server.request(method, '/storage/v1/object/photo/*', {
            params: { 0: 'linked/photo.jpg' }, headers: { authorization: 'Bearer valid-token' },
            file: { path: temporary, originalname: 'photo.jpg' }
        });
        assert.equal(response.statusCode, 400);
        assert.equal(fs.readFileSync(path.join(outside, 'photo.jpg'), 'utf8'), 'private');
    });
}

test('storage: authenticated upload and deletion of nested keys still work', async t => {
    const server = loadServer(t, 'api-server.js');
    const temporary = path.join(server.uploadDir, 'multer-temp');
    fs.writeFileSync(temporary, 'photo bytes');
    const request = { params: { 0: 'nested/photo.jpg' }, headers: { authorization: 'Bearer valid-token' } };
    const uploaded = await server.request('post', '/storage/v1/object/photo/*', {
        ...request, file: { path: temporary, originalname: 'photo.jpg' }
    });
    assert.equal(uploaded.statusCode, 200);
    assert.equal(fs.readFileSync(path.join(server.uploadDir, 'nested/photo.jpg'), 'utf8'), 'photo bytes');
    const deleted = await server.request('delete', '/storage/v1/object/photo/*', request);
    assert.equal(deleted.statusCode, 200);
    assert.equal(fs.existsSync(path.join(server.uploadDir, 'nested/photo.jpg')), false);
});

for (const file of ['api-server.js', 'server-deploy/initUsers.js']) {
    test(file + ': missing bootstrap credentials never create default-password accounts', async t => {
        const server = loadServer(t, file);
        await server.initialize();
        assert.equal(server.insertedUsers.length, 0);
    });
    test(file + ': explicit bootstrap credentials can still create initial accounts', async t => {
        const server = loadServer(t, file, { env: {
            USER_PASSWORDS: JSON.stringify({ laoda: 'test-password-1', xiaodi: 'test-password-2' })
        } });
        await server.initialize();
        assert.equal(server.insertedUsers.length, 2);
    });
    test(file + ': weak bootstrap credentials cannot create an account', async t => {
        const server = loadServer(t, file, { env: {
            USER_PASSWORDS: JSON.stringify({ laoda: 'change-me', xiaodi: 'change-me' })
        } });
        await server.initialize();
        assert.equal(server.insertedUsers.length, 0);
    });
}
