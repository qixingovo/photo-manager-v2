import { createClient } from '@supabase/supabase-js'

// Supabase 配置 - 请替换为你自己的
const SUPABASE_URL = 'https://hpwqtlxrfezpnxpgwlsx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd3F0bHhyZmV6cG54cGd3bHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDk2MzAsImV4cCI6MjA5MTAyNTYzMH0._yAiiFxsZbsOHf9ItMYU9ZRuNLjVDEbdZFwyh7U6C9w'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 状态
let categories = []
let photos = []

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    loadCategories()
    loadPhotos()
    
    // 搜索防抖
    let searchTimeout
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(loadPhotos, 300)
    })
    
    // 上传表单
    document.getElementById('uploadForm').addEventListener('submit', handleUpload)
})

// 加载分类
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
        alert('加载分类失败: ' + err.message)
    }
}

// 加载照片
async function loadPhotos() {
    const categoryFilter = document.getElementById('filterCategory').value
    const search = document.getElementById('searchInput').value
    
    try {
        let query = supabase
            .from('photos')
            .select('*, categories(name)')
            .order('created_at', { ascending: false })
        
        if (categoryFilter && categoryFilter !== 'all') {
            query = query.eq('category_id', categoryFilter)
        }
        
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
        }
        
        const { data, error } = await query
        
        if (error) throw error
        
        photos = data || []
        renderPhotos()
    } catch (err) {
        console.error('加载照片失败:', err)
        alert('加载照片失败: ' + err.message)
    }
}

// 渲染分类列表
function renderCategories() {
    const container = document.getElementById('categoryList')
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>'
        return
    }
    
    container.innerHTML = categories.map(cat => {
        const count = photos.filter(p => p.category_id === cat.id).length
        return `
            <div class="category-tag">
                <span>${cat.name}</span>
                <span class="count">${count}</span>
                <button class="btn-danger" onclick="deleteCategory('${cat.id}')" title="删除">×</button>
            </div>
        `
    }).join('')
}

// 更新分类选择器
function updateCategorySelects() {
    const uploadSelect = document.getElementById('categorySelect')
    const filterSelect = document.getElementById('filterCategory')
    
    const options = categories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('')
    
    uploadSelect.innerHTML = `<option value="">选择分类（可选）</option>${options}`
    filterSelect.innerHTML = `<option value="all">全部分类</option>${options}`
}

// 创建分类
async function createCategory() {
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

// 删除分类
async function deleteCategory(id) {
    if (!confirm('确定删除该分类？照片不会删除')) return
    
    try {
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        
        await loadCategories()
        await loadPhotos()
    } catch (err) {
        alert('删除分类失败: ' + err.message)
    }
}

// 上传照片
async function handleUpload(e) {
    e.preventDefault()
    
    const fileInput = document.getElementById('photoInput')
    const file = fileInput.files[0]
    
    if (!file) {
        alert('请选择照片')
        return
    }
    
    const name = document.getElementById('photoName').value.trim() || file.name
    const description = document.getElementById('photoDesc').value.trim()
    const categoryId = document.getElementById('categorySelect').value || null
    
    const btn = e.target.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.textContent = '上传中...'
    
    try {
        // 生成唯一文件名
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
        const storagePath = `${fileName}`
        
        // 上传文件到 Storage
        const { error: uploadError } = await supabase.storage
            .from('photo')
            .upload(storagePath, file, {
                cacheControl: '3600',
                upsert: false
            })
        
        if (uploadError) throw uploadError
        
        // 获取公开 URL
        const { data: urlData } = supabase.storage
            .from('photo')
            .getPublicUrl(storagePath)
        
        // 保存照片信息到数据库
        const { error: insertError } = await supabase
            .from('photos')
            .insert([{
                name,
                description,
                category_id: categoryId,
                storage_path: storagePath,
                original_name: file.name,
                size: file.size
            }])
        
        if (insertError) throw insertError
        
        // 清空表单
        fileInput.value = ''
        document.getElementById('photoName').value = ''
        document.getElementById('photoDesc').value = ''
        document.getElementById('categorySelect').value = ''
        
        await loadPhotos()
        await loadCategories()
        
        alert('上传成功！')
    } catch (err) {
        alert('上传失败: ' + err.message)
    } finally {
        btn.disabled = false
        btn.textContent = '上传'
    }
}

// 获取照片公开URL
function getPhotoUrl(storagePath) {
    const { data } = supabase.storage
        .from('photo')
        .getPublicUrl(storagePath)
    return data.publicUrl
}

// 渲染照片
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
            <div class="photo-card">
                <img src="${photoUrl}" alt="${photo.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🖼️</text></svg>'">
                <div class="photo-info">
                    <h3 title="${photo.name}">${photo.name}</h3>
                    ${photo.description ? `<p>${photo.description}</p>` : ''}
                    <div class="photo-meta">
                        ${photo.categories 
                            ? `<span class="photo-category">${photo.categories.name}</span>` 
                            : '<span class="photo-category" style="background:#e9ecef">未分类</span>'
                        }
                        <div class="photo-actions">
                            <button class="btn-delete" onclick="deletePhoto('${photo.id}', '${photo.storage_path}')" title="删除">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `
    }).join('')
}

// 删除照片
async function deletePhoto(id, storagePath) {
    if (!confirm('确定删除该照片？')) return
    
    try {
        // 删除 Storage 中的文件
        const { error: storageError } = await supabase.storage
            .from('photo')
            .remove([storagePath])
        
        if (storageError) throw storageError
        
        // 删除数据库记录
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
