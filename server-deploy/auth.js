const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PHOTO_JWT_SECRET, pool } = require('../config');

const router = express.Router();

// POST /auth/v1/token — 登录
router.post('/v1/token', async (req, res) => {
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
        }, PHOTO_JWT_SECRET, { expiresIn: '7d' });
        res.json({
            access_token: token, token_type: 'bearer', expires_in: 604800, refresh_token: token,
            user: { id: String(user.id), email: user.email, user_metadata: { username: user.username, role: user.role } }
        });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// GET /auth/v1/user — 获取当前用户
router.get('/v1/user', async (req, res) => {
    const ah = req.headers.authorization;
    if (!ah || !ah.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' });
    try {
        const d = jwt.verify(ah.slice(7), PHOTO_JWT_SECRET);
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

// PUT /auth/v1/user/password — 修改密码
router.put('/v1/user/password', async (req, res) => {
    const ah = req.headers.authorization;
    if (!ah || !ah.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' });
    try {
        const d = jwt.verify(ah.slice(7), PHOTO_JWT_SECRET);
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

// POST /auth/v1/logout — 登出（JWT 无状态，仅返回成功）
router.post('/v1/logout', (req, res) => {
    res.json({ success: true });
});

module.exports = router;
