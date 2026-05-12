/* MODULE: extras-module.js — 其他功能（拼贴墙、RPG、漂流瓶、悄悄话、戳一戳、时光胶囊、周期追踪、游戏中心）
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

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
                this.rpgData.dietary_month_count = this.rpgData.dietary_month_count || 0;
                this.rpgData.dietary_completed_cycles = this.rpgData.dietary_completed_cycles || [];
                this.rpgData.dietary_custom_rewards = this.rpgData.dietary_custom_rewards || [];
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
        this.rpgData = { xp: 0, daily_quests: [], weekly_quests: [], unlocked_titles: [], active_title: '', custom_rewards: [], login_streak: 1, last_login_date: new Date().toISOString().slice(0, 10), dietary_month_count: 0, dietary_completed_cycles: [], dietary_custom_rewards: [] };
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
                dietary_month_count: this.rpgData.dietary_month_count,
                dietary_completed_cycles: this.rpgData.dietary_completed_cycles,
                dietary_custom_rewards: this.rpgData.dietary_custom_rewards,
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

        var dietaryTitlesEl = document.getElementById('rpgDietaryTitles');
        if (dietaryTitlesEl) {
            var dietaryCount = this.rpgData.dietary_month_count || 0;
            var dietaryTiers = [
                { count: 1, name: '好宝宝' },
                { count: 3, name: '乖宝宝' },
                { count: 6, name: '好乖宝宝' }
            ];
            var titles = this.rpgData.unlocked_titles || [];
            dietaryTitlesEl.innerHTML = '<h3>🩸 忌口成就</h3>' +
                '<div class="dietary-title-track">' +
                    '<div class="dietary-title-count">已完成 <strong>' + dietaryCount + '</strong> 次月度忌口挑战</div>' +
                    '<div class="rpg-track-badges">' +
                        dietaryTiers.map(function(t) {
                            var unlocked = titles.indexOf(t.name) >= 0;
                            return '<div class="rpg-track-badge' + (unlocked ? '' : ' locked') + '">' +
                                '<span class="rpg-track-badge-icon">' + (unlocked ? '🏅' : '🔒') + '</span>' +
                                '<span class="rpg-track-badge-name">' + (unlocked ? t.name : '???') + '</span>' +
                                '<span class="rpg-track-badge-desc">' + t.count + ' 次</span>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                '</div>';
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
    // ========================================
    // 照片漂流瓶 (移动端)
    // ========================================

    _incomingBottle: null,

    openThrowBottleModal() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
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
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
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

    // ========================================
    // 悄悄话
    // ========================================

    async loadSecretNoteInbox() {
        await this.checkIncomingNotes();
        var inboxEl = document.getElementById('mobileSecretNoteInbox');
        if (!inboxEl) return;
        if (this._incomingNote) {
            inboxEl.innerHTML = '<div class="secret-note-preview" onclick="mobile.openReceivedNote()">' +
                '<div class="secret-note-icon">💌</div>' +
                '<div class="secret-note-hint">你有一张新的小纸条</div>' +
                '<div class="secret-note-action">点击打开</div>' +
                '</div>';
        } else {
            inboxEl.innerHTML = '<p style="margin-top:60px;">还没有收到悄悄话 💭</p><small>写一张小纸条给对方吧</small>';
        }
    },

    openSecretNoteSendModal() {
        var self = this;
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileSecretNoteSendModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:92vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<h3 style="margin:0;">💌 写张小纸条</h3>' +
            '<button onclick="document.getElementById(\'mobileSecretNoteSendModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>' +
            '</div>' +
            '<textarea id="mobileSecretNoteContent" placeholder="想说点什么...（200字）" maxlength="200" rows="4" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:none;box-sizing:border-box;margin-bottom:12px;"></textarea>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:13px;color:#666;margin-bottom:6px;">发送方式：</div>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:14px;">' +
            '<input type="radio" name="mSecretNoteMode" value="instant" checked onchange="mobile.onSecretNoteModeChange()"> 📨 即时发送' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:14px;">' +
            '<input type="radio" name="mSecretNoteMode" value="scheduled" onchange="mobile.onSecretNoteModeChange()"> ⏰ 定时送达' +
            '</label>' +
            '<div id="mSecretNoteScheduledRow" style="display:none;margin-left:24px;margin-bottom:4px;">' +
            '<input type="datetime-local" id="mSecretNoteRevealAt" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:14px;">' +
            '<input type="radio" name="mSecretNoteMode" value="proximity" onchange="mobile.onSecretNoteModeChange()"> 📍 见面解锁' +
            '</label>' +
            '<div id="mSecretNoteProximityRow" style="display:none;margin-left:24px;margin-top:6px;">' +
            '<div style="display:flex;gap:4px;margin-bottom:6px;">' +
            '<input type="number" id="mSecretNoteRevealLat" placeholder="纬度" step="any" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
            '<input type="number" id="mSecretNoteRevealLng" placeholder="经度" step="any" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:12px;color:#666;">半径:</span>' +
            '<input type="range" id="mSecretNoteRadius" min="50" max="1000" value="200" step="50" style="flex:1;">' +
            '<span id="mSecretNoteRadiusLabel" style="font-size:12px;color:#666;">200m</span>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<button onclick="document.getElementById(\'mobileSecretNoteSendModal\').remove()" class="btn-secondary" style="flex:1;">取消</button>' +
            '<button onclick="mobile.sendSecretNote()" class="btn-primary" style="flex:1;">送出 💌</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function() {
            var slider = document.getElementById('mSecretNoteRadius');
            if (slider) {
                slider.addEventListener('input', function() {
                    document.getElementById('mSecretNoteRadiusLabel').textContent = this.value + 'm';
                });
            }
            // Try get current location for proximity mode
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    var latEl = document.getElementById('mSecretNoteRevealLat');
                    var lngEl = document.getElementById('mSecretNoteRevealLng');
                    if (latEl && lngEl && !latEl.value) {
                        latEl.value = pos.coords.latitude.toFixed(5);
                        lngEl.value = pos.coords.longitude.toFixed(5);
                    }
                }, function() {}, { timeout: 5000 });
            }
        }, 100);
    },

    onSecretNoteModeChange() {
        var mode = document.querySelector('input[name="mSecretNoteMode"]:checked').value;
        document.getElementById('mSecretNoteScheduledRow').style.display = mode === 'scheduled' ? 'block' : 'none';
        document.getElementById('mSecretNoteProximityRow').style.display = mode === 'proximity' ? 'block' : 'none';
    },

    async sendSecretNote() {
        var content = document.getElementById('mobileSecretNoteContent').value.trim();
        if (!content) { this.showToast('请写点什么吧 💌'); return; }
        var supabase = this.initSupabase();
        var mode = document.querySelector('input[name="mSecretNoteMode"]:checked').value;
        var toUser = this.currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';
        var note = { from_user: this.currentUser.username, to_user: toUser, content: content, send_mode: mode };
        if (mode === 'scheduled') {
            var revealAt = document.getElementById('mSecretNoteRevealAt').value;
            if (!revealAt) { this.showToast('请选择送达时间'); return; }
            note.reveal_at = new Date(revealAt).toISOString();
        } else if (mode === 'proximity') {
            var lat = parseFloat(document.getElementById('mSecretNoteRevealLat').value);
            var lng = parseFloat(document.getElementById('mSecretNoteRevealLng').value);
            if (isNaN(lat) || isNaN(lng)) { this.showToast('请输入解锁坐标'); return; }
            note.reveal_lat = lat;
            note.reveal_lng = lng;
            note.reveal_radius = parseInt(document.getElementById('mSecretNoteRadius').value) || 200;
        }
        try {
            await supabase.from('secret_notes').insert(note);
            document.getElementById('mobileSecretNoteSendModal').remove();
            this.showToast('小纸条已送出 💌');
        } catch (e) { this.showToast('送出失败: ' + e.message); }
    },

    async checkIncomingNotes() {
        if (!this.currentUser) return;
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            if (!this._notesExpiredCleaned) {
                await supabase.from('secret_notes')
                    .update({ status: 'expired' })
                    .eq('status', 'hidden')
                    .eq('to_user', this.currentUser.username)
                    .lt('expires_at', new Date().toISOString());
                this._notesExpiredCleaned = true;
            }
            var data = null;
            var instantResult = await supabase
                .from('secret_notes')
                .select('*')
                .eq('to_user', this.currentUser.username)
                .eq('status', 'hidden')
                .eq('send_mode', 'instant')
                .order('created_at', { ascending: false })
                .limit(1);
            data = instantResult.data;
            if (!data || data.length === 0) {
                var schedResult = await supabase
                    .from('secret_notes')
                    .select('*')
                    .eq('to_user', this.currentUser.username)
                    .eq('status', 'hidden')
                    .eq('send_mode', 'scheduled')
                    .lte('reveal_at', new Date().toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1);
                data = schedResult.data;
            }
            // Check proximity notes
            if ((!data || data.length === 0) && navigator.geolocation) {
                var self = this;
                var proxResult = await supabase
                    .from('secret_notes')
                    .select('*')
                    .eq('to_user', this.currentUser.username)
                    .eq('status', 'hidden')
                    .eq('send_mode', 'proximity')
                    .order('created_at', { ascending: false });
                if (proxResult.data && proxResult.data.length > 0) {
                    navigator.geolocation.getCurrentPosition(function(pos) {
                        for (var i = 0; i < proxResult.data.length; i++) {
                            var note = proxResult.data[i];
                            if (note.reveal_lat && note.reveal_lng) {
                                var dist = self._calcDistance(pos.coords.latitude, pos.coords.longitude, note.reveal_lat, note.reveal_lng);
                                if (dist <= (note.reveal_radius || 200)) {
                                    data = [note];
                                    break;
                                }
                            }
                        }
                        if (data && data.length > 0) {
                            self._incomingNote = data[0];
                            self.showPaperNotification();
                        }
                    }, function() {}, { timeout: 5000 });
                }
            }
            if (data && data.length > 0 && !this._geoPending) {
                this._incomingNote = data[0];
                this.showPaperNotification();
            }
        } catch (e) { /* silent */ }
    },

    _calcDistance(lat1, lng1, lat2, lng2) {
        var R = 6371000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    showPaperNotification() {
        if (!this._incomingNote) return;
        var existing = document.getElementById('mobileSecretNoteNotification');
        if (existing) existing.remove();
        var self = this;
        var el = document.createElement('div');
        el.id = 'mobileSecretNoteNotification';
        el.className = 'secret-note-notification';
        el.innerHTML = '<span class="note-notify-icon">💌</span> 你收到了一张小纸条';
        el.onclick = function() { el.remove(); self.openReceivedNote(); };
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.remove(); }, 5000);
    },

    async openReceivedNote() {
        var note = this._incomingNote;
        if (!note) return;
        var notif = document.getElementById('mobileSecretNoteNotification');
        if (notif) notif.remove();
        var self = this;
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileReceivedNoteModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        var time = new Date(note.created_at);
        var timeStr = time.getHours().toString().padStart(2,'0') + ':' + time.getMinutes().toString().padStart(2,'0');
        var fromName = note.from_user === 'laoda' ? '老大' : '小弟';
        modal.innerHTML = '<div class="modal-card" style="max-width:90vw;padding:0;overflow:hidden;text-align:center;">' +
            '<div class="secret-note-paper" id="mobileSecretNotePaper">' +
            '<div class="secret-note-paper-inner">' +
            '<div class="secret-note-from">💌 来自 ' + self.escapeHtml(fromName) + '</div>' +
            '<div class="secret-note-content">' + self.escapeHtml(note.content) + '</div>' +
            '<div class="secret-note-time">' + timeStr + '</div>' +
            '</div>' +
            '</div>' +
            '<button onclick="document.getElementById(\'mobileReceivedNoteModal\').remove();mobile.closeReceivedNote()" class="btn-primary" style="margin:14px;width:calc(100% - 28px);">💝 我知道了</button>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function() {
            var paper = document.getElementById('mobileSecretNotePaper');
            if (paper) paper.classList.add('unfolded');
        }, 50);
    },

    async closeReceivedNote() {
        var note = this._incomingNote;
        if (!note) return;
        var supabase = this.initSupabase();
        await supabase.from('secret_notes').update({ status: 'revealed', revealed_at: new Date().toISOString() }).eq('id', note.id);
        this._incomingNote = null;
        this.loadSecretNoteInbox();
    },


    // ========================================
    // 戳一戳
    // ========================================

    async sendNudge() {
        if (Date.now() < (this._nudgeCooldownUntil || 0)) {
            var secs = Math.ceil(((this._nudgeCooldownUntil || 0) - Date.now()) / 1000);
            this.showToast('请等 ' + secs + ' 秒再戳 ~');
            return;
        }
        var toUser = this.currentUser.username === 'laoda' ? 'xiaodi' : 'laoda';
        var supabase = this.initSupabase();
        try {
            await supabase.from('nudges').insert({ from_user: this.currentUser.username, to_user: toUser });
            this._nudgeCooldownUntil = Date.now() + 30000;
            // Vibrate
            if (navigator.vibrate) { navigator.vibrate([30, 50, 30]); }
            // Button animation
            var btn = document.getElementById('mobileNudgeBtn');
            if (btn) { btn.classList.add('nudged'); setTimeout(function() { btn.classList.remove('nudged'); }, 300); }
            // Cooldown display
            var cdEl = document.getElementById('mobileNudgeCooldown');
            if (cdEl) {
                cdEl.style.display = 'block';
                cdEl.textContent = '30秒后可再戳';
                var self = this;
                var interval = setInterval(function() {
                    var remain = Math.ceil(((self._nudgeCooldownUntil || 0) - Date.now()) / 1000);
                    if (remain <= 0) { cdEl.style.display = 'none'; clearInterval(interval); }
                    else { cdEl.textContent = remain + '秒后可再戳'; }
                }, 1000);
            }
            this.showToast('戳了一下对方 💗');
        } catch (e) { this.showToast('戳一戳失败: ' + e.message); }
    },

    async checkIncomingNudges() {
        if (!this.currentUser) return;
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            var lastCheck = localStorage.getItem('nudge_lastCheck') || '1970-01-01T00:00:00Z';
            var { data } = await supabase
                .from('nudges')
                .select('*')
                .eq('to_user', this.currentUser.username)
                .gt('created_at', lastCheck)
                .order('created_at', { ascending: false });
            if (data && data.length > 0) {
                var fromName = data[0].from_user === 'laoda' ? '老大' : '小弟';
                var time = new Date(data[data.length - 1].created_at);
                var timeStr = time.getHours().toString().padStart(2,'0') + ':' + time.getMinutes().toString().padStart(2,'0');
                var suffix = data.length > 1 ? '（共' + data.length + '次）' : '';
                this.showNudgePopup(fromName, timeStr, suffix);
                // Vibrate on receive too
                if (navigator.vibrate) { navigator.vibrate([20, 40, 20]); }
            }
            localStorage.setItem('nudge_lastCheck', new Date().toISOString());
        } catch (e) { /* silent */ }
    },

    showNudgePopup(fromName, timeStr, suffix) {
        var existing = document.getElementById('mobileNudgePopup');
        if (existing) existing.remove();
        var self = this;
        var popup = document.createElement('div');
        popup.id = 'mobileNudgePopup';
        popup.className = 'nudge-popup';
        popup.innerHTML = '<span class="nudge-popup-heart">💗</span>' +
            '<span class="nudge-popup-text">' + self.escapeHtml(fromName) + ' 戳了戳你 ' + self.escapeHtml(suffix) + '</span>' +
            '<span class="nudge-popup-time">' + timeStr + '</span>';
        popup.onclick = function() { popup.remove(); };
        document.body.appendChild(popup);
        setTimeout(function() { if (popup.parentNode) { popup.classList.add('nudge-popup-out'); setTimeout(function() { if (popup.parentNode) popup.remove(); }, 400); } }, 3000);
    },


    // ========================================
    // 时光胶囊
    // ========================================

    async loadTimeCapsules() {
        var container = document.getElementById('mobileTimeCapsuleList');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载中...</p>';
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            var { data } = await supabase.from('time_capsules').select('*').order('created_at', { ascending: false });
            this._timeCapsulesData = data || [];
            this.renderTimeCapsuleList(this._timeCapsulesData);
        } catch (e) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载失败</p>';
        }
    },

    renderTimeCapsuleList(capsules) {
        var container = document.getElementById('mobileTimeCapsuleList');
        if (!container) return;
        if (!capsules || capsules.length === 0) {
            container.innerHTML = '<div class="empty-hint">⏳ 还没有时光胶囊<br><small>创建一个吧，把想说的话封存起来</small></div>';
            return;
        }
        var now = new Date();
        var html = '';
        var self = this;
        capsules.forEach(function(c) {
            var isLocked = c.status === 'locked';
            var isCreator = (c.created_by === 'laoda' && self.currentUser.isLaoda) || (c.created_by === 'xiaodi' && !self.currentUser.isLaoda);
            var createdLabel = c.created_by === 'laoda' ? '老大' : '小弟';
            if (isLocked) {
                var hint = '';
                if (c.unlock_mode === 'time' && c.reveal_at) {
                    var revealDate = new Date(c.reveal_at);
                    var diff = revealDate - now;
                    if (diff > 0) {
                        var days = Math.floor(diff / 86400000);
                        var hours = Math.floor((diff % 86400000) / 3600000);
                        hint = '⏰ ' + (days > 0 ? days + '天' : '') + hours + '小时后解锁';
                    } else {
                        hint = '⏰ 已到解锁时间（刷新后解锁）';
                    }
                } else if (c.unlock_mode === 'location') {
                    hint = '📍 在' + (c.reveal_lat ? c.reveal_lat.toFixed(2) + ',' + c.reveal_lng.toFixed(2) : '某个地方') + '等你';
                } else if (c.unlock_mode === 'both') {
                    hint = '⏰📍 定时+定位解锁';
                }
                html += '<div class="time-capsule-card locked" onclick="mobile.showCapsuleDetail(' + c.id + ')">' +
                    '<div class="capsule-icon">' + (isCreator ? '✍️' : '🔒') + '</div>' +
                    '<div class="capsule-info">' +
                    '<div class="capsule-title">' + self.escapeHtml(c.title) + '</div>' +
                    '<div class="capsule-hint">' + hint + '</div>' +
                    '<div class="capsule-meta">' + createdLabel + ' · ' + self.formatRelativeTime(c.created_at) + '</div>' +
                    '</div></div>';
            } else {
                html += '<div class="time-capsule-card unlocked" onclick="mobile.showCapsuleDetail(' + c.id + ')">' +
                    '<div class="capsule-icon">💌</div>' +
                    '<div class="capsule-info">' +
                    '<div class="capsule-title">' + self.escapeHtml(c.title) + '</div>' +
                    '<div class="capsule-content">' + self.escapeHtml((c.content || '').substring(0, 50) + ((c.content || '').length > 50 ? '...' : '')) + '</div>' +
                    '<div class="capsule-meta">' + createdLabel + ' · ' + (c.unlocked_at ? self.formatRelativeTime(c.unlocked_at) + ' 解锁' : '') + '</div>' +
                    '</div></div>';
            }
        });
        container.innerHTML = html;
    },

    openTimeCapsuleCreateModal() {
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileTimeCapsuleModal';
        modal.innerHTML = '<div class="modal-card">' +
            '<h3>⏳ 封存时光胶囊</h3>' +
            '<div class="form-group"><label>标题</label><input id="mobileCapsuleTitle" class="form-input" placeholder="给这个胶囊起个名字"></div>' +
            '<div class="form-group"><label>内容</label><textarea id="mobileCapsuleContent" class="form-input" rows="4" placeholder="想对未来说的话..."></textarea></div>' +
            '<div class="form-group"><label>解锁方式</label>' +
            '<select id="mobileCapsuleUnlockMode" class="form-input" onchange="mobile.onCapsuleModeChange()">' +
            '<option value="time">⏰ 定时解锁</option>' +
            '<option value="location">📍 定位解锁</option>' +
            '<option value="both">⏰📍 定时+定位</option></select></div>' +
            '<div id="mobileCapsuleTimeField" class="form-group"><label>解锁时间</label><input id="mobileCapsuleRevealAt" type="datetime-local" class="form-input"></div>' +
            '<div id="mobileCapsuleLocationFields" style="display:none;">' +
            '<div class="form-row"><div class="form-group" style="flex:1;"><label>纬度</label><input id="mobileCapsuleRevealLat" type="number" step="0.00001" class="form-input" placeholder="例如 39.9042"></div>' +
            '<div class="form-group" style="flex:1;"><label>经度</label><input id="mobileCapsuleRevealLng" type="number" step="0.00001" class="form-input" placeholder="例如 116.4074"></div></div>' +
            '<button type="button" class="btn-secondary" style="width:100%;margin-bottom:10px;" onclick="mobile.openCapsuleMapPicker(\'mobile\')">📍 在地图上选点</button>' +
            '<div class="form-group"><label>解锁半径(米)</label><input id="mobileCapsuleRevealRadius" type="number" class="form-input" value="200" min="50" max="5000"></div></div>' +
            '<div class="modal-actions">' +
            '<button class="btn-primary" onclick="mobile.createTimeCapsule()">💾 封存</button>' +
            '<button class="btn-secondary" onclick="document.getElementById(\'mobileTimeCapsuleModal\').remove()">取消</button></div></div>';
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                var latEl = document.getElementById('mobileCapsuleRevealLat');
                var lngEl = document.getElementById('mobileCapsuleRevealLng');
                if (latEl && lngEl && !latEl.value) {
                    latEl.value = pos.coords.latitude.toFixed(5);
                    lngEl.value = pos.coords.longitude.toFixed(5);
                }
            }, function() {}, { timeout: 5000 });
        }
    },

    onCapsuleModeChange() {
        var mode = document.getElementById('mobileCapsuleUnlockMode').value;
        document.getElementById('mobileCapsuleTimeField').style.display = (mode === 'time' || mode === 'both') ? '' : 'none';
        document.getElementById('mobileCapsuleLocationFields').style.display = (mode === 'location' || mode === 'both') ? '' : 'none';
    },

    openCapsuleMapPicker(prefix) {
        var self = this;
        var latEl = document.getElementById(prefix + 'CapsuleRevealLat');
        var lngEl = document.getElementById(prefix + 'CapsuleRevealLng');
        var initLat = parseFloat(latEl.value) || 39.9042;
        var initLng = parseFloat(lngEl.value) || 116.4074;

        var overlay = document.createElement('div');
        overlay.id = 'capsuleMapPickerOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.5);';
        overlay.innerHTML = '<div id="capsuleMapPickerMap" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:92%;height:70%;border-radius:16px;overflow:hidden;background:#fff;"></div>' +
            '<button style="position:absolute;top:10px;right:10px;z-index:10001;background:#fff;border:none;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);">✕</button>' +
            '<button id="capsuleMapConfirmBtn" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;padding:10px 32px;background:var(--primary,#FFB5C2);color:#fff;border:none;border-radius:25px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15);">✓ 确认此位置</button>';
        document.body.appendChild(overlay);

        // Close button
        overlay.querySelector('button').onclick = function() { overlay.remove(); };
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

        // Init map
        var mapEl = document.getElementById('capsuleMapPickerMap');
        var map = L.map(mapEl, { attributionControl: false, zoomControl: true }).setView([initLat, initLng], 15);
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            subdomains: ['1','2','3','4'],
            maxZoom: 18
        }).addTo(map);

        // Moveable marker
        var marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
        marker.bindPopup('📍 解锁地点').openPopup();

        marker.on('dragend', function() {
            var pos = marker.getLatLng();
            updateCoords(pos.lat, pos.lng);
        });
        map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            updateCoords(e.latlng.lat, e.latlng.lng);
        });

        function updateCoords(lat, lng) {
            if (latEl) latEl.value = lat.toFixed(5);
            if (lngEl) lngEl.value = lng.toFixed(5);
        }

        // Confirm button
        document.getElementById('capsuleMapConfirmBtn').onclick = function() {
            var pos = marker.getLatLng();
            updateCoords(pos.lat, pos.lng);
            overlay.remove();
        };

        setTimeout(function() { map.invalidateSize(); }, 200);
    },

    async createTimeCapsule() {
        var title = document.getElementById('mobileCapsuleTitle').value.trim();
        var content = document.getElementById('mobileCapsuleContent').value.trim();
        var mode = document.getElementById('mobileCapsuleUnlockMode').value;
        if (!title) { this.showToast('请输入标题'); return; }
        var capsule = { created_by: this.currentUser.username, title: title, content: content, unlock_mode: mode };
        if (mode === 'time' || mode === 'both') {
            var revealAt = document.getElementById('mobileCapsuleRevealAt').value;
            if (!revealAt) { this.showToast('请选择解锁时间'); return; }
            capsule.reveal_at = new Date(revealAt).toISOString();
        }
        if (mode === 'location' || mode === 'both') {
            var lat = parseFloat(document.getElementById('mobileCapsuleRevealLat').value);
            var lng = parseFloat(document.getElementById('mobileCapsuleRevealLng').value);
            if (isNaN(lat) || isNaN(lng)) { this.showToast('请输入有效坐标'); return; }
            capsule.reveal_lat = lat;
            capsule.reveal_lng = lng;
            capsule.reveal_radius = parseInt(document.getElementById('mobileCapsuleRevealRadius').value) || 200;
        }
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            var { error } = await supabase.from('time_capsules').insert(capsule);
            if (error) throw error;
            document.getElementById('mobileTimeCapsuleModal').remove();
            this.loadTimeCapsules();
            this.showToast('💊 胶囊已封存');
        } catch (e) { this.showToast('封存失败: ' + e.message); }
    },

    async checkTimeCapsules() {
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            var { data } = await supabase.from('time_capsules').select('*').eq('status', 'locked');
            if (!data || data.length === 0) return;
            var now = new Date();
            for (var i = 0; i < data.length; i++) {
                var c = data[i];
                if (c.unlock_mode === 'time' && c.reveal_at && new Date(c.reveal_at) <= now) {
                    await this.unlockTimeCapsule(c.id);
                }
            }
        } catch (e) { /* silent */ }
    },

    tryUnlockCapsule(capsuleId) {
        var self = this;
        var capsules = this._timeCapsulesData || [];
        var c = capsules.find(function(x) { return x.id === capsuleId; });
        if (!c || c.status !== 'locked') return;
        var now = new Date();
        if ((c.unlock_mode === 'time' || c.unlock_mode === 'both') && c.reveal_at) {
            if (new Date(c.reveal_at) > now) {
                this.showToast('⏰ 还没到解锁时间哦~');
                return;
            }
        }
        if (c.unlock_mode === 'location' || c.unlock_mode === 'both') {
            if (!navigator.geolocation) { this.showToast('设备不支持定位'); return; }
            navigator.geolocation.getCurrentPosition(async function(pos) {
                var dist = self._calcDistance(pos.coords.latitude, pos.coords.longitude, c.reveal_lat, c.reveal_lng);
                if (dist <= (c.reveal_radius || 200)) {
                    await self.unlockTimeCapsule(capsuleId);
                    self.loadTimeCapsules();
                    self.showToast('💌 胶囊已解锁！');
                } else {
                    self.showToast('📍 距离目标还有 ' + Math.round(dist) + ' 米');
                }
            }, function() { self.showToast('无法获取位置'); }, { timeout: 10000 });
            return;
        }
        this.unlockTimeCapsule(capsuleId).then(() => { this.loadTimeCapsules(); this.showToast('💌 胶囊已解锁！'); });
    },

    async unlockTimeCapsule(capsuleId) {
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            await supabase.from('time_capsules').update({
                status: 'unlocked',
                unlocked_by: this.currentUser.username,
                unlocked_at: new Date().toISOString()
            }).eq('id', capsuleId);
        } catch (e) { /* silent */ }
    },

    // 显示时光胶囊详情弹窗
    showCapsuleDetail(capsuleId) {
        var capsules = this._timeCapsulesData || [];
        var c = capsules.find(function(x) { return x.id === capsuleId; });
        if (!c) return;
        var isLocked = c.status === 'locked';
        var isCreator = (c.created_by === 'laoda' && this.currentUser.isLaoda) || (c.created_by === 'xiaodi' && !this.currentUser.isLaoda);
        // 创建者始终可见，对方需解锁后才能看
        var canView = isCreator || !isLocked;
        var self = this;
        var createdLabel = c.created_by === 'laoda' ? '老大' : '小弟';
        var unlockedLabel = c.unlocked_by === 'laoda' ? '老大' : (c.unlocked_by ? '小弟' : '');

        var modal = document.createElement('div');
        modal.className = 'modal-overlay capsule-detail-overlay';
        modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

        var photoHtml = '';
        if (c.photo_storage_path && canView) {
            photoHtml = '<img src="' + self.escapeHtml(c.photo_storage_path) + '" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;margin:12px 0;" onerror="this.style.display=\'none\'">';
        }

        modal.innerHTML = '<div class="modal-sheet" style="max-width:400px;">' +
            '<div style="text-align:center;padding:20px 16px 0;">' +
            '<div style="font-size:48px;margin-bottom:8px;">' + (canView ? (isLocked ? '🔒' : '💌') : '🔐') + '</div>' +
            '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">' + self.escapeHtml(c.title) + '</div>' +
            (isLocked && !isCreator ? '<div style="color:var(--text-muted);font-size:13px;">🔐 ' + createdLabel + ' 封存的秘密，等待解锁...</div>' : '') +
            (isLocked && isCreator ? '<div style="color:var(--text-muted);font-size:13px;">🔒 你的胶囊，尚未被对方解锁</div>' : '') +
            '</div>' +
            '<div style="padding:16px;">' +
            (canView ? '<div style="font-size:15px;line-height:1.8;white-space:pre-wrap;margin-bottom:12px;">' + self.escapeHtml(c.content || '') + '</div>' : '') +
            photoHtml +
            '<div style="font-size:12px;color:var(--text-muted);text-align:center;">' +
            createdLabel + ' 创建 · ' + self.formatRelativeTime(c.created_at) +
            (c.reveal_at ? '<br>⏰ 定时: ' + new Date(c.reveal_at).toLocaleString() : '') +
            (c.reveal_lat ? '<br>📍 定位: ' + c.reveal_lat.toFixed(2) + ', ' + c.reveal_lng.toFixed(2) + ' (±' + (c.reveal_radius || 200) + 'm)' : '') +
            (c.unlocked_at ? '<br>🔓 ' + unlockedLabel + ' 于 ' + self.formatRelativeTime(c.unlocked_at) + ' 解锁' : '') +
            '</div></div>' +
            '<div style="text-align:center;padding:0 16px 20px;">' +
            (!isCreator && isLocked ? '<button class="btn-primary" style="width:100%;border-radius:25px;" onclick="modal.remove();mobile.tryUnlockCapsule(' + c.id + ')">🔓 尝试解锁</button>' : '') +
            (isCreator ? '<div style="display:flex;gap:8px;margin-top:' + (isLocked && !isCreator ? '8px' : '0') + ';">' +
            '<button class="btn-secondary" style="flex:1;border-radius:25px;" onclick="modal.remove();mobile.openEditCapsuleModal(' + c.id + ')">✏️ 编辑</button>' +
            '<button class="btn-danger" style="flex:1;border-radius:25px;" onclick="modal.remove();mobile.deleteTimeCapsule(' + c.id + ')">🗑️ 删除</button>' +
            '</div>' : '') +
            '</div></div>';

        document.body.appendChild(modal);
    },

    // 编辑时光胶囊
    openEditCapsuleModal(capsuleId) {
        var capsules = this._timeCapsulesData || [];
        var c = capsules.find(function(x) { return x.id === capsuleId; });
        if (!c) return;
        var self = this;

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileEditCapsuleModal';
        modal.innerHTML = '<div class="modal-card">' +
            '<h3>✏️ 编辑时光胶囊</h3>' +
            '<div class="form-group"><label>标题</label><input id="mobileEditCapsuleTitle" class="form-input" value="' + self.escapeHtml(c.title) + '"></div>' +
            '<div class="form-group"><label>内容</label><textarea id="mobileEditCapsuleContent" class="form-input" rows="4">' + self.escapeHtml(c.content || '') + '</textarea></div>' +
            '<div class="modal-actions">' +
            '<button class="btn-primary" onclick="mobile.updateTimeCapsule(' + capsuleId + ')">💾 保存</button>' +
            '<button class="btn-secondary" onclick="document.getElementById(\'mobileEditCapsuleModal\').remove()">取消</button></div></div>';
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    },

    // 保存编辑
    async updateTimeCapsule(capsuleId) {
        var titleEl = document.getElementById('mobileEditCapsuleTitle');
        var contentEl = document.getElementById('mobileEditCapsuleContent');
        var title = (titleEl.value || '').trim();
        var content = (contentEl.value || '').trim();
        if (!title) { this.showToast('请输入标题'); return; }
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            await supabase.from('time_capsules').update({ title: title, content: content }).eq('id', capsuleId);
            var modal = document.getElementById('mobileEditCapsuleModal');
            if (modal) modal.remove();
            this.loadTimeCapsules();
            this.showToast('✅ 已保存');
        } catch (e) {
            this.showToast('保存失败');
        }
    },

    // 删除时光胶囊
    async deleteTimeCapsule(capsuleId) {
        var self = this;
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal-card" style="max-width:320px;text-align:center;">' +
            '<div style="font-size:48px;margin-bottom:12px;">🗑️</div>' +
            '<div style="font-size:16px;font-weight:600;margin-bottom:8px;">确定删除这个时光胶囊？</div>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">删除后不可恢复</div>' +
            '<div class="modal-actions">' +
            '<button class="btn-danger" style="flex:1;" onclick="this.closest(\'.modal-overlay\').remove();mobile._doDeleteCapsule(' + capsuleId + ')">确认删除</button>' +
            '<button class="btn-secondary" style="flex:1;" onclick="this.closest(\'.modal-overlay\').remove()">取消</button></div></div>';
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    },

    async _doDeleteCapsule(capsuleId) {
        try {
            var supabase = this.initSupabase();
            if (!supabase) return;
            await supabase.from('time_capsules').delete().eq('id', capsuleId);
            this.loadTimeCapsules();
            this.showToast('🗑️ 已删除');
        } catch (e) {
            this.showToast('删除失败');
        }
    },


    // ========================================
    // 周期追踪
    // ========================================

    async loadPeriodTracker() {
        await this._loadPeriodRecords();
        this._renderPeriodCalendar();
        this._renderPeriodInfo();
        this._renderPeriodRecent();
        this._bindPeriodCalendarEvents();
        if (this._isInDietaryWindow()) {
            await this._loadDietaryCheckins();
        }
        if (typeof this._renderDietaryCard === 'function') this._renderDietaryCard();
    },

    async _loadPeriodRecords() {
        var client = this.initSupabase();
        if (!client) return;

        var year = this._periodCalendarYear;
        var month = this._periodCalendarMonth;
        var startDate = year + '-' + String(month).padStart(2,'0') + '-01';
        var endDateObj = new Date(year, month, 0);
        var endDateStr = year + '-' + String(month).padStart(2,'0') + '-' + String(endDateObj.getDate()).padStart(2,'0');

        var result = await client
            .from('period_daily_records')
            .select('*')
            .gte('record_date', startDate)
            .lte('record_date', endDateStr)
            .order('record_date', { ascending: true });

        this._periodRecords = {};
        if (!result.error && result.data) {
            for (var i = 0; i < result.data.length; i++) {
                this._periodRecords[result.data[i].record_date] = result.data[i];
            }
        }

        // Load last 3 months for prediction
        var threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        var threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

        var allResult = await client
            .from('period_daily_records')
            .select('*')
            .gte('record_date', threeMonthsAgoStr)
            .order('record_date', { ascending: true });

        if (!allResult.error) {
            this._periodAllRecords = allResult.data || [];
        }
    },

    _renderPeriodCalendar() {
        var year = this._periodCalendarYear;
        var month = this._periodCalendarMonth;

        document.getElementById('periodMonthLabel').textContent = year + '年' + month + '月';

        var firstDay = new Date(year, month - 1, 1).getDay();
        var daysInMonth = new Date(year, month, 0).getDate();
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

        var predictedStart = this._getPredictedPeriodStart();
        var ovulationDate = this._getOvulationDate(predictedStart);

        var html = '';
        for (var i = 0; i < firstDay; i++) {
            html += '<div class="period-day empty"></div>';
        }
        for (var d = 1; d <= daysInMonth; d++) {
            var dateStr = year + '-' + String(month).padStart(2,'0') + '-' + String(d).padStart(2,'0');
            var record = this._periodRecords[dateStr];
            var cls = 'period-day';
            if (dateStr === todayStr) cls += ' today';
            if (record && record.is_period) cls += ' period';
            if (dateStr === predictedStart) cls += ' predicted';
            if (dateStr === ovulationDate) cls += ' ovulation';
            html += '<div class="' + cls + '" data-date="' + dateStr + '" onclick="mobile._openPeriodRecordPanel(\'' + dateStr + '\')">' + d + '</div>';
        }
        document.getElementById('periodDaysGrid').innerHTML = html;
    },

    _getPredictedPeriodStart() {
        var records = this._periodAllRecords || [];
        var sortedRecords = records.slice().sort(function(a, b) {
            return a.record_date.localeCompare(b.record_date);
        });

        // Find period segments (consecutive is_period=true days)
        var periodSegments = [];
        var currentSegment = null;

        for (var i = 0; i < sortedRecords.length; i++) {
            var r = sortedRecords[i];
            if (r.is_period) {
                if (!currentSegment) {
                    currentSegment = { start: r.record_date, end: r.record_date };
                } else {
                    var lastDate = new Date(currentSegment.end);
                    var thisDate = new Date(r.record_date);
                    var diffDays = Math.round((thisDate - lastDate) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 1) {
                        currentSegment.end = r.record_date;
                    } else {
                        periodSegments.push(currentSegment);
                        currentSegment = { start: r.record_date, end: r.record_date };
                    }
                }
            } else if (currentSegment) {
                periodSegments.push(currentSegment);
                currentSegment = null;
            }
        }
        if (currentSegment) periodSegments.push(currentSegment);

        if (periodSegments.length < 2) {
            if (periodSegments.length === 1) {
                var lastStart = new Date(periodSegments[periodSegments.length - 1].start);
                lastStart.setDate(lastStart.getDate() + 28);
                return lastStart.toISOString().split('T')[0];
            }
            return null;
        }

        // Average of last 3 intervals
        var intervals = [];
        for (var j = 1; j < periodSegments.length; j++) {
            var prev = new Date(periodSegments[j-1].start);
            var curr = new Date(periodSegments[j].start);
            intervals.push(Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
        }

        var recentIntervals = intervals.slice(-3);
        var avgInterval = Math.round(recentIntervals.reduce(function(a, b) { return a + b; }, 0) / recentIntervals.length);

        var lastSegStart = new Date(periodSegments[periodSegments.length - 1].start);
        lastSegStart.setDate(lastSegStart.getDate() + avgInterval);
        return lastSegStart.toISOString().split('T')[0];
    },

    _getOvulationDate(predictedStart) {
        if (!predictedStart) return null;
        var d = new Date(predictedStart);
        d.setDate(d.getDate() - 14);
        return d.toISOString().split('T')[0];
    },

    _renderPeriodInfo() {
        var records = this._periodAllRecords || [];
        var sortedRecords = records.filter(function(r) { return r.is_period; })
            .sort(function(a, b) { return b.record_date.localeCompare(a.record_date); });

        var phase = '--';
        var dayInCycle = '--';
        var nextDate = '--';
        var countdown = '--';

        if (sortedRecords.length > 0) {
            var lastPeriodStart = new Date(sortedRecords[0].record_date + 'T00:00:00');
            var today = new Date();
            today.setHours(0, 0, 0, 0);

            var diffDays = Math.floor((today - lastPeriodStart) / (1000 * 60 * 60 * 24));
            dayInCycle = diffDays + 1;

            if (dayInCycle <= 7) phase = '经期/卵泡早期';
            else if (dayInCycle <= 14) phase = '卵泡期';
            else if (dayInCycle <= 16) phase = '排卵期';
            else phase = '黄体期';

            var predictedStart = this._getPredictedPeriodStart();
            if (predictedStart) {
                nextDate = predictedStart;
                var predDate = new Date(predictedStart + 'T00:00:00');
                var daysLeft = Math.floor((predDate - today) / (1000 * 60 * 60 * 24));
                if (daysLeft > 0) countdown = '还有 ' + daysLeft + ' 天';
                else if (daysLeft === 0) countdown = '今天';
                else countdown = '已过 ' + Math.abs(daysLeft) + ' 天';
            }
        }

        document.getElementById('periodPhase').textContent = phase;
        document.getElementById('periodDayLabel').textContent = typeof dayInCycle === 'number' ? '第 ' + dayInCycle + ' 天' : '--';
        document.getElementById('periodNextDate').textContent = nextDate;
        document.getElementById('periodCountdown').textContent = countdown;
    },

    _renderPeriodRecent() {
        var list = document.getElementById('periodRecentList');
        var empty = document.getElementById('periodRecentEmpty');
        var allRecords = (this._periodAllRecords || [])
            .filter(function(r) { return r.is_period || (r.symptoms && r.symptoms.length > 0) || r.notes; })
            .sort(function(a, b) { return b.record_date.localeCompare(a.record_date); })
            .slice(0, 10);

        if (allRecords.length === 0) {
            list.innerHTML = '';
            if (empty) {
                list.appendChild(empty);
                empty.style.display = '';
            }
            return;
        }

        if (empty) empty.style.display = 'none';

        var flowLabels = { 0: '', 1: '流量少', 2: '流量中', 3: '流量多' };
        var symptomLabels = {
            '痛经': '😣 痛经', '疲劳': '😴 疲劳', '情绪波动': '😤 情绪波动',
            '头痛': '🤕 头痛', '腰酸': '💢 腰酸', '食欲变化': '🍔 食欲变化',
            '焦虑': '😰 焦虑', '失眠': '🥱 失眠', '排卵期': '✨ 排卵期'
        };

        var html = '';
        for (var i = 0; i < allRecords.length; i++) {
            var r = allRecords[i];
            var displayDate = r.record_date.slice(5);
            var statusText = r.is_period ? '经期 · ' + (flowLabels[r.flow_level] || '') : '';

            html += '<div class="period-record-item">';
            html += '<div class="period-record-date">' + displayDate + '</div>';
            if (statusText) {
                html += '<div class="period-record-body">' + statusText + '</div>';
            }

            var symptoms = r.symptoms || [];
            if (symptoms.length > 0) {
                html += '<div class="period-record-tags">';
                for (var j = 0; j < symptoms.length; j++) {
                    var label = symptomLabels[symptoms[j]] || symptoms[j];
                    html += '<span class="period-record-tag">' + label + '</span>';
                }
                html += '</div>';
            }
            if (r.notes) {
                html += '<div class="period-record-notes">' + r.notes + '</div>';
            }
            html += '</div>';
        }

        list.innerHTML = html;
    },

    _bindPeriodCalendarEvents() {
        var self = this;
        document.getElementById('periodPrevMonth').onclick = function() {
            if (self._periodCalendarMonth === 1) {
                self._periodCalendarYear--;
                self._periodCalendarMonth = 12;
            } else {
                self._periodCalendarMonth--;
            }
            self.loadPeriodTracker();
        };
        document.getElementById('periodNextMonth').onclick = function() {
            if (self._periodCalendarMonth === 12) {
                self._periodCalendarYear++;
                self._periodCalendarMonth = 1;
            } else {
                self._periodCalendarMonth++;
            }
            self.loadPeriodTracker();
        };
        document.getElementById('periodRecordTodayBtn').onclick = function() {
            var today = new Date().toISOString().split('T')[0];
            self._openPeriodRecordPanel(today);
        };
    },

    _openPeriodRecordPanel(dateStr) {
        this._periodEditingDate = dateStr;
        var record = this._periodRecords[dateStr] || { is_period: false, flow_level: 0, symptoms: [], notes: '' };

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'periodRecordModal';
        var self = this;
        modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

        var allSymptoms = ['痛经', '疲劳', '情绪波动', '头痛', '腰酸', '食欲变化', '焦虑', '失眠', '排卵期'];
        var symptomIcons = { '痛经': '😣', '疲劳': '😴', '情绪波动': '😤', '头痛': '🤕', '腰酸': '💢', '食欲变化': '🍔', '焦虑': '😰', '失眠': '🥱', '排卵期': '✨' };

        var flowHTML = '';
        var flowLabels = ['', '💧 少', '💧💧 中', '💧💧💧 多'];
        for (var i = 0; i < flowLabels.length; i++) {
            var sel = i === record.flow_level ? ' selected' : '';
            flowHTML += '<button class="period-flow-btn' + sel + '" data-level="' + i + '" onclick="mobile._onPeriodFlowClick(this)">' + (flowLabels[i] || '无') + '</button>';
        }

        var symptomHTML = '';
        for (var j = 0; j < allSymptoms.length; j++) {
            var s = allSymptoms[j];
            var hasIt = (record.symptoms || []).indexOf(s) >= 0;
            var selCls = hasIt ? ' selected' : '';
            symptomHTML += '<span class="period-symptom-tag' + selCls + '" data-symptom="' + s + '" onclick="mobile._onPeriodSymptomClick(this)">' + symptomIcons[s] + ' ' + s + '</span>';
        }

        modal.innerHTML = '<div class="period-record-panel" onclick="event.stopPropagation()">' +
            '<div class="period-panel-header">' +
                '<button class="period-panel-cancel" onclick="document.getElementById(\'periodRecordModal\').remove()">取消</button>' +
                '<span>' + dateStr + ' · 记录</span>' +
                '<button class="period-panel-save" onclick="mobile._savePeriodRecord()">保存</button>' +
            '</div>' +
            '<div class="period-panel-body">' +
                '<div class="period-panel-section">' +
                    '<div class="period-panel-label">经期状态</div>' +
                    '<div class="period-toggle-group">' +
                        '<button class="period-toggle-btn' + (record.is_period ? ' active' : '') + '" data-value="period" onclick="mobile._onPeriodToggle(this)">🩸 经期中</button>' +
                        '<button class="period-toggle-btn' + (!record.is_period ? ' active' : '') + '" data-value="clean" onclick="mobile._onPeriodToggle(this)">✅ 干净</button>' +
                    '</div>' +
                '</div>' +
                '<div class="period-panel-section period-flow-section" style="display:' + (record.is_period ? '' : 'none') + '">' +
                    '<div class="period-panel-label">流量</div>' +
                    '<div class="period-flow-group">' + flowHTML + '</div>' +
                '</div>' +
                '<div class="period-panel-section">' +
                    '<div class="period-panel-label">症状（可多选）</div>' +
                    '<div class="period-symptom-group">' + symptomHTML + '</div>' +
                '</div>' +
                '<div class="period-panel-section">' +
                    '<div class="period-panel-label">备注</div>' +
                    '<textarea class="period-panel-notes" id="periodPanelNotes" placeholder="记录今天的身体感受...">' + (record.notes || '') + '</textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

        document.body.appendChild(modal);

        this._periodPanelState = {
            isPeriod: record.is_period,
            flowLevel: record.flow_level,
            symptoms: (record.symptoms || []).slice()
        };
    },

    _onPeriodToggle(btn) {
        var value = btn.dataset.value;
        var container = btn.parentElement;
        var buttons = container.querySelectorAll('.period-toggle-btn');
        for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
        btn.classList.add('active');

        this._periodPanelState.isPeriod = (value === 'period');

        var flowSection = btn.closest('.period-record-panel').querySelector('.period-flow-section');
        if (flowSection) flowSection.style.display = (value === 'period') ? '' : 'none';
    },

    _onPeriodFlowClick(btn) {
        var container = btn.parentElement;
        var buttons = container.querySelectorAll('.period-flow-btn');
        for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('selected');
        btn.classList.add('selected');
        this._periodPanelState.flowLevel = parseInt(btn.dataset.level);
    },

    _onPeriodSymptomClick(span) {
        span.classList.toggle('selected');
        var symptom = span.dataset.symptom;
        var idx = this._periodPanelState.symptoms.indexOf(symptom);
        if (idx >= 0) {
            this._periodPanelState.symptoms.splice(idx, 1);
        } else {
            this._periodPanelState.symptoms.push(symptom);
        }
    },

    async _savePeriodRecord() {
        var state = this._periodPanelState;
        var dateStr = this._periodEditingDate;
        var notesEl = document.getElementById('periodPanelNotes');
        var notes = notesEl ? notesEl.value : '';

        var record = {
            user_name: (this.currentUser && this.currentUser.username) ? this.currentUser.username : 'default',
            record_date: dateStr,
            is_period: state.isPeriod,
            flow_level: state.isPeriod ? state.flowLevel : 0,
            symptoms: state.symptoms,
            notes: notes
        };

        var client = this.initSupabase();
        if (!client) return;
        var result = await client
            .from('period_daily_records')
            .upsert(record, { onConflict: 'user_name,record_date' });

        var modal = document.getElementById('periodRecordModal');
        if (modal) modal.remove();

        if (result.error) {
            console.error('保存周期记录失败:', result.error);
            return;
        }

        await this.loadPeriodTracker();
    },

    // ========================================
    // 忌口打卡系统
    // ========================================

    _getDietaryWindow() {
        var predictedStart = this._getPredictedPeriodStart();
        if (!predictedStart) return null;

        var pd = new Date(predictedStart + 'T00:00:00');
        var windowStart = new Date(pd);
        windowStart.setDate(windowStart.getDate() - 3);

        var allRecords = this._periodAllRecords || [];
        var sortedPeriodDays = allRecords
            .filter(function(r) { return r.is_period; })
            .map(function(r) { return r.record_date; })
            .sort();

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var windowEnd;
        if (sortedPeriodDays.length > 0) {
            var lastPeriodDay = sortedPeriodDays[sortedPeriodDays.length - 1];
            if (lastPeriodDay >= windowStart.toISOString().split('T')[0]) {
                windowEnd = new Date(lastPeriodDay + 'T00:00:00');
            } else {
                windowEnd = new Date(pd);
                windowEnd.setDate(windowEnd.getDate() + 5);
            }
        } else {
            windowEnd = new Date(pd);
            windowEnd.setDate(windowEnd.getDate() + 5);
        }

        if (windowEnd < windowStart) {
            windowEnd = new Date(windowStart);
            windowEnd.setDate(windowEnd.getDate() + 5);
        }

        var dates = [];
        var cursor = new Date(windowStart);
        while (cursor <= windowEnd) {
            dates.push(cursor.toISOString().split('T')[0]);
            cursor.setDate(cursor.getDate() + 1);
        }

        return {
            start: windowStart.toISOString().split('T')[0],
            end: windowEnd.toISOString().split('T')[0],
            dates: dates
        };
    },

    _isInDietaryWindow() {
        var w = this._getDietaryWindow();
        if (!w) return false;
        var today = new Date().toISOString().split('T')[0];
        this._dietaryWindowStart = w.start;
        this._dietaryWindowEnd = w.end;
        return today >= w.start && today <= w.end;
    },

    async _loadDietaryCheckins() {
        var w = this._getDietaryWindow();
        if (!w) return;

        var client = this.initSupabase();
        if (!client) return;

        try {
            var result = await client
                .from('dietary_checkins')
                .select('*')
                .gte('checkin_date', w.start)
                .lte('checkin_date', w.end);

            this._dietaryCheckins = {};
            if (!result.error && result.data) {
                for (var i = 0; i < result.data.length; i++) {
                    this._dietaryCheckins[result.data[i].checkin_date] = result.data[i];
                }
            }
        } catch (e) {
            console.warn('加载忌口打卡记录失败:', e.message);
        }
    },

    _getTodayDietaryCheckin() {
        var today = new Date().toISOString().split('T')[0];
        return this._dietaryCheckins[today] || null;
    },

    async _checkDietaryWindowCompletion() {
        var w = this._getDietaryWindow();
        if (!w || w.dates.length === 0) return;

        var today = new Date().toISOString().split('T')[0];
        if (today < w.end) return;

        var completedCycles = this.rpgData.dietary_completed_cycles || [];
        var cycleKey = w.start;
        if (completedCycles.indexOf(cycleKey) >= 0) return;

        await this._loadDietaryCheckins();

        var allDone = true;
        for (var i = 0; i < w.dates.length; i++) {
            var rec = this._dietaryCheckins[w.dates[i]];
            if (!rec || !rec.completed) { allDone = false; break; }
        }

        if (allDone) {
            this.rpgData.dietary_month_count = (this.rpgData.dietary_month_count || 0) + 1;
            completedCycles.push(cycleKey);
            this.rpgData.dietary_completed_cycles = completedCycles;
            await this._saveRPGData();
            this._checkDietaryTitles();
            this.showToast('🎉 恭喜！本月忌口挑战完成！');
        }
    },

    _checkDietaryTitles() {
        var count = this.rpgData.dietary_month_count || 0;
        if (count >= 6) this.unlockTitle('好乖宝宝');
        else if (count >= 3) this.unlockTitle('乖宝宝');
        else if (count >= 1) this.unlockTitle('好宝宝');
    },

    _renderDietaryCard() {
        var card = document.getElementById('dietaryCheckinCard');
        if (!card) return;

        if (!this._isInDietaryWindow()) { card.style.display = 'none'; return; }

        var w = this._getDietaryWindow();
        if (!w) { card.style.display = 'none'; return; }

        var today = new Date().toISOString().split('T')[0];
        var todayRec = this._dietaryCheckins[today];
        var isDone = todayRec && todayRec.completed;

        var todayIdx = w.dates.indexOf(today);
        var totalDays = w.dates.length;

        var self = this;
        var restrictions = CommonUtils.DIETARY_RESTRICTIONS;
        var tagsHTML = restrictions.map(function(item) {
            return '<span class="dietary-tag">🚫 ' + self.escapeHtml(item) + '</span>';
        }).join('');

        if (isDone) {
            card.innerHTML = '<div class="dietary-card dietary-card-done">' +
                '<div class="dietary-card-header">' +
                    '<span class="dietary-card-icon">✅</span>' +
                    '<span class="dietary-card-title">忌口完成</span>' +
                '</div>' +
                '<div class="dietary-card-date">' + today + ' · 今天表现超棒</div>' +
                (todayRec.note ? '<div class="dietary-card-note">"' + this.escapeHtml(todayRec.note) + '"</div>' : '') +
                '<div class="dietary-tags-grid" style="margin-top:8px;">' + tagsHTML + '</div>' +
            '</div>';
        } else {
            card.innerHTML = '<div class="dietary-card dietary-card-pending">' +
                '<div class="dietary-card-header">' +
                    '<span class="dietary-card-icon">🩸</span>' +
                    '<span class="dietary-card-title">经期忌口 · 第 ' + (todayIdx + 1) + ' 天</span>' +
                '</div>' +
                '<div class="dietary-card-date">还剩 ' + (totalDays - todayIdx) + ' 天 · 月经期注意饮食</div>' +
                '<div class="dietary-tags-grid" style="margin:8px 0;">' + tagsHTML + '</div>' +
                '<button class="dietary-card-btn" onclick="mobile._openDietaryCheckinModal()">今日打卡</button>' +
            '</div>';
        }

        card.style.display = 'block';
    },

    _openDietaryCheckinModal() {
        var self = this;
        var today = new Date();
        var todayStr = today.toISOString().split('T')[0];
        var w = this._getDietaryWindow();

        var periodDayText = '';
        if (w) {
            var allRecords = this._periodAllRecords || [];
            var sortedPeriodDays = allRecords
                .filter(function(r) { return r.is_period; })
                .map(function(r) { return r.record_date; })
                .sort();
            if (sortedPeriodDays.length > 0 && sortedPeriodDays.indexOf(todayStr) >= 0) {
                // Find the current period segment (consecutive days containing todayStr)
                var allDates = sortedPeriodDays.slice();
                var todayIdx = allDates.indexOf(todayStr);
                // Walk backward to find segment start
                var segStart = todayIdx;
                while (segStart > 0) {
                    var prevDate = new Date(allDates[segStart - 1] + 'T00:00:00');
                    var currDate = new Date(allDates[segStart] + 'T00:00:00');
                    if ((currDate - prevDate) / (1000 * 60 * 60 * 24) <= 1) {
                        segStart--;
                    } else {
                        break;
                    }
                }
                periodDayText = '经期第 ' + (todayIdx - segStart + 1) + ' 天';
            }
            if (!periodDayText) {
                var startDate = new Date(w.start + 'T00:00:00');
                var diffFromStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
                if (diffFromStart > 0) periodDayText = '窗口第 ' + diffFromStart + ' 天';
            }
        }

        var restrictions = CommonUtils.DIETARY_RESTRICTIONS;
        var tagsHTML = restrictions.map(function(item) {
            return '<span class="dietary-tag">🚫 ' + self.escapeHtml(item) + '</span>';
        }).join('');

        var modal = document.createElement('div');
        modal.className = 'modal-overlay dietary-modal-overlay';
        modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

        modal.innerHTML = '<div class="dietary-checkin-panel" onclick="event.stopPropagation()">' +
            '<div class="dietary-panel-icon">🍽️</div>' +
            '<div class="dietary-panel-title">今日忌口打卡</div>' +
            '<div class="dietary-panel-date">' + todayStr + (periodDayText ? ' · ' + periodDayText : '') + '</div>' +
            '<div class="dietary-restrictions-box">' +
                '<div class="dietary-restrictions-label">今日忌口清单</div>' +
                '<div class="dietary-tags-grid">' + tagsHTML + '</div>' +
            '</div>' +
            '<textarea class="dietary-note-input" id="dietaryNoteInput" placeholder="说点什么...（可选）"></textarea>' +
            '<div class="dietary-panel-actions">' +
                '<button class="dietary-btn-cancel" onclick="document.querySelector(\'.dietary-modal-overlay\').remove()">算了</button>' +
                '<button class="dietary-btn-done" onclick="mobile._doDietaryCheckin()">✅ 完成打卡 +30 XP</button>' +
            '</div>' +
        '</div>';

        document.body.appendChild(modal);
    },

    async _doDietaryCheckin() {
        var self = this;
        var noteEl = document.getElementById('dietaryNoteInput');
        var note = noteEl ? noteEl.value.trim() : '';

        var client = this.initSupabase();
        if (!client) return;

        var todayStr = new Date().toISOString().split('T')[0];
        var record = {
            user_name: (this.currentUser && this.currentUser.username) ? this.currentUser.username : 'default',
            checkin_date: todayStr,
            completed: true,
            note: note || null
        };

        try {
            var result = await client
                .from('dietary_checkins')
                .upsert(record, { onConflict: 'user_name,checkin_date' });

            if (result.error) {
                console.error('忌口打卡失败:', result.error);
                this.showToast('打卡失败，请重试');
                return;
            }

            this._dietaryCheckins[todayStr] = record;
            this._dietaryTodayDone = true;

            var modal = document.querySelector('.dietary-modal-overlay');
            if (modal) modal.remove();

            await this.addXP(30, 'dietary');

            if (typeof this._renderDietaryCard === 'function') this._renderDietaryCard();
            if (typeof this._renderFloatingBall === 'function') this._renderFloatingBall();
            this.showToast('✅ 忌口打卡完成！+30 XP');

            await this._checkDietaryWindowCompletion();
        } catch (e) {
            console.error('忌口打卡出错:', e.message);
            this.showToast('打卡失败');
        }
    },


    // ========================================
    //   游戏中心
    // ========================================

    _activeGame: null,

    loadGameCenter() {
        document.getElementById('mobileGameHubView').style.display = ''
        document.getElementById('mobileGamePlayArea').style.display = 'none'
        if (this._activeGame) {
            this._activeGame.destroy()
            this._activeGame = null
        }
        this.renderMobileGameCards()
        this.loadMobileGameLeaderboard()
    },

    renderMobileGameCards() {
        var container = document.getElementById('mobileGameCards')
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
                (g.available ? ' onclick="mobile.launchGame(\'' + g.id + '\')"' : '') + '>' +
                '<span class="game-card-icon">' + g.icon + '</span>' +
                '<div class="game-card-info">' +
                    '<div class="game-card-title">' + g.title + '</div>' +
                    '<div class="game-card-desc">' + g.desc + '</div>' +
                '</div>' +
                (g.available ? '' : '<span class="game-card-badge">即将推出</span>') +
            '</div>'
        }).join('')
    },

    launchGame: async function (gameName) {
        document.getElementById('mobileGameHubView').style.display = 'none'
        document.getElementById('mobileGamePlayArea').style.display = 'flex'
        var container = document.getElementById('mobileGameContainer')
        container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted);">加载游戏中...</p>'

        var self = this
        if (!window.GameEngine.xpBridge) {
            window.GameEngine.xpBridge = function (amount, reason) {
                self.addXP(amount, reason)
            }
        }
        if (!window.GameEngine.supabaseClient) {
            window.GameEngine.supabaseClient = this.initSupabase()
        }

        await window.GameEngine.ensureGame(gameName)

        var photoUrls = []
        if (gameName === 'memoryCard') {
            try {
                var supabase = this.initSupabase()
                if (supabase) {
                    var result = await supabase.from('photos').select('storage_path').limit(50)
                    var data = (result.data || [])
                    for (var i = data.length - 1; i > 0; i--) {
                        var j = Math.floor(Math.random() * (i + 1))
                        var tmp = data[i]; data[i] = data[j]; data[j] = tmp
                    }
                    var baseUrl = (window.__APP_CONFIG__ && window.__APP_CONFIG__.SUPABASE_STORAGE_URL) ||
                        (window.__APP_CONFIG__ && window.__APP_CONFIG__.SUPABASE_URL + '/storage/v1/object/public/photo/')
                    photoUrls = data.slice(0, 12).map(function (p) {
                        return baseUrl + p.storage_path
                    })
                }
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
            currentUser: this.currentUser,
            photoUrls: photoUrls,
            difficulty: 'normal',
            supabase: this.initSupabase(),
            onScoreSubmit: function (scoreData) {
                self.submitMobileGameScore(gameName, scoreData)
            }
        })
        game.start()
        this._activeGame = game
    },

    closeGame() {
        if (this._activeGame) {
            this._activeGame.destroy()
            this._activeGame = null
        }
        this.loadGameCenter()
    },

    submitMobileGameScore: async function (gameName, scoreData) {
        try {
            var dbGameName = gameName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
            await window.GameEngine.submitScore(dbGameName, scoreData)
        } catch (e) {
            console.warn('[Game] Score submit failed:', e)
        }
    },

    loadMobileGameLeaderboard: async function () {
        var el = document.getElementById('mobileGameLeaderboard')
        if (!el) return
        try {
            var scores = await window.GameEngine.getLeaderboard('memory_card', 10)
            if (!scores || scores.length === 0) {
                el.innerHTML = '<p style="text-align:center;padding:20px;">还没有游戏记录</p>'
                return
            }
            el.innerHTML = scores.map(function (s, i) {
                var name = s.user_name === 'laoda' ? '老大' : (s.user_name === 'xiaodi' ? '小弟' : s.user_name)
                var moves = (s.extra_data && s.extra_data.moves) ? s.extra_data.moves : '-'
                var timeStr = (s.extra_data && s.extra_data.time_seconds) ? window.GameEngine.formatTime(s.extra_data.time_seconds) : '-'
                return '<div style="display:flex;justify-content:space-between;padding:10px 8px;border-bottom:1px solid var(--border-light);font-size:14px;">' +
                    '<span>' + (i + 1) + '. ' + name + '</span>' +
                    '<span style="color:var(--text-muted);font-size:13px;">' + s.score + '分 / ' + moves + '步 / ' + timeStr + '</span>' +
                    '</div>'
            }).join('')
        } catch (e) {
            el.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">排行榜加载失败</p>'
        }
    },

    });
})();
