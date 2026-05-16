// src/desktop/views/time-capsule.js — 时光胶囊：创建、解锁、编辑、删除
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

async function loadTimeCapsules() {
    var container = document.getElementById('timeCapsuleList');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载中...</p>';
    try {
        var { data } = await supabase.from('time_capsules').select('*').order('created_at', { ascending: false });
        window._timeCapsulesData = data || [];
        renderTimeCapsuleList(window._timeCapsulesData);
    } catch (e) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载失败</p>';
    }
}

function renderTimeCapsuleList(capsules) {
    var container = document.getElementById('timeCapsuleList');
    if (!container) return;
    if (!capsules || capsules.length === 0) {
        container.innerHTML = '<div class="empty-hint">⏳ 还没有时光胶囊<br><small>创建一个吧，把想说的话封存起来</small></div>';
        return;
    }
    var now = new Date();
    var html = '';
    capsules.forEach(function(c) {
        var isLocked = c.status === 'locked';
        var isCreator = (c.created_by === 'laoda' && Main.currentUser.isLaoda) || (c.created_by === 'xiaodi' && !Main.currentUser.isLaoda);
        var createdLabel = c.created_by === 'laoda' ? '老大' : '小弟';
        if (isLocked) {
            var hint = '';
            if (c.unlock_mode === 'time' && c.reveal_at) {
                var revealDate = new Date(c.reveal_at);
                var diff = revealDate - now;
                if (diff > 0) {
                    var days = Math.floor(diff / 86400000);
                    var hours = Math.floor((diff % 86400000) / 3600000);
                    hint = '⏰ ' + (days > 0 ? days + '天' : '') + hours + '小时后解锁';
                } else {
                    hint = '⏰ 已到解锁时间（刷新后解锁）';
                }
            } else if (c.unlock_mode === 'location') {
                hint = '📍 在' + (c.reveal_lat ? c.reveal_lat.toFixed(2) + ',' + c.reveal_lng.toFixed(2) : '某个地方') + '等你';
            } else if (c.unlock_mode === 'both') {
                hint = '⏰📍 定时+定位解锁';
            }
            html += '<div class="time-capsule-card locked" onclick="window.showCapsuleDetail(' + c.id + ')">' +
                '<div class="capsule-icon">' + (isCreator ? '✍️' : '🔒') + '</div>' +
                '<div class="capsule-info">' +
                '<div class="capsule-title">' + CommonUtils.escapeHtml(c.title) + '</div>' +
                '<div class="capsule-hint">' + hint + '</div>' +
                '<div class="capsule-meta">' + createdLabel + ' · ' + CommonUtils.formatRelativeTime(c.created_at) + '</div>' +
                '</div></div>';
        } else {
            html += '<div class="time-capsule-card unlocked" onclick="window.showCapsuleDetail(' + c.id + ')">' +
                '<div class="capsule-icon">💌</div>' +
                '<div class="capsule-info">' +
                '<div class="capsule-title">' + CommonUtils.escapeHtml(c.title) + '</div>' +
                '<div class="capsule-content">' + CommonUtils.escapeHtml((c.content || '').substring(0, 50) + ((c.content || '').length > 50 ? '...' : '')) + '</div>' +
                '<div class="capsule-meta">' + createdLabel + ' · ' + (c.unlocked_at ? CommonUtils.formatRelativeTime(c.unlocked_at) + ' 解锁' : '') + '</div>' +
                '</div></div>';
        }
    });
    container.innerHTML = html;
}

