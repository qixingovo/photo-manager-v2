const bcrypt = require('bcryptjs');
const pool = require('../../../db/pg');

async function initUsers() {
    try {
        if (!process.env.USER_PASSWORDS) {
            console.warn('USER_PASSWORDS is not configured; skipping account bootstrap');
            return;
        }
        const passwords = JSON.parse(process.env.USER_PASSWORDS);
        if (!passwords || ['laoda', 'xiaodi'].some(name =>
            typeof passwords[name] !== 'string' || passwords[name].length < 12)) {
            throw new Error('Bootstrap passwords must each contain at least 12 characters');
        }
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
        console.log('Photo users checked');
    } catch (err) {
        console.error('Photo user init failed:', err.message);
    }
}

module.exports = initUsers;
