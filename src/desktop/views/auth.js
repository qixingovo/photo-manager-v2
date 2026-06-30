// src/desktop/views/auth.js — 桌面端登录/登出/改密码
import { supabase, USER_EMAIL_MAP, getUserFromSession } from '../../core/supabase.js';
import * as Main from '../main.js';
import { setCurrentUser } from '../main.js';

const APP_CONFIG = window.__APP_CONFIG__ || {};

export async function handleLogin(e) {
    e.preventDefault();

    const account = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!account || !password) {
        errorEl.textContent = '请输入账号和密码';
        return;
    }

    const email = USER_EMAIL_MAP[account];
    if (!email) {
        errorEl.textContent = '账号不存在';
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        if (error) console.error('账号登录失败:', error);
        errorEl.textContent = '登录失败，请检查账号或密码';
        return;
    }

    // 手动持久化 session（CDN 版 supabase-js 的 localStorage 可能不生效）
    if (data?.session) {
        localStorage.setItem('pm2_session', JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
        }));
    }

    // 查 profiles 取 username/role
    const { data: profile } = await supabase.from('profiles')
        .select('username, role').eq('user_id', data.user.id).single();

    if (!profile) {
        errorEl.textContent = '用户档案缺失，请联系管理员';
        await supabase.auth.signOut();
        return;
    }

    const session = {
        username: profile.username,
        role: profile.role
    };
    setCurrentUser(getUserFromSession(session));
    errorEl.textContent = '';
    // 如果是老大且今天是生日，显示生日快乐欢迎界面
    await Main.loadBirthdayConfig();
    if (Main.isLaodaFromSession(session) && Main.isBirthdayToday()) {
        showBirthdayWelcome();
    } else {
        Main.showMainApp();
        await Promise.all([loadCategories(), loadPhotos()]);
        window.checkIncomingBottles();
        window.checkIncomingNotes();
        window.checkIncomingNudges();
    }
}

export async function handleLogout() {
    setCurrentUser(null);
    await supabase.auth.signOut();
    Main.showLoginPage();
}

// ---- 修改密码 ----
export function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('changePasswordError').style.display = 'none';
    document.getElementById('changePasswordSuccess').style.display = 'none';
}

export function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

export async function handleChangePassword(e) {
    e.preventDefault();
    const oldPwd = document.getElementById('oldPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('changePasswordError');
    const successEl = document.getElementById('changePasswordSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (newPwd !== confirmPwd) { errorEl.textContent = '两次输入的新密码不一致'; errorEl.style.display = 'block'; return; }
    if (newPwd.length < 4) { errorEl.textContent = '新密码至少4个字符'; errorEl.style.display = 'block'; return; }

    const session = JSON.parse(localStorage.getItem('pm2_session') || '{}');
    const token = session.access_token;
    if (!token) { errorEl.textContent = '未登录，请刷新页面后重试'; errorEl.style.display = 'block'; return; }

    try {
        const res = await fetch(`${APP_CONFIG.SUPABASE_URL}/auth/v1/user/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error || '修改失败'; errorEl.style.display = 'block'; return; }
        successEl.style.display = 'block';
        setTimeout(() => closeChangePasswordModal(), 1500);
    } catch (err) {
        errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block';
    }
}

// 挂载到 window 以兼容 HTML onclick 属性
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handleChangePassword = handleChangePassword;
