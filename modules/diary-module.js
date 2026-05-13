/* MODULE: diary-module.js — 心情日记与每日叨叨
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

// ========================================
    // 心情日记
    // ========================================

    _moodEmojis: CommonUtils.MOOD_EMOJIS,

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
    // 每日叨叨
    // ========================================

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

    });
})();
