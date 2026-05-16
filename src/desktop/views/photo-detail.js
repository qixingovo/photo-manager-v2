// src/desktop/views/photo-detail.js — 照片详情弹窗、编辑、分类、删除、留言
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

let _modalTouchStartX = 0

async function loadPhotoCategories(photoId) {
    try {
        const { data } = await supabase
            .from('photo_categories')
            .select('category_id')
            .eq('photo_id', photoId)

        if (data) {
            Main.photoCategories[String(photoId)] = data.map(d => String(d.category_id))
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
            Main.currentComments = data
            renderComments()
        }
    } catch (err) {
        console.error('加载留言失败:', err)
    }
}

function renderComments() {
    const container = document.getElementById('commentsList')

    if (Main.currentComments.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:12px;">暂无留言</p>'
        return
    }

    container.innerHTML = Main.currentComments.map(c => `
        <div class="comment-item">
            <div>${CommonUtils.escapeHtml(c.content || '')}</div>
            <div class="comment-time">${window.formatTime(c.created_at)}</div>
        </div>
    `).join('')
}

async function addComment(e) {
    e.preventDefault()

    if (!Main.currentPhoto) return

    const input = document.getElementById('commentInput')
    const content = input.value.trim()

    if (!content) return

    try {
        const { error } = await supabase
            .from('comments')
            .insert([{ photo_id: Main.currentPhoto.id, content }])

        if (error) throw error

        input.value = ''
        await loadComments(Main.currentPhoto.id)
    } catch (err) {
        alert('留言失败: ' + err.message)
    }
}

async function openPhotoModal(photoId) {
    Main.currentPhoto = Main.photos.find(p => p.id === photoId)
    if (!Main.currentPhoto) return

    await loadPhotoCategories(photoId)
    await loadComments(photoId)

    _refreshModalContent()
    _updateNavArrows()

    // 键盘导航
    document.addEventListener('keydown', _modalKeyHandler)

    // 触屏滑动（绑定到整个弹窗）
    const modal = document.getElementById('photoModal')
    if (modal) {
        modal.addEventListener('touchstart', _modalTouchStart, { passive: true })
        modal.addEventListener('touchend', _modalTouchEnd, { passive: true })
    }

    modal.classList.add('active')
}

function closeModal() {
    const modal = document.getElementById('photoModal')
    modal.classList.remove('active')
    document.removeEventListener('keydown', _modalKeyHandler)
    if (modal) {
        modal.removeEventListener('touchstart', _modalTouchStart)
        modal.removeEventListener('touchend', _modalTouchEnd)
    }
    Main.currentPhoto = null
    Main.currentComments = []
}

function _refreshModalContent(direction) {
    const img = document.getElementById('modalImage');
    const photoUrl = window.getPhotoUrl(Main.currentPhoto.storage_path);

    // 更新右侧信息面板
    document.getElementById('modalPhotoName').textContent = Main.currentPhoto.name;
    document.getElementById('modalPhotoDesc').textContent = Main.currentPhoto.description || '暂无描述';
    document.getElementById('modalPhotoSize').textContent = CommonUtils.formatFileSize(Main.currentPhoto.size);

    const categoryEl = document.getElementById('modalPhotoCategory');
    const photoCats = Main.photoCategories[String(Main.currentPhoto.id)] || [];
    if (photoCats.length > 0) {
        const catNames = photoCats.map(cid => {
            const cat = Main.categories.find(c => String(c.id) === cid);
            return cat ? cat.name : '';
        }).filter(n => n).join(', ');
        categoryEl.textContent = catNames || '未分类';
        categoryEl.style.background = '#667eea';
        categoryEl.style.color = 'white';
    } else {
        categoryEl.textContent = '未分类';
        categoryEl.style.background = '#e9ecef';
        categoryEl.style.color = '#333';
    }

    const downloadBtn = document.getElementById('modalDownloadBtn');
    downloadBtn.href = photoUrl;
    downloadBtn.download = Main.currentPhoto.original_name || Main.currentPhoto.name;

    window.updateFavoriteButton();

    if (direction) {
        // 滑动动画：先滑出旧图，再滑入新图
        const dir = direction > 0 ? 1 : -1;
        img.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        img.style.transform = 'translateX(' + (-dir * 30) + '%)';
        img.style.opacity = '0';

        img.addEventListener('transitionend', function handler() {
            img.removeEventListener('transitionend', handler);
            img.style.transition = 'none';
            img.style.transform = 'translateX(' + (dir * 30) + '%)';
            img.src = photoUrl;
            // 强制回流
            img.offsetHeight;
            img.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
            img.style.transform = 'translateX(0)';
            img.style.opacity = '1';
            img.onload = null;
        }, { once: true });
    } else {
        // 首次打开：直接淡入
        img.style.transition = 'none';
        img.style.transform = 'none';
        img.style.opacity = '0.3';
        img.src = photoUrl;
        img.onload = function() {
            this.style.transition = 'opacity 0.25s ease';
            this.style.opacity = '1';
        };
    }
}

function _updateNavArrows() {
    const idx = Main.photos.indexOf(Main.currentPhoto)
    document.getElementById('navPrevBtn').style.visibility = idx > 0 ? 'visible' : 'hidden'
    document.getElementById('navNextBtn').style.visibility = idx < Main.photos.length - 1 ? 'visible' : 'hidden'
}

function _modalKeyHandler(e) {
    if (e.key === 'ArrowLeft') window.navigatePhoto(-1)
    else if (e.key === 'ArrowRight') window.navigatePhoto(1)
    else if (e.key === 'Escape') closeModal()
}