function openTimeCapsuleCreateModal() {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'timeCapsuleModal';
    modal.innerHTML = '<div class="modal-card" style="max-width:480px;">' +
        '<h3>⏳ 封存时光胶囊</h3>' +
        '<div class="form-group"><label>标题</label><input id="capsuleTitle" class="form-input" placeholder="给这个胶囊起个名字"></div>' +
        '<div class="form-group"><label>内容</label><textarea id="capsuleContent" class="form-input" rows="4" placeholder="想对未来说的话..."></textarea></div>' +
        '<div class="form-group"><label>解锁方式</label>' +
        '<select id="capsuleUnlockMode" class="form-input" onchange="window.onCapsuleModeChange()">' +
        '<option value="time">⏰ 定时解锁</option>' +
        '<option value="location">📍 定位解锁</option>' +
        '<option value="both">⏰📍 定时+定位</option></select></div>' +
        '<div id="capsuleTimeField" class="form-group"><label>解锁时间</label><input id="capsuleRevealAt" type="datetime-local" class="form-input"></div>' +
        '<div id="capsuleLocationFields" style="display:none;">' +
        '<div class="form-row"><div class="form-group" style="flex:1;"><label>纬度</label><input id="capsuleRevealLat" type="number" step="0.00001" class="form-input" placeholder="例如 39.9042"></div>' +
        '<div class="form-group" style="flex:1;"><label>经度</label><input id="capsuleRevealLng" type="number" step="0.00001" class="form-input" placeholder="例如 116.4074"></div></div>' +
        '<button type="button" class="btn-secondary" style="width:100%;margin-bottom:10px;" onclick="window.openCapsuleMapPicker(\'\')">📍 在地图上选点</button>' +
        '<div class="form-group"><label>解锁半径(米)</label><input id="capsuleRevealRadius" type="number" class="form-input" value="200" min="50" max="5000"></div></div>' +
        '<div class="modal-actions">' +
        '<button class="btn-primary" onclick="window.createTimeCapsule()">💾 封存</button>' +
        '<button class="btn-secondary" onclick="document.getElementById(\'timeCapsuleModal\').remove()">取消</button></div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var latEl = document.getElementById('capsuleRevealLat');
            var lngEl = document.getElementById('capsuleRevealLng');
            if (latEl && lngEl && !latEl.value) {
                latEl.value = pos.coords.latitude.toFixed(5);
                lngEl.value = pos.coords.longitude.toFixed(5);
            }
        }, function() {}, { timeout: 5000 });
    }
}

function onCapsuleModeChange() {
    var mode = document.getElementById('capsuleUnlockMode').value;
    document.getElementById('capsuleTimeField').style.display = (mode === 'time' || mode === 'both') ? '' : 'none';
    document.getElementById('capsuleLocationFields').style.display = (mode === 'location' || mode === 'both') ? '' : 'none';
}

function openCapsuleMapPicker(prefix) {
    var latEl = document.getElementById(prefix + 'capsuleRevealLat');
    var lngEl = document.getElementById(prefix + 'capsuleRevealLng');
    var initLat = parseFloat(latEl.value) || 39.9042;
    var initLng = parseFloat(lngEl.value) || 116.4074;

    var overlay = document.createElement('div');
    overlay.id = 'capsuleMapPickerOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.5);';
    overlay.innerHTML = '<div id="capsuleMapPickerMap" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;max-width:92%;height:70%;border-radius:16px;overflow:hidden;background:#fff;"></div>' +
        '<button style="position:absolute;top:10px;right:10px;z-index:10001;background:#fff;border:none;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);">✕</button>' +
        '<button id="capsuleMapConfirmBtn" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;padding:10px 32px;background:#667eea;color:#fff;border:none;border-radius:25px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15);">✓ 确认此位置</button>';
    document.body.appendChild(overlay);

    overlay.querySelector('button').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var mapEl = document.getElementById('capsuleMapPickerMap');
    var map = L.map(mapEl, { attributionControl: false, zoomControl: true }).setView([initLat, initLng], 15);
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: ['1','2','3','4'],
        maxZoom: 18
    }).addTo(map);

    var marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
    marker.bindPopup('📍 解锁地点').openPopup();

    marker.on('dragend', function() {
        var pos = marker.getLatLng();
        updateCoords(pos.lat, pos.lng);
    });
    map.on('click', function(e) {
        marker.setLatLng(e.latlng);
        updateCoords(e.latlng.lat, e.latlng.lng);
    });

    function updateCoords(lat, lng) {
        if (latEl) latEl.value = lat.toFixed(5);
        if (lngEl) lngEl.value = lng.toFixed(5);
    }

    document.getElementById('capsuleMapConfirmBtn').onclick = function() {
        var pos = marker.getLatLng();
        updateCoords(pos.lat, pos.lng);
        overlay.remove();
    };

    setTimeout(function() { map.invalidateSize(); }, 200);
}

