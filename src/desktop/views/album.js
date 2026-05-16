// src/desktop/views/album.js — 相册管理：CRUD、照片管理、选择模式
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

function getPhotoCategoryNames(photoId) {
    const catIds = Main.photoCategories[photoId];
    if (!catIds || catIds.length === 0) return '';
    return catIds.map(id => {
        const cat = Main.categories.find(c => c.id === id);
        return cat ? cat.name : '';
    }).filter(Boolean).join(', ');
}

async function loadAlbums() {
    try {
        const { data, error } = await supabase
            .from('albums')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        Main.albums = data || [];
        renderAlbumList();
    } catch (e) {
        console.error('加载相册失败:', e);
        document.getElementById('albumList').innerHTML = '<p class="loading">加载失败</p>';
    }
}

function renderAlbumList() {
    const container = document.getElementById('albumList');
    const empty = document.getElementById('albumEmpty');
    if (Main.albums.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    container.innerHTML = Main.albums.map(a => {
        const coverSrc = a.cover_photo_id
            ? (() => { const p = Main.photos.find(ph => ph.id === a.cover_photo_id); return p ? window.getPhotoUrl(p.storage_path) : ''; })()
            : '';
        return `
        <div class="album-card" onclick="window.openAlbumDetail(${a.id})">
            <div class="album-cover">
                ${coverSrc ? `<img src="${coverSrc}" alt="">` : '<div class="album-cover-placeholder">📸</div>'}
            </div>
            <div class="album-info">
                <h3>${CommonUtils.escapeHtml(a.name)}</h3>
                <p>${CommonUtils.escapeHtml(a.description || '')}</p>
            </div>
        </div>`;
    }).join('');
}

function openAddAlbumModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'addAlbumModal';
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
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function createAlbum() {
    const name = document.getElementById('albumNameInput').value.trim();
    const description = document.getElementById('albumDescInput').value.trim();
    if (!name) { alert('请输入相册名称'); return; }
    try {
        const { data, error } = await supabase
            .from('albums')
            .insert([{ name, description }])
            .select()
            .single();
        if (error) throw error;
        Main.albums.unshift(data);
        renderAlbumList();
        document.getElementById('addAlbumModal').remove();
    } catch (e) {
        console.error('创建相册失败:', e);
        alert('创建失败: ' + e.message);
    }
}

async function openAlbumDetail(albumId) {
    Main.currentAlbum = Main.albums.find(a => a.id === albumId);
    if (!Main.currentAlbum) return;
    document.getElementById('albumsSection').style.display = 'none';
    document.getElementById('albumDetailSection').style.display = 'block';
    document.getElementById('albumDetailName').textContent = Main.currentAlbum.name;
    document.getElementById('albumDetailDesc').textContent = Main.currentAlbum.description || '';
    Main.albumSelectMode = false;
    Main.albumSelectedPhotos.clear();
    updateAlbumToolbar();
    await loadAlbumPhotos(albumId);
}

async function loadAlbumPhotos(albumId) {
    try {
        const { data, error } = await supabase
            .from('album_photos')
            .select('photo_id')
            .eq('album_id', albumId);
        if (error) throw error;
        Main.albumPhotos = (data || []).map(r => r.photo_id);
        document.getElementById('albumPhotoCount').textContent = `共 ${Main.albumPhotos.length} 张照片`;
        renderAlbumPhotos();
    } catch (e) {
        console.error('加载相册照片失败:', e);
    }
}

function renderAlbumPhotos() {
    const grid = document.getElementById('albumPhotosGrid');
    const empty = document.getElementById('albumPhotosEmpty');
    if (Main.albumPhotos.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    const albumPhotoObjs = Main.photos.filter(p => Main.albumPhotos.includes(p.id));
    grid.innerHTML = albumPhotoObjs.map(p => {
        const selectedClass = Main.albumSelectMode && Main.albumSelectedPhotos.has(p.id) ? ' selected' : '';
        const checkboxHtml = Main.albumSelectMode
            ? `<div class="photo-checkbox"><input type="checkbox" ${Main.albumSelectedPhotos.has(p.id) ? 'checked' : ''} onclick="event.stopPropagation();window.toggleAlbumPhotoCheck('${p.id}')"></div>`
            : '';
        const catNames = getPhotoCategoryNames(p.id);
        const imgSrc = window.getPhotoUrl(p.storage_path);
        return `
        <div class="photo-card${selectedClass}" onclick="${Main.albumSelectMode ? `window.toggleAlbumPhotoCheck('${p.id}')` : `window.openPhotoModal('${p.id}')`}">
            ${checkboxHtml}
            <img src="${imgSrc}" alt="${CommonUtils.escapeHtml(p.name || '')}" loading="lazy">
            <div class="photo-info">
                <h3>${CommonUtils.escapeHtml(p.name || '未命名')}</h3>
                <p>${CommonUtils.escapeHtml(p.description || '')}</p>
                <div class="photo-meta">
                    <span class="photo-category">${CommonUtils.escapeHtml(catNames || '未分类')}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleAlbumPhotoCheck(photoId) {
    if (Main.albumSelectedPhotos.has(photoId)) {
        Main.albumSelectedPhotos.delete(photoId);
    } else {
        Main.albumSelectedPhotos.add(photoId);
    }
    renderAlbumPhotos();
}

function toggleAlbumPhotoSelectMode() {
    Main.albumSelectMode = !Main.albumSelectMode;
    Main.albumSelectedPhotos.clear();
    updateAlbumToolbar();
    renderAlbumPhotos();
}

function updateAlbumToolbar() {
    document.getElementById('albumSelectModeBtn').style.display = Main.albumSelectMode ? 'none' : '';
    document.getElementById('albumAddPhotosBtn').style.display = Main.albumSelectMode ? '' : 'none';
    document.getElementById('albumRemovePhotosBtn').style.display = Main.albumSelectMode ? '' : 'none';
    document.getElementById('albumCancelSelectBtn').style.display = Main.albumSelectMode ? '' : 'none';
}

async function openAddPhotosToAlbumModal() {
    if (!Main.currentAlbum) return;
    const existingIds = new Set(Main.albumPhotos);
    const availablePhotos = Main.photos.filter(p => !existingIds.has(p.id));
    if (availablePhotos.length === 0) {
        alert('所有照片已在此相册中');
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;padding:24px;max-height:80vh;overflow-y:auto;">
            <span class="modal-close" style="position:sticky;top:0;float:right;font-size:28px;cursor:pointer;color:#999;" onclick="document.getElementById('addPhotosToAlbumModal').remove()">&times;</span>
            <h3>添加照片到相册</h3>
            <div class="category-select-list" style="max-height:50vh;overflow-y:auto;">
                ${availablePhotos.map(p => {
                    const imgSrc = window.getPhotoUrl(p.storage_path);
                    return `<label class="category-option">
                        <input type="checkbox" class="add-photo-check" value="${p.id}">
                        <img src="${imgSrc}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;" loading="lazy">
                        <span style="font-size:13px;flex:1;">${CommonUtils.escapeHtml(p.name || '未命名')}</span>
                    </label>`;
                }).join('')}
            </div>
            <button class="btn btn-primary" onclick="window.addPhotosToAlbum()" style="margin-top:12px;width:100%;">添加到相册</button>
        </div>
    `;
    modal.id = 'addPhotosToAlbumModal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function addPhotosToAlbum() {
    if (!Main.currentAlbum) return;
    const checks = document.querySelectorAll('.add-photo-check:checked');
    if (checks.length === 0) { alert('请选择要添加的照片'); return; }
    const rows = Array.from(checks).map(cb => ({
        album_id: Main.currentAlbum.id,
        photo_id: cb.value
    }));
    try {
        const { error } = await supabase.from('album_photos').insert(rows);
        if (error) throw error;
        document.getElementById('addPhotosToAlbumModal').remove();
        await loadAlbumPhotos(Main.currentAlbum.id);
        if (Main.currentAlbum.cover_photo_id === null || Main.currentAlbum.cover_photo_id === undefined) {
            await supabase.from('albums').update({ cover_photo_id: rows[0].photo_id }).eq('id', Main.currentAlbum.id);
            Main.currentAlbum.cover_photo_id = rows[0].photo_id;
        }
    } catch (e) {
        console.error('添加照片失败:', e);
        alert('添加失败: ' + e.message);
    }
}

async function removePhotosFromAlbum() {
    if (!Main.currentAlbum) return;
    if (Main.albumSelectedPhotos.size === 0) { alert('请先选择要移除的照片'); return; }
    if (!confirm(`确认从相册中移除 ${Main.albumSelectedPhotos.size} 张照片？`)) return;
    try {
        const { error } = await supabase
            .from('album_photos')
            .delete()
            .eq('album_id', Main.currentAlbum.id)
            .in('photo_id', [...Main.albumSelectedPhotos]);
        if (error) throw error;
        Main.albumSelectedPhotos.clear();
        await loadAlbumPhotos(Main.currentAlbum.id);
    } catch (e) {
        console.error('移除照片失败:', e);
        alert('移除失败: ' + e.message);
    }
}

function showAlbumList() {
    document.getElementById('albumDetailSection').style.display = 'none';
    document.getElementById('albumsSection').style.display = 'block';
    Main.currentAlbum = null;
    Main.albumSelectMode = false;
    Main.albumSelectedPhotos.clear();
}

function openEditAlbumModal() {
    if (!Main.currentAlbum) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <span class="modal-close" onclick="document.getElementById('editAlbumModal').remove()">&times;</span>
            <h3>编辑相册</h3>
            <div class="edit-form">
                <div class="form-group">
                    <label>相册名称</label>
                    <input type="text" id="editAlbumNameInput" value="${CommonUtils.escapeHtml(Main.currentAlbum.name)}">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="editAlbumDescInput" rows="2">${CommonUtils.escapeHtml(Main.currentAlbum.description || '')}</textarea>
                </div>
                <button class="btn btn-primary" onclick="window.saveEditAlbum()">保存</button>
            </div>
        </div>
    `;
    modal.id = 'editAlbumModal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function saveEditAlbum() {
    if (!Main.currentAlbum) return;
    const name = document.getElementById('editAlbumNameInput').value.trim();
    const description = document.getElementById('editAlbumDescInput').value.trim();
    if (!name) { alert('请输入相册名称'); return; }
    try {
        const { error } = await supabase
            .from('albums')
            .update({ name, description })
            .eq('id', Main.currentAlbum.id);
        if (error) throw error;
        Main.currentAlbum.name = name;
        Main.currentAlbum.description = description;
        const idx = Main.albums.findIndex(a => a.id === Main.currentAlbum.id);
        if (idx >= 0) { Main.albums[idx].name = name; Main.albums[idx].description = description; }
        document.getElementById('albumDetailName').textContent = name;
        document.getElementById('albumDetailDesc').textContent = description || '';
        document.getElementById('editAlbumModal').remove();
    } catch (e) {
        console.error('编辑相册失败:', e);
        alert('编辑失败: ' + e.message);
    }
}

async function deleteAlbum() {
    if (!Main.currentAlbum) return;
    if (!confirm(`确认删除相册"${Main.currentAlbum.name}"？\n相册中的照片不会被删除，仅解散合集。`)) return;
    try {
        const { error } = await supabase.from('albums').delete().eq('id', Main.currentAlbum.id);
        if (error) throw error;
        Main.albums = Main.albums.filter(a => a.id !== Main.currentAlbum.id);
        showAlbumList();
        renderAlbumList();
    } catch (e) {
        console.error('删除相册失败:', e);
        alert('删除失败: ' + e.message);
    }
}

window.loadAlbums = loadAlbums;
window.renderAlbumList = renderAlbumList;
window.openAddAlbumModal = openAddAlbumModal;
window.createAlbum = createAlbum;
window.openAlbumDetail = openAlbumDetail;
window.loadAlbumPhotos = loadAlbumPhotos;
window.renderAlbumPhotos = renderAlbumPhotos;
window.toggleAlbumPhotoCheck = toggleAlbumPhotoCheck;
window.toggleAlbumPhotoSelectMode = toggleAlbumPhotoSelectMode;
window.updateAlbumToolbar = updateAlbumToolbar;
window.openAddPhotosToAlbumModal = openAddPhotosToAlbumModal;
window.addPhotosToAlbum = addPhotosToAlbum;
window.removePhotosFromAlbum = removePhotosFromAlbum;
window.showAlbumList = showAlbumList;
window.openEditAlbumModal = openEditAlbumModal;
window.saveEditAlbum = saveEditAlbum;
window.deleteAlbum = deleteAlbum;

export {
    getPhotoCategoryNames,
    loadAlbums,
    renderAlbumList,
    openAddAlbumModal,
    createAlbum,
    openAlbumDetail,
    loadAlbumPhotos,
    renderAlbumPhotos,
    toggleAlbumPhotoCheck,
    toggleAlbumPhotoSelectMode,
    updateAlbumToolbar,
    openAddPhotosToAlbumModal,
    addPhotosToAlbum,
    removePhotosFromAlbum,
    showAlbumList,
    openEditAlbumModal,
    saveEditAlbum,
    deleteAlbum
};
