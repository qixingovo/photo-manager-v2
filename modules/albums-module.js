/* MODULE: albums-module.js — 相册功能与分享链接
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

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

    });
})();
