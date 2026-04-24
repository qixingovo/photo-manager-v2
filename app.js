// ========== 状态变量 ==========
let categories = []
let photos = []
let photoCategories = [] // photo_id -> category_ids 映射
let currentCategory = 'all'
let currentPhoto = null
let showFavoritesOnly = false
let currentComments = []
let selectMode = false
let selectedPhotos = new Set()
let markedCategories = new Set(JSON.parse(localStorage.getItem('markedCategories') || '[]'))
let expandedCategories = new Set()
let expandedInManager = new Set() // 分类管理区域的展开状态

// Supabase 配置（从外部配置文件读取）
const APP_CONFIG = window.__APP_CONFIG__ || {}
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:#f5f6f8;">
            <div style="max-width:540px;width:100%;background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;color:#333;line-height:1.6;">
                <h2 style="margin:0 0 8px 0;">配置缺失</h2>
                <p style="margin:0;">请先创建 <code>config.js</code> 并设置 <code>SUPABASE_URL</code> 与 <code>SUPABASE_ANON_KEY</code>，可参考 <code>config.example.js</code>。</p>
            </div>
        </div>
    `
    throw new Error('缺少 Supabase 配置，请在 config.js 中设置 SUPABASE_URL 和 SUPABASE_ANON_KEY')
}

// 直接初始化 Supabase（CDN 脚本是同步加载的）
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const AUTH_SESSION_KEY = 'photo_manager_session';

function getStoredSession() {
    try {
        const raw = localStorage.getItem(AUTH_SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session?.username || !session?.role) return null;
        return session;
    } catch (error) {
        console.warn('读取本地登录态失败:', error)
        return null;
    }
}

function saveSession(session) {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
    localStorage.removeItem(AUTH_SESSION_KEY);
}

// ========== 初始化 ==========
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function isLaodaFromSession(session) {
    const role = session?.role;
    return role === 'laoda';
}

// 检查登录状态
async function checkLogin() {
    const session = getStoredSession()
    if (session) {
        showMainApp()
        await Promise.all([loadCategories(), loadPhotos()])
    } else {
        showLoginPage()
    }
}

function showLoginPage() {
    document.getElementById('loginPage').style.display = 'flex'
    document.getElementById('mainContainer').style.display = 'none'
}

function showMainApp() {
    document.getElementById('loginPage').style.display = 'none'
    const mainContainer = document.getElementById('mainContainer')
    mainContainer.style.opacity = '0'
    mainContainer.style.display = 'block'
    mainContainer.style.transition = 'opacity 0.6s ease'
    setTimeout(() => {
        mainContainer.style.opacity = '1'
    }, 50)
}

window.handleLogin = async function(e) {
    e.preventDefault()
    
    const account = document.getElementById('loginUsername').value.trim()
    const password = document.getElementById('loginPassword').value
    const errorEl = document.getElementById('loginError')

    if (!account || !password) {
        errorEl.textContent = '请输入账号和密码'
        return
    }

    const { data, error } = await supabase.rpc('authenticate_user', {
        p_username: account,
        p_password: password
    })

    if (error || !data?.success) {
        if (error) console.error('账号登录 RPC 失败:', error)
        errorEl.textContent = '登录失败，请检查账号或密码'
        return
    }

    const session = {
        username: data.username || account,
        role: data.role || 'user'
    }
    saveSession(session)
    errorEl.textContent = ''
    // 如果是老大，显示生日快乐欢迎界面
    if (isLaodaFromSession(session)) {
        showBirthdayWelcome()
    } else {
        showMainApp()
        await Promise.all([loadCategories(), loadPhotos()])
    }
}

function showBirthdayWelcome() {
    const overlay = document.createElement('div')
    overlay.id = 'birthdayOverlay'
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.5s ease;
    `
    
    overlay.innerHTML = `
        <div style="text-align:center;color:white;animation: scaleIn 0.8s ease;position:relative;">
            <div style="font-size:80px;margin-bottom:20px;">🎂</div>
            <h1 style="font-size:2rem;margin-bottom:20px;text-shadow:2px 2px 4px rgba(0,0,0,0.3);">生日快乐！</h1>
            
            <!-- 箭头提示区域 - 放在老大左侧 -->
            <div id="arrowHint" style="position:absolute;top:50%;left:-80px;transform:translateY(-100%);cursor:pointer;animation: arrowPoint 1s infinite;" onclick="hideLaoda()">
                <div style="font-size:3rem;text-shadow:2px 2px 4px rgba(0,0,0,0.3);">➜</div>
            </div>
            
            <h2 id="laodaText" onclick="hideLaoda()" style="font-size:6rem;margin-bottom:10px;font-weight:bold;cursor:pointer;text-shadow:4px 4px 8px rgba(0,0,0,0.3);transition: all 0.3s;display:inline-block;"
                onmouseover="this.style.transform='scale(1.1)'" 
                onmouseout="this.style.transform='scale(1)'">
                老大 🎉
            </h2>
            <p id="prankText" style="font-size:1.5rem;opacity:0;margin-bottom:30px;transition: opacity 0.3s;color:#FFD700;font-weight:bold;"></p>
            <p id="wishText" style="font-size:1.3rem;opacity:0.9;margin-bottom:40px;text-shadow:1px 1px 2px rgba(0,0,0,0.3);">老大万岁万岁万万岁≧▽≦</p>
            <button id="enterBtn" onclick="enterMainApp()" style="
                padding: 15px 50px;
                font-size: 1.2rem;
                background: white;
                color: #764ba2;
                border: none;
                border-radius: 50px;
                cursor: pointer;
                font-weight: bold;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                进入系统 🎈
            </button>
        </div>
        <style>
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fadeOut { to { opacity: 0; } }
            @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes arrowPoint { 0%, 100% { transform: translateY(-100%) translateX(0); } 50% { transform: translateY(-100%) translateX(15px); } }
            @keyframes laodaSpin { to { transform: rotate(720deg) scale(0); opacity: 0; } }
            @keyframes arrowFade { to { opacity: 0; transform: translateY(-100%) scale(0.5); } }
        </style>
    `
    
    document.body.appendChild(overlay)
}

window.hideLaoda = function() {
    const laodaText = document.getElementById('laodaText')
    const arrowHint = document.getElementById('arrowHint')
    const wishText = document.getElementById('wishText')
    const prankText = document.getElementById('prankText')
    
    // 老大旋转消失
    laodaText.style.animation = 'laodaSpin 0.8s ease forwards'
    
    // 箭头逐渐消失
    arrowHint.style.animation = 'arrowFade 0.5s ease forwards'
    
    // 显示小弟文字
    setTimeout(() => {
        laodaText.style.display = 'none'
        arrowHint.style.display = 'none'
        prankText.textContent = '你是小弟嘻嘻嘻'
        prankText.style.opacity = '1'
        prankText.style.fontSize = '2.5rem'
        wishText.style.display = 'none'
    }, 800)
}

