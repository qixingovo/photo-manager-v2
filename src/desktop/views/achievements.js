// src/desktop/views/achievements.js — 回忆成就系统：统计计算、成就解锁、渲染
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

// ========================================
// 回忆成就系统
// ========================================
const ACHIEVEMENTS = [
    { id: 'first_photo', icon: '🐣', name: '初出茅庐', desc: '上传第 1 张照片', check: (s) => s.photoCount >= 1 },
    { id: 'collector', icon: '📸', name: '记忆收集者', desc: '累计 100 张照片', check: (s) => s.photoCount >= 100 },
    { id: 'master', icon: '🏆', name: '回忆大师', desc: '累计 500 张照片', check: (s) => s.photoCount >= 500 },
    { id: 'organizer', icon: '📁', name: '整理达人', desc: '创建 5 个分类', check: (s) => s.categoryCount >= 5 },
    { id: 'commenter', icon: '💬', name: '留言能手', desc: '发表 10 条留言', check: (s) => s.commentCount >= 10 },
    { id: 'collector_20', icon: '⭐', name: '收藏家', desc: '收藏 20 张照片', check: (s) => s.favoriteCount >= 20 },
    { id: 'collector_50', icon: '❤️', name: '真爱印记', desc: '收藏 50 张照片', check: (s) => s.favoriteCount >= 50 },
    { id: 'witness', icon: '📅', name: '岁月见证', desc: '使用超过 365 天', check: (s) => s.daysSinceFirst >= 365 },
    { id: 'explorer', icon: '🗺️', name: '足迹遍布', desc: '标记 10 个地点', check: (s) => s.locationCount >= 10 },
];

window.loadAchievements = async function() {
    // 记录首次使用日期
    let firstLaunch = localStorage.getItem('app_first_launch_date');
    if (!firstLaunch) {
        firstLaunch = new Date().toISOString().slice(0, 10);
        localStorage.setItem('app_first_launch_date', firstLaunch);
    }
    const daysSinceFirst = Math.floor((new Date() - new Date(firstLaunch)) / (1000 * 60 * 60 * 24));

    // 查询统计数据
    let photoCount = 0, categoryCount = 0, commentCount = 0, favoriteCount = 0, locationCount = 0;
    try {
        const [{ count: pc }, { count: cc }, { count: coc }, { count: fc }, { count: lc }] = await Promise.all([
            supabase.from('photos').select('*', { count: 'exact', head: true }),
            supabase.from('categories').select('*', { count: 'exact', head: true }),
            supabase.from('comments').select('*', { count: 'exact', head: true }),
            supabase.from('photos').select('*', { count: 'exact', head: true }).eq('is_favorite', true),
            supabase.from('photos').select('*', { count: 'exact', head: true }).not('location_name', 'is', null),
        ]);
        photoCount = pc || 0;
        categoryCount = cc || 0;
        commentCount = coc || 0;
        favoriteCount = fc || 0;
        locationCount = lc || 0;
    } catch (e) {
        console.warn('加载成就统计失败:', e);
    }

    const stats = { photoCount, categoryCount, commentCount, favoriteCount, locationCount, daysSinceFirst };
    renderAchievements(stats);
};

function renderAchievements(stats) {
    const grid = document.getElementById('achievementsGrid');
    if (!grid) return;

    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const unlocked = a.check(stats);
        return `
            <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                <span class="achievement-icon">${a.icon}</span>
                <span class="achievement-name">${a.name}</span>
                <span class="achievement-desc">${unlocked ? a.desc : '???'}</span>
            </div>
        `;
    }).join('');
}
