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
let markedCategories = new Set((JSON.parse(localStorage.getItem('markedCategories') || '[]')).map(String))
let expandedCategories = new Set()
let expandedInManager = new Set() // 分类管理区域的展开状态

// 分页状态
const PHOTOS_PER_PAGE = 20
let currentPage = 1
let totalPhotos = 0

// 生日彩蛋状态
let birthdayConfig = null

// 地图状态
let mapView = null
let mapMarkers = []
let mapPhotos = []

// 纪念日时间线状态
let anniversaryMilestones = []
let anniversaryStartDate = null

// 相册状态
let albums = []
let albumPhotos = []
let currentAlbum = null
let albumSelectMode = false
let albumSelectedPhotos = new Set()

// 足迹护照状态
let passportSortByPhotoCount = true
let passportData = []
let passportAllPhotos = []

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

function loadBirthdayConfig() {
    try {
        birthdayConfig = JSON.parse(localStorage.getItem('birthday_config') || 'null');
        if (!birthdayConfig) {
            birthdayConfig = { month: 6, day: 22, name: '老大' };
        }
    } catch (e) {
        birthdayConfig = { month: 6, day: 22, name: '老大' };
    }
}

function isBirthdayToday() {
    loadBirthdayConfig();
    if (!birthdayConfig) return false;
    const today = new Date();
    return today.getMonth() + 1 === birthdayConfig.month && today.getDate() === birthdayConfig.day;
}

function saveBirthdayConfig(config) {
    birthdayConfig = config;
    localStorage.setItem('birthday_config', JSON.stringify(config));
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
    // 如果是老大且今天是生日，显示生日快乐欢迎界面
    if (isLaodaFromSession(session) && isBirthdayToday()) {
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
    
    loadBirthdayConfig();
    const cfg = birthdayConfig || { month: 6, day: 22, name: '老大' };
    const monthOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === cfg.month ? 'selected' : ''}>${m}月</option>`).join('');
    const dayOptions = Array.from({length: 31}, (_, i) => i + 1).map(d => `<option value="${d}" ${d === cfg.day ? 'selected' : ''}>${d}日</option>`).join('');

    overlay.innerHTML = `
        <canvas id="petalsCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;"></canvas>
        <div style="text-align:center;color:white;animation: scaleIn 0.8s ease;position:relative;z-index:9999;">
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
            <p style="margin-top:20px;font-size:0.9rem;opacity:0.7;">
                生日日期:
                <select id="birthdayMonth" onchange="window.updateBirthdayConfig()" style="padding:4px 8px;border:none;border-radius:6px;font-size:13px;">${monthOptions}</select>
                <select id="birthdayDay" onchange="window.updateBirthdayConfig()" style="padding:4px 8px;border:none;border-radius:6px;font-size:13px;">${dayOptions}</select>
            </p>
            <button id="musicToggle" onclick="window.toggleBirthdayMusic(event)" style="
                margin-top:12px;background:rgba(255,255,255,0.2);border:2px solid white;color:white;width:44px;height:44px;border-radius:50%;font-size:18px;cursor:pointer;">
                🔇
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
    startPetalAnimation()
}

function startPetalAnimation() {
    const canvas = document.getElementById('petalsCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const petals = [];
    const colors = ['#ff6b6b', '#ffa502', '#ff6348', '#ff4757', '#ff9ff3', '#feca57', '#ff6b81', '#eccc68'];

    for (let i = 0; i < 40; i++) {
        petals.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: 8 + Math.random() * 16,
            speed: 1 + Math.random() * 2,
            wobble: Math.random() * 2 - 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05
        });
    }

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
            if (p.y > canvas.height + 20) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
            drawPetal(p);
        });
        window.__petalAnimId = requestAnimationFrame(animate);
    }
    animate();
}

function stopPetalAnimation() {
    if (window.__petalAnimId) {
        cancelAnimationFrame(window.__petalAnimId);
        window.__petalAnimId = null;
    }
    const canvas = document.getElementById('petalsCanvas');
    if (canvas) canvas.remove();
}

window.updateBirthdayConfig = function() {
    const monthEl = document.getElementById('birthdayMonth');
    const dayEl = document.getElementById('birthdayDay');
    if (!monthEl || !dayEl) return;
    const month = parseInt(monthEl.value);
    const day = parseInt(dayEl.value);
    saveBirthdayConfig({ month, day, name: birthdayConfig?.name || '老大' });
};

window.toggleBirthdayMusic = function(e) {
    e.stopPropagation();
    let audio = document.getElementById('birthdayMusic');
    const btn = document.getElementById('musicToggle');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'birthdayMusic';
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
};

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
    stopPetalAnimation();
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
    const uploadSection = document.getElementById('uploadSection')
    const categorySection = document.getElementById('categorySection')
    const mapSection = document.getElementById('mapSection')
    const timelineSection = document.getElementById('timelineSection')
    const collageSection = document.getElementById('collageSection')
    const achievementsSection = document.getElementById('achievementsSection')
    const albumsSection = document.getElementById('albumsSection')
    const albumDetailSection = document.getElementById('albumDetailSection')
    const passportSection = document.getElementById('passportSection')

    // 辅助：隐藏所有分区
    const hideAll = () => {
        uploadSection.style.display = 'none'
        categorySection.style.display = 'none'
        if (mapSection) mapSection.style.display = 'none'
        if (timelineSection) timelineSection.style.display = 'none'
        if (collageSection) collageSection.style.display = 'none'
        if (achievementsSection) achievementsSection.style.display = 'none'
        if (albumsSection) albumsSection.style.display = 'none'
        if (albumDetailSection) albumDetailSection.style.display = 'none'
        if (passportSection) passportSection.style.display = 'none'
    }

    if (section === 'upload') {
        if (uploadSection.style.display === 'none' || !uploadSection.style.display) {
            hideAll()
            uploadSection.style.display = 'block'
        } else {
            uploadSection.style.display = 'none'
        }
    } else if (section === 'category') {
        if (categorySection.style.display === 'none' || !categorySection.style.display) {
            hideAll()
            categorySection.style.display = 'block'
            renderParentCategorySelect()
        } else {
            categorySection.style.display = 'none'
        }
    } else if (section === 'map') {
        if (!mapSection) return
        if (mapSection.style.display === 'none' || !mapSection.style.display) {
            hideAll()
            mapSection.style.display = 'block'
            initMapView()
        } else {
            mapSection.style.display = 'none'
        }
    } else if (section === 'timeline') {
        if (!timelineSection) return
        if (timelineSection.style.display === 'none' || !timelineSection.style.display) {
            hideAll()
            timelineSection.style.display = 'block'
            initTimeline()
        } else {
            timelineSection.style.display = 'none'
        }
    } else if (section === 'collage') {
        if (!collageSection) return
        if (collageSection.style.display === 'none' || !collageSection.style.display) {
            hideAll()
            collageSection.style.display = 'block'
            renderCollageCategorySelect()
        } else {
            collageSection.style.display = 'none'
        }
    } else if (section === 'achievements') {
        if (!achievementsSection) return
        if (achievementsSection.style.display === 'none' || !achievementsSection.style.display) {
            hideAll()
            achievementsSection.style.display = 'block'
            loadAchievements()
        } else {
            achievementsSection.style.display = 'none'
        }
    } else if (section === 'albums') {
        if (!albumsSection) return
        if (albumsSection.style.display === 'none' || !albumsSection.style.display) {
            hideAll()
            albumsSection.style.display = 'block'
            loadAlbums()
        } else {
            albumsSection.style.display = 'none'
        }
    } else if (section === 'passport') {
        if (!passportSection) return
        if (passportSection.style.display === 'none' || !passportSection.style.display) {
            hideAll()
            passportSection.style.display = 'block'
            loadPassport()
        } else {
            passportSection.style.display = 'none'
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
        currentPage = 1;
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
                return categories.some(c => String(c.id) === catId)
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
        // 始终先加载 photo_categories 映射（供分类筛选和计数使用）
        await loadAllPhotoCategories()

        let query = supabase
            .from('photos')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })

        if (showFavoritesOnly) {
            query = query.eq('is_favorite', true)
        }

        if (search) {
            const keywords = search.trim().split(/\s+/).filter(k => k.length > 0);
            if (keywords.length > 0) {
                const filters = keywords.map(k => `name.ilike.%${k}%,description.ilike.%${k}%`).join(',');
                query = query.or(filters);
            }
        }

        // 分类筛选：通过内存映射获取匹配 photo ID，推服务端过滤
        if (currentCategory && currentCategory !== 'all' && categories.length > 0) {
            const categoryIds = getCategoryAndChildrenIds(currentCategory)
            if (categoryIds.length > 0) {
                const matchingPhotoIds = new Set()
                Object.entries(photoCategories).forEach(([photoId, catIds]) => {
                    if (catIds.some(cid => categoryIds.includes(cid))) {
                        matchingPhotoIds.add(photoId)
                    }
                })

                if (matchingPhotoIds.size > 0) {
                    query = query.in('id', [...matchingPhotoIds])
                } else {
                    // 无匹配照片
                    photos = []
                    totalPhotos = 0
                    renderCategories()
                    renderPhotos()
                    updatePhotosTitle()
                    updateEmptyState()
                    renderPagination()
                    return
                }
            }
        }

        // 服务端分页
        const from = (currentPage - 1) * PHOTOS_PER_PAGE
        const to = from + PHOTOS_PER_PAGE - 1
        query = query.range(from, to)

        const { data, error, count } = await query

        if (error) throw error

        photos = data || []
        totalPhotos = count || 0

        renderCategories()
        renderPhotos()
        updatePhotosTitle()
        updateEmptyState()
        renderPagination()
    } catch (err) {
        console.error('加载照片失败:', err)
    }
}

