// app.js — 桌面版入口：导入 main.js（状态 + 初始化）+ 各视图模块
import './src/desktop/main.js';
import { supabase } from './src/core/supabase.js';
// 视图模块（side-effect 导入，自动注册 window.* 函数）
import './src/desktop/views/auth.js';
import './src/desktop/views/album.js';
import './src/desktop/views/category-manager.js';
import './src/desktop/views/map.js';
import './src/desktop/views/photo-batch.js';
import './src/desktop/views/photo-detail.js';
import './src/desktop/views/photo-grid.js';
import './src/desktop/views/time-capsule.js';
import './src/desktop/views/timeline.js';
import './src/desktop/views/upload.js';
import './src/desktop/views/collage.js';
import './src/desktop/views/achievements.js';

// 兼容性别名：原 app.js 中的函数已移至视图模块，剩余代码通过这些别名调用 window.* 版本
const getPhotoUrl = (...args) => window.getPhotoUrl(...args);
const formatTime = (...args) => window.formatTime(...args);
const renderParentCategorySelect = () => window.renderParentCategorySelect();
const initMapView = () => window.initMapView();
const initTimeline = () => window.initTimeline();
const loadAlbums = () => window.loadAlbums();
const renderCollageCategorySelect = () => window.renderCollageCategorySelect();
const loadAchievements = () => window.loadAchievements();
const showMainApp = () => window.showMainApp();
const showLoginPage = () => window.showLoginPage();

// 生产环境禁用 debug 日志（设置 DEBUG=true 可开启）
if (!window.__APP_CONFIG__?.DEBUG) { console.log = () => {}; }
// ========== 状态变量 ==========
let categories = []
let photos = []
let photoCategories = [] // photo_id -> category_ids 映射
let currentCategory = 'all'
let currentPhoto = null
let showFavoritesOnly = false
let currentComments = []
let selectMode = false
let selectedPhotos = new Set()
let markedCategories = new Set((JSON.parse(localStorage.getItem('markedCategories') || '[]')).map(String))
let expandedCategories = new Set()
let expandedInManager = new Set() // 分类管理区域的展开状态

// ========== 桌面主题切换 ==========
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

// 分页状态
const PHOTOS_PER_PAGE = 20
let currentPage = 1
let totalPhotos = 0

// 生日彩蛋状态
let birthdayConfig = null

// 地图状态
let mapView = null
let mapMarkers = []
let mapPhotos = []

// 纪念日时间线状态
let anniversaryMilestones = []
let anniversaryStartDate = null

// 相册状态
let albums = []
let albumPhotos = []
let currentAlbum = null
let albumSelectMode = false
let albumSelectedPhotos = new Set()

// 足迹护照状态
let passportSortByPhotoCount = true
let passportData = []
let passportAllPhotos = []

// 时间线分页
const TIMELINE_PAGE_SIZE = 10
let _timelinePage = 1

// 情侣功能状态
let moodDiaryEntries = []
let dailyChatterEntries = []
let intimateRecords = []
let intimateUnlocked = false
let coupleTasks = []
let coupleCheckins = []
let currentTaskTab = 'tasks'
const INTIMATE_STORAGE_KEY = 'intimate_unlocked'

const APP_CONFIG = window.__APP_CONFIG__ || {};
let currentUser = null;

const escapeHtml = CommonUtils.escapeHtml;
const sha256 = CommonUtils.sha256;
const safeBigint = CommonUtils.safeBigint;
const highlightKeywords = CommonUtils.highlightKeywords;
const formatRelativeTime = CommonUtils.formatRelativeTime;
const getRelativeTime = CommonUtils.getRelativeTime;
const formatFileSize = CommonUtils.formatFileSize;
const generateShareToken = CommonUtils.generateShareToken;
const getCategoryAndChildrenIds = function (id) { return CommonUtils.getCategoryAndChildrenIds(id, categories); };
const getCategoryPath = function (id) { return CommonUtils.getCategoryPath(id, categories); };
const getDefaultMilestones = CommonUtils.getDefaultMilestones;

async function loadBirthdayConfig() {
    try {
        // 从数据库读取
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'birthday_config').single();
        if (data && data.value) {
            birthdayConfig = JSON.parse(data.value);
            localStorage.setItem('birthday_config', JSON.stringify(birthdayConfig));
            return;
        }
    } catch (e) { /* DB fail, fallback to localStorage */ }
    try {
        birthdayConfig = JSON.parse(localStorage.getItem('birthday_config') || 'null');
        if (!birthdayConfig) {
            birthdayConfig = { month: 6, day: 22, name: '老大' };
        }
    } catch (e) {
        birthdayConfig = { month: 6, day: 22, name: '老大' };
    }
}

function isBirthdayToday() {
    if (!birthdayConfig) return false;
    const today = new Date();
    return today.getMonth() + 1 === birthdayConfig.month && today.getDate() === birthdayConfig.day;
}

async function saveBirthdayConfig(config) {
    birthdayConfig = config;
    localStorage.setItem('birthday_config', JSON.stringify(config));
    try {
        await supabase.from('app_settings').upsert({ key: 'birthday_config', value: JSON.stringify(config) }, { onConflict: 'key' });
    } catch (e) { /* DB fail, localStorage still has it */ }
}

// 检查登录状态

// ========== 生日惊喜：蓝色星愿礼盒 ==========

// 从分类加载照片
async function loadPhotosByCategory(categoryName) {
    try {
        var _c = await supabase.from('categories').select('id').eq('name', categoryName).single();
        if (!_c.data) return [];
        var _p = await supabase.from('photo_categories').select('photo_id').eq('category_id', _c.data.id);
        if (!_p.data || _p.data.length === 0) return [];
        var ids = _p.data.map(function(r) { return r.photo_id; });
        var _photos = await supabase.from('photos').select('*').in('id', ids);
        return _photos.data || [];
    } catch(e) { return []; }
}

function getStorageUrl(photo) {
    var cfg = window.__APP_CONFIG__ || {};
    var base = cfg.SUPABASE_STORAGE_URL || (cfg.SUPABASE_URL ? cfg.SUPABASE_URL + '/storage/v1/object/public/photo/' : '');
    if (photo.storage_path && photo.storage_path.startsWith('http')) return photo.storage_path;
    return base + (photo.storage_path || '');
}

function getDaysTogether() {
    try {
        var key = 'anniversary_start_date';
        // 从已加载的 settings 里取缓存
        var cached = localStorage.getItem('app_settings_cache');
        if (cached) {
            var map = JSON.parse(cached);
            if (map[key]) {
                var start = new Date(map[key]);
                var now = new Date();
                return Math.floor((now - start) / 86400000);
            }
        }
    } catch(e) {}
    return 0;
}

