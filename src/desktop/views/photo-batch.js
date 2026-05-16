// src/desktop/views/photo-batch.js — 批量操作：多选、导出、删除、分类、位置、日期
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

function toggleSelectMode() {
    Main.selectMode = !Main.selectMode
    Main.selectedPhotos.clear()

    const selectBtn = document.getElementById('selectModeBtn')
    const selectAllBtn = document.getElementById('selectAllBtn')
    const batchCategoryBtn = document.getElementById('batchCategoryBtn')
    const batchLocationBtn = document.getElementById('batchLocationBtn')
    const batchExportBtn = document.getElementById('batchExportBtn')
    const batchDateBtn = document.getElementById('batchDateBtn')
    const batchBtn = document.getElementById('batchDeleteBtn')

    if (Main.selectMode) {
        selectBtn.classList.add('active')
        selectBtn.textContent = '❌ 取消'
        selectAllBtn.style.display = 'inline-block'
        batchCategoryBtn.style.display = 'inline-block'
        if (batchLocationBtn) batchLocationBtn.style.display = 'inline-block'
        if (batchDateBtn) batchDateBtn.style.display = 'inline-block'
        if (batchExportBtn) batchExportBtn.style.display = 'inline-block'
        batchBtn.style.display = 'inline-block'
    } else {
        selectBtn.classList.remove('active')
        selectBtn.textContent = '☑️ 多选'
        selectAllBtn.style.display = 'none'
        batchCategoryBtn.style.display = 'none'
        if (batchLocationBtn) batchLocationBtn.style.display = 'none'
        if (batchDateBtn) batchDateBtn.style.display = 'none'
        if (batchExportBtn) batchExportBtn.style.display = 'none'
        batchBtn.style.display = 'none'
    }

    window.renderPhotos()
}

function togglePhotoSelect(photoId) {
    if (Main.selectedPhotos.has(photoId)) {
        Main.selectedPhotos.delete(photoId)
    } else {
        Main.selectedPhotos.add(photoId)
    }

    document.getElementById('selectedCount').textContent = Main.selectedPhotos.size
    window.renderPhotos()
}

