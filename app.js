import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hpwqtlxrfezpnxpgwlsx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd3F0bHhyZmV6cG54cGd3bHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDk2MzAsImV4cCI6MjA5MTAyNTYzMH0._yAiiFxsZbsOHf9ItMYU9ZRuNLjVDEbdZFwyh7U6C9w'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let categories = []
let photos = []
let photoCategories = [] // photo_id -> category_ids 映射
let currentCategory = 'all'
let currentPhoto = null
let showFavoritesOnly = false
let currentComments = []

document.addEventListener('DOMContentLoaded', () => {
    loadCategories()
    loadPhotos()
    
    let searchTimeout
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(loadPhotos, 300)
    })
    
    document.getElementById('uploadForm').addEventListener('submit', handleUpload)
})

async function loadCategories() {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('created_at', { ascending: false })
        
        if (error) throw error
        
        categories = data || []
        renderCategories()
        updateCategorySelects()
    } catch (err) {
        console.error('加载分类失败:', err)
    }
}

async function loadPhotos() {
    const search = document.getElementById('searchInput').value
    
    try {
        let query = supabase
            .from('photos')
            .select('*, categories(name)')
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
        
        // 如果有分类筛选
        if (currentCategory && currentCategory !== 'all') {
            // 获取该分类及其子分类的所有照片ID
            const categoryIds = getCategoryAndChildrenIds(currentCategory)
            photos = photos.filter(p => {
                const photoCats = photoCategories[p.id] || []
                return categoryIds.some(cid => photoCats.includes(cid))
            })
        }
        
        // 如果有分类筛选，只显示该分类的照片
        if (currentCategory && currentCategory !== 'all' && !showFavoritesOnly) {
            // 需要获取每个照片的分类信息
            const photoIds = photos.map(p => p.id)
            if (photoIds.length > 0) {
                const { data: pcData } = await supabase
                    .from('photo_categories')
                    .select('photo_id, category_id')
                    .in('photo_id', photoIds)
                
                photoCategories = {}
                if (pcData) {
                    pcData.forEach(pc => {
                        if (!photoCategories[pc.photo_id]) {
                            photoCategories[pc.photo_id] = []
                        }
                        photoCategories[pc.photo_id].push(pc.category_id)
                    })
                }
            }
            
            photos = photos.filter(p => {
                const photoCats = photoCategories[p.id] || []
                return photoCats.includes(currentCategory)
            })
        }
        
        renderPhotos()
        updatePhotosTitle()
    } catch (err) {
        console.error('加载照片失败:', err)
    }
}