// ---- Canvas: 星空 ----
function startStarsCanvas() {
    var canvas = document.getElementById('starsCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');
    var stars = [];
    for (var i = 0; i < 120; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: 0.5 + Math.random() * 2,
            twinkle: Math.random() * Math.PI * 2,
            speed: 0.01 + Math.random() * 0.03
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(function(s) {
            s.twinkle += s.speed;
            var alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s.twinkle));
            ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        window.__starsAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function stopStarsCanvas() {
    if (window.__starsAnimId) { cancelAnimationFrame(window.__starsAnimId); window.__starsAnimId = null; }
    var c = document.getElementById('starsCanvas');
    if (c) c.remove();
}

// ---- Canvas: 粒子喷涌 ----
function burstParticles(x, y) {
    var canvas = document.getElementById('burstCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');
    var particles = [];
    var colors = ['#89CFF0','#A8D8EA','#BFE4F5','#FFB6C1','#E8D5F5','#FFE4E1','#FFFFFF','#87CEEB'];
    var shapes = ['circle','heart','star'];

    for (var i = 0; i < 80; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 3 + Math.random() * 8;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - Math.random() * 6,
            size: 4 + Math.random() * 14,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            life: 60 + Math.random() * 80,
            age: 0,
            shape: shapes[Math.floor(Math.random() * shapes.length)]
        });
    }

    function drawHeart(cx, cy, s) {
        ctx.beginPath();
        var topY = cy - s * 0.4;
        ctx.moveTo(cx, cy + s * 0.4);
        ctx.bezierCurveTo(cx, topY, cx - s * 0.6, topY, cx - s * 0.6, cy + s * 0.15);
        ctx.bezierCurveTo(cx - s * 0.6, cy + s * 0.6, cx, cy + s, cx, cy + s * 0.9);
        ctx.bezierCurveTo(cx, cy + s, cx + s * 0.6, cy + s * 0.6, cx + s * 0.6, cy + s * 0.15);
        ctx.bezierCurveTo(cx + s * 0.6, topY, cx, topY, cx, cy + s * 0.4);
        ctx.fill();
    }

    function drawStar(cx, cy, s) {
        var spikes = 5, outerR = s, innerR = s * 0.4;
        ctx.beginPath();
        for (var j = 0; j < spikes * 2; j++) {
            var r = j % 2 === 0 ? outerR : innerR;
            var a = Math.PI / 2 * 3 + j * Math.PI / spikes;
            var px = cx + Math.cos(a) * r;
            var py = cy + Math.sin(a) * r;
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var alive = false;
        particles.forEach(function(p) {
            p.x += p.vx * 0.5;
            p.y += p.vy * 0.5;
            p.vy += 0.08;
            p.age++;
            p.alpha = 1 - p.age / p.life;
            if (p.alpha <= 0) return;
            alive = true;
            ctx.fillStyle = p.color.replace(')', ', ' + p.alpha + ')').replace('rgb', 'rgba');
            if (p.color === '#FFFFFF' || p.color === '#FFE4E1') {
                ctx.fillStyle = 'rgba(255,255,255,' + p.alpha + ')';
            } else {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
            }
            if (p.shape === 'heart') drawHeart(p.x, p.y, p.size);
            else if (p.shape === 'star') drawStar(p.x, p.y, p.size);
            else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = 1;
        });
        if (alive) window.__burstAnimId = requestAnimationFrame(animate);
        else { canvas.style.display = 'none'; }
    }
    animate();
}

// ---- 主流程 ----
async function showBirthdayWelcome() {
    await loadBirthdayConfig();
    var cfg = birthdayConfig || { month: 6, day: 22, name: '老大' };

    // 预加载照片
    var carouselPhotos = await loadPhotosByCategory('老大和小弟');
    var couplePhoto = null;
    var couplePhotos = await loadPhotosByCategory('合照');
    if (couplePhotos.length > 0) couplePhoto = couplePhotos[Math.floor(Math.random() * couplePhotos.length)];

    var daysTogether = getDaysTogether();
    var daysText = daysTogether > 0 ? '一起走过了 ' + daysTogether + ' 天 💙' : '';

    // 构建 overlay
    var overlay = document.createElement('div');
    overlay.id = 'birthdayOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1a3b;overflow:hidden;';

    overlay.innerHTML =
        '<canvas id="starsCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;"></canvas>' +
        '<canvas id="burstCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;"></canvas>' +
        // 阶段一：星夜开场
        '<div id="phase1" class="bd-phase" style="position:relative;z-index:2;text-align:center;color:white;">' +
          '<p style="font-size:1.2rem;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:0.5s;letter-spacing:3px;">今天是个特别的日子 ✨</p>' +
        '</div>' +
        // 阶段二：流星许愿
        '<div id="phase2" class="bd-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;">' +
          '<div style="position:relative;">' +
            '<div class="shooting-star" style="position:absolute;top:-60px;left:-120px;width:120px;height:3px;background:linear-gradient(90deg, transparent, #A8D8EA, #fff);border-radius:3px;transform:rotate(-35deg);opacity:0;animation:shootStar 1.5s ease-in forwards;"></div>' +
            '<h1 style="font-size:2.5rem;font-weight:bold;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:1.2s;text-shadow:0 2px 12px rgba(168,216,234,0.5);">提前祝老大生日快乐 🩵</h1>' +
            '<p style="font-size:0.9rem;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:1.5s;margin-top:8px;color:rgba(168,216,234,0.7);">🎂 真正生日是6月22日</p>' +
          '</div>' +
        '</div>' +
        // 阶段三：回忆轮播
        '<div id="phase3" class="bd-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;width:90%;max-width:600px;">' +
          '<div class="carousel-frame" style="background:rgba(255,255,255,0.1);border-radius:20px;padding:16px;backdrop-filter:blur(10px);border:2px solid rgba(168,216,234,0.3);">' +
            '<img id="carouselImg" src="" style="width:100%;max-height:50vh;object-fit:contain;border-radius:12px;transition:opacity 0.6s ease;" />' +
          '</div>' +
          '<p style="font-size:1rem;opacity:0.7;margin-top:16px;letter-spacing:2px;">我们的回忆 💙</p>' +
          '<p id="carouselCounter" style="font-size:0.8rem;opacity:0.5;margin-top:4px;"></p>' +
        '</div>' +
        // 阶段四：礼盒
        '<div id="phase4" class="bd-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;">' +
          // 礼物盒
          '<div id="giftBox" onclick="window.openBirthdayGift()" style="cursor:pointer;transition:transform 0.2s;position:relative;">' +
            // 盒体
            '<div style="width:120px;height:100px;background:linear-gradient(135deg,#6CB4EE,#4A90D9);border-radius:12px;margin:0 auto;position:relative;box-shadow:0 8px 30px rgba(74,144,217,0.4);">' +
              // 丝带横条
              '<div style="position:absolute;top:40%;left:0;width:100%;height:16px;background:rgba(255,255,255,0.5);border-radius:3px;"></div>' +
              // 丝带竖条
              '<div style="position:absolute;left:50%;top:0;width:16px;height:100%;background:rgba(255,255,255,0.35);border-radius:3px;transform:translateX(-50%);"></div>' +
            '</div>' +
            // 盒盖
            '<div id="giftLid" style="width:130px;height:30px;background:linear-gradient(135deg,#7EC8F8,#5BA0E8);border-radius:8px;margin:0 auto;position:relative;top:-2px;transform-origin:right bottom;transition:transform 0.6s ease;box-shadow:0 4px 15px rgba(74,144,217,0.3);">' +
              '<div style="position:absolute;top:5px;left:50%;transform:translateX(-50%);">' +
                '<div style="width:30px;height:20px;border:3px solid rgba(255,255,255,0.7);border-radius:50% 50% 0 0;border-bottom:none;"></div>' +
                '<div style="width:6px;height:6px;background:rgba(255,255,255,0.7);border-radius:50%;margin:2px auto 0;"></div>' +
              '</div>' +
            '</div>' +
            // 提示文字
            '<p style="margin-top:16px;font-size:0.9rem;opacity:0.6;animation:bounceHint 1.5s ease-in-out infinite;">点击打开 🎀</p>' +
          '</div>' +
          // 卡片（初始隐藏）
          '<div id="giftCard" style="display:none;background:rgba(255,255,255,0.15);backdrop-filter:blur(12px);border-radius:24px;padding:24px;max-width:400px;margin:0 auto;border:2px solid rgba(168,216,234,0.3);animation:scaleIn 0.6s ease;">' +
            (couplePhoto ? '<img src="'+getStorageUrl(couplePhoto)+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:16px;margin-bottom:16px;" />' : '<div style="font-size:60px;margin-bottom:16px;">🎂</div>') +
            '<p style="font-size:1.1rem;margin-bottom:8px;text-shadow:0 1px 4px rgba(0,0,0,0.2);">提前祝老大生日快乐 🩵</p>' +
            '<p style="font-size:0.8rem;opacity:0.6;margin-bottom:4px;">🎂 真正生日：6月22日</p>' +
            '<p style="font-size:0.9rem;opacity:0.7;margin-bottom:16px;">' + daysText + '</p>' +
            '<button onclick="window.enterMainApp()" style="padding:14px 48px;font-size:1.1rem;background:rgba(255,255,255,0.9);color:#4A90D9;border:none;border-radius:50px;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(0,0,0,0.1);transition:transform 0.2s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">进入系统 💙</button>' +
          '</div>' +
        '</div>' +
        // 音乐按钮和日期选择
        '<div style="position:fixed;bottom:30px;right:30px;z-index:10;display:flex;gap:10px;align-items:center;">' +
          '<p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-right:4px;">' +
            '<select id="birthdayMonth" onchange="window.updateBirthdayConfig()" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 6px;font-size:11px;">' +
              [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m){return '<option value="'+m+'"'+(m===cfg.month?' selected':'')+'>'+m+'月</option>';}).join('') +
            '</select>' +
            '<select id="birthdayDay" onchange="window.updateBirthdayConfig()" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 6px;font-size:11px;">' +
              Array.from({length:31},function(_,i){return '<option value="'+(i+1)+'"'+(i+1===cfg.day?' selected':'')+'>'+(i+1)+'日</option>';}).join('') +
            '</select>' +
          '</p>' +
          '<button id="musicToggle" onclick="window.toggleBirthdayMusic(event)" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;width:36px;height:36px;border-radius:50%;font-size:14px;cursor:pointer;">🔇</button>' +
        '</div>' +
        '<style>' +
          '.bd-phase { transition: opacity 0.8s ease; }' +
          '@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }' +
          '@keyframes shootStar { 0% { opacity:0; left:-120px; } 20% { opacity:1; } 80% { opacity:1; } 100% { opacity:0; left:calc(100% + 120px); } }' +
          '@keyframes bounceHint { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }' +
          '@keyframes scaleIn { from { transform:scale(0.7); opacity:0; } to { transform:scale(1); opacity:1; } }' +
          '@keyframes fadeOut { to { opacity:0; } }' +
        '</style>';

    document.body.appendChild(overlay);

    // 启动星空
    startStarsCanvas();

    // ---- 阶段调度 ----
    var phase1 = document.getElementById('phase1');
    var phase2 = document.getElementById('phase2');
    var phase3 = document.getElementById('phase3');
    var phase4 = document.getElementById('phase4');
    var starsCanvas = document.getElementById('starsCanvas');

    function switchPhase(from, to) {
        if (from) { from.style.opacity = '0'; setTimeout(function(){ from.style.display = 'none'; }, 800); }
        setTimeout(function() {
            if (to) { to.style.display = 'block'; requestAnimationFrame(function(){ to.style.opacity = '1'; }); }
        }, 400);
    }

    // 阶段1→2：星夜 → 流星 (2.5s)
    setTimeout(function() {
        switchPhase(phase1, phase2);
        // 阶段2→3：流星 → 回忆轮播 (流星动画1.5s + 停留1.5s)
        setTimeout(function() {
            switchPhase(phase2, phase3);
            // phase3 display 延迟 400ms 才变 block，等它可见再启动轮播
            setTimeout(function() { startCarousel(); }, 500);
            // 阶段3→4：轮播结束 → 礼盒
            setTimeout(function() {
                switchPhase(phase3, phase4);
                // 背景亮起来
                overlay.style.background = 'linear-gradient(180deg, #0b1a3b 0%, #1a3a6b 40%, #2A5C8A 100%)';
                overlay.style.transition = 'background 1.5s ease';
            }, (carouselPhotos.length || 3) * 2500 + 500);
        }, 2800);
    }, 2200);

    // ---- 回忆轮播 ----
    var carouselIndex = 0;
    function startCarousel() {
        var img = document.getElementById('carouselImg');
        var counter = document.getElementById('carouselCounter');
        if (!img || carouselPhotos.length === 0) {
            img && (img.src = '');
            return;
        }
        function showNext() {
            if (!document.getElementById('phase3') || document.getElementById('phase3').style.display === 'none') return;
            img.style.opacity = '0';
            setTimeout(function() {
                img.src = getStorageUrl(carouselPhotos[carouselIndex]);
                img.style.opacity = '1';
                counter.textContent = (carouselIndex + 1) + ' / ' + carouselPhotos.length;
                carouselIndex = (carouselIndex + 1) % carouselPhotos.length;
            }, 600);
        }
        showNext();
        window.__carouselTimer = setInterval(showNext, 2500);
    }
}

window.showBirthdayWelcome = showBirthdayWelcome;

// ---- 礼盒交互 ----
window.openBirthdayGift = function() {
    var lid = document.getElementById('giftLid');
    var box = document.getElementById('giftBox');
    var card = document.getElementById('giftCard');
    if (!lid || lid.style.transform === 'rotate(-130deg)') return;

    // 盒盖弹开
    lid.style.transform = 'rotate(-130deg)';
    lid.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
    // 隐藏提示
    var hint = box.querySelector('p');
    if (hint) hint.style.display = 'none';

    // 粒子喷涌
    var rect = box.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top;
    burstParticles(cx, cy);

    // 延迟显示卡片
    setTimeout(function() {
        if (card) card.style.display = 'block';
        box.style.pointerEvents = 'none';
    }, 600);
};

// ---- 进入主应用 ----
window.enterMainApp = function() {
    stopStarsCanvas();
    if (window.__burstAnimId) { cancelAnimationFrame(window.__burstAnimId); window.__burstAnimId = null; }
    if (window.__carouselTimer) { clearInterval(window.__carouselTimer); window.__carouselTimer = null; }
    var overlay = document.getElementById('birthdayOverlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.8s ease forwards';
        document.body.style.transition = 'opacity 0.8s ease';
        document.body.style.opacity = '0';
        setTimeout(function() {
            overlay.remove();
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';
            document.body.style.opacity = '1';
            loadCategories();
            loadPhotos();
        }, 800);
    }
};

// ---- 音乐 ----
window.toggleBirthdayMusic = function(e) {
    e.stopPropagation();
    var audio = document.getElementById('birthdayMusic');
    var btn = document.getElementById('musicToggle');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'birthdayMusic';
        audio.loop = true;
        audio.style.display = 'none';
        audio.innerHTML = '<source src="assets/birthday-bgm.mp3" type="audio/mpeg">';
        document.body.appendChild(audio);
    }
    if (audio.paused) {
        audio.play().catch(function(){});
        if (btn) btn.textContent = '🔊';
    } else {
        audio.pause();
        if (btn) btn.textContent = '🔇';
    }
};

// ---- 日期配置 ----
window.updateBirthdayConfig = async function() {
    var m = document.getElementById('birthdayMonth');
    var d = document.getElementById('birthdayDay');
    if (!m || !d) return;
    await saveBirthdayConfig({ month: parseInt(m.value), day: parseInt(d.value), name: (birthdayConfig && birthdayConfig.name) || '老大' });
};

// ========== 数据加载（维护本地 state 供剩余代码使用）==========
async function loadCategories() {
    try {
        const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        categories = data || [];
        window.renderCategories && window.renderCategories();
    } catch (err) {
        console.error('加载分类失败:', err);
    }
}

async function loadPhotos() {
    try {
        let query = supabase.from('photos').select('*', { count: 'exact', head: false });
        if (currentCategory && currentCategory !== 'all') {
            const categoryIds = getCategoryAndChildrenIds(currentCategory);
            const { data: pcData } = await supabase.from('photo_categories').select('photo_id').in('category_id', categoryIds);
            const photoIds = (pcData || []).map(pc => pc.photo_id);
            if (photoIds.length === 0) { photos = []; totalPhotos = 0; } else { query = query.in('id', photoIds); }
        }
        if (showFavoritesOnly) query = query.eq('is_favorite', true);
        const searchValue = document.getElementById('searchInput')?.value || '';
        if (searchValue) query = query.or(`name.ilike.%${searchValue}%,description.ilike.%${searchValue}%`);
        const from = (currentPage - 1) * PHOTOS_PER_PAGE;
        const to = from + PHOTOS_PER_PAGE - 1;
        const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
        if (error) throw error;
        photos = data || [];
        totalPhotos = count || 0;
        window.updatePhotosTitle && window.updatePhotosTitle();
        window.renderPhotos && window.renderPhotos();
        window.renderPagination && window.renderPagination();
        window.updateEmptyState && window.updateEmptyState();
    } catch (err) {
        console.error('加载照片失败:', err);
    }
}

window.handleLogout = async function() {
    currentUser = null;
    await supabase.auth.signOut();
    showLoginPage();
}

// ---- 修改密码 ----
window.openChangePasswordModal = function() {
    document.getElementById('changePasswordModal').style.display = 'flex'
    document.getElementById('oldPassword').value = ''
    document.getElementById('newPassword').value = ''
    document.getElementById('confirmPassword').value = ''
    document.getElementById('changePasswordError').style.display = 'none'
    document.getElementById('changePasswordSuccess').style.display = 'none'
}

window.closeChangePasswordModal = function() {
    document.getElementById('changePasswordModal').style.display = 'none'
}

