/* MODULE: timeline-module.js — 纪念日时间线与情感时间轴
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

// ========================================
    // 纪念日时间线
    // ========================================
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

    async migrateMilestonesToSupabase() {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const rows = this.anniversaryMilestones.map(m => ({
                id: this.safeBigint(m.id, Date.now() + Math.floor(Math.random() * 1000)),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photo_id: m.photoId || null,
                photo_path: m.photoPath || null,
                photo_name: m.photoName || null,
                category_id: m.categoryId || null,
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
                id: this.safeBigint(m.id, Date.now()),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photo_id: m.photoId || null,
                photo_path: m.photoPath || null,
                photo_name: m.photoName || null,
                category_id: m.categoryId || null,
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
    // 情感时间轴
    // ========================================

    _timelineHiddenPhotos: new Set(),

    async loadTimelineHiddenPhotos() {
        try { var cached = JSON.parse(localStorage.getItem('timeline_hidden_photos') || '[]'); this._timelineHiddenPhotos = new Set(cached); } catch(e) {}
        var supabase = this.initSupabase();
        if (!supabase) return;
        try {
            var { data } = await supabase.from('app_settings').select('value').eq('key', 'timeline_hidden_photos').maybeSingle();
            if (data && data.value) { var serverList = JSON.parse(data.value); this._timelineHiddenPhotos = new Set(serverList); localStorage.setItem('timeline_hidden_photos', JSON.stringify(serverList)); }
        } catch(e) {}
    },

    async saveTimelineHiddenPhotos() {
        var arr = Array.from(this._timelineHiddenPhotos);
        localStorage.setItem('timeline_hidden_photos', JSON.stringify(arr));
        var supabase = this.initSupabase();
        if (!supabase) return;
        try { await supabase.from('app_settings').upsert({ key: 'timeline_hidden_photos', value: JSON.stringify(arr) }); } catch(e) {}
    },

    async loadEmotionTimeline() {
        var self = this;
        var container = document.getElementById('mobileEmotionTimelineContainer');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载中...</p>';
        await this.loadTimelineHiddenPhotos();
        this._emotionTimelinePage = 1;
        this._emotionTimelineData = [];
        await this.fetchEmotionTimeline();
        this.renderEmotionTimeline();
        this.renderEmotionTimelineFilters();
    },

    async fetchEmotionTimeline() {
        var supabase = this.initSupabase();
        if (!supabase) return;
        var now = new Date();
        var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        var startStr = threeMonthsAgo.toISOString();
        var dateStr = startStr.split('T')[0];
        var items = [];

        try {
            var results = await Promise.allSettled([
                supabase.from('photos').select('id, name, storage_path, created_at, location_name')
                    .gte('created_at', startStr).order('created_at', { ascending: false }).limit(200),
                supabase.from('mood_diary').select('id, mood, content, created_at, user_name')
                    .gte('created_at', startStr).order('created_at', { ascending: false }).limit(100),
                supabase.from('daily_chatter').select('id, content, created_at, user_name')
                    .gte('created_at', startStr).order('created_at', { ascending: false }).limit(100),
                supabase.from('milestones').select('id, title, date, description')
                    .gte('date', dateStr).order('date', { ascending: false }).limit(100),
                supabase.from('couple_checkins').select('id, note, checked_at, user_name, couple_tasks(title)')
                    .gte('checked_at', startStr).order('checked_at', { ascending: false }).limit(100),
                supabase.from('drift_bottles').select('id, message, thrown_at, revealed_at, from_user')
                    .eq('status', 'revealed').gte('revealed_at', startStr)
                    .order('revealed_at', { ascending: false }).limit(50),
                supabase.from('time_capsules').select('id, title, content, created_by, unlocked_at')
                    .eq('status', 'unlocked').gte('unlocked_at', startStr)
                    .order('unlocked_at', { ascending: false }).limit(50)
            ]);

            var self = this;
            if (results[0].status === 'fulfilled' && results[0].value.data) {
                results[0].value.data.forEach(function(p) { if (!self._timelineHiddenPhotos.has(p.id)) { items.push({ type: 'photo', time: p.created_at, data: p }); } });
            }
            if (results[1].status === 'fulfilled' && results[1].value.data) {
                results[1].value.data.forEach(function(m) { items.push({ type: 'mood', time: m.created_at, data: m }); });
            }
            if (results[2].status === 'fulfilled' && results[2].value.data) {
                results[2].value.data.forEach(function(c) { items.push({ type: 'chatter', time: c.created_at, data: c }); });
            }
            if (results[3].status === 'fulfilled' && results[3].value.data) {
                results[3].value.data.forEach(function(m) { items.push({ type: 'milestone', time: m.date, data: m }); });
            }
            if (results[4].status === 'fulfilled' && results[4].value.data) {
                results[4].value.data.forEach(function(c) { items.push({ type: 'checkin', time: c.checked_at, data: c }); });
            }
            if (results[5].status === 'fulfilled' && results[5].value.data) {
                results[5].value.data.forEach(function(b) { items.push({ type: 'bottle', time: b.revealed_at, data: b }); });
            }
            if (results[6].status === 'fulfilled' && results[6].value.data) {
                results[6].value.data.forEach(function(tc) { items.push({ type: 'time_capsule', time: tc.unlocked_at, data: tc }); });
            }
        } catch (e) { /* silent */ }

        items.sort(function(a, b) { return new Date(b.time) - new Date(a.time); });
        this._emotionTimelineData = items;
    },

    renderEmotionTimeline() {
        var container = document.getElementById('mobileEmotionTimelineContainer');
        if (!container) return;
        var self = this;
        var items = this._emotionTimelineData;
        var filters = this._emotionTimelineFilters;
        if (filters) {
            items = items.filter(function(item) { return filters[item.type]; });
        }
        var visible = items.slice(0, this._emotionTimelinePage * 30);

        if (visible.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:60px;">这段时间还没有记录 💭</p>';
            return;
        }

        var html = '';
        var lastDate = '';

        visible.forEach(function(item) {
            var dateStr = new Date(item.time).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
            if (dateStr !== lastDate) {
                lastDate = dateStr;
                html += '<div class="emotion-date-divider emotion-date-divider-mobile"><span>' + dateStr + '</span></div>';
            }
            html += self.renderEmotionItem(item);
        });

        if (visible.length < items.length) {
            html += '<div style="text-align:center;padding:16px;"><button class="btn-secondary" onclick="mobile.loadMoreEmotionTimeline()" style="width:100%;">加载更多</button></div>';
        }

        container.innerHTML = html;
    },

    renderEmotionItem(item) {
        var def = CommonUtils.EMOTION_TYPES.find(function(t) { return t.key === item.type; });
        var icon = def ? def.icon : '📌';
        var data = item.data;
        var timeStr = new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        var inner = '';
        var userLabel = '';

        if (item.type === 'photo') {
            var url = this.getPhotoUrl(data.storage_path);
            inner = '<div class="emotion-photo-wrap"><img src="' + this.escapeHtml(url) + '" class="emotion-photo-thumb" loading="lazy"></div>' +
                '<div class="emotion-photo-name">' + this.escapeHtml(data.name || '照片') + '</div>';
            if (data.location_name) {
                inner += '<div class="emotion-loc">📍 ' + this.escapeHtml(data.location_name) + '</div>';
            }
        } else if (item.type === 'mood') {
            userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
            inner = '<div class="emotion-mood-emoji">' + this.escapeHtml(data.mood || '😊') + '</div>' +
                '<div class="emotion-mood-text">' + this.escapeHtml(data.content || '') + '</div>';
        } else if (item.type === 'chatter') {
            userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
            inner = '<div class="emotion-chatter-text">' + this.escapeHtml(data.content || '') + '</div>';
        } else if (item.type === 'milestone') {
            inner = '<div class="emotion-milestone-title">🎉 ' + this.escapeHtml(data.title || '纪念日') + '</div>';
            if (data.description) { inner += '<div class="emotion-milestone-desc">' + this.escapeHtml(data.description) + '</div>'; }
        } else if (item.type === 'checkin') {
            userLabel = data.user_name === 'laoda' ? '老大' : '小弟';
            var taskTitle = (data.couple_tasks && data.couple_tasks.title) ? data.couple_tasks.title : '打卡';
            inner = '<div class="emotion-checkin-task">✅ ' + this.escapeHtml(taskTitle) + '</div>';
            if (data.note) { inner += '<div class="emotion-checkin-note">' + this.escapeHtml(data.note) + '</div>'; }
        } else if (item.type === 'bottle') {
            userLabel = data.from_user === 'laoda' ? '老大' : '小弟';
            inner = '<div class="emotion-bottle-msg">🍾 ' + this.escapeHtml(data.message || '一张照片') + '</div>';
        } else if (item.type === 'time_capsule') {
            userLabel = data.created_by === 'laoda' ? '老大' : '小弟';
            inner = '<div class="emotion-capsule-title">⏳ ' + this.escapeHtml(data.title || '时光胶囊') + '</div>';
            if (data.content) { inner += '<div class="emotion-capsule-content">' + this.escapeHtml(data.content) + '</div>'; }
        }

        var toggleBtn = '';
        if (item.type === 'photo') {
            var hidden = this._timelineHiddenPhotos.has(data.id);
            toggleBtn = '<span class="emotion-item-delete emotion-item-toggle' + (hidden ? ' emotion-item-hidden' : '') + '" onclick="event.stopPropagation();mobile.toggleTimelinePhotoVisibility(\'' + data.id + '\')" title="' + (hidden ? '重新显示在时间线' : '从时间线隐藏') + '">' + (hidden ? '👁' : '×') + '</span>';
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
    },

    loadMoreEmotionTimeline() {
        this._emotionTimelinePage++;
        this.renderEmotionTimeline();
    },

    async toggleTimelinePhotoVisibility(photoId) {
        var self = this;
        if (this._timelineHiddenPhotos.has(photoId)) {
            // 取消隐藏
            this._timelineHiddenPhotos.delete(photoId);
            await this.saveTimelineHiddenPhotos();
            await this.fetchEmotionTimeline();
            this.renderEmotionTimeline();
            this.showToast('照片已重新显示');
        } else {
            // 从时间轴隐藏
            if (!confirm('要从时间线中隐藏这张照片吗？\n（照片本身不会被删除，仍然在相册中保留）')) return;
            this._timelineHiddenPhotos.add(photoId);
            await this.saveTimelineHiddenPhotos();
            this._emotionTimelineData = this._emotionTimelineData.filter(function(item) {
                return !(item.type === 'photo' && item.data && item.data.id === photoId);
            });
            this.renderEmotionTimeline();
            this.showToast('照片已从时间线隐藏');
        }
    },

    renderEmotionTimelineFilters() {
        var container = document.getElementById('mobileEmotionTimelineTypeFilters');
        if (!container) return;
        var filters = this._emotionTimelineFilters;
        container.innerHTML = CommonUtils.EMOTION_TYPES.map(function(t) {
            var checked = !filters || filters[t.key];
            return '<label class="emotion-filter-chip' + (checked ? ' active' : '') + '" data-type="' + t.key + '">' +
                t.icon + ' ' + t.label + '</label>';
        }).join('');
        var self = this;
        container.querySelectorAll('.emotion-filter-chip').forEach(function(chip) {
            chip.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        });
    },

    toggleEmotionTimelineFilter() {
        var el = document.getElementById('mobileEmotionTimelineFilter');
        if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
    },

    applyEmotionTimelineFilter() {
        var chips = document.querySelectorAll('#mobileEmotionTimelineTypeFilters .emotion-filter-chip');
        var filters = {};
        var allOn = true;
        chips.forEach(function(chip) {
            var type = chip.dataset.type;
            var checked = chip.classList.contains('active');
            filters[type] = checked;
            if (!checked) allOn = false;
        });
        this._emotionTimelineFilters = allOn ? null : filters;
        this._emotionTimelinePage = 1;
        this.renderEmotionTimeline();
        document.getElementById('mobileEmotionTimelineFilter').style.display = 'none';
    },

    resetEmotionTimelineFilter() {
        this._emotionTimelineFilters = null;
        this._emotionTimelinePage = 1;
        this.renderEmotionTimelineFilters();
        this.renderEmotionTimeline();
        document.getElementById('mobileEmotionTimelineFilter').style.display = 'none';
    },

    });
})();
