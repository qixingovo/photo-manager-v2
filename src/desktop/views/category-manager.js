// src/desktop/views/category-manager.js — 分类管理、级联选择器、分类 CRUD
import { supabase } from '../../core/supabase.js';
import * as Main from '../main.js';

function getCategoryPhotoCount(catId) {
    const strCatId = String(catId)
    return Object.values(Main.photoCategories).filter(catIds => catIds.includes(strCatId)).length
}

export function toggleMarkCategory(catId) {
    if (Main.markedCategories.has(catId)) {
        Main.markedCategories.delete(catId)
    } else {
        Main.markedCategories.add(catId)
    }
    localStorage.setItem('markedCategories', JSON.stringify([...Main.markedCategories]))
    updateMarkedCount()
    renderCategories()
    renderMarkedCategoriesList()
}

export function updateMarkedCount() {
    const el = document.getElementById('markedCount')
    if (el) el.textContent = Main.markedCategories.size
}

export function renderMarkedCategoriesList() {
    const container = document.getElementById('markedCategoriesList')
    const widget = document.getElementById('markedWidget')

    if (!container || !widget) return

    if (Main.markedCategories.size === 0) {
        widget.style.display = 'none'
        return
    }

    widget.style.display = 'block'

    // 显示所有标记的分类，不过滤（因为categories可能还没加载完）
    container.innerHTML = [...Main.markedCategories].map(catId => {
        const cat = Main.categories.find(c => c.id === catId)
        const displayName = cat ? cat.name : '未知分类'
        return `
            <div class="marked-item" onclick="window.filterByCategory('${catId}')">
                <span>${CommonUtils.escapeHtml(displayName)}</span>
                <span class="unmark-btn" onclick="event.stopPropagation(); window.toggleMarkCategory('${catId}')">×</span>
            </div>
        `
    }).join('')
}

export function toggleMarkedCategories(event) {
    if (event) event.stopPropagation()
    const widget = document.getElementById('markedWidget')
    if (Main.markedCategories.size === 0) {
        return
    }
    widget.classList.toggle('expanded')
}

// 渲染分类管理区域（层级结构）
export function renderCategories() {
    const container = document.getElementById('categoryList')

    if (Main.categories.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>'
        return
    }

    // 获取顶级分类（没有父分类的）
    const topLevel = Main.categories.filter(c => !c.parent_id)

    container.innerHTML = topLevel.map(parent => renderCategoryItem(parent, 0)).join('')
}

// 渲染照片浏览的分类下拉（扁平列表）
export function renderCategorySelect() {
    const container = document.getElementById('filterCategoryCascade')
    if (!container) return
    container.innerHTML = ''

    const topLevel = Main.categories.filter(c => !c.parent_id)
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
    if (Main.currentCategory && Main.currentCategory !== 'all') {
        rebuildFilterCascade(Main.currentCategory)
    }
}