window.handleChangePassword = async function(e) {
    e.preventDefault()
    const oldPwd = document.getElementById('oldPassword').value
    const newPwd = document.getElementById('newPassword').value
    const confirmPwd = document.getElementById('confirmPassword').value
    const errorEl = document.getElementById('changePasswordError')
    const successEl = document.getElementById('changePasswordSuccess')
    errorEl.style.display = 'none'
    successEl.style.display = 'none'

    if (newPwd !== confirmPwd) { errorEl.textContent = '两次输入的新密码不一致'; errorEl.style.display = 'block'; return }
    if (newPwd.length < 4) { errorEl.textContent = '新密码至少4个字符'; errorEl.style.display = 'block'; return }

    const session = JSON.parse(localStorage.getItem('pm2_session') || '{}')
    const token = session.access_token
    if (!token) { errorEl.textContent = '未登录，请刷新页面后重试'; errorEl.style.display = 'block'; return }

    try {
        const res = await fetch(`${APP_CONFIG.SUPABASE_URL}/auth/v1/user/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
        })
        const data = await res.json()
        if (!res.ok) { errorEl.textContent = data.error || '修改失败'; errorEl.style.display = 'block'; return }
        successEl.style.display = 'block'
        setTimeout(() => window.closeChangePasswordModal(), 1500)
    } catch (err) {
        errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block'
    }
}

window.toggleSection = function(section) {
    const uploadSection = document.getElementById('uploadSection')
    const categorySection = document.getElementById('categorySection')
    const mapSection = document.getElementById('mapSection')
    const timelineSection = document.getElementById('timelineSection')
    const collageSection = document.getElementById('collageSection')
    const achievementsSection = document.getElementById('achievementsSection')
    const albumsSection = document.getElementById('albumsSection')
    const albumDetailSection = document.getElementById('albumDetailSection')
    const passportSection = document.getElementById('passportSection')
    const partnerProfileSection = document.getElementById('partnerProfileSection')
    const timeCapsuleSection = document.getElementById('timeCapsuleSection')
    const gameCenterSection = document.getElementById('gameCenterSection')

    // 辅助：隐藏所有分区
    const hideAll = () => {
        uploadSection.style.display = 'none'
        categorySection.style.display = 'none'
        if (mapSection) mapSection.style.display = 'none'
        if (timelineSection) timelineSection.style.display = 'none'
        if (collageSection) collageSection.style.display = 'none'
        if (achievementsSection) achievementsSection.style.display = 'none'
        if (albumsSection) albumsSection.style.display = 'none'
        if (albumDetailSection) albumDetailSection.style.display = 'none'
        if (passportSection) passportSection.style.display = 'none'
        if (document.getElementById('moodDiarySection')) document.getElementById('moodDiarySection').style.display = 'none'
        if (document.getElementById('dailyChatterSection')) document.getElementById('dailyChatterSection').style.display = 'none'
        if (document.getElementById('intimateRecordsSection')) document.getElementById('intimateRecordsSection').style.display = 'none'
        if (document.getElementById('coupleTasksSection')) document.getElementById('coupleTasksSection').style.display = 'none'
        if (partnerProfileSection) partnerProfileSection.style.display = 'none'
        if (timeCapsuleSection) timeCapsuleSection.style.display = 'none'
        if (gameCenterSection) gameCenterSection.style.display = 'none'
    }

    if (section === 'upload') {
        if (uploadSection.style.display === 'none' || !uploadSection.style.display) {
            hideAll()
            uploadSection.style.display = 'block'
        } else {
            uploadSection.style.display = 'none'
        }
    } else if (section === 'category') {
        if (categorySection.style.display === 'none' || !categorySection.style.display) {
            hideAll()
            categorySection.style.display = 'block'
            renderParentCategorySelect()
        } else {
            categorySection.style.display = 'none'
        }
    } else if (section === 'map') {
        if (!mapSection) return
        if (mapSection.style.display === 'none' || !mapSection.style.display) {
            hideAll()
            mapSection.style.display = 'block'
            initMapView()
        } else {
            mapSection.style.display = 'none'
        }
    } else if (section === 'timeline') {
        if (!timelineSection) return
        if (timelineSection.style.display === 'none' || !timelineSection.style.display) {
            hideAll()
            timelineSection.style.display = 'block'
            initTimeline()
        } else {
            timelineSection.style.display = 'none'
        }
    } else if (section === 'collage') {
        if (!collageSection) return
        if (collageSection.style.display === 'none' || !collageSection.style.display) {
            hideAll()
            collageSection.style.display = 'block'
            loadAllPhotoCategories().then(() => renderCollageCategorySelect())
        } else {
            collageSection.style.display = 'none'
        }
    } else if (section === 'achievements') {
        if (!achievementsSection) return
        if (achievementsSection.style.display === 'none' || !achievementsSection.style.display) {
            hideAll()
            achievementsSection.style.display = 'block'
            loadAchievements()
        } else {
            achievementsSection.style.display = 'none'
        }
    } else if (section === 'albums') {
        if (!albumsSection) return
        if (albumsSection.style.display === 'none' || !albumsSection.style.display) {
            hideAll()
            albumsSection.style.display = 'block'
            loadAlbums()
        } else {
            albumsSection.style.display = 'none'
        }
    } else if (section === 'passport') {
        if (!passportSection) return
        if (passportSection.style.display === 'none' || !passportSection.style.display) {
            hideAll()
            passportSection.style.display = 'block'
            loadPassport()
        } else {
            passportSection.style.display = 'none'
        }
    } else if (section === 'moodDiary') {
        const sec = document.getElementById('moodDiarySection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            loadMoodDiary()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'dailyChatter') {
        const sec = document.getElementById('dailyChatterSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            loadDailyChatter()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'intimateRecords') {
        const sec = document.getElementById('intimateRecordsSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            checkIntimateLock()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'coupleTasks') {
        const sec = document.getElementById('coupleTasksSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            loadCoupleTasks()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'partnerProfile') {
        if (!partnerProfileSection) return
        if (partnerProfileSection.style.display === 'none' || !partnerProfileSection.style.display) {
            hideAll()
            partnerProfileSection.style.display = 'block'
            loadPartnerProfile()
        } else {
            partnerProfileSection.style.display = 'none'
        }
    } else if (section === 'secretNote') {
        const sec = document.getElementById('secretNoteSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            loadSecretNoteInbox()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'nudge') {
        const sec = document.getElementById('nudgeSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            window.checkIncomingNudges()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'emotionTimeline') {
        const sec = document.getElementById('emotionTimelineSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            window.loadEmotionTimeline()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'timeCapsule') {
        const sec = document.getElementById('timeCapsuleSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            window.loadTimeCapsules()
        } else {
            sec.style.display = 'none'
        }
    } else if (section === 'gameCenter') {
        const sec = document.getElementById('gameCenterSection')
        if (!sec) return
        if (sec.style.display === 'none' || !sec.style.display) {
            hideAll()
            sec.style.display = 'block'
            window.loadGameCenter()
        } else {
            sec.style.display = 'none'
        }
    }
}
function updateMarkedCount() {
    const el = document.getElementById('markedCount')
    if (el) el.textContent = markedCategories.size
}

window.renderMarkedCategoriesList = function() {
    const container = document.getElementById('markedCategoriesList')
    const widget = document.getElementById('markedWidget')
    
    if (!container || !widget) return
    
    if (markedCategories.size === 0) {
        widget.style.display = 'none'
        return
    }
    
    widget.style.display = 'block'
    
    // 显示所有标记的分类，不过滤（因为categories可能还没加载完）
    container.innerHTML = [...markedCategories].map(catId => {
        const cat = categories.find(c => c.id === catId)
        const displayName = cat ? cat.name : '未知分类'
        return `
            <div class="marked-item" onclick="window.filterByCategory('${catId}')">
                <span>${escapeHtml(displayName)}</span>
                <span class="unmark-btn" onclick="event.stopPropagation(); window.toggleMarkCategory('${catId}')">×</span>
            </div>
        `
    }).join('')
}

window.toggleMarkedCategories = function(event) {
    if (event) event.stopPropagation()
    const widget = document.getElementById('markedWidget')
    if (markedCategories.size === 0) {
        return
    }
    widget.classList.toggle('expanded')
}

async function initApp() {
    await checkLogin();
    
    // 重置筛选状态
    currentCategory = 'all';
    showFavoritesOnly = false;
    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) filterSelect.value = 'all';
    
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        currentPage = 1;
        searchTimeout = setTimeout(loadPhotos, 300);
    });
    
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    document.getElementById('editForm').addEventListener('submit', window.handleEdit);
}

async function loadAllPhotoCategories() {
    // 清空旧的关联
    photoCategories = {}
    
    try {
        const { data } = await supabase
            .from('photo_categories')
            .select('photo_id, category_id')
            .limit(10000)
        
        if (data) {
            data.forEach(pc => {
                const photoId = String(pc.photo_id)
                const catId = String(pc.category_id)
                if (!photoCategories[photoId]) {
                    photoCategories[photoId] = []
                }
                if (!photoCategories[photoId].includes(catId)) {
                    photoCategories[photoId].push(catId)
                }
            })
        }
    } catch (err) {
        console.error('加载照片分类关联失败:', err)
    }
}
window.loadAllPhotoCategories = loadAllPhotoCategories;
async function loadPassport() {
    try {
        const { data, error } = await supabase
            .from('photos')
            .select('id, name, storage_path, location_name')
            .not('location_name', 'is', null)
            .neq('location_name', '')
            .order('created_at', { ascending: false })
        if (error) throw error
        passportAllPhotos = data || []
        // 按 location_name 分组
        const grouped = {}
        for (const p of passportAllPhotos) {
            if (!grouped[p.location_name]) {
                grouped[p.location_name] = []
            }
            grouped[p.location_name].push(p)
        }
        passportData = Object.entries(grouped).map(([name, photos]) => ({
            name,
            count: photos.length,
            photos,
            coverPhoto: photos[0]
        }))
        sortPassportData()
        renderPassport()
    } catch (e) {
        console.error('加载足迹护照失败:', e)
        document.getElementById('passportStamps').innerHTML = '<p class="loading">加载失败</p>'
    }
}

function sortPassportData() {
    if (passportSortByPhotoCount) {
        passportData.sort((a, b) => b.count - a.count)
    } else {
        passportData.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
}

function getCityEmoji(locationName) {
    const name = locationName || ''
    const map = {
        '北京': '🏛️', '上海': '🏙️', '广州': '🌆', '深圳': '🏢',
        '杭州': '🪷', '苏州': '🏯', '南京': '🏛️', '西安': '🏰',
        '成都': '🐼', '重庆': '🌉', '武汉': '🏗️', '长沙': '🌶️',
        '昆明': '🌸', '大理': '🏔️', '丽江': '🏘️', '拉萨': '⛰️',
        '厦门': '🏖️', '青岛': '🍺', '大连': '🌊', '三亚': '🌴',
        '桂林': '🏞️', '黄山': '⛰️', '张家界': '🏔️', '九寨沟': '💧',
        '香港': '🌃', '澳门': '🎰', '台北': '🏯', '东京': '🗼',
        '大阪': '🏯', '首尔': '🏯', '曼谷': '🛕', '新加坡': '🦁',
        '巴黎': '🗼', '伦敦': '🎡', '纽约': '🗽', '悉尼': '🦘',
        '故宫': '🏯', '长城': '🧱', '天安门': '🏛️', '西湖': '🪷',
    }
    for (const [key, emoji] of Object.entries(map)) {
        if (name.includes(key)) return emoji
    }
    return '📍'
}

function renderPassport() {
    const container = document.getElementById('passportStamps')
    const locationPhotos = document.getElementById('passportLocationPhotos')
    const empty = document.getElementById('passportEmpty')
    locationPhotos.style.display = 'none'
    if (passportData.length === 0) {
        container.innerHTML = ''
        empty.style.display = 'block'
        return
    }
    empty.style.display = 'none'
    container.innerHTML = passportData.map((loc, i) => {
        const emoji = getCityEmoji(loc.name)
        const coverSrc = loc.coverPhoto ? getPhotoUrl(loc.coverPhoto.storage_path) : ''
        return `
        <div class="passport-stamp" style="animation-delay:${i * 0.05}s" onclick="window.openPassportLocation('${encodeURIComponent(loc.name)}')">
            <div class="stamp-emoji">${emoji}</div>
            <div class="stamp-name">${escapeHtml(loc.name)}</div>
            <div class="stamp-count">${loc.count} 张照片</div>
            ${coverSrc ? `<div class="stamp-cover"><img src="${coverSrc}" alt=""></div>` : ''}
        </div>`
    }).join('')
}

window.togglePassportSort = function() {
    passportSortByPhotoCount = !passportSortByPhotoCount
    document.getElementById('passportSortBtn').textContent = passportSortByPhotoCount ? '🔄 按数量排序' : '🔤 按字母排序'
    sortPassportData()
    renderPassport()
}

window.openPassportLocation = function(encodedName) {
    const name = decodeURIComponent(encodedName)
    const loc = passportData.find(l => l.name === name)
    if (!loc) return
    document.getElementById('passportStamps').style.display = 'none'
    document.getElementById('passportEmpty').style.display = 'none'
    const locationPhotos = document.getElementById('passportLocationPhotos')
    locationPhotos.style.display = 'block'
    document.getElementById('passportLocationName').textContent = name
    const grid = document.getElementById('passportLocationGrid')
    grid.innerHTML = loc.photos.map(p => {
        const imgSrc = getPhotoUrl(p.storage_path)
        return `
        <div class="photo-card" onclick="window.openPhotoModal('${p.id}')">
            <img src="${imgSrc}" alt="${escapeHtml(p.name || '')}" loading="lazy">
            <div class="photo-info">
                <h3>${escapeHtml(p.name || '未命名')}</h3>
            </div>
        </div>`
    }).join('')
}

window.closePassportLocation = function() {
    document.getElementById('passportStamps').style.display = ''
    const empty = document.getElementById('passportEmpty')
    if (passportData.length === 0) {
        empty.style.display = 'block'
    } else {
        empty.style.display = 'none'
    }
    document.getElementById('passportLocationPhotos').style.display = 'none'
}

// ========================================
// 心情日记
// ========================================

const MOOD_EMOJIS = CommonUtils.MOOD_EMOJIS;

async function loadMoodDiary() {
    try {
        const { data } = await supabase.from('mood_diary').select('*, photos(id,storage_path,name)').order('created_at', { ascending: false })
        moodDiaryEntries = (data || []).map(e => ({
            ...e,
            photo_storage_path: e.photos?.storage_path || '',
            photo_name: e.photos?.name || ''
        }))
    } catch (e) { moodDiaryEntries = [] }
    renderMoodDiary()
}

function renderMoodDiary() {
    const container = document.getElementById('moodDiaryList')
    if (!container) return
    if (moodDiaryEntries.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>📝 还没有心情记录</p><small>点击"记录心情"写第一条吧</small></div>'
        return
    }
    container.innerHTML = moodDiaryEntries.map(e => {
        const photoHtml = e.photo_id ? `<div class="timeline-photo" onclick="window.openPhotoModal('${e.photo_id}')"><img src="${getPhotoUrl(e.photo_storage_path || '')}" onerror="this.style.display='none'"></div>` : ''
        const dateStr = e.created_at ? new Date(e.created_at).toLocaleDateString('zh-CN') : ''
        return `<div class="timeline-item">
            <div class="timeline-avatar">${e.mood}</div>
            <div class="timeline-body">
                <div class="timeline-header">
                    <span class="timeline-user">${escapeHtml(e.user_name)}</span>
                    <span class="timeline-time">${dateStr}</span>
                    <button class="btn-delete" style="margin-left:auto;padding:2px 6px;font-size:11px;" onclick="event.stopPropagation();window.deleteMoodDiary(${e.id})">🗑️</button>
                </div>
                ${e.content ? `<div class="timeline-content">${escapeHtml(e.content)}</div>` : ''}
                ${photoHtml}
            </div>
        </div>`
    }).join('')
}

window.deleteMoodDiary = async function(id) {
    if (!confirm('确定删除这条心情记录吗？')) return
    await supabase.from('mood_diary').delete().eq('id', id)
    loadMoodDiary()
}

window.openMoodDiaryModal = function(editEntry) {
    window._moodPhotoData = editEntry && editEntry.photo_id ? { id: editEntry.photo_id, storage_path: editEntry.photo_storage_path || '', name: editEntry.photo_name || '' } : null
    const previewHtml = window._moodPhotoData ? `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
            <img src="${getPhotoUrl(window._moodPhotoData.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
            <div>
                <div style="font-size:13px;">${escapeHtml(window._moodPhotoData.name || '')}</div>
                <button type="button" onclick="window.clearMoodPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
            </div>
        </div>` : ''

    const modal = document.createElement('div')
    modal.className = 'modal active'
    modal.id = 'moodDiaryModal'
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('moodDiaryModal').remove()">&times;</span>
            <h3>${editEntry ? '编辑心情' : '记录心情'}</h3>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:14px;margin-bottom:8px;">选择心情</label>
                <div class="mood-picker">
                    ${MOOD_EMOJIS.map(m => `<button type="button" class="mood-btn${(editEntry && editEntry.mood === m) ? ' selected' : ''}" onclick="window.selectMood('${m}')">${m}</button>`).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>内容</label>
                <textarea id="moodDiaryContent" rows="3" placeholder="今天发生了什么...">${editEntry ? escapeHtml(editEntry.content || '') : ''}</textarea>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                ${previewHtml}
                <button type="button" class="btn btn-secondary" onclick="window.openPhotoPicker(window.onMoodPhotoPicked)">📷 选择照片</button>
            </div>
            <input type="hidden" id="moodDiaryPhotoId" value="${editEntry ? (editEntry.photo_id || '') : ''}">
            <input type="hidden" id="moodDiaryMood" value="${editEntry ? (editEntry.mood || '') : ''}">
            <button class="btn btn-primary" onclick="${editEntry ? "window.saveMoodDiary('" + editEntry.id + "')" : "window.saveMoodDiary()"}" style="width:100%;">保存</button>
        </div>
    `
    document.body.appendChild(modal)
}

window.selectMood = function(mood) {
    document.getElementById('moodDiaryMood').value = mood
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('selected', b.textContent === mood))
}

window.clearMoodPhoto = function() {
    window._moodPhotoData = null
    document.getElementById('moodDiaryPhotoId').value = ''
    const preview = document.querySelector('#moodDiaryModal .form-group:nth-of-type(2)')
    if (preview) {
        const existing = preview.querySelector('div[style]')
        if (existing) existing.remove()
    }
}

window.onMoodPhotoPicked = function(photo) {
    window._moodPhotoData = photo
    document.getElementById('moodDiaryPhotoId').value = photo.id
    // Refresh the modal to show the picked photo
    const mood = document.getElementById('moodDiaryMood').value
    const content = document.getElementById('moodDiaryContent').value
    const editId = window._editingMoodId
    document.getElementById('moodDiaryModal').remove()
    if (editId) {
        window.openMoodDiaryModal({ id: editId, mood, content, photo_id: photo.id, photo_storage_path: photo.storage_path, photo_name: photo.name })
        window._editingMoodId = editId
    } else {
        window.openMoodDiaryModal({ mood, content, photo_id: photo.id, photo_storage_path: photo.storage_path, photo_name: photo.name })
    }
}

window.saveMoodDiary = async function(editId) {
    const mood = document.getElementById('moodDiaryMood').value
    const content = document.getElementById('moodDiaryContent').value.trim()
    const photoId = document.getElementById('moodDiaryPhotoId').value.trim() || null
    if (!mood) { alert('请选择一个心情'); return }

    const row = {
        user_name: currentUser?.username || '用户',
        mood,
        content,
        photo_id: photoId || null
    }

    try {
        if (editId) {
            await supabase.from('mood_diary').update(row).eq('id', editId)
        } else {
            await supabase.from('mood_diary').insert(row)
        }
        document.getElementById('moodDiaryModal').remove()
        loadMoodDiary()
    } catch (e) {
        alert('保存失败: ' + e.message)
    }
}

// ========================================
// 每日叨叨
// ========================================

async function loadDailyChatter() {
    try {
        const { data } = await supabase.from('daily_chatter').select('*, photos(id,storage_path,name)').order('created_at', { ascending: false })
        dailyChatterEntries = (data || []).map(e => ({
            ...e,
            photo_storage_path: e.photos?.storage_path || '',
            photo_name: e.photos?.name || ''
        }))
    } catch (e) { dailyChatterEntries = [] }
    renderDailyChatter()
}

function renderDailyChatter() {
    const container = document.getElementById('dailyChatterList')
    if (!container) return
    if (dailyChatterEntries.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>💬 还没有动态</p><small>点击"发布动态"说说心里话吧</small></div>'
        return
    }
    container.innerHTML = dailyChatterEntries.map(e => {
        const avatar = e.user_name ? e.user_name.charAt(0).toUpperCase() : '?'
        const photoHtml = e.photo_id ? `<div class="timeline-photo" onclick="window.openPhotoModal('${e.photo_id}')"><img src="${getPhotoUrl(e.photo_storage_path || '')}" onerror="this.style.display='none'"></div>` : ''
        const relTime = getRelativeTime(e.created_at)
        return `<div class="timeline-item">
            <div class="timeline-avatar chatter-avatar">${avatar}</div>
            <div class="timeline-body">
                <div class="timeline-header">
                    <span class="timeline-user">${escapeHtml(e.user_name)}</span>
                    <span class="timeline-time">${relTime}</span>
                    <button class="btn-delete" style="margin-left:auto;padding:2px 6px;font-size:11px;" onclick="event.stopPropagation();window.deleteDailyChatter(${e.id})">🗑️</button>
                </div>
                <div class="timeline-content">${escapeHtml(e.content)}</div>
                ${photoHtml}
            </div>
        </div>`
    }).join('')
}

window.openDailyChatterModal = function() {
    window._chatterPhotoData = null
    const modal = document.createElement('div')
    modal.className = 'modal active'
    modal.id = 'dailyChatterModal'
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('dailyChatterModal').remove()">&times;</span>
            <h3>发布动态</h3>
            <div class="form-group">
                <textarea id="dailyChatterContent" rows="4" placeholder="今天想说什么..."></textarea>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="dailyChatterPhotoPreview"></div>
                <button type="button" class="btn btn-secondary" onclick="window.openPhotoPicker(window.onChatterPhotoPicked)">📷 选择照片</button>
            </div>
            <input type="hidden" id="dailyChatterPhotoId" value="">
            <button class="btn btn-primary" onclick="window.saveDailyChatter()" style="width:100%;">发布</button>
        </div>
    `
    document.body.appendChild(modal)
}

window.onChatterPhotoPicked = function(photo) {
    window._chatterPhotoData = photo
    document.getElementById('dailyChatterPhotoId').value = photo.id
    document.getElementById('dailyChatterPhotoPreview').innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
            <img src="${getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
            <div style="flex:1;">
                <div style="font-size:13px;">${escapeHtml(photo.name || '')}</div>
                <button type="button" onclick="window.clearChatterPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
            </div>
        </div>`
}

window.clearChatterPhoto = function() {
    window._chatterPhotoData = null
    document.getElementById('dailyChatterPhotoId').value = ''
    document.getElementById('dailyChatterPhotoPreview').innerHTML = ''
}

window.saveDailyChatter = async function() {
    const content = document.getElementById('dailyChatterContent').value.trim()
    const photoId = document.getElementById('dailyChatterPhotoId').value.trim() || null
    if (!content) { alert('请输入内容'); return }

    try {
        await supabase.from('daily_chatter').insert({
            user_name: currentUser?.username || '用户',
            content,
            photo_id: photoId || null
        })
        document.getElementById('dailyChatterModal').remove()
        loadDailyChatter()
    } catch (e) {
        alert('发布失败: ' + e.message)
    }
}

window.deleteDailyChatter = async function(id) {
    if (!confirm('确定删除这条叨叨吗？')) return
    await supabase.from('daily_chatter').delete().eq('id', id)
    loadDailyChatter()
}

// ========================================
// 通用照片选择器
// ========================================

window.openPhotoPicker = async function(callback) {
    const { data } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
    const photoList = data || [];

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'genericPhotoPicker';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;max-height:85vh;overflow-y:auto;padding:20px;">
            <span class="modal-close" onclick="document.getElementById('genericPhotoPicker').remove()">&times;</span>
            <h3>选择照片</h3>
            <input type="text" id="genericPhotoSearch" placeholder="🔍 搜索照片..."
                style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;"
                oninput="window.filterGenericPhotos()">
            <div id="genericPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
                ${photoList.map(p => `
                    <div class="generic-photo-item" data-name="${escapeHtml(p.name || '')}"
                        style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border .2s;"
                        onclick="window.pickGenericPhoto('${p.id}', '${(p.storage_path||'').replace(/'/g, "\\'")}', '${(p.name||'').replace(/'/g, "\\'")}')">
                        <img src="${getPhotoUrl(p.storage_path)}" style="width:100%;height:90px;object-fit:cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect fill=%22%23eee%22 width=%22120%22 height=%2290%22/><text x=%2260%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2212%22>无预览</text></svg>'">
                        <div style="padding:4px;font-size:11px;text-align:center;color:#666;">${escapeHtml((p.name || '').substring(0, 15))}</div>
                    </div>
                `).join('')}
            </div>
            ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
            <button class="btn btn-secondary" style="margin-top:12px;width:100%;" onclick="document.getElementById('genericPhotoPicker').remove()">取消</button>
        </div>
    `;
    document.body.appendChild(modal);
    window._photoPickerCallback = callback;
};

window.filterGenericPhotos = function() {
    const query = document.getElementById('genericPhotoSearch').value.toLowerCase();
    document.querySelectorAll('.generic-photo-item').forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
    });
};

window.pickGenericPhoto = function(id, storagePath, name) {
    if (window._photoPickerCallback) {
        window._photoPickerCallback({ id, storage_path: storagePath, name });
        window._photoPickerCallback = null;
    }
    document.getElementById('genericPhotoPicker').remove();
};

// ========================================
// 情侣打卡
// ========================================

async function loadCoupleTasks() {
    try {
        const { data: tasks } = await supabase.from('couple_tasks').select('*').order('sort_order', { ascending: true })
        coupleTasks = tasks || []
        const { data: checkins } = await supabase.from('couple_checkins').select('*, photos(id,storage_path,name)').order('checked_at', { ascending: false })
        coupleCheckins = (checkins || []).map(c => ({
            ...c,
            photo_storage_path: c.photos?.storage_path || '',
            photo_name: c.photos?.name || ''
        }))
    } catch (e) {
        coupleTasks = []
        coupleCheckins = []
    }
    renderCoupleTasks()
}

function renderCoupleTasks() {
    const container = document.getElementById('coupleTasksList')
    if (!container) return

    const filtered = currentTaskTab === 'wishes' ? coupleTasks.filter(t => t.category === 'wish') : coupleTasks.filter(t => t.category !== 'wish')

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>✅ 还没有' + (currentTaskTab === 'wishes' ? '愿望' : '任务') + '</p><small>点击上方按钮添加</small></div>'
        return
    }

    container.innerHTML = filtered.map(task => {
        const taskCheckins = coupleCheckins.filter(c => c.task_id == task.id)
        const lastCheckin = taskCheckins[0]
        const checkinCount = taskCheckins.length
        const isWish = task.category === 'wish'
        const completed = isWish && checkinCount > 0

        return `<div class="task-card${completed ? ' completed' : ''}">
            <div class="task-card-header">
                <h3 class="task-title">${escapeHtml(task.title)}</h3>
                <span class="task-checkin-badge">${checkinCount}次打卡</span>
            </div>
            ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
            <div class="task-card-footer">
                ${lastCheckin ? `<span class="task-last-checkin">最近: ${escapeHtml(lastCheckin.user_name)} ${new Date(lastCheckin.checked_at).toLocaleDateString('zh-CN')}</span>` : '<span class="task-last-checkin">还没有打卡记录</span>'}
                ${completed
                    ? '<span class="task-done-badge">已完成 ✅</span>'
                    : `<button class="btn btn-primary btn-sm" onclick="window.openCheckinModal(${task.id})">打卡</button>`
                }
            </div>
        </div>`
    }).join('')
}

window.switchTaskTab = function(tab) {
    currentTaskTab = tab
    document.getElementById('taskTabBtn_tasks').classList.toggle('active', tab === 'tasks')
    document.getElementById('taskTabBtn_wishes').classList.toggle('active', tab === 'wishes')
    renderCoupleTasks()
}

window.openAddTaskModal = function() {
    const modal = document.createElement('div')
    modal.className = 'modal active'
    modal.id = 'addTaskModal'
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('addTaskModal').remove()">&times;</span>
            <h3>添加${currentTaskTab === 'wishes' ? '愿望' : '任务'}</h3>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="newTaskTitle" placeholder="输入标题...">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="newTaskDesc" rows="2" placeholder="可选描述..."></textarea>
            </div>
            <div class="form-group">
                <label>类型</label>
                <select id="newTaskCategory" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="general" ${currentTaskTab !== 'wishes' ? 'selected' : ''}>日常</option>
                    <option value="date">约会</option>
                    <option value="travel">旅行</option>
                    <option value="wish" ${currentTaskTab === 'wishes' ? 'selected' : ''}>愿望</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="window.saveNewTask()" style="width:100%;">保存</button>
        </div>
    `
    document.body.appendChild(modal)
}

window.saveNewTask = async function() {
    const title = document.getElementById('newTaskTitle').value.trim()
    const description = document.getElementById('newTaskDesc').value.trim()
    const category = document.getElementById('newTaskCategory').value
    if (!title) { alert('请输入标题'); return }

    try {
        const maxOrder = coupleTasks.reduce((max, t) => Math.max(max, t.sort_order || 0), 0)
        await supabase.from('couple_tasks').insert({
            title, description, category, sort_order: maxOrder + 1
        })
        document.getElementById('addTaskModal').remove()
        loadCoupleTasks()
    } catch (e) {
        alert('添加失败: ' + e.message)
    }
}

window.openCheckinModal = function(taskId) {
    const task = coupleTasks.find(t => t.id == taskId)
    if (!task) return

    window._checkinPhotoData = null

    const modal = document.createElement('div')
    modal.className = 'modal active'
    modal.id = 'checkinModal'
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('checkinModal').remove()">&times;</span>
            <h3>打卡: ${escapeHtml(task.title)}</h3>
            <div class="form-group">
                <label>备注（可选）</label>
                <textarea id="checkinNote" rows="2" placeholder="写下今天的感受..."></textarea>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="checkinPhotoPreview"></div>
                <button type="button" class="btn btn-secondary" onclick="window.openPhotoPicker(window.onCheckinPhotoPicked)">📷 选择照片</button>
            </div>
            <input type="hidden" id="checkinPhotoId" value="">
            <button class="btn btn-primary" onclick="window.saveCheckin(${taskId})" style="width:100%;">确认打卡</button>
        </div>
    `
    document.body.appendChild(modal)
}

window.onCheckinPhotoPicked = function(photo) {
    window._checkinPhotoData = photo
    document.getElementById('checkinPhotoId').value = photo.id
    document.getElementById('checkinPhotoPreview').innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
            <img src="${getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
            <div style="flex:1;">
                <div style="font-size:13px;">${escapeHtml(photo.name || '')}</div>
                <button type="button" onclick="window.clearCheckinPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
            </div>
        </div>`
}

window.clearCheckinPhoto = function() {
    window._checkinPhotoData = null
    document.getElementById('checkinPhotoId').value = ''
    document.getElementById('checkinPhotoPreview').innerHTML = ''
}

window.saveCheckin = async function(taskId) {
    const note = document.getElementById('checkinNote').value.trim()
    const photoId = document.getElementById('checkinPhotoId').value.trim() || null

    try {
        await supabase.from('couple_checkins').insert({
            task_id: parseInt(taskId),
            user_name: currentUser?.username || '用户',
            note,
            photo_id: photoId || null
        })
        document.getElementById('checkinModal').remove()
        loadCoupleTasks()
    } catch (e) {
        alert('打卡失败: ' + e.message)
    }
}

// ========================================
// 亲密记录
// ========================================

async function getIntimatePassword() {
    try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'intimate_password').single()
        return data?.value || null
    } catch (e) { return null }
}