window.enterMainApp = function() {
    const overlay = document.getElementById('birthdayOverlay')
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.8s ease forwards'
        document.body.style.transition = 'opacity 0.8s ease'
        document.body.style.opacity = '0'
        
        setTimeout(() => {
            overlay.remove()
            showMainApp()
            document.body.style.opacity = '1'
            loadCategories()
            loadPhotos()
        }, 800)
    }
}

window.handleLogout = function() {
    clearSession()
    showLoginPage()
}

window.toggleSection = function(section) {
    if (section === 'upload') {
        const uploadSection = document.getElementById('uploadSection')
        const categorySection = document.getElementById('categorySection')
        uploadSection.style.display = uploadSection.style.display === 'none' ? 'block' : 'none'
        categorySection.style.display = 'none'
    } else if (section === 'category') {
        const uploadSection = document.getElementById('uploadSection')
        const categorySection = document.getElementById('categorySection')
        categorySection.style.display = categorySection.style.display === 'none' ? 'block' : 'none'
        uploadSection.style.display = 'none'
        // 显示分类管理时，重新渲染父分类选择器
        if (categorySection.style.display === 'block') {
            renderParentCategorySelect()
        }
    }
}

window.toggleMarkCategory = function(catId) {
    if (markedCategories.has(catId)) {
        markedCategories.delete(catId)
    } else {
        markedCategories.add(catId)
    }
    localStorage.setItem('markedCategories', JSON.stringify([...markedCategories]))
    updateMarkedCount()
    renderCategories()
    renderMarkedCategoriesList()
}

function updateMarkedCount() {
    const el = document.getElementById('markedCount')
    if (el) el.textContent = markedCategories.size
}

window.renderMarkedCategoriesList = function() {
    const container = document.getElementById('markedCategoriesList')
    const widget = document.getElementById('markedWidget')
    
    if (!container || !widget) return
    
    if (markedCategories.size === 0) {
        widget.style.display = 'none'
        return
    }
    
    widget.style.display = 'block'
    
    // 显示所有标记的分类，不过滤（因为categories可能还没加载完）
    container.innerHTML = [...markedCategories].map(catId => {
        const cat = categories.find(c => c.id === catId)
        const displayName = cat ? cat.name : '未知分类'
        return `
            <div class="marked-item" onclick="window.filterByCategory('${catId}')">
                <span>${displayName}</span>
                <span class="unmark-btn" onclick="event.stopPropagation(); window.toggleMarkCategory('${catId}')">×</span>
            </div>
        `
    }).join('')
}

window.toggleMarkedCategories = function(event) {
    if (event) event.stopPropagation()
    const widget = document.getElementById('markedWidget')
    if (markedCategories.size === 0) {
        return
    }
    widget.classList.toggle('expanded')
}

async function initApp() {
    await checkLogin();
    
    // 重置筛选状态
    currentCategory = 'all';
    showFavoritesOnly = false;
    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) filterSelect.value = 'all';
    
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadPhotos, 300);
    });
    
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    document.getElementById('editForm').addEventListener('submit', window.handleEdit);
}

async function loadCategories() {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('created_at', { ascending: false })
        
        if (error) throw error
        
        categories = data || []
        
        // 渲染上传表单的级联分类选择器
        renderUploadCategoryCascade()
        
        // 清理已删除的标记分类
        if (markedCategories.size > 0) {
            const validCats = [...markedCategories].filter(catId => {
                return categories.some(c => c.id === catId)
            })
            if (validCats.length !== markedCategories.size) {
                markedCategories = new Set(validCats)
                localStorage.setItem('markedCategories', JSON.stringify(validCats))
                updateMarkedCount()
            }
        }
        
        renderCategories() // 渲染分类管理区域
        renderCategorySelect() // 渲染照片浏览筛选下拉
        renderParentCategorySelect() // 渲染添加分类的级联选择器
        updateMarkedCount()
        renderMarkedCategoriesList()
    } catch (err) {
        console.error('加载分类失败:', err)
    }
}

async function loadPhotos() {
    const search = document.getElementById('searchInput').value
    
    try {
        // 先加载所有照片（不过滤）
        let query = supabase
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
        
        if (showFavoritesOnly) {
            query = query.eq('is_favorite', true)
        }
        
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
        }
        
        const { data, error } = await query
        
        if (error) throw error
        
        photos = data || []
        
        // 先加载所有照片的分类关联
        await loadAllPhotoCategories()
        
        // 如果有分类筛选且有分类数据，才过滤
        if (currentCategory && currentCategory !== 'all' && categories.length > 0) {
            const categoryIds = getCategoryAndChildrenIds(currentCategory)
            if (categoryIds.length > 0) {
                photos = photos.filter(p => {
                    const photoCats = photoCategories[String(p.id)] || []
                    return categoryIds.some(cid => photoCats.includes(String(cid)))
                })
            }
        }
        
        renderCategories()
        renderPhotos()
        updatePhotosTitle()
        updateEmptyState()
    } catch (err) {
        console.error('加载照片失败:', err)
    }
}

function getCategoryAndChildrenIds(categoryId) {
    const ids = [categoryId]
    const children = categories.filter(c => c.parent_id === Number(categoryId))
    children.forEach(child => {
        ids.push(...getCategoryAndChildrenIds(child.id))
    })
    return ids
}

function updatePhotosTitle() {
    const titleEl = document.getElementById('photosTitle')
    if (showFavoritesOnly) {
        titleEl.innerHTML = '❤️ 收藏照片'
    } else if (currentCategory && currentCategory !== 'all') {
        const cat = categories.find(c => c.id === currentCategory)
        let breadcrumb = `<a onclick="clearCategoryFilter()">📷 照片浏览</a>`
        
        if (cat && cat.parent_id) {
            const parent = categories.find(c => c.id === cat.parent_id)
            if (parent) {
                breadcrumb += ` / <a onclick="filterByCategory('${parent.id}')">${parent.name}</a>`
            }
        }
        
        breadcrumb += ` / ${cat ? cat.name : ''}`
        titleEl.innerHTML = breadcrumb
    } else {
        titleEl.innerHTML = '📷 照片浏览'
    }
}

