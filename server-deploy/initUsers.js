const bcrypt = require('bcryptjs');
const pool = require('../../../db/pg');

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
        console.log('Photo users checked');
    } catch (err) {
        console.error('Photo user init failed:', err.message);
    }
}

module.exports = initUsers;