async function setIntimatePassword(password) {
    try {
        const hash = await sha256(password + APP_CONFIG.PEPPER);
        await supabase.from('app_settings').upsert({ key: 'intimate_password', value: hash })
        return true
    } catch (e) { return false }
}

async function verifyIntimatePassword(input, stored) {
    if (!stored) return false;
    // 兼容旧明文密码（长度非 64 = 不是 SHA-256 hex）
    if (stored.length !== 64) {
        if (input === stored) {
            await setIntimatePassword(input);
            return true;
        }
        return false;
    }
    // 新 hash 比较
    return await sha256(input + APP_CONFIG.PEPPER) === stored;
}

function checkIntimateLock() {
    const lockScreen = document.getElementById('intimateLockScreen')
    const content = document.getElementById('intimateContent')
    if (!lockScreen || !content) return

    // Check localStorage unlock state
    const unlockData = localStorage.getItem(INTIMATE_STORAGE_KEY)
    if (unlockData) {
        try {
            const parsed = JSON.parse(unlockData)
            if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
                lockScreen.style.display = 'none'
                content.style.display = 'block'
                intimateUnlocked = true
                loadIntimateRecords()
                return
            }
        } catch (e) { /* invalid, continue to lock */ }
    }

    // Check if password is set
    getIntimatePassword().then(pwd => {
        if (pwd) {
            lockScreen.style.display = 'flex'
            content.style.display = 'none'
            document.getElementById('intimateLockTitle').textContent = '输入密码'
            document.getElementById('intimateLockHint').textContent = '请输入密码解锁'
            document.getElementById('intimatePasswordInput').value = ''
            document.getElementById('intimateLockError').textContent = ''
        } else {
            lockScreen.style.display = 'flex'
            content.style.display = 'none'
            document.getElementById('intimateLockTitle').textContent = '设置密码'
            document.getElementById('intimateLockHint').textContent = '首次使用，请设置一个密码'
            document.getElementById('intimatePasswordInput').value = ''
            document.getElementById('intimateLockError').textContent = ''
        }
    })
}

