// Photo Manager - Auth + Storage API Server
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/www/uploads';
const PORT = process.env.PORT || 3002;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'change-me',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432')
});
const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ---- Auth ----
app.post('/auth/v1/token', async (req, res) => {
    if (req.query.grant_type !== 'password') return res.status(400).json({ error: 'unsupported_grant_type' });
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    try {
        const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (r.rows.length === 0) return res.status(400).json({ error: 'invalid_credentials' });
        const user = r.rows[0];
        let valid = false;
        if (user.password_hash.startsWith('$2')) {
            valid = await bcrypt.compare(password, user.password_hash);
        } else {
            const hash = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
            valid = true;
        }
        if (!valid) return res.status(400).json({ error: 'invalid_credentials' });
        const token = jwt.sign({
            sub: String(user.id), email: user.email, role: 'authenticated',
            user_metadata: { username: user.username, role: user.role }
        }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            access_token: token, token_type: 'bearer', expires_in: 604800, refresh_token: token,
            user: { id: String(user.id), email: user.email, user_metadata: { username: user.username, role: user.role } }
        });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

app.get('/auth/v1/user', async (req, res) => {
    const ah = req.headers.authorization;
    if (!ah || !ah.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' });
    try {
        const d = jwt.verify(ah.slice(7), JWT_SECRET);
        const r = await pool.query('SELECT id, email, username, role FROM users WHERE id = $1', [d.sub]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'user_not_found' });
        const u = r.rows[0];
        res.json({ id: String(u.id), email: u.email, user_metadata: { username: u.username, role: u.role } });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
            return res.status(401).json({ error: 'invalid_token' });
        }
        console.error('Get user error:', err);
        res.status(500).json({ error: '获取用户信息失败，请稍后重试' });
    }
});

// 修改密码
app.put('/auth/v1/user/password', async (req, res) => {
    const ah = req.headers.authorization;
    if (!ah || !ah.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' });
    try {
        const d = jwt.verify(ah.slice(7), JWT_SECRET);
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) return res.status(400).json({ error: 'oldPassword and newPassword required' });
        if (newPassword.length < 4) return res.status(400).json({ error: 'new password too short' });
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [d.sub]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'user_not_found' });
        const user = r.rows[0];
        const valid = await bcrypt.compare(oldPassword, user.password_hash);
        if (!valid) return res.status(400).json({ error: 'old password incorrect' });
        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
        res.json({ success: true });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
            return res.status(401).json({ error: 'invalid_token' });
        }
        console.error('Password change error:', err);
        res.status(500).json({ error: '修改密码失败，请稍后重试' });
    }
});

// 登出（JWT 无状态，仅返回成功让客户端清除本地 token）
app.post('/auth/v1/logout', (req, res) => {
    res.json({ success: true });
});

// ---- Storage ----
const storageMulter = multer({ dest: UPLOAD_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

// Handle POST /storage/v1/object/photo/filename
app.post('/storage/v1/object/photo/*', storageMulter.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const targetName = req.params['0'] || req.file.originalname;
    const targetPath = path.join(UPLOAD_DIR, targetName);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(req.file.path, targetPath);
    res.json({ Key: targetName, Id: targetName });
});

// Handle DELETE /storage/v1/object/photo/filename
app.delete('/storage/v1/object/photo/*', (req, res) => {
    const fp = path.join(UPLOAD_DIR, req.params['0'] || '');
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: 'delete_failed' }); }
});

// Serve public files
app.use('/storage/v1/object/public/photo', express.static(UPLOAD_DIR));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 仅在用户不存在时创建，不再覆盖已有密码
async function initUsers() {
    try {
        const passwords = JSON.parse(process.env.USER_PASSWORDS || '{"laoda":"change-me","xiaodi":"change-me"}');
        const h1 = await bcrypt.hash(passwords.laoda, 10);
        const h2 = await bcrypt.hash(passwords.xiaodi, 10);
        await pool.query(
            'INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
            ['laoda@couple.local', 'laoda', h1, 'laoda']
        );
        await pool.query(
            'INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
            ['xiaodi@couple.local', 'xiaodi', h2, 'xiaodi']
        );
        console.log('Users checked');
    } catch (err) { console.error('Init failed:', err.message); }
}

app.listen(PORT, '127.0.0.1', async () => { await initUsers(); console.log('API server on port ' + PORT); });