function updateEmptyState() {
    const empty = document.getElementById('emptyState')
    const photoGrid = document.getElementById('photoGrid')
    
    if (photos.length === 0 && currentCategory && currentCategory !== 'all') {
        // 检查当前分类是否有子分类
        const children = categories.filter(c => c.parent_id === currentCategory)
        if (children.length > 0) {
            // 显示子分类提示
            empty.style.display = 'none'
            photoGrid.style.display = 'none'
            
            // 鲜艳颜色数组
            const colors = [
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
                '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
                '#BB8FCE', '#85C1E9', '#F8B500', '#FF6F61'
            ]
            
            // 创建或更新子分类提示区域
            let subcatsEl = document.getElementById('subcategoriesHint')
            if (!subcatsEl) {
                subcatsEl = document.createElement('div')
                subcatsEl.id = 'subcategoriesHint'
                subcatsEl.className = 'subcategories-hint'
                empty.parentNode.insertBefore(subcatsEl, empty)
            }
            
            subcatsEl.innerHTML = `
                <div style="text-align:center;padding:30px;">
                    <div style="display:flex;flex-wrap:wrap;gap:15px;justify-content:center;">
                        ${children.map((child, i) => {
                            const count = photos.filter(p => {
                                const photoCats = photoCategories[String(p.id)] || []
                                return photoCats.includes(String(child.id))
                            }).length
                            const color = colors[i % colors.length]
                            return `<span class="category-tag" onclick="window.filterByCategory('${child.id}')" 
                                style="cursor:pointer;background:${color};color:white;padding:12px 24px;border-radius:25px;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.2);transition:transform 0.2s;"
                                onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                ${child.name} (${count})
                            </span>`
                        }).join('')}
                    </div>
                </div>
            `
            return
        }
    }
    
    // 移除子分类提示
    const subcatsEl = document.getElementById('subcategoriesHint')
    if (subcatsEl) subcatsEl.remove()
}

window.clearCategoryFilter = function() {
    currentCategory = 'all'
    showFavoritesOnly = false
    // 重置级联选择器
    const container = document.getElementById('filterCategoryCascade')
    if (container) {
        const topLevel = categories.filter(c => !c.parent_id)
        container.innerHTML = ''
        const select = document.createElement('select')
        select.id = 'filterCatLevel0'
        select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
        select.onchange = () => onFilterCatLevelChange(0)
        select.innerHTML = `<option value="all">全部分类</option>${topLevel.map(cat => {
            const count = photos.filter(p => {
                const photoCats = photoCategories[String(p.id)] || []
                return photoCats.includes(String(cat.id))
            }).length
            return `<option value="${cat.id}">${cat.name} (${count})</option>`
        }).join('')}`
        container.appendChild(select)
    }
    const favBtn = document.getElementById('favoritesFilterBtn')
    favBtn.classList.remove('active')
    favBtn.textContent = '❤️ 收藏'
    loadPhotos()
}

window.onCategoryFilterChange = function() {
    currentCategory = document.getElementById('filterCategory').value
    loadPhotos()
}

window.toggleFavoritesFilter = function() {
    showFavoritesOnly = !showFavoritesOnly
    const btn = document.getElementById('favoritesFilterBtn')
    if (showFavoritesOnly) {
        btn.classList.add('active')
        btn.textContent = '💔 取消收藏'
        currentCategory = 'all'
        document.getElementById('filterCategory').value = 'all'
    } else {
        btn.classList.remove('active')
        btn.textContent = '❤️ 收藏'
    }
    loadPhotos()
}

window.toggleFavorite = async function() {
    if (!currentPhoto) return
    
    try {
        const newFavorite = !currentPhoto.is_favorite
        const { error } = await supabase
            .from('photos')
            .update({ is_favorite: newFavorite })
            .eq('id', currentPhoto.id)
        
        if (error) throw error
        
        currentPhoto.is_favorite = newFavorite
        updateFavoriteButton()
        
        if (showFavoritesOnly && !newFavorite) {
            loadPhotos()
        }
    } catch (err) {
        alert('操作失败: ' + err.message)
    }
}

window.toggleSelectMode = function() {
    selectMode = !selectMode
    selectedPhotos.clear()
    
    const selectBtn = document.getElementById('selectModeBtn')
    const selectAllBtn = document.getElementById('selectAllBtn')
    const batchCategoryBtn = document.getElementById('batchCategoryBtn')
    const batchBtn = document.getElementById('batchDeleteBtn')
    
    if (selectMode) {
        selectBtn.classList.add('active')
        selectBtn.textContent = '❌ 取消'
        selectAllBtn.style.display = 'inline-block'
        batchCategoryBtn.style.display = 'inline-block'
        batchBtn.style.display = 'inline-block'
    } else {
        selectBtn.classList.remove('active')
        selectBtn.textContent = '☑️ 多选'
        selectAllBtn.style.display = 'none'
        batchCategoryBtn.style.display = 'none'
        batchBtn.style.display = 'none'
    }
    
    renderPhotos()
}

window.togglePhotoSelect = function(photoId) {
    if (selectedPhotos.has(photoId)) {
        selectedPhotos.delete(photoId)
    } else {
        selectedPhotos.add(photoId)
    }
    
    document.getElementById('selectedCount').textContent = selectedPhotos.size
    renderPhotos()
}

window.batchDeletePhotos = async function() {
    if (selectedPhotos.size === 0) {
        alert('请先选择要删除的照片')
        return
    }
    
    if (!confirm(`确定删除选中的 ${selectedPhotos.size} 张照片？`)) return
    
    let successCount = 0
    let failCount = 0
    
    for (const photoId of selectedPhotos) {
        const photo = photos.find(p => p.id === photoId)
        if (!photo) continue
        
        try {
            // 删除存储文件
            await supabase.storage
                .from('photo')
                .remove([photo.storage_path])
            
            // 删除关联
            await supabase
                .from('photo_categories')
                .delete()
                .eq('photo_id', photoId)
            
            // 删除留言
            await supabase
                .from('comments')
                .delete()
                .eq('photo_id', photoId)
            
            // 删除记录
            await supabase
                .from('photos')
                .delete()
                .eq('id', photoId)
            
            successCount++
        } catch (err) {
            console.error('删除失败:', photoId, err)
            failCount++
        }
    }
    
    selectedPhotos.clear()
    toggleSelectMode()
    await loadPhotos()
    await loadCategories()
    
    if (failCount === 0) {
        alert(`删除成功！${successCount}张照片已删除`)
    } else {
        alert(`删除完成：${successCount}张成功，${failCount}张失败`)
    }
}

window.selectAllPhotos = function() {
    if (selectedPhotos.size === photos.length) {
        // 取消全选
        selectedPhotos.clear()
    } else {
        // 全选
        photos.forEach(p => selectedPhotos.add(p.id))
    }
    document.getElementById('selectedCount').textContent = selectedPhotos.size
    renderPhotos()
}

window.openBatchCategoryModal = function() {
    if (selectedPhotos.size === 0) {
        alert('请先选择要操作的照片')
        return
    }
    
    document.getElementById('batchPhotoCount').textContent = selectedPhotos.size
    
    // 加载分类列表
    const container = document.getElementById('batchCategoryList')
    container.innerHTML = categories.map(cat => `
        <label class="category-option">
            <input type="checkbox" name="batchCategory" value="${cat.id}">
            <span>${cat.name}</span>
        </label>
    `).join('')
    
    document.getElementById('batchCategoryModal').classList.add('active')
}

window.closeBatchCategoryModal = function() {
    document.getElementById('batchCategoryModal').classList.remove('active')
}