window.handleIntimatePassword = async function() {
    const input = document.getElementById('intimatePasswordInput').value.trim()
    if (!input) { document.getElementById('intimateLockError').textContent = '请输入密码'; return }

    const existingPwd = await getIntimatePassword()

    if (!existingPwd) {
        // First time - set password
        const ok = await setIntimatePassword(input)
        if (!ok) { document.getElementById('intimateLockError').textContent = '设置失败'; return }
        unlockIntimateContent()
    } else if (await verifyIntimatePassword(input, existingPwd)) {
        unlockIntimateContent()
    } else {
        document.getElementById('intimateLockError').textContent = '密码错误'
    }
}

function unlockIntimateContent() {
    intimateUnlocked = true
    document.getElementById('intimateLockScreen').style.display = 'none'
    document.getElementById('intimateContent').style.display = 'block'
    const expiresAt = Date.now() + 30 * 60 * 1000 // 30 minutes
    localStorage.setItem(INTIMATE_STORAGE_KEY, JSON.stringify({ expiresAt }))
    loadIntimateRecords()
}

window.lockIntimate = function() {
    intimateUnlocked = false
    localStorage.removeItem(INTIMATE_STORAGE_KEY)
    document.getElementById('intimateLockScreen').style.display = 'flex'
    document.getElementById('intimateContent').style.display = 'none'
    document.getElementById('intimatePasswordInput').value = ''
    document.getElementById('intimateLockError').textContent = ''
}

async function loadIntimateRecords() {
    if (!intimateUnlocked) return
    try {
        const { data } = await supabase.from('intimate_records').select('*, photos(id,storage_path,name)').order('record_date', { ascending: false })
        intimateRecords = (data || []).map(e => ({
            ...e,
            photo_storage_path: e.photos?.storage_path || '',
            photo_name: e.photos?.name || ''
        }))
    } catch (e) { intimateRecords = [] }
    renderIntimateRecords()
}

function renderIntimateRecords() {
    const container = document.getElementById('intimateRecordsList')
    if (!container) return
    if (intimateRecords.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>🔒 还没有记录</p><small>点击"添加记录"开始记录私密时刻</small></div>'
        return
    }
    container.innerHTML = intimateRecords.map(e => {
        const photoHtml = e.photo_id ? `<div class="timeline-photo" onclick="window.openPhotoModal('${e.photo_id}')"><img src="${getPhotoUrl(e.photo_storage_path || '')}" onerror="this.style.display='none'"></div>` : ''
        const dateStr = e.record_date ? new Date(e.record_date).toLocaleDateString('zh-CN') : ''
        return `<div class="timeline-item">
            <div class="timeline-avatar">${e.mood || '💕'}</div>
            <div class="timeline-body">
                <div class="timeline-header">
                    <span class="timeline-user">${escapeHtml(e.user_name)}</span>
                    <span class="timeline-time">${dateStr}</span>
                </div>
                ${e.notes ? `<div class="timeline-content">${escapeHtml(e.notes)}</div>` : ''}
                ${photoHtml}
            </div>
        </div>`
    }).join('')
}

window.openIntimateRecordModal = function() {
    window._intimatePhotoData = null

    const modal = document.createElement('div')
    modal.className = 'modal active'
    modal.id = 'intimateRecordModal'
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('intimateRecordModal').remove()">&times;</span>
            <h3>添加亲密记录</h3>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="intimateRecordDate" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>心情</label>
                <div class="mood-picker">
                    ${MOOD_EMOJIS.map(m => `<button type="button" class="mood-btn" onclick="window.selectIntimateMood('${m}')">${m}</button>`).join('')}
                </div>
            </div>
            <input type="hidden" id="intimateRecordMood" value="">
            <div class="form-group">
                <label>备注</label>
                <textarea id="intimateRecordNotes" rows="3" placeholder="记录今天的特别时刻..."></textarea>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="intimatePhotoPreview"></div>
                <button type="button" class="btn btn-secondary" onclick="window.openPhotoPicker(window.onIntimatePhotoPicked)">📷 选择照片</button>
            </div>
            <input type="hidden" id="intimateRecordPhotoId" value="">
            <button class="btn btn-primary" onclick="window.saveIntimateRecord()" style="width:100%;">保存</button>
        </div>
    `
    document.body.appendChild(modal)
}

window.selectIntimateMood = function(mood) {
    document.getElementById('intimateRecordMood').value = mood
    document.querySelectorAll('#intimateRecordModal .mood-btn').forEach(b => b.classList.toggle('selected', b.textContent === mood))
}

window.onIntimatePhotoPicked = function(photo) {
    window._intimatePhotoData = photo
    document.getElementById('intimateRecordPhotoId').value = photo.id
    document.getElementById('intimatePhotoPreview').innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
            <img src="${getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
            <div style="flex:1;">
                <div style="font-size:13px;">${escapeHtml(photo.name || '')}</div>
                <button type="button" onclick="window.clearIntimatePhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
            </div>
        </div>`
}

window.clearIntimatePhoto = function() {
    window._intimatePhotoData = null
    document.getElementById('intimateRecordPhotoId').value = ''
    document.getElementById('intimatePhotoPreview').innerHTML = ''
}

window.saveIntimateRecord = async function() {
    const recordDate = document.getElementById('intimateRecordDate').value
    const mood = document.getElementById('intimateRecordMood').value
    const notes = document.getElementById('intimateRecordNotes').value.trim()
    const photoId = document.getElementById('intimateRecordPhotoId').value.trim() || null
    if (!recordDate) { alert('请选择日期'); return }

    try {
        await supabase.from('intimate_records').insert({
            user_name: currentUser?.username || '用户',
            record_date: recordDate,
            mood,
            notes,
            photo_id: photoId || null
        })
        document.getElementById('intimateRecordModal').remove()
        loadIntimateRecords()
    } catch (e) {
        alert('保存失败: ' + e.message)
    }
}

window.showIntimateStats = function() {
    if (intimateRecords.length === 0) {
        alert('还没有记录')
        return
    }

    // Build stats
    const total = intimateRecords.length
    const dates = intimateRecords.map(r => new Date(r.record_date))
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    const monthsDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1
    const monthlyAvg = monthsDiff > 0 ? (total / monthsDiff).toFixed(1) : total

    // Monthly counts for bar chart
    const monthCounts = {}
    intimateRecords.forEach(r => {
        const d = new Date(r.record_date)
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        monthCounts[key] = (monthCounts[key] || 0) + 1
    })
    const sortedMonths = Object.keys(monthCounts).sort().slice(-12)
    const maxCount = Math.max(...Object.values(monthCounts), 1)

    const barsHtml = sortedMonths.map(m => {
        const count = monthCounts[m] || 0
        const height = (count / maxCount * 100).toFixed(0)
        return `<div class="stat-bar-col">
            <div class="stat-bar" style="height:${height}%"></div>
            <div class="stat-bar-value">${count}</div>
            <div class="stat-bar-label">${m}</div>
        </div>`
    }).join('')

    document.getElementById('intimateRecordsList').innerHTML = `
        <div class="intimate-stats">
            <div class="stat-cards">
                <div class="stat-card">
                    <div class="stat-card-value">${total}</div>
                    <div class="stat-card-label">总次数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${monthlyAvg}</div>
                    <div class="stat-card-label">月均</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${monthsDiff}</div>
                    <div class="stat-card-label">跨度(月)</div>
                </div>
            </div>
            <h4 style="margin:16px 0 8px 0;">月度趋势</h4>
            <div class="stat-bar-chart">${barsHtml}</div>
            <button class="btn btn-secondary" onclick="renderIntimateRecords()" style="margin-top:16px;width:100%;">← 返回记录列表</button>
        </div>`
}

// ========================================
// 纪念日升级: 经期记录
// ========================================

let periodRecords = []

async function loadPeriodRecords() {
    try {
        const { data } = await supabase.from('period_records').select('*').order('start_date', { ascending: false })
        periodRecords = data || []
    } catch (e) { periodRecords = [] }
}

function predictNextPeriod() {
    if (periodRecords.length < 2) return null
    const sorted = [...periodRecords].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
    const cycles = []
    for (let i = 0; i < sorted.length - 1 && i < 3; i++) {
        const curr = new Date(sorted[i].start_date)
        const prev = new Date(sorted[i + 1].start_date)
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24))
        if (diffDays > 0 && diffDays < 60) cycles.push(diffDays)
    }
    if (cycles.length === 0) return null
    const avgCycle = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
    const lastStart = new Date(sorted[0].start_date)
    const predicted = new Date(lastStart.getTime() + avgCycle * 24 * 60 * 60 * 1000)
    return { date: predicted.toISOString().split('T')[0], avgCycle }
}

// Helper: get photo category names
function getPhotoCategoryNames(photoId) {
    const catIds = photoCategories[photoId]
    if (!catIds || catIds.length === 0) return ''
    return catIds.map(id => {
        const cat = categories.find(c => c.id === id)
        return cat ? cat.name : ''
    }).filter(Boolean).join(', ')
}

document.getElementById('batchCategoryModal').addEventListener('click', (e) => {
    if (e.target.id === 'batchCategoryModal') closeBatchCategoryModal()
})

// ========================================
// 照片漂流瓶
// ========================================

window._incomingBottle = null;

window.openThrowBottleModal = function() {
    if (!currentPhoto) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'throwBottleModal';
    const photoUrl = getPhotoUrl(currentPhoto.storage_path);
    modal.innerHTML = '<div class="modal-content modal-small" style="max-width:420px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
            '<h3 style="margin:0;">🍾 扔一个漂流瓶</h3>' +
            '<button onclick="document.getElementById(\'throwBottleModal\').remove()" class="btn-secondary" style="padding:4px 10px;">×</button>' +
        '</div>' +
        '<div style="text-align:center;margin-bottom:12px;">' +
            '<img src="' + escapeHtml(photoUrl) + '" style="max-width:120px;max-height:120px;border-radius:8px;object-fit:cover;">' +
            '<div style="font-size:12px;color:#888;margin-top:4px;">' + escapeHtml(currentPhoto.name || '') + '</div>' +
        '</div>' +
        '<textarea id="throwMsg" placeholder="想说的话（200字内）..." maxlength="200" style="width:100%;height:80px;padding:8px;border:1px solid #ddd;border-radius:8px;resize:none;font-size:14px;font-family:inherit;box-sizing:border-box;"></textarea>' +
        '<div style="margin:10px 0;font-size:13px;">' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="driftTime" value="random" checked> 🌊 1-7天内随机出现</label>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="driftTime" value="custom"> 📅 指定日期</label>' +
            '<input type="date" id="throwCustomDate" style="display:none;width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;margin-bottom:6px;">' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="driftTime" value="anniversary"> 🎂 下一个纪念日</label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
            '<button onclick="document.getElementById(\'throwBottleModal\').remove()" class="btn-secondary" style="flex:1;">取消</button>' +
            '<button onclick="window.throwBottle()" class="btn btn-primary" style="flex:1;">扔进海里🌊</button>' +
        '</div></div>';
    document.body.appendChild(modal);

    document.querySelectorAll('input[name="driftTime"]').forEach(function(r) {
        r.onchange = function() {
            document.getElementById('throwCustomDate').style.display = r.value === 'custom' ? 'block' : 'none';
        };
    });
};