function getCategoryAndChildrenIds(categoryId) {
    const ids = [categoryId]
    const children = categories.filter(c => c.parent_id === categoryId)
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

window.clearCategoryFilter = function() {
    currentCategory = 'all'
    showFavoritesOnly = false
    document.getElementById('filterCategory').value = 'all'
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

function updateFavoriteButton() {
    const btn = document.getElementById('favoriteBtn')
    if (currentPhoto && currentPhoto.is_favorite) {
        btn.textContent = '❤️ 已收藏'
    } else {
        btn.textContent = '🤍 收藏'
    }
}

function renderCategories() {
    const container = document.getElementById('categoryList')
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>'
        return
    }
    
    // 获取顶级分类
    const topLevel = categories.filter(c => !c.parent_id)
    
    container.innerHTML = topLevel.map(parent => {
        const children = categories.filter(c => c.parent_id === parent.id)
        const isActive = currentCategory === parent.id ? 'active' : ''
        const parentCount = photos.filter(p => {
            const photoCats = photoCategories[p.id] || []
            return photoCats.includes(parent.id)
        }).length
        const hasChildren = children.length > 0
        
        const childrenHtml = hasChildren ? `
            <div class="category-children" id="children-${parent.id}">
                ${children.map(child => {
                    const childCount = photos.filter(p => {
                        const photoCats = photoCategories[p.id] || []
                        return photoCats.includes(child.id)
                    }).length
                    const childActive = currentCategory === child.id ? 'active' : ''
                    return `
                        <div class="category-tag child ${childActive}">
                            <span onclick="filterByCategory('${child.id}')">${child.name}</span>
                            <span class="count">${childCount}</span>
                            <button onclick="openEditCategoryModal('${child.id}', '${child.name}')" title="编辑" style="background:none;border:none;cursor:pointer;padding:0 2px;">✏️</button>
                            <button class="btn-danger" onclick="event.stopPropagation(); window.deleteCategory('${child.id}')" title="删除">×</button>
                        </div>
                    `
                }).join('')}
            </div>
        ` : ''
        
        return `
            <div class="category-parent">
                <div class="category-tag ${isActive}" onclick="toggleCategoryChildren('${parent.id}', event)">
                    <span>${parent.name}${hasChildren ? ' ▼' : ''}</span>
                    <span class="count">${parentCount}</span>
                    <button onclick="event.stopPropagation(); openEditCategoryModal('${parent.id}', '${parent.name}')" title="编辑" style="background:none;border:none;cursor:pointer;padding:0 2px;">✏️</button>
                    <button class="btn-danger" onclick="event.stopPropagation(); window.deleteCategory('${parent.id}')" title="删除">×</button>
                </div>
                ${childrenHtml}
            </div>
        `
    }).join('')
}

window.toggleCategoryChildren = function(parentId, event) {
    if (event) event.stopPropagation()
    
    const childrenEl = document.getElementById('children-' + parentId)
    const parentTag = document.querySelector('.category-parent > .category-tag')
    
    if (!childrenEl) return
    
    const isHidden = childrenEl.style.display === 'none' || childrenEl.style.display === ''
    
    if (isHidden) {
        childrenEl.style.display = 'flex'
    } else {
        childrenEl.style.display = 'none'
    }
}

window.filterByCategory = function(categoryId) {
    currentCategory = categoryId
    document.getElementById('filterCategory').value = categoryId
    loadPhotos()
}

function updateCategorySelects() {
    const uploadSelect = document.getElementById('categorySelect')
    const filterSelect = document.getElementById('filterCategory')
    const parentSelect = document.getElementById('parentCategorySelect')
    
    const options = categories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('')
    
    uploadSelect.innerHTML = `<option value="">选择分类（可选）</option>${options}`
    filterSelect.innerHTML = `<option value="all">全部分类</option>${options}`
    parentSelect.innerHTML = `<option value="">作为顶级分类</option>${options}`
    
    if (currentCategory !== 'all') {
        filterSelect.value = currentCategory
    }
}

window.createCategory = async function() {
    const input = document.getElementById('newCategory')
    const name = input.value.trim()
    const parentId = document.getElementById('parentCategorySelect').value || null
    
    if (!name) {
        alert('请输入分类名称')
        return
    }
    
    try {
        const { data, error } = await supabase
            .from('categories')
            .insert([{ name, parent_id: parentId }])
            .select()
            .single()
        
        if (error) throw error
        
        input.value = ''
        document.getElementById('parentCategorySelect').value = ''
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
    document.getElementById('editCategoryModal').classList.add('active')
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
    const categoryId = document.getElementById('categorySelect').value || null
    
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
            const ext = file.name.split('.').pop()
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
            
            const { error: uploadError } = await supabase.storage
                .from('photo')
                .upload(uniqueName, file, {
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
                    size: file.size,
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
    document.getElementById('categorySelect').value = ''
    
    await loadPhotos()
    await loadCategories()
    
    if (failCount === 0) {
        alert(`上传成功！${successCount}张照片已上传`)
    } else {
        alert(`上传完成：${successCount}张成功，${failCount}张失败`)
    }
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
            photoCategories[photoId] = data.map(d => d.category_id)
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
            <div>${c.content}</div>
            <div class="comment-time">${formatTime(c.created_at)}</div>
        </div>
    `).join('')
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
    
    grid.innerHTML = photos.map(photo => {
        const photoUrl = getPhotoUrl(photo.storage_path)
        const favoriteIcon = photo.is_favorite ? '❤️' : '🤍'
        return `
            <div class="photo-card" onclick="openPhotoModal('${photo.id}')">
                <img src="${photoUrl}" alt="${photo.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🖼️</text></svg>'">
                <div class="photo-info">
                    <h3 title="${photo.name}">${favoriteIcon} ${photo.name}</h3>
                    ${photo.description ? `<p>${photo.description}</p>` : ''}
                    <div class="photo-meta">
                        ${photo.categories 
                            ? `<span class="photo-category">${photo.categories.name}</span>` 
                            : '<span class="photo-category" style="background:#e9ecef">未分类</span>'
                        }
                        <div class="photo-actions" onclick="event.stopPropagation()">
                            <button class="btn-delete" onclick="window.deletePhoto('${photo.id}', '${photo.storage_path}')" title="删除">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `
    }).join('')
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
    const photoCats = photoCategories[photoId] || []
    if (photoCats.length > 0) {
        const catNames = photoCats.map(cid => {
            const cat = categories.find(c => c.id === cid)
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

async function handleEdit(e) {
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
    
    const container = document.getElementById('categoryCheckboxList')
    const photoCats = photoCategories[currentPhoto.id] || []
    const noCatCheckbox = document.getElementById('noCategoryCheck')
    noCatCheckbox.checked = photoCats.length === 0
    
    container.innerHTML = categories.map(cat => `
        <label class="category-option">
            <input type="checkbox" name="photoCategory" value="${cat.id}" ${photoCats.includes(cat.id) ? 'checked' : ''}>
            <span>${cat.name}</span>
        </label>
    `).join('')
    
    document.getElementById('categoryModal').classList.add('active')
}

window.closeCategoryModal = function() {
    document.getElementById('categoryModal').classList.remove('active')
}

async function saveCategoryChange() {
    if (!currentPhoto) return
    
    try {
        // 获取选中的分类
        const checkboxes = document.querySelectorAll('input[name="photoCategory"]:checked')
        const selectedCategories = Array.from(checkboxes).map(cb => cb.value)
        
        // 先删除旧的关联
        await supabase
            .from('photo_categories')
            .delete()
            .eq('photo_id', currentPhoto.id)
        
        // 添加新的关联
        if (selectedCategories.length > 0) {
            const inserts = selectedCategories.map(cid => ({
                photo_id: currentPhoto.id,
                category_id: cid
            }))
            
            await supabase
                .from('photo_categories')
                .insert(inserts)
        }
        
        // 更新本地缓存
        photoCategories[currentPhoto.id] = selectedCategories
        
        closeCategoryModal()
        
        // 更新弹窗中的分类显示
        const categoryEl = document.getElementById('modalPhotoCategory')
        if (selectedCategories.length > 0) {
            const catNames = selectedCategories.map(cid => {
                const cat = categories.find(c => c.id === cid)
                return cat ? cat.name : ''
            }).join(', ')
            categoryEl.textContent = catNames
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
        await supabase
            .from('photo_categories')
            .delete()
            .eq('photo_id', id)
        
        // 删除留言
        await supabase
            .from('comments')
            .delete()
            .eq('photo_id', id)
        
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