function getCategoryAndChildrenIds(categoryId) {
    const strId = String(categoryId)
    const ids = [strId]
    const children = categories.filter(c => String(c.parent_id) === String(categoryId))
    children.forEach(child => {
        ids.push(...getCategoryAndChildrenIds(String(child.id)))
    })
    return ids
}

function getCategoryPhotoCount(catId) {
    const strCatId = String(catId)
    return Object.values(photoCategories).filter(catIds => catIds.includes(strCatId)).length
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
                            const count = getCategoryPhotoCount(child.id)
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

function renderPagination() {
    const container = document.getElementById('paginationContainer')
    if (!container) return

    const totalPages = Math.max(1, Math.ceil(totalPhotos / PHOTOS_PER_PAGE))
    const hasPrev = currentPage > 1
    const hasNext = currentPage < totalPages

    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" ${hasPrev ? '' : 'disabled'} onclick="${hasPrev ? 'window.prevPage()' : ''}">上一页</button>
            <span class="pagination-info">第 ${currentPage} / ${totalPages} 页 · 共 ${totalPhotos} 张</span>
            <button class="pagination-btn" ${hasNext ? '' : 'disabled'} onclick="${hasNext ? 'window.nextPage()' : ''}">下一页</button>
        </div>
    `
}

window.prevPage = function() {
    if (currentPage > 1) {
        currentPage--
        loadPhotos()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

window.nextPage = function() {
    const totalPages = Math.max(1, Math.ceil(totalPhotos / PHOTOS_PER_PAGE))
    if (currentPage < totalPages) {
        currentPage++
        loadPhotos()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

window.clearCategoryFilter = function() {
    currentCategory = 'all'
    currentPage = 1
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
            const count = getCategoryPhotoCount(cat.id)
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
    currentPage = 1
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
    const batchLocationBtn = document.getElementById('batchLocationBtn')
    const batchExportBtn = document.getElementById('batchExportBtn')
    const batchBtn = document.getElementById('batchDeleteBtn')

    if (selectMode) {
        selectBtn.classList.add('active')
        selectBtn.textContent = '❌ 取消'
        selectAllBtn.style.display = 'inline-block'
        batchCategoryBtn.style.display = 'inline-block'
        if (batchLocationBtn) batchLocationBtn.style.display = 'inline-block'
        if (batchExportBtn) batchExportBtn.style.display = 'inline-block'
        batchBtn.style.display = 'inline-block'
    } else {
        selectBtn.classList.remove('active')
        selectBtn.textContent = '☑️ 多选'
        selectAllBtn.style.display = 'none'
        batchCategoryBtn.style.display = 'none'
        if (batchLocationBtn) batchLocationBtn.style.display = 'none'
        if (batchExportBtn) batchExportBtn.style.display = 'none'
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

window.exportSelectedPhotos = async function() {
    if (selectedPhotos.size === 0) {
        alert('请先选择要导出的照片');
        return;
    }
    if (selectedPhotos.size > 50) {
        if (!confirm(`已选择 ${selectedPhotos.size} 张照片，一次最多导出 50 张。仅导出前 50 张？`)) return;
    }

    const photoIds = [...selectedPhotos].slice(0, 50);
    const selectedPhotoData = photos.filter(p => photoIds.includes(p.id));

    try {
        const zip = new JSZip();
        const total = selectedPhotoData.length;
        let completed = 0;

        const progressBar = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressSection = document.getElementById('uploadProgress');
        if (progressSection) progressSection.style.display = 'block';

        for (const photo of selectedPhotoData) {
            const url = getPhotoUrl(photo.storage_path);
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('fetch failed');
                const blob = await response.blob();
                // 保持原始文件名或使用 photo.name
                const ext = photo.storage_path.split('.').pop() || 'jpg';
                const fileName = `${photo.name || 'photo'}.${ext}`;
                zip.file(fileName, blob);
            } catch (e) {
                console.warn(`下载失败: ${photo.name}`, e);
            }
            completed++;
            if (progressFill) progressFill.style.width = `${(completed / total) * 100}%`;
            if (progressText) progressText.textContent = `${Math.round((completed / total) * 100)}%`;
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

        if (progressSection) progressSection.style.display = 'none';
        alert(`成功导出 ${completed} 张照片！`);
    } catch (err) {
        console.error('导出失败:', err);
        alert('导出失败: ' + err.message);
    }
};

window.batchDeletePhotos = async function() {
    if (selectedPhotos.size === 0) {
        alert('请先选择要删除的照片')
        return
    }
    
    if (!confirm(`确定删除选中的 ${selectedPhotos.size} 张照片？`)) return

    const photoIds = [...selectedPhotos]
    let successCount = 0
    let failCount = 0

    // 先从 Supabase 查询所有选中照片的 storage_path
    let storagePaths = []
    try {
        const { data: photoRecords } = await supabase
            .from('photos')
            .select('id, storage_path')
            .in('id', photoIds)
        if (photoRecords) {
            storagePaths = photoRecords.map(p => p.storage_path).filter(Boolean)
        }
    } catch (e) {
        console.warn('获取 storage_path 失败:', e)
    }

    // 批量清理 Storage 文件
    if (storagePaths.length > 0) {
        try {
            await supabase.storage.from('photo').remove(storagePaths)
        } catch (e) {
            console.warn('Storage 文件清理失败:', e)
        }
    }

    for (const photoId of photoIds) {
        try {
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

// ========== 批量设置位置 ==========

window.openBatchLocationModal = function() {
    if (selectedPhotos.size === 0) {
        alert('请先选择照片');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'batchLocationModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;padding:0;">
            <span class="modal-close" onclick="document.getElementById('batchLocationModal').remove()">&times;</span>
            <h3 style="padding:16px;">为选中的 ${selectedPhotos.size} 张照片设置位置</h3>
            <div id="batchPickerMap" style="height:400px;"></div>
            <div style="padding:16px;display:flex;gap:8px;align-items:center;">
                <input type="text" id="batchLocationName" placeholder="地点名称（如：北京故宫）" style="flex:1;">
                <span id="batchPickerCoords" style="color:#666;white-space:nowrap;">点击地图获取坐标</span>
                <button class="btn btn-primary" onclick="window.saveBatchLocation()">确认</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
        const pickerMap = L.map('batchPickerMap').setView([35.86, 104.19], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM',
            maxZoom: 18
        }).addTo(pickerMap);

        let pickedMarker = null;

        pickerMap.on('click', function(e) {
            window.__batchPickedLatLng = e.latlng;
            if (pickedMarker) pickerMap.removeLayer(pickedMarker);
            pickedMarker = L.marker(e.latlng).addTo(pickerMap);
            document.getElementById('batchPickerCoords').textContent =
                '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
        });

        setTimeout(() => pickerMap.invalidateSize(), 100);
    }, 100);
};

window.saveBatchLocation = async function() {
    if (!window.__batchPickedLatLng) {
        alert('请先在地图上点击选择位置');
        return;
    }

    const lat = window.__batchPickedLatLng.lat;
    const lng = window.__batchPickedLatLng.lng;
    const locationName = (document.getElementById('batchLocationName')?.value || '').trim() || null;
    const photoIds = [...selectedPhotos];

    try {
        const { error } = await supabase
            .from('photos')
            .update({ latitude: lat, longitude: lng, location_name: locationName })
            .in('id', photoIds);

        if (error) throw error;

        // 更新本地缓存中的照片数据
        photos.forEach(p => {
            if (selectedPhotos.has(p.id)) {
                p.latitude = lat;
                p.longitude = lng;
                p.location_name = locationName;
            }
        });

        document.getElementById('batchLocationModal').remove();
        window.__batchPickedLatLng = null;

        alert(`成功为 ${photoIds.length} 张照片设置位置: ${locationName || '已定位'}`);
    } catch (err) {
        alert('批量设置位置失败: ' + err.message);
    }
};

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
        const count = getCategoryPhotoCount(cat.id)
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
            const count = getCategoryPhotoCount(cat.id)
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
        currentPage = 1
        loadPhotos() // 重新加载所有照片
        return
    }

    // 如果选中了某个分类，显示其子分类作为下一级
    if (selectedValue) {
        currentCategory = selectedValue
        currentPage = 1
        const children = categories.filter(c => String(c.parent_id) === String(selectedValue))
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `filterCatLevel${nextLevel}`
            nextSelect.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
            nextSelect.onchange = () => onFilterCatLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => {
                const count = getCategoryPhotoCount(cat.id)
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
    const count = getCategoryPhotoCount(cat.id)
    
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
    currentPage = 1
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
    currentPage = 1
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
        const children = categories.filter(c => String(c.parent_id) === String(selectedValue))
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
        const children = categories.filter(c => String(c.parent_id) === String(selectedValue))
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
        // 获取该分类及其所有子分类
        const allIds = getCategoryAndChildrenIds(id)

        // 删除所有关联的 photo_categories
        for (const catId of allIds) {
            await supabase
                .from('photo_categories')
                .delete()
                .eq('category_id', catId)
        }

        // 删除所有分类（从叶子到根，避免外键冲突）
        for (const catId of allIds.reverse()) {
            await supabase
                .from('categories')
                .delete()
                .eq('id', catId)
        }

        if (allIds.includes(String(currentCategory))) {
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
    const locationName = (document.getElementById('photoLocationName')?.value || '').trim() || null
    const latitude = parseFloat(document.getElementById('photoLatitude')?.value) || null
    const longitude = parseFloat(document.getElementById('photoLongitude')?.value) || null
    
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
                    is_favorite: false,
                    latitude,
                    longitude,
                    location_name: locationName
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
    const locNameEl = document.getElementById('photoLocationName')
    const latEl = document.getElementById('photoLatitude')
    const lngEl = document.getElementById('photoLongitude')
    if (locNameEl) locNameEl.value = ''
    if (latEl) latEl.value = ''
    if (lngEl) lngEl.value = ''
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
        const maxBytes = maxSizeMB * 1024 * 1024

        img.onload = () => {
            let quality = 0.7
            let width = img.width
            let height = img.height

            const tryCompress = () => {
                canvas.width = width
                canvas.height = height
                ctx.drawImage(img, 0, 0, width, height)

                canvas.toBlob(
                    (blob) => {
                        if (!blob || blob.size <= maxBytes || quality <= 0.05) {
                            resolve(blob && blob.size <= file.size ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
                            return
                        }
                        if (quality > 0.1) {
                            quality -= 0.15
                        } else if (width > 400) {
                            width = Math.round(width * 0.7)
                            height = Math.round(height * 0.7)
                            quality = 0.5
                        } else {
                            resolve(file)
                            return
                        }
                        tryCompress()
                    },
                    'image/jpeg',
                    quality
                )
            }

            tryCompress()
        }

        img.src = URL.createObjectURL(file)
    })
}

// ========== 地图功能 ==========

async function initMapView() {
    const container = document.getElementById('mapContainer');
    if (!container || mapView) return;

    mapView = L.map('mapContainer').setView([35.86, 104.19], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(mapView);

    await loadMapPhotos();
    setTimeout(() => mapView.invalidateSize(), 100);
}

async function loadMapPhotos() {
    try {
        const { data } = await supabase
            .from('photos')
            .select('*')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('created_at', { ascending: false });

        mapPhotos = data || [];
        renderMapMarkers();
        renderMapPhotoGrid();
    } catch (err) {
        console.error('加载地图照片失败:', err);
    }
}

function renderMapMarkers() {
    if (!mapView) return;
    mapMarkers.forEach(m => mapView.removeLayer(m));
    mapMarkers = [];

    if (mapPhotos.length === 0) return;

    const bounds = [];
    mapPhotos.forEach(photo => {
        const marker = L.marker([photo.latitude, photo.longitude])
            .addTo(mapView)
            .bindPopup(`
                <div style="text-align:center;max-width:200px;">
                    <img src="${getPhotoUrl(photo.storage_path)}"
                         style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;"
                         onerror="this.style.display='none'">
                    <strong>${escapeHtml(photo.name)}</strong>
                    <p style="margin:4px 0;font-size:12px;color:#666;">
                        ${escapeHtml(photo.location_name || '')}
                    </p>
                    <button onclick="window.openPhotoModal('${photo.id}')"
                        style="padding:4px 12px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">
                        查看详情
                    </button>
                </div>
            `);
        mapMarkers.push(marker);
        bounds.push([photo.latitude, photo.longitude]);
    });

    if (bounds.length > 0) {
        mapView.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
}

function renderMapPhotoGrid() {
    const grid = document.getElementById('mapPhotoGrid');
    const empty = document.getElementById('mapEmpty');

    if (!grid || !empty) return;

    if (mapPhotos.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    grid.style.display = 'flex';
    empty.style.display = 'none';

    grid.innerHTML = mapPhotos.map(photo => {
        const url = getPhotoUrl(photo.storage_path);
        return `
            <div class="photo-card" style="width:150px;cursor:pointer;"
                 onclick="window.openPhotoModal('${photo.id}')">
                <img src="${url}" alt="${escapeHtml(photo.name)}"
                     style="width:100%;height:120px;object-fit:cover;">
                <div class="photo-info">
                    <h3 style="font-size:12px;">${escapeHtml(photo.name)}</h3>
                    <p style="font-size:11px;color:#666;">${escapeHtml(photo.location_name || '')}</p>
                </div>
            </div>
        `;
    }).join('');
}

window.pickLocationOnMap = function() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'locationPickerModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;padding:0;">
            <span class="modal-close" onclick="document.getElementById('locationPickerModal').remove()">&times;</span>
            <h3 style="padding:16px;">点击地图选择位置</h3>
            <div id="pickerMap" style="height:400px;"></div>
            <div style="padding:16px;display:flex;gap:8px;align-items:center;">
                <input type="text" id="pickerLocationName" placeholder="地点名称" style="flex:1;">
                <span id="pickerCoords" style="color:#666;white-space:nowrap;">点击地图获取坐标</span>
                <button class="btn btn-primary" onclick="window.confirmMapPick()">确认</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
        const pickerMap = L.map('pickerMap').setView([35.86, 104.19], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM',
            maxZoom: 18
        }).addTo(pickerMap);

        let pickedMarker = null;

        pickerMap.on('click', function(e) {
            window.__pickedLatLng = e.latlng;
            if (pickedMarker) pickerMap.removeLayer(pickedMarker);
            pickedMarker = L.marker(e.latlng).addTo(pickerMap);
            document.getElementById('pickerCoords').textContent =
                '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
        });

        setTimeout(() => pickerMap.invalidateSize(), 100);
    }, 100);
};

window.confirmMapPick = function() {
    if (window.__pickedLatLng) {
        document.getElementById('photoLatitude').value = window.__pickedLatLng.lat.toFixed(6);
        document.getElementById('photoLongitude').value = window.__pickedLatLng.lng.toFixed(6);
        const locName = (document.getElementById('pickerLocationName')?.value || '').trim();
        if (locName) document.getElementById('photoLocationName').value = locName;
    }
    const modal = document.getElementById('locationPickerModal');
    if (modal) modal.remove();
    window.__pickedLatLng = null;
};

// ========== 纪念日时间线 ==========

function getDefaultMilestones() {
    return [
        { id: '1', date: '2020-06-15', title: '我们在一起的第一天', description: '故事从这里开始', photoId: null },
        { id: '2', date: '2021-02-14', title: '第一个情人节', description: '', photoId: null },
        { id: '3', date: '2021-01-01', title: '第一个新年', description: '', photoId: null },
        { id: '4', date: '2021-12-25', title: '第一个圣诞节', description: '', photoId: null },
    ];
}

// 检测是否有 localStorage 数据（用于判断是否应从 localStorage 加载）
let _milestonesSupabaseFailed = false

async function loadMilestones() {
    let shouldMigrate = false
    let selectOk = false
    try {
        const { data, error } = await supabase
            .from('milestones')
            .select('*')
            .order('date', { ascending: false });

        if (!error && data && data.length > 0) {
            anniversaryMilestones = data.map(m => ({
                id: String(m.id),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photoId: m.photo_id || null,
                photoPath: m.photo_path || null,
                photoName: m.photo_name || null,
                categoryId: m.category_id || null,
                categoryName: m.category_name || null
            }));
            selectOk = true
            // 如果 localStorage 有数据（可能是之前 Supabase 保存失败留下的），合并后回写
            const saved = localStorage.getItem('anniversary_milestones');
            if (saved) {
                const localMilestones = JSON.parse(saved);
                localMilestones.forEach(lm => {
                    const existing = anniversaryMilestones.find(m => m.id === lm.id);
                    if (existing) {
                        // localStorage 可能有更新的 categoryId/categoryName 等字段
                        if (lm.categoryId) existing.categoryId = lm.categoryId;
                        if (lm.categoryName) existing.categoryName = lm.categoryName;
                        if (lm.photoId) existing.photoId = lm.photoId;
                        if (lm.photoPath) existing.photoPath = lm.photoPath;
                        if (lm.photoName) existing.photoName = lm.photoName;
                    } else {
                        anniversaryMilestones.push(lm);
                    }
                });
                shouldMigrate = true;
            }
        } else if (!error) {
            // SELECT 成功但没有数据 — 尝试从 localStorage 迁移
            selectOk = true
            const saved = localStorage.getItem('anniversary_milestones');
            if (saved) {
                anniversaryMilestones = JSON.parse(saved);
                shouldMigrate = true;
            } else {
                anniversaryMilestones = getDefaultMilestones();
            }
        }
    } catch (e) { /* 静默 */ }

    if (anniversaryMilestones.length === 0) {
        const saved = localStorage.getItem('anniversary_milestones');
        anniversaryMilestones = saved ? JSON.parse(saved) : getDefaultMilestones();
    }

    if (shouldMigrate) {
        await migrateMilestonesToSupabase();
    }
    // 仅当 SELECT 本身出错时才标记 Supabase 不可用
    _milestonesSupabaseFailed = !selectOk

    await loadStartDate()
}

async function loadStartDate() {
    anniversaryStartDate = localStorage.getItem('anniversary_start_date') || '2020-06-15';
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'anniversary_start_date')
            .single();
        if (!error && data) {
            anniversaryStartDate = data.value;
        } else if (!error) {
            // 表存在但无该 key，保存当前值
            await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: anniversaryStartDate });
        }
        // 有任何 error 就保持 localStorage 值
    } catch (e) { /* 静默 */ }
}

async function migrateMilestonesToSupabase() {
    if (_milestonesSupabaseFailed) return;
    try {
        const rows = anniversaryMilestones.map(m => ({
            id: parseInt(m.id) || Date.now() + Math.floor(Math.random() * 1000),
            date: m.date,
            title: m.title,
            description: m.description || '',
            photo_id: m.photoId || null,
            photo_path: m.photoPath || null,
            photo_name: m.photoName || null,
            category_id: m.categoryId ? parseInt(m.categoryId) : null,
            category_name: m.categoryName || null
        }));
        const { error } = await supabase.from('milestones').upsert(rows);
        if (error) { _milestonesSupabaseFailed = true; return; }
        localStorage.removeItem('anniversary_milestones');
        _milestonesSupabaseFailed = false;
    } catch (e) {
        _milestonesSupabaseFailed = true;
    }
}

async function saveMilestonesToSupabase() {
    if (_milestonesSupabaseFailed) {
        localStorage.setItem('anniversary_milestones', JSON.stringify(anniversaryMilestones));
        return;
    }
    try {
        const rows = anniversaryMilestones.map(m => ({
            id: parseInt(m.id) || Date.now(),
            date: m.date,
            title: m.title,
            description: m.description || '',
            photo_id: m.photoId || null,
            photo_path: m.photoPath || null,
            photo_name: m.photoName || null,
            category_id: m.categoryId ? parseInt(m.categoryId) : null,
            category_name: m.categoryName || null
        }));
        const { error } = await supabase.from('milestones').upsert(rows);
        if (error) {
            _milestonesSupabaseFailed = true;
            localStorage.setItem('anniversary_milestones', JSON.stringify(anniversaryMilestones));
            return;
        }
        localStorage.removeItem('anniversary_milestones');
    } catch (e) {
        _milestonesSupabaseFailed = true;
        localStorage.setItem('anniversary_milestones', JSON.stringify(anniversaryMilestones));
    }
}

async function saveStartDateToSupabase() {
    if (_milestonesSupabaseFailed) {
        localStorage.setItem('anniversary_start_date', anniversaryStartDate);
        return;
    }
    try {
        const { error } = await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: anniversaryStartDate });
        if (!error) {
            localStorage.removeItem('anniversary_start_date');
            return;
        }
    } catch (e) { /* 静默 */ }
    localStorage.setItem('anniversary_start_date', anniversaryStartDate);
}

function updateDaysCounter() {
    if (!anniversaryStartDate) return;
    const el = document.getElementById('daysCount');
    if (!el) return;
    const start = new Date(anniversaryStartDate);
    const today = new Date();
    const diffTime = today - start;
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    el.textContent = diffDays;
}

async function initTimeline() {
    await loadMilestones();
    const startInput = document.getElementById('startDateInput');
    if (startInput) startInput.value = anniversaryStartDate;
    updateDaysCounter();
    renderTimeline();
}

window.updateStartDate = async function() {
    const input = document.getElementById('startDateInput');
    if (!input) return;
    anniversaryStartDate = input.value;
    await saveStartDateToSupabase();
    updateDaysCounter();
};

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    const sorted = [...anniversaryMilestones].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sorted.map((m, i) => {
        const milestoneDate = new Date(m.date);
        const today = new Date();
        const diffDays = Math.floor((today - milestoneDate) / (1000 * 60 * 60 * 24));
        const years = Math.floor(diffDays / 365);
        const remainDays = diffDays % 365;

        const side = i % 2 === 0 ? 'left' : 'right';

        let catHtml = '';
        if (m.categoryId) {
            catHtml = `<div style="margin-top:8px;">
                <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;"
                    onclick="window.goToCategory('${m.categoryId}')">📁 ${escapeHtml(m.categoryName || '查看分类')}</button>
            </div>`;
        }

        let photoHtml = '';
        if (m.photoId) {
            const photoUrl = m.photoPath ? getPhotoUrl(m.photoPath) : '';
            const displayUrl = photoUrl;
            if (displayUrl) {
                photoHtml = `<img src="${displayUrl}"
                    style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-top:8px;cursor:pointer;"
                    onclick="window.openPhotoModal('${m.photoId}')"
                    onerror="this.style.display='none'">`;
            }
        }

        let timeAgo = '';
        if (years > 0) timeAgo += years + '年';
        if (remainDays > 0 || years === 0) timeAgo += remainDays + '天';
        timeAgo += '前';

        return `
            <div class="timeline-item timeline-${side}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${m.date}</div>
                    <h3>${escapeHtml(m.title)}</h3>
                    ${m.description ? '<p>' + escapeHtml(m.description) + '</p>' : ''}
                    <small style="color:#999;">${timeAgo}</small>
                    ${catHtml}
                    ${photoHtml}
                    <div class="milestone-actions" style="margin-top:8px;display:flex;gap:8px;">
                        <button class="btn btn-secondary" style="font-size:11px;padding:4px 8px;"
                            onclick="window.openEditMilestoneModal('${m.id}')">✏️</button>
                        <button class="btn-danger" style="font-size:11px;padding:4px 8px;"
                            onclick="window.deleteMilestone('${m.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderFilterCategoryCascadePath(catId) {
    const container = document.getElementById('filterCategoryCascade');
    if (!container) return;
    // 获取从根到目标分类的路径
    const path = [];
    let cur = categories.find(c => c.id === catId);
    while (cur) {
        path.unshift(cur);
        cur = cur.parent_id ? categories.find(c => c.id === cur.parent_id) : null;
    }
    container.innerHTML = '';
    let parentId = null;
    path.forEach((cat, index) => {
        const level = index;
        const opts = (index === 0
            ? categories.filter(c => !c.parent_id)
            : categories.filter(c => c.parent_id === parentId));
        const select = document.createElement('select');
        select.id = `filterCatLevel${level}`;
        select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
        select.onchange = () => onFilterCatLevelChange(level);
        select.innerHTML = `<option value="">选择分类</option>${opts.map(oc => {
            const sel = oc.id === cat.id ? 'selected' : '';
            return `<option value="${oc.id}" ${sel}>${oc.name} (${getCategoryPhotoCount(oc.id)})</option>`;
        }).join('')}`;
        container.appendChild(select);
        parentId = cat.id;
    });
}

window.goToCategory = function(catId) {
    currentCategory = String(catId);
    currentPage = 1;
    showFavoritesOnly = false;
    window.toggleSection('photos');
    loadPhotos();
    renderFilterCategoryCascadePath(catId);
    document.getElementById('photoGrid').scrollIntoView({ behavior: 'smooth' });
};

function buildCategoryOptions(selectedId, indent) {
    indent = indent || 0;
    let html = '';
    const list = categories.filter(c => (indent === 0 ? !c.parent_id : c.parent_id === selectedId));
    // 如果 selectedId 是选项组的父级ID，改为传整个分类列表并显示缩进
    return html;
}

function buildAllCategoryOptions(selectedCatId) {
    function walk(cats, depth) {
        let html = '';
        cats.forEach(cat => {
            const prefix = '　'.repeat(depth);
            const sel = String(cat.id) === String(selectedCatId || '') ? 'selected' : '';
            html += `<option value="${cat.id}" ${sel}>${prefix}${escapeHtml(cat.name)}</option>`;
            const children = categories.filter(c => c.parent_id === cat.id);
            if (children.length > 0) html += walk(children, depth + 1);
        });
        return html;
    }
    const roots = categories.filter(c => !c.parent_id);
    return walk(roots, 0);
}

window.openAddMilestoneModal = function() {
    const catOpts = buildAllCategoryOptions('');
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestoneModal';
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('milestoneModal').remove()">&times;</span>
            <h3>添加纪念日</h3>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="milestoneDate">
            </div>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="milestoneTitle">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="milestoneDesc" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>关联类别（可选）</label>
                <select id="milestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="">不关联类别</option>
                    ${catOpts}
                </select>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="milestonePhotoPreview" style="margin-bottom:8px;"></div>
                <button type="button" class="btn btn-secondary" onclick="window.openMilestonePhotoPicker()">📷 选择照片</button>
                <button type="button" class="btn btn-secondary" onclick="window.clearMilestonePhoto()" style="display:none;" id="clearMilestonePhotoBtn">✕ 取消关联</button>
            </div>
            <input type="hidden" id="milestonePhotoId" value="">
            <button class="btn btn-primary" onclick="window.saveMilestone()">保存</button>
        </div>
    `;
    document.body.appendChild(modal);
};

window._milestonePhotoData = null;

window.pickMilestonePhoto = function(photo) {
    window._milestonePhotoData = photo;
    document.getElementById('milestonePhotoId').value = photo.id;
    const preview = document.getElementById('milestonePhotoPreview');
    preview.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;">
        <img src="${getPhotoUrl(photo.storage_path)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;">
        <div>
            <div style="font-size:13px;font-weight:500;">${escapeHtml(photo.name || '未命名')}</div>
            <div style="font-size:11px;color:#999;">ID: ${photo.id}</div>
        </div>
    </div>`;
    document.getElementById('clearMilestonePhotoBtn').style.display = 'inline-block';
    // 关闭照片选择弹窗
    const picker = document.getElementById('milestonePhotoPicker');
    if (picker) picker.remove();
};

window.clearMilestonePhoto = function() {
    window._milestonePhotoData = null;
    document.getElementById('milestonePhotoId').value = '';
    document.getElementById('milestonePhotoPreview').innerHTML = '';
    document.getElementById('clearMilestonePhotoBtn').style.display = 'none';
};

window.openMilestonePhotoPicker = async function() {
    // 加载照片列表用于选择
    const { data } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
    const photoList = data || [];

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestonePhotoPicker';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto;padding:20px;">
            <span class="modal-close" onclick="document.getElementById('milestonePhotoPicker').remove()">&times;</span>
            <h3>选择关联照片</h3>
            <input type="text" id="milestonePhotoSearch" placeholder="🔍 搜索照片..."
                style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;"
                oninput="window.filterMilestonePhotos()">
            <div id="milestonePhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
                ${photoList.map(p => `
                    <div class="milestone-photo-item" data-name="${escapeHtml(p.name || '')}" style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border .2s;"
                        onclick="window.pickMilestonePhoto(${JSON.stringify({id:p.id,storage_path:p.storage_path,name:p.name}).replace(/"/g,'&quot;')})">
                        <img src="${getPhotoUrl(p.storage_path)}" style="width:100%;height:90px;object-fit:cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect fill=%22%23eee%22 width=%22120%22 height=%2290%22/><text x=%2260%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2212%22>无预览</text></svg>'">
                        <div style="padding:4px;font-size:11px;text-align:center;color:#666;">${escapeHtml((p.name || '').substring(0,15))}</div>
                    </div>
                `).join('')}
            </div>
            ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
        </div>
    `;
    document.body.appendChild(modal);
};

window.filterMilestonePhotos = function() {
    const query = document.getElementById('milestonePhotoSearch').value.toLowerCase();
    document.querySelectorAll('.milestone-photo-item').forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
    });
};

window.openEditMilestoneModal = function(id) {
    const m = anniversaryMilestones.find(ms => ms.id === id);
    if (!m) return;

    window._milestonePhotoData = m.photoId ? { id: m.photoId, storage_path: m.photoPath || '', name: m.photoName || '' } : null;

    const previewHtml = window._milestonePhotoData ? `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;">
            <img src="${getPhotoUrl(window._milestonePhotoData.storage_path)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">
            <div>
                <div style="font-size:13px;font-weight:500;">${escapeHtml(window._milestonePhotoData.name || '未命名')}</div>
                <div style="font-size:11px;color:#999;">ID: ${window._milestonePhotoData.id}</div>
            </div>
        </div>` : '';

    const catOpts = buildAllCategoryOptions(m.categoryId || '');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestoneModal';
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('milestoneModal').remove()">&times;</span>
            <h3>编辑纪念日</h3>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="milestoneDate" value="${m.date}">
            </div>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="milestoneTitle" value="${escapeHtml(m.title)}">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="milestoneDesc" rows="2">${escapeHtml(m.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>关联类别（可选）</label>
                <select id="milestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="">不关联类别</option>
                    ${catOpts}
                </select>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="milestonePhotoPreview" style="margin-bottom:8px;">${previewHtml}</div>
                <button type="button" class="btn btn-secondary" onclick="window.openMilestonePhotoPicker()">📷 选择照片</button>
                <button type="button" class="btn btn-secondary" onclick="window.clearMilestonePhoto()" id="clearMilestonePhotoBtn"
                    style="${window._milestonePhotoData ? '' : 'display:none;'}">✕ 取消关联</button>
            </div>
            <input type="hidden" id="milestonePhotoId" value="${m.photoId || ''}">
            <button class="btn btn-primary" onclick="window.updateMilestone('${id}')">保存</button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.saveMilestone = function() {
    const date = document.getElementById('milestoneDate').value;
    const title = document.getElementById('milestoneTitle').value.trim();
    const desc = document.getElementById('milestoneDesc').value.trim();
    const photoId = document.getElementById('milestonePhotoId').value.trim() || null;
    const catId = document.getElementById('milestoneCategoryId').value || null;
    const catName = catId ? (categories.find(c => String(c.id) === String(catId)) || {}).name || '' : '';

    if (!date || !title) {
        alert('请填写日期和标题');
        return;
    }

    const pd = window._milestonePhotoData;
    const newMilestone = {
        id: Date.now().toString(),
        date, title,
        description: desc,
        photoId: photoId || null,
        photoPath: pd ? pd.storage_path : null,
        photoName: pd ? pd.name : null,
        categoryId: catId || null,
        categoryName: catName || null
    };

    anniversaryMilestones.push(newMilestone);
    window._milestonePhotoData = null;
    saveMilestonesToSupabase();
    renderTimeline();
    document.getElementById('milestoneModal').remove();
};

window.updateMilestone = function(id) {
    const m = anniversaryMilestones.find(ms => ms.id === id);
    if (!m) return;

    m.date = document.getElementById('milestoneDate').value;
    m.title = document.getElementById('milestoneTitle').value.trim();
    m.description = document.getElementById('milestoneDesc').value.trim();
    m.photoId = document.getElementById('milestonePhotoId').value.trim() || null;
    const pd = window._milestonePhotoData;
    m.photoPath = pd ? pd.storage_path : null;
    m.photoName = pd ? pd.name : null;
    const catId = document.getElementById('milestoneCategoryId').value || null;
    m.categoryId = catId || null;
    m.categoryName = catId ? (categories.find(c => String(c.id) === String(catId)) || {}).name || '' : null;

    window._milestonePhotoData = null;
    saveMilestonesToSupabase();
    renderTimeline();
    document.getElementById('milestoneModal').remove();
};

window.deleteMilestone = function(id) {
    if (!confirm('确定删除这个纪念日？')) return;
    anniversaryMilestones = anniversaryMilestones.filter(m => m.id !== id);
    saveMilestonesToSupabase();
    renderTimeline();
};

// ========================================
// 照片拼贴墙
// ========================================
window.renderCollageCategorySelect = function() {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return;
    container.innerHTML = '';

    const topLevel = categories.filter(c => !c.parent_id);
    if (topLevel.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>';
        return;
    }

    const select = document.createElement('select');
    select.id = 'collageCatLevel0';
    select.className = 'category-select';
    select.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;';
    select.onchange = () => window.onCollageCatLevelChange(0);
    select.innerHTML = `<option value="">全部照片</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
    container.appendChild(select);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:#888;margin:4px 0 0 0;';
    hint.textContent = '提示：选择父分类并留空子分类下拉，将自动包含所有子分类的照片';
    container.appendChild(hint);
};

window.onCollageCatLevelChange = function(level) {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return;
    const select = document.getElementById(`collageCatLevel${level}`);
    if (!select) return;

    const selectedValue = select.value;

    // 删除高于当前级别的选择器
    const selects = container.querySelectorAll('select');
    selects.forEach((s, i) => {
        if (i > level) s.remove();
    });

    // 如果选中了某个分类，显示其子分类
    if (selectedValue) {
        const children = categories.filter(c => String(c.parent_id) === String(selectedValue));
        if (children.length > 0) {
            const nextLevel = level + 1;
            const nextSelect = document.createElement('select');
            nextSelect.id = `collageCatLevel${nextLevel}`;
            nextSelect.className = 'category-select';
            nextSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;';
            nextSelect.onchange = () => window.onCollageCatLevelChange(nextLevel);
            nextSelect.innerHTML = `<option value="">包含所有子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
            container.appendChild(nextSelect);
        }
    }
};

window.getCollageSelectedCategoryId = function() {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return null;
    const selects = container.querySelectorAll('select');
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value;
    }
    return null;
};

window.generateCollage = async function() {
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const catId = window.getCollageSelectedCategoryId();
    let collagePhotos;
    if (catId) {
        const categoryIds = getCategoryAndChildrenIds(catId);
        const matchingPhotoIds = new Set();
        const pcEntries = Object.entries(photoCategories);
        pcEntries.forEach(([photoId, catIds]) => {
            if (catIds.some(cid => categoryIds.includes(cid))) {
                matchingPhotoIds.add(photoId);
            }
        });
        if (matchingPhotoIds.size === 0) {
            alert('所选分类下没有照片\n\n调试：选中分类ID=' + catId + '，含子类=' + categoryIds.length + '个，内存photoCategories有' + pcEntries.length + '条记录');
            return;
        }
        collagePhotos = photos.filter(p => matchingPhotoIds.has(p.id)).slice(0, 200);
    } else {
        collagePhotos = photos.slice(0, 200);
    }

    if (collagePhotos.length === 0) {
        alert('所选分类下没有照片');
        return;
    }

    const size = 800;
    canvas.width = size;
    canvas.height = size;

    // 背景
    ctx.fillStyle = '#fff0f5';
    ctx.fillRect(0, 0, size, size);

    // 预加载图片（最多 80 张用于拼贴）
    const imageCache = new Map();
    const photosToUse = collagePhotos.slice(0, 80);
    await Promise.all(photosToUse.map(async (photo) => {
        const url = getPhotoUrl(photo.storage_path);
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            imageCache.set(photo.id, img);
        } catch (e) { /* 忽略加载失败 */ }
    }));

    const loadedPhotos = photosToUse.filter(p => imageCache.has(p.id));
    if (loadedPhotos.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('无法加载照片', size / 2, size / 2);
        return;
    }

    // 参数化爱心路径: x = 16 sin³(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    // 范围: x∈[-16,16], y∈[-17,15], 宽32 高约22, 自然中心偏下
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

    // 裁剪到爱心区域，填充照片
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
    // 随机打乱
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

    // 描边爱心轮廓
    drawHeart();
    ctx.strokeStyle = '#ff6b81';
    ctx.lineWidth = 3;
    ctx.stroke();
};

window.downloadCollage = function() {
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = '爱心拼贴_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
};

// ========================================
// 回忆成就系统
// ========================================
const ACHIEVEMENTS = [
    { id: 'first_photo', icon: '🐣', name: '初出茅庐', desc: '上传第 1 张照片', check: (s) => s.photoCount >= 1 },
    { id: 'collector', icon: '📸', name: '记忆收集者', desc: '累计 100 张照片', check: (s) => s.photoCount >= 100 },
    { id: 'master', icon: '🏆', name: '回忆大师', desc: '累计 500 张照片', check: (s) => s.photoCount >= 500 },
    { id: 'organizer', icon: '📁', name: '整理达人', desc: '创建 5 个分类', check: (s) => s.categoryCount >= 5 },
    { id: 'commenter', icon: '💬', name: '留言能手', desc: '发表 10 条留言', check: (s) => s.commentCount >= 10 },
    { id: 'collector_20', icon: '⭐', name: '收藏家', desc: '收藏 20 张照片', check: (s) => s.favoriteCount >= 20 },
    { id: 'collector_50', icon: '❤️', name: '真爱印记', desc: '收藏 50 张照片', check: (s) => s.favoriteCount >= 50 },
    { id: 'witness', icon: '📅', name: '岁月见证', desc: '使用超过 365 天', check: (s) => s.daysSinceFirst >= 365 },
    { id: 'explorer', icon: '🗺️', name: '足迹遍布', desc: '标记 10 个地点', check: (s) => s.locationCount >= 10 },
];

window.loadAchievements = async function() {
    // 记录首次使用日期
    let firstLaunch = localStorage.getItem('app_first_launch_date');
    if (!firstLaunch) {
        firstLaunch = new Date().toISOString().slice(0, 10);
        localStorage.setItem('app_first_launch_date', firstLaunch);
    }
    const daysSinceFirst = Math.floor((new Date() - new Date(firstLaunch)) / (1000 * 60 * 60 * 24));

    // 查询统计数据
    let photoCount = 0, categoryCount = 0, commentCount = 0, favoriteCount = 0, locationCount = 0;
    try {
        const [{ count: pc }, { count: cc }, { count: coc }, { count: fc }, { count: lc }] = await Promise.all([
            supabase.from('photos').select('*', { count: 'exact', head: true }),
            supabase.from('categories').select('*', { count: 'exact', head: true }),
            supabase.from('comments').select('*', { count: 'exact', head: true }),
            supabase.from('photos').select('*', { count: 'exact', head: true }).eq('is_favorite', true),
            supabase.from('photos').select('*', { count: 'exact', head: true }).not('location_name', 'is', null),
        ]);
        photoCount = pc || 0;
        categoryCount = cc || 0;
        commentCount = coc || 0;
        favoriteCount = fc || 0;
        locationCount = lc || 0;
    } catch (e) {
        console.warn('加载成就统计失败:', e);
    }

    const stats = { photoCount, categoryCount, commentCount, favoriteCount, locationCount, daysSinceFirst };
    renderAchievements(stats);
};

function renderAchievements(stats) {
    const grid = document.getElementById('achievementsGrid');
    if (!grid) return;

    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const unlocked = a.check(stats);
        return `
            <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                <span class="achievement-icon">${a.icon}</span>
                <span class="achievement-name">${a.name}</span>
                <span class="achievement-desc">${unlocked ? a.desc : '???'}</span>
            </div>
        `;
    }).join('');
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

function highlightKeywords(text, searchValue) {
    if (!searchValue || !text) return text;
    const keywords = searchValue.trim().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) return text;
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function renderPhotos() {
    const grid = document.getElementById('photoGrid')
    const empty = document.getElementById('emptyState')
    const searchValue = document.getElementById('searchInput')?.value || '';

    if (photos.length === 0) {
        grid.style.display = 'none'
        empty.style.display = 'block'
        return
    }
    
    grid.style.display = 'grid'
    empty.style.display = 'none'

    // 分类筛选已在 loadPhotos() 中服务端完成，此处直接使用 photos
    // 如果当前分类下没有照片，但有子分类，显示子分类卡片
    const filteredPhotos = photos
    if (filteredPhotos.length === 0 && currentCategory && currentCategory !== 'all') {
        const currentCat = categories.find(c => c.id === parseInt(currentCategory))
        const childCategories = categories.filter(c => c.parent_id === parseInt(currentCategory))
        
        if (childCategories.length > 0) {
            grid.innerHTML = childCategories.map(cat => {
                const photoCount = getCategoryPhotoCount(cat.id)
                return `
                    <div class="photo-card category-card" onclick="window.filterByCategory('${cat.id}')">
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
                    <h3 title="${photo.name}">${favoriteIcon} ${highlightKeywords(photo.name, searchValue)}</h3>
                    ${photo.description ? `<p>${highlightKeywords(photo.description, searchValue)}</p>` : ''}
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
            .limit(10000)
        
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

    const locNameEl = document.getElementById('editLocationName')
    const latEl = document.getElementById('editLatitude')
    const lngEl = document.getElementById('editLongitude')
    if (locNameEl) locNameEl.value = currentPhoto.location_name || ''
    if (latEl) latEl.value = currentPhoto.latitude || ''
    if (lngEl) lngEl.value = currentPhoto.longitude || ''

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
    const location_name = (document.getElementById('editLocationName')?.value || '').trim() || null
    const latitude = parseFloat(document.getElementById('editLatitude')?.value) || null
    const longitude = parseFloat(document.getElementById('editLongitude')?.value) || null

    try {
        const { error } = await supabase
            .from('photos')
            .update({ name, description, latitude, longitude, location_name })
            .eq('id', id)
        
        if (error) throw error
        
        closeEditModal()
        
        const photo = photos.find(p => p.id === id)
        if (photo) {
            photo.name = name
            photo.description = description
            photo.latitude = latitude
            photo.longitude = longitude
            photo.location_name = location_name
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

// ========================================
//   相册功能
// ========================================

async function loadAlbums() {
    try {
        const { data, error } = await supabase
            .from('albums')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) throw error
        albums = data || []
        renderAlbumList()
    } catch (e) {
        console.error('加载相册失败:', e)
        document.getElementById('albumList').innerHTML = '<p class="loading">加载失败</p>'
    }
}

function renderAlbumList() {
    const container = document.getElementById('albumList')
    const empty = document.getElementById('albumEmpty')
    if (albums.length === 0) {
        container.innerHTML = ''
        empty.style.display = 'block'
        return
    }
    empty.style.display = 'none'
    container.innerHTML = albums.map(a => {
        const coverSrc = a.cover_photo_id
            ? (() => { const p = photos.find(ph => ph.id === a.cover_photo_id); return p ? getPhotoUrl(p.storage_path) : '' })()
            : ''
        return `
        <div class="album-card" onclick="window.openAlbumDetail(${a.id})">
            <div class="album-cover">
                ${coverSrc ? `<img src="${coverSrc}" alt="">` : '<div class="album-cover-placeholder">📸</div>'}
            </div>
            <div class="album-info">
                <h3>${escapeHtml(a.name)}</h3>
                <p>${escapeHtml(a.description || '')}</p>
            </div>
        </div>`
    }).join('')
}

window.openAddAlbumModal = function() {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.style.display = 'flex'
    modal.id = 'addAlbumModal'
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <span class="modal-close" onclick="document.getElementById('addAlbumModal').remove()">&times;</span>
            <h3>新建相册</h3>
            <div class="edit-form">
                <div class="form-group">
                    <label>相册名称</label>
                    <input type="text" id="albumNameInput" placeholder="输入相册名称">
                </div>
                <div class="form-group">
                    <label>描述（可选）</label>
                    <textarea id="albumDescInput" rows="2" placeholder="描述这个相册"></textarea>
                </div>
                <button class="btn btn-primary" onclick="window.createAlbum()">创建</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}

window.createAlbum = async function() {
    const name = document.getElementById('albumNameInput').value.trim()
    const description = document.getElementById('albumDescInput').value.trim()
    if (!name) { alert('请输入相册名称'); return }
    try {
        const { data, error } = await supabase
            .from('albums')
            .insert([{ name, description }])
            .select()
            .single()
        if (error) throw error
        albums.unshift(data)
        renderAlbumList()
        document.getElementById('addAlbumModal').remove()
    } catch (e) {
        console.error('创建相册失败:', e)
        alert('创建失败: ' + e.message)
    }
}

window.openAlbumDetail = async function(albumId) {
    currentAlbum = albums.find(a => a.id === albumId)
    if (!currentAlbum) return
    document.getElementById('albumsSection').style.display = 'none'
    document.getElementById('albumDetailSection').style.display = 'block'
    document.getElementById('albumDetailName').textContent = currentAlbum.name
    document.getElementById('albumDetailDesc').textContent = currentAlbum.description || ''
    albumSelectMode = false
    albumSelectedPhotos.clear()
    updateAlbumToolbar()
    await loadAlbumPhotos(albumId)
}

async function loadAlbumPhotos(albumId) {
    try {
        const { data, error } = await supabase
            .from('album_photos')
            .select('photo_id')
            .eq('album_id', albumId)
        if (error) throw error
        albumPhotos = (data || []).map(r => r.photo_id)
        document.getElementById('albumPhotoCount').textContent = `共 ${albumPhotos.length} 张照片`
        renderAlbumPhotos()
    } catch (e) {
        console.error('加载相册照片失败:', e)
    }
}

function renderAlbumPhotos() {
    const grid = document.getElementById('albumPhotosGrid')
    const empty = document.getElementById('albumPhotosEmpty')
    if (albumPhotos.length === 0) {
        grid.innerHTML = ''
        empty.style.display = 'block'
        return
    }
    empty.style.display = 'none'
    const albumPhotoObjs = photos.filter(p => albumPhotos.includes(p.id))
    grid.innerHTML = albumPhotoObjs.map(p => {
        const selectedClass = albumSelectMode && albumSelectedPhotos.has(p.id) ? ' selected' : ''
        const checkboxHtml = albumSelectMode
            ? `<div class="photo-checkbox"><input type="checkbox" ${albumSelectedPhotos.has(p.id) ? 'checked' : ''} onclick="event.stopPropagation();window.toggleAlbumPhotoCheck('${p.id}')"></div>`
            : ''
        const catNames = getPhotoCategoryNames(p.id)
        const imgSrc = getPhotoUrl(p.storage_path)
        return `
        <div class="photo-card${selectedClass}" onclick="${albumSelectMode ? `window.toggleAlbumPhotoCheck('${p.id}')` : `window.openPhotoModal('${p.id}')`}">
            ${checkboxHtml}
            <img src="${imgSrc}" alt="${escapeHtml(p.name || '')}" loading="lazy">
            <div class="photo-info">
                <h3>${escapeHtml(p.name || '未命名')}</h3>
                <p>${escapeHtml(p.description || '')}</p>
                <div class="photo-meta">
                    <span class="photo-category">${escapeHtml(catNames || '未分类')}</span>
                </div>
            </div>
        </div>`
    }).join('')
}

window.toggleAlbumPhotoCheck = function(photoId) {
    if (albumSelectedPhotos.has(photoId)) {
        albumSelectedPhotos.delete(photoId)
    } else {
        albumSelectedPhotos.add(photoId)
    }
    renderAlbumPhotos()
}

window.toggleAlbumPhotoSelectMode = function() {
    albumSelectMode = !albumSelectMode
    albumSelectedPhotos.clear()
    updateAlbumToolbar()
    renderAlbumPhotos()
}

function updateAlbumToolbar() {
    document.getElementById('albumSelectModeBtn').style.display = albumSelectMode ? 'none' : ''
    document.getElementById('albumAddPhotosBtn').style.display = albumSelectMode ? '' : 'none'
    document.getElementById('albumRemovePhotosBtn').style.display = albumSelectMode ? '' : 'none'
    document.getElementById('albumCancelSelectBtn').style.display = albumSelectMode ? '' : 'none'
}

window.openAddPhotosToAlbumModal = async function() {
    if (!currentAlbum) return
    // 获取不在相册中的照片
    const existingIds = new Set(albumPhotos)
    const availablePhotos = photos.filter(p => !existingIds.has(p.id))
    if (availablePhotos.length === 0) {
        alert('所有照片已在此相册中')
        return
    }
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.style.display = 'flex'
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;padding:24px;max-height:80vh;overflow-y:auto;">
            <span class="modal-close" style="position:sticky;top:0;float:right;font-size:28px;cursor:pointer;color:#999;" onclick="document.getElementById('addPhotosToAlbumModal').remove()">&times;</span>
            <h3>添加照片到相册</h3>
            <div class="category-select-list" style="max-height:50vh;overflow-y:auto;">
                ${availablePhotos.map(p => {
                    const imgSrc = getPhotoUrl(p.storage_path)
                    return `<label class="category-option">
                        <input type="checkbox" class="add-photo-check" value="${p.id}">
                        <img src="${imgSrc}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;" loading="lazy">
                        <span style="font-size:13px;flex:1;">${escapeHtml(p.name || '未命名')}</span>
                    </label>`
                }).join('')}
            </div>
            <button class="btn btn-primary" onclick="window.addPhotosToAlbum()" style="margin-top:12px;width:100%;">添加到相册</button>
        </div>
    `
    modal.id = 'addPhotosToAlbumModal'
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}

window.addPhotosToAlbum = async function() {
    if (!currentAlbum) return
    const checks = document.querySelectorAll('.add-photo-check:checked')
    if (checks.length === 0) { alert('请选择要添加的照片'); return }
    const rows = Array.from(checks).map(cb => ({
        album_id: currentAlbum.id,
        photo_id: cb.value
    }))
    try {
        const { error } = await supabase.from('album_photos').insert(rows)
        if (error) throw error
        document.getElementById('addPhotosToAlbumModal').remove()
        await loadAlbumPhotos(currentAlbum.id)
        if (currentAlbum.cover_photo_id === null || currentAlbum.cover_photo_id === undefined) {
            await supabase.from('albums').update({ cover_photo_id: rows[0].photo_id }).eq('id', currentAlbum.id)
            currentAlbum.cover_photo_id = rows[0].photo_id
        }
    } catch (e) {
        console.error('添加照片失败:', e)
        alert('添加失败: ' + e.message)
    }
}

window.removePhotosFromAlbum = async function() {
    if (!currentAlbum) return
    if (albumSelectedPhotos.size === 0) { alert('请先选择要移除的照片'); return }
    if (!confirm(`确认从相册中移除 ${albumSelectedPhotos.size} 张照片？`)) return
    try {
        const { error } = await supabase
            .from('album_photos')
            .delete()
            .eq('album_id', currentAlbum.id)
            .in('photo_id', [...albumSelectedPhotos])
        if (error) throw error
        albumSelectedPhotos.clear()
        await loadAlbumPhotos(currentAlbum.id)
    } catch (e) {
        console.error('移除照片失败:', e)
        alert('移除失败: ' + e.message)
    }
}

window.showAlbumList = function() {
    document.getElementById('albumDetailSection').style.display = 'none'
    document.getElementById('albumsSection').style.display = 'block'
    currentAlbum = null
    albumSelectMode = false
    albumSelectedPhotos.clear()
}

window.openEditAlbumModal = function() {
    if (!currentAlbum) return
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.style.display = 'flex'
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <span class="modal-close" onclick="document.getElementById('editAlbumModal').remove()">&times;</span>
            <h3>编辑相册</h3>
            <div class="edit-form">
                <div class="form-group">
                    <label>相册名称</label>
                    <input type="text" id="editAlbumNameInput" value="${escapeHtml(currentAlbum.name)}">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="editAlbumDescInput" rows="2">${escapeHtml(currentAlbum.description || '')}</textarea>
                </div>
                <button class="btn btn-primary" onclick="window.saveEditAlbum()">保存</button>
            </div>
        </div>
    `
    modal.id = 'editAlbumModal'
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}

window.saveEditAlbum = async function() {
    if (!currentAlbum) return
    const name = document.getElementById('editAlbumNameInput').value.trim()
    const description = document.getElementById('editAlbumDescInput').value.trim()
    if (!name) { alert('请输入相册名称'); return }
    try {
        const { error } = await supabase
            .from('albums')
            .update({ name, description })
            .eq('id', currentAlbum.id)
        if (error) throw error
        currentAlbum.name = name
        currentAlbum.description = description
        const idx = albums.findIndex(a => a.id === currentAlbum.id)
        if (idx >= 0) { albums[idx].name = name; albums[idx].description = description }
        document.getElementById('albumDetailName').textContent = name
        document.getElementById('albumDetailDesc').textContent = description || ''
        document.getElementById('editAlbumModal').remove()
    } catch (e) {
        console.error('编辑相册失败:', e)
        alert('编辑失败: ' + e.message)
    }
}

window.deleteAlbum = async function() {
    if (!currentAlbum) return
    if (!confirm(`确认删除相册"${currentAlbum.name}"？\n相册中的照片不会被删除，仅解散合集。`)) return
    try {
        const { error } = await supabase.from('albums').delete().eq('id', currentAlbum.id)
        if (error) throw error
        albums = albums.filter(a => a.id !== currentAlbum.id)
        window.showAlbumList()
        renderAlbumList()
    } catch (e) {
        console.error('删除相册失败:', e)
        alert('删除失败: ' + e.message)
    }
}

// ========================================
//   分享链接
// ========================================

function generateShareToken() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    const arr = new Uint8Array(16)
    if (typeof crypto !== 'undefined') {
        crypto.getRandomValues(arr)
    } else {
        for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256)
    }
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

window.openShareCurrentAlbum = function() {
    if (!currentAlbum) { alert('请先打开一个相册'); return }
    window.openCreateShareModal(currentAlbum.id)
}

window.openCreateShareModal = function(albumId) {
    if (!albumId) { alert('请先打开一个相册'); return }
    const album = albums.find(a => a.id === albumId)
    if (!album) return
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.style.display = 'flex'
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <span class="modal-close" onclick="document.getElementById('createShareModal').remove()">&times;</span>
            <h3>🔗 分享相册</h3>
            <p style="margin-bottom:12px;font-size:14px;">相册: ${escapeHtml(album.name)}</p>
            <div class="form-group">
                <label>有效期</label>
                <select id="shareExpirySelect" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="1">1 天</option>
                    <option value="7" selected>7 天</option>
                    <option value="30">30 天</option>
                    <option value="0">永久</option>
                </select>
            </div>
            <div id="shareLinkResult" style="display:none;margin-top:12px;">
                <div style="background:#f0f8f0;padding:12px;border-radius:8px;border:1px solid #c8e6c9;">
                    <p style="font-size:13px;color:#2e7d32;margin-bottom:8px;">分享链接已生成：</p>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="shareLinkInput" readonly style="flex:1;font-size:12px;padding:8px;border:1px solid #ddd;border-radius:4px;">
                        <button class="btn btn-primary" onclick="window.copyShareLink()">📋 复制</button>
                    </div>
                    <small id="shareExpiryNote" style="color:#666;display:block;margin-top:4px;"></small>
                </div>
            </div>
            <button class="btn btn-primary" id="createShareBtn" onclick="window.createShareLink(${albumId})" style="width:100%;margin-top:12px;">生成分享链接</button>
        </div>
    `
    modal.id = 'createShareModal'
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}

window.createShareLink = async function(albumId) {
    const days = parseInt(document.getElementById('shareExpirySelect').value)
    const token = generateShareToken()
    let expiresAt = null
    if (days > 0) {
        const d = new Date()
        d.setDate(d.getDate() + days)
        expiresAt = d.toISOString()
    }
    try {
        const { data, error } = await supabase
            .from('share_links')
            .insert([{ album_id: albumId, token, expires_at: expiresAt }])
            .select()
            .single()
        if (error) throw error
        const shareUrl = window.location.origin + '/share.html?token=' + token
        document.getElementById('shareLinkResult').style.display = 'block'
        document.getElementById('shareLinkInput').value = shareUrl
        document.getElementById('shareExpiryNote').textContent = days > 0
            ? `此链接将在 ${days} 天后过期（${new Date(expiresAt).toLocaleDateString('zh-CN')}）`
            : '永久有效'
        document.getElementById('createShareBtn').style.display = 'none'
    } catch (e) {
        console.error('创建分享链接失败:', e)
        alert('创建失败: ' + e.message)
    }
}

window.copyShareLink = function() {
    const input = document.getElementById('shareLinkInput')
    input.select()
    document.execCommand('copy')
    alert('链接已复制到剪贴板')
}

// ========================================
//   足迹护照
// ========================================

async function loadPassport() {
    try {
        const { data, error } = await supabase
            .from('photos')
            .select('id, name, storage_path, location_name')
            .not('location_name', 'is', null)
            .neq('location_name', '')
            .order('created_at', { ascending: false })
        if (error) throw error
        passportAllPhotos = data || []
        // 按 location_name 分组
        const grouped = {}
        for (const p of passportAllPhotos) {
            if (!grouped[p.location_name]) {
                grouped[p.location_name] = []
            }
            grouped[p.location_name].push(p)
        }
        passportData = Object.entries(grouped).map(([name, photos]) => ({
            name,
            count: photos.length,
            photos,
            coverPhoto: photos[0]
        }))
        sortPassportData()
        renderPassport()
    } catch (e) {
        console.error('加载足迹护照失败:', e)
        document.getElementById('passportStamps').innerHTML = '<p class="loading">加载失败</p>'
    }
}

function sortPassportData() {
    if (passportSortByPhotoCount) {
        passportData.sort((a, b) => b.count - a.count)
    } else {
        passportData.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
}

function getCityEmoji(locationName) {
    const name = locationName || ''
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
    }
    for (const [key, emoji] of Object.entries(map)) {
        if (name.includes(key)) return emoji
    }
    return '📍'
}

function renderPassport() {
    const container = document.getElementById('passportStamps')
    const locationPhotos = document.getElementById('passportLocationPhotos')
    const empty = document.getElementById('passportEmpty')
    locationPhotos.style.display = 'none'
    if (passportData.length === 0) {
        container.innerHTML = ''
        empty.style.display = 'block'
        return
    }
    empty.style.display = 'none'
    container.innerHTML = passportData.map((loc, i) => {
        const emoji = getCityEmoji(loc.name)
        const coverSrc = loc.coverPhoto ? getPhotoUrl(loc.coverPhoto.storage_path) : ''
        return `
        <div class="passport-stamp" style="animation-delay:${i * 0.05}s" onclick="window.openPassportLocation('${encodeURIComponent(loc.name)}')">
            <div class="stamp-emoji">${emoji}</div>
            <div class="stamp-name">${escapeHtml(loc.name)}</div>
            <div class="stamp-count">${loc.count} 张照片</div>
            ${coverSrc ? `<div class="stamp-cover"><img src="${coverSrc}" alt=""></div>` : ''}
        </div>`
    }).join('')
}

window.togglePassportSort = function() {
    passportSortByPhotoCount = !passportSortByPhotoCount
    document.getElementById('passportSortBtn').textContent = passportSortByPhotoCount ? '🔄 按数量排序' : '🔤 按字母排序'
    sortPassportData()
    renderPassport()
}

window.openPassportLocation = function(encodedName) {
    const name = decodeURIComponent(encodedName)
    const loc = passportData.find(l => l.name === name)
    if (!loc) return
    document.getElementById('passportStamps').style.display = 'none'
    document.getElementById('passportEmpty').style.display = 'none'
    const locationPhotos = document.getElementById('passportLocationPhotos')
    locationPhotos.style.display = 'block'
    document.getElementById('passportLocationName').textContent = name
    const grid = document.getElementById('passportLocationGrid')
    grid.innerHTML = loc.photos.map(p => {
        const imgSrc = getPhotoUrl(p.storage_path)
        return `
        <div class="photo-card" onclick="window.openPhotoModal('${p.id}')">
            <img src="${imgSrc}" alt="${escapeHtml(p.name || '')}" loading="lazy">
            <div class="photo-info">
                <h3>${escapeHtml(p.name || '未命名')}</h3>
            </div>
        </div>`
    }).join('')
}

window.closePassportLocation = function() {
    document.getElementById('passportStamps').style.display = ''
    const empty = document.getElementById('passportEmpty')
    if (passportData.length === 0) {
        empty.style.display = 'block'
    } else {
        empty.style.display = 'none'
    }
    document.getElementById('passportLocationPhotos').style.display = 'none'
}

// Helper: get photo category names
function getPhotoCategoryNames(photoId) {
    const catIds = photoCategories[photoId]
    if (!catIds || catIds.length === 0) return ''
    return catIds.map(id => {
        const cat = categories.find(c => c.id === id)
        return cat ? cat.name : ''
    }).filter(Boolean).join(', ')
}

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