window.batchAddCategories = async function() {
    const checkboxes = document.querySelectorAll('input[name="batchCategory"]:checked')
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value)
    
    if (selectedCategories.length === 0) {
        alert('请选择要添加的分类')
        return
    }
    
    let successCount = 0
    
    for (const photoId of selectedPhotos) {
        try {
            // 获取当前分类
            const currentCats = photoCategories[String(photoId)] || []
            
            // 添加新分类
            const newCats = [...new Set([...currentCats, ...selectedCategories])]
            
            // 删除旧的关联
            await supabase
                .from('photo_categories')
                .delete()
                .eq('photo_id', photoId)
            
            // 添加新的关联
            if (newCats.length > 0) {
                const inserts = newCats.map(cid => ({
                    photo_id: photoId,
                    category_id: cid
                }))
                await supabase
                    .from('photo_categories')
                    .insert(inserts)
            }
            
            successCount++
        } catch (err) {
            console.error('添加分类失败:', photoId, err)
        }
    }
    
    closeBatchCategoryModal()
    await loadAllPhotoCategories()
    await loadPhotos()
    await loadCategories()
    
    alert(`成功为 ${successCount} 张照片添加分类`)
}

window.batchRemoveCategories = async function() {
    const checkboxes = document.querySelectorAll('input[name="batchCategory"]:checked')
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value)
    
    if (selectedCategories.length === 0) {
        alert('请选择要移除的分类')
        return
    }
    
    let successCount = 0
    
    for (const photoId of selectedPhotos) {
        try {
            // 移除选中的分类
            for (const catId of selectedCategories) {
                await supabase
                    .from('photo_categories')
                    .delete()
                    .eq('photo_id', photoId)
                    .eq('category_id', catId)
            }
            
            successCount++
        } catch (err) {
            console.error('移除分类失败:', photoId, err)
        }
    }
    
    closeBatchCategoryModal()
    await loadAllPhotoCategories()
    await loadPhotos()
    await loadCategories()
    
    alert(`成功从 ${successCount} 张照片移除分类`)
}

function updateFavoriteButton() {
    const btn = document.getElementById('favoriteBtn')
    if (currentPhoto && currentPhoto.is_favorite) {
        btn.textContent = '❤️ 已收藏'
    } else {
        btn.textContent = '🤍 收藏'
    }
}

// 渲染分类管理区域（层级结构）
function renderCategories() {
    const container = document.getElementById('categoryList')
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>'
        return
    }
    
    // 获取顶级分类（没有父分类的）
    const topLevel = categories.filter(c => !c.parent_id)
    
    container.innerHTML = topLevel.map(parent => renderCategoryItem(parent, 0)).join('')
}

// 渲染照片浏览的分类下拉（扁平列表）
function renderCategorySelect() {
    const container = document.getElementById('filterCategoryCascade')
    if (!container) return
    container.innerHTML = ''
    
    const topLevel = categories.filter(c => !c.parent_id)
    if (topLevel.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:12px;">暂无分类</p>'
        return
    }
    
    // 创建第一级选择器
    const select = document.createElement('select')
    select.id = 'filterCatLevel0'
    select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
    select.onchange = () => onFilterCatLevelChange(0)
    select.innerHTML = `<option value="all">全部分类</option>${topLevel.map(cat => {
        const count = photos.filter(p => {
            const photoCats = photoCategories[String(p.id)] || []
            return photoCats.includes(String(cat.id))
        }).length
        return `<option value="${cat.id}">${cat.name} (${count})</option>`
    }).join('')}`
    container.appendChild(select)
    
    // 如果之前已选择了某个分类，需要重建选择器层级
    if (currentCategory && currentCategory !== 'all') {
        rebuildFilterCascade(currentCategory)
    }
}

function rebuildFilterCascade(categoryId) {
    // 找到该分类的父路径
    const path = getCategoryPath(categoryId)
    const container = document.getElementById('filterCategoryCascade')
    if (!container) return
    container.innerHTML = ''
    
    let parentId = null
    path.forEach((catId, index) => {
        const level = index
        const cats = index === 0 
            ? categories.filter(c => !c.parent_id)
            : categories.filter(c => c.parent_id === parentId)
        
        const select = document.createElement('select')
        select.id = `filterCatLevel${level}`
        select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
        select.onchange = () => onFilterCatLevelChange(level)
        
        const selectedValue = index === path.length - 1 ? catId : ''
        select.innerHTML = `<option value="">选择分类</option>${cats.map(cat => {
            const count = photos.filter(p => {
                const photoCats = photoCategories[String(p.id)] || []
                return photoCats.includes(String(cat.id))
            }).length
            const selected = cat.id === catId ? 'selected' : ''
            return `<option value="${cat.id}" ${selected}>${cat.name} (${count})</option>`
        }).join('')}`
        container.appendChild(select)
        parentId = catId
    })
}

function getCategoryPath(categoryId) {
    const path = []
    let current = categories.find(c => c.id === categoryId)
    while (current) {
        path.unshift(current.id)
        current = current.parent_id ? categories.find(c => c.id === current.parent_id) : null
    }
    return path
}