export function rebuildFilterCascade(categoryId) {
    // 找到该分类的父路径
    const path = CommonUtils.getCategoryPath(categoryId, Main.categories)
    const container = document.getElementById('filterCategoryCascade')
    if (!container) return
    container.innerHTML = ''

    let parentId = null
    path.forEach((catId, index) => {
        const level = index
        const cats = index === 0
            ? Main.categories.filter(c => !c.parent_id)
            : Main.categories.filter(c => c.parent_id === parentId)

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

export function onFilterCatLevelChange(level) {
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
        Main.currentCategory = 'all'
        Main.currentPage = 1
        window.loadPhotos() // 重新加载所有照片
        return
    }

    // 如果选中了某个分类，显示其子分类作为下一级
    if (selectedValue) {
        Main.currentCategory = selectedValue
        Main.currentPage = 1
        const children = Main.categories.filter(c => String(c.parent_id) === String(selectedValue))
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
        window.loadPhotos() // 重新加载照片
    }
}


export function renderCategoryItem(cat, level) {
    const children = Main.categories.filter(c => c.parent_id === cat.id)
    const isActive = Main.currentCategory === cat.id ? 'active' : ''
    const hasChildren = children.length > 0
    const indent = level * 16 // 每层缩进
    const isMarked = Main.markedCategories.has(cat.id)

    // 计算该分类的照片数量
    const count = getCategoryPhotoCount(cat.id)

    // 获取当前展开状态（使用管理区域的展开状态）
    const isExpanded = Main.expandedInManager.has(cat.id)
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
                <span class="cat-name">${CommonUtils.escapeHtml(cat.name)}</span>
                ${hasChildren ? `<span class="cat-arrow" onclick="${arrowOnclick}">${arrow}</span>` : ''}
                <span class="count">${count}</span>
                <button onclick="event.stopPropagation(); window.openEditCategoryModal('${cat.id}', '${CommonUtils.escapeHtml(cat.name).replace(/'/g, "\\'")}')" title="编辑" style="background:none;border:none;cursor:pointer;padding:0 2px;">✏️</button>
                <button class="btn-danger" onclick="event.stopPropagation(); window.deleteCategory('${cat.id}')" title="删除">×</button>
            </div>
            ${childrenHtml}
        </div>
    `
}

// 切换分类管理区域的展开状态
export function toggleCategoryInManager(catId) {
    if (Main.expandedInManager.has(catId)) {
        Main.expandedInManager.delete(catId)
    } else {
        Main.expandedInManager.add(catId)
    }
    renderCategories()
}

// 分类管理区域点击分类（只是视觉选中，不筛选照片）
export function filterByCategoryInManager(categoryId) {
    Main.currentCategory = categoryId
    Main.currentPage = 1
    window.loadPhotos()
}

export function toggleCategoryChildren(catId, event) {
    if (event) event.stopPropagation()

    if (Main.expandedCategories.has(catId)) {
        Main.expandedCategories.delete(catId)
    } else {
        Main.expandedCategories.add(catId)
    }

    // 直接操作 DOM 而不是重新渲染
    const childrenEl = document.getElementById('children-' + catId)
    if (childrenEl) {
        if (Main.expandedCategories.has(catId)) {
            childrenEl.classList.add('show')
        } else {
            childrenEl.classList.remove('show')
        }
    }

    // 更新箭头
    renderCategories()
}

export function filterByCategory(categoryId) {
    Main.currentCategory = categoryId
    Main.currentPage = 1
    rebuildFilterCascade(categoryId)
    window.loadPhotos()
}

// 刷新所有数据
export async function refreshData() {
    // 显示加载状态
    const btn = document.querySelector('.nav-section[onclick="window.refreshData()"] .nav-icon')
    if (btn) btn.textContent = '⏳'

    try {
        // 并行加载分类和照片
        await Promise.all([
            window.loadCategories(),
            window.loadPhotos()
        ])
    } catch (err) {
        console.error('刷新失败:', err)
        alert('刷新失败，请稍后重试')
    }

    // 恢复按钮状态
    if (btn) btn.textContent = '🔄'
}

// 级联选择器：渲染父分类选择器
export function renderParentCategorySelect() {
    const container = document.getElementById('parentCategoryCascade')
    if (!container) return
    container.innerHTML = ''

    const topLevel = Main.categories.filter(c => !c.parent_id)
    if (topLevel.length === 0) return

    const select = document.createElement('select')
    select.id = 'parentLevel0'
    select.className = 'category-select'
    select.onchange = () => onParentLevelChange(0)
    select.innerHTML = `<option value="">作为顶级分类</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
    container.appendChild(select)
}

export function onParentLevelChange(level) {
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
        const children = Main.categories.filter(c => String(c.parent_id) === String(selectedValue))
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `parentLevel${nextLevel}`
            nextSelect.className = 'category-select'
            nextSelect.onchange = () => onParentLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
            container.appendChild(nextSelect)
        }
    }
}

export function getSelectedParentId() {
    const container = document.getElementById('parentCategoryCascade')
    if (!container) return null
    const selects = container.querySelectorAll('select')
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value
    }
    return null
}

// 上传表单的级联分类选择器
export function renderUploadCategoryCascade() {
    const container = document.getElementById('uploadCategoryCascade')
    if (!container) return
    container.innerHTML = ''

    const topLevel = Main.categories.filter(c => !c.parent_id)
    if (topLevel.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类，请先在分类管理中添加</p>'
        return
    }

    const select = document.createElement('select')
    select.id = 'uploadCatLevel0'
    select.className = 'category-select'
    select.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;'
    select.onchange = () => onUploadCatLevelChange(0)
    select.innerHTML = `<option value="">选择分类（可选）</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
    container.appendChild(select)
}

export function onUploadCatLevelChange(level) {
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
        const children = Main.categories.filter(c => String(c.parent_id) === String(selectedValue))
        if (children.length > 0) {
            const nextLevel = level + 1
            const nextSelect = document.createElement('select')
            nextSelect.id = `uploadCatLevel${nextLevel}`
            nextSelect.className = 'category-select'
            nextSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;'
            nextSelect.onchange = () => onUploadCatLevelChange(nextLevel)
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`
            container.appendChild(nextSelect)
        }
    }
}

