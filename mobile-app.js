/* ========================================
   照片管理系统 - 手机版 JavaScript
   Typeform 风格移动端应用
   ======================================== */

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

    // Supabase Storage 公开URL前缀（与桌面版一致）
    SUPABASE_URL: 'https://hpwqtlxrfezpnxpgwlsx.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd3F0bHhyZmV6cG54cGd3bHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDk2MzAsImV4cCI6MjA5MTAyNTYzMH0._yAiiFxsZbsOHf9ItMYU9ZRuNLjVDEbdZFwyh7U6C9w',
    STORAGE_URL: 'https://hpwqtlxrfezpnxpgwlsx.supabase.co/storage/v1/object/public/photo/',
    supabase: null,
    
    // 初始化 Supabase 客户端
    initSupabase() {
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
        // 等待 Supabase CDN 加载完成后再初始化
        this.waitForSupabase(() => {
            this.checkLogin();
            this.loadMarkedCategories();
        });
    },

    // ========================================
    // 登录相关
    // ========================================
    checkLogin() {
        const savedUser = localStorage.getItem('photoUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.showPage('home');
            this.loadData();
        } else {
            this.showPage('login');
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        // 简单验证
        if ((username === 'laoda' || username === 'xiaodi') && password === 'lxyajwr06225') {
            this.currentUser = { username, role: username === 'laoda' ? '老大' : '小弟' };
            
            try {
                localStorage.setItem('photoUser', JSON.stringify(this.currentUser));
            } catch (e) {
                console.error('localStorage 写入失败:', e);
                this.showToast('存储失败，请关闭无痕模式');
                return;
            }
            
            // 老大欢迎页
            if (username === 'laoda') {
                this.showToast('🎉 老大生日快乐！');
            }
            
            // 先跳转页面
            this.showPage('home');
            
            // 再加载数据（不阻塞页面显示）
            this.loadData().catch(err => {
                console.error('加载数据失败:', err);
                this.showToast('数据加载失败，请刷新重试');
            });
        } else {
            document.getElementById('loginError').textContent = '账号或密码错误';
        }
    },

    handleLogout() {
        localStorage.removeItem('photoUser');
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
            if (!localStorage.getItem('photoUser')) {
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
        
        feed.innerHTML = pagePhotos.map((photo, index) => `
            <div class="photo-card ${this.selectMode ? 'select-mode' : ''} ${this.selectedPhotos.has(photo.id) ? 'selected' : ''}" 
                 onclick="${this.selectMode ? "mobile.togglePhotoSelect('" + photo.id + "')" : "mobile.openDetail('" + photo.id + "')"}" 
                 style="animation-delay: ${index * 50}ms">
                ${this.selectMode ? `
                    <div class="photo-checkbox">
                        <input type="checkbox" ${this.selectedPhotos.has(photo.id) ? 'checked' : ''} onclick="event.stopPropagation(); mobile.togglePhotoSelect('${photo.id}')">
                    </div>
                ` : ''}
                <img src="${this.getPhotoUrl(photo.storage_path) || 'https://picsum.photos/400/400?random=' + photo.id}" alt="${photo.name}">
                <div class="photo-card-info">
                    <h4>${photo.name || '未命名'}</h4>
                    <p>${photo.description || ''}</p>
                </div>
                ${photo.is_favorite ? '<span class="photo-card-fav">❤️</span>' : ''}
            </div>
        `).join('');
        
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

    toggleFavorite() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (photo) {
            photo.is_favorite = !photo.is_favorite;
            const favBtn = document.getElementById('detailFavoriteBtn');
            favBtn.textContent = photo.is_favorite ? '❤️' : '🤍';
            this.showToast(photo.is_favorite ? '已收藏' : '已取消收藏');
            this.renderPhotos();
        }
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
                const { error: insertError } = await supabase
                    .from('photos')
                    .insert([{
                        name: fileName,
                        description: description,
                        storage_path: uniqueName,
                        original_name: file.name,
                        size: file.size,
                        is_favorite: false
                    }]);
                
                if (insertError) throw insertError;
                successCount++;
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
        
        // 重新加载照片
        await this.loadPhotos();
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
        if (!container) return;
        container.innerHTML = '';
        
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
            const children = this.categories.filter(c => c.parent_id === selectedValue);
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
            const children = this.categories.filter(c => c.parent_id === selectedValue);
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

        list.innerHTML = rootCategories.map(cat => this.renderCategoryItem(cat, 0)).join('');

        if (rootCategories.length === 0) {
            list.innerHTML = '<div class="empty-state"><span class="empty-icon">📁</span><p>暂无分类</p></div>';
        }
    },

    renderCategoryItem(cat, level) {
        const children = this.categories.filter(c => c.parent_id === cat.id);
        const isMarked = this.markedCategories.includes(cat.id);
        const indent = level * 16;
        const hasChildren = children.length > 0;
        const arrow = hasChildren ? '<span class="category-arrow" onclick="event.stopPropagation(); mobile.toggleChildren(\'' + cat.id + '\')">›</span>' : '';
        const icon = level === 0 ? (isMarked ? '⭐' : '📁') : '📄';

        return `
            <div class="category-item" id="cat-${cat.id}" style="padding-left:${indent}px;">
                <div class="category-header" onclick="mobile.toggleCategoryActions('${cat.id}')">
                    <div class="category-name">
                        <span>${icon}</span>
                        <span class="category-name-text">${cat.name}</span>
                        ${arrow}
                    </div>
                </div>
                ${hasChildren ? `
                    <div class="category-children" id="children-${cat.id}">
                        ${children.map(child => this.renderCategoryItem(child, level + 1)).join('')}
                    </div>
                ` : ''}
                <div class="category-actions" id="actions-${cat.id}" style="display:none;">
                    <button class="btn-secondary" onclick="mobile.markCategory('${cat.id}')">
                        ${isMarked ? '⭐ 已标记' : '☆ 标记'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.deleteCategory('${cat.id}')">
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

        const newCat = {
            id: Date.now(),
            name,
            parent_id: parentId ? parseInt(parentId) : null
        };

        this.categories.push(newCat);
        this.updateCategorySelects();
        this.renderCategories();
        this.closeAddCategory();
        this.showToast('分类已添加');
    },

    markCategory(id) {
        if (this.markedCategories.includes(id)) {
            this.markedCategories = this.markedCategories.filter(c => c !== id);
            this.showToast('已取消标记');
        } else {
            this.markedCategories.push(id);
            this.showToast('已标记分类 ⭐');
        }
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        this.renderCategories();
    },

    // 获取分类及其所有子分类的 ID（递归）
    getCategoryAndChildrenIds(categoryId) {
        const ids = [categoryId];
        const children = this.categories.filter(c => c.parent_id === categoryId);
        for (const child of children) {
            ids.push(...this.getCategoryAndChildrenIds(child.id));
        }
        return ids;
    },

    async deleteCategory(id) {
        this.pendingDeleteId = id;
        this.pendingDeleteType = 'category';
        document.getElementById('confirmTitle').textContent = '删除分类';
        document.getElementById('confirmMessage').textContent = '确定要删除这个分类吗？';
        document.getElementById('confirmModal').style.display = 'flex';
    },

    closeConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.pendingDeleteId = null;
        this.pendingDeleteType = null;
    },

    async confirmDelete() {
        if (this.pendingDeleteType === 'category') {
            this.categories = this.categories.filter(c => c.id !== this.pendingDeleteId);
            this.updateCategorySelects();
            this.renderCategories();
            this.showToast('分类已删除');
        } else if (this.pendingDeleteType === 'photo') {
            this.photos = this.photos.filter(p => p.id !== this.pendingDeleteId);
            this.renderPhotos();
            this.showToast('照片已删除');
        } else if (this.pendingDeleteType === 'batch-photo') {
            // 批量删除
            const supabase = this.initSupabase();
            let deletedCount = 0;
            for (const photoId of this.selectedPhotos) {
                try {
                    await supabase.from('photos').delete().eq('id', photoId);
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
        console.log('[DEBUG] 分类及其子分类IDs:', categoryIds);
        
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
        // 模拟留言
        list.innerHTML = `
            <div class="comment-item">
                <div class="comment-text">这个照片真棒！</div>
                <div class="comment-time">刚刚</div>
            </div>
        `;
    },

    async addComment(e) {
        e.preventDefault();
        const input = document.getElementById('mobileCommentInput');
        const text = input.value.trim();
        if (!text) return;

        this.showToast('留言已发送');
        input.value = '';
        this.loadComments(this.currentPhotoId);
    },

    // ========================================
    // 个人页面
    // ========================================
    updateProfile() {
        if (this.currentUser) {
            document.getElementById('userName').textContent = this.currentUser.username;
            document.getElementById('userRole').textContent = this.currentUser.role;
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
        list.innerHTML = this.markedCategories.map(id => {
            const cat = this.categories.find(c => c.id === id);
            if (!cat) return '';
            return `
                <div class="marked-item" onclick="mobile.selectCategory('${id}')">
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
        const checklist = document.getElementById('categoryChecklist');
        checklist.innerHTML = `
            <label class="checkbox-item">
                <input type="checkbox" id="noCategoryCheck">
                <span>未分类</span>
            </label>
        ` + this.categories.map(cat => `
            <label class="checkbox-item">
                <input type="checkbox" value="${cat.id}">
                <span>${cat.name}</span>
            </label>
        `).join('');
        
        document.getElementById('categoryModal').style.display = 'flex';
    },

    closeCategoryModal() {
        document.getElementById('categoryModal').style.display = 'none';
    },

    saveCategoryChange() {
        this.closeCategoryModal();
        this.showToast('分类已更新');
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

    saveEdit() {
        const name = document.getElementById('editPhotoName').value.trim();
        const desc = document.getElementById('editPhotoDesc').value.trim();

        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (photo) {
            photo.name = name;
            photo.description = desc;
            document.getElementById('detailName').textContent = name;
            document.getElementById('detailDesc').textContent = desc;
        }

        this.closeEditModal();
        this.renderPhotos();
        this.showToast('已保存');
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