async function createTimeCapsule() {
    var title = document.getElementById('capsuleTitle').value.trim();
    var content = document.getElementById('capsuleContent').value.trim();
    var mode = document.getElementById('capsuleUnlockMode').value;
    if (!title) { alert('请输入标题'); return; }
    var capsule = { created_by: Main.currentUser.username, title: title, content: content, unlock_mode: mode };
    if (mode === 'time' || mode === 'both') {
        var revealAt = document.getElementById('capsuleRevealAt').value;
        if (!revealAt) { alert('请选择解锁时间'); return; }
        capsule.reveal_at = new Date(revealAt).toISOString();
    }
    if (mode === 'location' || mode === 'both') {
        var lat = parseFloat(document.getElementById('capsuleRevealLat').value);
        var lng = parseFloat(document.getElementById('capsuleRevealLng').value);
        if (isNaN(lat) || isNaN(lng)) { alert('请输入有效坐标'); return; }
        capsule.reveal_lat = lat;
        capsule.reveal_lng = lng;
        capsule.reveal_radius = parseInt(document.getElementById('capsuleRevealRadius').value) || 200;
    }
    try {
        var { error } = await supabase.from('time_capsules').insert(capsule);
        if (error) throw error;
        document.getElementById('timeCapsuleModal').remove();
        loadTimeCapsules();
    } catch (e) { alert('封存失败: ' + e.message); }
}

async function checkTimeCapsules() {
    try {
        var { data } = await supabase.from('time_capsules').select('*').eq('status', 'locked');
        if (!data || data.length === 0) return;
        var now = new Date();
        var unlockedAny = false;
        for (var i = 0; i < data.length; i++) {
            var c = data[i];
            var shouldUnlock = false;
            if (c.unlock_mode === 'time') {
                shouldUnlock = c.reveal_at && new Date(c.reveal_at) <= now;
            } else if (c.unlock_mode === 'location') {
                continue;
            } else if (c.unlock_mode === 'both') {
                shouldUnlock = c.reveal_at && new Date(c.reveal_at) <= now;
                if (shouldUnlock) continue;
            }
            if (shouldUnlock) {
                await unlockTimeCapsule(c.id);
                unlockedAny = true;
            }
        }
        if (unlockedAny) {
            if (window._timeCapsulesData) loadTimeCapsules();
        }
    } catch (e) { /* silent */ }
}

async function tryUnlockCapsule(capsuleId) {
    var capsules = window._timeCapsulesData || [];
    var c = capsules.find(function(x) { return x.id === capsuleId; });
    if (!c || c.status !== 'locked') return;
    var now = new Date();
    if ((c.unlock_mode === 'time' || c.unlock_mode === 'both') && c.reveal_at) {
        if (new Date(c.reveal_at) > now) {
            alert('⏰ 还没到解锁时间哦~');
            return;
        }
    }
    if (c.unlock_mode === 'location' || c.unlock_mode === 'both') {
        if (!navigator.geolocation) { alert('设备不支持定位'); return; }
        navigator.geolocation.getCurrentPosition(async function(pos) {
            var dist = _calcDistance(pos.coords.latitude, pos.coords.longitude, c.reveal_lat, c.reveal_lng);
            if (dist <= (c.reveal_radius || 200)) {
                await unlockTimeCapsule(capsuleId);
                loadTimeCapsules();
            } else {
                alert('📍 距离目标还有 ' + Math.round(dist) + ' 米（需在 ' + (c.reveal_radius || 200) + ' 米内）');
            }
        }, function() { alert('无法获取位置'); }, { timeout: 10000 });
        return;
    }
    await unlockTimeCapsule(capsuleId);
    loadTimeCapsules();
}