export function getSelectedUploadCategoryId() {
    const container = document.getElementById('uploadCategoryCascade')
    if (!container) return null
    const selects = container.querySelectorAll('select')
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value
    }
    return null
}

export async function createCategory() {
    const input = document.getElementById('newCategory')
    const name = input.value.trim()
    const parentId = getSelectedParentId()

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
        await window.loadCategories()
    } catch (err) {
        alert('创建分类失败: ' + err.message)
    }
}

export async function deleteCategory(id) {
    if (!confirm('确定删除该分类？照片不会删除')) return

    try {
        // 获取该分类及其所有子分类
        const allIds = CommonUtils.getCategoryAndChildrenIds(id, Main.categories)

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

        if (allIds.includes(String(Main.currentCategory))) {
            Main.currentCategory = 'all'
        }

        await window.loadCategories()
        await window.loadPhotos()
    } catch (err) {
        alert('删除分类失败: ' + err.message)
    }
}

export function openEditCategoryModal(id, name) {
    document.getElementById('editCategoryId').value = id
    document.getElementById('editCategoryName').value = name

    // 设置标记按钮状态
    const markBtn = document.getElementById('editMarkBtn')
    const isMarked = Main.markedCategories.has(id)
    markBtn.textContent = isMarked ? '⭐ 已标记' : '☆ 标记'
    markBtn.style.color = isMarked ? '#FFD700' : '#FFD700'

    document.getElementById('editCategoryModal').classList.add('active')
}

export function toggleMarkInEdit() {
    const id = document.getElementById('editCategoryId').value
    if (!id) return

    if (Main.markedCategories.has(id)) {
        Main.markedCategories.delete(id)
    } else {
        Main.markedCategories.add(id)
    }
    localStorage.setItem('markedCategories', JSON.stringify([...Main.markedCategories]))
    updateMarkedCount()
    renderMarkedCategoriesList()

    // 更新按钮状态
    const markBtn = document.getElementById('editMarkBtn')
    if (markBtn) {
        const isMarked = Main.markedCategories.has(id)
        markBtn.textContent = isMarked ? '⭐ 已标记' : '☆ 标记'
    }
}

export function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('active')
}

export async function saveCategoryName(e) {
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
        await window.loadCategories()
    } catch (err) {
        alert('保存失败: ' + err.message)
    }
}

// 挂载到 window 以兼容 HTML onclick 属性
window.toggleMarkCategory = toggleMarkCategory;
window.updateMarkedCount = updateMarkedCount;
window.renderMarkedCategoriesList = renderMarkedCategoriesList;
window.toggleMarkedCategories = toggleMarkedCategories;
window.renderCategories = renderCategories;
window.renderCategorySelect = renderCategorySelect;
window.rebuildFilterCascade = rebuildFilterCascade;
window.onFilterCatLevelChange = onFilterCatLevelChange;
window.renderCategoryItem = renderCategoryItem;
window.toggleCategoryInManager = toggleCategoryInManager;
window.filterByCategoryInManager = filterByCategoryInManager;
window.toggleCategoryChildren = toggleCategoryChildren;
window.filterByCategory = filterByCategory;
window.refreshData = refreshData;
window.renderParentCategorySelect = renderParentCategorySelect;
window.onParentLevelChange = onParentLevelChange;
window.getSelectedParentId = getSelectedParentId;
window.renderUploadCategoryCascade = renderUploadCategoryCascade;
window.onUploadCatLevelChange = onUploadCatLevelChange;
window.getSelectedUploadCategoryId = getSelectedUploadCategoryId;
window.createCategory = createCategory;
window.deleteCategory = deleteCategory;
window.openEditCategoryModal = openEditCategoryModal;
window.toggleMarkInEdit = toggleMarkInEdit;
window.closeEditCategoryModal = closeEditCategoryModal;
window.saveCategoryName = saveCategoryName;
