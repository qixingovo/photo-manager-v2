// src/desktop/views/photo-grid.js — 照片网格、标题、分页、收藏
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

const PHOTOS_PER_PAGE = Main.PHOTOS_PER_PAGE || 20;

function getCategoryPhotoCount(catId) {
    const strCatId = String(catId)
    return Object.values(Main.photoCategories).filter(catIds => catIds.includes(strCatId)).length
}

function updatePhotosTitle() {
    const titleEl = document.getElementById('photosTitle')
    if (Main.showFavoritesOnly) {
        titleEl.innerHTML = '❤️ 收藏照片'
    } else if (Main.currentCategory && Main.currentCategory !== 'all') {
        const cat = Main.categories.find(c => c.id === Main.currentCategory)
        let breadcrumb = `<a onclick="window.clearCategoryFilter()">📷 照片浏览</a>`

        if (cat && cat.parent_id) {
            const parent = Main.categories.find(c => c.id === cat.parent_id)
            if (parent) {
                breadcrumb += ` / <a onclick="window.filterByCategory('${parent.id}')">${CommonUtils.escapeHtml(parent.name)}</a>`
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

    if (Main.photos.length === 0 && Main.currentCategory && Main.currentCategory !== 'all') {
        // 检查当前分类是否有子分类
        const children = Main.categories.filter(c => c.parent_id === Main.currentCategory)
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
                                ${CommonUtils.escapeHtml(child.name)} (${count})
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

    const totalPages = Math.max(1, Math.ceil(Main.totalPhotos / PHOTOS_PER_PAGE))
    const hasPrev = Main.currentPage > 1
    const hasNext = Main.currentPage < totalPages

    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" ${hasPrev ? '' : 'disabled'} onclick="${hasPrev ? 'window.prevPage()' : ''}">上一页</button>
            <span class="pagination-info">第 ${Main.currentPage} / ${totalPages} 页 · 共 ${Main.totalPhotos} 张</span>
            <button class="pagination-btn" ${hasNext ? '' : 'disabled'} onclick="${hasNext ? 'window.nextPage()' : ''}">下一页</button>
        </div>
    `
}

function prevPage() {
    if (Main.currentPage > 1) {
        Main.currentPage--
        window.loadPhotos()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

function nextPage() {
    const totalPages = Math.max(1, Math.ceil(Main.totalPhotos / PHOTOS_PER_PAGE))
    if (Main.currentPage < totalPages) {
        Main.currentPage++
        window.loadPhotos()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

function clearCategoryFilter() {
    Main.currentCategory = 'all'
    Main.currentPage = 1
    Main.showFavoritesOnly = false
    // 重置级联选择器
    const container = document.getElementById('filterCategoryCascade')
    if (container) {
        const topLevel = Main.categories.filter(c => !c.parent_id)
        container.innerHTML = ''
        const select = document.createElement('select')
        select.id = 'filterCatLevel0'
        select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;'
        select.onchange = () => window.onFilterCatLevelChange(0)
        select.innerHTML = `<option value="all">全部分类</option>${topLevel.map(cat => {
            const count = getCategoryPhotoCount(cat.id)
            return `<option value="${cat.id}">${cat.name} (${count})</option>`
        }).join('')}`
        container.appendChild(select)
    }
    const favBtn = document.getElementById('favoritesFilterBtn')
    favBtn.classList.remove('active')
    favBtn.textContent = '❤️ 收藏'
    window.loadPhotos()
}

function onCategoryFilterChange() {
    Main.currentCategory = document.getElementById('filterCategory').value
    window.loadPhotos()
}

function toggleFavoritesFilter() {
    Main.showFavoritesOnly = !Main.showFavoritesOnly
    Main.currentPage = 1
    const btn = document.getElementById('favoritesFilterBtn')
    if (Main.showFavoritesOnly) {
        btn.classList.add('active')
        btn.textContent = '💔 取消收藏'
        Main.currentCategory = 'all'
        document.getElementById('filterCategory').value = 'all'
    } else {
        btn.classList.remove('active')
        btn.textContent = '❤️ 收藏'
    }
    window.loadPhotos()
}

async function toggleFavorite() {
    if (!Main.currentPhoto) return

    try {
        const newFavorite = !Main.currentPhoto.is_favorite
        const { error } = await supabase
            .from('photos')
            .update({ is_favorite: newFavorite })
            .eq('id', Main.currentPhoto.id)

        if (error) throw error

        Main.currentPhoto.is_favorite = newFavorite
        window.updateFavoriteButton()

        if (Main.showFavoritesOnly && !newFavorite) {
            window.loadPhotos()
        }
    } catch (err) {
        alert('操作失败: ' + err.message)
    }
}

function getPhotoUrl(storagePath) {
    const { data } = supabase.storage
        .from('photo')
        .getPublicUrl(storagePath)
    return data.publicUrl
}

function formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}

function renderPhotos() {
    const grid = document.getElementById('photoGrid')
    const empty = document.getElementById('emptyState')
    const searchValue = document.getElementById('searchInput')?.value || '';

    if (Main.photos.length === 0) {
        grid.style.display = 'none'
        empty.style.display = 'block'
        return
    }

    grid.style.display = 'grid'
    empty.style.display = 'none'

    // 分类筛选已在 loadPhotos() 中服务端完成，此处直接使用 photos
    // 如果当前分类下没有照片，但有子分类，显示子分类卡片
    const filteredPhotos = Main.photos
    if (filteredPhotos.length === 0 && Main.currentCategory && Main.currentCategory !== 'all') {
        const currentCat = Main.categories.find(c => String(c.id) === String(Main.currentCategory))
        const childCategories = Main.categories.filter(c => String(c.parent_id) === String(Main.currentCategory))

        if (childCategories.length > 0) {
            grid.innerHTML = childCategories.map(cat => {
                const photoCount = getCategoryPhotoCount(cat.id)
                return `
                    <div class="photo-card category-card" onclick="window.filterByCategory('${cat.id}')">
                        <div class="category-icon">📁</div>
                        <div class="category-info">
                            <h3>${CommonUtils.escapeHtml(cat.name)}</h3>
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
        const isSelected = Main.selectedPhotos.has(photo.id)
        const checkboxHtml = Main.selectMode ? `
            <div class="photo-checkbox" onclick="event.stopPropagation(); window.togglePhotoSelect('${photo.id}')">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.togglePhotoSelect('${photo.id}')">
            </div>
        ` : ''

        // 从 photoCategories 映射获取分类名称
        const photoCats = Main.photoCategories[String(photo.id)] || []
        const catNames = photoCats.map(cid => {
            const cat = Main.categories.find(c => String(c.id) === cid)
            return cat ? cat.name : ''
        }).filter(n => n)
        const categoryHtml = catNames.length > 0
            ? `<span class="photo-category">${CommonUtils.escapeHtml(catNames.join(', '))}</span>`
            : '<span class="photo-category" style="background:#e9ecef">未分类</span>'

        return `
            <div class="photo-card ${isSelected ? 'selected' : ''}" onclick="${Main.selectMode ? "event.stopPropagation(); window.togglePhotoSelect('" + photo.id + "')" : "window.openPhotoModal('" + photo.id + "')"}">
                ${checkboxHtml}
                <img src="${photoUrl}" alt="${CommonUtils.escapeHtml(photo.name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🖼️</text></svg>'">
                <div class="photo-info">
                    <h3 title="${CommonUtils.escapeHtml(photo.name)}">${favoriteIcon} ${CommonUtils.highlightKeywords(photo.name, searchValue)}</h3>
                    ${photo.description ? `<p>${CommonUtils.highlightKeywords(photo.description, searchValue)}</p>` : ''}
                    <div class="photo-meta">
                        ${categoryHtml}
                        ${Main.selectMode ? '' : `<div class="photo-actions" onclick="event.stopPropagation()">
                            <button class="btn-delete" onclick="window.deletePhoto('${photo.id}', '${CommonUtils.escapeHtml(photo.storage_path).replace(/'/g,"\\'")}')" title="删除">🗑️</button>
                        </div>`}
                    </div>
                </div>
            </div>
        `
    }).join('')
}

// 挂载到 window 以兼容 HTML onclick 属性
window.getCategoryPhotoCount = getCategoryPhotoCount;
window.updatePhotosTitle = updatePhotosTitle;
window.updateEmptyState = updateEmptyState;
window.renderPagination = renderPagination;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.clearCategoryFilter = clearCategoryFilter;
window.onCategoryFilterChange = onCategoryFilterChange;
window.toggleFavoritesFilter = toggleFavoritesFilter;
window.toggleFavorite = toggleFavorite;
window.getPhotoUrl = getPhotoUrl;
window.formatTime = formatTime;
window.renderPhotos = renderPhotos;

export {
    getCategoryPhotoCount,
    updatePhotosTitle,
    updateEmptyState,
    renderPagination,
    prevPage,
    nextPage,
    clearCategoryFilter,
    onCategoryFilterChange,
    toggleFavoritesFilter,
    toggleFavorite,
    getPhotoUrl,
    formatTime,
    renderPhotos
};