function _modalTouchStart(e) {
    // 按钮和输入框上不触发滑动
    if (e.target.closest('button, input, textarea, a, .modal-actions, .comments-section')) return;
    _modalTouchStartX = e.touches[0].clientX;
}
function _modalTouchEnd(e) {
    if (!_modalTouchStartX) return;
    const dx = e.changedTouches[0].clientX - _modalTouchStartX;
    _modalTouchStartX = 0;
    if (Math.abs(dx) > 50) {
        navigatePhoto(dx > 0 ? -1 : 1);
    }
}

async function navigatePhoto(direction) {
    const idx = Main.photos.indexOf(Main.currentPhoto)
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= Main.photos.length) return

    const photoId = Main.photos[newIdx].id
    Main.currentPhoto = Main.photos[newIdx]
    await loadPhotoCategories(photoId)
    await loadComments(photoId)
    _refreshModalContent(direction)
    _updateNavArrows()
}

function openEditModal() {
    if (!Main.currentPhoto) return

    document.getElementById('editPhotoId').value = Main.currentPhoto.id
    document.getElementById('editName').value = Main.currentPhoto.name
    document.getElementById('editDesc').value = Main.currentPhoto.description || ''

    const locNameEl = document.getElementById('editLocationName')
    const latEl = document.getElementById('editLatitude')
    const lngEl = document.getElementById('editLongitude')
    if (locNameEl) locNameEl.value = Main.currentPhoto.location_name || ''
    if (latEl) latEl.value = Main.currentPhoto.latitude || ''
    if (lngEl) lngEl.value = Main.currentPhoto.longitude || ''

    document.getElementById('editModal').classList.add('active')
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active')
}

async function handleEdit(e) {
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

        const photo = Main.photos.find(p => p.id === id)
        if (photo) {
            photo.name = name
            photo.description = description
            photo.latitude = latitude
            photo.longitude = longitude
            photo.location_name = location_name
        }

        document.getElementById('modalPhotoName').textContent = name
        document.getElementById('modalPhotoDesc').textContent = description || '暂无描述'

        await window.loadPhotos()
    } catch (err) {
        alert('保存失败: ' + err.message)
    }
}

function openCategoryModal() {
    if (!Main.currentPhoto) return

    const photoCats = Main.photoCategories[String(Main.currentPhoto.id)] || []
    const container = document.getElementById('categoryCheckboxList')

    // 构建分类树
    function buildCategoryTree() {
        const roots = Main.categories.filter(c => !c.parent_id)
        return roots.map(cat => ({
            ...cat,
            children: Main.categories.filter(c => c.parent_id === cat.id)
        }))
    }

    function hasChildren(cat) {
        return Main.categories.some(c => c.parent_id === cat.id)
    }

    function renderCategory(cat, level) {
        const indent = level * 20
        const isSelected = photoCats.includes(String(cat.id))
        const children = Main.categories.filter(c => c.parent_id === cat.id)
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
function onCategoryCheckboxChange(checkbox, catId) {
    // 如果选中父分类，子分类也应该被考虑（但实际存储时只存叶子节点）
    // 这里不做自动处理，让用户自己选择
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active')
}

async function saveCategoryChange() {
    if (!Main.currentPhoto) return

    try {
        // 获取所有选中的分类（直接获取，无需特殊处理）
        const checkboxes = document.querySelectorAll('input[name="photoCategory"]:checked')
        const selectedCategories = Array.from(checkboxes).map(cb => cb.value)

        // 先删除旧的关联
        const { error: relationDeleteError } = await supabase
            .from('photo_categories')
            .delete()
            .eq('photo_id', Main.currentPhoto.id)
        if (relationDeleteError) throw relationDeleteError

        // 添加新的关联
        if (selectedCategories.length > 0) {
            const inserts = selectedCategories.map(cid => ({
                photo_id: Main.currentPhoto.id,
                category_id: cid
            }))

            const { error: relationInsertError } = await supabase
                .from('photo_categories')
                .insert(inserts)
            if (relationInsertError) throw relationInsertError
        }

        // 更新本地缓存
        Main.photoCategories[String(Main.currentPhoto.id)] = selectedCategories

        closeCategoryModal()

        // 更新弹窗中的分类显示
        const categoryEl = document.getElementById('modalPhotoCategory')
        if (selectedCategories.length > 0) {
            const catNames = selectedCategories.map(cid => {
                const cat = Main.categories.find(c => String(c.id) === cid)
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

        await window.loadPhotos()
        await window.loadCategories()
    } catch (err) {
        alert('更改分类失败: ' + err.message)
    }
}

async function deletePhoto(id, storagePath) {
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

        await window.loadPhotos()
        await window.loadCategories()
    } catch (err) {
        alert('删除失败: ' + err.message)
    }
}

// 挂载到 window 以兼容 HTML onclick 属性
window.openPhotoModal = openPhotoModal;
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleEdit = handleEdit;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.onCategoryCheckboxChange = onCategoryCheckboxChange;
window.saveCategoryChange = saveCategoryChange;
window.deletePhoto = deletePhoto;
window.loadComments = loadComments;
window.renderComments = renderComments;
window.addComment = addComment;
window.loadPhotoCategories = loadPhotoCategories;

export {
    openPhotoModal,
    closeModal,
    navigatePhoto,
    openEditModal,
    closeEditModal,
    handleEdit,
    openCategoryModal,
    closeCategoryModal,
    onCategoryCheckboxChange,
    saveCategoryChange,
    deletePhoto,
    loadComments,
    renderComments,
    addComment,
    loadPhotoCategories,
    _refreshModalContent,
    _updateNavArrows
};