function onFilterCatLevelChange(level) {
    const container = document.getElementById('filterCategoryCascade')
    if (!container) return
    
    const select = document.getElementById(`filterCatLevel${level}`)
    if (!select) return
    
    const selectedValue = select.value
    
    // 删除高于当前级别的选择器
    const selects = container.querySelectorAll('select')
    selects.forEach((s, i) => {
        if (i > level) s.remove()
    })
    
    // 如果选择了"全部分类"，重置为 all
    if (selectedValue === 'all') {
        currentCategory = 'all'
        loadPhotos() // 重新加载所有照片
        return
    }
    
    // 如果选中了某个分类，显示其子分类作为下一级
    if (selectedValue) {
        currentCategory = selectedValue
        const children = categories.filter(c => c.parent_id === selectedValue)
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `filterCatLevel${nextLevel}`
            nextSelect.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
            nextSelect.onchange = () => onFilterCatLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => {
                const count = photos.filter(p => {
                    const photoCats = photoCategories[String(p.id)] || []
                    return photoCats.includes(String(cat.id))
                }).length
                return `<option value="${cat.id}">${cat.name} (${count})</option>`
            }).join('')}`
            container.appendChild(nextSelect)
        }
        loadPhotos() // 重新加载照片
    }
}


function renderCategoryItem(cat, level) {
    const children = categories.filter(c => c.parent_id === cat.id)
    const isActive = currentCategory === cat.id ? 'active' : ''
    const hasChildren = children.length > 0
    const indent = level * 16 // 每层缩进
    const isMarked = markedCategories.has(cat.id)
    
    // 计算该分类的照片数量
    const count = photos.filter(p => {
        const photoCats = photoCategories[String(p.id)] || []
        return photoCats.includes(String(cat.id))
    }).length
    
    // 获取当前展开状态（使用管理区域的展开状态）
    const isExpanded = expandedInManager.has(cat.id)
    const arrow = hasChildren ? (isExpanded ? ' ▼' : ' ▶') : ''
    
    const childrenHtml = hasChildren ? `
        <div class="category-children" id="mgr-children-${cat.id}" style="display:${isExpanded ? 'flex' : 'none'};">
            ${children.map(child => renderCategoryItem(child, level + 1)).join('')}
        </div>
    ` : ''
    
    // 点击标签文字 - 在管理区域只是选中效果，不筛选
    const mainOnclick = `window.filterByCategoryInManager('${cat.id}')`
    
    // 点击箭头展开/收起子分类
    const arrowOnclick = hasChildren 
        ? `event.stopPropagation(); window.toggleCategoryInManager('${cat.id}')` 
        : ''
    
    return `
        <div class="category-item" style="padding-left:${indent}px;">
            <div class="category-tag ${isActive}" onclick="${mainOnclick}">
                <span class="cat-name">${cat.name}</span>
                ${hasChildren ? `<span class="cat-arrow" onclick="${arrowOnclick}">${arrow}</span>` : ''}
                <span class="count">${count}</span>
                <button onclick="event.stopPropagation(); window.openEditCategoryModal('${cat.id}', '${cat.name}')" title="编辑" style="background:none;border:none;cursor:pointer;padding:0 2px;">✏️</button>
                <button class="btn-danger" onclick="event.stopPropagation(); window.deleteCategory('${cat.id}')" title="删除">×</button>
            </div>
            ${childrenHtml}
        </div>
    `
}

// 切换分类管理区域的展开状态
window.toggleCategoryInManager = function(catId) {
    if (expandedInManager.has(catId)) {
        expandedInManager.delete(catId)
    } else {
        expandedInManager.add(catId)
    }
    renderCategories()
}

// 分类管理区域点击分类（只是视觉选中，不筛选照片）
window.filterByCategoryInManager = function(categoryId) {
    currentCategory = categoryId
    loadPhotos()
}

window.toggleCategoryChildren = function(catId, event) {
    if (event) event.stopPropagation()
    
    if (expandedCategories.has(catId)) {
        expandedCategories.delete(catId)
    } else {
        expandedCategories.add(catId)
    }
    
    // 直接操作 DOM 而不是重新渲染
    const childrenEl = document.getElementById('children-' + catId)
    if (childrenEl) {
        if (expandedCategories.has(catId)) {
            childrenEl.classList.add('show')
        } else {
            childrenEl.classList.remove('show')
        }
    }
    
    // 更新箭头
    renderCategories()
}

window.filterByCategory = function(categoryId) {
    currentCategory = categoryId
    rebuildFilterCascade(categoryId)
    loadPhotos()
}

// 刷新所有数据
window.refreshData = async function() {
    // 显示加载状态
    const btn = document.querySelector('.nav-section[onclick="window.refreshData()"] .nav-icon')
    if (btn) btn.textContent = '⏳'
    
    try {
        // 并行加载分类和照片
        await Promise.all([
            loadCategories(),
            loadPhotos()
        ])
    } catch (err) {
        console.error('刷新失败:', err)
        alert('刷新失败，请稍后重试')
    }
    
    // 恢复按钮状态
    if (btn) btn.textContent = '🔄'
}

// 级联选择器：渲染父分类选择器
function renderParentCategorySelect() {
    const container = document.getElementById('parentCategoryCascade')
    if (!container) return
    container.innerHTML = ''
    
    const topLevel = categories.filter(c => !c.parent_id)
    if (topLevel.length === 0) return
    
    const select = document.createElement('select')
    select.id = 'parentLevel0'
    select.className = 'category-select'
    select.onchange = () => window.onParentLevelChange(0)
    select.innerHTML = `<option value="">作为顶级分类</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
    container.appendChild(select)
}

window.onParentLevelChange = function(level) {
    const container = document.getElementById('parentCategoryCascade')
    const select = document.getElementById(`parentLevel${level}`)
    if (!select) return
    
    const selectedValue = select.value
    
    // 删除高于当前级别的选择器
    const selects = container.querySelectorAll('select')
    selects.forEach((s, i) => {
        if (i > level) s.remove()
    })
    
    // 如果选中了某个分类，显示其子分类作为下一级
    if (selectedValue) {
        const children = categories.filter(c => c.parent_id === selectedValue)
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `parentLevel${nextLevel}`
            nextSelect.className = 'category-select'
            nextSelect.onchange = () => window.onParentLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
            container.appendChild(nextSelect)
        }
    }
}

window.getSelectedParentId = function() {
    const container = document.getElementById('parentCategoryCascade')
    if (!container) return null
    const selects = container.querySelectorAll('select')
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value
    }
    return null
}