async function exportSelectedPhotos() {
    if (Main.selectedPhotos.size === 0) {
        alert('请先选择要导出的照片');
        return;
    }
    if (Main.selectedPhotos.size > 50) {
        if (!confirm(`已选择 ${Main.selectedPhotos.size} 张照片，一次最多导出 50 张。仅导出前 50 张？`)) return;
    }

    const photoIds = [...Main.selectedPhotos].slice(0, 50);
    const selectedPhotoData = Main.photos.filter(p => photoIds.includes(p.id));

    try {
        const zip = new JSZip();
        const total = selectedPhotoData.length;
        let completed = 0;

        const progressBar = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressSection = document.getElementById('uploadProgress');
        if (progressSection) progressSection.style.display = 'block';

        for (const photo of selectedPhotoData) {
            const url = window.getPhotoUrl(photo.storage_path);
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
}

async function batchDeletePhotos() {
    if (Main.selectedPhotos.size === 0) {
        alert('请先选择要删除的照片')
        return
    }

    if (!confirm(`确定删除选中的 ${Main.selectedPhotos.size} 张照片？`)) return

    const photoIds = [...Main.selectedPhotos]
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

    Main.selectedPhotos.clear()
    toggleSelectMode()
    await window.loadPhotos()
    await window.loadCategories()

    if (failCount === 0) {
        alert(`删除成功！${successCount}张照片已删除`)
    } else {
        alert(`删除完成：${successCount}张成功，${failCount}张失败`)
    }
}

function selectAllPhotos() {
    if (Main.selectedPhotos.size === Main.photos.length) {
        // 取消全选
        Main.selectedPhotos.clear()
    } else {
        // 全选
        Main.photos.forEach(p => Main.selectedPhotos.add(p.id))
    }
    document.getElementById('selectedCount').textContent = Main.selectedPhotos.size
    window.renderPhotos()
}

function openBatchCategoryModal() {
    if (Main.selectedPhotos.size === 0) {
        alert('请先选择要操作的照片')
        return
    }

    document.getElementById('batchPhotoCount').textContent = Main.selectedPhotos.size

    // 加载分类列表
    const container = document.getElementById('batchCategoryList')
    container.innerHTML = Main.categories.map(cat => `
        <label class="category-option">
            <input type="checkbox" name="batchCategory" value="${cat.id}">
            <span>${cat.name}</span>
        </label>
    `).join('')

    document.getElementById('batchCategoryModal').classList.add('active')
}

function closeBatchCategoryModal() {
    document.getElementById('batchCategoryModal').classList.remove('active')
}

async function batchAddCategories() {
    const checkboxes = document.querySelectorAll('input[name="batchCategory"]:checked')
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value)

    if (selectedCategories.length === 0) {
        alert('请选择要添加的分类')
        return
    }

    let successCount = 0

    for (const photoId of Main.selectedPhotos) {
        try {
            // 获取当前分类
            const currentCats = Main.photoCategories[String(photoId)] || []

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
    await window.loadAllPhotoCategories()
    await window.loadPhotos()
    await window.loadCategories()

    alert(`成功为 ${successCount} 张照片添加分类`)
}

async function batchRemoveCategories() {
    const checkboxes = document.querySelectorAll('input[name="batchCategory"]:checked')
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value)

    if (selectedCategories.length === 0) {
        alert('请选择要移除的分类')
        return
    }

    let successCount = 0

    for (const photoId of Main.selectedPhotos) {
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
    await window.loadAllPhotoCategories()
    await window.loadPhotos()
    await window.loadCategories()

    alert(`成功从 ${successCount} 张照片移除分类`)
}

// ========== 批量设置位置 ==========

function openBatchLocationModal() {
    if (Main.selectedPhotos.size === 0) {
        alert('请先选择照片');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'batchLocationModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;padding:0;">
            <span class="modal-close" onclick="document.getElementById('batchLocationModal').remove()">&times;</span>
            <h3 style="padding:16px;">为选中的 ${Main.selectedPhotos.size} 张照片设置位置</h3>
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
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            attribution: '&copy; 高德地图',
            subdomains: ['1','2','3','4'],
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
}

async function saveBatchLocation() {
    if (!window.__batchPickedLatLng) {
        alert('请先在地图上点击选择位置');
        return;
    }

    const lat = window.__batchPickedLatLng.lat;
    const lng = window.__batchPickedLatLng.lng;
    const locationName = (document.getElementById('batchLocationName')?.value || '').trim() || null;
    const photoIds = [...Main.selectedPhotos];

    try {
        const { error } = await supabase
            .from('photos')
            .update({ latitude: lat, longitude: lng, location_name: locationName })
            .in('id', photoIds);

        if (error) throw error;

        // 更新本地缓存中的照片数据
        Main.photos.forEach(p => {
            if (Main.selectedPhotos.has(p.id)) {
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
}

// ========================================
// 批量调整日期
// ========================================

function openBatchDateModal() {
    if (Main.selectedPhotos.size === 0) { alert('请先选择照片'); return; }
    const modal = document.getElementById('batchDateModal');
    document.getElementById('batchDateCount').textContent = '已选 ' + Main.selectedPhotos.size + ' 张照片';
    document.querySelector('input[name="batchDateMode"][value="unified"]').checked = true;
    window.onBatchDateModeChange();
    modal.style.display = 'flex';
}

function onBatchDateModeChange() {
    const mode = document.querySelector('input[name="batchDateMode"]:checked').value;
    document.getElementById('batchDateUnified').style.display = mode === 'unified' ? 'block' : 'none';
    document.getElementById('batchDateOffsetRow').style.display = mode === 'offset' ? 'flex' : 'none';
    _calcBatchDatePreview();
}

function applyOffset(days) {
    const inp = document.getElementById('batchOffsetInput');
    inp.value = parseInt(inp.value || 0) + days;
    document.querySelector('input[name="batchDateMode"][value="offset"]').checked = true;
    window.onBatchDateModeChange();
}

function _calcBatchDatePreview() {
    const preview = document.getElementById('batchDatePreview');
    const mode = document.querySelector('input[name="batchDateMode"]:checked').value;
    const photoIds = [...Main.selectedPhotos].slice(0, 5);
    const selectedPhotosArr = Main.photos.filter(p => Main.selectedPhotos.has(p.id));

    if (mode === 'unified') {
        const newDate = document.getElementById('batchDateUnified').value;
        if (!newDate) { preview.innerHTML = '<span style="color:#999;">请选择日期</span>'; return; }
        preview.innerHTML = selectedPhotosArr.slice(0, 5).map(function(p) {
            const oldDate = (p.taken_at || p.created_at) ? new Date(p.taken_at || p.created_at).toLocaleString('zh-CN') : '无日期';
            const newD = new Date(newDate).toLocaleString('zh-CN');
            return '<div>' + CommonUtils.escapeHtml(p.name || p.original_name) + ': ' + oldDate + ' → <strong>' + newD + '</strong></div>';
        }).join('');
    } else if (mode === 'offset') {
        const days = parseInt(document.getElementById('batchOffsetInput').value) || 0;
        preview.innerHTML = selectedPhotosArr.slice(0, 5).map(function(p) {
            const oldDt = new Date(p.taken_at || p.created_at);
            const oldStr = isNaN(oldDt.getTime()) ? '无日期' : oldDt.toLocaleString('zh-CN');
            const newDt = new Date(oldDt.getTime() + days * 86400000);
            const newStr = isNaN(newDt.getTime()) ? '无日期' : newDt.toLocaleString('zh-CN');
            return '<div>' + CommonUtils.escapeHtml(p.name || p.original_name) + ': ' + oldStr + ' → <strong>' + newStr + '</strong></div>';
        }).join('');
    } else if (mode === 'filename') {
        preview.innerHTML = selectedPhotosArr.slice(0, 5).map(function(p) {
            const name = p.original_name || p.name || '';
            const m = name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
            if (m) {
                const inferred = m[1] + '-' + m[2] + '-' + m[3];
                return '<div>' + CommonUtils.escapeHtml(name) + ' → <strong>' + inferred + '</strong></div>';
            }
            return '<div>' + CommonUtils.escapeHtml(name) + ' → <span style="color:#999;">无法推断</span></div>';
        }).join('');
    }
}

async function execBatchDateUpdate() {
    const mode = document.querySelector('input[name="batchDateMode"]:checked').value;
    const photoIds = [...Main.selectedPhotos];
    if (photoIds.length === 0) return;

    let updates = [];
    const selectedPhotosArr = Main.photos.filter(p => Main.selectedPhotos.has(p.id));

    if (mode === 'unified') {
        const newDate = document.getElementById('batchDateUnified').value;
        if (!newDate) { alert('请选择日期'); return; }
        updates = photoIds.map(function(id) { return { id: id, taken_at: newDate }; });
    } else if (mode === 'offset') {
        const days = parseInt(document.getElementById('batchOffsetInput').value) || 0;
        updates = selectedPhotosArr.map(function(p) {
            const oldDt = new Date(p.taken_at || p.created_at);
            const newDt = new Date(oldDt.getTime() + days * 86400000);
            return { id: p.id, taken_at: newDt.toISOString() };
        });
    } else if (mode === 'filename') {
        updates = [];
        selectedPhotosArr.forEach(function(p) {
            const name = p.original_name || p.name || '';
            const m = name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
            if (m) {
                updates.push({ id: p.id, taken_at: m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00Z' });
            }
        });
    }

    if (updates.length === 0) { alert('无可执行的更新'); return; }

    try {
        // 分批更新，每批 50 张
        const batch = updates.slice(0, 50);
        const { error } = await supabase
            .from('photos')
            .upsert(batch, { onConflict: 'id' });
        if (error) throw error;

        // 更新本地缓存
        const updateMap = {};
        updates.forEach(function(u) { updateMap[u.id] = u.taken_at; });
        Main.photos.forEach(function(p) {
            if (updateMap[p.id]) p.taken_at = updateMap[p.id];
        });

        document.getElementById('batchDateModal').style.display = 'none';
        window.renderPhotos();
        alert('成功更新 ' + updates.length + ' 张照片的日期');
    } catch (err) {
        alert('批量调整日期失败: ' + err.message);
    }
}

function updateFavoriteButton() {
    const btn = document.getElementById('favoriteBtn')
    if (Main.currentPhoto && Main.currentPhoto.is_favorite) {
        btn.textContent = '❤️ 已收藏'
    } else {
        btn.textContent = '🤍 收藏'
    }
}

// 挂载到 window 以兼容 HTML onclick 属性
window.toggleSelectMode = toggleSelectMode;
window.togglePhotoSelect = togglePhotoSelect;
window.exportSelectedPhotos = exportSelectedPhotos;
window.batchDeletePhotos = batchDeletePhotos;
window.selectAllPhotos = selectAllPhotos;
window.openBatchCategoryModal = openBatchCategoryModal;
window.closeBatchCategoryModal = closeBatchCategoryModal;
window.batchAddCategories = batchAddCategories;
window.batchRemoveCategories = batchRemoveCategories;
window.openBatchLocationModal = openBatchLocationModal;
window.saveBatchLocation = saveBatchLocation;
window.openBatchDateModal = openBatchDateModal;
window.onBatchDateModeChange = onBatchDateModeChange;
window.applyOffset = applyOffset;
window.execBatchDateUpdate = execBatchDateUpdate;
window.updateFavoriteButton = updateFavoriteButton;

export {
    toggleSelectMode,
    togglePhotoSelect,
    exportSelectedPhotos,
    batchDeletePhotos,
    selectAllPhotos,
    openBatchCategoryModal,
    closeBatchCategoryModal,
    batchAddCategories,
    batchRemoveCategories,
    openBatchLocationModal,
    saveBatchLocation,
    openBatchDateModal,
    onBatchDateModeChange,
    applyOffset,
    execBatchDateUpdate,
    updateFavoriteButton
};
