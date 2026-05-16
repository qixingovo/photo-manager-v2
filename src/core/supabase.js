// src/core/supabase.js — Supabase 客户端初始化 + 认证 session 管理

const APP_CONFIG = window.__APP_CONFIG__ || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:#f5f6f8;"><div style="max-width:540px;width:100%;background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;color:#333;line-height:1.6;"><h2 style="margin:0 0 8px 0;">配置缺失</h2><p style="margin:0;">缺少 Supabase 配置，请运行 <code>node scripts/build-config.js</code></p></div></div>';
    throw new Error('缺少 Supabase 配置');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storage: window.localStorage, autoRefreshToken: true, detectSessionInUrl: true }
});

const USER_EMAIL_MAP = APP_CONFIG.USER_EMAILS || { laoda: 'laoda@couple.local', xiaodi: 'xiaodi@couple.local' };

function getUserFromSession(profile) {
    const username = profile?.username || '用户';
    const role = profile?.role || 'user';
    const isLaoda = role === 'laoda';
    return { username, role, displayRole: isLaoda ? '老大' : '用户', isLaoda };
}

export { supabase, USER_EMAIL_MAP, getUserFromSession };