// 上传表单的级联分类选择器
function renderUploadCategoryCascade() {
    const container = document.getElementById('uploadCategoryCascade')
    if (!container) return
    container.innerHTML = ''
    
    const topLevel = categories.filter(c => !c.parent_id)
    if (topLevel.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类，请先在分类管理中添加</p>'
        return
    }
    
    const select = document.createElement('select')
    select.id = 'uploadCatLevel0'
    select.className = 'category-select'
    select.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;'
    select.onchange = () => window.onUploadCatLevelChange(0)
    select.innerHTML = `<option value="">选择分类（可选）</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
    container.appendChild(select)
}

window.onUploadCatLevelChange = function(level) {
    const container = document.getElementById('uploadCategoryCascade')
    if (!container) return
    const select = document.getElementById(`uploadCatLevel${level}`)
    if (!select) return
    
    const selectedValue = select.value
    
    // 删除高于当前级别的选择器
    const selects = container.querySelectorAll('select')
    selects.forEach((s, i) => {
        if (i > level) s.remove()
    })
    
    // 如果选中了某个分类，显示其子分类作为下一级
    if (selectedValue) {
        const children = categories.filter(c => c.parent_id === selectedValue)
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `uploadCatLevel${nextLevel}`
            nextSelect.className = 'category-select'
            nextSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;'
            nextSelect.onchange = () => window.onUploadCatLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
            container.appendChild(nextSelect)
        }
    }
}

window.getSelectedUploadCategoryId = function() {
    const container = document.getElementById('uploadCategoryCascade')
    if (!container) return null
    const selects = container.querySelectorAll('select')
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value
    }
    return null
}

window.createCategory = async function() {
    const input = document.getElementById('newCategory')
    const name = input.value.trim()
    const parentId = window.getSelectedParentId()
    
    if (!name) {
        alert('请输入分类名称')
        return
    }
    
    try {
        const { data, error } = await supabase
            .from('categories')
            .insert([{ name, parent_id: parentId || null }])
            .select()
            .single()
        
        if (error) throw error
        
        input.value = ''
        // 重置父分类选择器
        renderParentCategorySelect()
        await loadCategories()
    } catch (err) {
        alert('创建分类失败: ' + err.message)
    }
}

window.deleteCategory = async function(id) {
    if (!confirm('确定删除该分类？照片不会删除')) return
    
    try {
        // 删除分类
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        
        // 删除该分类的关联
        await supabase
            .from('photo_categories')
            .delete()
            .eq('category_id', id)
        
        if (currentCategory === id) {
            currentCategory = 'all'
        }
        
        await loadCategories()
        await loadPhotos()
    } catch (err) {
        alert('删除分类失败: ' + err.message)
    }
}

window.openEditCategoryModal = function(id, name) {
    document.getElementById('editCategoryId').value = id
    document.getElementById('editCategoryName').value = name
    
    // 设置标记按钮状态
    const markBtn = document.getElementById('editMarkBtn')
    const isMarked = markedCategories.has(id)
    markBtn.textContent = isMarked ? '⭐ 已标记' : '☆ 标记'
    markBtn.style.color = isMarked ? '#FFD700' : '#FFD700'
    
    document.getElementById('editCategoryModal').classList.add('active')
}

window.toggleMarkInEdit = function() {
    const id = document.getElementById('editCategoryId').value
    if (!id) return
    
    if (markedCategories.has(id)) {
        markedCategories.delete(id)
    } else {
        markedCategories.add(id)
    }
    localStorage.setItem('markedCategories', JSON.stringify([...markedCategories]))
    updateMarkedCount()
    renderMarkedCategoriesList()
    
    // 更新按钮状态
    const markBtn = document.getElementById('editMarkBtn')
    if (markBtn) {
        const isMarked = markedCategories.has(id)
        markBtn.textContent = isMarked ? '⭐ 已标记' : '☆ 标记'
    }
}

window.closeEditCategoryModal = function() {
    document.getElementById('editCategoryModal').classList.remove('active')
}

window.saveCategoryName = async function(e) {
    e.preventDefault()
    
    const id = document.getElementById('editCategoryId').value
    const name = document.getElementById('editCategoryName').value.trim()
    
    if (!name) {
        alert('分类名称不能为空')
        return
    }
    
    try {
        const { error } = await supabase
            .from('categories')
            .update({ name })
            .eq('id', id)
        
        if (error) throw error
        
        closeEditCategoryModal()
        await loadCategories()
    } catch (err) {
        alert('保存失败: ' + err.message)
    }
}

async function handleUpload(e) {
    e.preventDefault()
    
    const fileInput = document.getElementById('photoInput')
    const files = fileInput.files
    
    if (files.length === 0) {
        alert('请选择照片')
        return
    }
    
    const namePrefix = document.getElementById('photoName').value.trim()
    const description = document.getElementById('photoDesc').value.trim()
    const categoryId = window.getSelectedUploadCategoryId()
    
    const progressContainer = document.getElementById('uploadProgress')
    const progressFill = document.getElementById('progressFill')
    const progressText = document.getElementById('progressText')
    const btn = e.target.querySelector('button[type="submit"]')
    
    progressContainer.style.display = 'flex'
    btn.disabled = true
    btn.textContent = '上传中...'
    
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileName = namePrefix ? `${namePrefix}_${i + 1}` : file.name
        
        try {
            // 压缩超过1.5MB的图片
            let fileToUpload = file
            if (file.size > 1.5 * 1024 * 1024) {
                fileToUpload = await compressImage(file, 1.5)
            }
            
            const ext = fileToUpload.name.split('.').pop()
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
            
            const { error: uploadError } = await supabase.storage
                .from('photo')
                .upload(uniqueName, fileToUpload, {
                    cacheControl: '3600',
                    upsert: false
                })
            
            if (uploadError) throw uploadError
            
            const { data: photoData, error: insertError } = await supabase
                .from('photos')
                .insert([{
                    name: fileName,
                    description,
                    storage_path: uniqueName,
                    original_name: file.name,
                    size: fileToUpload.size,
                    is_favorite: false
                }])
                .select()
                .single()
            
            if (insertError) throw insertError
            
            // 如果选择了分类，添加关联
            if (categoryId) {
                await supabase
                    .from('photo_categories')
                    .insert([{ photo_id: photoData.id, category_id: categoryId }])
            }
            
            successCount++
        } catch (err) {
            console.error('上传失败:', file.name, err)
            failCount++
        }
        
        const progress = Math.round(((i + 1) / files.length) * 100)
        progressFill.style.width = `${progress}%`
        progressText.textContent = `${progress}%`
    }
    
    progressContainer.style.display = 'none'
    progressFill.style.width = '0%'
    btn.disabled = false
    btn.textContent = '上传'
    
    fileInput.value = ''
    document.getElementById('photoName').value = ''
    document.getElementById('photoDesc').value = ''
    renderUploadCategoryCascade()
    
    await loadPhotos()
    await loadCategories()
    
    if (failCount === 0) {
        alert(`上传成功！${successCount}张照片已上传`)
    } else {
        alert(`上传完成：${successCount}张成功，${failCount}张失败`)
    }
}

// 压缩图片到目标大小（单位MB）
async function compressImage(file, maxSizeMB) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        
        img.onload = () => {
            let quality = 0.9
            let minQuality = 0.1
            let width = img.width
            let height = img.height
            
            canvas.width = width
            canvas.height = height
            ctx.drawImage(img, 0, 0)
            
            // 迭代压缩直到文件小于目标大小
            const compress = () => {
                const dataUrl = canvas.toDataURL('image/jpeg', quality)
                const size = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
                
                if (size <= maxSizeMB * 1024 * 1024 || quality <= minQuality) {
                    // 转换为Blob
                    fetch(dataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
                        })
                    return
                }
                
                quality -= 0.1
                if (quality > minQuality) {
                    compress()
                } else {
                    // 如果还是太大，缩小图片尺寸
                    if (width > 800) {
                        width = Math.round(width * 0.8)
                        height = Math.round(height * 0.8)
                        canvas.width = width
                        canvas.height = height
                        ctx.drawImage(img, 0, 0, width, height)
                        quality = 0.7
                    }
                    compress()
                }
            }
            
            compress()
        }
        
        img.src = URL.createObjectURL(file)
    })
}

function getPhotoUrl(storagePath) {
    const { data } = supabase.storage
        .from('photo')
        .getPublicUrl(storagePath)
    return data.publicUrl
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}

async function loadPhotoCategories(photoId) {
    try {
        const { data } = await supabase
            .from('photo_categories')
            .select('category_id')
            .eq('photo_id', photoId)
        
        if (data) {
            photoCategories[String(photoId)] = data.map(d => String(d.category_id))
        }
    } catch (err) {
        console.error('加载照片分类失败:', err)
    }
}

async function loadComments(photoId) {
    try {
        const { data } = await supabase
            .from('comments')
            .select('*')
            .eq('photo_id', photoId)
            .order('created_at', { ascending: true })
        
        if (data) {
            currentComments = data
            renderComments()
        }
    } catch (err) {
        console.error('加载留言失败:', err)
    }
}

function renderComments() {
    const container = document.getElementById('commentsList')
    
    if (currentComments.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:12px;">暂无留言</p>'
        return
    }
    
    container.innerHTML = currentComments.map(c => `
        <div class="comment-item">
            <div>${escapeHtml(c.content || '')}</div>
            <div class="comment-time">${formatTime(c.created_at)}</div>
        </div>
    `).join('')
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

window.addComment = async function(e) {
    e.preventDefault()
    
    if (!currentPhoto) return
    
    const input = document.getElementById('commentInput')
    const content = input.value.trim()
    
    if (!content) return
    
    try {
        const { error } = await supabase
            .from('comments')
            .insert([{ photo_id: currentPhoto.id, content }])
        
        if (error) throw error
        
        input.value = ''
        await loadComments(currentPhoto.id)
    } catch (err) {
        alert('留言失败: ' + err.message)
    }
}

function renderPhotos() {
    const grid = document.getElementById('photoGrid')
    const empty = document.getElementById('emptyState')
    
    if (photos.length === 0) {
        grid.style.display = 'none'
        empty.style.display = 'block'
        return
    }
    
    grid.style.display = 'grid'
    empty.style.display = 'none'
    
    // 如果有照片但还没有加载分类关联，先加载
    if (Object.keys(photoCategories).length === 0 && photos.length > 0) {
        loadAllPhotoCategories()
    }
    
    // 根据当前分类过滤照片
    let filteredPhotos = photos
    if (currentCategory && currentCategory !== 'all') {
        filteredPhotos = photos.filter(photo => {
            const photoCats = photoCategories[String(photo.id)] || []
            return photoCats.includes(String(currentCategory))
        })
    }
    
    // 如果当前分类下没有照片，但有子分类，显示子分类卡片
    if (filteredPhotos.length === 0 && currentCategory && currentCategory !== 'all') {
        const currentCat = categories.find(c => c.id === parseInt(currentCategory))
        const childCategories = categories.filter(c => c.parent_id === parseInt(currentCategory))
        
        if (childCategories.length > 0) {
            grid.innerHTML = childCategories.map(cat => {
                const catPhotos = photos.filter(photo => {
                    const photoCats = photoCategories[String(photo.id)] || []
                    return photoCats.includes(String(cat.id))
                })
                const photoCount = catPhotos.length
                return `
                    <div class="photo-card category-card" onclick="selectCategory(${cat.id})">
                        <div class="category-icon">📁</div>
                        <div class="category-info">
                            <h3>${cat.name}</h3>
                            <p>${photoCount} 张照片</p>
                        </div>
                    </div>
                `
            }).join('')
            empty.style.display = 'none'
            return
        }
    }
    
    // 如果过滤后没有照片
    if (filteredPhotos.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">该分类下暂无照片</p>'
        empty.style.display = 'none'
        return
    }
    
    grid.innerHTML = filteredPhotos.map(photo => {
        const photoUrl = getPhotoUrl(photo.storage_path)
        const favoriteIcon = photo.is_favorite ? '❤️' : '🤍'
        const isSelected = selectedPhotos.has(photo.id)
        const checkboxHtml = selectMode ? `
            <div class="photo-checkbox" onclick="event.stopPropagation(); togglePhotoSelect('${photo.id}')">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); togglePhotoSelect('${photo.id}')">
            </div>
        ` : ''
        
        // 从 photoCategories 映射获取分类名称
        const photoCats = photoCategories[String(photo.id)] || []
        const catNames = photoCats.map(cid => {
            const cat = categories.find(c => String(c.id) === cid)
            return cat ? cat.name : ''
        }).filter(n => n)
        const categoryHtml = catNames.length > 0 
            ? `<span class="photo-category">${catNames.join(', ')}</span>` 
            : '<span class="photo-category" style="background:#e9ecef">未分类</span>'
        
        return `
            <div class="photo-card ${isSelected ? 'selected' : ''}" onclick="${selectMode ? "event.stopPropagation(); togglePhotoSelect('" + photo.id + "')" : "openPhotoModal('" + photo.id + "')"}">
                ${checkboxHtml}
                <img src="${photoUrl}" alt="${photo.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🖼️</text></svg>'">
                <div class="photo-info">
                    <h3 title="${photo.name}">${favoriteIcon} ${photo.name}</h3>
                    ${photo.description ? `<p>${photo.description}</p>` : ''}
                    <div class="photo-meta">
                        ${categoryHtml}
                        ${selectMode ? '' : `<div class="photo-actions" onclick="event.stopPropagation()">
                            <button class="btn-delete" onclick="window.deletePhoto('${photo.id}', '${photo.storage_path}')" title="删除">🗑️</button>
                        </div>`}
                    </div>
                </div>
            </div>
        `
    }).join('')
}

async function loadAllPhotoCategories() {
    // 清空旧的关联
    photoCategories = {}
    
    try {
        const { data } = await supabase
            .from('photo_categories')
            .select('photo_id, category_id')
        
        if (data) {
            data.forEach(pc => {
                const photoId = String(pc.photo_id)
                const catId = String(pc.category_id)
                if (!photoCategories[photoId]) {
                    photoCategories[photoId] = []
                }
                if (!photoCategories[photoId].includes(catId)) {
                    photoCategories[photoId].push(catId)
                }
            })
        }
    } catch (err) {
        console.error('加载照片分类关联失败:', err)
    }
}

window.openPhotoModal = async function(photoId) {
    currentPhoto = photos.find(p => p.id === photoId)
    if (!currentPhoto) return
    
    // 加载该照片的分类
    await loadPhotoCategories(photoId)
    
    // 加载留言
    await loadComments(photoId)
    
    const photoUrl = getPhotoUrl(currentPhoto.storage_path)
    
    document.getElementById('modalImage').src = photoUrl
    document.getElementById('modalPhotoName').textContent = currentPhoto.name
    document.getElementById('modalPhotoDesc').textContent = currentPhoto.description || '暂无描述'
    document.getElementById('modalPhotoSize').textContent = formatFileSize(currentPhoto.size)
    
    // 显示分类
    const categoryEl = document.getElementById('modalPhotoCategory')
    const photoCats = photoCategories[String(photoId)] || []
    if (photoCats.length > 0) {
        const catNames = photoCats.map(cid => {
            const cat = categories.find(c => String(c.id) === cid)
            return cat ? cat.name : ''
        }).filter(n => n).join(', ')
        categoryEl.textContent = catNames || '未分类'
        categoryEl.style.background = '#667eea'
        categoryEl.style.color = 'white'
    } else {
        categoryEl.textContent = '未分类'
        categoryEl.style.background = '#e9ecef'
        categoryEl.style.color = '#333'
    }
    
    const downloadBtn = document.getElementById('modalDownloadBtn')
    downloadBtn.href = photoUrl
    downloadBtn.download = currentPhoto.original_name || currentPhoto.name
    
    updateFavoriteButton()
    
    document.getElementById('photoModal').classList.add('active')
}

window.closeModal = function() {
    document.getElementById('photoModal').classList.remove('active')
    currentPhoto = null
    currentComments = []
}

window.openEditModal = function() {
    if (!currentPhoto) return
    
    document.getElementById('editPhotoId').value = currentPhoto.id
    document.getElementById('editName').value = currentPhoto.name
    document.getElementById('editDesc').value = currentPhoto.description || ''
    
    document.getElementById('editModal').classList.add('active')
}

window.closeEditModal = function() {
    document.getElementById('editModal').classList.remove('active')
}

window.handleEdit = async function(e) {
    e.preventDefault()
    
    const id = document.getElementById('editPhotoId').value
    const name = document.getElementById('editName').value.trim()
    const description = document.getElementById('editDesc').value.trim()
    
    try {
        const { error } = await supabase
            .from('photos')
            .update({ name, description })
            .eq('id', id)
        
        if (error) throw error
        
        closeEditModal()
        
        const photo = photos.find(p => p.id === id)
        if (photo) {
            photo.name = name
            photo.description = description
        }
        
        document.getElementById('modalPhotoName').textContent = name
        document.getElementById('modalPhotoDesc').textContent = description || '暂无描述'
        
        await loadPhotos()
    } catch (err) {
        alert('保存失败: ' + err.message)
    }
}

window.openCategoryModal = function() {
    if (!currentPhoto) return
    
    const photoCats = photoCategories[String(currentPhoto.id)] || []
    const container = document.getElementById('categoryCheckboxList')
    
    // 构建分类树
    function buildCategoryTree() {
        const roots = categories.filter(c => !c.parent_id)
        return roots.map(cat => ({
            ...cat,
            children: categories.filter(c => c.parent_id === cat.id)
        }))
    }
    
    function hasChildren(cat) {
        return categories.some(c => c.parent_id === cat.id)
    }
    
    function renderCategory(cat, level) {
        const indent = level * 20
        const isSelected = photoCats.includes(String(cat.id))
        const children = categories.filter(c => c.parent_id === cat.id)
        const hasChildCats = children.length > 0
        
        let html = `
            <div class="cascade-item" style="margin-left:${indent}px;">
                <label class="category-option">
                    <input type="checkbox" name="photoCategory" value="${cat.id}" ${isSelected ? 'checked' : ''} 
                           onchange="window.onCategoryCheckboxChange(this, ${cat.id})">
                    <span>${cat.name}</span>
                    ${hasChildCats ? '<span style="color:#888;font-size:11px;">▶</span>' : ''}
                </label>
        `
        
        // 渲染子分类
        if (hasChildCats) {
            children.forEach(child => {
                html += renderCategory(child, level + 1)
            })
        }
        
        html += '</div>'
        return html
    }
    
    const tree = buildCategoryTree()
    let html = '<div class="cascade-container">'
    tree.forEach(root => {
        html += renderCategory(root, 0)
    })
    html += '</div>'
    
    container.innerHTML = html
    document.getElementById('categoryModal').classList.add('active')
}

// 当复选框状态改变时
window.onCategoryCheckboxChange = function(checkbox, catId) {
    // 如果选中父分类，子分类也应该被考虑（但实际存储时只存叶子节点）
    // 这里不做自动处理，让用户自己选择
}

window.closeCategoryModal = function() {
    document.getElementById('categoryModal').classList.remove('active')
}

window.saveCategoryChange = async function() {
    if (!currentPhoto) return
    
    try {
        // 获取所有选中的分类（直接获取，无需特殊处理）
        const checkboxes = document.querySelectorAll('input[name="photoCategory"]:checked')
        const selectedCategories = Array.from(checkboxes).map(cb => cb.value)
        
        // 先删除旧的关联
        const { error: relationDeleteError } = await supabase
            .from('photo_categories')
            .delete()
            .eq('photo_id', currentPhoto.id)
        if (relationDeleteError) throw relationDeleteError
        
        // 添加新的关联
        if (selectedCategories.length > 0) {
            const inserts = selectedCategories.map(cid => ({
                photo_id: currentPhoto.id,
                category_id: cid
            }))
            
            const { error: relationInsertError } = await supabase
                .from('photo_categories')
                .insert(inserts)
            if (relationInsertError) throw relationInsertError
        }
        
        // 更新本地缓存
        photoCategories[String(currentPhoto.id)] = selectedCategories
        
        closeCategoryModal()
        
        // 更新弹窗中的分类显示
        const categoryEl = document.getElementById('modalPhotoCategory')
        if (selectedCategories.length > 0) {
            const catNames = selectedCategories.map(cid => {
                const cat = categories.find(c => String(c.id) === cid)
                return cat ? cat.name : ''
            }).filter(n => n).join(', ')
            categoryEl.textContent = catNames || '未分类'
            categoryEl.style.background = '#667eea'
            categoryEl.style.color = 'white'
        } else {
            categoryEl.textContent = '未分类'
            categoryEl.style.background = '#e9ecef'
            categoryEl.style.color = '#333'
        }
        
        await loadPhotos()
        await loadCategories()
    } catch (err) {
        alert('更改分类失败: ' + err.message)
    }
}

window.deletePhoto = async function(id, storagePath) {
    if (!confirm('确定删除该照片？')) return
    
    try {
        const { error: storageError } = await supabase.storage
            .from('photo')
            .remove([storagePath])
        
        if (storageError) throw storageError
        
        // 删除关联
        const { error: relationDeleteError } = await supabase
            .from('photo_categories')
            .delete()
            .eq('photo_id', id)
        if (relationDeleteError) throw relationDeleteError
        
        // 删除留言
        const { error: commentDeleteError } = await supabase
            .from('comments')
            .delete()
            .eq('photo_id', id)
        if (commentDeleteError) throw commentDeleteError
        
        const { error: deleteError } = await supabase
            .from('photos')
            .delete()
            .eq('id', id)
        
        if (deleteError) throw deleteError
        
        await loadPhotos()
        await loadCategories()
    } catch (err) {
        alert('删除失败: ' + err.message)
    }
}

// 点击弹窗外部关闭
document.getElementById('photoModal').addEventListener('click', (e) => {
    if (e.target.id === 'photoModal') closeModal()
})

document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal()
})

document.getElementById('categoryModal').addEventListener('click', (e) => {
    if (e.target.id === 'categoryModal') closeCategoryModal()
})

document.getElementById('editCategoryModal').addEventListener('click', (e) => {
    if (e.target.id === 'editCategoryModal') closeEditCategoryModal()
})

document.getElementById('batchCategoryModal').addEventListener('click', (e) => {
    if (e.target.id === 'batchCategoryModal') closeBatchCategoryModal()
})

// 点击外部收起已标记浮窗
document.addEventListener('click', (e) => {
    const widget = document.getElementById('markedWidget')
    if (widget && widget.classList.contains('expanded')) {
        if (!widget.contains(e.target)) {
            widget.classList.remove('expanded')
        }
    }
})
