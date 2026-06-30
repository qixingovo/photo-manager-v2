// src/desktop/main.js — 桌面端入口 + 全局状态 + 初始化

import { supabase, USER_EMAIL_MAP, getUserFromSession } from '../core/supabase.js';
import { loadCategories as loadCategoriesService } from '../core/category-service.js';
import { loadPhotos as loadPhotosService, PHOTOS_PER_PAGE } from '../core/photo-service.js';

// ========== 生产环境 debug 控制 ==========
if (!window.__APP_CONFIG__?.DEBUG) { console.log = function() {}; }

// ========== 全局状态 ==========
export let categories = [];
export let photos = [];
export let photoCategories = [];
export let currentCategory = 'all';
export let currentPhoto = null;
export let showFavoritesOnly = false;
export let currentComments = [];
export let selectMode = false;
export let selectedPhotos = new Set();
export let markedCategories = new Set((JSON.parse(localStorage.getItem('markedCategories') || '[]')).map(String));
export let expandedCategories = new Set();
export let expandedInManager = new Set();

// 分页
export let currentPage = 1;
export let totalPhotos = 0;

// 生日彩蛋
export let birthdayConfig = null;

// 地图
export let mapView = null;
export let mapMarkers = [];
export let mapPhotos = [];

// 纪念日
export let anniversaryMilestones = [];
export let anniversaryStartDate = null;

// 相册
export let albums = [];
export let albumPhotos = [];
export let currentAlbum = null;
export let albumSelectMode = false;
export let albumSelectedPhotos = new Set();

// 足迹护照
export let passportSortByPhotoCount = true;
export let passportData = [];
export let passportAllPhotos = [];

// 时间线分页
export const TIMELINE_PAGE_SIZE = 10;
export let _timelinePage = 1;

// 情侣功能
export let moodDiaryEntries = [];
export let dailyChatterEntries = [];
export let intimateRecords = [];
export let intimateUnlocked = false;
export let coupleTasks = [];
export let coupleCheckins = [];
export let currentTaskTab = 'tasks';
export const INTIMATE_STORAGE_KEY = 'intimate_unlocked';

export let currentUser = null;
export function setCurrentUser(user) { currentUser = user; }

// ========== 主题 ==========
function initTheme() {
    var savedTheme = localStorage.getItem('desktop_theme') || 'purple';
    document.body.className = 'theme-' + savedTheme;
}
initTheme();

window.toggleDesktopTheme = function() {
    var isPurple = document.body.classList.contains('theme-purple');
    var newTheme = isPurple ? 'warm' : 'purple';
    document.body.className = 'theme-' + newTheme;
    localStorage.setItem('desktop_theme', newTheme);
};

// ========== 辅助函数 ==========
export function isLaodaFromSession(session) {
    var role = session?.role;
    return role === 'laoda';
}

export async function loadBirthdayConfig() {
    try {
        var _a = await supabase.from('app_settings').select('value').eq('key', 'birthday_config').single();
        var data = _a.data;
        if (data && data.value) {
            birthdayConfig = JSON.parse(data.value);
            localStorage.setItem('birthday_config', JSON.stringify(birthdayConfig));
            return;
        }
    } catch(e) {}
    try {
        birthdayConfig = JSON.parse(localStorage.getItem('birthday_config') || 'null');
        if (!birthdayConfig) birthdayConfig = { month: 6, day: 22, name: '老大' };
    } catch(e) {
        birthdayConfig = { month: 6, day: 22, name: '老大' };
    }
}

export function isBirthdayToday() {
    if (!birthdayConfig) return false;
    var today = new Date();
    return today.getMonth() + 1 === birthdayConfig.month && today.getDate() === birthdayConfig.day;
}

// ========== 页面显示控制 ==========
export function showLoginPage() {
    var loginEl = document.getElementById('loginPage');
    var mainEl = document.getElementById('mainContainer');
    if (loginEl) loginEl.style.display = '';
    if (mainEl) mainEl.style.display = 'none';
}

export function showMainApp() {
    var loginEl = document.getElementById('loginPage');
    var mainEl = document.getElementById('mainContainer');
    if (loginEl) loginEl.style.display = 'none';
    if (mainEl) mainEl.style.display = '';
}

// ========== 初始化流程 ==========
window.addEventListener('DOMContentLoaded', function() {
    initApp();
});

async function initApp() {
    await checkLogin();
}

async function checkLogin() {
    var _a, _b, _c, _d;
    var _e = await supabase.auth.getSession();
    var session = ((_a = _e.data) === null || _a === void 0 ? void 0 : _a.session) || null;
    if (!session) {
        var saved = localStorage.getItem('pm2_session');
        if (saved) {
            try {
                var parsed = JSON.parse(saved);
                _c = await supabase.auth.setSession({ access_token: parsed.access_token, refresh_token: parsed.refresh_token });
                session = ((_b = _c.data) === null || _b === void 0 ? void 0 : _b.session) || null;
            } catch(e) {}
        }
    }
    if (session) {
        _d = await supabase.from('profiles').select('username, role').eq('user_id', session.user.id).single();
        var profile = _d.data;
        if (profile) {
            currentUser = getUserFromSession(profile);
            await loadBirthdayConfig();
            if (isLaodaFromSession(profile) && isBirthdayToday()) {
                if (typeof showBirthdayWelcome === 'function') {
                    showBirthdayWelcome();
                } else {
                    showMainApp();
                    await Promise.all([loadCategoriesWrapper(), loadPhotosWrapper()]);
                }
                return;
            }
            showMainApp();
            await Promise.all([loadCategoriesWrapper(), loadPhotosWrapper()]);
            if (window.checkIncomingBottles) window.checkIncomingBottles();
            if (window.checkIncomingNotes) window.checkIncomingNotes();
            if (window.checkIncomingNudges) window.checkIncomingNudges();
        } else {
            await supabase.auth.signOut();
            showLoginPage();
        }
    } else {
        showLoginPage();
    }
}

async function loadCategoriesWrapper() {
    categories = await loadCategoriesService();
    return categories;
}

async function loadPhotosWrapper() {
    var result = await loadPhotosService(currentPage, currentCategory, showFavoritesOnly);
    photos = result.photos;
    totalPhotos = result.total;
    return result;
}
