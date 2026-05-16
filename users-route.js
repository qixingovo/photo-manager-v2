const express = require("express");
const router = express.Router();
const auth = require("../../../middleware/auth");
const userService = require("../services/userService");

// 列表
router.get("/", auth, async (req, res) => {
  try {
    const users = await userService.list();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 重置密码
router.put("/:id/password", auth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await userService.resetPassword(parseInt(req.params.id), newPassword);
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
