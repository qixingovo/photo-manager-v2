/* MODULE: map-passport-module.js — 地图功能与足迹护照
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

// ========================================
    // 地图功能
    // ========================================
    initMapView() {
        const container = document.getElementById('mobileMapContainer');
        if (!container || this.mapView) return;

        this.mapView = L.map('mobileMapContainer').setView([35.86, 104.19], 4);
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            attribution: '&copy; 高德地图',
            subdomains: ['1','2','3','4'],
            maxZoom: 18
        }).addTo(this.mapView);

        this.loadMapPhotos();
        setTimeout(() => this.mapView.invalidateSize(), 200);
    },

    async loadMapPhotos() {
        try {
            const supabase = this.initSupabase();
            if (!supabase) return;

            const { data } = await supabase
                .from('photos')
                .select('*')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('created_at', { ascending: false });

            this.mapPhotos = data || [];
            this.renderMapMarkers();
            this.renderMobileMapPhotos();
        } catch (err) {
            console.error('加载地图照片失败:', err);
        }
    },

    renderMapMarkers() {
        if (!this.mapView) return;
        this.mapMarkers.forEach(m => this.mapView.removeLayer(m));
        this.mapMarkers = [];

        if (this.mapPhotos.length === 0) return;

        const bounds = [];
        this.mapPhotos.forEach(photo => {
            const url = this.getPhotoUrl(photo.storage_path);
            const marker = L.marker([photo.latitude, photo.longitude])
                .addTo(this.mapView)
                .bindPopup(`
                    <div style="text-align:center;max-width:180px;">
                        <img src="${url}"
                             style="width:100%;max-height:100px;object-fit:cover;border-radius:8px;margin-bottom:6px;"
                             onerror="this.style.display='none'">
                        <strong>${this.escapeHtml(photo.name)}</strong>
                        <p style="margin:4px 0;font-size:11px;color:#666;">
                            ${this.escapeHtml(photo.location_name || '')}
                        </p>
                        <button onclick="mobile.openDetail('${photo.id}')"
                            style="padding:4px 12px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
                            查看详情
                        </button>
                    </div>
                `);
            this.mapMarkers.push(marker);
            bounds.push([photo.latitude, photo.longitude]);
        });

        if (bounds.length > 0) {
            this.mapView.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
        }
    },

    renderMobileMapPhotos() {
        const container = document.getElementById('mobileMapPhotos');
        if (!container) return;

        if (this.mapPhotos.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;width:100%;">还没有带位置的照片</div>';
            return;
        }

        container.innerHTML = this.mapPhotos.map(photo => {
            const url = this.getPhotoUrl(photo.storage_path);
            return `
                <div style="width:80px;cursor:pointer;border-radius:8px;overflow:hidden;"
                     onclick="mobile.openDetail('${photo.id}')">
                    <img src="${url}" alt="${this.escapeHtml(photo.name)}"
                         style="width:80px;height:80px;object-fit:cover;">
                    <div style="font-size:10px;text-align:center;padding:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${this.escapeHtml(photo.location_name || photo.name)}
                    </div>
                </div>
            `;
        }).join('');
    },

    pickLocationOnMap() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileLocationPickerModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:95%;max-width:500px;padding:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0;font-size:16px;">点击地图选择位置</h3>
                    <button onclick="document.getElementById('mobileLocationPickerModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div id="mobilePickerMap" style="height:350px;"></div>
                <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                    <input type="text" id="mobilePickerLocationName" placeholder="地点名称" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;">
                    <span id="mobilePickerCoords" style="color:#666;font-size:13px;">点击地图获取坐标</span>
                    <button class="btn-primary" onclick="mobile.confirmMobileMapPick()" style="width:100%;">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const pickerMap = L.map('mobilePickerMap').setView([35.86, 104.19], 4);
            L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
                attribution: '&copy; 高德地图',
                subdomains: ['1','2','3','4'],
                maxZoom: 18
            }).addTo(pickerMap);

            let pickedMarker = null;

            pickerMap.on('click', function(e) {
                window.__mobilePickedLatLng = e.latlng;
                if (pickedMarker) pickerMap.removeLayer(pickedMarker);
                pickedMarker = L.marker(e.latlng).addTo(pickerMap);
                document.getElementById('mobilePickerCoords').textContent =
                    '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
            });

            setTimeout(() => pickerMap.invalidateSize(), 100);
        }, 100);
    },

    confirmMobileMapPick() {
        if (window.__mobilePickedLatLng) {
            document.getElementById('mobilePhotoLatitude').value = window.__mobilePickedLatLng.lat.toFixed(6);
            document.getElementById('mobilePhotoLongitude').value = window.__mobilePickedLatLng.lng.toFixed(6);
            const locName = (document.getElementById('mobilePickerLocationName')?.value || '').trim();
            if (locName) document.getElementById('mobilePhotoLocationName').value = locName;
        }
        const modal = document.getElementById('mobileLocationPickerModal');
        if (modal) modal.remove();
        window.__mobilePickedLatLng = null;
    },


    // ========================================
    //   足迹护照（移动端）
    // ========================================

    async loadPassport() {
        const supabase = this.initSupabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('photos')
                .select('id, name, storage_path, location_name')
                .not('location_name', 'is', null)
                .neq('location_name', '')
                .order('created_at', { ascending: false });
            if (error) throw error;
            this.passportAllPhotos = data || [];
            const grouped = {};
            for (const p of this.passportAllPhotos) {
                if (!grouped[p.location_name]) grouped[p.location_name] = [];
                grouped[p.location_name].push(p);
            }
            this.passportData = Object.entries(grouped).map(([name, photos]) => ({
                name, count: photos.length, photos, coverPhoto: photos[0]
            }));
            this.sortPassportData();
            this.renderPassport();
        } catch (e) {
            console.error('加载足迹护照失败:', e);
            document.getElementById('mobilePassportStamps').innerHTML = '<p class="empty-state">加载失败</p>';
        }
    },

    sortPassportData() {
        if (this.passportSortByPhotoCount) {
            this.passportData.sort((a, b) => b.count - a.count);
        } else {
            this.passportData.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        }
    },

    getCityEmoji(locationName) {
        const name = locationName || '';
        const map = {
            '北京': '🏛️', '上海': '🏙️', '广州': '🌆', '深圳': '🏢',
            '杭州': '🪷', '苏州': '🏯', '南京': '🏛️', '西安': '🏰',
            '成都': '🐼', '重庆': '🌉', '武汉': '🏗️', '长沙': '🌶️',
            '昆明': '🌸', '大理': '🏔️', '丽江': '🏘️', '拉萨': '⛰️',
            '厦门': '🏖️', '青岛': '🍺', '大连': '🌊', '三亚': '🌴',
            '桂林': '🏞️', '黄山': '⛰️', '张家界': '🏔️', '九寨沟': '💧',
            '香港': '🌃', '澳门': '🎰', '台北': '🏯', '东京': '🗼',
            '大阪': '🏯', '首尔': '🏯', '曼谷': '🛕', '新加坡': '🦁',
            '巴黎': '🗼', '伦敦': '🎡', '纽约': '🗽', '悉尼': '🦘',
            '故宫': '🏯', '长城': '🧱', '天安门': '🏛️', '西湖': '🪷',
        };
        for (const [key, emoji] of Object.entries(map)) {
            if (name.includes(key)) return emoji;
        }
        return '📍';
    },

    renderPassport() {
        const container = document.getElementById('mobilePassportStamps');
        const empty = document.getElementById('mobilePassportEmpty');
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) locationPhotos.style.display = 'none';
        if (this.passportData.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';
        container.innerHTML = this.passportData.map((loc, i) => {
            const emoji = this.getCityEmoji(loc.name);
            return `
            <div class="passport-stamp mobile-stamp" style="animation-delay:${i * 0.05}s" onclick="mobile.openPassportLocation('${encodeURIComponent(loc.name)}')">
                <div class="stamp-emoji">${emoji}</div>
                <div class="stamp-name">${this.escapeHtml(loc.name)}</div>
                <div class="stamp-count">${loc.count} 张照片</div>
            </div>`;
        }).join('');
    },

    togglePassportSort() {
        this.passportSortByPhotoCount = !this.passportSortByPhotoCount;
        const btn = document.getElementById('mobilePassportSortBtn');
        if (btn) btn.textContent = this.passportSortByPhotoCount ? '🔤' : '🔄';
        this.sortPassportData();
        this.renderPassport();
    },

    openPassportLocation(encodedName) {
        const name = decodeURIComponent(encodedName);
        const loc = this.passportData.find(l => l.name === name);
        if (!loc) return;
        document.getElementById('mobilePassportStamps').style.display = 'none';
        document.getElementById('mobilePassportEmpty').style.display = 'none';
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) {
            locationPhotos.style.display = 'flex';
            document.getElementById('mobilePassportLocationName').textContent = name;
        }
        const grid = document.getElementById('mobilePassportLocationGrid');
        if (grid) {
            grid.innerHTML = loc.photos.map(p => {
                const imgSrc = this.getPhotoUrl(p.storage_path);
                return `
                <div class="photo-card" onclick="mobile.openDetail('${p.id}')">
                    <img src="${imgSrc}" alt="" loading="lazy">
                    <div class="photo-card-info">
                        <h4>${this.escapeHtml(p.name || '未命名')}</h4>
                    </div>
                </div>`;
            }).join('');
        }
    },

    closePassportLocation() {
        document.getElementById('mobilePassportStamps').style.display = '';
        const empty = document.getElementById('mobilePassportEmpty');
        if (this.passportData.length === 0) {
            empty.style.display = 'flex';
        } else {
            empty.style.display = 'none';
        }
        const locationPhotos = document.getElementById('mobilePassportLocationPhotos');
        if (locationPhotos) locationPhotos.style.display = 'none';
    },

    });
})();
