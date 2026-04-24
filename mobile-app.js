/* ========================================
   照片管理系统 - 手机版 JavaScript
   Typeform 风格移动端应用
   ======================================== */

const APP_CONFIG = window.__APP_CONFIG__ || {};

const mobile = {
    // 状态
    currentUser: null,
    photos: [],
    categories: [],
    markedCategories: [],
    selectedPhotos: new Set(),
    currentPhotoId: null,
    previewFiles: [],
    pendingDeleteId: null,
    pendingDeleteType: null,
    
    // 分页状态
    currentPage: 1,
    photosPerPage: 6,
    
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
        
        // 老大欢迎页
        if (this.currentUser.isLaoda) {
            this.showToast('🎉 老大生日快乐！');
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

        // 更新底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // 隐藏底部导航在详情页和登录页
        const bottomNav = document.getElementById('bottomNav');
        if (page === 'detail' || page === 'login') {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }
    },

    switchTab(tab) {
        if (tab === 'home') {
            this.showPage('home');
            this.renderPhotos();
        } else if (tab === 'upload') {
            this.showPage('upload');
            this.renderUploadCategoryCascade();
        } else if (tab === 'category') {
            this.showPage('category');
            this.renderCategories();
        } else if (tab === 'profile') {
            this.showPage('profile');
            this.updateProfile();
        }
    },

    // ========================================
    // 数据加载
    // ========================================
    async loadData() {
        await Promise.all([
            this.loadCategories(),
            this.loadPhotos(),
            this.loadAllPhotoCategories()
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

            const response = await fetch(`${this.SUPABASE_URL}/rest/v1/photo_categories?select=*`, {
                headers: {
                    'apikey': this.SUPABASE_KEY,
                    'Authorization': `Bearer ${this.SUPABASE_KEY}`
                }
            });

            if (response.ok) {
                const relations = await response.json();

                this.photoCategories = {};
                relations.forEach(rel => {
                    const pid = String(rel.photo_id);
                    if (!this.photoCategories[pid]) {
                        this.photoCategories[pid] = [];
                    }
                    this.photoCategories[pid].push(String(rel.category_id));
                });

            } else {
                console.error('loadAllPhotoCategories: failed with status', response.status);
            }
        } catch (error) {
            console.warn('加载照片分类关联失败:', error);
            this.photoCategories = {};
        }
    },

    async loadPhotos() {
        try {
            const response = await fetch(`${this.SUPABASE_URL}/rest/v1/photos?select=*&order=created_at.desc`, {
                headers: {
                    'apikey': this.SUPABASE_KEY,
                    'Authorization': `Bearer ${this.SUPABASE_KEY}`
                }
            });
            if (response.ok) {
                this.photos = await response.json();
            }
        } catch (error) {
            console.warn('加载照片失败，使用空列表:', error);
            this.photos = [];
        }
    },

    // ========================================
    // 照片相关
    // ========================================
    renderPhotos() {
        const feed = document.getElementById('photoFeed');
        const empty = document.getElementById('emptyFeed');
        
        const filteredPhotos = this.getFilteredPhotos();
        
        if (filteredPhotos.length === 0) {
            feed.style.display = 'none';
            empty.style.display = 'flex';
            // 更新分页信息
            this.updatePaginationInfo(0, 0, 0);
            return;
        }

        feed.style.display = 'grid';
        empty.style.display = 'none';
        
        // 计算分页
        const totalPages = Math.ceil(filteredPhotos.length / this.photosPerPage);
        
        // 边界保护：当前页不能超过总页数
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages || 1;
        }
        
        const startIndex = (this.currentPage - 1) * this.photosPerPage;
        const endIndex = Math.min(startIndex + this.photosPerPage, filteredPhotos.length);
        const pagePhotos = filteredPhotos.slice(startIndex, endIndex);
        
        feed.innerHTML = pagePhotos.map((photo, index) => {
            const safeName = this.escapeHtml(photo.name || '未命名');
            const safeDesc = this.escapeHtml(photo.description || '');
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
        this.renderLoadMoreButton(totalPages, filteredPhotos.length);
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
            this.renderPhotos();
            this.scrollToTop();
        }
    },

    nextPage() {
        this.currentPage++;
        this.renderPhotos();
        this.scrollToTop();
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
        
        if (this.selectMode) {
            selectBtn.textContent = '❌ 取消';
            selectBtn.classList.add('active');
            batchActions.style.display = 'flex';
            selectedCount.textContent = this.selectedPhotos.size;
        } else {
            selectBtn.textContent = '☑️ 多选';
            selectBtn.classList.remove('active');
            batchActions.style.display = 'none';
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

    confirmBatchDelete() {
        const supabase = this.initSupabase();
        let deletedCount = 0;
        
        this.selectedPhotos.forEach(async (photoId) => {
            try {
                await supabase.from('photos').delete().eq('id', photoId);
                deletedCount++;
            } catch (err) {
                console.error('删除失败:', err);
            }
        });
        
        this.selectedPhotos.clear();
        this.selectMode = false;
        this.updateSelectModeUI();
        this.closeConfirmModal();
        this.showToast(`已删除 ${deletedCount} 张照片`);
        
        // 重新加载
        this.loadPhotos();
    },

    openDetail(photoId) {
        this.currentPhotoId = photoId;
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;

        document.getElementById('detailImage').src = this.getPhotoUrl(photo.storage_path) || 'https://picsum.photos/800/600';
        document.getElementById('detailName').textContent = photo.name || '未命名';
        document.getElementById('detailDesc').textContent = photo.description || '';
        document.getElementById('detailCategory').textContent = photo.category_name || '未分类';
        document.getElementById('detailSize').textContent = photo.formatted_size || '';

        // 更新收藏按钮
        const favBtn = document.getElementById('detailFavoriteBtn');
        favBtn.textContent = photo.is_favorite ? '❤️' : '🤍';

        // 加载留言
        this.loadComments(photoId);

        this.showPage('detail');
    },

    closeDetail() {
        this.showPage('home');
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
                        category_id: categoryId || null
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
        this.renderUploadCategoryCascade();
        this.showToast(`成功上传 ${successCount} 张照片`);

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
        // 切换到首页
        this.switchTab('home');
        
        // 设置筛选器并筛选
        const filterSelect = document.getElementById('mobileFilterCategory');
        if (filterSelect) {
            filterSelect.value = categoryId;
        }
        this.currentCategory = categoryId;
        this.currentPage = 1;
        
        // 更新分类路径显示
        this.updateCategoryPathDisplay();
        
        // 如果 photoCategories 还没加载，先等待加载完成再筛选
        if (Object.keys(this.photoCategories).length === 0 && this.photos.length > 0) {
            this.loadAllPhotoCategories().then(() => {
                this.renderPhotos();
            });
        } else {
            this.renderPhotos();
        }
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
                const photoCats = this.photoCategories[photo.id] || [];
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
        let currentId = categoryId;
        
        // 不断向上查找父类，直到找不到为止
        while (currentId) {
            const cat = this.categories.find(c => c.id === currentId);
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
            const photoCats = this.photoCategories[photo.id] || [];
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
            const photoCats = this.photoCategories[photo.id] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;
        
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
            const photoCats = this.photoCategories[photo.id] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;
        
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
                const photoCats = this.photoCategories[photo.id] || [];
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
            let deletedCount = 0;
            for (const photoId of this.selectedPhotos) {
                try {
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
        const query = document.getElementById('searchInput').value.toLowerCase();
        // 实际项目中应该请求后端过滤
        this.renderPhotos();
    },

    filterByCategory() {
        const categoryId = document.getElementById('mobileFilterCategory').value;


        this.currentCategory = categoryId;
        this.currentPage = 1;
        
        // 更新分类路径显示
        this.updateCategoryPathDisplay();
        
        // 如果 photoCategories 还没加载，先等待加载完成再筛选
        if (Object.keys(this.photoCategories).length === 0 && this.photos.length > 0) {
            this.loadAllPhotoCategories().then(() => {
                this.renderPhotos();
            });
        } else {
            this.renderPhotos();
        }
    },

    getFilteredPhotos() {
        // 如果是"全部分类"，返回所有照片
        if (this.currentCategory === 'all') {
            return this.photos;
        }
        
        // 如果 photoCategories 还没加载（空对象），且不是全部分类，返回空数组
        const photoCatsKeys = Object.keys(this.photoCategories);
        if (photoCatsKeys.length === 0) {
            console.warn('[DEBUG] photoCategories 为空，当前分类:', this.currentCategory, '照片数:', this.photos.length);
            return [];
        }
        
        const categoryId = this.currentCategory;
        
        // 统计每个分类各有几张照片
        const catCount = {};
        Object.entries(this.photoCategories).forEach(([photoId, cats]) => {
            cats.forEach(cat => {
                catCount[cat] = (catCount[cat] || 0) + 1;
            });
        });
        
        console.log('[DEBUG] 筛选照片:', {
            currentCategory: categoryId,
            currentCategoryType: typeof categoryId,
            totalPhotos: this.photos.length,
            photoCategoriesKeysCount: photoCatsKeys.length,
            categoryPhotoCount: catCount[categoryId] || 0
        });
        
        // 打印 photoCategories 里实际的 key 和 value 类型
        const firstEntry = Object.entries(this.photoCategories)[0];
        if (firstEntry) {
            console.log('[DEBUG] photoCategories sample:', {
                photoId: firstEntry[0],
                photoIdType: typeof firstEntry[0],
                catIdSample: firstEntry[1][0],
                catIdType: typeof firstEntry[1][0]
            });
        }
        
        // 获取当前分类及其所有子分类的 ID
        const categoryIds = this.getCategoryAndChildrenIds(categoryId);
        console.log('[DEBUG] 当前选中的分类ID:', categoryId);
        console.log('[DEBUG] 该分类及其子分类IDs:', categoryIds);
        
        // 打印每个目标分类的名字
        const targetCatNames = categoryIds.map(catId => {
            const cat = this.categories.find(c => String(c.id) === String(catId));
            return cat ? cat.name : '未知';
        });
        console.log('[DEBUG] 目标分类名字:', targetCatNames);
        
        // 打印有照片的前5个分类
        const sortedCats = Object.entries(catCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
        console.log('[DEBUG] 有照片的前5个分类:', JSON.stringify(sortedCats));
        
        // 打印 categories 表里的分类（带名字对照）
        const catsWithNames = this.categories.slice(0, 10).map(c => ({id: c.id, name: c.name}));
        console.log('[DEBUG] categories表前10个:', JSON.stringify(catsWithNames));
        
        // 筛选照片：匹配当前分类及其所有子分类
        const filtered = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            // 检查照片是否属于当前分类或其任一子分类
            return categoryIds.some(catId => 
                photoCats.includes(catId) || 
                photoCats.includes(String(catId)) ||
                photoCats.includes(Number(catId))
            );
        });
        
        console.log('[DEBUG] 筛选结果:', filtered.length, '张 (包含子分类)');
        return filtered;
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
        // 显示收藏的照片
        const favorites = this.photos.filter(p => p.is_favorite);
        if (favorites.length === 0) {
            this.showToast('暂无收藏照片');
            return;
        }
        this.photos = favorites;
        this.renderPhotos();
        this.showPage('home');
        this.showToast(`显示 ${favorites.length} 张收藏`);
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
                    <span class="unmark" onclick="event.stopPropagation();mobile.unmarkCategory('${id}')">✕</span>
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
        // 切换到首页并按分类过滤
        this.switchTab('home');
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
        document.getElementById('editModal').style.display = 'flex';
    },

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    },

    async saveEdit() {
        const name = document.getElementById('editPhotoName').value.trim();
        const desc = document.getElementById('editPhotoDesc').value.trim();

        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        try {
            const supabase = this.initSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { error } = await supabase
                .from('photos')
                .update({ name, description: desc })
                .eq('id', this.currentPhotoId);

            if (error) throw error;

            photo.name = name;
            photo.description = desc;
            document.getElementById('detailName').textContent = name;
            document.getElementById('detailDesc').textContent = desc;

            this.closeEditModal();
            this.renderPhotos();
            this.showToast('已保存');
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
            const maxSize = maxSizeMB * 1024 * 1024;
            
            // 如果文件小于限制，直接返回
            if (file.size <= maxSize) {
                resolve(file);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // 计算压缩比例
                    const ratio = Math.sqrt(maxSize / file.size);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob(
                        (blob) => {
                            if (blob.size > file.size) {
                                // 如果压缩后更大，返回原文件
                                resolve(file);
                            } else {
                                // 返回压缩后的文件
                                resolve(new File([blob], file.name, {
                                    type: file.type,
                                    lastModified: Date.now()
                                }));
                            }
                        },
                        file.type,
                        0.85
                    );
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    mobile.init();
});

// 暴露到全局
window.mobile = mobile;
