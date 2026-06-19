/* ========================================
   照片管理系统 - 手机版 JavaScript
   Typeform 风格移动端应用
   ======================================== */

import { supabase, USER_EMAIL_MAP, getUserFromSession as _getUserFromSession } from './src/core/supabase.js';
import { escapeHtml, sha256, getRelativeTime, formatFileSize, formatRelativeTime, highlightKeywords, safeBigint, generateShareToken, getCategoryAndChildrenIds as _getCatChildrenIds, getCategoryPath as _getCatPath, getDefaultMilestones, EMOTION_TYPES, MOOD_EMOJIS, DIETARY_RESTRICTIONS } from './src/core/utils.js';
import { loadPhotos as _loadPhotos, toggleFavorite as _toggleFavorite, deletePhoto as _deletePhoto, updatePhoto as _updatePhoto, loadAllPhotoCategories as _loadAllPhotoCategories, batchDeletePhotos as _batchDeletePhotos } from './src/core/photo-service.js';
import { loadCategories as _loadCategories, createCategory as _createCategory, deleteCategory as _deleteCategory } from './src/core/category-service.js';

const APP_CONFIG = window.__APP_CONFIG__ || {};
// 生产环境禁用 debug 日志（设置 DEBUG=true 可开启）
if (!APP_CONFIG.DEBUG) { console.log = () => {}; }

// 首页功能卡片配置（6 张，3×2 网格，可编辑排序）
const FEATURE_CARD_CONFIG = {
    moodDiary:       { id:'moodDiary', icon:'📝', title:'心情日记',   sub:'记录每一天的心情', gradient:'linear-gradient(135deg,#FFE0E6,#FFD4DD)' },
    dailyChatter:    { id:'dailyChatter', icon:'💬', title:'每日叨叨', sub:'含悄悄话',         gradient:'linear-gradient(135deg,#E0F0FF,#CCE5FF)' },
    coupleTasks:     { id:'coupleTasks', icon:'✅', title:'情侣打卡',   sub:'一起完成100件事',  gradient:'linear-gradient(135deg,#FFF3E0,#FFE8CC)' },
    map:             { id:'map', icon:'🗺️', title:'我们的地图',  sub:'走过的地方',        gradient:'linear-gradient(135deg,#E8F5E9,#C8E6C9)' },
    emotionTimeline: { id:'emotionTimeline', icon:'📜', title:'情感时间轴', sub:'纪念日·时光胶囊',  gradient:'linear-gradient(135deg,#FFF8E1,#FFECB3)' },
    periodTracker:   { id:'periodTracker', icon:'🩸', title:'周期追踪', sub:'经期记录与预测',   gradient:'linear-gradient(135deg,#FFE0E6,#FFD4DD)' }
};

const DEFAULT_FEATURE_CARD_ORDER = ['moodDiary','dailyChatter','coupleTasks','map','emotionTimeline','periodTracker'];

