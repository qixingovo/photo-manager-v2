const pool = require("../../../db/pg");
const bcrypt = require("bcryptjs");

const userService = {
  async list() {
    const r = await pool.query(
      "SELECT id, email, username, role, created_at FROM users ORDER BY id"
    );
    return r.rows;
  },

  async resetPassword(userId, newPassword) {
    if (!newPassword || newPassword.length < 4) {
      throw Object.assign(new Error("密码至少4个字符"), { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const r = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email, username",
      [hash, userId]
    );
    if (r.rows.length === 0) {
      throw Object.assign(new Error("用户不存在"), { status: 404 });
    }
    return r.rows[0];
  },
};

module.exports = userService;
