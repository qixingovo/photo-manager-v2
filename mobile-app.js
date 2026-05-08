/* ========================================
   照片管理系统 - 手机版 JavaScript
   Typeform 风格移动端应用
   ======================================== */

const APP_CONFIG = window.__APP_CONFIG__ || {};

function safeBigint(val, fallback) {
    if (val === null || val === undefined) return fallback;
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : fallback;
}

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
    _mainTabs: ['home', 'photos', 'upload', 'category', 'profile'],
    _currentMainTab: 'home',
    _tabTouchStartX: 0,
    _gridTouchStartX: 0,
    _gridTouchStartY: 0,
    previewFiles: [],
    pendingDeleteId: null,
    pendingDeleteType: null,
    
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
    SUPABASE_URL: APP_CONFIG.SUPABASE_URL || '',
    SUPABASE_KEY: APP_CONFIG.SUPABASE_ANON_KEY || '',
    STORAGE_URL: APP_CONFIG.SUPABASE_STORAGE_URL || (APP_CONFIG.SUPABASE_URL ? `${APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/photo/` : ''),
    AUTH_SESSION_KEY: 'photo_manager_session',
    supabase: null,
    
    // 初始化 Supabase 客户端
    initSupabase() {
        if (!this.SUPABASE_URL || !this.SUPABASE_KEY) {
            console.error('缺少 Supabase 配置，请在 config.js 中设置 SUPABASE_URL 和 SUPABASE_ANON_KEY');
            return null;
        }

        if (!this.supabase) {
            // 等待 window.supabase 可用
            if (typeof window.supabase === 'undefined') {
                console.error('Supabase CDN 未加载');
                return null;
            }
            this.supabase = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
        }
        return this.supabase;
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

    getStoredSession() {
        try {
            const raw = localStorage.getItem(this.AUTH_SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session?.username || !session?.role) return null;
            return session;
        } catch (error) {
            console.warn('读取本地登录态失败:', error);
            return null;
        }
    },

    saveSession(session) {
        localStorage.setItem(this.AUTH_SESSION_KEY, JSON.stringify(session));
    },

    clearSession() {
        localStorage.removeItem(this.AUTH_SESSION_KEY);
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
        this.waitForSupabase(() => {
            this.checkLogin();
            this.loadMarkedCategories();
        });
    },

    // ========================================
    // 主题相关
    // ========================================
    initTheme() {
        const savedTheme = localStorage.getItem('photoTheme');
        this.isDarkMode = savedTheme === 'dark';
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
        if (this.isDarkMode) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    },

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('photoTheme', this.isDarkMode ? 'dark' : 'light');
        this.applyTheme();
        this.showToast(this.isDarkMode ? '🌙 夜间模式' : '☀️ 日间模式');
    },

    showSettings() {
        // 创建设置弹窗
        const modal = document.createElement('div');
        modal.id = 'settingsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>⚙️ 设置</h3>
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
    loadBirthdayConfig() {
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
        this.loadBirthdayConfig();
        if (!this.birthdayConfig) return false;
        const today = new Date();
        return today.getMonth() + 1 === this.birthdayConfig.month && today.getDate() === this.birthdayConfig.day;
    },

    saveBirthdayConfig(config) {
        this.birthdayConfig = config;
        localStorage.setItem('birthday_config', JSON.stringify(config));
    },

    showBirthdayWelcomeOverlay() {
        this.loadBirthdayConfig();
        const cfg = this.birthdayConfig || { month: 6, day: 22, name: '老大' };
        const monthOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === cfg.month ? 'selected' : ''}>${m}月</option>`).join('');
        const dayOptions = Array.from({length: 31}, (_, i) => i + 1).map(d => `<option value="${d}" ${d === cfg.day ? 'selected' : ''}>${d}日</option>`).join('');

        const overlay = document.createElement('div');
        overlay.id = 'mobileBirthdayOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;z-index:9999;';
        overlay.innerHTML = `
            <canvas id="mobilePetalsCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;"></canvas>
            <div style="text-align:center;color:white;z-index:9999;padding:20px;">
                <div style="font-size:60px;margin-bottom:16px;">🎂</div>
                <h1 style="font-size:1.5rem;margin-bottom:16px;">生日快乐！</h1>
                <h2 style="font-size:2.5rem;margin-bottom:10px;font-weight:bold;">老大 🎉</h2>
                <p style="font-size:1rem;opacity:0.9;margin-bottom:24px;">老大万岁万岁万万岁≧▽≦</p>
                <button onclick="mobile.enterFromBirthday()" style="
                    padding:12px 40px;font-size:1rem;background:white;color:#764ba2;
                    border:none;border-radius:50px;cursor:pointer;font-weight:bold;
                    box-shadow:0 4px 15px rgba(0,0,0,0.2);">进入系统 🎈</button>
                <p style="margin-top:16px;font-size:0.85rem;opacity:0.7;">
                    生日日期:
                    <select id="mobileBirthdayMonth" onchange="mobile.updateBirthdayConfigMobile()" style="padding:4px 8px;border:none;border-radius:6px;font-size:13px;">${monthOptions}</select>
                    <select id="mobileBirthdayDay" onchange="mobile.updateBirthdayConfigMobile()" style="padding:4px 8px;border:none;border-radius:6px;font-size:13px;">${dayOptions}</select>
                </p>
                <button id="mobileMusicToggle" onclick="mobile.toggleBirthdayMusicMobile(event)" style="
                    margin-top:8px;background:rgba(255,255,255,0.2);border:2px solid white;color:white;
                    width:40px;height:40px;border-radius:50%;font-size:16px;cursor:pointer;">🔇</button>
            </div>
        `;
        document.body.appendChild(overlay);
        this.startMobilePetalAnimation();
    },

    enterFromBirthday() {
        this.stopMobilePetalAnimation();
        const overlay = document.getElementById('mobileBirthdayOverlay');
        if (overlay) overlay.remove();
        this.showPage('home');
        this.loadData().catch(err => console.error('加载数据失败:', err));
    },

    updateBirthdayConfigMobile() {
        const monthEl = document.getElementById('mobileBirthdayMonth');
        const dayEl = document.getElementById('mobileBirthdayDay');
        if (!monthEl || !dayEl) return;
        this.saveBirthdayConfig({ month: parseInt(monthEl.value), day: parseInt(dayEl.value), name: '老大' });
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
        if (audio.paused) {
            audio.play().catch(() => {});
            if (btn) btn.textContent = '🔊';
        } else {
            audio.pause();
            if (btn) btn.textContent = '🔇';
        }
    },

    startMobilePetalAnimation() {
        const canvas = document.getElementById('mobilePetalsCanvas');
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        const petals = [];
        const colors = ['#ff6b6b', '#ffa502', '#ff6348', '#ff4757', '#ff9ff3', '#feca57', '#ff6b81', '#eccc68'];

        for (let i = 0; i < 30; i++) {
            petals.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                size: 6 + Math.random() * 12,
                speed: 0.8 + Math.random() * 1.5,
                wobble: Math.random() * 2 - 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.04
            });
        }

        const self = this;
        function drawPetal(p) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            petals.forEach(p => {
                p.y += p.speed;
                p.x += Math.sin(p.y * 0.02) * p.wobble;
                p.rotation += p.rotSpeed;
                if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
                drawPetal(p);
            });
            self.__petalAnimId = requestAnimationFrame(animate);
        }
        animate();
    },

    stopMobilePetalAnimation() {
        if (this.__petalAnimId) {
            cancelAnimationFrame(this.__petalAnimId);
            this.__petalAnimId = null;
        }
        const canvas = document.getElementById('mobilePetalsCanvas');
        if (canvas) canvas.remove();
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

        const session = this.getStoredSession();
        if (session) {
            this.currentUser = this.getUserFromSession(session);
            this.showPage('home');
            this.loadData().catch(err => {
                console.error('加载数据失败:', err);
                this.showToast('数据加载失败，请刷新重试');
            });
            return;
        }

        this.currentUser = null;
        this.showPage('login');
    },

    async handleLogin(e) {
        e.preventDefault();
        const account = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
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

        const { data, error } = await client.rpc('authenticate_user', {
            p_username: account,
            p_password: password
        });

        if (error || !data?.success) {
            if (error) console.error('账号登录 RPC 失败:', error);
            errorEl.textContent = '登录失败，请检查账号或密码';
            return;
        }

        const session = {
            username: data.username || account,
            role: data.role || 'user'
        };
        this.saveSession(session);
        this.currentUser = this.getUserFromSession(session);
        errorEl.textContent = '';
        
        // 老大生日彩蛋
        if (this.currentUser.isLaoda && this.isBirthdayToday()) {
            this.showBirthdayWelcomeOverlay();
            return;
        }
        
        // 先跳转页面
        this.showPage('home');
        
        // 再加载数据（不阻塞页面显示）
        this.loadData().catch(err => {
            console.error('加载数据失败:', err);
            this.showToast('数据加载失败，请刷新重试');
        });
    },

    handleLogout() {
        this.clearSession();
        this.currentUser = null;
        this.showPage('login');
        this.showToast('已退出登录');
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

        // 为非主页添加返回按钮
        if (page !== 'home' && page !== 'login') {
            const pageEl = document.getElementById(page + 'Page');
            const topBar = pageEl ? pageEl.querySelector('.top-bar') : null;
            if (topBar && !topBar.querySelector('.back-btn')) {
                const backBtn = document.createElement('button');
                backBtn.className = 'icon-btn back-btn';
                backBtn.innerHTML = '←';
                backBtn.title = '返回首页';
                backBtn.onclick = function(e) { e.stopPropagation(); mobile.switchTab('home'); };
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

    _loadAvatars() {
        [1, 2].forEach(function(n) {
            const url = localStorage.getItem('avatar_url_' + n);
            if (url) mobile._showAvatar(n, url);
        });
    },

    // 渲染 Suki 风格情侣横幅
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
        this._loadAvatars();
    },

    switchTab(tab) {
        if (tab === 'home') {
            this.showPage('home');
            this.renderCoupleBanner();
            this.checkIncomingBottles();
        } else if (tab === 'photos') {
            this.showPage('photos');
            this.renderPhotos();
        } else if (tab === 'upload') {
            this.showPage('upload');
            this.renderUploadCategoryCascade();
        } else if (tab === 'category') {
            this.showPage('category');
            this.renderCategories();
        } else if (tab === 'map') {
            this.showPage('map');
            this.initMapView();
        } else if (tab === 'timeline') {
            this.showPage('timeline');
            this.initTimeline();
        } else if (tab === 'collage') {
            this.showPage('collage');
            this.loadAllPhotoCategories().then(() => this.renderMobileCollageCategorySelect());
        } else if (tab === 'achievements') {
            this.showPage('achievements');
            this.loadAchievements();
        } else if (tab === 'albums') {
            this.showPage('albums');
            this.loadAlbums();
        } else if (tab === 'passport') {
            this.showPage('passport');
            this.loadPassport();
        } else if (tab === 'moodDiary') {
            this.showPage('moodDiary');
            this.loadMoodDiary();
        } else if (tab === 'dailyChatter') {
            this.showPage('dailyChatter');
            this.loadDailyChatter();
        } else if (tab === 'intimateRecords') {
            this.showPage('intimateRecords');
            this.checkIntimateLock();
        } else if (tab === 'coupleTasks') {
            this.showPage('coupleTasks');
            this.loadCoupleTasks();
        } else if (tab === 'profile') {
            this.showPage('profile');
            this.updateProfile();
        } else if (tab === 'partnerProfile') {
            this.showPage('partnerProfile');
            this.loadPartnerProfile();
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
        this.updateCategorySelects();
        this.updateCategoryPathDisplay();
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
            const response = await fetch(`${this.SUPABASE_URL}/rest/v1/categories?select=*&order=id.asc`, {
                headers: {
                    'apikey': this.SUPABASE_KEY,
                    'Authorization': `Bearer ${this.SUPABASE_KEY}`
                }
            });
            if (response.ok) {
                this.categories = await response.json();
            }
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
                        this.updateCategoryPathDisplay();
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
            this.updateCategoryPathDisplay();
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
        this.showPage('home');
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
        if (e.target.closest('button, input, textarea, a, .nav-item, .bottom-nav, .feature-card, .photo-card, .menu-item')) return;
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
    // 批量设置位置
    // ========================================
    openBatchLocationModal() {
        if (this.selectedPhotos.size === 0) {
            this.showToast('请先选择照片');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchLocationModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:95%;max-width:500px;padding:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0;font-size:16px;">为选中的 ${this.selectedPhotos.size} 张照片设置位置</h3>
                    <button onclick="document.getElementById('mobileBatchLocationModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div id="mobileBatchPickerMap" style="height:350px;"></div>
                <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                    <input type="text" id="mobileBatchLocationName" placeholder="地点名称（如：北京故宫）" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;">
                    <span id="mobileBatchPickerCoords" style="color:#666;font-size:13px;">点击地图获取坐标</span>
                    <button class="btn-primary" onclick="mobile.saveBatchLocation()" style="width:100%;">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const pickerMap = L.map('mobileBatchPickerMap').setView([35.86, 104.19], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM',
                maxZoom: 18
            }).addTo(pickerMap);

            let pickedMarker = null;

            pickerMap.on('click', function(e) {
                window.__mobileBatchPickedLatLng = e.latlng;
                if (pickedMarker) pickerMap.removeLayer(pickedMarker);
                pickedMarker = L.marker(e.latlng).addTo(pickerMap);
                document.getElementById('mobileBatchPickerCoords').textContent =
                    '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
            });

            setTimeout(() => pickerMap.invalidateSize(), 100);
        }, 100);
    },

    async saveBatchLocation() {
        if (!window.__mobileBatchPickedLatLng) {
            this.showToast('请先点击地图选择位置');
            return;
        }

        const lat = window.__mobileBatchPickedLatLng.lat;
        const lng = window.__mobileBatchPickedLatLng.lng;
        const locationName = (document.getElementById('mobileBatchLocationName')?.value || '').trim() || null;
        const photoIds = [...this.selectedPhotos];
        const supabase = this.initSupabase();

        try {
            const { error } = await supabase
                .from('photos')
                .update({ latitude: lat, longitude: lng, location_name: locationName })
                .in('id', photoIds);

            if (error) throw error;

            this.photos.forEach(p => {
                if (this.selectedPhotos.has(p.id)) {
                    p.latitude = lat;
                    p.longitude = lng;
                    p.location_name = locationName;
                }
            });

            document.getElementById('mobileBatchLocationModal').remove();
            window.__mobileBatchPickedLatLng = null;

            this.selectedPhotos.clear();
            this.selectMode = false;
            this.updateSelectModeUI();
            this.renderPhotos();
            this.showToast(`已为 ${photoIds.length} 张照片设置位置`);
            this.addXP(20, 'location');
        } catch (err) {
            this.showToast('批量设置位置失败: ' + err.message);
        }
    },

    // 批量调整日期
    openBatchDateModal() {
        if (this.selectedPhotos.size === 0) { this.showToast('请先选择照片'); return; }
        const self = this;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchDateModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:95vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;">📅 调整日期</h3>' +
                '<button class="icon-btn" onclick="document.getElementById(\'mobileBatchDateModal\').remove()">×</button>' +
            '</div>' +
            '<div style="font-size:12px;color:#888;margin-bottom:10px;">已选 ' + self.selectedPhotos.size + ' 张</div>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><input type="radio" name="mBatchDateMode" value="unified" checked onchange="mobile._updateDatePreview()"> 统一设置</label>' +
            '<input type="datetime-local" id="mBatchDateUnified" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:10px;">' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><input type="radio" name="mBatchDateMode" value="offset" onchange="mobile._updateDatePreview()"> 偏移调整</label>' +
            '<div id="mBatchOffsetRow" style="display:none;flex-wrap:wrap;gap:4px;margin-bottom:10px;">' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(-7)">-7天</button>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(-1)">-1天</button>' +
                '<input type="number" id="mBatchOffsetInput" value="0" style="width:60px;padding:6px;border:1px solid #ddd;border-radius:6px;text-align:center;">' +
                '<span style="font-size:12px;color:#666;">天</span>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(1)">+1天</button>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(7)">+7天</button>' +
            '</div>' +
            '<div style="font-size:12px;margin-bottom:8px;"><strong>预览（前5张）：</strong></div>' +
            '<div id="mBatchDatePreview" style="max-height:150px;overflow-y:auto;font-size:11px;margin-bottom:10px;"></div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button class="btn-secondary" onclick="document.getElementById(\'mobileBatchDateModal\').remove()" style="flex:1;">取消</button>' +
                '<button class="btn-primary" onclick="mobile.execBatchDateUpdate()" style="flex:1;">确认修改</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        this._updateDatePreview();
    },

    _updateDatePreview() {
        const self = this;
        const mode = document.querySelector('input[name="mBatchDateMode"]:checked')?.value || 'unified';
        document.getElementById('mBatchDateUnified').style.display = mode === 'unified' ? 'block' : 'none';
        document.getElementById('mBatchOffsetRow').style.display = mode === 'offset' ? 'flex' : 'none';
        const preview = document.getElementById('mBatchDatePreview');
        const selectedArr = this.photos.filter(function(p) { return self.selectedPhotos.has(p.id); }).slice(0, 5);

        if (mode === 'unified') {
            const newDate = document.getElementById('mBatchDateUnified').value;
            if (!newDate) { preview.innerHTML = '<span style="color:#999;">请选择日期</span>'; return; }
            preview.innerHTML = selectedArr.map(function(p) {
                const old = (p.taken_at || p.created_at) ? new Date(p.taken_at || p.created_at).toLocaleString('zh-CN') : '无';
                return '<div>' + self.escapeHtml(p.name || '') + ': ' + old + ' → <strong>' + new Date(newDate).toLocaleString('zh-CN') + '</strong></div>';
            }).join('');
        } else if (mode === 'offset') {
            const days = parseInt(document.getElementById('mBatchOffsetInput').value) || 0;
            preview.innerHTML = selectedArr.map(function(p) {
                const oldDt = new Date(p.taken_at || p.created_at);
                const oldStr = isNaN(oldDt.getTime()) ? '无' : oldDt.toLocaleString('zh-CN');
                const newDt = new Date(oldDt.getTime() + days * 86400000);
                return '<div>' + self.escapeHtml(p.name || '') + ': ' + oldStr + ' → <strong>' + newDt.toLocaleString('zh-CN') + '</strong></div>';
            }).join('');
        }
    },

    _applyOffset(days) {
        const inp = document.getElementById('mBatchOffsetInput');
        inp.value = parseInt(inp.value || 0) + days;
        document.querySelector('input[name="mBatchDateMode"][value="offset"]').checked = true;
        this._updateDatePreview();
    },

    async execBatchDateUpdate() {
        const mode = document.querySelector('input[name="mBatchDateMode"]:checked')?.value || 'unified';
        const photoIds = [...this.selectedPhotos];
        if (photoIds.length === 0) return;
        const self = this;
        const selectedArr = this.photos.filter(function(p) { return self.selectedPhotos.has(p.id); });

        let updates = [];
        if (mode === 'unified') {
            const newDate = document.getElementById('mBatchDateUnified').value;
            if (!newDate) { this.showToast('请选择日期'); return; }
            updates = photoIds.map(function(id) { return { id: id, taken_at: newDate }; });
        } else if (mode === 'offset') {
            const days = parseInt(document.getElementById('mBatchOffsetInput').value) || 0;
            updates = selectedArr.map(function(p) {
                const oldDt = new Date(p.taken_at || p.created_at);
                return { id: p.id, taken_at: new Date(oldDt.getTime() + days * 86400000).toISOString() };
            });
        }

        if (updates.length === 0) return;
        try {
            const supabase = this.initSupabase();
            const { error } = await supabase.from('photos').upsert(updates.slice(0, 50), { onConflict: 'id' });
            if (error) throw error;
            const updateMap = {};
            updates.forEach(function(u) { updateMap[u.id] = u.taken_at; });
            this.photos.forEach(function(p) { if (updateMap[p.id]) p.taken_at = updateMap[p.id]; });
            document.getElementById('mobileBatchDateModal').remove();
            this.selectedPhotos.clear(); this.selectMode = false; this.updateSelectModeUI(); this.renderPhotos();
            this.showToast('已更新 ' + updates.length + ' 张照片的日期');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },

    // 批量改分类 (移动端)
    openBatchCategoryModal() {
        if (this.selectedPhotos.size === 0) { this.showToast('请先选择照片'); return; }
        const self = this;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchCategoryModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:90vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;">📁 批量管理分类</h3>' +
                '<button class="icon-btn" onclick="document.getElementById(\'mobileBatchCategoryModal\').remove()">×</button>' +
            '</div>' +
            '<div style="font-size:12px;color:#888;margin-bottom:10px;">已选 ' + self.selectedPhotos.size + ' 张</div>' +
            '<div id="mBatchCatList" style="max-height:240px;overflow-y:auto;margin-bottom:10px;font-size:13px;"></div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button class="btn-secondary" style="flex:1;" onclick="mobile.batchAddCategories()">追加分类</button>' +
                '<button class="btn-danger" style="flex:1;" onclick="mobile.batchRemoveCategories()">移除分类</button>' +
            '</div></div>';
        document.body.appendChild(modal);

        const list = document.getElementById('mBatchCatList');
        const cats = this.categories || [];
        if (cats.length === 0) {
            list.innerHTML = '<span style="color:#999;">暂无分类</span>';
        } else {
            list.innerHTML = cats.map(function(c) {
                return '<label style="display:flex;align-items:center;gap:6px;padding:6px 0;cursor:pointer;">' +
                    '<input type="checkbox" value="' + c.id + '" class="mBatchCatCheck"> ' + self.escapeHtml(c.name) + '</label>';
            }).join('');
        }
    },

    async batchAddCategories() {
        const self = this;
        const checked = [...document.querySelectorAll('.mBatchCatCheck:checked')].map(function(cb) { return cb.value; });
        if (checked.length === 0) { this.showToast('请选择分类'); return; }
        try {
            const supabase = this.initSupabase();
            const rows = [];
            this.selectedPhotos.forEach(function(pid) {
                checked.forEach(function(cid) { rows.push({ photo_id: pid, category_id: cid }); });
            });
            await supabase.from('photo_categories').upsert(rows, { onConflict: 'photo_id,category_id', ignoreDuplicates: true });
            document.getElementById('mobileBatchCategoryModal').remove();
            await this.loadAllPhotoCategories();
            this.showToast('已为 ' + this.selectedPhotos.size + ' 张照片追加分类');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },

    async batchRemoveCategories() {
        const checked = [...document.querySelectorAll('.mBatchCatCheck:checked')].map(function(cb) { return cb.value; });
        if (checked.length === 0) { this.showToast('请选择分类'); return; }
        try {
            const supabase = this.initSupabase();
            const photoIds = [...this.selectedPhotos];
            await supabase.from('photo_categories').delete().in('photo_id', photoIds).in('category_id', checked);
            document.getElementById('mobileBatchCategoryModal').remove();
            await this.loadAllPhotoCategories();
            this.showToast('已从 ' + photoIds.length + ' 张照片移除分类');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },

    // ========================================
    // 上传相关
    // ========================================
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        this.previewFiles = files;
        const previewArea = document.getElementById('previewArea');
        const previewGrid = document.getElementById('previewGrid');

        previewArea.style.display = 'block';
        previewGrid.innerHTML = files.map((file, index) => `
            <div class="preview-item">
                <img src="${URL.createObjectURL(file)}" alt="Preview">
                <button class="remove-btn" onclick="mobile.removePreview(${index})">×</button>
            </div>
        `).join('');
    },

    removePreview(index) {
        this.previewFiles.splice(index, 1);
        if (this.previewFiles.length === 0) {
            document.getElementById('previewArea').style.display = 'none';
        } else {
            this.renderPreviews();
        }
    },

    renderPreviews() {
        const previewGrid = document.getElementById('previewGrid');
        if (!previewGrid) return;
        previewGrid.innerHTML = this.previewFiles.map((file, index) => `
            <div class="preview-item">
                <img src="${URL.createObjectURL(file)}" alt="Preview">
                <button class="remove-btn" onclick="mobile.removePreview(${index})">×</button>
            </div>
        `).join('');
    },

    clearPreviews() {
        this.previewFiles = [];
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('photoInput').value = '';
    },

    async uploadPhotos() {
        if (this.previewFiles.length === 0) {
            this.showToast('请先选择照片');
            return;
        }

        const progressSection = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const uploadBtn = document.getElementById('uploadBtn');
        const supabase = this.initSupabase();

        progressSection.style.display = 'block';
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';

        const total = this.previewFiles.length;
        const namePrefix = document.getElementById('mobilePhotoName').value.trim();
        const description = document.getElementById('mobilePhotoDesc').value.trim();
        const categoryId = this.getSelectedUploadCategoryId();
        const locationName = (document.getElementById('mobilePhotoLocationName')?.value || '').trim() || null;
        const latitude = parseFloat(document.getElementById('mobilePhotoLatitude')?.value) || null;
        const longitude = parseFloat(document.getElementById('mobilePhotoLongitude')?.value) || null;
        
        let successCount = 0;
        
        for (let i = 0; i < total; i++) {
            let file = this.previewFiles[i];
            
            // 压缩超过1.5MB的图片
            if (file.size > 1.5 * 1024 * 1024) {
                this.showToast(`压缩第 ${i + 1} 张图片...`);
                file = await this.compressImage(file, 1.5);
                this.showToast(`压缩完成: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
            }
            
            const fileName = namePrefix ? `${namePrefix}_${i + 1}` : file.name;
            const ext = file.name.split('.').pop();
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
            
            try {
                // 上传到 Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('photo')
                    .upload(uniqueName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });
                
                if (uploadError) throw uploadError;
                
                // 保存到 photos 表
                const { data: photoData, error: insertError } = await supabase
                    .from('photos')
                    .insert([{
                        name: fileName,
                        description: description,
                        storage_path: uniqueName,
                        original_name: file.name,
                        size: file.size,
                        is_favorite: false,
                        latitude,
                        longitude,
                        location_name: locationName
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                successCount++;

                // 写入 photo_categories 关联表
                if (categoryId) {
                    const photoId = photoData.id;
                    await supabase.from('photo_categories').insert([{
                        photo_id: photoId,
                        category_id: categoryId
                    }]);
                }
            } catch (err) {
                console.error('上传失败:', err);
            }
            
            const percent = Math.round(((i + 1) / total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }

        // 重置
        progressSection.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传照片';

        this.clearPreviews();
        document.getElementById('mobilePhotoName').value = '';
        document.getElementById('mobilePhotoDesc').value = '';
        const locNameEl = document.getElementById('mobilePhotoLocationName');
        const latEl = document.getElementById('mobilePhotoLatitude');
        const lngEl = document.getElementById('mobilePhotoLongitude');
        if (locNameEl) locNameEl.value = '';
        if (latEl) latEl.value = '';
        if (lngEl) lngEl.value = '';
        this.renderUploadCategoryCascade();
        this.showToast(`成功上传 ${successCount} 张照片`);
        for (let i = 0; i < successCount; i++) this.addXP(5, 'upload');
        if (latitude && longitude) this.addXP(20, 'location');

        // 记住本次使用的分类
        if (categoryId) {
            localStorage.setItem('lastUploadCategoryId', categoryId);
        }
        
        // 重新加载照片和分类关联
        await this.loadPhotos();
        await this.loadAllPhotoCategories();
        this.renderPhotos();
    },

    // ========================================
    // 分类相关
    // ========================================
    updateCategorySelects() {
        // 只更新 filterCategory 下拉框（扁平列表）
        const filterSelect = document.getElementById('mobileFilterCategory');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="all">全部分类</option>';
            this.categories.forEach(cat => {
                filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        }
        
        // 渲染上传页面的级联分类选择器
        this.renderUploadCategoryCascade();
        
        // 渲染添加分类的父分类级联选择器
        this.renderParentCategoryCascade();
    },

    // 渲染上传页面的级联分类选择器
    renderUploadCategoryCascade() {
        const container = document.getElementById('mobileUploadCategoryCascade');
        const lastBtn = document.getElementById('useLastCategoryBtn');
        if (!container) return;
        container.innerHTML = '';

        // 先更新上次分类按钮（只要localStorage有记录就显示，不依赖categories是否加载）
        const lastCatId = localStorage.getItem('lastUploadCategoryId');
        const lastCat = lastCatId ? this.categories.find(c => String(c.id) === lastCatId) : null;
        if (lastBtn) {
            if (lastCatId) {
                lastBtn.textContent = lastCat ? `📂 上次: ${lastCat.name}` : '📂 上次分类';
                lastBtn.style.display = 'block';
            } else {
                lastBtn.style.display = 'none';
            }
        }

        const topLevel = this.categories.filter(c => !c.parent_id);
        if (topLevel.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:13px;">暂无分类</p>';
            return;
        }

        const select = document.createElement('select');
        select.id = 'mobileUploadCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.onchange = () => this.onUploadCatLevelChange(0);
        select.innerHTML = `<option value="">选择分类（可选）</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        container.appendChild(select);
    },

    useLastUploadCategory() {
        const lastCatId = localStorage.getItem('lastUploadCategoryId');
        if (!lastCatId) return;
        const lastCat = this.categories.find(c => String(c.id) === lastCatId);
        if (!lastCat) return;

        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return;
        container.innerHTML = '';

        const select = document.createElement('select');
        select.id = 'mobileUploadCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.innerHTML = `<option value="">选择分类（可选）</option>${this.categories.filter(c => !c.parent_id).map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        select.value = lastCatId;
        container.appendChild(select);

        // 如果有子分类也要补上
        const children = this.categories.filter(c => String(c.parent_id) === String(lastCatId));
        if (children.length > 0) {
            const childSelect = document.createElement('select');
            childSelect.id = 'mobileUploadCatLevel1';
            childSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
            childSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
            container.appendChild(childSelect);
        }

        this.showToast(`已选择: ${lastCat.name}`);
    },

    onUploadCatLevelChange(level) {
        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return;
        const select = document.getElementById(`mobileUploadCatLevel${level}`);
        if (!select) return;
        
        const selectedValue = select.value;
        
        // 删除高于当前级别的选择器
        const selects = container.querySelectorAll('select');
        selects.forEach((s, i) => {
            if (i > level) s.remove();
        });
        
        // 如果选中了某个分类，显示其子分类作为下一级
        if (selectedValue) {
            const children = this.categories.filter(c => String(c.parent_id) === selectedValue);
            if (children.length > 0) {
                const nextLevel = level + 1;
                const nextSelect = document.createElement('select');
                nextSelect.id = `mobileUploadCatLevel${nextLevel}`;
                nextSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
                nextSelect.onchange = () => this.onUploadCatLevelChange(nextLevel);
                nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
                container.appendChild(nextSelect);
            }
        }
    },

    getSelectedUploadCategoryId() {
        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return null;
        const selects = container.querySelectorAll('select');
        for (let i = selects.length - 1; i >= 0; i--) {
            if (selects[i].value) return selects[i].value;
        }
        return null;
    },

    // 渲染添加分类的父分类级联选择器
    renderParentCategoryCascade() {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return;
        container.innerHTML = '';
        
        const topLevel = this.categories.filter(c => !c.parent_id);
        if (topLevel.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:13px;">暂无父分类可选</p>';
            return;
        }
        
        const select = document.createElement('select');
        select.id = 'parentCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.onchange = () => this.onParentCatLevelChange(0);
        select.innerHTML = `<option value="">无父分类</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        container.appendChild(select);
    },

    onParentCatLevelChange(level) {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return;
        const select = document.getElementById(`parentCatLevel${level}`);
        if (!select) return;
        
        const selectedValue = select.value;
        
        // 删除高于当前级别的选择器
        const selects = container.querySelectorAll('select');
        selects.forEach((s, i) => {
            if (i > level) s.remove();
        });
        
        // 如果选中了某个分类，显示其子分类作为下一级
        if (selectedValue) {
            const children = this.categories.filter(c => String(c.parent_id) === selectedValue);
            if (children.length > 0) {
                const nextLevel = level + 1;
                const nextSelect = document.createElement('select');
                nextSelect.id = `parentCatLevel${nextLevel}`;
                nextSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
                nextSelect.onchange = () => this.onParentCatLevelChange(nextLevel);
                nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
                container.appendChild(nextSelect);
            }
        }
    },

    getSelectedParentCategoryId() {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return null;
        const selects = container.querySelectorAll('select');
        for (let i = selects.length - 1; i >= 0; i--) {
            if (selects[i].value) return selects[i].value;
        }
        return null;
    },

    renderCategories() {
        const list = document.getElementById('categoryList');
        const rootCategories = this.categories.filter(c => !c.parent_id);

        // 添加 ALL 选项在最前面
        let html = `
            <div class="category-item" id="cat-all" onclick="mobile.switchToHomeAndFilter('all')">
                <div class="category-header">
                    <div class="category-name">
                        <span>📷</span>
                        <span class="category-name-text">全部</span>
                    </div>
                </div>
            </div>
        `;
        
        html += rootCategories.map(cat => this.renderCategoryItem(cat, 0)).join('');
        list.innerHTML = html;

        if (rootCategories.length === 0) {
            list.innerHTML += '<div class="empty-state"><span class="empty-icon">📁</span><p>暂无分类</p></div>';
        }
    },

    renderCategoryItem(cat, level) {
        const strCatId = String(cat.id);
        const children = this.categories.filter(c => String(c.parent_id) === strCatId);
        const isMarked = this.markedCategories.map(m => String(m)).includes(strCatId);
        const isLocked = !!this.lockedCategories[strCatId];
        const indent = level * 16;
        const hasChildren = children.length > 0;
        const arrow = hasChildren ? '<span class="category-arrow" onclick="event.stopPropagation(); mobile.toggleChildren(\'' + strCatId + '\')">›</span>' : '';
        const icon = level === 0 ? (isMarked ? '⭐' : '📁') : '📄';

        return `
            <div class="category-item" id="cat-${strCatId}" style="padding-left:${indent}px;">
                <div class="category-header" onclick="mobile.toggleCategoryActions('${strCatId}')">
                    <div class="category-name">
                        <span>${icon}${isLocked ? ' 🔒' : ''}</span>
                        <span class="category-name-text">${cat.name}</span>
                        ${arrow}
                    </div>
                </div>
                ${hasChildren ? `
                    <div class="category-children" id="children-${strCatId}">
                        ${children.map(child => this.renderCategoryItem(child, level + 1)).join('')}
                    </div>
                ` : ''}
                <div class="category-actions" id="actions-${strCatId}" style="display:none;">
                    <button class="btn-secondary" onclick="mobile.markCategory('${strCatId}')">
                        ${isMarked ? '⭐ 已标记' : '☆ 标记'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.toggleLockCategory('${strCatId}')">
                        ${isLocked ? '🔓 解锁' : '🔒 加锁'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.editCategoryName('${strCatId}')">
                        ✏️ 编辑
                    </button>
                    <button class="btn-secondary" onclick="mobile.deleteCategory('${strCatId}')">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        `;
    },

    toggleCategoryActions(id) {
        const actions = document.getElementById(`actions-${id}`);
        const isActionsVisible = actions && actions.style.display !== 'none';
        
        // 如果操作栏当前显示，点击后跳转到首页筛选
        if (isActionsVisible) {
            this.switchToHomeAndFilter(id);
            return;
        }
        
        // 否则显示操作栏（标记/删除）
        // 先隐藏所有其他操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });
        
        if (actions) {
            actions.style.display = 'flex';
        }
    },

    toggleChildren(id) {
        const children = document.getElementById(`children-${id}`);
        const item = document.getElementById(`cat-${id}`);
        
        if (children) {
            const isHidden = children.style.display === 'none';
            children.style.display = isHidden ? 'block' : 'none';
            if (item) {
                item.classList.toggle('expanded', isHidden);
            }
        }
    },

    switchToHomeAndFilter(categoryId) {
        // 切换到照片页
        this.switchTab('photos');

        // 设置筛选器并筛选
        const filterSelect = document.getElementById('mobileFilterCategory');
        if (filterSelect) {
            filterSelect.value = categoryId;
        }
        this.currentCategory = categoryId;
        this.currentPage = 1;

        // 更新分类路径显示
        this.updateCategoryPathDisplay();

        this.loadPhotos();
    },

    showAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'flex';
        this.renderParentCategoryCascade();
    },

    closeAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'none';
        document.getElementById('newCategoryName').value = '';
        // 重置父分类选择器
        this.renderParentCategoryCascade();
    },

    async createCategory() {
        const name = document.getElementById('newCategoryName').value.trim();
        const parentId = this.getSelectedParentCategoryId();

        if (!name) {
            this.showToast('请输入分类名称');
            return;
        }

        try {
            const supabase = this.initSupabase();
            const { data, error } = await supabase
                .from('categories')
                .insert([{ name, parent_id: parentId || null }])
                .select()
                .single();

            if (error) throw error;

            this.categories.push(data);
            this.updateCategorySelects();
            this.renderCategories();
            this.closeAddCategory();
            this.showToast('分类已添加');
            this.addXP(15, 'category');
        } catch (err) {
            this.showToast('添加失败: ' + err.message);
        }
    },

    markCategory(id) {
        const strId = String(id);
        if (this.markedCategories.map(m => String(m)).includes(strId)) {
            this.markedCategories = this.markedCategories.filter(c => String(c) !== strId);
            this.showToast('已取消标记');
        } else {
            this.markedCategories.push(strId);
            this.showToast('已标记分类 ⭐');
        }
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        this.renderCategories();
    },

    editCategoryName(id) {
        // 隐藏操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });

        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) return;

        const nameEl = document.querySelector(`#cat-${strId} .category-name-text`);
        if (!nameEl) return;
        
        // 保存原始名称
        const originalName = category.name;
        
        // 替换为输入框
        nameEl.innerHTML = `<input type="text" id="edit-cat-name-${id}" value="${this.escapeHtml(originalName)}" class="category-name-input" />`;
        
        // 添加保存/取消按钮
        const headerEl = document.querySelector(`#cat-${id} .category-header`);
        headerEl.innerHTML += `
            <div class="category-edit-actions">
                <button class="btn-save" onclick="mobile.saveCategoryName('${id}')">✓ 保存</button>
                <button class="btn-cancel" onclick="mobile.cancelEditCategory('${id}')">✕ 取消</button>
            </div>
        `;
        
        // 聚焦输入框
        const input = document.getElementById(`edit-cat-name-${id}`);
        if (input) {
            input.focus();
            input.select();
            // 监听回车键
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.saveCategoryName(id);
                } else if (e.key === 'Escape') {
                    this.cancelEditCategory(id);
                }
            });
        }
    },

    async saveCategoryName(id) {
        const input = document.getElementById(`edit-cat-name-${id}`);
        if (!input) return;
        
        const newName = input.value.trim();
        if (!newName) {
            this.showToast('分类名称不能为空');
            return;
        }
        
        // id 可能是 string 或 number，统一转为字符串比较
        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) {
            this.showToast('未找到分类');
            return;
        }

        // 更新到 Supabase
        try {
            const supabase = this.initSupabase();
            const { error } = await supabase
                .from('categories')
                .update({ name: newName })
                .eq('id', strId);
            
            if (error) throw error;
            
            // 更新本地状态
            category.name = newName;
            
            // 更新照片关联中的分类名称显示
            this.photos.forEach(photo => {
                if (String(photo.category_id) === strId) {
                    photo.category_name = newName;
                }
            });
            
            this.showToast('分类已重命名');
            this.renderCategories();
            
            // 如果当前正在筛选这个分类，更新篩選显示
            if (String(this.currentCategory) === strId) {
                const filterSelect = document.getElementById('mobileFilterCategory');
                if (filterSelect) {
                    const option = filterSelect.querySelector(`option[value="${strId}"]`);
                    if (option) option.textContent = newName;
                }
            }
        } catch (error) {
            console.error('重命名分类失败:', error);
            this.showToast('重命名失败，请重试');
        }
    },

    cancelEditCategory(id) {
        // 恢复原始显示
        const nameEl = document.querySelector(`#cat-${id} .category-name-text`);
        const category = this.categories.find(c => String(c.id) === String(id));
        if (nameEl) {
            nameEl.textContent = category?.name || '';
        }
        
        // 移除保存/取消按钮
        const actions = document.querySelector(`#cat-${id} .category-edit-actions`);
        if (actions) actions.remove();
    },

    toggleLockCategory(id) {
        // 隐藏操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });

        const strId = String(id);
        if (this.lockedCategories[strId]) {
            // 已加锁，解锁需要验证密码
            this.pendingLockId = strId;
            this.pendingLockAction = 'unlock';
            this.showLockPasswordModal('unlock');
        } else {
            // 未加锁，设置为加锁
            this.pendingLockId = strId;
            this.pendingLockAction = 'lock';
            this.showLockPasswordModal('lock');
        }
    },

    showLockPasswordModal(action) {
        const isLock = action === 'lock';
        const isDelete = action === 'delete';
        let title, hint;
        
        if (isDelete) {
            title = '🔒 分类已加锁';
            hint = '请输入密码验证后才能删除';
        } else if (isLock) {
            title = '🔒 设置解锁密码';
            hint = '设置密码后，删除分类需输入此密码';
        } else {
            title = '🔓 输入密码解锁';
            hint = '请输入分类解锁密码';
        }
        
        const modal = document.createElement('div');
        modal.id = 'lockPasswordModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p class="modal-hint" style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${hint}</p>
                <div class="form-item">
                    <input type="password" id="lockPasswordInput" placeholder="输入密码" style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;background:var(--bg);color:var(--text);">
                </div>
                ${isLock ? `
                <div class="form-item">
                    <input type="password" id="lockPasswordConfirm" placeholder="确认密码" style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;background:var(--bg);color:var(--text);">
                </div>
                ` : ''}
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="mobile.closeLockPasswordModal()">取消</button>
                    <button class="btn-primary" onclick="mobile.confirmLockAction()">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        
        // 自动聚焦
        setTimeout(() => {
            const input = document.getElementById('lockPasswordInput');
            if (input) input.focus();
        }, 100);
        
        // 回车确认
        const input = document.getElementById('lockPasswordInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.confirmLockAction();
                } else if (e.key === 'Escape') {
                    this.closeLockPasswordModal();
                }
            });
        }
    },

    closeLockPasswordModal() {
        const modal = document.getElementById('lockPasswordModal');
        if (modal) modal.remove();
        this.pendingLockId = null;
        this.pendingLockAction = null;
    },

    confirmLockAction() {
        const password = document.getElementById('lockPasswordInput').value;
        
        if (!password) {
            this.showToast('请输入密码');
            return;
        }
        
        if (this.pendingLockAction === 'lock') {
            const confirmPassword = document.getElementById('lockPasswordConfirm').value;
            if (password !== confirmPassword) {
                this.showToast('两次密码不一致');
                return;
            }
            if (password.length < 4) {
                this.showToast('密码至少4位');
                return;
            }
            
            // 设置密码
            this.lockedCategories[this.pendingLockId] = password;
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            this.showToast('分类已加锁 🔒');
            
        } else if (this.pendingLockAction === 'unlock') {
            // 验证密码
            if (this.lockedCategories[this.pendingLockId] !== password) {
                this.showToast('密码错误');
                return;
            }
            
            // 解锁
            delete this.lockedCategories[this.pendingLockId];
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            this.showToast('分类已解锁 🔓');
            this.closeLockPasswordModal();
            this.renderCategories();
            return;
            
        } else if (this.pendingLockAction === 'delete') {
            // 验证密码后才能删除
            if (this.lockedCategories[this.pendingDeleteId] !== password) {
                this.showToast('密码错误');
                return;
            }
            
            // 密码正确，继续删除流程
            this.closeLockPasswordModal();
            
            // 获取这个分类及其子分类的照片数量
            const categoryIds = this.getCategoryAndChildrenIds(this.pendingDeleteId);
            const photoCount = this.photos.filter(photo => {
                const photoCats = this.photoCategories[String(photo.id)] || [];
                return categoryIds.some(catId => photoCats.includes(catId));
            }).length;
            
            const category = this.categories.find(c => String(c.id) === String(this.pendingDeleteId));
            this.pendingCategoryName = category?.name || '未命名分类';
            this.pendingPhotoCount = photoCount;
            this.showCategoryDeleteOptions(photoCount);
            return;
        }
        
        this.closeLockPasswordModal();
        this.renderCategories();
    },

    // 获取分类及其所有子分类的 ID（递归）
    getCategoryAndChildrenIds(categoryId) {
        const strId = String(categoryId);
        const ids = [strId];
        const children = this.categories.filter(c => String(c.parent_id) === strId);
        for (const child of children) {
            ids.push(...this.getCategoryAndChildrenIds(child.id));
        }
        return ids;
    },

    // 获取分类的完整路径（从顶级父类到当前分类）
    getCategoryPath(categoryId) {
        if (!categoryId || categoryId === 'all') return [];
        
        const path = [];
        let currentId = String(categoryId);

        // 不断向上查找父类，直到找不到为止
        while (currentId) {
            const cat = this.categories.find(c => String(c.id) === currentId);
            if (!cat) break;
            path.unshift(cat.name); // 每次都插入到数组开头，保证顺序是从父到子
            currentId = cat.parent_id;
        }
        
        return path;
    },

    // 更新分类路径显示
    updateCategoryPathDisplay() {
        const pathDisplay = document.getElementById('categoryPathDisplay');
        if (!pathDisplay) return;
        
        const categoryId = this.currentCategory;
        
        if (!categoryId || categoryId === 'all') {
            pathDisplay.textContent = '';
            pathDisplay.style.display = 'none';
            return;
        }
        
        const path = this.getCategoryPath(categoryId);
        if (path.length === 0) {
            pathDisplay.textContent = '';
            pathDisplay.style.display = 'none';
            return;
        }
        
        pathDisplay.textContent = path.join(' › ');
        pathDisplay.style.display = 'block';
    },

    async deleteCategory(id) {
        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) return;

        // 检查是否加锁
        if (this.lockedCategories[strId]) {
            this.pendingDeleteId = strId;
            this.pendingDeleteType = 'category-locked';
            this.showLockPasswordModal('delete');
            return;
        }

        // 获取这个分类及其子分类的照片数量
        const categoryIds = this.getCategoryAndChildrenIds(strId);
        const photoCount = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        }).length;
        
        this.pendingDeleteId = strId;
        this.pendingCategoryName = category.name;
        this.pendingPhotoCount = photoCount;
        
        // 显示删除选项弹窗
        this.showCategoryDeleteOptions(photoCount);
    },

    showCategoryDeleteOptions(photoCount) {
        const photoMsg = photoCount > 0 ? `该分类下有 ${photoCount} 张照片` : '该分类下暂无照片';
        const safeCategoryName = this.escapeHtml(this.pendingCategoryName || '');
        
        const modal = document.createElement('div');
        modal.id = 'categoryDeleteModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>🗑️ 删除「${safeCategoryName}」</h3>
                <p class="modal-hint" style="color:var(--text-muted);font-size:13px;margin:8px 0 16px;">${photoMsg}</p>
                <div class="delete-options">
                    <button class="delete-option-btn" onclick="mobile.confirmDeleteCategoryOnly()">
                        <span class="option-icon">📁</span>
                        <span class="option-text">只删除分类</span>
                        <span class="option-desc">保留照片，移至未分类</span>
                    </button>
                    ${photoCount > 0 ? `
                    <button class="delete-option-btn" onclick="mobile.confirmDeleteCategoryAndPhotos()">
                        <span class="option-icon">💥</span>
                        <span class="option-text">删除分类和照片</span>
                        <span class="option-desc">分类及关联照片全部删除</span>
                    </button>
                    <button class="delete-option-btn" onclick="mobile.confirmDeletePhotosOnly()">
                        <span class="option-icon">🗃️</span>
                        <span class="option-text">只删除照片</span>
                        <span class="option-desc">保留分类，仅删除照片</span>
                    </button>
                    ` : ''}
                </div>
                <div class="modal-actions" style="margin-top:16px;">
                    <button class="btn-secondary" onclick="mobile.closeCategoryDeleteModal()">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    },

    closeCategoryDeleteModal() {
        const modal = document.getElementById('categoryDeleteModal');
        if (modal) modal.remove();
        this.pendingDeleteId = null;
        this.pendingCategoryName = null;
        this.pendingPhotoCount = 0;
    },

    // 只删除分类，保留照片
    async confirmDeleteCategoryOnly() {
        const categoryId = this.pendingDeleteId;
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        try {
            // 删除分类与照片的关联（照片保留）
            const { error: relDeleteError } = await supabase.from('photo_categories').delete().eq('category_id', categoryId);
            if (relDeleteError) throw relDeleteError;
            
            // 删除分类
            const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
            if (categoryDeleteError) throw categoryDeleteError;
            
            // 更新本地状态
            this.categories = this.categories.filter(c => c.id !== categoryId);
            
            // 更新markedCategories
            this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
            localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
            
            // 更新lockedCategories
            if (this.lockedCategories[categoryId]) {
                delete this.lockedCategories[categoryId];
                localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            }
            
            this.updateCategorySelects();
            this.renderCategories();
            this.showToast('分类已删除，照片保留');
        } catch (err) {
            console.error('删除分类失败:', err);
            this.showToast('删除失败，请重试');
        }
    },

    // 删除分类和照片
    async confirmDeleteCategoryAndPhotos() {
        const categoryId = this.pendingDeleteId;
        const categoryIds = this.getCategoryAndChildrenIds(categoryId);
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        // 找出属于这些分类的所有照片
        const photosToDelete = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;

        // 清理 Storage 文件
        const storagePaths = photosToDelete.map(p => p.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
            try { await supabase.storage.from('photo').remove(storagePaths); } catch (e) { console.warn('Storage 清理失败:', e); }
        }

        // 删除照片
        for (const photo of photosToDelete) {
            try {
                const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                if (photoDeleteError) throw photoDeleteError;
                deletedPhotoCount++;
            } catch (err) {
                console.error('删除照片失败:', photo.id, err);
            }
        }

        // 删除分类
        try {
            const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
            if (categoryDeleteError) throw categoryDeleteError;
        } catch (err) {
            console.error('删除分类失败:', err);
            this.showToast('删除分类失败，请重试');
            return;
        }
        
        // 更新本地状态
        this.photos = this.photos.filter(p => !photosToDelete.includes(p));
        this.categories = this.categories.filter(c => c.id !== categoryId);
        
        // 更新markedCategories
        this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        
        // 更新lockedCategories
        if (this.lockedCategories[categoryId]) {
            delete this.lockedCategories[categoryId];
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
        }
        
        this.updateCategorySelects();
        this.renderCategories();
        this.renderPhotos();
        this.showToast(`已删除分类及 ${deletedPhotoCount} 张照片`);
    },

    // 只删除照片，保留分类
    async confirmDeletePhotosOnly() {
        const categoryId = this.pendingDeleteId;
        const categoryIds = this.getCategoryAndChildrenIds(categoryId);
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        // 找出属于这些分类的所有照片
        const photosToDelete = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;

        // 清理 Storage 文件
        const storagePaths = photosToDelete.map(p => p.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
            try { await supabase.storage.from('photo').remove(storagePaths); } catch (e) { console.warn('Storage 清理失败:', e); }
        }

        // 删除照片
        for (const photo of photosToDelete) {
            try {
                const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                if (photoDeleteError) throw photoDeleteError;
                deletedPhotoCount++;
            } catch (err) {
                console.error('删除照片失败:', photo.id, err);
            }
        }

        // 更新本地状态
        this.photos = this.photos.filter(p => !photosToDelete.includes(p));
        
        this.renderPhotos();
        this.showToast(`已删除 ${deletedPhotoCount} 张照片，分类保留`);
    },

    closeConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.pendingDeleteId = null;
        this.pendingDeleteType = null;
    },

    async confirmDelete() {
        if (this.pendingDeleteType === 'category') {
            const categoryId = this.pendingDeleteId;
            const supabase = this.initSupabase();
            if (!supabase) return;
            
            // 获取分类及其所有子分类的ID
            const categoryIds = this.getCategoryAndChildrenIds(categoryId);
            
            // 找出属于这些分类的所有照片
            const photosToDelete = this.photos.filter(photo => {
                const photoCats = this.photoCategories[String(photo.id)] || [];
                return categoryIds.some(catId => photoCats.includes(catId));
            });
            
            let deletedPhotoCount = 0;
            
            // 先删除这些照片（会级联删除关联和留言）
            for (const photo of photosToDelete) {
                try {
                    const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                    if (photoDeleteError) throw photoDeleteError;
                    deletedPhotoCount++;
                } catch (err) {
                    console.error('删除照片失败:', photo.id, err);
                }
            }
            
            // 删除分类本身
            try {
                const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
                if (categoryDeleteError) throw categoryDeleteError;
            } catch (err) {
                console.error('删除分类失败:', err);
                this.showToast('删除分类失败，请重试');
                return;
            }
            
            // 更新本地状态
            this.photos = this.photos.filter(p => !photosToDelete.includes(p));
            this.categories = this.categories.filter(c => c.id !== categoryId);
            
            // 更新markedCategories
            this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
            localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
            
            // 从加锁列表中移除
            if (this.lockedCategories[categoryId]) {
                delete this.lockedCategories[categoryId];
                localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            }
            
            this.updateCategorySelects();
            this.renderCategories();
            this.renderPhotos();
            this.showToast(`分类及关联的 ${deletedPhotoCount} 张照片已删除`);
            
        } else if (this.pendingDeleteType === 'photo') {
            const photoId = this.pendingDeleteId;
            const supabase = this.initSupabase();
            if (!supabase) return;
            try {
                // 清理 Storage 文件
                const photo = this.photos.find(p => p.id === photoId);
                if (photo && photo.storage_path) {
                    await supabase.storage.from('photo').remove([photo.storage_path]);
                }

                const { error: relationDeleteError } = await supabase
                    .from('photo_categories')
                    .delete()
                    .eq('photo_id', photoId);
                if (relationDeleteError) throw relationDeleteError;

                const { error: commentDeleteError } = await supabase
                    .from('comments')
                    .delete()
                    .eq('photo_id', photoId);
                if (commentDeleteError) throw commentDeleteError;

                const { error: photoDeleteError } = await supabase
                    .from('photos')
                    .delete()
                    .eq('id', photoId);
                if (photoDeleteError) throw photoDeleteError;

                this.photos = this.photos.filter(p => p.id !== photoId);
                this.renderPhotos();
                this.closeDetail();
                this.showToast('照片已删除');
            } catch (err) {
                console.error('删除照片失败:', err);
                this.showToast('删除失败，请重试');
                return;
            }
        } else if (this.pendingDeleteType === 'batch-photo') {
            // 批量删除
            const supabase = this.initSupabase();
            if (!supabase) return;

            // 先获取所有选中照片的 storage_path
            const photoIds = [...this.selectedPhotos];
            let storagePaths = [];
            try {
                const { data: photoRecords } = await supabase
                    .from('photos')
                    .select('id, storage_path')
                    .in('id', photoIds);
                if (photoRecords) {
                    storagePaths = photoRecords.map(p => p.storage_path).filter(Boolean);
                }
            } catch (e) {
                console.warn('获取 storage_path 失败，跳过文件清理:', e);
            }

            // 清理 Storage 文件
            if (storagePaths.length > 0) {
                try {
                    await supabase.storage.from('photo').remove(storagePaths);
                } catch (e) {
                    console.warn('Storage 文件清理失败:', e);
                }
            }

            let deletedCount = 0;
            for (const photoId of photoIds) {
                try {
                    await supabase.from('photo_categories').delete().eq('photo_id', photoId);
                    await supabase.from('comments').delete().eq('photo_id', photoId);
                    const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photoId);
                    if (photoDeleteError) throw photoDeleteError;
                    this.photos = this.photos.filter(p => p.id !== photoId);
                    deletedCount++;
                } catch (err) {
                    console.error('删除失败:', err);
                }
            }
            this.selectedPhotos.clear();
            this.selectMode = false;
            this.updateSelectModeUI();
            this.renderPhotos();
            this.showToast(`已删除 ${deletedCount} 张照片`);
        }
        this.closeConfirmModal();
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

    filterByCategory() {
        const categoryId = document.getElementById('mobileFilterCategory').value;

        this.currentCategory = categoryId;
        this.currentPage = 1;

        // 更新分类路径显示
        this.updateCategoryPathDisplay();

        this.loadPhotos();
    },

    getFilteredPhotos() {
        // 分类筛选已由服务端 loadPhotos() 完成，直接返回当前页照片
        return this.photos;
    },

    // ========================================
    // 留言
    // ========================================
    async loadComments(photoId) {
        const list = document.getElementById('commentsList');
        try {
            const supabase = this.initSupabase();
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('photo_id', photoId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无留言</p>';
                return;
            }
            
            list.innerHTML = data.map(c => `
                <div class="comment-item">
                    <div class="comment-text">${this.escapeHtml(c.content)}</div>
                    <div class="comment-time">${this.formatTime(c.created_at)}</div>
                </div>
            `).join('');
        } catch (err) {
            console.error('加载留言失败:', err);
            list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无留言</p>';
        }
    },

    async addComment(e) {
        e.preventDefault();
        const input = document.getElementById('mobileCommentInput');
        const text = input.value.trim();
        if (!text) return;

        try {
            const supabase = this.initSupabase();
            const { error } = await supabase
                .from('comments')
                .insert([{ photo_id: this.currentPhotoId, content: text }]);
            
            if (error) throw error;
            
            input.value = '';
            this.showToast('留言已发送');
            this.loadComments(this.currentPhotoId);
        } catch (err) {
            console.error('留言失败:', err);
            this.showToast('留言失败，请重试');
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    highlightKeywords(text, searchValue) {
        if (!searchValue || !text) return text;
        const keywords = searchValue.trim().split(/\s+/).filter(k => k.length > 0);
        if (keywords.length === 0) return text;
        const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    },

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = (now - date) / 1000;
        
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        if (diff < 604800) return Math.floor(diff / 86400) + '天前';
        return date.toLocaleDateString('zh-CN');
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
            this.showPage('home');
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
                    <span>📁 ${cat.name}</span>
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
    // 改分类弹窗
    // ========================================
    openCategoryModal() {
        this.renderDetailCategoryTree();
        document.getElementById('categoryModal').style.display = 'flex';
    },

    // 渲染分类树（checkbox选择 + 箭头展开）
    renderDetailCategoryTree() {
        const container = document.getElementById('detailCategoryCascade');
        if (!container) return;
        container.innerHTML = '';
        
        // 获取当前照片的分类
        const currentCats = this.photoCategories[this.currentPhotoId] || [];
        
        // 获取顶级分类
        const rootCats = this.categories.filter(c => !c.parent_id);
        
        if (rootCats.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无分类</p>';
            return;
        }
        
        // 递归渲染
        const renderCat = (cat, level, parentContainer) => {
            const children = this.categories.filter(c => c.parent_id === cat.id);
            const hasChildren = children.length > 0;
            const isSelected = currentCats.includes(cat.id);
            const indent = level * 16;
            
            const item = document.createElement('div');
            item.className = 'cat-tree-item';
            item.style.cssText = `padding-left:${indent}px;`;
            item.id = `cat-tree-${cat.id}`;
            
            const arrowHtml = hasChildren 
                ? `<span class="cat-tree-arrow" onclick="event.stopPropagation();mobile.toggleCatTreeExpand('${cat.id}')">›</span>` 
                : '<span style="width:16px;display:inline-block;"></span>';
            
            item.innerHTML = `
                <label class="cat-tree-label" onclick="mobile.toggleCatTreeSelect('${cat.id}')">
                    <input type="checkbox" class="cat-tree-checkbox" id="cat-check-${cat.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();mobile.toggleCatTreeSelect('${cat.id}')">
                    <span class="cat-tree-name">${cat.name}</span>
                </label>
                ${arrowHtml}
            `;
            
            parentContainer.appendChild(item);
            
            // 如果有子分类，渲染子分类容器
            if (hasChildren) {
                const childContainer = document.createElement('div');
                childContainer.id = `cat-tree-children-${cat.id}`;
                childContainer.className = 'cat-tree-children';
                childContainer.style.display = 'none';
                children.forEach(child => renderCat(child, level + 1, childContainer));
                container.appendChild(childContainer);
            }
        };
        
        rootCats.forEach(cat => renderCat(cat, 0, container));
    },

    // 展开/折叠子分类
    toggleCatTreeExpand(catId) {
        const childContainer = document.getElementById(`cat-tree-children-${catId}`);
        if (!childContainer) return;
        
        const arrow = document.querySelector(`#cat-tree-${catId} .cat-tree-arrow`);
        const isHidden = childContainer.style.display === 'none';
        
        if (isHidden) {
            childContainer.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(90deg)';
        } else {
            childContainer.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    },

    // 选中/取消选中分类
    toggleCatTreeSelect(catId) {
        const checkbox = document.getElementById(`cat-check-${catId}`);
        if (!checkbox) return;
        
        checkbox.checked = !checkbox.checked;
    },

    closeCategoryModal() {
        document.getElementById('categoryModal').style.display = 'none';
    },

    async saveCategoryChange() {
        const container = document.getElementById('detailCategoryCascade');
        if (!container) return;
        
        // 获取所有选中的分类
        const checkboxes = container.querySelectorAll('.cat-tree-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.id.replace('cat-check-', ''));
        
        const photoId = this.currentPhotoId;
        
        try {
            const supabase = this.initSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');
            
            // 删除旧关联
            const { error: relationDeleteError } = await supabase.from('photo_categories').delete().eq('photo_id', photoId);
            if (relationDeleteError) throw relationDeleteError;
            
            // 添加新关联
            if (selectedIds.length > 0) {
                const inserts = selectedIds.map(catId => ({
                    photo_id: photoId,
                    category_id: catId
                }));
                const { error: relationInsertError } = await supabase.from('photo_categories').insert(inserts);
                if (relationInsertError) throw relationInsertError;
            }
            
            // 更新本地状态
            this.photoCategories[photoId] = selectedIds;
            
            // 更新照片的显示
            const photo = this.photos.find(p => p.id === photoId);
            if (photo) {
                if (selectedIds.length > 0) {
                    const cat = this.categories.find(c => c.id === selectedIds[0]);
                    photo.category_id = selectedIds[0];
                    photo.category_name = cat ? cat.name : '分类';
                } else {
                    photo.category_id = null;
                    photo.category_name = '未分类';
                }
            }
            
            this.closeCategoryModal();
            this.showToast('分类已更新');
            
            // 更新详情页的分类显示
            document.getElementById('detailCategory').textContent = selectedIds.length > 0
                ? (this.categories.find(c => c.id === selectedIds[0])?.name || '分类')
                : '未分类';
        } catch (err) {
            console.error('更新分类失败:', err);
            this.showToast('更新失败，请重试');
        }
    },

    // ========================================
    // 编辑弹窗
    // ========================================
    openEditModal() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        document.getElementById('editPhotoName').value = photo.name || '';
        document.getElementById('editPhotoDesc').value = photo.description || '';

        const locNameEl = document.getElementById('editPhotoLocationName');
        const latEl = document.getElementById('editPhotoLatitude');
        const lngEl = document.getElementById('editPhotoLongitude');
        if (locNameEl) locNameEl.value = photo.location_name || '';
        if (latEl) latEl.value = photo.latitude || '';
        if (lngEl) lngEl.value = photo.longitude || '';

        document.getElementById('editModal').style.display = 'flex';
    },

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    },

    async saveEdit() {
        const name = document.getElementById('editPhotoName').value.trim();
        const desc = document.getElementById('editPhotoDesc').value.trim();
        const location_name = (document.getElementById('editPhotoLocationName')?.value || '').trim() || null;
        const latitude = parseFloat(document.getElementById('editPhotoLatitude')?.value) || null;
        const longitude = parseFloat(document.getElementById('editPhotoLongitude')?.value) || null;

        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        try {
            const supabase = this.initSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { error } = await supabase
                .from('photos')
                .update({ name, description: desc, latitude, longitude, location_name })
                .eq('id', this.currentPhotoId);

            if (error) throw error;

            const hadLocation = !!(photo.latitude && photo.longitude);

            photo.name = name;
            photo.description = desc;
            photo.latitude = latitude;
            photo.longitude = longitude;
            photo.location_name = location_name;
            document.getElementById('detailName').textContent = name;
            document.getElementById('detailDesc').textContent = desc;

            this.closeEditModal();
            this.renderPhotos();
            this.showToast('已保存');
            if (!hadLocation && latitude && longitude) this.addXP(20, 'location');
        } catch (err) {
            console.error('保存编辑失败:', err);
            this.showToast('保存失败，请重试');
        }
    },

    // ========================================
    // 下载照片
    // ========================================
    downloadPhoto() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        const link = document.createElement('a');
        link.href = this.getPhotoUrl(photo.storage_path) || 'https://picsum.photos/800/600';
        link.download = photo.name || 'photo';
        link.click();
    },

    // ========================================
    // 删除照片
    // ========================================
    deletePhoto() {
        this.pendingDeleteId = this.currentPhotoId;
        this.pendingDeleteType = 'photo';
        document.getElementById('confirmTitle').textContent = '删除照片';
        document.getElementById('confirmMessage').textContent = '确定要删除这张照片吗？';
        document.getElementById('confirmModal').style.display = 'flex';
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
    // 地图功能
    // ========================================
    initMapView() {
        const container = document.getElementById('mobileMapContainer');
        if (!container || this.mapView) return;

        this.mapView = L.map('mobileMapContainer').setView([35.86, 104.19], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM',
            maxZoom: 18
        }).addTo(this.mapView);

        this.loadMapPhotos();
        setTimeout(() => this.mapView.invalidateSize(), 200);
    },

    async loadMapPhotos() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;

            const { data } = await supabase
                .from('photos')
                .select('*')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('created_at', { ascending: false });

            this.mapPhotos = data || [];
            this.renderMapMarkers();
            this.renderMobileMapPhotos();
        } catch (err) {
            console.error('加载地图照片失败:', err);
        }
    },

    renderMapMarkers() {
        if (!this.mapView) return;
        this.mapMarkers.forEach(m => this.mapView.removeLayer(m));
        this.mapMarkers = [];

        if (this.mapPhotos.length === 0) return;

        const bounds = [];
        this.mapPhotos.forEach(photo => {
            const url = this.getPhotoUrl(photo.storage_path);
            const marker = L.marker([photo.latitude, photo.longitude])
                .addTo(this.mapView)
                .bindPopup(`
                    <div style="text-align:center;max-width:180px;">
                        <img src="${url}"
                             style="width:100%;max-height:100px;object-fit:cover;border-radius:8px;margin-bottom:6px;"
                             onerror="this.style.display='none'">
                        <strong>${this.escapeHtml(photo.name)}</strong>
                        <p style="margin:4px 0;font-size:11px;color:#666;">
                            ${this.escapeHtml(photo.location_name || '')}
                        </p>
                        <button onclick="mobile.openDetail('${photo.id}')"
                            style="padding:4px 12px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
                            查看详情
                        </button>
                    </div>
                `);
            this.mapMarkers.push(marker);
            bounds.push([photo.latitude, photo.longitude]);
        });

        if (bounds.length > 0) {
            this.mapView.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
        }
    },

    renderMobileMapPhotos() {
        const container = document.getElementById('mobileMapPhotos');
        if (!container) return;

        if (this.mapPhotos.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;width:100%;">还没有带位置的照片</div>';
            return;
        }

        container.innerHTML = this.mapPhotos.map(photo => {
            const url = this.getPhotoUrl(photo.storage_path);
            return `
                <div style="width:80px;cursor:pointer;border-radius:8px;overflow:hidden;"
                     onclick="mobile.openDetail('${photo.id}')">
                    <img src="${url}" alt="${this.escapeHtml(photo.name)}"
                         style="width:80px;height:80px;object-fit:cover;">
                    <div style="font-size:10px;text-align:center;padding:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${this.escapeHtml(photo.location_name || photo.name)}
                    </div>
                </div>
            `;
        }).join('');
    },

    pickLocationOnMap() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileLocationPickerModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:95%;max-width:500px;padding:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0;font-size:16px;">点击地图选择位置</h3>
                    <button onclick="document.getElementById('mobileLocationPickerModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div id="mobilePickerMap" style="height:350px;"></div>
                <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                    <input type="text" id="mobilePickerLocationName" placeholder="地点名称" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;">
                    <span id="mobilePickerCoords" style="color:#666;font-size:13px;">点击地图获取坐标</span>
                    <button class="btn-primary" onclick="mobile.confirmMobileMapPick()" style="width:100%;">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const pickerMap = L.map('mobilePickerMap').setView([35.86, 104.19], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM',
                maxZoom: 18
            }).addTo(pickerMap);

            let pickedMarker = null;

            pickerMap.on('click', function(e) {
                window.__mobilePickedLatLng = e.latlng;
                if (pickedMarker) pickerMap.removeLayer(pickedMarker);
                pickedMarker = L.marker(e.latlng).addTo(pickerMap);
                document.getElementById('mobilePickerCoords').textContent =
                    '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
            });

            setTimeout(() => pickerMap.invalidateSize(), 100);
        }, 100);
    },

    confirmMobileMapPick() {
        if (window.__mobilePickedLatLng) {
            document.getElementById('mobilePhotoLatitude').value = window.__mobilePickedLatLng.lat.toFixed(6);
            document.getElementById('mobilePhotoLongitude').value = window.__mobilePickedLatLng.lng.toFixed(6);
            const locName = (document.getElementById('mobilePickerLocationName')?.value || '').trim();
            if (locName) document.getElementById('mobilePhotoLocationName').value = locName;
        }
        const modal = document.getElementById('mobileLocationPickerModal');
        if (modal) modal.remove();
        window.__mobilePickedLatLng = null;
    },

    // ========================================
    // 纪念日时间线
    // ========================================
    getDefaultMilestones() {
        return [
            { id: '1', date: '2020-06-15', title: '我们在一起的第一天', description: '故事从这里开始', photoId: null },
            { id: '2', date: '2021-02-14', title: '第一个情人节', description: '', photoId: null },
            { id: '3', date: '2021-01-01', title: '第一个新年', description: '', photoId: null },
            { id: '4', date: '2021-12-25', title: '第一个圣诞节', description: '', photoId: null },
        ];
    },

    async loadMilestones() {
        const supabase = this.initSupabase();
        if (!supabase) {
            this.anniversaryMilestones = JSON.parse(localStorage.getItem('anniversary_milestones') || 'null') || this.getDefaultMilestones();
            this.anniversaryStartDate = localStorage.getItem('anniversary_start_date') || '2020-06-15';
            return;
        }

        // 先确保有 localStorage 数据可回退
        if (!localStorage.getItem('anniversary_milestones')) {
            this.anniversaryMilestones = this.getDefaultMilestones();
        }

        let shouldMigrate = false;
        let selectOk = false;
        try {
            const { data, error } = await supabase
                .from('milestones')
                .select('*')
                .order('date', { ascending: false });

            if (!error && data && data.length > 0) {
                this.anniversaryMilestones = data.map(m => ({
                    id: String(m.id),
                    date: m.date,
                    title: m.title,
                    description: m.description || '',
                    photoId: m.photo_id || null,
                    photoPath: m.photo_path || null,
                    photoName: m.photo_name || null,
                    categoryId: m.category_id || null,
                    categoryName: m.category_name || null,
                    milestone_type: m.milestone_type || 'anniversary',
                    repeat_yearly: m.repeat_yearly || false
                }));
                selectOk = true;
                // 如果 localStorage 有数据（可能是之前 Supabase 保存失败留下的），合并后回写
                const saved = localStorage.getItem('anniversary_milestones');
                if (saved) {
                    const localMilestones = JSON.parse(saved);
                    localMilestones.forEach(lm => {
                        const existing = this.anniversaryMilestones.find(m => m.id === lm.id);
                        if (existing) {
                            if (lm.categoryId) existing.categoryId = lm.categoryId;
                            if (lm.categoryName) existing.categoryName = lm.categoryName;
                            if (lm.photoId) existing.photoId = lm.photoId;
                            if (lm.photoPath) existing.photoPath = lm.photoPath;
                            if (lm.photoName) existing.photoName = lm.photoName;
                        } else {
                            this.anniversaryMilestones.push(lm);
                        }
                    });
                    shouldMigrate = true;
                }
            } else if (!error) {
                selectOk = true;
                const saved = localStorage.getItem('anniversary_milestones');
                if (saved) {
                    this.anniversaryMilestones = JSON.parse(saved);
                    shouldMigrate = true;
                }
            }
        } catch (e) { /* 静默 */ }

        if (this.anniversaryMilestones.length === 0) {
            this.anniversaryMilestones = JSON.parse(localStorage.getItem('anniversary_milestones') || 'null') || this.getDefaultMilestones();
        }

        if (shouldMigrate) {
            await this.migrateMilestonesToSupabase();
        }

        await this._loadStartDate();
    },

    async _loadStartDate() {
        this.anniversaryStartDate = localStorage.getItem('anniversary_start_date') || '2020-06-15';
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'anniversary_start_date')
                .single();
            if (!error && data) {
                this.anniversaryStartDate = data.value;
            } else if (!error) {
                await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: this.anniversaryStartDate });
            }
        } catch (e) { /* 静默 */ }
    },

    async migrateMilestonesToSupabase() {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const rows = this.anniversaryMilestones.map(m => ({
                id: safeBigint(m.id, Date.now() + Math.floor(Math.random() * 1000)),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photo_id: m.photoId || null,
                photo_path: m.photoPath || null,
                photo_name: m.photoName || null,
                category_id: safeBigint(m.categoryId, null),
                category_name: m.categoryName || null,
                milestone_type: m.milestone_type || 'anniversary',
                repeat_yearly: m.repeat_yearly || false
            }));
            const { error } = await supabase.from('milestones').upsert(rows);
            if (error) { console.error('迁移纪念日失败:', error); return; }
            localStorage.removeItem('anniversary_milestones');
        } catch (e) {
            console.error('迁移纪念日异常:', e);
        }
    },

    async saveMilestonesToSupabase() {
        const supabase = this.initSupabase();
        if (!supabase) {
            console.warn('Supabase 未初始化，无法保存纪念日');
            return;
        }
        try {
            const rows = this.anniversaryMilestones.map(m => ({
                id: safeBigint(m.id, Date.now()),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photo_id: m.photoId || null,
                photo_path: m.photoPath || null,
                photo_name: m.photoName || null,
                category_id: safeBigint(m.categoryId, null),
                category_name: m.categoryName || null,
                milestone_type: m.milestone_type || 'anniversary',
                repeat_yearly: m.repeat_yearly || false
            }));
            const { error } = await supabase.from('milestones').upsert(rows);
            if (error) { console.error('保存纪念日失败:', error); return; }
            localStorage.removeItem('anniversary_milestones');
        } catch (e) {
            console.error('保存纪念日异常:', e);
        }
    },

    async saveStartDateToSupabase() {
        const supabase = this.initSupabase();
        if (!supabase) {
            console.warn('Supabase 未初始化，无法保存开始日期');
            return;
        }
        try {
            const { error } = await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: this.anniversaryStartDate });
            if (!error) {
                localStorage.removeItem('anniversary_start_date');
                return;
            }
            console.error('保存开始日期失败:', error);
        } catch (e) {
            console.error('保存开始日期异常:', e);
        }
    },

    async initTimeline() {
        this._timelinePage = 1;
        await this.loadMilestones();
        const startInput = document.getElementById('mobileStartDateInput');
        if (startInput) startInput.value = this.anniversaryStartDate;
        this.updateDaysCounter();
        this.updateCountdownDisplay();
        this.renderTimeline();
    },

    updateDaysCounter() {
        if (!this.anniversaryStartDate) return;
        const el = document.getElementById('mobileDaysCount');
        if (!el) return;
        const start = new Date(this.anniversaryStartDate);
        const today = new Date();
        const diffTime = today - start;
        const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        el.textContent = diffDays;
    },

    async updateStartDate() {
        const input = document.getElementById('mobileStartDateInput');
        if (!input) return;
        this.anniversaryStartDate = input.value;
        await this.saveStartDateToSupabase();
        this.updateDaysCounter();
    },

    renderTimeline() {
        const container = document.getElementById('mobileTimelineContainer');
        if (!container) return;

        const sorted = [...this.anniversaryMilestones].sort((a, b) => new Date(b.date) - new Date(a.date));
        const visible = sorted.slice(0, this._timelinePage * 10);
        const hasMore = sorted.length > visible.length;

        container.innerHTML = visible.map(m => {
            const milestoneDate = new Date(m.date);
            const today = new Date();
            const diffDays = Math.floor((today - milestoneDate) / (1000 * 60 * 60 * 24));
            const years = Math.floor(diffDays / 365);
            const remainDays = diffDays % 365;

            let catHtml = '';
            if (m.categoryId) {
                catHtml = `<div style="margin-top:8px;">
                    <button class="btn-secondary" style="font-size:12px;padding:4px 12px;"
                        onclick="mobile.goToCategory('${m.categoryId}')">📁 ${this.escapeHtml(m.categoryName || '查看分类')}</button>
                </div>`;
            }

            let photoHtml = '';
            if (m.photoId) {
                const url = m.photoPath ? this.getPhotoUrl(m.photoPath) : '';
                if (url) {
                    photoHtml = `<img src="${url}"
                        style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-top:8px;cursor:pointer;"
                        onclick="mobile.openDetail('${m.photoId}')"
                        onerror="this.style.display='none'">`;
                }
            }

            let timeAgo = '';
            if (years > 0) timeAgo += years + '年';
            if (remainDays > 0 || years === 0) timeAgo += remainDays + '天';
            timeAgo += '前';

            return `
                <div class="timeline-mobile-item">
                    <div class="timeline-mobile-date">${m.date}</div>
                    <h3>${this.escapeHtml(m.title)}</h3>
                    ${m.description ? '<p>' + this.escapeHtml(m.description) + '</p>' : ''}
                    <small style="color:#999;">${timeAgo}</small>
                    ${catHtml}
                    ${photoHtml}
                    <div style="margin-top:8px;display:flex;gap:8px;">
                        <button class="btn-secondary" style="font-size:11px;padding:4px 8px;"
                            onclick="mobile.openEditMilestoneModal('${m.id}')">✏️</button>
                        <button class="btn-danger" style="font-size:11px;padding:4px 8px;"
                            onclick="mobile.deleteMilestone('${m.id}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        if (hasMore) {
            container.innerHTML += `
                <div style="text-align:center;padding:16px 0;">
                    <button class="btn-secondary" onclick="mobile.loadMoreTimeline()" style="font-size:13px;padding:8px 28px;border-radius:20px;">
                        加载更多 (${visible.length}/${sorted.length})
                    </button>
                </div>`;
        }
    },

    loadMoreTimeline() {
        this._timelinePage++;
        this.renderTimeline();
    },

    buildMobileCategoryOptions(selectedId) {
        function walk(cats, depth) {
            let html = '';
            cats.forEach(cat => {
                const prefix = '　'.repeat(depth);
                const sel = String(cat.id) === String(selectedId || '') ? 'selected' : '';
                html += `<option value="${cat.id}" ${sel}>${prefix}${this.escapeHtml(cat.name)}</option>`;
                const children = this.categories.filter(c => c.parent_id === cat.id);
                if (children.length > 0) html += walk.call(this, children, depth + 1);
            });
            return html;
        }
        const roots = this.categories.filter(c => !c.parent_id);
        return walk.call(this, roots, 0);
    },

    goToCategory(catId) {
        this.currentCategory = String(catId);
        this.currentPage = 1;
        this.showFavoritesOnly = false;
        this.switchTab('photos');
        this.loadPhotos();
        const feed = document.getElementById('photoFeed');
        if (feed) feed.scrollIntoView({ behavior: 'smooth' });
    },

    openAddMilestoneModal() {
        this._milestonePhotoData = null;
        const catOpts = this.buildMobileCategoryOptions('');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileMilestoneModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:90%;max-width:400px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <h3 style="margin:0;">添加纪念日</h3>
                    <button onclick="document.getElementById('mobileMilestoneModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div class="form-item">
                    <label>日期</label>
                    <input type="date" id="mobileMilestoneDate">
                </div>
                <div class="form-item">
                    <label>标题</label>
                    <input type="text" id="mobileMilestoneTitle">
                </div>
                <div class="form-item">
                    <label>描述</label>
                    <textarea id="mobileMilestoneDesc" rows="2"></textarea>
                </div>
                <div class="form-item">
                    <label>关联类别（可选）</label>
                    <select id="mobileMilestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                        <option value="">不关联类别</option>
                        ${catOpts}
                    </select>
                </div>
                <div class="form-item">
                    <label>关联照片（可选）</label>
                    <div id="mobileMilestonePhotoPreview"></div>
                    <button type="button" class="btn-secondary" onclick="mobile.openMobileMilestonePhotoPicker()" style="width:100%;">📷 选择照片</button>
                    <button type="button" class="btn-secondary" onclick="mobile.clearMobileMilestonePhoto()" id="mobileClearMilestonePhotoBtn" style="display:none;width:100%;">✕ 取消关联</button>
                </div>
                <input type="hidden" id="mobileMilestonePhotoId" value="">
                <button class="btn-primary" onclick="mobile.saveMilestoneMobile()" style="width:100%;">保存</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async openMobileMilestonePhotoPicker() {
        const supabase = this.initSupabase();
        const { data } = await supabase
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        const photoList = data || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileMilestonePhotoPicker';
        modal.style.display = 'flex';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-card" style="width:95%;max-width:500px;max-height:80vh;overflow-y:auto;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <h3 style="margin:0;">选择关联照片</h3>
                    <button onclick="document.getElementById('mobileMilestonePhotoPicker').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <input type="text" id="mobileMilestonePhotoSearch" placeholder="🔍 搜索照片..."
                    style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;"
                    oninput="mobile.filterMobileMilestonePhotos()">
                <div id="mobileMilestonePhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
                    ${photoList.map(p => `
                        <div class="mobile-ms-photo-item" data-name="${this.escapeHtml(p.name || '')}" style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;"
                            onclick="mobile.pickMobileMilestonePhoto('${p.id}','${p.storage_path}','${this.escapeHtml(p.name || '').replace(/'/g,"\\'")}')">
                            <img src="${this.getPhotoUrl(p.storage_path)}" style="width:100%;height:80px;object-fit:cover;" onerror="this.style.display='none'">
                            <div style="padding:4px;font-size:11px;text-align:center;color:#666;">${this.escapeHtml((p.name || '').substring(0,12))}</div>
                        </div>
                    `).join('')}
                </div>
                ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
            </div>
        `;
        document.body.appendChild(modal);
    },

    filterMobileMilestonePhotos() {
        const query = document.getElementById('mobileMilestonePhotoSearch').value.toLowerCase();
        document.querySelectorAll('.mobile-ms-photo-item').forEach(el => {
            el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
        });
    },

    pickMobileMilestonePhoto(id, storagePath, name) {
        this._milestonePhotoData = { id, storage_path: storagePath, name };
        document.getElementById('mobileMilestonePhotoId').value = id;
        document.getElementById('mobileMilestonePhotoPreview').innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(storagePath)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">
                <div style="font-size:13px;">${this.escapeHtml(name || '未命名')}</div>
            </div>`;
        document.getElementById('mobileClearMilestonePhotoBtn').style.display = '';
        const picker = document.getElementById('mobileMilestonePhotoPicker');
        if (picker) picker.remove();
    },

    clearMobileMilestonePhoto() {
        this._milestonePhotoData = null;
        document.getElementById('mobileMilestonePhotoId').value = '';
        document.getElementById('mobileMilestonePhotoPreview').innerHTML = '';
        document.getElementById('mobileClearMilestonePhotoBtn').style.display = 'none';
    },

    saveMilestoneMobile() {
        const date = document.getElementById('mobileMilestoneDate').value;
        const title = document.getElementById('mobileMilestoneTitle').value.trim();
        const desc = document.getElementById('mobileMilestoneDesc').value.trim();
        const photoId = document.getElementById('mobileMilestonePhotoId').value.trim() || null;

        if (!date || !title) {
            this.showToast('请填写日期和标题');
            return;
        }

        const catId = document.getElementById('mobileMilestoneCategoryId').value || null;
        const catName = catId ? (this.categories.find(c => String(c.id) === String(catId)) || {}).name || '' : '';
        const pd = this._milestonePhotoData;
        this.anniversaryMilestones.push({
            id: Date.now().toString(),
            date, title,
            description: desc,
            photoId: photoId || null,
            photoPath: pd ? pd.storage_path : null,
            photoName: pd ? pd.name : null,
            categoryId: catId || null,
            categoryName: catName || null
        });
        this._milestonePhotoData = null;
        this.saveMilestonesToSupabase();
        this.renderTimeline();
        document.getElementById('mobileMilestoneModal').remove();
    },

    openEditMilestoneModal(id) {
        const m = this.anniversaryMilestones.find(ms => ms.id === id);
        if (!m) return;

        this._milestonePhotoData = m.photoId ? { id: m.photoId, storage_path: m.photoPath || '', name: m.photoName || '' } : null;
        const pd = this._milestonePhotoData;
        const previewHtml = pd ? `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(pd.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">
                <div style="font-size:13px;">${this.escapeHtml(pd.name || '未命名')}</div>
            </div>` : '';

        const catOpts = this.buildMobileCategoryOptions(m.categoryId || '');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileMilestoneModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:90%;max-width:400px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <h3 style="margin:0;">编辑纪念日</h3>
                    <button onclick="document.getElementById('mobileMilestoneModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div class="form-item">
                    <label>日期</label>
                    <input type="date" id="mobileMilestoneDate" value="${m.date}">
                </div>
                <div class="form-item">
                    <label>标题</label>
                    <input type="text" id="mobileMilestoneTitle" value="${this.escapeHtml(m.title)}">
                </div>
                <div class="form-item">
                    <label>描述</label>
                    <textarea id="mobileMilestoneDesc" rows="2">${this.escapeHtml(m.description || '')}</textarea>
                </div>
                <div class="form-item">
                    <label>关联类别（可选）</label>
                    <select id="mobileMilestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                        <option value="">不关联类别</option>
                        ${catOpts}
                    </select>
                </div>
                <div class="form-item">
                    <label>关联照片（可选）</label>
                    <div id="mobileMilestonePhotoPreview">${previewHtml}</div>
                    <button type="button" class="btn-secondary" onclick="mobile.openMobileMilestonePhotoPicker()" style="width:100%;">📷 选择照片</button>
                    <button type="button" class="btn-secondary" onclick="mobile.clearMobileMilestonePhoto()" id="mobileClearMilestonePhotoBtn"
                        style="${pd ? '' : 'display:none;'}width:100%;">✕ 取消关联</button>
                </div>
                <input type="hidden" id="mobileMilestonePhotoId" value="${m.photoId || ''}">
                <button class="btn-primary" onclick="mobile.updateMilestoneMobile('${id}')" style="width:100%;">保存</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    updateMilestoneMobile(id) {
        const m = this.anniversaryMilestones.find(ms => ms.id === id);
        if (!m) return;

        m.date = document.getElementById('mobileMilestoneDate').value;
        m.title = document.getElementById('mobileMilestoneTitle').value.trim();
        m.description = document.getElementById('mobileMilestoneDesc').value.trim();
        m.photoId = document.getElementById('mobileMilestonePhotoId').value.trim() || null;
        const pd = this._milestonePhotoData;
        m.photoPath = pd ? pd.storage_path : null;
        m.photoName = pd ? pd.name : null;
        const catId = document.getElementById('mobileMilestoneCategoryId').value || null;
        m.categoryId = catId || null;
        m.categoryName = catId ? (this.categories.find(c => String(c.id) === String(catId)) || {}).name || '' : null;

        this._milestonePhotoData = null;
        this.saveMilestonesToSupabase();
        this.renderTimeline();
        document.getElementById('mobileMilestoneModal').remove();
    },

    deleteMilestone(id) {
        if (!confirm('确定删除这个纪念日？')) return;
        this.anniversaryMilestones = this.anniversaryMilestones.filter(m => m.id !== id);
        this.saveMilestonesToSupabase();
        this.renderTimeline();
    },

    // ========================================
    // 照片拼贴墙
    // ========================================
    renderMobileCollageCategorySelect() {
        const container = document.getElementById('mobileCollageCategoryCascade');
        if (!container) return;
        container.innerHTML = '';

        const topLevel = this.categories.filter(c => !c.parent_id);
        if (topLevel.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>';
            return;
        }

        const select = document.createElement('select');
        select.id = 'mobileCollageCatLevel0';
        select.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:4px;';
        select.onchange = () => this.onMobileCollageCatLevelChange(0);
        select.innerHTML = `<option value="">全部照片</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        container.appendChild(select);

        const hint = document.createElement('p');
        hint.style.cssText = 'font-size:12px;color:#888;margin:4px 0 0 0;';
        hint.textContent = '提示：选择父分类并留空子分类下拉，将自动包含所有子分类的照片';
        container.appendChild(hint);
    },

    onMobileCollageCatLevelChange(level) {
        const container = document.getElementById('mobileCollageCategoryCascade');
        if (!container) return;
        const select = document.getElementById(`mobileCollageCatLevel${level}`);
        if (!select) return;

        const selectedValue = select.value;

        const selects = container.querySelectorAll('select');
        selects.forEach((s, i) => {
            if (i > level) s.remove();
        });

        if (selectedValue) {
            const children = this.categories.filter(c => String(c.parent_id) === String(selectedValue));
            if (children.length > 0) {
                const nextLevel = level + 1;
                const nextSelect = document.createElement('select');
                nextSelect.id = `mobileCollageCatLevel${nextLevel}`;
                nextSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:4px;';
                nextSelect.onchange = () => this.onMobileCollageCatLevelChange(nextLevel);
                nextSelect.innerHTML = `<option value="">包含所有子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
                container.appendChild(nextSelect);
            }
        }
    },

    getMobileCollageSelectedCategoryId() {
        const container = document.getElementById('mobileCollageCategoryCascade');
        if (!container) return null;
        const selects = container.querySelectorAll('select');
        for (let i = selects.length - 1; i >= 0; i--) {
            if (selects[i].value) return selects[i].value;
        }
        return null;
    },

    async generateCollage() {
        const canvas = document.getElementById('mobileCollageCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // 确保照片-分类映射已加载
        if (Object.keys(this.photoCategories).length === 0) {
            await this.loadAllPhotoCategories();
        }

        const supabase = this.initSupabase();
        const catId = this.getMobileCollageSelectedCategoryId();
        let collagePhotos;
        if (catId) {
            const categoryIds = this.getCategoryAndChildrenIds(catId);
            // 通过内存中的 photoCategories 筛选匹配的 photo_id
            const matchingPhotoIds = new Set();
            Object.entries(this.photoCategories).forEach(([photoId, catIds]) => {
                if (catIds.some(cid => categoryIds.includes(cid))) {
                    matchingPhotoIds.add(photoId);
                }
            });
            if (matchingPhotoIds.size === 0) {
                this.showToast('所选分类下没有照片 调试:选中ID=' + catId + ' 子类=' + categoryIds.length + '个 pcMap有' + Object.keys(this.photoCategories).length + '条');
                return;
            }
            const { data } = await supabase
                .from('photos')
                .select('*')
                .in('id', [...matchingPhotoIds].slice(0, 200))
                .order('created_at', { ascending: false })
                .limit(200);
            collagePhotos = data || [];
        } else {
            const { data } = await supabase
                .from('photos')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);
            collagePhotos = data || [];
        }

        if (collagePhotos.length === 0) {
            this.showToast('所选分类下没有照片');
            return;
        }

        const size = 360;
        canvas.width = size;
        canvas.height = size;

        // 背景
        ctx.fillStyle = '#fff0f5';
        ctx.fillRect(0, 0, size, size);

        // 预加载图片
        const imageCache = new Map();
        const photosToUse = collagePhotos.slice(0, 50);
        await Promise.all(photosToUse.map(async (photo) => {
            const url = this.getPhotoUrl(photo.storage_path);
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                });
                imageCache.set(photo.id, img);
            } catch (e) {}
        }));

        const loadedPhotos = photosToUse.filter(p => imageCache.has(p.id));
        if (loadedPhotos.length === 0) {
            ctx.fillStyle = '#999';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('无法加载照片', size / 2, size / 2);
            return;
        }

        // 参数化爱心: x = 16sin³(t), y = 13cos(t)-5cos(2t)-2cos(3t)-cos(4t)
        const heartScale = size / 34;
        const hx = size / 2;
        const hy = size * 0.42;

        function drawHeart() {
            ctx.beginPath();
            const pts = 200;
            for (let i = 0; i <= pts; i++) {
                const t = (i / pts) * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                const px = hx + x * heartScale;
                const py = hy - y * heartScale;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        // 裁剪到爱心，填充照片网格
        ctx.save();
        drawHeart();
        ctx.clip();

        const cellSize = size / 22;
        const cols = Math.ceil(size / cellSize);
        const rows = Math.ceil(size / cellSize);
        const cells = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                cells.push({ x: col * cellSize, y: row * cellSize, s: cellSize + 1 });
            }
        }
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }

        let photoIndex = 0;
        for (const cell of cells) {
            const photo = loadedPhotos[photoIndex % loadedPhotos.length];
            const img = imageCache.get(photo.id);
            ctx.drawImage(img, cell.x, cell.y, cell.s, cell.s);
            photoIndex++;
        }

        ctx.restore();

        // 描边
        drawHeart();
        ctx.strokeStyle = '#ff6b81';
        ctx.lineWidth = 2;
        ctx.stroke();

        this.addXP(25, 'collage');
    },

    downloadCollage() {
        const canvas = document.getElementById('mobileCollageCanvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = '爱心拼贴_' + new Date().toISOString().slice(0, 10) + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    },

    // ========================================
    // ========================================
    // 恋爱成就 RPG 系统
    // ========================================

    // 等级计算：到达 level 所需总 XP
    _rpgTotalXPForLevel(level) {
        let total = 0;
        for (let i = 1; i < level; i++) {
            total += 30 + Math.floor(i / 5);
        }
        return total;
    },

    // 从 XP 反算等级
    _rpgLevelFromXP(xp) {
        let level = 1;
        while (xp >= this._rpgTotalXPForLevel(level + 1)) level++;
        return Math.min(level, 999);
    },

    // 当前等级进度 (0-100)
    _rpgLevelProgress(xp) {
        const level = this._rpgLevelFromXP(xp);
        const currentLvlXP = this._rpgTotalXPForLevel(level);
        const nextLvlXP = this._rpgTotalXPForLevel(level + 1);
        return Math.floor((xp - currentLvlXP) / (nextLvlXP - currentLvlXP) * 100);
    },

    // 等级称号
    _rpgTitleForLevel(level) {
        const tiers = [
            [1, '🐣 初识·怦然心动'], [5, '🌱 萌芽·小鹿乱撞'], [15, '💕 甜蜜·如胶似漆'],
            [30, '🔥 热恋·难舍难分'], [50, '💍 笃定·此生有你'], [80, '🏡 归宿·老夫老妻'],
            [150, '🌟 传奇·情深似海'], [300, '👑 永恒·三生三世'], [666, '💎 神话·至死不渝']
        ];
        let title = tiers[0][1];
        for (const [lvl, t] of tiers) { if (level >= lvl) title = t; }
        return title;
    },

    // 加载 RPG 数据
    async loadRPGData() {
        const uname = this.currentUser?.username || 'default';
        const supabase = this.initSupabase();
        if (!supabase) { this._initLocalRPG(); return; }

        try {
            const { data, error } = await supabase.from('rpg_progress').select('*').eq('user_name', uname).maybeSingle();
            if (error) throw error;
            if (data) {
                this.rpgData = data;
                this._checkLoginStreak();
            } else {
                const { data: inserted, error: insertErr } = await supabase.from('rpg_progress').upsert({ user_name: uname, xp: 0, last_login_date: new Date().toISOString().slice(0, 10), login_streak: 1 }, { onConflict: 'user_name' }).select('*').single();
                if (insertErr) throw insertErr;
                this.rpgData = inserted;
            }
        } catch (e) {
            console.warn('RPG Supabase 不可用，使用本地存储:', e.message);
            this._initLocalRPG();
        }
        this._refreshDailyQuests();
        this._refreshWeeklyQuests();
    },

    _initLocalRPG() {
        this.rpgData = { xp: 0, daily_quests: [], weekly_quests: [], unlocked_titles: [], active_title: '', custom_rewards: [], login_streak: 1, last_login_date: new Date().toISOString().slice(0, 10) };
        this._refreshDailyQuests();
        this._refreshWeeklyQuests();
    },

    async _saveRPGData() {
        if (!this.rpgData) return;
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            await supabase.from('rpg_progress').upsert({
                user_name: this.currentUser?.username || 'default',
                xp: this.rpgData.xp,
                daily_quests: this.rpgData.daily_quests,
                weekly_quests: this.rpgData.weekly_quests,
                unlocked_titles: this.rpgData.unlocked_titles,
                active_title: this.rpgData.active_title,
                custom_rewards: this.rpgData.custom_rewards,
                login_streak: this.rpgData.login_streak,
                last_login_date: this.rpgData.last_login_date,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_name' });
        } catch (e) { /* 静默 */ }
    },

    _checkLoginStreak() {
        if (!this.rpgData) return;
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = this.rpgData.last_login_date;
        if (lastDate === today) return;
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (lastDate === yesterday) {
            this.rpgData.login_streak = (this.rpgData.login_streak || 0) + 1;
        } else {
            this.rpgData.login_streak = 1;
        }
        this.rpgData.last_login_date = today;
        this._saveRPGData();
    },

    // 添加 XP
    async addXP(amount, reason) {
        if (!this.rpgData) await this.loadRPGData();
        const today = new Date().toISOString().slice(0, 10);
        if (this._rpgXpDate !== today) { this._rpgXpToday = 0; this._rpgXpDate = today; }

        const streakBonus = (this.rpgData.login_streak >= 7) ? 1.5 : (this.rpgData.login_streak >= 3 ? 1.2 : 1.0);
        let earned = Math.floor(amount * streakBonus);

        if (this._rpgXpToday + earned > this.RPG_DAILY_XP_CAP) {
            earned = Math.max(0, this.RPG_DAILY_XP_CAP - this._rpgXpToday);
        }
        if (earned <= 0) return;

        this._rpgXpToday += earned;
        const oldLevel = this._rpgLevelFromXP(this.rpgData.xp);
        this.rpgData.xp += earned;
        const newLevel = this._rpgLevelFromXP(this.rpgData.xp);

        // 检查称号解锁
        const title = this._rpgTitleForLevel(newLevel);
        if (!this.rpgData.unlocked_titles.includes(title)) {
            this.rpgData.unlocked_titles.push(title);
            if (newLevel > oldLevel) {
                this.showToast('🎉 解锁称号: ' + title);
            }
        }

        await this._saveRPGData();
        this._checkQuestProgress(reason);
        if (newLevel > oldLevel) {
            this.showToast('⬆️ 升级！Lv.' + newLevel + ' ' + title);
        }
    },

    // 每日任务模板
    _dailyQuestTemplates: [
        { id: 'dq_mood', label: '写一篇心情日记', xp: 15, check: function() { return true; } },
        { id: 'dq_photo3', label: '上传 3 张照片', xp: 20, target: 3, check: function() { return true; } },
        { id: 'dq_photo1', label: '上传 1 张照片', xp: 10, target: 1, check: function() { return true; } },
        { id: 'dq_chatter', label: '发一条每日叨叨', xp: 10, check: function() { return true; } },
        { id: 'dq_checkin', label: '完成一个情侣打卡', xp: 25, check: function() { return true; } },
        { id: 'dq_fav3', label: '收藏 3 张照片', xp: 15, target: 3, check: function() { return true; } },
        { id: 'dq_location', label: '标记一个地点', xp: 20, check: function() { return true; } },
        { id: 'dq_category', label: '创建一个分类', xp: 15, check: function() { return true; } },
    ],

    _refreshDailyQuests() {
        const today = new Date().toISOString().slice(0, 10);
        if (this.rpgData.daily_quests_date === today && this.rpgData.daily_quests?.length > 0) return;

        const pool = [...this._dailyQuestTemplates];
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        this.rpgData.daily_quests = pool.slice(0, 3).map(function(q) {
            return { id: q.id, label: q.label, xp: q.xp, target: q.target || 1, progress: 0, done: false };
        });
        this.rpgData.daily_quests_date = today;
        this._saveRPGData();
    },

    _weeklyQuestTemplates: [
        { id: 'wq_checkin3', label: '完成 3 个情侣打卡', xp: 60, target: 3 },
        { id: 'wq_photo10', label: '上传 10 张照片', xp: 80, target: 10 },
        { id: 'wq_mood5', label: '写 5 篇心情日记', xp: 50, target: 5 },
        { id: 'wq_location', label: '在地图标记一个地点', xp: 40, target: 1 },
        { id: 'wq_daily3', label: '完成全部每日任务 3 天', xp: 100, target: 3 },
        { id: 'wq_chatter5', label: '发 5 条每日叨叨', xp: 40, target: 5 },
        { id: 'wq_collage', label: '制作一张拼贴墙', xp: 60, target: 1 },
        { id: 'wq_album', label: '创建一个相册', xp: 50, target: 1 },
    ],

    _refreshWeeklyQuests() {
        const weekKey = this._getWeekKey();
        if (this.rpgData.weekly_quests_week === weekKey && this.rpgData.weekly_quests?.length > 0) return;

        const pool = [...this._weeklyQuestTemplates];
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        this.rpgData.weekly_quests = pool.slice(0, 5).map(function(q) {
            return { id: q.id, label: q.label, xp: q.xp, target: q.target, progress: 0, done: false };
        });
        this.rpgData.weekly_quests_week = weekKey;
        this._saveRPGData();
    },

    _getWeekKey() {
        const d = new Date();
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - day + 1);
        return d.toISOString().slice(0, 10);
    },

    // 任务进度检查
    _checkQuestProgress(reason) {
        if (!this.rpgData) return;
        const today = new Date().toISOString().slice(0, 10);
        let bonusXP = 0;

        // 每日任务
        (this.rpgData.daily_quests || []).forEach(function(q) {
            if (q.done) return;
            if (reason === 'mood' && q.id === 'dq_mood') q.progress++;
            if (reason === 'upload' && (q.id === 'dq_photo3' || q.id === 'dq_photo1')) q.progress++;
            if (reason === 'chatter' && q.id === 'dq_chatter') q.progress++;
            if (reason === 'checkin' && q.id === 'dq_checkin') q.progress++;
            if (reason === 'favorite' && q.id === 'dq_fav3') q.progress++;
            if (reason === 'location' && q.id === 'dq_location') q.progress++;
            if (reason === 'category' && q.id === 'dq_category') q.progress++;
            if (q.progress >= q.target) { q.done = true; bonusXP += q.xp; }
        });

        // 每日全勤奖励
        const allDone = (this.rpgData.daily_quests || []).every(function(q) { return q.done; });
        if (allDone && this.rpgData.daily_all_done_date !== today) {
            this.rpgData.daily_all_done_date = today;
            bonusXP += 30;
            // 周常：完成全部每日任务 N 天
            this.rpgData.weekly_daily_done_days = (this.rpgData.weekly_daily_done_days || 0) + 1;
        }

        // 周常任务
        (this.rpgData.weekly_quests || []).forEach(function(q) {
            if (q.done) return;
            if (reason === 'checkin' && q.id === 'wq_checkin3') q.progress++;
            if (reason === 'upload' && q.id === 'wq_photo10') q.progress++;
            if (reason === 'mood' && q.id === 'wq_mood5') q.progress++;
            if (reason === 'location' && q.id === 'wq_location') q.progress++;
            if (reason === 'chatter' && q.id === 'wq_chatter5') q.progress++;
            if (reason === 'collage' && q.id === 'wq_collage') q.progress++;
            if (reason === 'album' && q.id === 'wq_album') q.progress++;
            if (q.progress >= q.target) { q.done = true; bonusXP += q.xp; }
        });
        // 周常每日全勤
        const wq = (this.rpgData.weekly_quests || []).find(function(q) { return q.id === 'wq_daily3'; });
        if (wq && !wq.done && (this.rpgData.weekly_daily_done_days || 0) >= wq.target) {
            wq.done = true; bonusXP += wq.xp;
        }

        if (bonusXP > 0) {
            this._saveRPGData();
            this.showToast('✨ 任务奖励 +' + bonusXP + ' XP');
        }
    },

    // 称号管理
    unlockTitle(title) {
        if (!this.rpgData) return;
        if (!this.rpgData.unlocked_titles.includes(title)) {
            this.rpgData.unlocked_titles.push(title);
            this._saveRPGData();
            this.showToast('🏅 解锁称号: ' + title);
        }
    },

    equipTitle(title) {
        if (!this.rpgData) return;
        this.rpgData.active_title = title;
        this._saveRPGData();
        this.showToast('已佩戴称号: ' + title);
    },

    // 自定义奖励
    addCustomReward(name, levelRequired) {
        if (!this.rpgData) return;
        this.rpgData.custom_rewards.push({ name: name, level: levelRequired, done: false });
        this._saveRPGData();
        this.showToast('已添加奖励: ' + name);
    },

    toggleRewardDone(index) {
        if (!this.rpgData) return;
        const r = this.rpgData.custom_rewards[index];
        if (r) { r.done = !r.done; this._saveRPGData(); }
    },

    deleteReward(index) {
        if (!this.rpgData) return;
        this.rpgData.custom_rewards.splice(index, 1);
        this._saveRPGData();
    },

    // ========================================
    // 成就页渲染
    // ========================================
    async loadAchievements() {
        if (!this.rpgData) await this.loadRPGData();
        let photoCount = 0, categoryCount = 0, favoriteCount = 0, locationCount = 0;
        try {
            const supabase = this.initSupabase();
            if (supabase) {
                const results = await Promise.all([
                    supabase.from('photos').select('*', { count: 'exact', head: true }),
                    supabase.from('categories').select('*', { count: 'exact', head: true }),
                    supabase.from('photos').select('*', { count: 'exact', head: true }).eq('is_favorite', true),
                    supabase.from('photos').select('*', { count: 'exact', head: true }).not('location_name', 'is', null),
                ]);
                photoCount = results[0].count || 0;
                categoryCount = results[1].count || 0;
                favoriteCount = results[2].count || 0;
                locationCount = results[3].count || 0;
            }
        } catch (e) { /* 静默 */ }
        this._renderAchievementsPage({ photoCount, categoryCount, favoriteCount, locationCount });
    },

    _renderAchievementsPage(stats) {
        if (!this.rpgData) return;
        const xp = this.rpgData.xp || 0;
        const level = this._rpgLevelFromXP(xp);
        const progress = this._rpgLevelProgress(xp);
        const nextXP = this._rpgTotalXPForLevel(level + 1) - xp;
        const title = this._rpgTitleForLevel(level);
        const streakBonus = (this.rpgData.login_streak >= 7) ? '1.5x' : (this.rpgData.login_streak >= 3 ? '1.2x' : '1.0x');

        // 等级条
        const levelBarEl = document.getElementById('rpgLevelBar');
        if (levelBarEl) {
            levelBarEl.innerHTML = [
                '<div class="rpg-level-badge">Lv.' + level + '</div>',
                '<div class="rpg-title-display">' + title + '</div>',
                '<div class="rpg-xp-bar-container"><div class="rpg-xp-bar-fill" style="width:' + progress + '%"></div></div>',
                '<div class="rpg-xp-text">' + xp + ' XP  |  升级还需 ' + nextXP + ' XP  |  连签 ' + (this.rpgData.login_streak || 0) + '天 (' + streakBonus + ')</div>',
            ].join('');
        }

        // 每日任务
        const dailyEl = document.getElementById('rpgDailyQuests');
        if (dailyEl) {
            const dq = this.rpgData.daily_quests || [];
            const allDone = dq.length > 0 && dq.every(function(q) { return q.done; });
            dailyEl.innerHTML = '<h3>📋 今日任务' + (allDone ? ' ✅ 全勤!' : '') + '</h3>' + dq.map(function(q) {
                return '<div class="rpg-quest-item' + (q.done ? ' done' : '') + '">' +
                    '<span class="rpg-quest-check">' + (q.done ? '✅' : '☐') + '</span>' +
                    '<span class="rpg-quest-label">' + q.label + '</span>' +
                    (q.target > 1 ? '<span class="rpg-quest-progress">(' + q.progress + '/' + q.target + ')</span>' : '') +
                    '<span class="rpg-quest-xp">+' + q.xp + ' XP</span>' +
                    '</div>';
            }).join('') + (allDone ? '<div class="rpg-quest-bonus">🎁 全部完成 +30 XP</div>' : '');
        }

        // 本周任务
        const weeklyEl = document.getElementById('rpgWeeklyQuests');
        if (weeklyEl) {
            const wq = this.rpgData.weekly_quests || [];
            weeklyEl.innerHTML = '<h3>📅 本周任务</h3>' + wq.map(function(q) {
                return '<div class="rpg-quest-item' + (q.done ? ' done' : '') + '">' +
                    '<span class="rpg-quest-check">' + (q.done ? '✅' : '☐') + '</span>' +
                    '<span class="rpg-quest-label">' + q.label + '</span>' +
                    (q.target > 1 ? '<span class="rpg-quest-progress">(' + q.progress + '/' + q.target + ')</span>' : '') +
                    '<span class="rpg-quest-xp">+' + q.xp + ' XP</span>' +
                    '</div>';
            }).join('');
        }

        // 称号收藏
        const titlesEl = document.getElementById('rpgTitles');
        if (titlesEl) {
            const titles = this.rpgData.unlocked_titles || [];
            const active = this.rpgData.active_title || '';
            titlesEl.innerHTML = '<h3>🏅 称号收藏</h3><div class="rpg-titles-grid">' +
                (titles.length === 0 ? '<span style="color:#999;">还没有解锁称号</span>' : '') +
                titles.map(function(t) {
                    return '<div class="rpg-title-chip' + (t === active ? ' active' : '') + '" onclick="mobile.equipTitle(\'' + t.replace(/'/g, "\\'") + '\')">' + t + (t === active ? ' ✅' : '') + '</div>';
                }).join('') + '</div>';
        }

        // 里程碑成就（成就路线）
        const grid = document.getElementById('mobileAchievementsGrid');
        if (grid) {
            const s = stats;
            const tracks = [
                { id: 'photo', icon: '📸', name: '照片之路', milestones: [
                    { icon: '🐣', name: '初出茅庐', desc: '上传第1张', check: function() { return s.photoCount >= 1; } },
                    { icon: '📸', name: '记忆收集者', desc: '累计100张', check: function() { return s.photoCount >= 100; } },
                    { icon: '🏆', name: '回忆大师', desc: '累计500张', check: function() { return s.photoCount >= 500; } },
                ]},
                { id: 'fav', icon: '⭐', name: '收藏之路', milestones: [
                    { icon: '⭐', name: '收藏家', desc: '收藏20张', check: function() { return s.favoriteCount >= 20; } },
                    { icon: '❤️', name: '真爱印记', desc: '收藏50张', check: function() { return s.favoriteCount >= 50; } },
                ]},
                { id: 'explore', icon: '🗺️', name: '探索之路', milestones: [
                    { icon: '🗺️', name: '足迹遍布', desc: '标记10个地点', check: function() { return s.locationCount >= 10; } },
                    { icon: '🌍', name: '环球旅行', desc: '标记30个地点', check: function() { return s.locationCount >= 30; } },
                ]},
                { id: 'org', icon: '📁', name: '整理达人', milestones: [
                    { icon: '📁', name: '整理达人', desc: '创建5个分类', check: function() { return s.categoryCount >= 5; } },
                ]},
            ];
            grid.innerHTML = '<h3>🏆 里程碑成就</h3>' + tracks.map(function(track) {
                const done = track.milestones.filter(function(m) { return m.check(); }).length;
                const total = track.milestones.length;
                const pct = Math.round(done / total * 100);
                return '<div class="rpg-track">' +
                    '<div class="rpg-track-header">' +
                        '<span class="rpg-track-icon">' + track.icon + '</span>' +
                        '<span class="rpg-track-name">' + track.name + '</span>' +
                        '<span class="rpg-track-count">' + done + '/' + total + '</span>' +
                    '</div>' +
                    '<div class="rpg-track-bar"><div class="rpg-track-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="rpg-track-badges">' + track.milestones.map(function(m) {
                        const ok = m.check();
                        return '<div class="rpg-track-badge' + (ok ? '' : ' locked') + '">' +
                            '<span class="rpg-track-badge-icon">' + (ok ? m.icon : '🔒') + '</span>' +
                            '<span class="rpg-track-badge-name">' + (ok ? m.name : '???') + '</span>' +
                            '</div>';
                    }).join('') + '</div>' +
                    '</div>';
            }).join('');
        }

        // 自定义奖励
        const rewardsEl = document.getElementById('rpgRewards');
        if (rewardsEl) {
            const rewards = this.rpgData.custom_rewards || [];
            rewardsEl.innerHTML = '<h3>🎁 自定义奖励' +
                ' <button class="btn-mini" onclick="mobile.showAddRewardModal()" style="font-size:12px;">+</button></h3>' +
                rewards.map(function(r, i) {
                    const reached = level >= r.level;
                    return '<div class="rpg-reward-item' + (r.done ? ' done' : '') + (reached ? ' reached' : '') + '">' +
                        '<span class="rpg-reward-check" onclick="mobile.toggleRewardDone(' + i + ')">' + (r.done ? '✅' : (reached ? '🎯' : '🔒')) + '</span>' +
                        '<span class="rpg-reward-name">' + r.name + '</span>' +
                        '<span class="rpg-reward-level">Lv.' + r.level + '</span>' +
                        '<span class="rpg-reward-del" onclick="event.stopPropagation();mobile.deleteReward(' + i + ')" style="cursor:pointer;">✕</span>' +
                        '</div>';
                }).join('');
        }
    },

    showAddRewardModal() {
        const name = prompt('奖励名称（如："一起去旅行"）');
        if (!name) return;
        const levelStr = prompt('需要的等级（如：20）', '10');
        const level = parseInt(levelStr) || 10;
        this.addCustomReward(name, Math.min(999, Math.max(1, level)));
        this._renderAchievementsPage({});
    },

    // ========================================
    //   相册功能
    // ========================================

    async loadAlbums() {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('albums')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            this.albums = data || [];
            this.renderAlbumList();
        } catch (e) {
            console.error('加载相册失败:', e);
            document.getElementById('mobileAlbumList').innerHTML = '<p class="empty-state">加载失败</p>';
        }
    },

    renderAlbumList() {
        const container = document.getElementById('mobileAlbumList');
        const empty = document.getElementById('mobileAlbumEmpty');
        if (this.albums.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';
        container.innerHTML = this.albums.map(a => {
            const coverPhoto = this.photos.find(p => p.id === a.cover_photo_id);
            const coverSrc = coverPhoto ? this.getPhotoUrl(coverPhoto.storage_path) : '';
            return `
            <div class="menu-item" onclick="mobile.openAlbumDetail(${a.id})" style="align-items:center;gap:12px;">
                ${coverSrc
                    ? `<img src="${coverSrc}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;">`
                    : `<div style="width:48px;height:48px;background:var(--primary);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:white;">📸</div>`}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:15px;font-weight:500;">${this.escapeHtml(a.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(a.description || '')}</div>
                </div>
                <span style="color:var(--text-muted);">›</span>
            </div>`;
        }).join('');
    },

    openAddAlbumModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileAddAlbumModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>新建相册</h3>
                <div class="form-item">
                    <label>相册名称</label>
                    <input type="text" id="mobileAlbumNameInput" placeholder="输入相册名称">
                </div>
                <div class="form-item">
                    <label>描述（可选）</label>
                    <textarea id="mobileAlbumDescInput" rows="2" placeholder="描述这个相册"></textarea>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="document.getElementById('mobileAddAlbumModal').remove()">取消</button>
                    <button class="btn-primary" onclick="mobile.createAlbum()">创建</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async createAlbum() {
        const name = document.getElementById('mobileAlbumNameInput').value.trim();
        const description = document.getElementById('mobileAlbumDescInput').value.trim();
        if (!name) { this.showToast('请输入相册名称'); return; }
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('albums')
                .insert([{ name, description }])
                .select()
                .single();
            if (error) throw error;
            this.albums.unshift(data);
            this.renderAlbumList();
            document.getElementById('mobileAddAlbumModal').remove();
            this.showToast('相册已创建');
            this.addXP(15, 'album');
        } catch (e) {
            console.error('创建相册失败:', e);
            this.showToast('创建失败: ' + e.message);
        }
    },

    async openAlbumDetail(albumId) {
        this.currentAlbum = this.albums.find(a => a.id === albumId);
        if (!this.currentAlbum) return;
        this.albumSelectMode = false;
        this.albumSelectedPhotos = new Set();
        this.showPage('albumDetail');
        document.getElementById('mobileAlbumDetailName').textContent = this.currentAlbum.name;
        document.getElementById('mobileAlbumDetailDesc').textContent = this.currentAlbum.description || '';
        this.updateMobileAlbumToolbar();
        await this.loadAlbumPhotos(albumId);
    },

    async loadAlbumPhotos(albumId) {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('album_photos')
                .select('photo_id')
                .eq('album_id', albumId);
            if (error) throw error;
            this.albumPhotos = (data || []).map(r => r.photo_id);
            document.getElementById('mobileAlbumPhotoCount').textContent = `共 ${this.albumPhotos.length} 张照片`;
            this.renderAlbumPhotos();
        } catch (e) {
            console.error('加载相册照片失败:', e);
        }
    },

    renderAlbumPhotos() {
        const grid = document.getElementById('mobileAlbumPhotosGrid');
        const empty = document.getElementById('mobileAlbumPhotosEmpty');
        if (this.albumPhotos.length === 0) {
            grid.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';
        const albumPhotoObjs = this.photos.filter(p => this.albumPhotos.includes(p.id));
        grid.innerHTML = albumPhotoObjs.map(p => {
            const selectedClass = this.albumSelectMode && this.albumSelectedPhotos.has(p.id) ? ' selected' : '';
            const imgSrc = this.getPhotoUrl(p.storage_path);
            return `
            <div class="photo-card${selectedClass}" onclick="${this.albumSelectMode ? `mobile.toggleAlbumPhotoCheck('${p.id}')` : `mobile.openDetail('${p.id}')`}">
                ${this.albumSelectMode ? `<div class="photo-checkbox"><input type="checkbox" ${this.albumSelectedPhotos.has(p.id) ? 'checked' : ''} onclick="event.stopPropagation();mobile.toggleAlbumPhotoCheck('${p.id}')"></div>` : ''}
                <img src="${imgSrc}" alt="">
                <div class="photo-card-info">
                    <h4>${this.escapeHtml(p.name || '未命名')}</h4>
                </div>
            </div>`;
        }).join('');
    },

    toggleAlbumPhotoCheck(photoId) {
        if (this.albumSelectedPhotos.has(photoId)) {
            this.albumSelectedPhotos.delete(photoId);
        } else {
            this.albumSelectedPhotos.add(photoId);
        }
        this.renderAlbumPhotos();
    },

    toggleAlbumSelectMode() {
        this.albumSelectMode = !this.albumSelectMode;
        this.albumSelectedPhotos = new Set();
        this.updateMobileAlbumToolbar();
        this.renderAlbumPhotos();
    },

    updateMobileAlbumToolbar() {
        const selectBtn = document.getElementById('mobileAlbumSelectModeBtn');
        const addBtn = document.getElementById('mobileAlbumAddPhotosBtn');
        const removeBtn = document.getElementById('mobileAlbumRemovePhotosBtn');
        if (selectBtn) selectBtn.style.display = this.albumSelectMode ? 'none' : '';
        if (addBtn) addBtn.style.display = this.albumSelectMode ? '' : 'none';
        if (removeBtn) removeBtn.style.display = this.albumSelectMode ? '' : 'none';
    },

    openAddPhotosToAlbumModal() {
        if (!this.currentAlbum) return;
        const existingIds = new Set(this.albumPhotos);
        const availablePhotos = this.photos.filter(p => !existingIds.has(p.id));
        if (availablePhotos.length === 0) {
            this.showToast('所有照片已在此相册中');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileAddPhotosAlbumModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-card" style="max-height:70vh;overflow-y:auto;width:90%;max-width:400px;">
                <h3>添加照片到相册</h3>
                <div style="max-height:50vh;overflow-y:auto;">
                    ${availablePhotos.map(p => {
                        const imgSrc = this.getPhotoUrl(p.storage_path);
                        return `<label class="checkbox-item">
                            <input type="checkbox" class="add-photo-mobile-check" value="${p.id}">
                            <img src="${imgSrc}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">
                            <span style="font-size:13px;flex:1;">${this.escapeHtml(p.name || '未命名')}</span>
                        </label>`;
                    }).join('')}
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="document.getElementById('mobileAddPhotosAlbumModal').remove()">取消</button>
                    <button class="btn-primary" onclick="mobile.addPhotosToAlbum()">添加</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async addPhotosToAlbum() {
        if (!this.currentAlbum) return;
        const checks = document.querySelectorAll('.add-photo-mobile-check:checked');
        if (checks.length === 0) { this.showToast('请选择要添加的照片'); return; }
        const rows = Array.from(checks).map(cb => ({
            album_id: this.currentAlbum.id,
            photo_id: cb.value
        }));
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { error } = await supabase.from('album_photos').insert(rows);
            if (error) throw error;
            document.getElementById('mobileAddPhotosAlbumModal').remove();
            this.showToast(`已添加 ${rows.length} 张照片`);
            await this.loadAlbumPhotos(this.currentAlbum.id);
            if (this.currentAlbum.cover_photo_id === null || this.currentAlbum.cover_photo_id === undefined) {
                await supabase.from('albums').update({ cover_photo_id: rows[0].photo_id }).eq('id', this.currentAlbum.id);
                this.currentAlbum.cover_photo_id = rows[0].photo_id;
            }
        } catch (e) {
            console.error('添加照片失败:', e);
            this.showToast('添加失败: ' + e.message);
        }
    },

    async removePhotosFromAlbum() {
        if (!this.currentAlbum) return;
        if (this.albumSelectedPhotos.size === 0) { this.showToast('请先选择要移除的照片'); return; }
        if (!confirm(`确认从相册中移除 ${this.albumSelectedPhotos.size} 张照片？`)) return;
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { error } = await supabase
                .from('album_photos')
                .delete()
                .eq('album_id', this.currentAlbum.id)
                .in('photo_id', [...this.albumSelectedPhotos]);
            if (error) throw error;
            this.albumSelectedPhotos = new Set();
            this.showToast('已移除');
            await this.loadAlbumPhotos(this.currentAlbum.id);
        } catch (e) {
            console.error('移除照片失败:', e);
            this.showToast('移除失败: ' + e.message);
        }
    },

    closeAlbumDetail() {
        this.currentAlbum = null;
        this.albumSelectMode = false;
        this.albumSelectedPhotos = new Set();
        this.switchTab('albums');
    },

    openEditAlbumModal() {
        if (!this.currentAlbum) return;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileEditAlbumModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>编辑相册</h3>
                <div class="form-item">
                    <label>相册名称</label>
                    <input type="text" id="mobileEditAlbumName" value="${this.escapeHtml(this.currentAlbum.name)}">
                </div>
                <div class="form-item">
                    <label>描述</label>
                    <textarea id="mobileEditAlbumDesc" rows="2">${this.escapeHtml(this.currentAlbum.description || '')}</textarea>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="document.getElementById('mobileEditAlbumModal').remove()">取消</button>
                    <button class="btn-primary" onclick="mobile.saveEditAlbum()">保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveEditAlbum() {
        if (!this.currentAlbum) return;
        const name = document.getElementById('mobileEditAlbumName').value.trim();
        const description = document.getElementById('mobileEditAlbumDesc').value.trim();
        if (!name) { this.showToast('请输入相册名称'); return; }
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { error } = await supabase
                .from('albums')
                .update({ name, description })
                .eq('id', this.currentAlbum.id);
            if (error) throw error;
            this.currentAlbum.name = name;
            this.currentAlbum.description = description;
            const idx = this.albums.findIndex(a => a.id === this.currentAlbum.id);
            if (idx >= 0) { this.albums[idx].name = name; this.albums[idx].description = description; }
            document.getElementById('mobileAlbumDetailName').textContent = name;
            document.getElementById('mobileAlbumDetailDesc').textContent = description || '';
            document.getElementById('mobileEditAlbumModal').remove();
            this.showToast('已保存');
        } catch (e) {
            console.error('编辑相册失败:', e);
            this.showToast('编辑失败: ' + e.message);
        }
    },

    async deleteAlbum() {
        if (!this.currentAlbum) return;
        if (!confirm(`确认删除相册"${this.currentAlbum.name}"？相册中的照片不会被删除。`)) return;
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { error } = await supabase.from('albums').delete().eq('id', this.currentAlbum.id);
            if (error) throw error;
            this.albums = this.albums.filter(a => a.id !== this.currentAlbum.id);
            this.closeAlbumDetail();
            this.renderAlbumList();
            this.showToast('相册已删除');
        } catch (e) {
            console.error('删除相册失败:', e);
            this.showToast('删除失败: ' + e.message);
        }
    },

    // ========================================
    //   分享链接（移动端）
    // ========================================

    generateShareToken() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        const arr = new Uint8Array(16);
        if (typeof crypto !== 'undefined') {
            crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    },

    openCreateShareModal(albumId) {
        if (!albumId) { this.showToast('请先打开一个相册'); return; }
        const album = this.albums.find(a => a.id === albumId);
        if (!album) return;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileCreateShareModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>🔗 分享相册</h3>
                <p style="text-align:center;font-size:14px;margin-bottom:12px;">相册: ${this.escapeHtml(album.name)}</p>
                <div class="form-item">
                    <label>有效期</label>
                    <select id="mobileShareExpirySelect" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;font-size:14px;">
                        <option value="1">1 天</option>
                        <option value="7" selected>7 天</option>
                        <option value="30">30 天</option>
                        <option value="0">永久</option>
                    </select>
                </div>
                <div id="mobileShareLinkResult" style="display:none;margin-top:12px;">
                    <div style="background:#f0f8f0;padding:12px;border-radius:8px;border:1px solid #c8e6c9;">
                        <p style="font-size:13px;color:#2e7d32;margin-bottom:8px;">分享链接已生成：</p>
                        <input type="text" id="mobileShareLinkInput" readonly style="width:100%;font-size:12px;padding:8px;border:1px solid #ddd;border-radius:4px;margin-bottom:8px;">
                        <button class="btn-primary" onclick="mobile.copyShareLink()">📋 复制链接</button>
                        <small id="mobileShareExpiryNote" style="color:#666;display:block;margin-top:4px;text-align:center;"></small>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="document.getElementById('mobileCreateShareModal').remove()">取消</button>
                    <button class="btn-primary" id="mobileCreateShareBtn" onclick="mobile.createShareLink(${albumId})">生成分享链接</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async createShareLink(albumId) {
        const days = parseInt(document.getElementById('mobileShareExpirySelect').value);
        const token = this.generateShareToken();
        let expiresAt = null;
        if (days > 0) {
            const d = new Date();
            d.setDate(d.getDate() + days);
            expiresAt = d.toISOString();
        }
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('share_links')
                .insert([{ album_id: albumId, token, expires_at: expiresAt }])
                .select()
                .single();
            if (error) throw error;
            const shareUrl = window.location.origin + '/share.html?token=' + token;
            document.getElementById('mobileShareLinkResult').style.display = 'block';
            document.getElementById('mobileShareLinkInput').value = shareUrl;
            document.getElementById('mobileShareExpiryNote').textContent = days > 0
                ? `此链接将在 ${days} 天后过期（${new Date(expiresAt).toLocaleDateString('zh-CN')}）`
                : '永久有效';
            document.getElementById('mobileCreateShareBtn').style.display = 'none';
        } catch (e) {
            console.error('创建分享链接失败:', e);
            this.showToast('创建失败: ' + e.message);
        }
    },

    copyShareLink() {
        const input = document.getElementById('mobileShareLinkInput');
        input.select();
        document.execCommand('copy');
        this.showToast('链接已复制到剪贴板');
    },

    // ========================================
    //   足迹护照（移动端）
    // ========================================

    async loadPassport() {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('photos')
                .select('id, name, storage_path, location_name')
                .not('location_name', 'is', null)
                .neq('location_name', '')
                .order('created_at', { ascending: false });
            if (error) throw error;
            this.passportAllPhotos = data || [];
            const grouped = {};
            for (const p of this.passportAllPhotos) {
                if (!grouped[p.location_name]) grouped[p.location_name] = [];
                grouped[p.location_name].push(p);
            }
            this.passportData = Object.entries(grouped).map(([name, photos]) => ({
                name, count: photos.length, photos, coverPhoto: photos[0]
            }));
            this.sortPassportData();
            this.renderPassport();
        } catch (e) {
            console.error('加载足迹护照失败:', e);
            document.getElementById('mobilePassportStamps').innerHTML = '<p class="empty-state">加载失败</p>';
        }
    },

    sortPassportData() {
        if (this.passportSortByPhotoCount) {
            this.passportData.sort((a, b) => b.count - a.count);
        } else {
            this.passportData.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        }
    },

    getCityEmoji(locationName) {
        const name = locationName || '';
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
        };
        for (const [key, emoji] of Object.entries(map)) {
            if (name.includes(key)) return emoji;
        }
        return '📍';
    },

    renderPassport() {
        const container = document.getElementById('mobilePassportStamps');
        const empty = document.getElementById('mobilePassportEmpty');
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) locationPhotos.style.display = 'none';
        if (this.passportData.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';
        container.innerHTML = this.passportData.map((loc, i) => {
            const emoji = this.getCityEmoji(loc.name);
            return `
            <div class="passport-stamp mobile-stamp" style="animation-delay:${i * 0.05}s" onclick="mobile.openPassportLocation('${encodeURIComponent(loc.name)}')">
                <div class="stamp-emoji">${emoji}</div>
                <div class="stamp-name">${this.escapeHtml(loc.name)}</div>
                <div class="stamp-count">${loc.count} 张照片</div>
            </div>`;
        }).join('');
    },

    togglePassportSort() {
        this.passportSortByPhotoCount = !this.passportSortByPhotoCount;
        const btn = document.getElementById('mobilePassportSortBtn');
        if (btn) btn.textContent = this.passportSortByPhotoCount ? '🔤' : '🔄';
        this.sortPassportData();
        this.renderPassport();
    },

    openPassportLocation(encodedName) {
        const name = decodeURIComponent(encodedName);
        const loc = this.passportData.find(l => l.name === name);
        if (!loc) return;
        document.getElementById('mobilePassportStamps').style.display = 'none';
        document.getElementById('mobilePassportEmpty').style.display = 'none';
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) {
            locationPhotos.style.display = 'flex';
            document.getElementById('mobilePassportLocationName').textContent = name;
        }
        const grid = document.getElementById('mobilePassportLocationGrid');
        if (grid) {
            grid.innerHTML = loc.photos.map(p => {
                const imgSrc = this.getPhotoUrl(p.storage_path);
                return `
                <div class="photo-card" onclick="mobile.openDetail('${p.id}')">
                    <img src="${imgSrc}" alt="" loading="lazy">
                    <div class="photo-card-info">
                        <h4>${this.escapeHtml(p.name || '未命名')}</h4>
                    </div>
                </div>`;
            }).join('');
        }
    },

    closePassportLocation() {
        document.getElementById('mobilePassportStamps').style.display = '';
        const empty = document.getElementById('mobilePassportEmpty');
        if (this.passportData.length === 0) {
            empty.style.display = 'flex';
        } else {
            empty.style.display = 'none';
        }
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) locationPhotos.style.display = 'none';
    },

    // ========================================
    // 心情日记
    // ========================================

    _moodEmojis: ['😊', '😢', '😡', '😴', '🥰', '😰', '🤩', '😤'],

    async loadMoodDiary() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;
            const { data } = await supabase.from('mood_diary').select('*, photos(id,storage_path,name)').order('created_at', { ascending: false });
            this.moodDiaryEntries = (data || []).map(e => ({
                ...e,
                photo_storage_path: e.photos?.storage_path || '',
                photo_name: e.photos?.name || ''
            }));
        } catch (e) { this.moodDiaryEntries = []; }
        this.renderMoodDiary();
    },

    renderMoodDiary() {
        const container = document.getElementById('mobileMoodDiaryList');
        if (!container) return;
        if (!this.moodDiaryEntries || this.moodDiaryEntries.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><p>还没有心情记录</p><small>点击上方按钮记录第一条心情</small></div>';
            return;
        }
        container.innerHTML = this.moodDiaryEntries.map(e => {
            const photoHtml = e.photo_id ? `<div class="timeline-photo" onclick="mobile.openDetail('${e.photo_id}')"><img src="${this.getPhotoUrl(e.photo_storage_path || '')}" onerror="this.style.display='none'"></div>` : '';
            const dateStr = e.created_at ? new Date(e.created_at).toLocaleDateString('zh-CN') : '';
            return `<div class="timeline-item mobile-timeline-item">
                <div class="timeline-avatar">${e.mood}</div>
                <div class="timeline-body">
                    <div class="timeline-header">
                        <span class="timeline-user">${this.escapeHtml(e.user_name)}</span>
                        <span class="timeline-time">${dateStr}</span>
                        <button class="btn-delete" style="margin-left:auto;padding:2px 6px;font-size:11px;" onclick="event.stopPropagation();mobile.deleteMoodDiary(${e.id})">🗑️</button>
                    </div>
                    ${e.content ? `<div class="timeline-content">${this.escapeHtml(e.content)}</div>` : ''}
                    ${photoHtml}
                </div>
            </div>`;
        }).join('');
    },

    openMoodDiaryModal(editEntry) {
        this._moodPhotoData = editEntry && editEntry.photo_id ? { id: editEntry.photo_id, storage_path: editEntry.photo_storage_path || '', name: editEntry.photo_name || '' } : null;
        this._editingMoodEntry = editEntry || null;
        const previewHtml = this._moodPhotoData ? `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(this._moodPhotoData.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
                <div style="flex:1;">
                    <div style="font-size:13px;">${this.escapeHtml(this._moodPhotoData.name || '')}</div>
                    <button type="button" onclick="mobile.clearMoodPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
                </div>
            </div>` : '';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'moodDiaryModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;max-height:85vh;overflow-y:auto;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">${editEntry ? '编辑心情' : '记录心情'}</h3>
                    <button class="icon-btn" onclick="document.getElementById('moodDiaryModal').remove()">×</button>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:14px;margin-bottom:8px;">选择心情</label>
                    <div class="mood-picker">
                        ${this._moodEmojis.map(m => `<button type="button" class="mood-btn${(editEntry && editEntry.mood === m) ? ' selected' : ''}" onclick="mobile.selectMood('${m}')">${m}</button>`).join('')}
                    </div>
                </div>
                <div class="form-item">
                    <label>内容</label>
                    <textarea id="mobileMoodDiaryContent" rows="3" placeholder="今天发生了什么...">${editEntry ? this.escapeHtml(editEntry.content || '') : ''}</textarea>
                </div>
                <div class="form-item">
                    <label>关联照片（可选）</label>
                    ${previewHtml}
                    <button type="button" class="btn-secondary" onclick="mobile.openPhotoPicker(mobile.onMoodPhotoPicked)">📷 选择照片</button>
                </div>
                <input type="hidden" id="mobileMoodDiaryPhotoId" value="${editEntry ? (editEntry.photo_id || '') : ''}">
                <input type="hidden" id="mobileMoodDiaryMood" value="${editEntry ? (editEntry.mood || '') : ''}">
                <button class="btn-primary" onclick="mobile.saveMoodDiary()" style="width:100%;border-radius:8px;margin-top:12px;">保存</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    selectMood(mood) {
        document.getElementById('mobileMoodDiaryMood').value = mood;
        document.querySelectorAll('#moodDiaryModal .mood-btn').forEach(b => b.classList.toggle('selected', b.textContent === mood));
    },

    clearMoodPhoto() {
        this._moodPhotoData = null;
        document.getElementById('mobileMoodDiaryPhotoId').value = '';
        const previewDiv = document.querySelector('#moodDiaryModal .form-item:nth-of-type(2) div[style]');
        if (previewDiv) previewDiv.remove();
    },

    onMoodPhotoPicked(photo) {
        this._moodPhotoData = photo;
        document.getElementById('mobileMoodDiaryPhotoId').value = photo.id;
        const content = document.getElementById('mobileMoodDiaryContent').value;
        const mood = document.getElementById('mobileMoodDiaryMood').value;
        document.getElementById('moodDiaryModal').remove();
        this.openMoodDiaryModal(mood ? { mood, content, photo_id: photo.id, photo_storage_path: photo.storage_path, photo_name: photo.name } : { mood, content, photo_id: photo.id, photo_storage_path: photo.storage_path, photo_name: photo.name });
    },

    async saveMoodDiary() {
        const mood = document.getElementById('mobileMoodDiaryMood').value;
        const content = document.getElementById('mobileMoodDiaryContent').value.trim();
        const photoId = document.getElementById('mobileMoodDiaryPhotoId').value.trim() || null;
        if (!mood) { this.showToast('请选择一个心情'); return; }

        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }

        const row = { user_name: this.currentUser?.username || '用户', mood, content, photo_id: photoId || null };

        try {
            if (this._editingMoodEntry) {
                await supabase.from('mood_diary').update(row).eq('id', this._editingMoodEntry.id);
            } else {
                await supabase.from('mood_diary').insert(row);
            }
            document.getElementById('moodDiaryModal').remove();
            this.loadMoodDiary();
            this.showToast('已保存');
            this.addXP(10, 'mood');
        } catch (e) {
            this.showToast('保存失败: ' + e.message);
        }
    },

    async deleteMoodDiary(id) {
        if (!confirm('确定删除这条心情记录吗？')) return;
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        try {
            await supabase.from('mood_diary').delete().eq('id', id);
            this.loadMoodDiary();
            this.showToast('已删除');
        } catch (e) {
            this.showToast('删除失败: ' + e.message);
        }
    },

    // ========================================
    // 情侣打卡
    // ========================================

    async loadCoupleTasks() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;
            const { data: tasks } = await supabase.from('couple_tasks').select('*').order('sort_order', { ascending: true });
            this.coupleTasks = tasks || [];
            const { data: checkins } = await supabase.from('couple_checkins').select('*, photos(id,storage_path,name)').order('checked_at', { ascending: false });
            this.coupleCheckins = (checkins || []).map(c => ({
                ...c,
                photo_storage_path: c.photos?.storage_path || '',
                photo_name: c.photos?.name || ''
            }));
        } catch (e) { this.coupleTasks = []; this.coupleCheckins = []; }
        this.renderCoupleTasks();
    },

    renderCoupleTasks() {
        const container = document.getElementById('mobileCoupleTasksList');
        if (!container) return;

        const filtered = this.currentTaskTab === 'wishes'
            ? this.coupleTasks.filter(t => t.category === 'wish')
            : this.coupleTasks.filter(t => t.category !== 'wish');

        const label = this.currentTaskTab === 'wishes' ? '愿望' : '任务';
        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><p>还没有' + label + '</p><small>点击上方按钮添加</small></div>';
            return;
        }

        container.innerHTML = filtered.map(task => {
            const taskCheckins = this.coupleCheckins.filter(c => c.task_id == task.id);
            const lastCheckin = taskCheckins[0];
            const checkinCount = taskCheckins.length;
            const isWish = task.category === 'wish';
            const completed = isWish && checkinCount > 0;

            return '<div class="task-card mobile-task-card' + (completed ? ' completed' : '') + '">' +
                '<div class="task-card-header">' +
                    '<h3 class="task-title">' + this.escapeHtml(task.title) + '</h3>' +
                    '<span class="task-checkin-badge">' + checkinCount + '次打卡</span>' +
                '</div>' +
                (task.description ? '<p class="task-desc">' + this.escapeHtml(task.description) + '</p>' : '') +
                '<div class="task-card-footer">' +
                    (lastCheckin ? '<span class="task-last-checkin">最近: ' + this.escapeHtml(lastCheckin.user_name) + ' ' + new Date(lastCheckin.checked_at).toLocaleDateString('zh-CN') + '</span>' : '<span class="task-last-checkin">还没有打卡记录</span>') +
                    (completed
                        ? '<span class="task-done-badge">已完成 ✅</span>'
                        : '<button class="btn-primary btn-sm" onclick="mobile.openCheckinModal(' + task.id + ')">打卡</button>'
                    ) +
                '</div>' +
            '</div>';
        }).join('');
    },

    switchTaskTab(tab) {
        this.currentTaskTab = tab;
        const btns = document.querySelectorAll('#coupleTasksPage .feature-tab');
        btns.forEach(b => b.classList.toggle('active', false));
        document.getElementById('mobileTaskTabBtn_' + tab).classList.add('active');
        this.renderCoupleTasks();
    },

    openAddTaskModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'addTaskModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        const isWish = this.currentTaskTab === 'wishes';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">添加${isWish ? '愿望' : '任务'}</h3>
                    <button class="icon-btn" onclick="document.getElementById('addTaskModal').remove()">×</button>
                </div>
                <div class="form-item">
                    <label>标题</label>
                    <input type="text" id="mobileNewTaskTitle" placeholder="输入标题...">
                </div>
                <div class="form-item">
                    <label>描述</label>
                    <textarea id="mobileNewTaskDesc" rows="2" placeholder="可选描述..."></textarea>
                </div>
                <div class="form-item">
                    <label>类型</label>
                    <select id="mobileNewTaskCategory" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                        <option value="general" ${!isWish ? 'selected' : ''}>日常</option>
                        <option value="date">约会</option>
                        <option value="travel">旅行</option>
                        <option value="wish" ${isWish ? 'selected' : ''}>愿望</option>
                    </select>
                </div>
                <button class="btn-primary" onclick="mobile.saveNewTask()" style="width:100%;border-radius:8px;margin-top:12px;">保存</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveNewTask() {
        const title = document.getElementById('mobileNewTaskTitle').value.trim();
        const description = document.getElementById('mobileNewTaskDesc').value.trim();
        const category = document.getElementById('mobileNewTaskCategory').value;
        if (!title) { this.showToast('请输入标题'); return; }
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        const maxOrder = this.coupleTasks.reduce((max, t) => Math.max(max, t.sort_order || 0), 0);
        try {
            await supabase.from('couple_tasks').insert({ title, description, category, sort_order: maxOrder + 1 });
            document.getElementById('addTaskModal').remove();
            this.loadCoupleTasks();
            this.showToast('已添加');
        } catch (e) { this.showToast('添加失败: ' + e.message); }
    },

    openCheckinModal(taskId) {
        const task = this.coupleTasks.find(t => t.id == taskId);
        if (!task) return;
        this._checkinPhotoData = null;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'checkinModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">打卡: ${this.escapeHtml(task.title)}</h3>
                    <button class="icon-btn" onclick="document.getElementById('checkinModal').remove()">×</button>
                </div>
                <div class="form-item">
                    <label>备注（可选）</label>
                    <textarea id="mobileCheckinNote" rows="2" placeholder="写下今天的感受..."></textarea>
                </div>
                <div class="form-item">
                    <label>关联照片（可选）</label>
                    <div id="mobileCheckinPhotoPreview"></div>
                    <button type="button" class="btn-secondary" onclick="mobile.openPhotoPicker(mobile.onCheckinPhotoPicked)" style="border-radius:8px;">📷 选择照片</button>
                </div>
                <input type="hidden" id="mobileCheckinPhotoId" value="">
                <button class="btn-primary" onclick="mobile.saveCheckin(${taskId})" style="width:100%;border-radius:8px;margin-top:12px;">确认打卡</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    onCheckinPhotoPicked(photo) {
        this._checkinPhotoData = photo;
        document.getElementById('mobileCheckinPhotoId').value = photo.id;
        document.getElementById('mobileCheckinPhotoPreview').innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
                <div style="flex:1;">
                    <div style="font-size:13px;">${this.escapeHtml(photo.name || '')}</div>
                    <button type="button" onclick="mobile.clearCheckinPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
                </div>
            </div>`;
    },

    clearCheckinPhoto() {
        this._checkinPhotoData = null;
        document.getElementById('mobileCheckinPhotoId').value = '';
        document.getElementById('mobileCheckinPhotoPreview').innerHTML = '';
    },

    async saveCheckin(taskId) {
        const note = document.getElementById('mobileCheckinNote').value.trim();
        const photoId = document.getElementById('mobileCheckinPhotoId').value.trim() || null;
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        try {
            await supabase.from('couple_checkins').insert({
                task_id: parseInt(taskId),
                user_name: this.currentUser?.username || '用户',
                note,
                photo_id: photoId || null
            });
            document.getElementById('checkinModal').remove();
            this.loadCoupleTasks();
            this.showToast('打卡成功');
            this.addXP(30, 'checkin');
        } catch (e) { this.showToast('打卡失败: ' + e.message); }
    },

    // ========================================
    // 亲密记录
    // ========================================

    async getIntimatePassword() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return null;
            const { data } = await supabase.from('app_settings').select('value').eq('key', 'intimate_password').single();
            return data?.value || null;
        } catch (e) { return null; }
    },

    async setIntimatePassword(password) {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return false;
            await supabase.from('app_settings').upsert({ key: 'intimate_password', value: password });
            return true;
        } catch (e) { return false; }
    },

    checkIntimateLock() {
        const lockScreen = document.getElementById('mobileIntimateLockScreen');
        const content = document.getElementById('mobileIntimateContent');
        if (!lockScreen || !content) return;

        const unlockData = localStorage.getItem('intimate_unlocked');
        if (unlockData) {
            try {
                const parsed = JSON.parse(unlockData);
                if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
                    lockScreen.style.display = 'none';
                    content.style.display = 'flex';
                    this.intimateUnlocked = true;
                    this.loadIntimateRecords();
                    return;
                }
            } catch (e) {}
        }

        this.getIntimatePassword().then(pwd => {
            lockScreen.style.display = 'flex';
            content.style.display = 'none';
            if (pwd) {
                document.getElementById('mobileIntimateLockTitle').textContent = '输入密码';
                document.getElementById('mobileIntimateLockHint').textContent = '请输入密码解锁';
            } else {
                document.getElementById('mobileIntimateLockTitle').textContent = '设置密码';
                document.getElementById('mobileIntimateLockHint').textContent = '首次使用，请设置一个密码';
            }
            document.getElementById('mobileIntimatePasswordInput').value = '';
            document.getElementById('mobileIntimateLockError').textContent = '';
        });
    },

    async handleIntimatePassword() {
        const input = document.getElementById('mobileIntimatePasswordInput').value.trim();
        if (!input) { document.getElementById('mobileIntimateLockError').textContent = '请输入密码'; return; }
        const existingPwd = await this.getIntimatePassword();
        if (!existingPwd) {
            const ok = await this.setIntimatePassword(input);
            if (!ok) { document.getElementById('mobileIntimateLockError').textContent = '设置失败'; return; }
            this.unlockIntimateContent();
        } else if (input === existingPwd) {
            this.unlockIntimateContent();
        } else {
            document.getElementById('mobileIntimateLockError').textContent = '密码错误';
        }
    },

    unlockIntimateContent() {
        this.intimateUnlocked = true;
        document.getElementById('mobileIntimateLockScreen').style.display = 'none';
        document.getElementById('mobileIntimateContent').style.display = 'flex';
        const expiresAt = Date.now() + 30 * 60 * 1000;
        localStorage.setItem('intimate_unlocked', JSON.stringify({ expiresAt }));
        this.loadIntimateRecords();
    },

    lockIntimate() {
        this.intimateUnlocked = false;
        localStorage.removeItem('intimate_unlocked');
        document.getElementById('mobileIntimateLockScreen').style.display = 'flex';
        document.getElementById('mobileIntimateContent').style.display = 'none';
        document.getElementById('mobileIntimatePasswordInput').value = '';
        document.getElementById('mobileIntimateLockError').textContent = '';
    },

    async loadIntimateRecords() {
        if (!this.intimateUnlocked) return;
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;
            const { data } = await supabase.from('intimate_records').select('*, photos(id,storage_path,name)').order('record_date', { ascending: false });
            this.intimateRecords = (data || []).map(e => ({
                ...e,
                photo_storage_path: e.photos?.storage_path || '',
                photo_name: e.photos?.name || ''
            }));
        } catch (e) { this.intimateRecords = []; }
        this.renderIntimateRecords();
    },

    renderIntimateRecords() {
        const container = document.getElementById('mobileIntimateRecordsList');
        if (!container) return;
        if (!this.intimateRecords || this.intimateRecords.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">🔒</span><p>还没有记录</p><small>点击上方按钮添加第一条记录</small></div>';
            return;
        }
        container.innerHTML = this.intimateRecords.map(e => {
            const photoHtml = e.photo_id ? '<div class="timeline-photo" onclick="mobile.openDetail(\'' + e.photo_id + '\')"><img src="' + this.getPhotoUrl(e.photo_storage_path || '') + '" onerror="this.style.display=\'none\'"></div>' : '';
            const dateStr = e.record_date ? new Date(e.record_date).toLocaleDateString('zh-CN') : '';
            return '<div class="timeline-item mobile-timeline-item">' +
                '<div class="timeline-avatar">' + (e.mood || '💕') + '</div>' +
                '<div class="timeline-body">' +
                    '<div class="timeline-header">' +
                        '<span class="timeline-user">' + this.escapeHtml(e.user_name) + '</span>' +
                        '<span class="timeline-time">' + dateStr + '</span>' +
                    '</div>' +
                    (e.notes ? '<div class="timeline-content">' + this.escapeHtml(e.notes) + '</div>' : '') +
                    photoHtml +
                '</div>' +
            '</div>';
        }).join('');
    },

    openIntimateRecordModal() {
        this._intimatePhotoData = null;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'intimateRecordModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">添加亲密记录</h3>
                    <button class="icon-btn" onclick="document.getElementById('intimateRecordModal').remove()">×</button>
                </div>
                <div class="form-item">
                    <label>日期</label>
                    <input type="date" id="mobileIntimateRecordDate" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-item">
                    <label>心情</label>
                    <div class="mood-picker">
                        ${this._moodEmojis.map(m => '<button type="button" class="mood-btn" onclick="mobile.selectIntimateMood(\'' + m + '\')">' + m + '</button>').join('')}
                    </div>
                </div>
                <input type="hidden" id="mobileIntimateRecordMood" value="">
                <div class="form-item">
                    <label>备注</label>
                    <textarea id="mobileIntimateRecordNotes" rows="3" placeholder="记录今天的特别时刻..."></textarea>
                </div>
                <div class="form-item">
                    <label>关联照片（可选）</label>
                    <div id="mobileIntimatePhotoPreview"></div>
                    <button type="button" class="btn-secondary" onclick="mobile.openPhotoPicker(mobile.onIntimatePhotoPicked)" style="border-radius:8px;">📷 选择照片</button>
                </div>
                <input type="hidden" id="mobileIntimateRecordPhotoId" value="">
                <button class="btn-primary" onclick="mobile.saveIntimateRecord()" style="width:100%;border-radius:8px;margin-top:12px;">保存</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    selectIntimateMood(mood) {
        document.getElementById('mobileIntimateRecordMood').value = mood;
        document.querySelectorAll('#intimateRecordModal .mood-btn').forEach(b => b.classList.toggle('selected', b.textContent === mood));
    },

    onIntimatePhotoPicked(photo) {
        this._intimatePhotoData = photo;
        document.getElementById('mobileIntimateRecordPhotoId').value = photo.id;
        document.getElementById('mobileIntimatePhotoPreview').innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
                <div style="flex:1;">
                    <div style="font-size:13px;">${this.escapeHtml(photo.name || '')}</div>
                    <button type="button" onclick="mobile.clearIntimatePhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
                </div>
            </div>`;
    },

    clearIntimatePhoto() {
        this._intimatePhotoData = null;
        document.getElementById('mobileIntimateRecordPhotoId').value = '';
        document.getElementById('mobileIntimatePhotoPreview').innerHTML = '';
    },

    async saveIntimateRecord() {
        const recordDate = document.getElementById('mobileIntimateRecordDate').value;
        const mood = document.getElementById('mobileIntimateRecordMood').value;
        const notes = document.getElementById('mobileIntimateRecordNotes').value.trim();
        const photoId = document.getElementById('mobileIntimateRecordPhotoId').value.trim() || null;
        if (!recordDate) { this.showToast('请选择日期'); return; }
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        try {
            await supabase.from('intimate_records').insert({
                user_name: this.currentUser?.username || '用户',
                record_date: recordDate, mood, notes,
                photo_id: photoId || null
            });
            document.getElementById('intimateRecordModal').remove();
            this.loadIntimateRecords();
            this.showToast('已保存');
            this.addXP(10, 'intimate');
        } catch (e) { this.showToast('保存失败: ' + e.message); }
    },

    showIntimateStats() {
        if (!this.intimateRecords || this.intimateRecords.length === 0) {
            this.showToast('还没有记录');
            return;
        }
        const total = this.intimateRecords.length;
        const dates = this.intimateRecords.map(r => new Date(r.record_date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const monthsDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1;
        const monthlyAvg = monthsDiff > 0 ? (total / monthsDiff).toFixed(1) : total;

        const monthCounts = {};
        this.intimateRecords.forEach(r => {
            const d = new Date(r.record_date);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            monthCounts[key] = (monthCounts[key] || 0) + 1;
        });
        const sortedMonths = Object.keys(monthCounts).sort().slice(-12);
        const maxCount = Math.max(...Object.values(monthCounts), 1);

        const barsHtml = sortedMonths.map(m => {
            const count = monthCounts[m] || 0;
            const height = (count / maxCount * 100).toFixed(0);
            return '<div class="stat-bar-col"><div class="stat-bar" style="height:' + height + '%"></div><div class="stat-bar-value">' + count + '</div><div class="stat-bar-label">' + m + '</div></div>';
        }).join('');

        document.getElementById('mobileIntimateRecordsList').innerHTML = `
            <div class="intimate-stats">
                <div class="stat-cards">
                    <div class="stat-card"><div class="stat-card-value">${total}</div><div class="stat-card-label">总次数</div></div>
                    <div class="stat-card"><div class="stat-card-value">${monthlyAvg}</div><div class="stat-card-label">月均</div></div>
                    <div class="stat-card"><div class="stat-card-value">${monthsDiff}</div><div class="stat-card-label">跨度(月)</div></div>
                </div>
                <h4 style="margin:16px 0 8px 0;">月度趋势</h4>
                <div class="stat-bar-chart">${barsHtml}</div>
                <button class="btn-secondary" onclick="mobile.renderIntimateRecords()" style="margin-top:16px;width:100%;border-radius:8px;">← 返回记录列表</button>
            </div>`;
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

    // ========================================
    // 每日叨叨
    // ========================================

    getRelativeTime(dateStr) {
        const now = new Date();
        const date = new Date(dateStr);
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return mins + '分钟前';
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + '小时前';
        const days = Math.floor(hours / 24);
        if (days < 7) return days + '天前';
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return weeks + '周前';
        const months = Math.floor(days / 30);
        if (months < 12) return months + '个月前';
        const y = Math.floor(days / 365);
        return y + '年前';
    },

    async loadDailyChatter() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;
            const { data } = await supabase.from('daily_chatter').select('*, photos(id,storage_path,name)').order('created_at', { ascending: false });
            this.dailyChatterEntries = (data || []).map(e => ({
                ...e,
                photo_storage_path: e.photos?.storage_path || '',
                photo_name: e.photos?.name || ''
            }));
        } catch (e) { this.dailyChatterEntries = []; }
        this.renderDailyChatter();
    },

    renderDailyChatter() {
        const container = document.getElementById('mobileDailyChatterList');
        if (!container) return;
        if (!this.dailyChatterEntries || this.dailyChatterEntries.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">💬</span><p>还没有动态</p><small>点击上方按钮发布第一条动态</small></div>';
            return;
        }
        container.innerHTML = this.dailyChatterEntries.map(e => {
            const avatar = e.user_name ? e.user_name.charAt(0).toUpperCase() : '?';
            const photoHtml = e.photo_id ? '<div class="timeline-photo" onclick="mobile.openDetail(\'' + e.photo_id + '\')"><img src="' + this.getPhotoUrl(e.photo_storage_path || '') + '" onerror="this.style.display=\'none\'"></div>' : '';
            const relTime = this.getRelativeTime(e.created_at);
            return '<div class="timeline-item mobile-timeline-item">' +
                '<div class="timeline-avatar chatter-avatar">' + avatar + '</div>' +
                '<div class="timeline-body">' +
                    '<div class="timeline-header">' +
                        '<span class="timeline-user">' + this.escapeHtml(e.user_name) + '</span>' +
                        '<span class="timeline-time">' + relTime + '</span>' +
                        '<button class="btn-delete" style="margin-left:auto;padding:2px 6px;font-size:11px;" onclick="event.stopPropagation();mobile.deleteDailyChatter(' + e.id + ')">🗑️</button>' +
                    '</div>' +
                    '<div class="timeline-content">' + this.escapeHtml(e.content) + '</div>' +
                    photoHtml +
                '</div>' +
            '</div>';
        }).join('');
    },

    openDailyChatterModal() {
        this._chatterPhotoData = null;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'dailyChatterModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">发布动态</h3>
                    <button class="icon-btn" onclick="document.getElementById('dailyChatterModal').remove()">×</button>
                </div>
                <textarea id="mobileDailyChatterContent" rows="4" placeholder="今天想说什么..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;"></textarea>
                <div id="mobileDailyChatterPhotoPreview"></div>
                <div style="display:flex;gap:8px;">
                    <button type="button" class="btn-secondary" onclick="mobile.openPhotoPicker(mobile.onChatterPhotoPicked)" style="flex:1;border-radius:8px;">📷 选择照片</button>
                </div>
                <input type="hidden" id="mobileDailyChatterPhotoId" value="">
                <button class="btn-primary" onclick="mobile.saveDailyChatter()" style="width:100%;border-radius:8px;margin-top:12px;">发布</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    onChatterPhotoPicked(photo) {
        this._chatterPhotoData = photo;
        document.getElementById('mobileDailyChatterPhotoId').value = photo.id;
        document.getElementById('mobileDailyChatterPhotoPreview').innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;">
                <img src="${this.getPhotoUrl(photo.storage_path)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;">
                <div style="flex:1;">
                    <div style="font-size:13px;">${this.escapeHtml(photo.name || '')}</div>
                    <button type="button" onclick="mobile.clearChatterPhoto()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:12px;padding:0;">✕ 移除</button>
                </div>
            </div>`;
    },

    clearChatterPhoto() {
        this._chatterPhotoData = null;
        document.getElementById('mobileDailyChatterPhotoId').value = '';
        document.getElementById('mobileDailyChatterPhotoPreview').innerHTML = '';
    },

    async saveDailyChatter() {
        const content = document.getElementById('mobileDailyChatterContent').value.trim();
        const photoId = document.getElementById('mobileDailyChatterPhotoId').value.trim() || null;
        if (!content) { this.showToast('请输入内容'); return; }

        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }

        try {
            await supabase.from('daily_chatter').insert({
                user_name: this.currentUser?.username || '用户',
                content,
                photo_id: photoId || null
            });
            document.getElementById('dailyChatterModal').remove();
            this.loadDailyChatter();
            this.showToast('已发布');
            this.addXP(5, 'chatter');
        } catch (e) {
            this.showToast('发布失败: ' + e.message);
        }
    },

    async deleteDailyChatter(id) {
        if (!confirm('确定删除这条叨叨吗？')) return;
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        try {
            await supabase.from('daily_chatter').delete().eq('id', id);
            this.loadDailyChatter();
            this.showToast('已删除');
        } catch (e) {
            this.showToast('删除失败: ' + e.message);
        }
    },

    // ========================================
    // 通用照片选择器
    // ========================================

    async openPhotoPicker(callback) {
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        const { data } = await supabase
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        const photoList = data || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'genericPhotoPicker';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;max-height:85vh;overflow-y:auto;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">选择照片</h3>
                    <button class="icon-btn" onclick="document.getElementById('genericPhotoPicker').remove()">×</button>
                </div>
                <input type="text" id="genericPhotoSearch" placeholder="🔍 搜索照片..."
                    style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;font-size:14px;"
                    oninput="mobile.filterGenericPhotos()">
                <div id="genericPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
                    ${photoList.map(p => `
                        <div class="generic-photo-item" data-name="${this.escapeHtml(p.name || '')}"
                            style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;"
                            onclick="mobile.pickGenericPhoto('${p.id}', '${(p.storage_path||'').replace(/'/g, "\\'")}', '${(p.name||'').replace(/'/g, "\\'")}')">
                            <img src="${this.getPhotoUrl(p.storage_path)}" style="width:100%;height:75px;object-fit:cover;" onerror="this.style.display='none'">
                            <div style="padding:3px;font-size:10px;text-align:center;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml((p.name || '').substring(0, 12))}</div>
                        </div>
                    `).join('')}
                </div>
                ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
                <button class="btn-secondary" style="margin-top:12px;width:100%;border-radius:8px;" onclick="document.getElementById('genericPhotoPicker').remove()">取消</button>
            </div>
        `;
        document.body.appendChild(modal);
        this._photoPickerCallback = callback;
    },

    filterGenericPhotos() {
        const query = document.getElementById('genericPhotoSearch').value.toLowerCase();
        document.querySelectorAll('.generic-photo-item').forEach(el => {
            el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
        });
    },

    pickGenericPhoto(id, storagePath, name) {
        if (this._photoPickerCallback) {
            this._photoPickerCallback({ id, storage_path: storagePath, name });
            this._photoPickerCallback = null;
        }
        const picker = document.getElementById('genericPhotoPicker');
        if (picker) picker.remove();
    },

    // ========================================
    // ========================================
    // 照片漂流瓶 (移动端)
    // ========================================

    _incomingBottle: null,

    openThrowBottleModal() {
        const photo = this.currentPhoto;
        if (!photo) return;
        const self = this;
        const url = this.getPhotoUrl(photo.storage_path);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileThrowBottleModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:90vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;">🍾 扔一个漂流瓶</h3>' +
                '<button class="icon-btn" onclick="document.getElementById(\'mobileThrowBottleModal\').remove()">×</button>' +
            '</div>' +
            '<div style="text-align:center;margin-bottom:10px;">' +
                '<img src="' + url + '" style="max-width:100px;max-height:100px;border-radius:8px;object-fit:cover;">' +
                '<div style="font-size:11px;color:#888;margin-top:4px;">' + self.escapeHtml(photo.name || '') + '</div>' +
            '</div>' +
            '<textarea id="mThrowMsg" placeholder="想说的话（200字内）..." maxlength="200" style="width:100%;height:60px;padding:8px;border:1px solid #ddd;border-radius:8px;resize:none;font-size:13px;font-family:inherit;box-sizing:border-box;"></textarea>' +
            '<div style="margin:10px 0;font-size:13px;">' +
                '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="mDriftTime" value="random" checked> 🌊 1-7天随机</label>' +
                '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="mDriftTime" value="custom"> 📅 指定日期</label>' +
                '<input type="date" id="mThrowCustomDate" style="display:none;width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;margin-bottom:6px;">' +
                '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="mDriftTime" value="anniversary"> 🎂 下个纪念日</label>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button class="btn-secondary" onclick="document.getElementById(\'mobileThrowBottleModal\').remove()" style="flex:1;">取消</button>' +
                '<button class="btn-primary" onclick="mobile.throwBottle()" style="flex:1;">扔进海里🌊</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        document.querySelectorAll('input[name="mDriftTime"]').forEach(function(r) {
            r.onchange = function() {
                document.getElementById('mThrowCustomDate').style.display = r.value === 'custom' ? 'block' : 'none';
            };
        });
    },

    async throwBottle() {
        const photo = this.currentPhoto;
        if (!photo || !this.currentUser) return;
        const message = document.getElementById('mThrowMsg').value.trim();
        const timeMode = document.querySelector('input[name="mDriftTime"]:checked')?.value || 'random';
        const toUser = this.currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';
        let revealAt;
        if (timeMode === 'custom') {
            const d = document.getElementById('mThrowCustomDate').value;
            if (!d) { this.showToast('请选择日期'); return; }
            revealAt = new Date(d + 'T12:00:00Z').toISOString();
        } else if (timeMode === 'anniversary') {
            const start = new Date(this.anniversaryStartDate);
            const now = new Date();
            let next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            while (next <= now) next.setFullYear(next.getFullYear() + 1);
            revealAt = next.toISOString();
        } else {
            revealAt = new Date(Date.now() + (1 + Math.floor(Math.random() * 7)) * 86400000).toISOString();
        }
        try {
            const supabase = this.initSupabase();
            await supabase.from('drift_bottles').insert({
                from_user: this.currentUser.username, to_user: toUser,
                photo_id: photo.id, message: message, reveal_at: revealAt
            });
            document.getElementById('mobileThrowBottleModal').remove();
            this.showToast('瓶子已扔进海里 🌊');
        } catch (e) { this.showToast('扔瓶子失败: ' + e.message); }
    },

    async checkIncomingBottles() {
        if (!this.currentUser) return;
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;
            const { data } = await supabase
                .from('drift_bottles')
                .select('id, message, photo_id, thrown_at, photos(storage_path, name)')
                .eq('to_user', this.currentUser.username)
                .eq('status', 'drifting')
                .lte('reveal_at', new Date().toISOString())
                .order('reveal_at', { ascending: true })
                .limit(1);
            if (data && data.length > 0) {
                this._incomingBottle = data[0];
                const alertEl = document.getElementById('mobileDriftBottleAlert');
                if (alertEl) alertEl.style.display = 'flex';
            }
        } catch (e) { /* 静默 */ }
    },

    async openReceivedBottle() {
        const bottle = this._incomingBottle;
        if (!bottle) return;
        const self = this;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileReceivedBottleModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        let photoHtml = '';
        if (bottle.photos) {
            const url = this.getPhotoUrl(bottle.photos.storage_path);
            photoHtml = '<img src="' + url + '" style="width:100%;max-height:220px;border-radius:12px;object-fit:cover;margin-bottom:10px;">';
        }
        const days = Math.floor((Date.now() - new Date(bottle.thrown_at).getTime()) / 86400000);
        modal.innerHTML = '<div class="modal-card" style="max-width:90vw;padding:16px;text-align:center;">' +
            '<h2 style="margin:0 0 6px;">🍾 漂流瓶</h2>' +
            '<div style="font-size:11px;color:#999;margin-bottom:10px;">' + days + '天前扔进海里的</div>' +
            photoHtml +
            '<div style="background:#fff5f5;border-radius:12px;padding:14px;font-size:14px;color:#555;margin-bottom:10px;line-height:1.6;">' + (bottle.message ? '"' + self.escapeHtml(bottle.message) + '"' : '（只有一张照片）') + '</div>' +
            '<button onclick="document.getElementById(\'mobileReceivedBottleModal\').remove();mobile.closeIncomingBottle()" class="btn-primary" style="width:100%;">💝 收藏这份惊喜</button>' +
            '</div>';
        document.body.appendChild(modal);
    },

    async closeIncomingBottle() {
        const bottle = this._incomingBottle;
        if (!bottle) return;
        const supabase = this.initSupabase();
        await supabase.from('drift_bottles').update({ status: 'revealed', revealed_at: new Date().toISOString() }).eq('id', bottle.id);
        this._incomingBottle = null;
        document.getElementById('mobileDriftBottleAlert').style.display = 'none';
    },

    // 对方喜好档案 (移动端)
    // ========================================

    async loadPartnerProfile() {
        const supabase = this.initSupabase();
        try {
            const profileKey = 'partner_profile_' + (this.currentUser?.username || 'default');
            const { data } = await supabase.from('app_settings').select('value').eq('key', profileKey).maybeSingle();
            if (data && data.value) {
                this.partnerProfileData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            } else {
                this.partnerProfileData = JSON.parse(JSON.stringify({
                    updated_by: '', updated_at: '',
                    categories: {
                        food: { label: '食物', icon: '🍔', likes: [], dislikes: [] },
                        drinks: { label: '饮品', icon: '🧋', likes: [], dislikes: [] },
                        colors: { label: '颜色', icon: '🎨', likes: [], dislikes: [] },
                        movies: { label: '电影/剧', icon: '🎬', likes: [], dislikes: [] },
                        music: { label: '音乐', icon: '🎵', likes: [], dislikes: [] },
                        brands: { label: '品牌', icon: '🛍', likes: [], dislikes: [] },
                        restaurants: { label: '餐厅', icon: '🍽', likes: [], dislikes: [] },
                        gifts: { label: '想要的礼物', icon: '🎁', likes: [], dislikes: [] },
                        other: { label: '其他备忘', icon: '📌', notes: '' }
                    }
                }));
            }
        } catch (e) {
            this.partnerProfileData = JSON.parse(JSON.stringify({
                updated_by: '', updated_at: '',
                categories: {
                    food: { label: '食物', icon: '🍔', likes: [], dislikes: [] },
                    drinks: { label: '饮品', icon: '🧋', likes: [], dislikes: [] },
                    colors: { label: '颜色', icon: '🎨', likes: [], dislikes: [] },
                    movies: { label: '电影/剧', icon: '🎬', likes: [], dislikes: [] },
                    music: { label: '音乐', icon: '🎵', likes: [], dislikes: [] },
                    brands: { label: '品牌', icon: '🛍', likes: [], dislikes: [] },
                    restaurants: { label: '餐厅', icon: '🍽', likes: [], dislikes: [] },
                    gifts: { label: '想要的礼物', icon: '🎁', likes: [], dislikes: [] },
                    other: { label: '其他备忘', icon: '📌', notes: '' }
                }
            }));
        }
        this._partnerProfileEditing = false;
        this.renderPartnerProfile();
    },

    renderPartnerProfile() {
        const container = document.getElementById('mobilePartnerProfileContent');
        if (!container) return;
        const p = this.partnerProfileData;
        if (!p) { container.innerHTML = '<div class="empty-state">加载中...</div>'; return; }

        const editBtn = document.getElementById('mobilePartnerProfileEditBtn');
        if (editBtn) editBtn.textContent = this._partnerProfileEditing ? '💾 保存' : '✏️';

        const updatedInfo = p.updated_at
            ? '<div class="profile-updated">' + (p.updated_by || '') + ' 更新于 ' + new Date(p.updated_at).toLocaleString('zh-CN') + '</div>'
            : '';

        const cats = p.categories || {};
        const self = this;

        if (this._partnerProfileEditing) {
            container.innerHTML = updatedInfo + Object.entries(cats).map(function([key, c]) {
                const likesStr = (c.likes || []).join(', ');
                const dislikesStr = (c.dislikes || []).join(', ');
                const notesStr = c.notes || '';
                const catHeader = '<div class="profile-cat-header">' +
                    '<span class="profile-cat-icon">' + (c.icon || '') + '</span>' +
                    '<span class="profile-cat-label">' + (c.label || key) + '</span>' +
                    '<button class="btn-mini btn-danger" onclick="mobile.removeProfileCategory(\'' + key + '\')" title="删除分类">×</button>' +
                    '</div>';
                if (key === 'other') {
                    return '<div class="profile-cat-card">' + catHeader +
                        '<textarea class="profile-notes" data-key="' + key + '" placeholder="备忘...">' + self.escapeHtml(notesStr) + '</textarea></div>';
                }
                return '<div class="profile-cat-card">' + catHeader +
                    '<label class="profile-tag-label">喜欢</label>' +
                    '<div class="profile-tag-input"><input value="' + self.escapeHtml(likesStr) + '" data-key="' + key + '" data-type="likes" placeholder="逗号分隔"><button class="btn-mini" onclick="mobile.addProfileTag(this)">+</button></div>' +
                    '<div class="profile-tag-list" data-key="' + key + '" data-type="likes">' + (c.likes || []).map(function(t, i) { return '<span class="profile-tag">' + self.escapeHtml(t) + '<span class="profile-tag-x" onclick="mobile.removeProfileTag(this,\'' + key + '\',\'likes\',' + i + ')">×</span></span>'; }).join('') + '</div>' +
                    '<label class="profile-tag-label">不喜欢</label>' +
                    '<div class="profile-tag-input"><input value="' + self.escapeHtml(dislikesStr) + '" data-key="' + key + '" data-type="dislikes" placeholder="逗号分隔"><button class="btn-mini" onclick="mobile.addProfileTag(this)">+</button></div>' +
                    '<div class="profile-tag-list" data-key="' + key + '" data-type="dislikes">' + (c.dislikes || []).map(function(t, i) { return '<span class="profile-tag">' + self.escapeHtml(t) + '<span class="profile-tag-x" onclick="mobile.removeProfileTag(this,\'' + key + '\',\'dislikes\',' + i + ')">×</span></span>'; }).join('') + '</div>' +
                    '</div>';
            }).join('') + '<button class="btn btn-secondary" onclick="mobile.addProfileCategory()" style="width:100%;margin-top:8px;">+ 添加分类</button>';
        } else {
            const emptyCount = Object.values(cats).filter(function(c) {
                return (!c.likes || c.likes.length === 0) && (!c.dislikes || c.dislikes.length === 0) && (!c.notes);
            }).length;
            if (emptyCount === Object.keys(cats).length) {
                container.innerHTML = updatedInfo + '<div class="empty-state"><span style="font-size:48px;">💝</span><p>还没有记录对方的喜好</p><small>点击右上角编辑按钮开始记录</small></div>';
                return;
            }
            container.innerHTML = updatedInfo + Object.entries(cats).map(function([key, c]) {
                const likes = (c.likes || []).length > 0 ? '<div class="profile-row"><span class="profile-row-label">喜欢</span><span>' + c.likes.map(self.escapeHtml).join('、') + '</span></div>' : '';
                const dislikes = (c.dislikes || []).length > 0 ? '<div class="profile-row"><span class="profile-row-label">不喜欢</span><span>' + c.dislikes.map(self.escapeHtml).join('、') + '</span></div>' : '';
                const notes = c.notes ? '<div class="profile-row"><span class="profile-row-label">备忘</span><span>' + self.escapeHtml(c.notes) + '</span></div>' : '';
                const body = likes + dislikes + notes;
                if (!body) return '';
                return '<div class="profile-cat-card">' +
                    '<div class="profile-cat-header"><span class="profile-cat-icon">' + (c.icon || '') + '</span><span class="profile-cat-label">' + (c.label || key) + '</span></div>' +
                    body + '</div>';
            }).join('');
        }
    },

    togglePartnerProfileEdit() {
        this._partnerProfileEditing = !this._partnerProfileEditing;
        if (!this._partnerProfileEditing) this.savePartnerProfile(); else this.renderPartnerProfile();
    },

    async savePartnerProfile() {
        const p = this.partnerProfileData;
        p.updated_by = this.currentUser?.username || '';
        p.updated_at = new Date().toISOString();
        const self = this;
        // 收集标签
        document.querySelectorAll('#mobilePartnerProfileContent .profile-tag-list').forEach(function(list) {
            const key = list.dataset.key;
            const type = list.dataset.type;
            const tags = [];
            list.querySelectorAll('.profile-tag').forEach(function(tag) {
                const text = tag.textContent.replace('×', '').trim();
                if (text) tags.push(text);
            });
            if (p.categories[key]) p.categories[key][type] = tags;
        });
        // 输入框追加
        document.querySelectorAll('#mobilePartnerProfileContent .profile-tag-input input').forEach(function(input) {
            const key = input.dataset.key;
            const type = input.dataset.type;
            const raw = input.value.trim();
            if (raw) {
                const newTags = raw.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
                if (p.categories[key]) newTags.forEach(function(t) { if (!p.categories[key][type].includes(t)) p.categories[key][type].push(t); });
            }
        });
        // 备注
        document.querySelectorAll('#mobilePartnerProfileContent .profile-notes').forEach(function(ta) {
            const key = ta.dataset.key;
            if (p.categories[key]) p.categories[key].notes = ta.value.trim();
        });

        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        try {
            const profileKey = 'partner_profile_' + (this.currentUser?.username || 'default');
            await supabase.from('app_settings').upsert({ key: profileKey, value: JSON.stringify(p) });
            this._partnerProfileEditing = false;
            this.renderPartnerProfile();
            this.showToast('已保存');
        } catch (e) { this.showToast('保存失败: ' + e.message); }
    },

    addProfileTag(btn) {
        const input = btn.previousElementSibling;
        const key = input.dataset.key;
        const type = input.dataset.type;
        const raw = input.value.trim();
        if (!raw || !key || !type) return;
        const tags = raw.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
        const list = document.querySelector('#mobilePartnerProfileContent .profile-tag-list[data-key="' + key + '"][data-type="' + type + '"]');
        const self = this;
        tags.forEach(function(t) {
            const span = document.createElement('span');
            span.className = 'profile-tag';
            span.innerHTML = self.escapeHtml(t) + '<span class="profile-tag-x" onclick="mobile.removeProfileTag(this,\'' + key + '\',\'' + type + '\',' + self.partnerProfileData.categories[key][type].length + ')">×</span>';
            list.appendChild(span);
            self.partnerProfileData.categories[key][type].push(t);
        });
        input.value = '';
    },

    removeProfileTag(btn, key, type, index) {
        btn.parentElement.remove();
        if (this.partnerProfileData.categories[key]) {
            this.partnerProfileData.categories[key][type].splice(index, 1);
        }
    },

    addProfileCategory() {
        const key = prompt('分类英文标识（如: sports）');
        if (!key) return;
        const label = prompt('分类中文名（如: 运动）');
        if (!label) return;
        const icon = prompt('图标（emoji，如: ⚽）');
        if (this.partnerProfileData.categories[key]) { this.showToast('该分类已存在'); return; }
        this.partnerProfileData.categories[key] = { label: label, icon: icon || '📌', likes: [], dislikes: [] };
        this.renderPartnerProfile();
    },

    removeProfileCategory(key) {
        if (!confirm('删除分类 "' + (this.partnerProfileData.categories[key]?.label || key) + '" ？')) return;
        delete this.partnerProfileData.categories[key];
        this.renderPartnerProfile();
    },

};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    mobile.init();
});

// 暴露到全局
window.mobile = mobile;
