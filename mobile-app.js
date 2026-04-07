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
    selectedPhotos: [],
    currentPhotoId: null,
    previewFiles: [],

    // Supabase 配置
    SUPABASE_URL: 'https://hpwqtlxrfezpnxpgwlsx.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHB3dGx4cmZlenBueHBnd2xzeCIsImlhdCI6MTY0MjU4ODI1NCwiZXhwIjoxOTU4MTY0MjU0fQ.D0QWNJgbq0mK1Ld7l3L7MQ6G2QqRIHh7JyJQ58NMrL0',

    // 初始化
    init() {
        this.checkLogin();
        this.loadMarkedCategories();
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

        // 简单验证（实际项目中应该请求后端）
        if ((username === 'laoda' || username === 'xiaodi') && password === 'lxyajwr06225') {
            this.currentUser = { username, role: username === 'laoda' ? '老大' : '小弟' };
            localStorage.setItem('photoUser', JSON.stringify(this.currentUser));
            
            // 老大欢迎页
            if (username === 'laoda') {
                this.showToast('🎉 老大生日快乐！');
            }
            
            this.showPage('home');
            await this.loadData();
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
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(page + 'Page').classList.add('active');

        // 更新底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // 隐藏底部导航在详情页
        const bottomNav = document.getElementById('bottomNav');
        bottomNav.style.display = page === 'detail' ? 'none' : 'flex';
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
            this.loadPhotos()
        ]);
        this.updateCategorySelects();
        this.renderPhotos();
    },

    async loadCategories() {
        // 模拟从 Supabase 加载分类
        // 实际项目中替换为真实的 API 调用
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
            console.log('Using mock categories');
            this.categories = [
                { id: 1, name: '老大小弟之家', parent_id: null },
                { id: 2, name: '日常', parent_id: null },
                { id: 3, name: '游戏', parent_id: null },
                { id: 4, name: '回忆', parent_id: 1 }
            ];
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
            console.log('Using mock photos');
            this.photos = [];
        }
    },

    // ========================================
    // 照片相关
    // ========================================
    renderPhotos() {
        const feed = document.getElementById('photoFeed');
        const empty = document.getElementById('emptyFeed');
        
        if (this.photos.length === 0) {
            feed.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        feed.style.display = 'grid';
        empty.style.display = 'none';

        feed.innerHTML = this.photos.map((photo, index) => `
            <div class="photo-card" onclick="mobile.openDetail(${photo.id})" style="animation-delay: ${index * 50}ms">
                <img src="${photo.storage_path || 'https://picsum.photos/400/400?random=' + photo.id}" alt="${photo.name}">
                <div class="photo-card-info">
                    <h4>${photo.name || '未命名'}</h4>
                    <p>${photo.description || ''}</p>
                </div>
                ${photo.is_favorite ? '<span class="photo-card-fav">❤️</span>' : ''}
            </div>
        `).join('');
    },

    openDetail(photoId) {
        this.currentPhotoId = photoId;
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;

        document.getElementById('detailImage').src = photo.storage_path || 'https://picsum.photos/800/600';
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

        progressSection.style.display = 'block';
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';

        const total = this.previewFiles.length;
        
        for (let i = 0; i < total; i++) {
            const file = this.previewFiles[i];
            const percent = Math.round(((i + 1) / total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';

            // 模拟上传延迟
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 重置
        progressSection.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传照片';

        this.clearPreviews();
        this.showToast(`成功上传 ${total} 张照片`);
        
        // 重新加载照片
        await this.loadPhotos();
        this.renderPhotos();
    },

    // ========================================
    // 分类相关
    // ========================================
    updateCategorySelects() {
        const selects = ['mobileCategorySelect', 'parentCategorySelect', 'mobileFilterCategory'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            
            const hasAllOption = id === 'mobileFilterCategory';
            select.innerHTML = hasAllOption 
                ? '<option value="all">全部分类</option>'
                : '<option value="">选择分类（可选）</option>';
            
            this.categories.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        });
    },

    renderCategories() {
        const list = document.getElementById('categoryList');
        const rootCategories = this.categories.filter(c => !c.parent_id);

        list.innerHTML = rootCategories.map(cat => this.renderCategoryItem(cat)).join('');

        if (rootCategories.length === 0) {
            list.innerHTML = '<div class="empty-state"><span class="empty-icon">📁</span><p>暂无分类</p></div>';
        }
    },

    renderCategoryItem(cat) {
        const children = this.categories.filter(c => c.parent_id === cat.id);
        const isMarked = this.markedCategories.includes(cat.id);

        return `
            <div class="category-item" id="cat-${cat.id}">
                <div class="category-header" onclick="mobile.toggleCategory(${cat.id})">
                    <div class="category-name">
                        <span>${isMarked ? '⭐' : '📁'}</span>
                        <span>${cat.name}</span>
                        ${children.length > 0 ? '<span class="category-arrow">›</span>' : ''}
                    </div>
                </div>
                ${children.length > 0 ? `
                    <div class="category-children">
                        ${children.map(child => `
                            <div class="child-category" onclick="mobile.selectCategory(${child.id})">
                                📄 ${child.name}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="category-actions">
                    <button class="btn-secondary" onclick="mobile.markCategory(${cat.id})">
                        ${isMarked ? '⭐ 已标记' : '☆ 标记'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.deleteCategory(${cat.id})">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        `;
    },

    toggleCategory(id) {
        const item = document.getElementById(`cat-${id}`);
        item.classList.toggle('expanded');
    },

    showAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'flex';
    },

    closeAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'none';
        document.getElementById('newCategoryName').value = '';
        document.getElementById('parentCategorySelect').value = '';
    },

    async createCategory() {
        const name = document.getElementById('newCategoryName').value.trim();
        const parentId = document.getElementById('parentCategorySelect').value;

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

    async deleteCategory(id) {
        if (!confirm('确定要删除这个分类吗？')) return;
        this.categories = this.categories.filter(c => c.id !== id);
        this.updateCategorySelects();
        this.renderCategories();
        this.showToast('分类已删除');
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
        // 实际项目中应该请求后端过滤
        this.renderPhotos();
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
                <div class="marked-item" onclick="mobile.selectCategory(${id})">
                    <span>📁 ${cat.name}</span>
                    <span class="unmark" onclick="event.stopPropagation();mobile.unmarkCategory(${id})">✕</span>
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
        link.href = photo.storage_path || 'https://picsum.photos/800/600';
        link.download = photo.name || 'photo';
        link.click();
    },

    // ========================================
    // 删除照片
    // ========================================
    deletePhoto() {
        if (!confirm('确定要删除这张照片吗？')) return;
        
        this.photos = this.photos.filter(p => p.id !== this.currentPhotoId);
        this.closeDetail();
        this.renderPhotos();
        this.showToast('照片已删除');
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
    }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    mobile.init();
});

// 暴露到全局
window.mobile = mobile;