window.throwBottle = async function() {
    if (!currentPhoto || !currentUser) return;
    const message = document.getElementById('throwMsg').value.trim();
    const timeMode = document.querySelector('input[name="driftTime"]:checked').value;
    const toUser = currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';

    let revealAt;
    if (timeMode === 'custom') {
        const d = document.getElementById('throwCustomDate').value;
        if (!d) { alert('请选择日期'); return; }
        revealAt = new Date(d + 'T12:00:00Z').toISOString();
    } else if (timeMode === 'anniversary') {
        const start = new Date(anniversaryStartDate);
        const now = new Date();
        let next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        while (next <= now) next.setFullYear(next.getFullYear() + 1);
        revealAt = next.toISOString();
    } else {
        const days = 1 + Math.floor(Math.random() * 7);
        revealAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    try {
        await supabase.from('drift_bottles').insert({
            from_user: currentUser.username,
            to_user: toUser,
            photo_id: currentPhoto.id,
            message: message,
            reveal_at: revealAt
        });
        document.getElementById('throwBottleModal').remove();
        alert('瓶子已扔进海里！对方将在未来某天收到这份惊喜 🌊');
    } catch (e) { alert('扔瓶子失败: ' + e.message); }
};

window.checkIncomingBottles = async function() {
    if (!currentUser) return;
    try {
        const { data } = await supabase
            .from('drift_bottles')
            .select('id, message, photo_id, thrown_at, photos(storage_path, name)')
            .eq('to_user', currentUser.username)
            .eq('status', 'drifting')
            .lte('reveal_at', new Date().toISOString())
            .order('reveal_at', { ascending: true })
            .limit(1);
        if (data && data.length > 0) {
            window._incomingBottle = data[0];
            const alertEl = document.getElementById('driftBottleAlert');
            if (alertEl) alertEl.style.display = 'flex';
        }
    } catch (e) { /* 静默 */ }
};

window.openReceivedBottle = async function() {
    const bottle = window._incomingBottle;
    if (!bottle) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'receivedBottleModal';

    let photoHtml = '';
    if (bottle.photos) {
        const url = getPhotoUrl(bottle.photos.storage_path);
        photoHtml = '<img src="' + url + '" style="max-width:100%;max-height:250px;border-radius:12px;object-fit:cover;margin-bottom:12px;">';
    }

    const thrownDays = Math.floor((Date.now() - new Date(bottle.thrown_at).getTime()) / 86400000);
    modal.innerHTML = '<div class="modal-content modal-small" style="max-width:420px;text-align:center;">' +
        '<h2 style="margin:0 0 8px;">🍾 漂流瓶</h2>' +
        '<div style="font-size:12px;color:#999;margin-bottom:12px;">' + thrownDays + '天前扔进海里的</div>' +
        photoHtml +
        '<div style="background:#fff5f5;border-radius:12px;padding:16px;font-size:15px;color:#555;margin-bottom:12px;line-height:1.6;">' + (bottle.message ? '"' + escapeHtml(bottle.message) + '"' : '（没有留言，只有一张照片）') + '</div>' +
        '<button onclick="document.getElementById(\'receivedBottleModal\').remove();window.closeIncomingBottle()" class="btn btn-primary" style="width:100%;">💝 收藏这份惊喜</button>' +
        '</div>';
    document.body.appendChild(modal);
};

window.closeIncomingBottle = async function() {
    const bottle = window._incomingBottle;
    if (!bottle) return;
    await supabase.from('drift_bottles').update({ status: 'revealed', revealed_at: new Date().toISOString() }).eq('id', bottle.id);
    window._incomingBottle = null;
    document.getElementById('driftBottleAlert').style.display = 'none';
};

// ========================================
// 对方喜好档案
// ========================================
window.partnerProfileData = null;
window._partnerProfileEditing = false;

const DEFAULT_PROFILE = CommonUtils.DEFAULT_PROFILE;

async function loadPartnerProfile() {
    const profileKey = 'partner_profile_' + (currentUser?.username || 'default');
    try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', profileKey).maybeSingle();
        if (data && data.value) {
            window.partnerProfileData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        } else {
            window.partnerProfileData = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
        }
    } catch (e) {
        window.partnerProfileData = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    }
    renderPartnerProfile();
}

function renderPartnerProfile() {
    const container = document.getElementById('partnerProfileContent');
    if (!container) return;
    const p = window.partnerProfileData;
    if (!p) { container.innerHTML = '<div class="empty-state">加载中...</div>'; return; }

    const cats = p.categories || {};
    const editBtn = document.getElementById('partnerProfileEditBtn');
    if (editBtn) editBtn.textContent = window._partnerProfileEditing ? '💾 保存' : '✏️ 编辑';
    if (editBtn) editBtn.onclick = function() {
        if (window._partnerProfileEditing) { savePartnerProfile(); } else { window.togglePartnerProfileEdit(); }
    };

    const updatedInfo = p.updated_at
        ? '<div class="profile-updated">' + (p.updated_by || '') + ' 更新于 ' + new Date(p.updated_at).toLocaleString('zh-CN') + '</div>'
        : '';

    if (window._partnerProfileEditing) {
        container.innerHTML = updatedInfo + Object.entries(cats).map(function([key, c]) {
            const likesStr = (c.likes || []).join(', ');
            const dislikesStr = (c.dislikes || []).join(', ');
            const notesStr = c.notes || '';
            const catHeader = '<div class="profile-cat-header">' +
                '<span class="profile-cat-icon">' + (c.icon || '') + '</span>' +
                '<span class="profile-cat-label">' + (c.label || key) + '</span>' +
                '<button class="btn-mini btn-danger" onclick="window.removeProfileCategory(\'' + key + '\')" title="删除分类">×</button>' +
                '</div>';
            if (key === 'other') {
                return '<div class="profile-cat-card">' + catHeader +
                    '<textarea class="profile-notes" data-key="' + key + '" placeholder="备忘...">' + escapeHtml(notesStr) + '</textarea></div>';
            }
            return '<div class="profile-cat-card">' + catHeader +
                '<label class="profile-tag-label">喜欢</label>' +
                '<div class="profile-tag-input"><input value="' + escapeHtml(likesStr) + '" data-key="' + key + '" data-type="likes" placeholder="逗号分隔，如: 火锅, 日料"><button class="btn-mini" onclick="window.addProfileTag(this)">+</button></div>' +
                '<div class="profile-tag-list" data-key="' + key + '" data-type="likes">' + (c.likes || []).map(function(t, i) { return '<span class="profile-tag">' + escapeHtml(t) + '<span class="profile-tag-x" onclick="window.removeProfileTag(this,\'' + key + '\',\'likes\',' + i + ')">×</span></span>'; }).join('') + '</div>' +
                '<label class="profile-tag-label">不喜欢</label>' +
                '<div class="profile-tag-input"><input value="' + escapeHtml(dislikesStr) + '" data-key="' + key + '" data-type="dislikes" placeholder="逗号分隔，如: 香菜, 苦瓜"><button class="btn-mini" onclick="window.addProfileTag(this)">+</button></div>' +
                '<div class="profile-tag-list" data-key="' + key + '" data-type="dislikes">' + (c.dislikes || []).map(function(t, i) { return '<span class="profile-tag">' + escapeHtml(t) + '<span class="profile-tag-x" onclick="window.removeProfileTag(this,\'' + key + '\',\'dislikes\',' + i + ')">×</span></span>'; }).join('') + '</div>' +
                '</div>';
        }).join('') + '<button class="btn btn-secondary" onclick="window.addProfileCategory()" style="width:100%;margin-top:8px;">+ 添加分类</button>';
    } else {
        // 查看模式
        const emptyCount = Object.values(cats).filter(function(c) {
            return (!c.likes || c.likes.length === 0) && (!c.dislikes || c.dislikes.length === 0) && (!c.notes);
        }).length;
        if (emptyCount === Object.keys(cats).length) {
            container.innerHTML = updatedInfo + '<div class="empty-state"><span style="font-size:48px;">💝</span><p>还没有记录对方的喜好</p><small>点击上方编辑按钮开始记录</small></div>';
            return;
        }
        container.innerHTML = updatedInfo + Object.entries(cats).map(function([key, c]) {
            const likes = (c.likes || []).length > 0 ? '<div class="profile-row"><span class="profile-row-label">喜欢</span><span>' + c.likes.map(escapeHtml).join('、') + '</span></div>' : '';
            const dislikes = (c.dislikes || []).length > 0 ? '<div class="profile-row"><span class="profile-row-label">不喜欢</span><span>' + c.dislikes.map(escapeHtml).join('、') + '</span></div>' : '';
            const notes = c.notes ? '<div class="profile-row"><span class="profile-row-label">备忘</span><span>' + escapeHtml(c.notes) + '</span></div>' : '';
            const body = likes + dislikes + notes;
            if (!body) return '';
            return '<div class="profile-cat-card">' +
                '<div class="profile-cat-header"><span class="profile-cat-icon">' + (c.icon || '') + '</span><span class="profile-cat-label">' + (c.label || key) + '</span></div>' +
                body + '</div>';
        }).join('');
    }
}

window.togglePartnerProfileEdit = function() {
    window._partnerProfileEditing = true;
    renderPartnerProfile();
};

async function savePartnerProfile() {
    const p = window.partnerProfileData;
    p.updated_by = currentUser?.username || '';
    p.updated_at = new Date().toISOString();

    // 从编辑表单收集数据
    document.querySelectorAll('.profile-tag-list').forEach(function(list) {
        const key = list.dataset.key;
        const type = list.dataset.type;
        const tags = [];
        list.querySelectorAll('.profile-tag').forEach(function(tag) {
            const text = tag.textContent.replace('×', '').trim();
            if (text) tags.push(text);
        });
        if (p.categories[key]) {
            if (type === 'likes' || type === 'dislikes') p.categories[key][type] = tags;
        }
    });
    // 从输入框解析新的逗号分隔标签
    document.querySelectorAll('.profile-tag-input input').forEach(function(input) {
        const key = input.dataset.key;
        const type = input.dataset.type;
        const raw = input.value.trim();
        if (raw) {
            const newTags = raw.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
            if (p.categories[key] && (type === 'likes' || type === 'dislikes')) {
                newTags.forEach(function(t) { if (!p.categories[key][type].includes(t)) p.categories[key][type].push(t); });
            }
        }
    });
    // 备注
    document.querySelectorAll('.profile-notes').forEach(function(ta) {
        const key = ta.dataset.key;
        if (p.categories[key]) p.categories[key].notes = ta.value.trim();
    });

    try {
        const profileKey = 'partner_profile_' + (currentUser?.username || 'default');
        await supabase.from('app_settings').upsert({ key: profileKey, value: JSON.stringify(p) });
        window._partnerProfileEditing = false;
        renderPartnerProfile();
        showToast('已保存');
    } catch (e) { showToast('保存失败: ' + e.message); }
}

window.addProfileTag = function(btn) {
    const input = btn.previousElementSibling;
    const key = input.dataset.key;
    const type = input.dataset.type;
    const raw = input.value.trim();
    if (!raw || !key || !type) return;
    const tags = raw.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
    const list = document.querySelector('.profile-tag-list[data-key="' + key + '"][data-type="' + type + '"]');
    tags.forEach(function(t) {
        const span = document.createElement('span');
        span.className = 'profile-tag';
        span.innerHTML = escapeHtml(t) + '<span class="profile-tag-x" onclick="window.removeProfileTag(this,\'' + key + '\',\'' + type + '\',' + (window.partnerProfileData.categories[key][type].length) + ')">×</span>';
        list.appendChild(span);
        window.partnerProfileData.categories[key][type].push(t);
    });
    input.value = '';
};

window.removeProfileTag = function(btn, key, type, index) {
    btn.parentElement.remove();
    if (window.partnerProfileData.categories[key] && window.partnerProfileData.categories[key][type]) {
        window.partnerProfileData.categories[key][type].splice(index, 1);
    }
};

window.addProfileCategory = function() {
    const key = prompt('分类英文标识（如: sports）');
    if (!key) return;
    const label = prompt('分类中文名（如: 运动）');
    if (!label) return;
    const icon = prompt('图标（emoji，如: ⚽）');
    if (window.partnerProfileData.categories[key]) { showToast('该分类已存在'); return; }
    window.partnerProfileData.categories[key] = { label: label, icon: icon || '📌', likes: [], dislikes: [] };
    renderPartnerProfile();
};

window.removeProfileCategory = function(key) {
    if (!confirm('删除分类 "' + (window.partnerProfileData.categories[key]?.label || key) + '" ？')) return;
    delete window.partnerProfileData.categories[key];
    renderPartnerProfile();
};

// ========================================
// 悄悄话
// ========================================
window._incomingNote = null;

function loadSecretNoteInbox() {
    const inboxEl = document.getElementById('secretNoteInbox');
    if (!inboxEl) return;
    window.checkIncomingNotes().then(function() {
        if (window._incomingNote) {
            inboxEl.innerHTML = '<div class="secret-note-preview" onclick="window.openReceivedNote()">' +
                '<div class="secret-note-icon">💌</div>' +
                '<div class="secret-note-hint">你有一张新的小纸条</div>' +
                '<div class="secret-note-action">点击打开</div>' +
                '</div>';
        } else {
            inboxEl.innerHTML = '<p class="empty-hint">还没有收到悄悄话 💭</p><small>写一张小纸条给对方吧</small>';
        }
    });
}

