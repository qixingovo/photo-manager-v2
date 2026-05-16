// src/desktop/views/map.js — 地图视图：标记、照片网格、位置选择
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

async function initMapView() {
    const container = document.getElementById('mapContainer');
    if (!container || Main.mapView) return;

    Main.mapView = L.map('mapContainer').setView([35.86, 104.19], 4);
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        attribution: '&copy; 高德地图',
        subdomains: ['1','2','3','4'],
        maxZoom: 18
    }).addTo(Main.mapView);

    await loadMapPhotos();
    setTimeout(() => Main.mapView.invalidateSize(), 100);
}

async function loadMapPhotos() {
    try {
        const { data } = await supabase
            .from('photos')
            .select('*')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('created_at', { ascending: false });

        Main.mapPhotos = data || [];
        renderMapMarkers();
        renderMapPhotoGrid();
    } catch (err) {
        console.error('加载地图照片失败:', err);
    }
}

function renderMapMarkers() {
    if (!Main.mapView) return;
    Main.mapMarkers.forEach(m => Main.mapView.removeLayer(m));
    Main.mapMarkers = [];

    if (Main.mapPhotos.length === 0) return;

    const bounds = [];
    Main.mapPhotos.forEach(photo => {
        const marker = L.marker([photo.latitude, photo.longitude])
            .addTo(Main.mapView)
            .bindPopup(`
                <div style="text-align:center;max-width:200px;">
                    <img src="${window.getPhotoUrl(photo.storage_path)}"
                         style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;"
                         onerror="this.style.display='none'">
                    <strong>${CommonUtils.escapeHtml(photo.name)}</strong>
                    <p style="margin:4px 0;font-size:12px;color:#666;">
                        ${CommonUtils.escapeHtml(photo.location_name || '')}
                    </p>
                    <button onclick="window.openPhotoModal('${photo.id}')"
                        style="padding:4px 12px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">
                        查看详情
                    </button>
                </div>
            `);
        Main.mapMarkers.push(marker);
        bounds.push([photo.latitude, photo.longitude]);
    });

    if (bounds.length > 0) {
        Main.mapView.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
}

function renderMapPhotoGrid() {
    const grid = document.getElementById('mapPhotoGrid');
    const empty = document.getElementById('mapEmpty');

    if (!grid || !empty) return;

    if (Main.mapPhotos.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    grid.style.display = 'flex';
    empty.style.display = 'none';

    grid.innerHTML = Main.mapPhotos.map(photo => {
        const url = window.getPhotoUrl(photo.storage_path);
        return `
            <div class="photo-card" style="width:150px;cursor:pointer;"
                 onclick="window.openPhotoModal('${photo.id}')">
                <img src="${url}" alt="${CommonUtils.escapeHtml(photo.name)}"
                     style="width:100%;height:120px;object-fit:cover;">
                <div class="photo-info">
                    <h3 style="font-size:12px;">${CommonUtils.escapeHtml(photo.name)}</h3>
                    <p style="font-size:11px;color:#666;">${CommonUtils.escapeHtml(photo.location_name || '')}</p>
                </div>
            </div>
        `;
    }).join('');
}

function pickLocationOnMap() {
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
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            attribution: '&copy; 高德地图',
            subdomains: ['1','2','3','4'],
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
}

function confirmMapPick() {
    if (window.__pickedLatLng) {
        document.getElementById('photoLatitude').value = window.__pickedLatLng.lat.toFixed(6);
        document.getElementById('photoLongitude').value = window.__pickedLatLng.lng.toFixed(6);
        const locName = (document.getElementById('pickerLocationName')?.value || '').trim();
        if (locName) document.getElementById('photoLocationName').value = locName;
    }
    const modal = document.getElementById('locationPickerModal');
    if (modal) modal.remove();
    window.__pickedLatLng = null;
}

window.initMapView = initMapView;
window.loadMapPhotos = loadMapPhotos;
window.renderMapMarkers = renderMapMarkers;
window.renderMapPhotoGrid = renderMapPhotoGrid;
window.pickLocationOnMap = pickLocationOnMap;
window.confirmMapPick = confirmMapPick;

export {
    initMapView,
    loadMapPhotos,
    renderMapMarkers,
    renderMapPhotoGrid,
    pickLocationOnMap,
    confirmMapPick
};