async function unlockTimeCapsule(capsuleId) {
    try {
        await supabase.from('time_capsules').update({
            status: 'unlocked',
            unlocked_by: Main.currentUser.username,
            unlocked_at: new Date().toISOString()
        }).eq('id', capsuleId);
    } catch (e) { /* silent */ }
}

function showCapsuleDetail(capsuleId) {
    var c = window._timeCapsulesData ? window._timeCapsulesData.find(function(x) { return x.id === capsuleId; }) : null;
    if (!c) return;
    var isLocked = c.status === 'locked';
    var isCreator = (c.created_by === 'laoda' && Main.currentUser.isLaoda) || (c.created_by === 'xiaodi' && !Main.currentUser.isLaoda);
    var canView = isCreator || !isLocked;
    var createdLabel = c.created_by === 'laoda' ? '老大' : '小弟';
    var unlockedLabel = c.unlocked_by === 'laoda' ? '老大' : (c.unlocked_by ? '小弟' : '');

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

    var photoHtml = '';
    if (c.photo_storage_path && canView) {
        photoHtml = '<img src="' + CommonUtils.escapeHtml(c.photo_storage_path) + '" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;margin:12px 0;" onerror="this.style.display=\'none\'">';
    }

    modal.innerHTML = '<div class="modal-sheet capsule-detail-modal" style="max-width:400px;">' +
        '<div style="text-align:center;padding:20px 16px 0;">' +
        '<div style="font-size:48px;margin-bottom:8px;">' + (canView ? (isLocked ? '🔒' : '💌') : '🔐') + '</div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">' + CommonUtils.escapeHtml(c.title) + '</div>' +
        (isLocked && !isCreator ? '<div style="color:var(--text-muted);font-size:13px;">🔐 ' + createdLabel + ' 封存的秘密，等待解锁...</div>' : '') +
        (isLocked && isCreator ? '<div style="color:var(--text-muted);font-size:13px;">🔒 你的胶囊，尚未被对方解锁</div>' : '') +
        '</div>' +
        '<div style="padding:16px;">' +
        (canView ? '<div style="font-size:15px;line-height:1.8;white-space:pre-wrap;margin-bottom:12px;">' + CommonUtils.escapeHtml(c.content || '') + '</div>' : '') +
        photoHtml +
        '<div style="font-size:12px;color:var(--text-muted);text-align:center;">' +
        createdLabel + ' 创建 · ' + CommonUtils.formatRelativeTime(c.created_at) +
        (c.reveal_at ? '<br>⏰ 定时: ' + new Date(c.reveal_at).toLocaleString() : '') +
        (c.reveal_lat ? '<br>📍 定位: ' + c.reveal_lat.toFixed(2) + ', ' + c.reveal_lng.toFixed(2) + ' (±' + (c.reveal_radius || 200) + 'm)' : '') +
        (c.unlocked_at ? '<br>🔓 ' + unlockedLabel + ' 于 ' + CommonUtils.formatRelativeTime(c.unlocked_at) + ' 解锁' : '') +
        '</div></div>' +
        '<div style="text-align:center;padding:0 16px 20px;">' +
        (!isCreator && isLocked ? '<button class="btn-primary" style="width:100%;border-radius:25px;" onclick="this.closest(\'.modal-overlay\').remove();window.tryUnlockCapsule(' + c.id + ')">🔓 尝试解锁</button>' : '') +
        (isCreator ? '<div style="display:flex;gap:8px;margin-top:' + (isLocked && !isCreator ? '8px' : '0') + ';">' +
        '<button class="btn-secondary" style="flex:1;border-radius:25px;" onclick="this.closest(\'.modal-overlay\').remove();window.openEditCapsuleModal(' + c.id + ')">✏️ 编辑</button>' +
        '<button class="btn-danger" style="flex:1;border-radius:25px;" onclick="this.closest(\'.modal-overlay\').remove();window.deleteTimeCapsule(' + c.id + ')">🗑️ 删除</button>' +
        '</div>' : '') +
        '</div></div>';

    document.body.appendChild(modal);
}