window.openSecretNoteSendModal = function() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'secretNoteSendModal';
    modal.innerHTML = '<div class="modal-content modal-small" style="max-width:460px;">' +
        '<span class="modal-close" onclick="document.getElementById(\'secretNoteSendModal\').remove()">&times;</span>' +
        '<h2 style="margin:0 0 16px;">💌 写张小纸条</h2>' +
        '<div style="margin-bottom:12px;">' +
        '<textarea id="secretNoteContent" placeholder="想说点什么...（200字）" maxlength="200" rows="4" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;"></textarea>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
        '<div style="font-size:13px;color:#666;margin-bottom:8px;">发送方式：</div>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;">' +
        '<input type="radio" name="secretNoteMode" value="instant" checked onchange="window.onSecretNoteModeChange()"> 📨 即时发送' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;">' +
        '<input type="radio" name="secretNoteMode" value="scheduled" onchange="window.onSecretNoteModeChange()"> ⏰ 定时送达' +
        '</label>' +
        '<div id="secretNoteScheduledRow" style="display:none;margin-left:24px;margin-bottom:6px;">' +
        '<input type="datetime-local" id="secretNoteRevealAt" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
        '<input type="radio" name="secretNoteMode" value="proximity" onchange="window.onSecretNoteModeChange()"> 📍 见面解锁' +
        '</label>' +
        '<div id="secretNoteProximityRow" style="display:none;margin-left:24px;margin-top:6px;">' +
        '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
        '<input type="number" id="secretNoteRevealLat" placeholder="纬度" step="any" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
        '<input type="number" id="secretNoteRevealLng" placeholder="经度" step="any" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:12px;color:#666;">半径:</span>' +
        '<input type="range" id="secretNoteRadius" min="50" max="1000" value="200" step="50" style="flex:1;">' +
        '<span id="secretNoteRadiusLabel" style="font-size:12px;color:#666;min-width:40px;">200m</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="document.getElementById(\'secretNoteSendModal\').remove()" class="btn btn-secondary" style="flex:1;">取消</button>' +
        '<button onclick="window.sendSecretNote()" class="btn btn-primary" style="flex:1;">送出 💌</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    setTimeout(function() {
        var slider = document.getElementById('secretNoteRadius');
        if (slider) {
            slider.addEventListener('input', function() {
                document.getElementById('secretNoteRadiusLabel').textContent = this.value + 'm';
            });
        }
        // Auto-fill coordinates for proximity mode
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                var latEl = document.getElementById('secretNoteRevealLat');
                var lngEl = document.getElementById('secretNoteRevealLng');
                if (latEl && lngEl && !latEl.value) {
                    latEl.value = pos.coords.latitude.toFixed(5);
                    lngEl.value = pos.coords.longitude.toFixed(5);
                }
            }, function() {}, { timeout: 5000 });
        }
    }, 100);
};

window.onSecretNoteModeChange = function() {
    var mode = document.querySelector('input[name="secretNoteMode"]:checked').value;
    document.getElementById('secretNoteScheduledRow').style.display = mode === 'scheduled' ? 'block' : 'none';
    document.getElementById('secretNoteProximityRow').style.display = mode === 'proximity' ? 'block' : 'none';
};

window.sendSecretNote = async function() {
    var content = document.getElementById('secretNoteContent').value.trim();
    if (!content) { alert('请写点什么吧 💌'); return; }
    var mode = document.querySelector('input[name="secretNoteMode"]:checked').value;
    var toUser = currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';
    var note = { from_user: currentUser.username, to_user: toUser, content: content, send_mode: mode };
    if (mode === 'scheduled') {
        var revealAt = document.getElementById('secretNoteRevealAt').value;
        if (!revealAt) { alert('请选择送达时间'); return; }
        note.reveal_at = new Date(revealAt).toISOString();
    } else if (mode === 'proximity') {
        var lat = parseFloat(document.getElementById('secretNoteRevealLat').value);
        var lng = parseFloat(document.getElementById('secretNoteRevealLng').value);
        if (isNaN(lat) || isNaN(lng)) { alert('请输入解锁坐标'); return; }
        note.reveal_lat = lat;
        note.reveal_lng = lng;
        note.reveal_radius = parseInt(document.getElementById('secretNoteRadius').value) || 200;
    }
    try {
        await supabase.from('secret_notes').insert(note);
        document.getElementById('secretNoteSendModal').remove();
        alert('小纸条已送出 💌');
    } catch (e) { alert('送出失败: ' + e.message); }
};

window._notesExpiredCleaned = false;

window.checkIncomingNotes = async function() {
    if (!currentUser) return;
    try {
        if (!window._notesExpiredCleaned) {
            await supabase.from('secret_notes')
                .update({ status: 'expired' })
                .eq('status', 'hidden')
                .eq('to_user', currentUser.username)
                .lt('expires_at', new Date().toISOString());
            window._notesExpiredCleaned = true;
        }
        var data = null;
        var instantResult = await supabase
            .from('secret_notes')
            .select('*')
            .eq('to_user', currentUser.username)
            .eq('status', 'hidden')
            .eq('send_mode', 'instant')
            .order('created_at', { ascending: false })
            .limit(1);
        data = instantResult.data;
        if (!data || data.length === 0) {
            var schedResult = await supabase
                .from('secret_notes')
                .select('*')
                .eq('to_user', currentUser.username)
                .eq('status', 'hidden')
                .eq('send_mode', 'scheduled')
                .lte('reveal_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1);
            data = schedResult.data;
        }
        if (data && data.length > 0) {
            window._incomingNote = data[0];
            var inboxEl = document.getElementById('secretNoteInbox');
            if (inboxEl && inboxEl.offsetParent !== null) { loadSecretNoteInbox(); }
            window.showPaperNotification();
        }
    } catch (e) { /* silent */ }
};

window.showPaperNotification = function() {
    if (!window._incomingNote) return;
    var existing = document.getElementById('secretNoteNotification');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'secretNoteNotification';
    el.className = 'secret-note-notification';
    el.innerHTML = '<span class="note-notify-icon">💌</span> 你收到了一张小纸条';
    el.onclick = function() { el.remove(); window.openReceivedNote(); };
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 5000);
};

window.openReceivedNote = async function() {
    var note = window._incomingNote;
    if (!note) return;
    var notif = document.getElementById('secretNoteNotification');
    if (notif) notif.remove();
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'receivedNoteModal';
    var time = new Date(note.created_at);
    var timeStr = time.getHours().toString().padStart(2,'0') + ':' + time.getMinutes().toString().padStart(2,'0');
    var fromName = note.from_user === 'laoda' ? '老大' : '小弟';
    modal.innerHTML = '<div class="modal-content modal-small" style="max-width:380px;text-align:center;padding:0;overflow:hidden;">' +
        '<div class="secret-note-paper" id="secretNotePaper">' +
        '<div class="secret-note-paper-inner">' +
        '<div class="secret-note-from">💌 来自 ' + escapeHtml(fromName) + '</div>' +
        '<div class="secret-note-content">' + escapeHtml(note.content) + '</div>' +
        '<div class="secret-note-time">' + timeStr + '</div>' +
        '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'receivedNoteModal\').remove();window.closeReceivedNote()" class="btn btn-primary" style="margin:16px;width:calc(100% - 32px);">💝 我知道了</button>' +
        '</div>';
    document.body.appendChild(modal);
    setTimeout(function() {
        var paper = document.getElementById('secretNotePaper');
        if (paper) paper.classList.add('unfolded');
    }, 50);
};

window.closeReceivedNote = async function() {
    var note = window._incomingNote;
    if (!note) return;
    await supabase.from('secret_notes').update({ status: 'revealed', revealed_at: new Date().toISOString() }).eq('id', note.id);
    window._incomingNote = null;
    loadSecretNoteInbox();
};

// ========================================
// 戳一戳
// ========================================
window._nudgeCooldownUntil = 0;
window._nudgeLastCheck = localStorage.getItem('nudge_lastCheck') || '1970-01-01T00:00:00Z';

window.sendNudge = async function() {
    if (Date.now() < window._nudgeCooldownUntil) {
        var secs = Math.ceil((window._nudgeCooldownUntil - Date.now()) / 1000);
        alert('请等 ' + secs + ' 秒再戳 ~');
        return;
    }
    var toUser = currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';
    try {
        await supabase.from('nudges').insert({ from_user: currentUser.username, to_user: toUser });
        window._nudgeCooldownUntil = Date.now() + 30000;
        var cdEl = document.getElementById('nudgeCooldown');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.textContent = '30秒后可再戳';
            var interval = setInterval(function() {
                var remain = Math.ceil((window._nudgeCooldownUntil - Date.now()) / 1000);
                if (remain <= 0) { cdEl.style.display = 'none'; clearInterval(interval); }
                else { cdEl.textContent = remain + '秒后可再戳'; }
            }, 1000);
        }
        // Button animation
        var btn = document.getElementById('nudgeBtn');
        if (btn) { btn.classList.add('nudged'); setTimeout(function() { btn.classList.remove('nudged'); }, 300); }
        showToast('戳了一下对方 💗');
    } catch (e) { alert('戳一戳失败: ' + e.message); }
};

window.checkIncomingNudges = async function() {
    if (!currentUser) return;
    try {
        var { data } = await supabase
            .from('nudges')
            .select('*')
            .eq('to_user', currentUser.username)
            .gt('created_at', window._nudgeLastCheck)
            .order('created_at', { ascending: false });
        if (data && data.length > 0) {
            var fromName = data[0].from_user === 'laoda' ? '老大' : '小弟';
            var time = new Date(data[data.length - 1].created_at);
            var timeStr = time.getHours().toString().padStart(2,'0') + ':' + time.getMinutes().toString().padStart(2,'0');
            var suffix = data.length > 1 ? '（共' + data.length + '次）' : '';
            window.showNudgePopup(fromName, timeStr, suffix);
        }
        window._nudgeLastCheck = new Date().toISOString();
        localStorage.setItem('nudge_lastCheck', window._nudgeLastCheck);
        // Update inbox
        var inbox = document.getElementById('nudgeInbox');
        if (inbox && (data && data.length > 0)) {
            inbox.innerHTML = '<span style="color:#e88;">💗 最近被 ' + (data[0].from_user === 'laoda' ? '老大' : '小弟') + ' 戳过</span>';
        }
    } catch (e) { /* silent */ }
};

window.showNudgePopup = function(fromName, timeStr, suffix) {
    var existing = document.getElementById('nudgePopup');
    if (existing) existing.remove();
    var popup = document.createElement('div');
    popup.id = 'nudgePopup';
    popup.className = 'nudge-popup';
    popup.innerHTML = '<span class="nudge-popup-heart">💗</span>' +
        '<span class="nudge-popup-text">' + escapeHtml(fromName) + ' 戳了戳你 ' + escapeHtml(suffix) + '</span>' +
        '<span class="nudge-popup-time">' + timeStr + '</span>';
    popup.onclick = function() { popup.remove(); };
    document.body.appendChild(popup);
    setTimeout(function() { if (popup.parentNode) { popup.classList.add('nudge-popup-out'); setTimeout(function() { if (popup.parentNode) popup.remove(); }, 400); } }, 3000);
};

// ========================================
// 情感时间轴
// ========================================
window._emotionTimelineData = [];
window._emotionTimelinePage = 1;
window._emotionTimelinePageSize = 30;
window._emotionTimelineFilters = null; // null = all types

// 时间轴隐藏照片管理
window._timelineHiddenPhotos = new Set();

window.loadTimelineHiddenPhotos = async function() {
    try { var cached = JSON.parse(localStorage.getItem('timeline_hidden_photos') || '[]'); window._timelineHiddenPhotos = new Set(cached); } catch(e) {}
    try {
        var { data } = await supabase.from('app_settings').select('value').eq('key', 'timeline_hidden_photos').maybeSingle();
        if (data && data.value) { var serverList = JSON.parse(data.value); window._timelineHiddenPhotos = new Set(serverList); localStorage.setItem('timeline_hidden_photos', JSON.stringify(serverList)); }
    } catch(e) {}
};

window.saveTimelineHiddenPhotos = async function() {
    var arr = Array.from(window._timelineHiddenPhotos);
    localStorage.setItem('timeline_hidden_photos', JSON.stringify(arr));
    try { await supabase.from('app_settings').upsert({ key: 'timeline_hidden_photos', value: JSON.stringify(arr) }); } catch(e) {}
};

var EMOTION_TYPES = CommonUtils.EMOTION_TYPES;

window.loadEmotionTimeline = async function() {
    var container = document.getElementById('emotionTimelineContainer');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载中...</p>';
    await window.loadTimelineHiddenPhotos();
    window._emotionTimelinePage = 1;
    window._emotionTimelineData = [];
    await window.fetchEmotionTimeline();
    window.renderEmotionTimeline();
    window.renderEmotionTimelineFilters();
};

window.fetchEmotionTimeline = async function() {
    var now = new Date();
    var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    var startStr = threeMonthsAgo.toISOString();
    var dateStr = startStr.split('T')[0];
    var items = [];

    try {
        var results = await Promise.allSettled([
            // 1. photos
            supabase.from('photos').select('id, name, storage_path, created_at, location_name')
                .gte('created_at', startStr).order('created_at', { ascending: false }).limit(200),
            // 2. mood_diary
            supabase.from('mood_diary').select('id, mood, content, created_at, user_name')
                .gte('created_at', startStr).order('created_at', { ascending: false }).limit(100),
            // 3. daily_chatter
            supabase.from('daily_chatter').select('id, content, created_at, user_name')
                .gte('created_at', startStr).order('created_at', { ascending: false }).limit(100),
            // 4. milestones
            supabase.from('milestones').select('id, title, date, description')
                .gte('date', dateStr).order('date', { ascending: false }).limit(100),
            // 5. couple_checkins
            supabase.from('couple_checkins').select('id, note, checked_at, user_name, couple_tasks(title)')
                .gte('checked_at', startStr).order('checked_at', { ascending: false }).limit(100),
            // 6. drift_bottles (revealed)
            supabase.from('drift_bottles').select('id, message, thrown_at, revealed_at, from_user')
                .eq('status', 'revealed').gte('revealed_at', startStr)
                .order('revealed_at', { ascending: false }).limit(50),
            // 7. time_capsules (unlocked)
            supabase.from('time_capsules').select('id, title, content, created_by, unlocked_at')
                .eq('status', 'unlocked').gte('unlocked_at', startStr)
                .order('unlocked_at', { ascending: false }).limit(50)
        ]);

        // Parse photos
        if (results[0].status === 'fulfilled' && results[0].value.data) {
            results[0].value.data.forEach(function(p) {
                if (!window._timelineHiddenPhotos.has(p.id)) {
                    items.push({ type: 'photo', time: p.created_at, data: p });
                }
            });
        }
        // Parse mood_diary
        if (results[1].status === 'fulfilled' && results[1].value.data) {
            results[1].value.data.forEach(function(m) {
                items.push({ type: 'mood', time: m.created_at, data: m });
            });
        }
        // Parse daily_chatter
        if (results[2].status === 'fulfilled' && results[2].value.data) {
            results[2].value.data.forEach(function(c) {
                items.push({ type: 'chatter', time: c.created_at, data: c });
            });
        }
        // Parse milestones (use milestone_date as time)
        if (results[3].status === 'fulfilled' && results[3].value.data) {
            results[3].value.data.forEach(function(m) {
                items.push({ type: 'milestone', time: m.date, data: m });
            });
        }
        // Parse couple_checkins
        if (results[4].status === 'fulfilled' && results[4].value.data) {
            results[4].value.data.forEach(function(c) {
                items.push({ type: 'checkin', time: c.checked_at, data: c });
            });
        }
        // Parse drift_bottles
        if (results[5].status === 'fulfilled' && results[5].value.data) {
            results[5].value.data.forEach(function(b) {
                items.push({ type: 'bottle', time: b.revealed_at, data: b });
            });
        }
        // Parse time_capsules
        if (results[6].status === 'fulfilled' && results[6].value.data) {
            results[6].value.data.forEach(function(tc) {
                items.push({ type: 'time_capsule', time: tc.unlocked_at, data: tc });
            });
        }
    } catch (e) { /* silent */ }

    // Sort by time descending
    items.sort(function(a, b) { return new Date(b.time) - new Date(a.time); });
    window._emotionTimelineData = items;
};

