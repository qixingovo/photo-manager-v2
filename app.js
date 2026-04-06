import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hpwqtlxrfezpnxpgwlsx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd3F0bHhyZmV6cG54cGd3bHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDk2MzAsImV4cCI6MjA5MTAyNTYzMH0._yAiiFxsZbsOHf9ItMYU9ZRuNLjVDEbdZFwyh7U6C9w'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let categories = []
let photos = []
let currentCategory = 'all'
let currentPhoto = null

document.addEventListener('DOMContentLoaded', () => {
    loadCategories()
    loadPhotos()
    
    const searchTimeout
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(loadPhotos, 300)
    })
    
    document.getElementById('uploadForm').addEventListener('submit', handleUpload)
    document.getElementById('editForm').addEventListener('submit', handleEdit)
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
        
        if (currentCategory && currentCategory !== 'all') {
            query = query.eq('category_id', currentCategory)
        }
        
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
        }
        
        const { data, error } = await query
        
        if (error) throw error
        
        photos = data || []
        renderPhotos()
        updatePhotosTitle()
    } catch (err) {
        console.error('加载照片失败:', err)
        alert('加载照片失败: ' + err.message)
    }
}

function updatePhotosTitle() {
    const titleEl = document.getElementById('photosTitle')
    if (currentCategory && currentCategory !== 'all') {
        const cat = categories.find(c => c.id === currentCategory)
        titleEl.innerHTML = `<a onclick="clearCategoryFilter()">📷 照片浏览</a> / ${cat ? cat.name : ''}`
    } else {
        titleEl.innerHTML = '📷 照片浏览'
    }
}

function clearCategoryFilter() {
    currentCategory = 'all'
    document.getElementById('filterCategory').value = 'all'
    loadPhotos()
}

function onCategoryFilterChange() {
    currentCategory = document.getElementById('filterCategory').value
    loadPhotos()
}

function renderCategories() {
    const container = document.getElementById('categoryList')
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>'
        return
    }
    
    container.innerHTML = categories.map(cat => {
        const count = photos.filter(p => p.category_id === cat.id).length
        const isActive = currentCategory === cat.id ? 'active' : ''
        return `
            <div class="category-tag ${isActive}" onclick="filterByCategory('${cat.id}')">
                <span>${cat.name}</span>
                <span class="count">${count}</span>
                <button class="btn-danger" onclick="event.stopPropagation(); window.deleteCategory('${cat.id}')" title="删除">×</button>
            </div>
        `
    }).join('')
}

function filterByCategory(categoryId) {
    currentCategory = categoryId
    document.getElementById('filterCategory').value = categoryId
    loadPhotos()
}

function updateCategorySelects() {
    const uploadSelect = document.getElementById('categorySelect')
    const filterSelect = document.getElementById('filterCategory')
    
    const options = categories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('')
    
    uploadSelect.innerHTML = `<option value="">选择分类（可选）</option>${options}`
    filterSelect.innerHTML = `<option value="all">全部分类</option>${options}`
    
    if (currentCategory !== 'all') {
        filterSelect.value = currentCategory
    }
}

window.createCategory = async function() {
    const input = document.getElementById('newCategory')
    const name = input.value.trim()
    
    if (!name) {
        alert('请输入分类名称')
        return
    }
    
    try {
        const { data, error } = await supabase
            .from('categories')
            .insert([{ name }])
            .select()
            .single()
        
        if (error) throw error
        
        input.value = ''
        await loadCategories()
    } catch (err) {
        alert('创建分类失败: ' + err.message)
    }
}

window.deleteCategory = async function(id) {
    if (!confirm('确定删除该分类？照片不会删除')) return
    
    try {
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        
        if (currentCategory === id) {
            currentCategory = 'all'
        }
        
        await loadCategories()
        await loadPhotos()
    } catch (err) {
        alert('删除分类失败: ' + err.message)
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
            
            const { error: insertError } = await supabase
                .from('photos')
                .insert([{
                    name: fileName,
                    description,
                    category_id: categoryId,
                    storage_path: uniqueName,
                    original_name: file.name,
                    size: file.size
                }])
            
            if (insertError) throw insertError
            
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
        return `
            <div class="photo-card" onclick="openPhotoModal('${photo.id}')">
                <img src="${photoUrl}" alt="${photo.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🖼️</text></svg>'">
                <div class="photo-info">
                    <h3 title="${photo.name}">${photo.name}</h3>
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

window.openPhotoModal = function(photoId) {
    currentPhoto = photos.find(p => p.id === photoId)
    if (!currentPhoto) return
    
    const photoUrl = getPhotoUrl(currentPhoto.storage_path)
    
    document.getElementById('modalImage').src = photoUrl
    document.getElementById('modalPhotoName').textContent = currentPhoto.name
    document.getElementById('modalPhotoDesc').textContent = currentPhoto.description || '暂无描述'
    document.getElementById('modalPhotoSize').textContent = formatFileSize(currentPhoto.size)
    
    const categoryEl = document.getElementById('modalPhotoCategory')
    if (currentPhoto.categories) {
        categoryEl.textContent = currentPhoto.categories.name
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
    
    document.getElementById('photoModal').classList.add('active')
}

window.closeModal = function() {
    document.getElementById('photoModal').classList.remove('active')
    currentPhoto = null
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
    
    const container = document.getElementById('categoryRadioList')
    container.innerHTML = categories.map(cat => `
        <label class="category-option">
            <input type="radio" name="newCategory" value="${cat.id}" ${currentPhoto.category_id === cat.id ? 'checked' : ''}>
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
    
    const newCategoryId = document.querySelector('input[name="newCategory"]:checked')?.value || null
    
    try {
        const { error } = await supabase
            .from('photos')
            .update({ category_id: newCategoryId || null })
            .eq('id', currentPhoto.id)
        
        if (error) throw error
        
        closeCategoryModal()
        closeModal()
        
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