const mobile = {
    // 状态
    currentUser: null,
    photos: [],
    categories: [],
    markedCategories: [],
    selectedPhotos: new Set(),
    currentPhotoId: null,
    _detailTouchX: 0,
    _timelinePage: 1,
    _mainTabs: ['home', 'photos', 'profile'],
    _currentMainTab: 'home',
    _tabTouchStartX: 0,
    _gridTouchStartX: 0,
    _gridTouchStartY: 0,
    previewFiles: [],
    pendingDeleteId: null,
    pendingDeleteType: null,
    _featureCardOrder: null,
    _featureCardEditMode: false,

    // 分页状态
    currentPage: 1,
    photosPerPage: 6,
    totalPhotos: 0,

    // 收藏筛选
    showFavoritesOnly: false,

    // 当前筛选的分类
    currentCategory: 'all',
    
    // 照片-分类关联 (photo_id -> [category_ids])
    photoCategories: {},
    
    // 多选状态
    selectMode: false,

    // 主题状态
    isDarkMode: false,
    currentColorTheme: 'blue', // 'blue' | 'warm'

    // 分类加锁状态 (categoryId -> password)
    lockedCategories: {},

    // 生日彩蛋
    birthdayConfig: null,

    // 地图状态
    mapView: null,
    mapMarkers: [],
    mapPhotos: [],

    // 纪念日时间线
    anniversaryMilestones: [],
    anniversaryStartDate: null,

    // 相册状态
    albums: [],
    albumPhotos: [],
    currentAlbum: null,
    albumSelectMode: false,
    albumSelectedPhotos: new Set(),

    // 足迹护照状态
    passportSortByPhotoCount: true,
    passportData: [],
    passportAllPhotos: [],

    // 情侣功能状态
    moodDiaryEntries: [],
    dailyChatterEntries: [],
    intimateRecords: [],
    intimateUnlocked: false,
    coupleTasks: [],
    coupleCheckins: [],
    currentTaskTab: 'tasks',

    // RPG 成就系统状态
    rpgData: null,        // { xp, daily_quests, weekly_quests, unlocked_titles, active_title, custom_rewards, login_streak, last_login_date }
    _rpgXpToday: 0,       // 今日已获 XP（用于每日上限）
    _rpgXpDate: '',        // XP 日期标记
    RPG_DAILY_XP_CAP: 200,

    // 对方喜好档案
    partnerProfileData: null,
    _partnerProfileEditing: false,

    // Supabase 配置（从外部配置文件读取）
    STORAGE_URL: APP_CONFIG.SUPABASE_STORAGE_URL || (APP_CONFIG.SUPABASE_URL ? `${APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/photo/` : ''),

    escapeHtml,
    sha256,
    safeBigint,
    highlightKeywords,
    formatRelativeTime,
    getRelativeTime,
    formatFileSize,
    generateShareToken,
    getDefaultMilestones,
    getUserFromSession: _getUserFromSession,
    getCategoryAndChildrenIds: function (id) { return _getCatChildrenIds(id, this.categories); },
    getCategoryPath: function (id) { return _getCatPath(id, this.categories, 'name'); },

    // 周期追踪状态
    _periodCalendarYear: null,
    _periodCalendarMonth: null,
    // 忌口打卡状态
    _dietaryWindowStart: null,
    _dietaryWindowEnd: null,
    _dietaryCheckins: {},
    _dietaryTodayDone: false,
    _periodEditingDate: null,
    _periodRecords: {},
    _periodAllRecords: [],
    _periodPanelState: null,

    // 懒加载模块管理
    _loadedModules: {},
    _MODULE_VERSION: '4',

    // 初始化 Supabase 客户端（委托给 src/core/supabase.js）
    initSupabase() {
        return supabase;
    },

    // 照片选择入口（使用 Capacitor Camera 原生插件）
    async pickPhotos() {
        var cap = window.Capacitor;
        if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
            try {
                var cam = cap.Plugins && cap.Plugins.Camera;
                if (cam && cam.pickImages) {
                    var result = await cam.pickImages({ quality: 90, limit: 0 });
                    if (!result || !result.photos || result.photos.length === 0) return;

                    var files = [];
                    for (var i = 0; i < result.photos.length; i++) {
                        var photo = result.photos[i];
                        var resp = await fetch(photo.webPath);
                        var blob = await resp.blob();
                        var fname = (photo.path || 'photo').split('/').pop() || ('photo_' + Date.now() + '_' + i + '.jpg');
                        files.push(new File([blob], fname, { type: 'image/jpeg' }));
                    }
                    this.previewFiles = files;
                    this._showUploadPreviews(files);
                    this.showToast('已选择 ' + files.length + ' 张照片');
                    return;
                }
            } catch(e) {
                console.error('Camera error:', e);
            }
        }
        // 浏览器回退
        var input = document.getElementById('photoInput');
        if (input) input.click();
    },

    _showUploadPreviews(files) {
        var area = document.getElementById('previewArea');
        var grid = document.getElementById('previewGrid');
        if (!area || !grid) return;
        area.style.display = 'block';
        grid.innerHTML = '';
        var self = this;
        for (var i = 0; i < files.length; i++) {
            (function(idx) {
                var file = files[idx];
                var item = document.createElement('div');
                item.className = 'preview-item';
                var img = document.createElement('img');
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                // FileReader 兼容 Android WebView（URL.createObjectURL 不可靠）
                var reader = new FileReader();
                reader.onload = function(e) { img.src = e.target.result; };
                reader.onerror = function() { img.src = ''; item.innerHTML = '<div style=\"color:red;font-size:11px;\">预览失败</div>'; };
                reader.readAsDataURL(file);
                var btn = document.createElement('button');
                btn.className = 'remove-btn';
                btn.textContent = 'x';
                btn.onclick = function() { self._removePreview(idx); };
                item.appendChild(img);
                item.appendChild(btn);
                grid.appendChild(item);
            })(i);
        }
    },

    _removePreview(index) {
        this.previewFiles.splice(index, 1);
        if (this.previewFiles.length === 0) {
            document.getElementById('previewArea').style.display = 'none';
        } else {
            this._showUploadPreviews(this.previewFiles);
        }
    },

    // 上传照片（直接放这里，不依赖懒加载模块）
    async uploadPhotos() {
        var self = this;
        if (!this.previewFiles || this.previewFiles.length === 0) {
            this.showToast('请先选择照片');
            return;
        }
        var supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }

        var progressSection = document.getElementById('uploadProgress');
        var progressFill = document.getElementById('progressFill');
        var progressText = document.getElementById('progressText');
        var uploadBtn = document.getElementById('uploadBtn');
        if (progressSection) progressSection.style.display = 'block';
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '上传中...'; }

        var total = this.previewFiles.length;
        var namePrefix = (document.getElementById('mobilePhotoName')?.value || '').trim();
        var description = (document.getElementById('mobilePhotoDesc')?.value || '').trim();
        var categoryId = this.getSelectedUploadCategoryId ? this.getSelectedUploadCategoryId() : null;
        var locationName = (document.getElementById('mobilePhotoLocationName')?.value || '').trim() || null;
        var latitude = parseFloat(document.getElementById('mobilePhotoLatitude')?.value) || null;
        var longitude = parseFloat(document.getElementById('mobilePhotoLongitude')?.value) || null;

        var successCount = 0, failCount = 0;
        for (var i = 0; i < total; i++) {
            var file = this.previewFiles[i];
            var ext = '.' + file.name.split('.').pop().toLowerCase();
            var allowedExts = ['.jpg','.jpeg','.png','.gif','.webp','.heic','.heif'];
            if (!allowedExts.includes(ext)) { failCount++; continue; }

            var fileName = namePrefix ? (namePrefix + '_' + (i + 1)) : file.name;
            var uniqueName = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.' + file.name.split('.').pop();

            try {
                var uploadResult = await supabase.storage.from('photo').upload(uniqueName, file, { cacheControl: '3600', upsert: false });
                if (uploadResult.error) throw uploadResult.error;

                var insertResult = await supabase.from('photos').insert([{
                    name: fileName, description: description, storage_path: uniqueName,
                    original_name: file.name, size: file.size, is_favorite: false,
                    latitude: latitude, longitude: longitude, location_name: locationName
                }]).select().single();
                if (insertResult.error) throw insertResult.error;
                successCount++;

                if (categoryId && insertResult.data) {
                    try {
                        await supabase.from('photo_categories').insert([{ photo_id: insertResult.data.id, category_id: categoryId }]);
                    } catch(e) {}
                }
            } catch(e) {
                console.error('Upload error:', e);
                failCount++;
            }
            if (progressFill) progressFill.style.width = Math.round((i+1)/total*100) + '%';
            if (progressText) progressText.textContent = Math.round((i+1)/total*100) + '%';
        }

        this.showToast(successCount > 0 ? '成功上传 ' + successCount + ' 张' : '上传失败，请重试');
        if (progressSection) progressSection.style.display = 'none';
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '上传照片'; }

        // 清预览
        this.previewFiles = [];
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('mobilePhotoName').value = '';
        document.getElementById('mobilePhotoDesc').value = '';
        var ln = document.getElementById('mobilePhotoLocationName'); if (ln) ln.value = '';
        var la = document.getElementById('mobilePhotoLatitude'); if (la) la.value = '';
        var lo = document.getElementById('mobilePhotoLongitude'); if (lo) lo.value = '';

        // 记住分类
        if (categoryId) { try { localStorage.setItem('lastUploadCategoryId', categoryId); } catch(e) {} }
    },

    // 删除照片（弹出确认框）
    deletePhoto() {
        this.pendingDeleteId = this.currentPhotoId;
        this.pendingDeleteType = 'photo';
        var titleEl = document.getElementById('confirmTitle');
        var msgEl = document.getElementById('confirmMessage');
        if (titleEl) titleEl.textContent = '删除照片';
        if (msgEl) msgEl.textContent = '确定要删除这张照片吗？';
        var modal = document.getElementById('confirmModal');
        if (modal) { modal.style.display = 'flex'; modal.classList.add('active'); }
    },

    // 确认删除
    async confirmDelete() {
        var supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        var type = this.pendingDeleteType;
        var id = this.pendingDeleteId;

        if (type === 'photo' && id) {
            try {
                await supabase.from('photo_categories').delete().eq('photo_id', id);
                await supabase.from('comments').delete().eq('photo_id', id);
                var _r = await supabase.from('photos').delete().eq('id', id);
                if (_r.error) throw _r.error;
                this.photos = this.photos.filter(function(p) { return p.id !== id; });
                this.renderPhotos();
                this.showToast('照片已删除');
            } catch(e) {
                console.error(e);
                this.showToast('删除失败');
            }
        } else if (type === 'batch-photo' && this.selectedPhotos && this.selectedPhotos.size > 0) {
            var ids = Array.from(this.selectedPhotos);
            var count = 0;
            for (var i = 0; i < ids.length; i++) {
                try {
                    await supabase.from('photo_categories').delete().eq('photo_id', ids[i]);
                    await supabase.from('comments').delete().eq('photo_id', ids[i]);
                    await supabase.from('photos').delete().eq('id', ids[i]);
                    count++;
                } catch(e) { console.error(e); }
            }
            this.photos = this.photos.filter(function(p) { return !ids.includes(p.id); });
            this.selectedPhotos.clear();
            this.renderPhotos();
            this.showToast('已删除 ' + count + ' 张照片');
        }

        var modal = document.getElementById('confirmModal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
        this.pendingDeleteId = null;
        this.pendingDeleteType = null;
    },

    // 自动检测更新
    async checkUpdate() {
        try {
            var curVer = (window.__APP_CONFIG__ || {}).APP_VERSION || '1.0.0';
            var resp = await fetch('https://api.github.com/repos/qixingovo/photo-manager-v2/releases/latest');
            if (!resp.ok) return;
            var release = await resp.json();
            var latestVer = (release.tag_name || '').replace('v', '').replace('-android', '');
            if (!latestVer) return;

            // 比较版本号
            var cur = curVer.split('.').map(Number);
            var lat = latestVer.split('.').map(Number);
            var newer = false;
            for (var i = 0; i < Math.max(cur.length, lat.length); i++) {
                if ((lat[i] || 0) > (cur[i] || 0)) { newer = true; break; }
                if ((lat[i] || 0) < (cur[i] || 0)) break;
            }
            if (!newer) return;

            // 有新版本
            var isCap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
            var msg = '发现新版本 v' + latestVer + '（当前 v' + curVer + '）\n\n' + (release.body || '').substring(0, 200);
            if (confirm(msg + '\n\n是否前往下载？')) {
                if (isCap) {
                    // APK：直接打开 GitHub Release 页面
                    window.open(release.html_url, '_blank');
                } else {
                    window.open(release.html_url, '_blank');
                }
            }
        } catch(e) {
            console.log('Update check skipped:', e.message);
        }
    },

    getUserFromSession(session) {
        const username = session?.username || '用户';
        const metadataRole = session?.role || 'user';
        const isLaoda = metadataRole === 'laoda';
        return {
            username,
            role: metadataRole,
            displayRole: isLaoda ? '老大' : '用户',
            isLaoda
        };
    },

    // 获取照片公开URL
    getPhotoUrl(storagePath) {
        if (!storagePath) return null;
        return this.STORAGE_URL + storagePath;
    },

    // 等待 Supabase CDN 加载完成
    waitForSupabase(callback, retries = 0) {
        if (typeof window.supabase !== 'undefined') {
            callback();
        } else if (retries < 50) {
            setTimeout(() => this.waitForSupabase(callback, retries + 1), 100);
        } else {
            console.error('Supabase 加载超时');
            callback(); // 继续执行，以防万一
        }
    },
    
    // 初始化
    init() {
        // 初始化主题
        this.initTheme();
        
        // 等待 Supabase CDN 加载完成后再初始化
        Promise.all([
            this._ensureModule("diary"),
            this._ensureModule("extras")
        ]).then(() => {
            this.waitForSupabase(() => {
                this.checkLogin();
                this.loadMarkedCategories();
            });
        });
    },

    // ========================================
    // 主题相关
    // ========================================
    initTheme() {
        const savedTheme = localStorage.getItem('photoTheme');
        this.isDarkMode = savedTheme === 'dark';
        this.currentColorTheme = localStorage.getItem('photoColorTheme') || 'blue';
        this.applyTheme();

        // 加载加锁的分类
        try {
            const saved = localStorage.getItem('lockedCategories');
            this.lockedCategories = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.lockedCategories = {};
        }
    },

    applyTheme() {
        // 夜间模式优先（覆盖颜色主题）
        if (this.isDarkMode) {
            document.body.classList.add('dark');
            document.body.classList.remove('warm');
        } else {
            document.body.classList.remove('dark');
            // 颜色主题仅在日间模式下生效
            if (this.currentColorTheme === 'warm') {
                document.body.classList.add('warm');
            } else {
                document.body.classList.remove('warm');
            }
        }
    },

    setColorTheme(mode) {
        this.currentColorTheme = mode;
        localStorage.setItem('photoColorTheme', mode);
        this.applyTheme();
        const label = mode === 'warm' ? '🌸 暖粉' : '💙 蓝色经典';
        this.showToast(label);
        // 同步到 DB
        this._syncThemeToDB();
    },

    async _syncThemeToDB() {
        try {
            if (!this.currentUser) return;
            await supabase.from('app_settings').upsert({
                key: 'mobile_color_theme',
                value: JSON.stringify({
                    color_theme: this.currentColorTheme,
                    dark_mode: this.isDarkMode
                })
            }, { onConflict: 'key' });
        } catch (e) {
            // 非关键操作，静默失败
        }
    },

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('photoTheme', this.isDarkMode ? 'dark' : 'light');
        this.applyTheme();
        this.showToast(this.isDarkMode ? '🌙 夜间模式' : '☀️ 日间模式');
        this._syncThemeToDB();
    },

    showSettings() {
        // 创建设置弹窗
        const modal = document.createElement('div');
        modal.id = 'settingsModal';
        modal.className = 'modal-overlay';
        const isWarm = this.currentColorTheme === 'warm';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>⚙️ 设置</h3>
                <div class="settings-item">
                    <span class="settings-label">🎨 颜色主题</span>
                    <div class="settings-theme-selector">
                        <button class="settings-theme-btn${isWarm ? '' : ' active'}" onclick="mobile.setColorTheme('blue')">💙 蓝色经典</button>
                        <button class="settings-theme-btn${isWarm ? ' active' : ''}" onclick="mobile.setColorTheme('warm')">🌸 暖粉</button>
                    </div>
                </div>
                <div class="settings-item">
                    <span class="settings-label">🌙 夜间模式</span>
                    <label class="switch">
                        <input type="checkbox" id="themeToggle" ${this.isDarkMode ? 'checked' : ''} onchange="mobile.toggleTheme()">
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="modal-actions">
                    <button class="btn-primary" onclick="mobile.closeSettings()">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeSettings();
            }
        });
    },

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.remove();
        }
    },

    // ========================================
    // 生日彩蛋
    // ========================================
    async loadBirthdayConfig() {
        try {
            const client = this.initSupabase();
            if (client) {
                const { data } = await client.from('app_settings').select('value').eq('key', 'birthday_config').single();
                if (data && data.value) {
                    this.birthdayConfig = JSON.parse(data.value);
                    localStorage.setItem('birthday_config', JSON.stringify(this.birthdayConfig));
                    return;
                }
            }
        } catch (e) { /* DB fail, fallback */ }
        try {
            this.birthdayConfig = JSON.parse(localStorage.getItem('birthday_config') || 'null');
            if (!this.birthdayConfig) {
                this.birthdayConfig = { month: 6, day: 22, name: '老大' };
            }
        } catch (e) {
            this.birthdayConfig = { month: 6, day: 22, name: '老大' };
        }
    },

    isBirthdayToday() {
        if (!this.birthdayConfig) return false;
        const today = new Date();
        return today.getMonth() + 1 === this.birthdayConfig.month && today.getDate() === this.birthdayConfig.day;
    },

    async saveBirthdayConfig(config) {
        this.birthdayConfig = config;
        localStorage.setItem('birthday_config', JSON.stringify(config));
        try {
            const client = this.initSupabase();
            if (client) {
                await client.from('app_settings').upsert({ key: 'birthday_config', value: JSON.stringify(config) }, { onConflict: 'key' });
            }
        } catch (e) { /* DB fail, localStorage still has it */ }
    },

    // ========== 生日惊喜：蓝色星愿礼盒（移动版）==========

    async loadPhotosByCategory(categoryName) {
        try {
            const client = this.initSupabase();
            if (!client) return [];
            const _c = await client.from('categories').select('id').eq('name', categoryName).single();
            if (!_c.data) return [];
            const _p = await client.from('photo_categories').select('photo_id').eq('category_id', _c.data.id);
            if (!_p.data || _p.data.length === 0) return [];
            const ids = _p.data.map(r => r.photo_id);
            const _photos = await client.from('photos').select('*').in('id', ids);
            return _photos.data || [];
        } catch(e) { return []; }
    },

    getStorageUrl(photo) {
        const cfg = window.__APP_CONFIG__ || {};
        const base = cfg.SUPABASE_STORAGE_URL || (cfg.SUPABASE_URL ? cfg.SUPABASE_URL + '/storage/v1/object/public/photo/' : '');
        if (photo.storage_path && photo.storage_path.startsWith('http')) return photo.storage_path;
        return base + (photo.storage_path || '');
    },

    getDaysTogether() {
        try {
            const cached = localStorage.getItem('app_settings_cache');
            if (cached) {
                const map = JSON.parse(cached);
                if (map.anniversary_start_date) {
                    return Math.floor((new Date() - new Date(map.anniversary_start_date)) / 86400000);
                }
            }
        } catch(e) {}
        return 0;
    },

    async showBirthdayWelcomeOverlay() {
        const self = this;
        await self.loadBirthdayConfig();
        const cfg = self.birthdayConfig || { month: 6, day: 22, name: '老大' };

        // 预加载照片
        const carouselPhotos = await self.loadPhotosByCategory('老大和小弟');
        const couplePhotos = await self.loadPhotosByCategory('合照');
        let couplePhoto = null;
        if (couplePhotos.length > 0) couplePhoto = couplePhotos[Math.floor(Math.random() * couplePhotos.length)];

        const daysTogether = self.getDaysTogether();
        const daysText = daysTogether > 0 ? '一起走过了 ' + daysTogether + ' 天 💙' : '';

        const overlay = document.createElement('div');
        overlay.id = 'mobileBirthdayOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1a3b;overflow:hidden;';

        overlay.innerHTML =
            '<canvas id="mobileStarsCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;"></canvas>' +
            '<canvas id="mobileBurstCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;"></canvas>' +
            '<div id="mbPhase1" class="mb-phase" style="position:relative;z-index:2;text-align:center;color:white;padding:20px;">' +
              '<p style="font-size:1rem;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:0.5s;letter-spacing:2px;">今天是个特别的日子 ✨</p>' +
            '</div>' +
            '<div id="mbPhase2" class="mb-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;padding:20px;">' +
              '<div class="mb-shooting-star" style="position:absolute;top:-40px;left:-80px;width:80px;height:2px;background:linear-gradient(90deg,transparent,#A8D8EA,#fff);border-radius:2px;transform:rotate(-35deg);opacity:0;animation:mbShootStar 1.5s ease-in forwards;"></div>' +
              '<h1 style="font-size:1.6rem;font-weight:bold;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:1.2s;text-shadow:0 2px 10px rgba(168,216,234,0.5);">提前祝老大生日快乐 🩵</h1>' +
              '<p style="font-size:0.8rem;opacity:0;animation:fadeInUp 1s ease forwards;animation-delay:1.5s;margin-top:6px;color:rgba(168,216,234,0.7);">🎂 真正生日是6月22日</p>' +
            '</div>' +
            '<div id="mbPhase3" class="mb-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;width:90%;max-width:360px;">' +
              '<div class="carousel-frame" style="background:rgba(255,255,255,0.1);border-radius:16px;padding:12px;backdrop-filter:blur(10px);border:1.5px solid rgba(168,216,234,0.3);">' +
                '<img id="mbCarouselImg" src="" style="width:100%;max-height:40vh;object-fit:contain;border-radius:10px;transition:opacity 0.6s ease;" />' +
              '</div>' +
              '<p style="font-size:0.9rem;opacity:0.7;margin-top:12px;letter-spacing:1px;">我们的回忆 💙</p>' +
              '<p id="mbCarouselCounter" style="font-size:0.75rem;opacity:0.5;margin-top:2px;"></p>' +
            '</div>' +
            '<div id="mbPhase4" class="mb-phase" style="display:none;position:relative;z-index:2;text-align:center;color:white;padding:20px;">' +
              '<div id="mbGiftBox" onclick="mobile.openMobileGift()" style="cursor:pointer;position:relative;margin-bottom:20px;">' +
                '<div style="width:100px;height:80px;background:linear-gradient(135deg,#6CB4EE,#4A90D9);border-radius:10px;margin:0 auto;position:relative;box-shadow:0 6px 25px rgba(74,144,217,0.4);">' +
                  '<div style="position:absolute;top:38%;left:0;width:100%;height:14px;background:rgba(255,255,255,0.5);border-radius:3px;"></div>' +
                  '<div style="position:absolute;left:50%;top:0;width:14px;height:100%;background:rgba(255,255,255,0.35);border-radius:3px;transform:translateX(-50%);"></div>' +
                '</div>' +
                '<div id="mbGiftLid" style="width:110px;height:24px;background:linear-gradient(135deg,#7EC8F8,#5BA0E8);border-radius:6px;margin:0 auto;position:relative;top:-2px;transform-origin:right bottom;transition:transform 0.6s ease;box-shadow:0 3px 12px rgba(74,144,217,0.3);">' +
                  '<div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);">' +
                    '<div style="width:24px;height:16px;border:2.5px solid rgba(255,255,255,0.7);border-radius:50% 50% 0 0;border-bottom:none;"></div>' +
                    '<div style="width:5px;height:5px;background:rgba(255,255,255,0.7);border-radius:50%;margin:1.5px auto 0;"></div>' +
                  '</div>' +
                '</div>' +
                '<p style="margin-top:14px;font-size:0.85rem;opacity:0.6;animation:bounceHint 1.5s ease-in-out infinite;">点击打开 🎀</p>' +
              '</div>' +
              '<div id="mbGiftCard" style="display:none;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border-radius:20px;padding:20px;max-width:320px;margin:0 auto;border:1.5px solid rgba(168,216,234,0.3);animation:scaleIn 0.6s ease;">' +
                (couplePhoto ? '<img src="'+self.getStorageUrl(couplePhoto)+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:14px;margin-bottom:14px;" />' : '<div style="font-size:50px;margin-bottom:14px;">🎂</div>') +
                '<p style="font-size:1rem;margin-bottom:6px;">提前祝老大生日快乐 🩵</p>' +
                '<p style="font-size:0.7rem;opacity:0.6;margin-bottom:2px;">🎂 真正生日：6月22日</p>' +
                '<p style="font-size:0.8rem;opacity:0.7;margin-bottom:14px;">' + daysText + '</p>' +
                '<button onclick="mobile.enterFromBirthday()" style="padding:12px 40px;font-size:1rem;background:rgba(255,255,255,0.9);color:#4A90D9;border:none;border-radius:50px;cursor:pointer;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.1);">进入系统 💙</button>' +
              '</div>' +
            '</div>' +
            '<div style="position:fixed;bottom:20px;right:16px;z-index:10;display:flex;gap:8px;align-items:center;">' +
              '<p style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-right:2px;">' +
                '<select id="mobileBirthdayMonth" onchange="mobile.updateBirthdayConfigMobile()" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 4px;font-size:10px;">' +
                  [1,2,3,4,5,6,7,8,9,10,11,12].map(m => '<option value="'+m+'"'+(m===cfg.month?' selected':'')+'>'+m+'月</option>').join('') +
                '</select>' +
                '<select id="mobileBirthdayDay" onchange="mobile.updateBirthdayConfigMobile()" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 4px;font-size:10px;">' +
                  Array.from({length:31},(_,i) => '<option value="'+(i+1)+'"'+(i+1===cfg.day?' selected':'')+'>'+(i+1)+'日</option>').join('') +
                '</select>' +
              '</p>' +
              '<button id="mobileMusicToggle" onclick="mobile.toggleBirthdayMusicMobile(event)" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;width:32px;height:32px;border-radius:50%;font-size:13px;cursor:pointer;">🔇</button>' +
            '</div>' +
            '<style>' +
              '.mb-phase { transition: opacity 0.8s ease; }' +
              '@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }' +
              '@keyframes mbShootStar { 0% { opacity:0; left:-80px; } 20% { opacity:1; } 80% { opacity:1; } 100% { opacity:0; left:calc(100% + 80px); } }' +
              '@keyframes bounceHint { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }' +
              '@keyframes scaleIn { from { transform:scale(0.7); opacity:0; } to { transform:scale(1); opacity:1; } }' +
              '@keyframes fadeOut { to { opacity:0; } }' +
            '</style>';

        document.body.appendChild(overlay);
        self._startMobileStars();

        // 阶段调度
        const p1 = document.getElementById('mbPhase1');
        const p2 = document.getElementById('mbPhase2');
        const p3 = document.getElementById('mbPhase3');
        const p4 = document.getElementById('mbPhase4');

        function switchPhase(from, to) {
            if (from) { from.style.opacity = '0'; setTimeout(() => { from.style.display = 'none'; }, 800); }
            setTimeout(() => { if (to) { to.style.display = 'block'; requestAnimationFrame(() => { to.style.opacity = '1'; }); } }, 400);
        }

        setTimeout(() => {
            switchPhase(p1, p2);
            setTimeout(() => {
                switchPhase(p2, p3);
                // phase3 display 延迟 400ms 才变 block，等它可见再启动轮播
                setTimeout(() => { self._startMobileCarousel(carouselPhotos); }, 500);
                setTimeout(() => {
                    switchPhase(p3, p4);
                    overlay.style.background = 'linear-gradient(180deg, #0b1a3b 0%, #1a3a6b 40%, #2A5C8A 100%)';
                    overlay.style.transition = 'background 1.5s ease';
                }, (carouselPhotos.length || 3) * 2500 + 500);
            }, 2800);
        }, 2200);
    },

    _startMobileStars() {
        const canvas = document.getElementById('mobileStarsCanvas');
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        const stars = [];
        for (let i = 0; i < 80; i++) {
            stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: 0.5+Math.random()*1.8, twinkle: Math.random()*Math.PI*2, speed: 0.01+Math.random()*0.03 });
        }
        const self = this;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach(s => { s.twinkle += s.speed; ctx.fillStyle = 'rgba(255,255,255,'+(0.3+0.7*(0.5+0.5*Math.sin(s.twinkle)))+')'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill(); });
            self.__mobileStarsId = requestAnimationFrame(draw);
        }
        draw();
    },

    _startMobileCarousel(photos) {
        const self = this;
        const img = document.getElementById('mbCarouselImg');
        const counter = document.getElementById('mbCarouselCounter');
        if (!img || photos.length === 0) return;
        let idx = 0;
        function showNext() {
            const p3 = document.getElementById('mbPhase3');
            if (!p3 || p3.style.display === 'none') return; // phase 未显示，等下一轮
            img.style.opacity = '0';
            setTimeout(() => { img.src = self.getStorageUrl(photos[idx]); img.style.opacity = '1'; counter.textContent = (idx+1)+' / '+photos.length; idx = (idx+1) % photos.length; }, 600);
        }
        showNext();
        self.__mobileCarouselTimer = setInterval(showNext, 2500);
    },

    openMobileGift() {
        const lid = document.getElementById('mbGiftLid');
        const box = document.getElementById('mbGiftBox');
        const card = document.getElementById('mbGiftCard');
        if (!lid || lid.style.transform === 'rotate(-130deg)') return;
        lid.style.transform = 'rotate(-130deg)';
        lid.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
        const hint = box.querySelector('p');
        if (hint) hint.style.display = 'none';

        // 粒子
        const rect = box.getBoundingClientRect();
        const canvas = document.getElementById('mobileBurstCanvas');
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');
            const particles = [];
            const colors = ['#89CFF0','#A8D8EA','#BFE4F5','#FFB6C1','#E8D5F5','#FFE4E1','#FFFFFF','#87CEEB'];
            const cx = rect.left + rect.width/2, cy = rect.top;
            for (let i = 0; i < 60; i++) {
                const angle = Math.random()*Math.PI*2, speed = 3+Math.random()*6;
                particles.push({ x:cx, y:cy, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-Math.random()*5, size:3+Math.random()*10, color:colors[Math.floor(Math.random()*colors.length)], alpha:1, life:50+Math.random()*60, age:0 });
            }
            const self = this;
            function anim() {
                ctx.clearRect(0,0,canvas.width,canvas.height);
                let alive = false;
                particles.forEach(p => {
                    p.x += p.vx*0.5; p.y += p.vy*0.5; p.vy += 0.08; p.age++;
                    p.alpha = 1 - p.age/p.life;
                    if (p.alpha <= 0) return;
                    alive = true;
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.alpha;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1;
                });
                if (alive) self.__mobileBurstId = requestAnimationFrame(anim);
                else canvas.style.display = 'none';
            }
            anim();
        }

        setTimeout(() => { if (card) card.style.display = 'block'; box.style.pointerEvents = 'none'; }, 600);
    },

    enterFromBirthday() {
        if (this.__mobileStarsId) { cancelAnimationFrame(this.__mobileStarsId); }
        if (this.__mobileBurstId) { cancelAnimationFrame(this.__mobileBurstId); }
        if (this.__mobileCarouselTimer) { clearInterval(this.__mobileCarouselTimer); }
        const overlay = document.getElementById('mobileBirthdayOverlay');
        if (overlay) overlay.remove();
        this.showPage('home');
        this.loadData().catch(err => console.error('加载数据失败:', err));
    },

    async updateBirthdayConfigMobile() {
        const m = document.getElementById('mobileBirthdayMonth');
        const d = document.getElementById('mobileBirthdayDay');
        if (!m || !d) return;
        await this.saveBirthdayConfig({ month: parseInt(m.value), day: parseInt(d.value), name: '老大' });
    },

    toggleBirthdayMusicMobile(e) {
        e.stopPropagation();
        let audio = document.getElementById('mobileBirthdayMusic');
        const btn = document.getElementById('mobileMusicToggle');
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'mobileBirthdayMusic';
            audio.loop = true;
            audio.style.display = 'none';
            audio.innerHTML = '<source src="assets/birthday-bgm.mp3" type="audio/mpeg">';
            document.body.appendChild(audio);
        }
        if (audio.paused) { audio.play().catch(()=>{}); if (btn) btn.textContent = '🔊'; }
        else { audio.pause(); if (btn) btn.textContent = '🔇'; }
    },

    // ========================================
    // 登录相关
    // ========================================
    async checkLogin() {
        const client = this.initSupabase();
        if (!client) {
            this.showPage('login');
            return;
        }

        let { data: { session } } = await client.auth.getSession();
        if (!session) {
            const saved = localStorage.getItem('pm2_session');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const { data: { session: restored }, error: restoreErr } = await client.auth.setSession({
                        access_token: parsed.access_token,
                        refresh_token: parsed.refresh_token
                    });
                    if (!restoreErr && restored) session = restored;
                } catch(e) {}
            }
        }
        if (session) {
            const { data: profile } = await client.from('profiles')
                .select('username, role').eq('user_id', session.user.id).single();
            if (profile) {
                this.currentUser = _getUserFromSession({ username: profile.username, role: profile.role });
                this.showPage('home');
                this.renderFeatureCards();
                this._renderFloatingBall();
                this._loadFeatureCardOrderFromServer().then(() => this.renderFeatureCards());
                this.loadData().catch(err => {
                    console.error('加载数据失败:', err);
                    this.showToast('数据加载失败，请刷新重试');
                });
                return;
            } else {
                await client.auth.signOut();
            }
        }

        // 尝试自动登录（记住我）
        const savedCreds = localStorage.getItem('pm2_creds');
        if (savedCreds) {
            try {
                const dec = atob(savedCreds);
                const colon = dec.indexOf(':');
                if (colon > 0) {
                    const savedAccount = dec.substring(0, colon);
                    const savedPwd = dec.substring(colon + 1);
                    const savedEmail = USER_EMAIL_MAP[savedAccount];
                    if (savedEmail) {
                        const { data, error: autoErr } = await client.auth.signInWithPassword({ email: savedEmail, password: savedPwd });
                        if (!autoErr && data?.session) {
                            localStorage.setItem('pm2_session', JSON.stringify({
                                access_token: data.session.access_token,
                                refresh_token: data.session.refresh_token,
                                expires_at: data.session.expires_at
                            }));
                            const { data: autoProfile } = await client.from('profiles').select('username, role').eq('user_id', data.user.id).single();
                            if (autoProfile) {
                                this.currentUser = _getUserFromSession({ username: autoProfile.username, role: autoProfile.role });
                                this.showPage('home');
                                this.renderFeatureCards();
                                this._renderFloatingBall();
                                this._loadFeatureCardOrderFromServer().then(() => this.renderFeatureCards());
                                this.loadData().catch(err => { console.error('加载数据失败:', err); this.showToast('数据加载失败，请刷新重试'); });
                                setTimeout(() => self.checkUpdate(), 3000);
                                return;
                            }
                        }
                    }
                }
            } catch(e) {}
            // 自动登录失败，清除失效凭证
            localStorage.removeItem('pm2_creds');
        }

        this.currentUser = null;
        this.showPage('login');
    },

    async handleLogin(e) {
        e.preventDefault();
        const account = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe')?.checked;
        const errorEl = document.getElementById('loginError');
        const client = this.initSupabase();

        if (!account || !password) {
            errorEl.textContent = '请输入账号和密码';
            return;
        }

        if (!client) {
            errorEl.textContent = '登录服务不可用，请稍后重试';
            return;
        }

        const email = USER_EMAIL_MAP[account];
        if (!email) {
            errorEl.textContent = '账号不存在';
            return;
        }

        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('登录失败:', error);
            alert('登录失败\n' + (error.message || JSON.stringify(error)) + '\n\n请截图发给我');
            errorEl.textContent = '登录失败: ' + (error.message || '未知错误');
            return;
        }

        // 记住我：加密保存凭证
        if (rememberMe) {
            try {
                const enc = btoa(account + ':' + password);
                localStorage.setItem('pm2_creds', enc);
            } catch(e) {}
        } else {
            localStorage.removeItem('pm2_creds');
        }

        // 手动持久化 session
        if (data?.session) {
            localStorage.setItem('pm2_session', JSON.stringify({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }));
        }

        // 查 profiles 取 username/role
        const { data: profile } = await client.from('profiles')
            .select('username, role').eq('user_id', data.user.id).single();

        if (!profile) {
            errorEl.textContent = '用户档案缺失，请联系管理员';
            await client.auth.signOut();
            return;
        }

        this.currentUser = _getUserFromSession({ username: profile.username, role: profile.role });
        errorEl.textContent = '';

        // 老大生日彩蛋
        await this.loadBirthdayConfig();
        if (this.currentUser.isLaoda && this.isBirthdayToday()) {
            this.showBirthdayWelcomeOverlay();
            return;
        }

        // 先跳转页面
        this.showPage('home');
        this.renderFeatureCards();
        this._renderFloatingBall();
        this._loadFeatureCardOrderFromServer().then(() => this.renderFeatureCards());

        // 再加载数据（不阻塞页面显示）
        this.loadData().catch(err => {
            console.error('加载数据失败:', err);
            this.showToast('数据加载失败，请刷新重试');
        });
        // 静默检测更新
        setTimeout(() => this.checkUpdate(), 3000);
    },

    async handleLogout() {
        const client = this.initSupabase();
        this.currentUser = null;
        if (client) await client.auth.signOut();
        this.showPage('login');
        this.showToast('已退出登录');
    },

    openChangePasswordModal() {
        document.getElementById('oldPasswordMobile').value = '';
        document.getElementById('newPasswordMobile').value = '';
        document.getElementById('confirmPasswordMobile').value = '';
        document.getElementById('changePasswordMobileError').style.display = 'none';
        document.getElementById('changePasswordMobileSuccess').style.display = 'none';
        document.getElementById('changePasswordMobileModal').style.display = 'flex';
    },

    closeChangePasswordModal() {
        document.getElementById('changePasswordMobileModal').style.display = 'none';
    },

    async handleChangePassword(e) {
        e.preventDefault();
        const oldPwd = document.getElementById('oldPasswordMobile').value;
        const newPwd = document.getElementById('newPasswordMobile').value;
        const confirmPwd = document.getElementById('confirmPasswordMobile').value;
        const errorEl = document.getElementById('changePasswordMobileError');
        const successEl = document.getElementById('changePasswordMobileSuccess');
        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        if (newPwd !== confirmPwd) { errorEl.textContent = '两次输入的新密码不一致'; errorEl.style.display = 'block'; return; }
        if (newPwd.length < 4) { errorEl.textContent = '新密码至少4个字符'; errorEl.style.display = 'block'; return; }

        const saved = JSON.parse(localStorage.getItem('pm2_session') || '{}');
        const token = saved?.access_token;
        if (!token) { errorEl.textContent = '未登录，请刷新后重试'; errorEl.style.display = 'block'; return; }

        try {
            const supabaseUrl = window.__APP_CONFIG__?.SUPABASE_URL || '';
            const res = await fetch(supabaseUrl + '/auth/v1/user/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
            });
            const data = await res.json();
            if (!res.ok) { errorEl.textContent = data.error || '修改失败'; errorEl.style.display = 'block'; return; }
            successEl.style.display = 'block';
            setTimeout(() => this.closeChangePasswordModal(), 1500);
        } catch (err) {
            errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block';
        }
    },

    // ========================================
    // 页面导航
    // ========================================
    showPage(page) {
        // 未登录只能访问 login 页面
        if (page !== 'login' && page !== 'detail') {
            if (!this.currentUser) {
                this.showPage('login');
                return;
            }
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(page + 'Page').classList.add('active');

        // 为非主页添加返回按钮（照片页已有导航栏，不需要自动加）
        if (page !== 'home' && page !== 'login' && page !== 'photos' && page !== 'detail') {
            const pageEl = document.getElementById(page + 'Page');
            const topBar = pageEl ? pageEl.querySelector('.top-bar') : null;
            if (topBar && !topBar.querySelector('.back-btn')) {
                const backBtn = document.createElement('button');
                backBtn.className = 'icon-btn back-btn';
                const backTarget = (page === 'upload' || page === 'category') ? 'photos'
                                 : (page === 'secretNote') ? 'dailyChatter'
                                 : (page === 'timeline' || page === 'timeCapsule') ? 'emotionTimeline'
                                 : 'home';
                backBtn.innerHTML = '←';
                backBtn.title = backTarget === 'photos' ? '返回照片'
                              : backTarget === 'dailyChatter' ? '返回每日叨叨'
                              : backTarget === 'emotionTimeline' ? '返回情感时间轴'
                              : '返回首页';
                backBtn.onclick = function(e) { e.stopPropagation(); mobile.switchTab(backTarget); };
                topBar.insertBefore(backBtn, topBar.firstChild);
            }
        }

        // 更新底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // 主 tab 支持滑动切换，子页面禁用
        const isMainTab = this._mainTabs.includes(page);
        if (isMainTab) {
            this._currentMainTab = page;
            if (!this._tabSwipeBound) {
                this._tabSwipeBound = true;
                this._boundTabTouchStart = this._tabTouchStart.bind(this);
                this._boundTabTouchEnd = this._tabTouchEnd.bind(this);
                document.body.addEventListener('touchstart', this._boundTabTouchStart, { passive: true });
                document.body.addEventListener('touchend', this._boundTabTouchEnd, { passive: true });
            }
        } else if (this._tabSwipeBound) {
            this._tabSwipeBound = false;
            document.body.removeEventListener('touchstart', this._boundTabTouchStart);
            document.body.removeEventListener('touchend', this._boundTabTouchEnd);
        }

        // 照片列表页支持滑动翻页
        if (page === 'photos') {
            if (!this._gridSwipeBound) {
                this._gridSwipeBound = true;
                this._boundGridTouchStart = this._gridTouchStart.bind(this);
                this._boundGridTouchEnd = this._gridTouchEnd.bind(this);
                document.body.addEventListener('touchstart', this._boundGridTouchStart, { passive: true });
                document.body.addEventListener('touchend', this._boundGridTouchEnd, { passive: true });
            }
        } else if (this._gridSwipeBound) {
            this._gridSwipeBound = false;
            document.body.removeEventListener('touchstart', this._boundGridTouchStart);
            document.body.removeEventListener('touchend', this._boundGridTouchEnd);
        }

        // 隐藏底部导航在详情页和登录页
        const bottomNav = document.getElementById('bottomNav');
        if (page === 'detail' || page === 'login') {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }
    },

    // 头像上传
    pickAvatar(n) {
        document.getElementById('avatarInput' + n).click();
    },

    async uploadAvatar(n, event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }

        try {
            // 先压缩图片（最大 300x300）
            const blob = await this._resizeAvatar(file, 300);
            const path = 'avatars/' + (this.currentUser?.isLaoda ? 'laoda' : 'xiaodi') + '-' + n + '-' + Date.now() + '.jpg';
            const { error } = await supabase.storage.from('photo').upload(path, blob, {
                contentType: 'image/jpeg',
                upsert: true
            });
            if (error) throw error;

            // 生成公开URL
            const { data: urlData } = supabase.storage.from('photo').getPublicUrl(path);
            const url = urlData?.publicUrl;
            if (url) {
                localStorage.setItem('avatar_url_' + n, url);
                await supabase.from('app_settings').upsert({ key: 'avatar_' + n, value: url });
                this._showAvatar(n, url);
            }
        } catch (e) {
            // 兜底：存 base64 到 localStorage
            const reader = new FileReader();
            reader.onload = function() {
                localStorage.setItem('avatar_url_' + n, reader.result);
                mobile._showAvatar(n, reader.result);
            };
            reader.readAsDataURL(file);
        }
    },

    _resizeAvatar(file, maxSize) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h && w > maxSize) { h = h * maxSize / w; w = maxSize; }
                else if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(function(b) { resolve(b); }, 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    },

    _showAvatar(n, url) {
        const img = document.getElementById('avatarImg' + n);
        const placeholder = document.querySelector('#avatar' + n + ' .avatar-placeholder');
        if (img) { img.src = url; img.style.display = ''; }
        if (placeholder) placeholder.style.display = 'none';
    },

    async _loadAvatars() {
        var supabase = this.initSupabase();
        var self = this;
        for (var n = 1; n <= 2; n++) {
            var url = null;
            // 优先从数据库加载
            if (supabase) {
                try {
                    var { data } = await supabase.from('app_settings').select('value').eq('key', 'avatar_' + n).maybeSingle();
                    if (data && data.value) {
                        url = data.value;
                        localStorage.setItem('avatar_url_' + n, url);
                    }
                } catch (e) { /* fallback to localStorage */ }
            }
            // 兜底 localStorage
            if (!url) url = localStorage.getItem('avatar_url_' + n);
            if (url) self._showAvatar(n, url);
        }
    },

    // 加载恋爱纪念起始日期（首页横幅需要）
    async _loadStartDate() {
        this.anniversaryStartDate = localStorage.getItem('anniversary_start_date') || '2020-06-15';
        var supabase = this.initSupabase();
        if (!supabase) return;
        try {
            var resp = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'anniversary_start_date')
                .single();
            if (!resp.error && resp.data) {
                this.anniversaryStartDate = resp.data.value;
            } else if (!resp.error) {
                await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: this.anniversaryStartDate });
            }
        } catch (e) { /* 静默 */ }
    },

    // 渲染暖粉风格情侣横幅
    async renderCoupleBanner() {
        if (!this._startDateLoaded) {
            await this._loadStartDate();
            this._startDateLoaded = true;
        }
        const startDate = this.anniversaryStartDate || '2020-06-15';
        const start = new Date(startDate);
        const today = new Date();
        const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
        const daysEl = document.getElementById('coupleDays');
        const name1El = document.getElementById('coupleName1');
        const name2El = document.getElementById('coupleName2');

        if (daysEl) {
            daysEl.textContent = '在一起的第 ' + diffDays + ' 天';
        }
        if (name1El && this.currentUser) {
            name1El.textContent = this.currentUser.isLaoda ? '老大' : '小弟';
        }
        if (name2El && this.currentUser) {
            name2El.textContent = this.currentUser.isLaoda ? '小弟' : '老大';
        }
        await this._loadAvatars();
    },

    // ========================================
    // 功能卡片 编辑模式
    // ========================================

    // 加载功能卡片顺序
    loadFeatureCardOrder() {
        try {
            const saved = localStorage.getItem('featureCardOrder');
            if (saved) {
                const order = JSON.parse(saved);
                const validIds = Object.keys(FEATURE_CARD_CONFIG);
                if (Array.isArray(order) && order.length === validIds.length &&
                    validIds.every(id => order.includes(id))) {
                    this._featureCardOrder = order;
                    return;
                }
            }
        } catch (e) { /* fall through to default */ }
        this._featureCardOrder = [...DEFAULT_FEATURE_CARD_ORDER];
    },

    // 保存功能卡片顺序（localStorage + app_settings）
    async saveFeatureCardOrder(order) {
        this._featureCardOrder = [...order];
        localStorage.setItem('featureCardOrder', JSON.stringify(order));
        try {
            if (this.currentUser) {
                await supabase.from('app_settings').upsert({
                    key: 'feature_card_order',
                    value: JSON.stringify(order)
                }, { onConflict: 'key' });
            }
        } catch (e) { /* 非关键操作 */ }
    },

    // 从 Supabase 加载卡片顺序（登录后调用）
    async _loadFeatureCardOrderFromServer() {
        try {
            if (!this.currentUser) return;
            const { data } = await supabase.from('app_settings')
                .select('value').eq('key', 'feature_card_order').maybeSingle();
            if (data?.value) {
                const order = JSON.parse(data.value);
                const validIds = Object.keys(FEATURE_CARD_CONFIG);
                if (Array.isArray(order) && order.length === validIds.length &&
                    validIds.every(id => order.includes(id))) {
                    this._featureCardOrder = order;
                    localStorage.setItem('featureCardOrder', JSON.stringify(order));
                }
            }
        } catch (e) { /* fallback to localStorage */ }
    },

    // 渲染功能卡片
    renderFeatureCards() {
        const container = document.getElementById('featureCardsContainer');
        if (!container) return;

        if (!this._featureCardOrder) this.loadFeatureCardOrder();

        container.innerHTML = '';

        this._featureCardOrder.forEach((id, index) => {
            const cfg = FEATURE_CARD_CONFIG[id];
            if (!cfg) return;

            const card = document.createElement('div');
            card.className = 'feature-card';
            card.setAttribute('data-card-id', id);
            card.setAttribute('data-card-index', index);
            card.style.background = cfg.gradient;

            card.addEventListener('click', (e) => {
                if (this._featureCardEditMode) return;
                if (e.target.closest('.feature-card-order-arrows')) return;
                this.switchTab(cfg.id);
            });

            const iconSpan = document.createElement('span');
            iconSpan.className = 'feature-icon';
            iconSpan.textContent = cfg.icon;
            card.appendChild(iconSpan);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'feature-title';
            titleSpan.textContent = cfg.title;
            card.appendChild(titleSpan);

            const subSpan = document.createElement('span');
            subSpan.className = 'feature-sub';
            subSpan.textContent = cfg.sub;
            card.appendChild(subSpan);

            // 编辑模式箭头
            const arrows = document.createElement('div');
            arrows.className = 'feature-card-order-arrows';
            arrows.style.display = this._featureCardEditMode ? 'flex' : 'none';
            arrows.innerHTML = `
                <button class="feature-arrow-btn" data-action="up" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="feature-arrow-btn" data-action="down" ${index === this._featureCardOrder.length - 1 ? 'disabled' : ''}>▼</button>
            `;

            arrows.querySelectorAll('.feature-arrow-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    this.moveFeatureCard(id, action);
                });
            });
            card.appendChild(arrows);

            container.appendChild(card);
        });

        this._updateEditBar();
    },

    // 更新编辑栏状态
    _updateEditBar() {
        const bar = document.getElementById('featureCardEditBar');
        const btn = document.getElementById('featureCardEditToggle');
        if (!bar || !btn) return;
        bar.style.display = this.currentUser ? 'flex' : 'none';
        btn.textContent = this._featureCardEditMode ? '✅ 完成排序' : '✏️ 编辑排序';
        btn.className = 'feature-edit-toggle' + (this._featureCardEditMode ? ' editing' : '');
        document.getElementById('featureCardsContainer').classList.toggle('edit-mode', this._featureCardEditMode);
    },

    // 切换编辑模式
    toggleFeatureCardEdit() {
        this._featureCardEditMode = !this._featureCardEditMode;
        if (!this._featureCardEditMode) {
            this.saveFeatureCardOrder(this._featureCardOrder);
        }
        this.renderFeatureCards();
    },

    // 移动卡片
    async moveFeatureCard(cardId, direction) {
        if (!this._featureCardEditMode) return;
        const order = [...this._featureCardOrder];
        const idx = order.indexOf(cardId);
        if (idx === -1) return;

        let targetIdx;
        if (direction === 'up') {
            if (idx === 0) return;
            targetIdx = idx - 1;
        } else {
            if (idx === order.length - 1) return;
            targetIdx = idx + 1;
        }

        [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
        await this.saveFeatureCardOrder(order);
        this.renderFeatureCards();
    },

    // 戳一戳按钮包装：懒加载 extras 模块
    nudgeOrLoad() {
        var self = this;
        if (this.sendNudge) { this.sendNudge(); return; }
        this._ensureModule('extras').then(function() { self.sendNudge(); });
    },

    // 地图选点按钮包装：懒加载 map 模块
    pickLocationOrLoad() {
        var self = this;
        if (this.pickLocationOnMap) { this.pickLocationOnMap(); return; }
        this._ensureModule('map').then(function() { self.pickLocationOnMap(); });
    },

    // 模块懒加载：用 <script> 标签注入代替 import()（兼容 Android WebView file:// 限制）
    _ensureModule(name) {
        if (this._loadedModules[name]) return Promise.resolve();
        var moduleMap = {
            'photos': 'modules/photos-module.js',
            'categories': 'modules/photos-module.js',
            'map': 'modules/map-passport-module.js',
            'timeline': 'modules/timeline-module.js',
            'albums': 'modules/albums-module.js',
            'diary': 'modules/diary-module.js',
            'records': 'modules/records-module.js',
            'extras': 'modules/extras-module.js'
        };
        var deps = { 'photos': ['extras'], 'diary': ['photos', 'extras'], 'records': ['photos', 'extras'], 'albums': ['extras'] };
        var self = this;

        // 递归加载依赖
        function loadWithDeps(n) {
            var chain = Promise.resolve();
            if (deps[n]) {
                deps[n].forEach(function(d) { chain = chain.then(function() { return self._ensureModule(d); }); });
            }
            return chain.then(function() {
                var f = moduleMap[n];
                if (!f || self._loadedModules[n]) return;
                return new Promise(function(resolve, reject) {
                    var script = document.createElement('script');
                    script.src = f + '?v=' + self._MODULE_VERSION;
                    script.onload = function() {
                        self._loadedModules[n] = true;
                        resolve();
                    };
                    script.onerror = function() {
                        reject(new Error('Failed to load: ' + f));
                    };
                    document.head.appendChild(script);
                });
            });
        }
        return loadWithDeps(name);
    },

    _showModuleLoading() {
        var bar = document.getElementById('moduleLoadingBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'moduleLoadingBar';
            bar.className = 'module-loading-bar';
            document.body.appendChild(bar);
        }
        // 强制回流后添加 active class，确保 transition 生效
        bar.offsetHeight;
        bar.classList.add('active');
    },

    _hideModuleLoading() {
        var bar = document.getElementById('moduleLoadingBar');
        if (!bar) return;
        bar.classList.remove('active');
    },

    _showPageLoading() {
        var self = this;
        if (this._pageLoadingTimer) return;
        this._pageLoadingTimer = setTimeout(function() {
            self._pageLoadingTimer = null;
            var overlay = document.getElementById('pageLoadingOverlay');
            if (overlay) overlay.classList.add('active');
        }, 200);
    },

    _hidePageLoading() {
        if (this._pageLoadingTimer) {
            clearTimeout(this._pageLoadingTimer);
            this._pageLoadingTimer = null;
        }
        var overlay = document.getElementById('pageLoadingOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    _renderFloatingBall() {
        var ball = document.getElementById('dietaryFloatingBall');
        if (!ball) return;

        var self = this;
        this._ensureModule('extras').then(function() {
            if (self._checkDietaryWindowCompletion) self._checkDietaryWindowCompletion();
            if (self._isInDietaryWindow && self._isInDietaryWindow()) {
                ball.style.display = 'flex';
                var todayRec = self._getTodayDietaryCheckin ? self._getTodayDietaryCheckin() : null;
                var dot = document.getElementById('dietaryBallDot');
                if (dot) dot.style.display = (todayRec && todayRec.completed) ? 'none' : 'block';
                ball.style.opacity = (todayRec && todayRec.completed) ? '0.6' : '1';
            } else {
                ball.style.display = 'none';
            }
        }).catch(function() {
            ball.style.display = 'none';
        });
    },

    switchTab(tab) {
        if (tab === 'home') {
            this.showPage('home');
            this.renderFeatureCards();
            this._renderFloatingBall();
            this.renderCoupleBanner();
            this._ensureModule('extras').then(() => {
                this.checkIncomingBottles();
                this.checkIncomingNotes();
                this.checkIncomingNudges();
                this.checkTimeCapsules();
            });
        } else if (tab === 'photos') {
            this.showPage('photos');
            this._showPageLoading();
            var self = this;
            Promise.all([
                this.photos.length === 0 && this.categories.length === 0 ? this.loadData() : Promise.resolve(),
                this._ensureModule('photos')
            ]).then(function() {
                self.updateCategorySelects();
                if (self.updateCategoryPathDisplay) self.updateCategoryPathDisplay();
                self.renderPhotos();
            }).finally(() => this._hidePageLoading());
        } else if (tab === 'upload') {
            this.showPage('upload');
            this._showPageLoading();
            // 确保分类数据已加载
            var self = this;
            Promise.all([
                this.categories.length === 0 ? this.loadCategories() : Promise.resolve(),
                this._ensureModule('photos')
            ]).then(function() {
                self.renderUploadCategoryCascade();
            }).finally(() => this._hidePageLoading());
        } else if (tab === 'category') {
            this.showPage('category');
            this._showPageLoading();
            var self = this;
            Promise.all([
                this.categories.length === 0 ? this.loadCategories() : Promise.resolve(),
                this._ensureModule('categories')
            ]).then(function() {
                self.renderCategories();
            }).finally(() => this._hidePageLoading());
        } else if (tab === 'map') {
            this.showPage('map');
            this._showPageLoading();
            this._ensureModule('map').then(() => this.initMapView()).finally(() => this._hidePageLoading());
        } else if (tab === 'timeline') {
            this.showPage('timeline');
            this._showPageLoading();
            this._ensureModule('timeline').then(() => this.initTimeline()).finally(() => this._hidePageLoading());
        } else if (tab === 'collage') {
            this.showPage('collage');
            this._showPageLoading();
            this._ensureModule('extras').then(() => {
                return this.loadAllPhotoCategories().then(() => this.renderMobileCollageCategorySelect());
            }).finally(() => this._hidePageLoading());
        } else if (tab === 'achievements') {
            this.showPage('achievements');
            this._showPageLoading();
            this._ensureModule('extras').then(() => this.loadAchievements()).finally(() => this._hidePageLoading());
        } else if (tab === 'albums') {
            this.showPage('albums');
            this._showPageLoading();
            this._ensureModule('albums').then(() => this.loadAlbums()).finally(() => this._hidePageLoading());
        } else if (tab === 'periodTracker') {
            this.showPage('periodTracker');
            this._showPageLoading();
            var self = this;
            var now = new Date();
            this._periodCalendarYear = now.getFullYear();
            this._periodCalendarMonth = now.getMonth() + 1;
            this._ensureModule('extras').then(() => self.loadPeriodTracker()).finally(() => this._hidePageLoading());
        } else if (tab === 'gameCenter') {
            this.showPage('gameCenter');
            this._showPageLoading();
            this._ensureModule('extras').then(() => this.loadGameCenter()).finally(() => this._hidePageLoading());
        } else if (tab === 'passport') {
            this.showPage('passport');
            this._showPageLoading();
            this._ensureModule('map').then(() => this.loadPassport()).finally(() => this._hidePageLoading());
        } else if (tab === 'moodDiary') {
            this.showPage('moodDiary');
            this._showPageLoading();
            this._ensureModule('diary').then(() => this.loadMoodDiary()).finally(() => this._hidePageLoading());
        } else if (tab === 'dailyChatter') {
            this.showPage('dailyChatter');
            this._showPageLoading();
            this._ensureModule('diary').then(() => this.loadDailyChatter()).finally(() => this._hidePageLoading());
        } else if (tab === 'intimateRecords') {
            this.showPage('intimateRecords');
            this._showPageLoading();
            this._ensureModule('records').then(() => this.checkIntimateLock()).finally(() => this._hidePageLoading());
        } else if (tab === 'coupleTasks') {
            this.showPage('coupleTasks');
            this._showPageLoading();
            this._ensureModule('records').then(() => this.loadCoupleTasks()).finally(() => this._hidePageLoading());
        } else if (tab === 'profile') {
            this.showPage('profile');
            this.updateProfile();
        } else if (tab === 'partnerProfile') {
            this.showPage('partnerProfile');
            this._showPageLoading();
            this._ensureModule('records').then(() => this.loadPartnerProfile()).finally(() => this._hidePageLoading());
        } else if (tab === 'secretNote') {
            this.showPage('secretNote');
            this._showPageLoading();
            this._ensureModule('extras').then(() => this.loadSecretNoteInbox()).finally(() => this._hidePageLoading());
        } else if (tab === 'emotionTimeline') {
            this.showPage('emotionTimeline');
            this._showPageLoading();
            this._ensureModule('timeline').then(() => this.loadEmotionTimeline()).finally(() => this._hidePageLoading());
        } else if (tab === 'timeCapsule') {
            this.showPage('timeCapsule');
            this._showPageLoading();
            this._ensureModule('extras').then(() => this.loadTimeCapsules()).finally(() => this._hidePageLoading());
        }
    },

    // ========================================
    // 数据加载
    // ========================================
    async loadData() {
        await Promise.all([
            this.loadCategories(),
            this.loadPhotos()  // loadPhotos 内部会调用 loadAllPhotoCategories
        ]);
        this.renderPhotos();
    },

    async refreshData() {
        this.showToast('刷新中...');
        try {
            await this.loadData();
            this.showToast('已刷新');
        } catch (e) {
            console.error('刷新失败:', e);
            this.showToast('刷新失败');
        }
    },

    async loadCategories() {
        try {
            this.categories = await _loadCategories();
        } catch (error) {
            console.warn('加载分类失败，使用空列表:', error);
            this.categories = [];
        }
    },

    async loadAllPhotoCategories() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;

            const { data, error } = await supabase
                .from('photo_categories')
                .select('photo_id, category_id')
                .limit(10000);

            if (error) throw error;

            this.photoCategories = {};
            if (data) {
                data.forEach(rel => {
                    const pid = String(rel.photo_id);
                    if (!this.photoCategories[pid]) {
                        this.photoCategories[pid] = [];
                    }
                    this.photoCategories[pid].push(String(rel.category_id));
                });
            }
        } catch (error) {
            console.warn('加载照片分类关联失败:', error);
            this.photoCategories = {};
        }
    },

    async loadPhotos() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;

            // 始终先加载 photo_categories 映射（供分类筛选使用）
            await this.loadAllPhotoCategories();

            let query = supabase
                .from('photos')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            // 收藏筛选
            if (this.showFavoritesOnly) {
                query = query.eq('is_favorite', true);
            }

            // 分类筛选：通过内存映射获取匹配 photo ID，推服务端过滤
            if (this.currentCategory && this.currentCategory !== 'all') {
                const categoryIds = this.getCategoryAndChildrenIds(this.currentCategory);
                if (categoryIds.length > 0) {
                    const matchingPhotoIds = new Set();
                    Object.entries(this.photoCategories).forEach(([photoId, catIds]) => {
                        if (catIds.some(cid => categoryIds.includes(cid))) {
                            matchingPhotoIds.add(photoId);
                        }
                    });

                    if (matchingPhotoIds.size > 0) {
                        query = query.in('id', [...matchingPhotoIds]);
                    } else {
                        this.photos = [];
                        this.totalPhotos = 0;
                        this.renderPhotos();
                        if (this.updateCategoryPathDisplay) this.updateCategoryPathDisplay();
                        return;
                    }
                }
            }

            // 搜索筛选：多关键词，任一匹配即可
            const searchInput = document.getElementById('searchInput');
            if (searchInput && searchInput.value) {
                const search = searchInput.value.trim();
                const keywords = search.split(/\s+/).filter(k => k.length > 0);
                if (keywords.length > 0) {
                    const filters = keywords.map(k => `name.ilike.%${k}%,description.ilike.%${k}%`).join(',');
                    query = query.or(filters);
                }
            }

            // 服务端分页
            const from = (this.currentPage - 1) * this.photosPerPage;
            const to = from + this.photosPerPage - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;

            if (error) throw error;

            this.photos = data || [];
            this.totalPhotos = count || 0;

            this.renderPhotos();
            if (this.updateCategoryPathDisplay) this.updateCategoryPathDisplay();
        } catch (error) {
            console.warn('加载照片失败:', error);
            this.photos = [];
            this.totalPhotos = 0;
        }
    },

    // ========================================
    // 照片相关
    // ========================================
    renderPhotos() {
        const feed = document.getElementById('photoFeed');
        const empty = document.getElementById('emptyFeed');

        const pagePhotos = this.photos; // 已由服务端分页 + 筛选

        if (pagePhotos.length === 0) {
            feed.style.display = 'none';
            empty.style.display = 'flex';
            this.renderLoadMoreButton(0, 0);
            return;
        }

        feed.style.display = 'grid';
        empty.style.display = 'none';

        const totalPages = Math.max(1, Math.ceil(this.totalPhotos / this.photosPerPage));

        const searchValue = document.getElementById('searchInput')?.value || '';
        feed.innerHTML = pagePhotos.map((photo, index) => {
            const safeName = this.highlightKeywords(this.escapeHtml(photo.name || '未命名'), searchValue);
            const safeDesc = this.highlightKeywords(this.escapeHtml(photo.description || ''), searchValue);
            const safeImg = this.escapeHtml(this.getPhotoUrl(photo.storage_path) || ('https://picsum.photos/400/400?random=' + photo.id));
            return `
            <div class="photo-card ${this.selectMode ? 'select-mode' : ''} ${this.selectedPhotos.has(photo.id) ? 'selected' : ''}" 
                 onclick="${this.selectMode ? "mobile.togglePhotoSelect('" + photo.id + "')" : "mobile.openDetail('" + photo.id + "')"}" 
                 style="animation-delay: ${index * 50}ms">
                ${this.selectMode ? `
                    <div class="photo-checkbox">
                        <input type="checkbox" ${this.selectedPhotos.has(photo.id) ? 'checked' : ''} onclick="event.stopPropagation(); mobile.togglePhotoSelect('${photo.id}')">
                    </div>
                ` : ''}
                <img src="${safeImg}" alt="${safeName}">
                <div class="photo-card-info">
                    <h4>${safeName}</h4>
                    <p>${safeDesc}</p>
                </div>
                ${photo.is_favorite ? '<span class="photo-card-fav">❤️</span>' : ''}
            </div>
        `}).join('');
        
        // 渲染分页控制
        this.renderLoadMoreButton(totalPages, this.totalPhotos);
    },

    updatePaginationInfo(displayed, total, pages) {
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (!loadMoreContainer) return;
        loadMoreContainer.innerHTML = `<div class="page-info">${displayed} / ${total} 张 · ${pages} 页</div>`;
    },

    renderPagination(totalPages) {
        const pagination = document.getElementById('paginationControls');
        if (!pagination) return;
        
        // 即使只有一页也显示分页信息
        let html = `<span class="pagination-info">第 ${this.currentPage} / ${totalPages} 页</span>`;
        
        if (totalPages > 1) {
            if (this.currentPage > 1) {
                html += `<button class="pagination-btn" onclick="mobile.prevPage()">上一页</button>`;
            }
            if (this.currentPage < totalPages) {
                html += `<button class="pagination-btn" onclick="mobile.nextPage()">下一页</button>`;
            }
        }
        
        pagination.innerHTML = html;
    },

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadPhotos();
            this.scrollToTop();
        }
    },

    nextPage() {
        const totalPages = Math.max(1, Math.ceil(this.totalPhotos / this.photosPerPage));
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.loadPhotos();
            this.scrollToTop();
        }
    },

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    renderLoadMoreButton(totalPages, filteredCount) {
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        const paginationControls = document.getElementById('paginationControls');
        
        const hasPrev = this.currentPage > 1;
        const hasNext = this.currentPage < totalPages;
        const displayedCount = Math.min(this.currentPage * this.photosPerPage, filteredCount);
        
        let html = '';
        
        if (filteredCount > 0) {
            html += `<div class="page-info">第 ${this.currentPage} / ${totalPages} 页 · ${displayedCount} / ${filteredCount} 张</div>`;
            html += `<div class="page-buttons">`;
            
            if (hasPrev) {
                html += `<button class="page-btn prev-btn" onclick="mobile.prevPage()">
                    <span>←</span> 上一页
                </button>`;
            }
            
            if (hasNext) {
                html += `<button class="page-btn next-btn" onclick="mobile.nextPage()">
                    下一页 <span>→</span>
                </button>`;
            }
            
            html += `</div>`;
        }
        
        if (loadMoreContainer) {
            loadMoreContainer.innerHTML = html;
        }
        
        // 清除 paginationControls 的加载提示
        if (paginationControls) {
            paginationControls.innerHTML = '';
        }
    },

    toggleSelectMode() {
        this.selectMode = !this.selectMode;
        if (!this.selectMode) {
            this.selectedPhotos.clear();
        }
        this.renderPhotos();
        this.updateSelectModeUI();
    },

    togglePhotoSelect(photoId) {
        if (this.selectedPhotos.has(photoId)) {
            this.selectedPhotos.delete(photoId);
        } else {
            this.selectedPhotos.add(photoId);
        }
        this.renderPhotos();
        this.updateSelectModeUI();
    },

    updateSelectModeUI() {
        const selectBtn = document.getElementById('selectModeBtn');
        const batchActions = document.getElementById('batchActions');
        const selectedCount = document.getElementById('selectedCount');
        const exportBtn = document.getElementById('batchExportBtn');

        if (this.selectMode) {
            selectBtn.textContent = '❌ 取消';
            selectBtn.classList.add('active');
            batchActions.style.display = 'flex';
            if (exportBtn) exportBtn.style.display = '';
            selectedCount.textContent = this.selectedPhotos.size;
        } else {
            selectBtn.textContent = '☑️ 多选';
            selectBtn.classList.remove('active');
            batchActions.style.display = 'none';
            if (exportBtn) exportBtn.style.display = 'none';
        }
    },

    selectAllPhotos() {
        const currentPagePhotos = this.photos.slice(
            (this.currentPage - 1) * this.photosPerPage,
            this.currentPage * this.photosPerPage
        );
        
        // 如果当前页已全选，则取消全选
        if (this.selectedPhotos.size === currentPagePhotos.length) {
            currentPagePhotos.forEach(p => this.selectedPhotos.delete(p.id));
            this.showToast('已取消全选');
        } else {
            currentPagePhotos.forEach(p => this.selectedPhotos.add(p.id));
            this.showToast(`已选中 ${currentPagePhotos.length} 张`);
        }
        this.renderPhotos();
        this.updateSelectModeUI();
    },

    async exportSelectedPhotos() {
        if (this.selectedPhotos.size === 0) {
            this.showToast('请先选择要导出的照片');
            return;
        }
        if (this.selectedPhotos.size > 50) {
            if (!confirm(`已选择 ${this.selectedPhotos.size} 张照片，一次最多导出 50 张。仅导出前 50 张？`)) return;
        }

        const photoIds = [...this.selectedPhotos].slice(0, 50);
        const selectedPhotoData = this.photos.filter(p => photoIds.includes(p.id));

        try {
            const zip = new JSZip();
            const total = selectedPhotoData.length;
            let completed = 0;

            for (const photo of selectedPhotoData) {
                const url = this.getPhotoUrl(photo.storage_path);
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('fetch failed');
                    const blob = await response.blob();
                    const ext = photo.storage_path.split('.').pop() || 'jpg';
                    const fileName = `${photo.name || 'photo'}.${ext}`;
                    zip.file(fileName, blob);
                } catch (e) {
                    console.warn(`下载失败: ${photo.name}`, e);
                }
                completed++;
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const downloadUrl = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `照片导出_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

            this.showToast(`成功导出 ${completed} 张照片！`);
        } catch (err) {
            console.error('导出失败:', err);
            this.showToast('导出失败: ' + err.message);
        }
    },

    batchDeletePhotos() {
        if (this.selectedPhotos.size === 0) {
            this.showToast('请先选择要删除的照片');
            return;
        }
        
        this.pendingDeleteType = 'batch-photo';
        document.getElementById('confirmTitle').textContent = '批量删除';
        document.getElementById('confirmMessage').textContent = `确定删除选中的 ${this.selectedPhotos.size} 张照片？`;
        document.getElementById('confirmModal').style.display = 'flex';
    },

    openDetail(photoId) {
        this.currentPhotoId = photoId;
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;

        this._refreshDetailContent(photo);

        // 页面指示器
        this._updateDetailIndicator();

        // 触屏滑动（绑定到整个详情页）
        const page = document.getElementById('detailPage');
        if (page) {
            this._boundDetailTouchEnd = this._detailTouchEnd.bind(this);
            page.addEventListener('touchstart', this._detailTouchStart, { passive: true });
            page.addEventListener('touchend', this._boundDetailTouchEnd, { passive: true });
        }

        this.showPage('detail');
    },

    closeDetail() {
        const page = document.getElementById('detailPage');
        if (page) {
            page.removeEventListener('touchstart', this._detailTouchStart);
            if (this._boundDetailTouchEnd) page.removeEventListener('touchend', this._boundDetailTouchEnd);
        }
        this.showPage('photos');
    },

    _detailTouchStart(e) {
        if (e.target.closest('button, input, textarea, a, .detail-actions, .comments-section')) return;
        mobile._detailTouchX = e.touches[0].clientX;
    },

    _detailTouchEnd(e) {
        if (!mobile._detailTouchX) return;
        const dx = e.changedTouches[0].clientX - mobile._detailTouchX;
        mobile._detailTouchX = 0;
        if (Math.abs(dx) > 50) {
            mobile._navigateDetail(dx > 0 ? -1 : 1);
        }
    },

    _navigateDetail(direction) {
        const idx = this.photos.findIndex(p => p.id === this.currentPhotoId);
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= this.photos.length) return;

        const photo = this.photos[newIdx];
        this.currentPhotoId = photo.id;
        this._refreshDetailContent(photo, direction);
        this.loadComments(photo.id);
        this._updateDetailIndicator();
    },

    _refreshDetailContent(photo, direction) {
        const img = document.getElementById('detailImage');
        const src = this.getPhotoUrl(photo.storage_path) || 'https://picsum.photos/800/600';

        document.getElementById('detailName').textContent = photo.name || '未命名';
        document.getElementById('detailDesc').textContent = photo.description || '';
        document.getElementById('detailCategory').textContent = photo.category_name || '未分类';
        document.getElementById('detailSize').textContent = photo.formatted_size || '';

        const favBtn = document.getElementById('detailFavoriteBtn');
        if (favBtn) favBtn.textContent = photo.is_favorite ? '❤️' : '🤍';

        if (direction) {
            const dir = direction > 0 ? 1 : -1;
            img.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            img.style.transform = 'translateX(' + (-dir * 30) + '%)';
            img.style.opacity = '0';

            const onEnd = function() {
                img.removeEventListener('transitionend', onEnd);
                img.style.transition = 'none';
                img.style.transform = 'translateX(' + (dir * 30) + '%)';
                img.src = src;
                img.offsetHeight;
                img.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                img.style.transform = 'translateX(0)';
                img.style.opacity = '1';
            };
            img.addEventListener('transitionend', onEnd, { once: true });
        } else {
            img.style.transition = 'none';
            img.style.transform = 'none';
            img.style.opacity = '0.3';
            img.src = src;
            img.onload = function() {
                this.style.transition = 'opacity 0.25s ease';
                this.style.opacity = '1';
            };
        }
    },

    _updateDetailIndicator() {
        const idx = this.photos.findIndex(p => p.id === this.currentPhotoId);
        const el = document.getElementById('detailPosition');
        if (el) el.textContent = (idx + 1) + ' / ' + this.photos.length;
        // 箭头显示
        const prevBtn = document.getElementById('detailPrevBtn');
        const nextBtn = document.getElementById('detailNextBtn');
        if (prevBtn) prevBtn.style.opacity = idx > 0 ? '1' : '0.3';
        if (nextBtn) nextBtn.style.opacity = idx < this.photos.length - 1 ? '1' : '0.3';
    },

    // 主 tab 滑动切换
    _tabTouchStart(e) {
        if (e.target.closest('button, input, textarea, a, .nav-item, .bottom-nav, .feature-card, .feature-arrow-btn, .photo-card, .menu-item')) return;
        this._tabTouchStartX = e.touches[0].clientX;
    },

    _tabTouchEnd(e) {
        if (!this._tabTouchStartX) return;
        const dx = e.changedTouches[0].clientX - this._tabTouchStartX;
        this._tabTouchStartX = 0;
        if (Math.abs(dx) > window.innerWidth / 2) {
            const currentIdx = this._mainTabs.indexOf(this._currentMainTab);
            const newIdx = currentIdx + (dx > 0 ? -1 : 1);
            if (newIdx >= 0 && newIdx < this._mainTabs.length) {
                this.switchTab(this._mainTabs[newIdx]);
            }
        }
    },

    // 照片列表滑动翻页（下一页/上一页）
    _gridTouchStart(e) {
        if (e.target.closest('button, input, textarea, a, .photo-card, .pagination-btn, .bottom-nav')) return;
        this._gridTouchStartX = e.touches[0].clientX;
        this._gridTouchStartY = e.touches[0].clientY;
    },

    _gridTouchEnd(e) {
        if (!this._gridTouchStartX) return;
        const dx = e.changedTouches[0].clientX - this._gridTouchStartX;
        const dy = e.changedTouches[0].clientY - this._gridTouchStartY;
        this._gridTouchStartX = 0;
        // 必须是明显水平滑动（|dx| > |dy|）且距离 > 80px
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
            if (dx > 0) { this.prevPage(); } else { this.nextPage(); }
        }
    },

    async toggleFavorite() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (photo) {
            const newFavorite = !photo.is_favorite;
            try {
                const supabase = this.initSupabase();
                const { error } = await supabase
                    .from('photos')
                    .update({ is_favorite: newFavorite })
                    .eq('id', this.currentPhotoId);
                if (error) throw error;
                photo.is_favorite = newFavorite;
                const favBtn = document.getElementById('detailFavoriteBtn');
                favBtn.textContent = photo.is_favorite ? '❤️' : '🤍';
                this.showToast(photo.is_favorite ? '已收藏' : '已取消收藏');
                this.renderPhotos();
            } catch (err) {
                console.error('收藏操作失败:', err);
                this.showToast('操作失败，请重试');
            }
        }
    },

    async batchToggleFavorite() {
        if (this.selectedPhotos.size === 0) {
            this.showToast('请先选择照片');
            return;
        }
        
        const supabase = this.initSupabase();
        let updatedCount = 0;
        
        for (const photoId of this.selectedPhotos) {
            const photo = this.photos.find(p => p.id === photoId);
            if (photo) {
                const newFavorite = !photo.is_favorite;
                try {
                    const { error } = await supabase
                        .from('photos')
                        .update({ is_favorite: newFavorite })
                        .eq('id', photoId);
                    if (!error) {
                        photo.is_favorite = newFavorite;
                        updatedCount++;
                    }
                } catch (err) {
                    console.error('收藏操作失败:', err);
                }
            }
        }
        
        this.selectedPhotos.clear();
        this.selectMode = false;
        this.updateSelectModeUI();
        this.renderPhotos();
        this.showToast(`已更新 ${updatedCount} 张照片的收藏状态`);
    },

    // ========================================
    // 搜索和过滤
    // ========================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('active');
        if (searchBar.classList.contains('active')) {
            document.getElementById('searchInput').focus();
        }
    },

    searchPhotos() {
        this.currentPage = 1;
        this.loadPhotos();
    },

    async filterByCategory() {
        const categoryId = document.getElementById('mobileFilterCategory').value;

        this.currentCategory = categoryId;
        this.currentPage = 1;

        // 更新分类路径显示（仅当 photos 模块已加载）
        if (this.updateCategoryPathDisplay) this.updateCategoryPathDisplay();

        this.loadPhotos();
    },

    getFilteredPhotos() {
        // 分类筛选已由服务端 loadPhotos() 完成，直接返回当前页照片
        return this.photos;
    },

    // ========================================
    // 个人页面
    // ========================================
    updateProfile() {
        if (this.currentUser) {
            document.getElementById('userName').textContent = this.currentUser.username;
            document.getElementById('userRole').textContent = this.currentUser.displayRole || this.currentUser.role;
        }
    },

    toggleFavorites() {
        this.showFavoritesOnly = !this.showFavoritesOnly;
        this.currentPage = 1;
        if (this.showFavoritesOnly) {
            this.currentCategory = 'all';
            var filterCat = document.getElementById('mobileFilterCategory');
            if (filterCat) filterCat.value = 'all';
            this.showPage('photos');
        }
        this.loadPhotos();
        this.showToast(this.showFavoritesOnly ? '显示收藏照片' : '显示全部照片');
    },

    // ========================================
    // 已标记分类
    // ========================================
    loadMarkedCategories() {
        const saved = localStorage.getItem('markedCategories');
        if (saved) {
            this.markedCategories = JSON.parse(saved);
        }
    },

    showMarkedCategories() {
        if (this.markedCategories.length === 0) {
            this.showToast('暂无标记的分类');
            return;
        }

        const list = document.getElementById('markedCategoriesList');
        list.innerHTML = this.markedCategories.map(markedId => {
            const strId = String(markedId);
            const cat = this.categories.find(c => String(c.id) === strId);
            if (!cat) return '';
            return `
                <div class="marked-item" onclick="mobile.selectCategory('${strId}')">
                    <span>📁 ${this.escapeHtml(cat.name)}</span>
                    <span class="unmark" onclick="event.stopPropagation();mobile.unmarkCategory('${strId}')">✕</span>
                </div>
            `;
        }).join('');

        document.getElementById('markedPanel').style.display = 'block';
        document.getElementById('sheetOverlay').style.display = 'block';
        setTimeout(() => {
            document.getElementById('markedPanel').classList.add('active');
        }, 10);
    },

    closeMarkedPanel() {
        document.getElementById('markedPanel').classList.remove('active');
        setTimeout(() => {
            document.getElementById('markedPanel').style.display = 'none';
            document.getElementById('sheetOverlay').style.display = 'none';
        }, 300);
    },

    unmarkCategory(id) {
        this.markedCategories = this.markedCategories.filter(c => c !== id);
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        this.showMarkedCategories();
        this.showToast('已取消标记');
    },

    selectCategory(id) {
        // 切换到照片页并按分类过滤
        this.switchTab('photos');
        document.getElementById('mobileFilterCategory').value = id;
        this.filterByCategory();
    },

    // ========================================
    // Toast 提示
    // ========================================
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    },

    // ========================================
    // 图片压缩
    // ========================================
    compressImage(file, maxSizeMB) {
        return new Promise((resolve) => {
            const maxBytes = maxSizeMB * 1024 * 1024;

            // 如果文件小于限制，直接返回
            if (file.size <= maxBytes) {
                resolve(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let quality = 0.7;
                    let width = img.width;
                    let height = img.height;

                    const tryCompress = () => {
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);

                        canvas.toBlob(
                            (blob) => {
                                if (!blob || blob.size <= maxBytes || quality <= 0.05) {
                                    resolve(blob && blob.size <= file.size
                                        ? new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
                                        : file);
                                    return;
                                }
                                if (quality > 0.1) {
                                    quality -= 0.15;
                                } else if (width > 400) {
                                    width = Math.round(width * 0.7);
                                    height = Math.round(height * 0.7);
                                    quality = 0.5;
                                } else {
                                    resolve(file);
                                    return;
                                }
                                tryCompress();
                            },
                            'image/jpeg',
                            quality
                        );
                    };

                    tryCompress();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    // ========================================
    // 纪念日升级
    // ========================================

    updateCountdownDisplay() {
        const container = document.getElementById('mobileCountdownContainer');
        if (!container) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let nextMilestone = null;
        let minDiff = Infinity;
        this.anniversaryMilestones.forEach(m => {
            let targetDate;
            if (m.repeat_yearly || m.milestone_type === 'birthday') {
                const parts = m.date.split('-');
                targetDate = new Date(today.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[2]));
                if (targetDate <= today) {
                    targetDate = new Date(today.getFullYear() + 1, parseInt(parts[1]) - 1, parseInt(parts[2]));
                }
            } else {
                targetDate = new Date(m.date);
            }
            const diff = targetDate - today;
            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                nextMilestone = { ...m, targetDate };
            }
        });

        if (nextMilestone) {
            const diffDays = Math.ceil(minDiff / (1000 * 60 * 60 * 24));
            container.innerHTML = '<div style="text-align:center;padding:12px;background:linear-gradient(135deg,#a8edea 0%,#fed6e3 100%);border-radius:12px;margin-bottom:12px;">' +
                '<div style="font-size:0.9rem;color:#666;">下一个纪念日</div>' +
                '<div style="font-size:1.3rem;font-weight:bold;color:#e74c3c;">' + this.escapeHtml(nextMilestone.title) + '</div>' +
                '<div style="font-size:1.8rem;font-weight:bold;color:#e74c3c;">还有 ' + diffDays + ' 天</div>' +
                '<div style="font-size:0.8rem;color:#999;">' + nextMilestone.targetDate.toLocaleDateString('zh-CN') + '</div>' +
            '</div>';
        }
    },

};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    mobile.init();
});

// 暴露到全局
window.mobile = mobile;