window.renderEmotionTimeline = function() {
    var container = document.getElementById('emotionTimelineContainer');
    if (!container) return;

    var items = window._emotionTimelineData;
    var filters = window._emotionTimelineFilters;
    if (filters) {
        items = items.filter(function(item) { return filters[item.type]; });
    }

    var visible = items.slice(0, window._emotionTimelinePage * window._emotionTimelinePageSize);
    var loadMore = document.getElementById('emotionTimelineLoadMore');
    if (loadMore) { loadMore.style.display = visible.length < items.length ? 'block' : 'none'; }

    if (visible.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:60px;">这段时间还没有记录 💭</p>';
        return;
    }

    var html = '';
    var lastDate = '';

    visible.forEach(function(item) {
        var dateStr = new Date(item.time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        if (dateStr !== lastDate) {
            lastDate = dateStr;
            html += '<div class="emotion-date-divider"><span>' + dateStr + '</span></div>';
        }
        html += window.renderEmotionItem(item);
    });

    container.innerHTML = html;
};

window.renderEmotionItem = function(item) {
    var def = EMOTION_TYPES.find(function(t) { return t.key === item.type; });
    var icon = def ? def.icon : '📌';
    var data = item.data;
    var timeStr = new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    var inner = '';
    var userLabel = '';

    if (item.type === 'photo') {
        var url = getPhotoUrl(data.storage_path);
        inner = '<div class="emotion-photo-wrap"><img src="' + escapeHtml(url) + '" class="emotion-photo-thumb" loading="lazy"></div>' +
            '<div class="emotion-photo-name">' + escapeHtml(data.name || '照片') + '</div>';
        if (data.location_name) {
            inner += '<div class="emotion-loc">📍 ' + escapeHtml(data.location_name) + '</div>';
        }
    } else if (item.type === 'mood') {
        userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
        inner = '<div class="emotion-mood-emoji">' + escapeHtml(data.mood || '😊') + '</div>' +
            '<div class="emotion-mood-text">' + escapeHtml(data.content || '') + '</div>';
    } else if (item.type === 'chatter') {
        userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
        inner = '<div class="emotion-chatter-text">' + escapeHtml(data.content || '') + '</div>';
    } else if (item.type === 'milestone') {
        inner = '<div class="emotion-milestone-title">🎉 ' + escapeHtml(data.title || '纪念日') + '</div>';
        if (data.description) {
            inner += '<div class="emotion-milestone-desc">' + escapeHtml(data.description) + '</div>';
        }
    } else if (item.type === 'checkin') {
        userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
        var taskTitle = (data.couple_tasks && data.couple_tasks.title) ? data.couple_tasks.title : '打卡';
        inner = '<div class="emotion-checkin-task">✅ ' + escapeHtml(taskTitle) + '</div>';
        if (data.note) { inner += '<div class="emotion-checkin-note">' + escapeHtml(data.note) + '</div>'; }
    } else if (item.type === 'bottle') {
        userLabel = data.from_user === 'laoda' ? '老大' : '小弟';
        inner = '<div class="emotion-bottle-msg">🍾 ' + escapeHtml(data.message || '一张照片') + '</div>';
    } else if (item.type === 'time_capsule') {
        userLabel = data.created_by === 'laoda' ? '老大' : '小弟';
        inner = '<div class="emotion-capsule-title">⏳ ' + escapeHtml(data.title || '时光胶囊') + '</div>';
        if (data.content) { inner += '<div class="emotion-capsule-content">' + escapeHtml(data.content) + '</div>'; }
    }

    var toggleBtn = '';
    if (item.type === 'photo') {
        var hidden = window._timelineHiddenPhotos.has(data.id);
        toggleBtn = '<span class="emotion-item-delete emotion-item-toggle' + (hidden ? ' emotion-item-hidden' : '') + '" onclick="event.stopPropagation();window.toggleTimelinePhotoVisibility(\'' + data.id + '\')" title="' + (hidden ? '重新显示在时间线' : '从时间线隐藏') + '">' + (hidden ? '👁' : '×') + '</span>';
    }

    return '<div class="emotion-item emotion-item-' + item.type + '">' +
        '<div class="emotion-item-header">' +
        '<span class="emotion-item-icon">' + icon + '</span>' +
        (userLabel ? '<span class="emotion-item-user">' + userLabel + '</span>' : '') +
        '<span class="emotion-item-time">' + timeStr + '</span>' +
        toggleBtn +
        '</div>' +
        '<div class="emotion-item-body">' + inner + '</div>' +
        '</div>';
};

window.loadMoreEmotionTimeline = function() {
    window._emotionTimelinePage++;
    window.renderEmotionTimeline();
};

window.toggleTimelinePhotoVisibility = async function(photoId) {
    if (window._timelineHiddenPhotos.has(photoId)) {
        // 取消隐藏
        window._timelineHiddenPhotos.delete(photoId);
        await window.saveTimelineHiddenPhotos();
        await window.fetchEmotionTimeline();
        window.renderEmotionTimeline();
    } else {
        // 从时间轴隐藏
        if (!confirm('要从时间线中隐藏这张照片吗？\n（照片本身不会被删除，仍然在相册中保留）')) return;
        window._timelineHiddenPhotos.add(photoId);
        await window.saveTimelineHiddenPhotos();
        window._emotionTimelineData = window._emotionTimelineData.filter(function(item) {
            return !(item.type === 'photo' && item.data && item.data.id === photoId);
        });
        window.renderEmotionTimeline();
    }
};

window.renderEmotionTimelineFilters = function() {
    var container = document.getElementById('emotionTimelineTypeFilters');
    if (!container) return;
    var filters = window._emotionTimelineFilters;
    container.innerHTML = EMOTION_TYPES.map(function(t) {
        var checked = !filters || filters[t.key];
        return '<label class="emotion-filter-chip' + (checked ? ' active' : '') + '" data-type="' + t.key + '">' +
            '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="display:none;">' + t.icon + ' ' + t.label +
            '</label>';
    }).join('');
    // Toggle on click
    container.querySelectorAll('.emotion-filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            this.classList.toggle('active');
            var cb = this.querySelector('input');
            cb.checked = this.classList.contains('active');
        });
    });
};

window.toggleEmotionTimelineFilter = function() {
    var el = document.getElementById('emotionTimelineFilter');
    if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
};

window.applyEmotionTimelineFilter = function() {
    var chips = document.querySelectorAll('#emotionTimelineTypeFilters .emotion-filter-chip');
    var filters = {};
    var allOn = true;
    chips.forEach(function(chip) {
        var type = chip.dataset.type;
        var checked = chip.classList.contains('active');
        filters[type] = checked;
        if (!checked) allOn = false;
    });
    window._emotionTimelineFilters = allOn ? null : filters;
    window._emotionTimelinePage = 1;
    window.renderEmotionTimeline();
    document.getElementById('emotionTimelineFilter').style.display = 'none';
};

window.resetEmotionTimelineFilter = function() {
    window._emotionTimelineFilters = null;
    window._emotionTimelinePage = 1;
    window.renderEmotionTimelineFilters();
    window.renderEmotionTimeline();
    document.getElementById('emotionTimelineFilter').style.display = 'none';
};

// 点击外部收起已标记浮窗
document.addEventListener('click', (e) => {
    const widget = document.getElementById('markedWidget')
    if (widget && widget.classList.contains('expanded')) {
        if (!widget.contains(e.target)) {
            widget.classList.remove('expanded')
        }
    }
})

// ========================================
// 游戏中心
// ========================================

window._activeGame = null;

window.loadGameCenter = function () {
    document.getElementById('gameHubView').style.display = 'block'
    document.getElementById('gamePlayArea').style.display = 'none'
    if (window._activeGame) {
        window._activeGame.destroy()
        window._activeGame = null
    }
    window.renderGameCards()
    window.loadGameLeaderboard()
};

window.renderGameCards = function () {
    var container = document.getElementById('gameCardsGrid')
    if (!container) return
    var games = [
        { id: 'memoryCard', icon: '🃏', title: '记忆翻牌', desc: '找出相同的照片配对', available: true },
        { id: 'chineseChess', icon: '♟️', title: '中国象棋', desc: '双人本地对弈，轮流走子', available: true },
        { id: 'reversi', icon: '⚫', title: '黑白棋', desc: '夹住翻转，棋子最多的获胜', available: true },
        { id: 'coupleQuiz', icon: '💑', title: '默契大考验', desc: '测测你们有多了解对方', available: false },
        { id: 'photoPuzzle', icon: '🧩', title: '照片拼图', desc: '拖动碎片还原照片', available: false }
    ]
    container.innerHTML = games.map(function (g) {
        return '<div class="game-card' + (g.available ? '' : ' disabled') + '"' +
            (g.available ? ' onclick="window.launchGame(\'' + g.id + '\')"' : '') + '>' +
            '<span class="game-card-icon">' + g.icon + '</span>' +
            '<div class="game-card-info">' +
                '<div class="game-card-title">' + g.title + '</div>' +
                '<div class="game-card-desc">' + g.desc + '</div>' +
            '</div>' +
            (g.available ? '' : '<span class="game-card-badge">即将推出</span>') +
        '</div>'
    }).join('')
};

window.launchGame = async function (gameName) {
    document.getElementById('gameHubView').style.display = 'none'
    document.getElementById('gamePlayArea').style.display = 'block'
    var container = document.getElementById('gameContainer')
    container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted);">加载游戏中...</p>'

    if (!window.GameEngine.xpBridge) {
        window.GameEngine.xpBridge = function (amount, reason) {
            console.log('[Game] XP awarded:', amount, reason)
        }
    }
    if (!window.GameEngine.supabaseClient) {
        window.GameEngine.supabaseClient = supabase
    }

    await window.GameEngine.ensureGame(gameName)

    var photoUrls = []
    if (gameName === 'memoryCard') {
        try {
            var result = await supabase.from('photos').select('storage_path').limit(50)
            var data = (result.data || [])
            for (var i = data.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1))
                var tmp = data[i]; data[i] = data[j]; data[j] = tmp
            }
            photoUrls = data.slice(0, 12).map(function (p) {
                return getPhotoUrl(p.storage_path)
            })
        } catch (e) {
            console.warn('[Game] Failed to fetch photos:', e)
        }
    }

    var game = window.GameEngine.games[gameName]
    if (!game) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#e05565;">游戏加载失败，请刷新页面重试</p>'
        return
    }

    game.init(container, {
        currentUser: currentUser,
        photoUrls: photoUrls,
        difficulty: 'normal',
        supabase: supabase,
        onScoreSubmit: function (scoreData) {
            window.submitGameScore(gameName, scoreData)
        }
    })
    game.start()
    window._activeGame = game
};

window.closeGame = function () {
    if (window._activeGame) {
        window._activeGame.destroy()
        window._activeGame = null
    }
    window.loadGameCenter()
};

window.submitGameScore = async function (gameName, scoreData) {
    try {
        // Normalize game name to snake_case for DB
        var dbGameName = gameName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        await window.GameEngine.submitScore(dbGameName, scoreData)
    } catch (e) {
        console.warn('[Game] Score submit failed:', e)
    }
};

window.loadGameLeaderboard = async function () {
    var el = document.getElementById('gameLeaderboardContent')
    if (!el) return
    try {
        var scores = await window.GameEngine.getLeaderboard('memory_card', 10)
        if (!scores || scores.length === 0) {
            el.innerHTML = '<p style="text-align:center;padding:20px;">还没有游戏记录，快来玩一局吧！</p>'
            return
        }
        el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
            '<thead><tr style="border-bottom:1px solid var(--border);">' +
            '<th style="padding:8px;text-align:left;">排名</th>' +
            '<th style="text-align:left;">玩家</th>' +
            '<th style="text-align:right;">得分</th>' +
            '<th style="text-align:right;">步数</th>' +
            '<th style="text-align:right;">用时</th>' +
            '</tr></thead><tbody>' +
            scores.map(function (s, i) {
                var name = s.user_name === 'laoda' ? '老大' : (s.user_name === 'xiaodi' ? '小弟' : s.user_name)
                var moves = (s.extra_data && s.extra_data.moves) ? s.extra_data.moves : '-'
                var timeStr = (s.extra_data && s.extra_data.time_seconds) ? window.GameEngine.formatTime(s.extra_data.time_seconds) : '-'
                return '<tr style="border-bottom:1px solid var(--border-light);">' +
                    '<td style="padding:8px;">' + (i + 1) + '</td>' +
                    '<td>' + name + '</td>' +
                    '<td style="text-align:right;">' + s.score + '</td>' +
                    '<td style="text-align:right;">' + moves + '</td>' +
                    '<td style="text-align:right;">' + timeStr + '</td>' +
                    '</tr>'
            }).join('') + '</tbody></table>'
    } catch (e) {
        el.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">排行榜加载失败</p>'
    }
};
