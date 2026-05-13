/* MODULE: records-module.js — 情侣打卡、亲密记录与伴侣喜好
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

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
            const hash = await this.sha256(password + (window.__APP_CONFIG__ || {}).PEPPER);
            await supabase.from('app_settings').upsert({ key: 'intimate_password', value: hash });
            return true;
        } catch (e) { return false; }
    },

    async verifyIntimatePassword(input, stored) {
        if (!stored) return false;
        if (stored.length !== 64) {
            if (input === stored) {
                await this.setIntimatePassword(input);
                return true;
            }
            return false;
        }
        return await this.sha256(input + (window.__APP_CONFIG__ || {}).PEPPER) === stored;
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
        } else if (await this.verifyIntimatePassword(input, existingPwd)) {
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
                        ${CommonUtils.MOOD_EMOJIS.map(m => '<button type="button" class="mood-btn" onclick="mobile.selectIntimateMood(\'' + m + '\')">' + m + '</button>').join('')}
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

    });
})();