function openEditCapsuleModal(capsuleId) {
    var c = window._timeCapsulesData ? window._timeCapsulesData.find(function(x) { return x.id === capsuleId; }) : null;
    if (!c) return;

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'editCapsuleModal';
    modal.innerHTML = '<div class="modal-card">' +
        '<h3>✏️ 编辑时光胶囊</h3>' +
        '<div class="form-group"><label>标题</label><input id="editCapsuleTitle" class="form-input" value="' + CommonUtils.escapeHtml(c.title) + '"></div>' +
        '<div class="form-group"><label>内容</label><textarea id="editCapsuleContent" class="form-input" rows="4">' + CommonUtils.escapeHtml(c.content || '') + '</textarea></div>' +
        '<div class="modal-actions">' +
        '<button class="btn-primary" onclick="window.updateTimeCapsule(' + capsuleId + ')">💾 保存</button>' +
        '<button class="btn-secondary" onclick="document.getElementById(\'editCapsuleModal\').remove()">取消</button></div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

async function updateTimeCapsule(capsuleId) {
    var title = (document.getElementById('editCapsuleTitle').value || '').trim();
    var content = (document.getElementById('editCapsuleContent').value || '').trim();
    if (!title) { showToast('请输入标题'); return; }
    try {
        await supabase.from('time_capsules').update({ title: title, content: content }).eq('id', capsuleId);
        var modal = document.getElementById('editCapsuleModal');
        if (modal) modal.remove();
        loadTimeCapsules();
        showToast('✅ 已保存');
    } catch (e) {
        showToast('保存失败');
    }
}

function deleteTimeCapsule(capsuleId) {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-card" style="max-width:320px;text-align:center;">' +
        '<div style="font-size:48px;margin-bottom:12px;">🗑️</div>' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:8px;">确定删除这个时光胶囊？</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">删除后不可恢复</div>' +
        '<div class="modal-actions">' +
        '<button class="btn-danger" style="flex:1;" onclick="this.closest(\'.modal-overlay\').remove();window._doDeleteCapsule(' + capsuleId + ')">确认删除</button>' +
        '<button class="btn-secondary" style="flex:1;" onclick="this.closest(\'.modal-overlay\').remove()">取消</button></div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

async function _doDeleteCapsule(capsuleId) {
    try {
        await supabase.from('time_capsules').delete().eq('id', capsuleId);
        loadTimeCapsules();
        showToast('🗑️ 已删除');
    } catch (e) {
        showToast('删除失败');
    }
}

function _calcDistance(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window.loadTimeCapsules = loadTimeCapsules;
window.renderTimeCapsuleList = renderTimeCapsuleList;
window.openTimeCapsuleCreateModal = openTimeCapsuleCreateModal;
window.onCapsuleModeChange = onCapsuleModeChange;
window.openCapsuleMapPicker = openCapsuleMapPicker;
window.createTimeCapsule = createTimeCapsule;
window.checkTimeCapsules = checkTimeCapsules;
window.tryUnlockCapsule = tryUnlockCapsule;
window.unlockTimeCapsule = unlockTimeCapsule;
window.showCapsuleDetail = showCapsuleDetail;
window.openEditCapsuleModal = openEditCapsuleModal;
window.updateTimeCapsule = updateTimeCapsule;
window.deleteTimeCapsule = deleteTimeCapsule;
window._doDeleteCapsule = _doDeleteCapsule;
window._calcDistance = _calcDistance;

export {
    loadTimeCapsules,
    renderTimeCapsuleList,
    openTimeCapsuleCreateModal,
    onCapsuleModeChange,
    openCapsuleMapPicker,
    createTimeCapsule,
    checkTimeCapsules,
    tryUnlockCapsule,
    unlockTimeCapsule,
    showCapsuleDetail,
    openEditCapsuleModal,
    updateTimeCapsule,
    deleteTimeCapsule,
    _doDeleteCapsule,
    _calcDistance
};
