/* MODULE: photos-module.js — 照片管理功能（批量设置、上传、分类、评论、编辑、照片选择器、删除确认）
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {
    Object.assign(mobile, {

// ========================================
    // 批量设置位置
    // ========================================
    openBatchLocationModal() {
        if (this.selectedPhotos.size === 0) {
            this.showToast('请先选择照片');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchLocationModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '2000';
        modal.innerHTML = `
            <div class="modal-card" style="width:95%;max-width:500px;padding:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0;font-size:16px;">为选中的 ${this.selectedPhotos.size} 张照片设置位置</h3>
                    <button onclick="document.getElementById('mobileBatchLocationModal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div id="mobileBatchPickerMap" style="height:350px;"></div>
                <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                    <input type="text" id="mobileBatchLocationName" placeholder="地点名称（如：北京故宫）" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;">
                    <span id="mobileBatchPickerCoords" style="color:#666;font-size:13px;">点击地图获取坐标</span>
                    <button class="btn-primary" onclick="mobile.saveBatchLocation()" style="width:100%;">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const pickerMap = L.map('mobileBatchPickerMap').setView([35.86, 104.19], 4);
            L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
                attribution: '&copy; 高德地图',
                subdomains: ['1','2','3','4'],
                maxZoom: 18
            }).addTo(pickerMap);

            let pickedMarker = null;

            pickerMap.on('click', function(e) {
                window.__mobileBatchPickedLatLng = e.latlng;
                if (pickedMarker) pickerMap.removeLayer(pickedMarker);
                pickedMarker = L.marker(e.latlng).addTo(pickerMap);
                document.getElementById('mobileBatchPickerCoords').textContent =
                    '纬:' + e.latlng.lat.toFixed(4) + ', 经:' + e.latlng.lng.toFixed(4);
            });

            setTimeout(() => pickerMap.invalidateSize(), 100);
        }, 100);
    },

    async saveBatchLocation() {
        if (!window.__mobileBatchPickedLatLng) {
            this.showToast('请先点击地图选择位置');
            return;
        }

        const lat = window.__mobileBatchPickedLatLng.lat;
        const lng = window.__mobileBatchPickedLatLng.lng;
        const locationName = (document.getElementById('mobileBatchLocationName')?.value || '').trim() || null;
        const photoIds = [...this.selectedPhotos];
        const supabase = this.initSupabase();

        try {
            const { error } = await supabase
                .from('photos')
                .update({ latitude: lat, longitude: lng, location_name: locationName })
                .in('id', photoIds);

            if (error) throw error;

            this.photos.forEach(p => {
                if (this.selectedPhotos.has(p.id)) {
                    p.latitude = lat;
                    p.longitude = lng;
                    p.location_name = locationName;
                }
            });

            document.getElementById('mobileBatchLocationModal').remove();
            window.__mobileBatchPickedLatLng = null;

            this.selectedPhotos.clear();
            this.selectMode = false;
            this.updateSelectModeUI();
            this.renderPhotos();
            this.showToast(`已为 ${photoIds.length} 张照片设置位置`);
            this.addXP(20, 'location');
        } catch (err) {
            this.showToast('批量设置位置失败: ' + err.message);
        }
    },

    // 批量调整日期
    openBatchDateModal() {
        if (this.selectedPhotos.size === 0) { this.showToast('请先选择照片'); return; }
        const self = this;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchDateModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:95vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;">📅 调整日期</h3>' +
                '<button class="icon-btn" onclick="document.getElementById(\'mobileBatchDateModal\').remove()">×</button>' +
            '</div>' +
            '<div style="font-size:12px;color:#888;margin-bottom:10px;">已选 ' + self.selectedPhotos.size + ' 张</div>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><input type="radio" name="mBatchDateMode" value="unified" checked onchange="mobile._updateDatePreview()"> 统一设置</label>' +
            '<input type="datetime-local" id="mBatchDateUnified" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:10px;">' +
            '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><input type="radio" name="mBatchDateMode" value="offset" onchange="mobile._updateDatePreview()"> 偏移调整</label>' +
            '<div id="mBatchOffsetRow" style="display:none;flex-wrap:wrap;gap:4px;margin-bottom:10px;">' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(-7)">-7天</button>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(-1)">-1天</button>' +
                '<input type="number" id="mBatchOffsetInput" value="0" style="width:60px;padding:6px;border:1px solid #ddd;border-radius:6px;text-align:center;">' +
                '<span style="font-size:12px;color:#666;">天</span>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(1)">+1天</button>' +
                '<button class="btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="mobile._applyOffset(7)">+7天</button>' +
            '</div>' +
            '<div style="font-size:12px;margin-bottom:8px;"><strong>预览（前5张）：</strong></div>' +
            '<div id="mBatchDatePreview" style="max-height:150px;overflow-y:auto;font-size:11px;margin-bottom:10px;"></div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button class="btn-secondary" onclick="document.getElementById(\'mobileBatchDateModal\').remove()" style="flex:1;">取消</button>' +
                '<button class="btn-primary" onclick="mobile.execBatchDateUpdate()" style="flex:1;">确认修改</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        this._updateDatePreview();
    },

    _updateDatePreview() {
        const self = this;
        const mode = document.querySelector('input[name="mBatchDateMode"]:checked')?.value || 'unified';
        document.getElementById('mBatchDateUnified').style.display = mode === 'unified' ? 'block' : 'none';
        document.getElementById('mBatchOffsetRow').style.display = mode === 'offset' ? 'flex' : 'none';
        const preview = document.getElementById('mBatchDatePreview');
        const selectedArr = this.photos.filter(function(p) { return self.selectedPhotos.has(p.id); }).slice(0, 5);

        if (mode === 'unified') {
            const newDate = document.getElementById('mBatchDateUnified').value;
            if (!newDate) { preview.innerHTML = '<span style="color:#999;">请选择日期</span>'; return; }
            preview.innerHTML = selectedArr.map(function(p) {
                const old = (p.taken_at || p.created_at) ? new Date(p.taken_at || p.created_at).toLocaleString('zh-CN') : '无';
                return '<div>' + self.escapeHtml(p.name || '') + ': ' + old + ' → <strong>' + new Date(newDate).toLocaleString('zh-CN') + '</strong></div>';
            }).join('');
        } else if (mode === 'offset') {
            const days = parseInt(document.getElementById('mBatchOffsetInput').value) || 0;
            preview.innerHTML = selectedArr.map(function(p) {
                const oldDt = new Date(p.taken_at || p.created_at);
                const oldStr = isNaN(oldDt.getTime()) ? '无' : oldDt.toLocaleString('zh-CN');
                const newDt = new Date(oldDt.getTime() + days * 86400000);
                return '<div>' + self.escapeHtml(p.name || '') + ': ' + oldStr + ' → <strong>' + newDt.toLocaleString('zh-CN') + '</strong></div>';
            }).join('');
        }
    },

    _applyOffset(days) {
        const inp = document.getElementById('mBatchOffsetInput');
        inp.value = parseInt(inp.value || 0) + days;
        document.querySelector('input[name="mBatchDateMode"][value="offset"]').checked = true;
        this._updateDatePreview();
    },

    async execBatchDateUpdate() {
        const mode = document.querySelector('input[name="mBatchDateMode"]:checked')?.value || 'unified';
        const photoIds = [...this.selectedPhotos];
        if (photoIds.length === 0) return;
        const self = this;
        const selectedArr = this.photos.filter(function(p) { return self.selectedPhotos.has(p.id); });

        let updates = [];
        if (mode === 'unified') {
            const newDate = document.getElementById('mBatchDateUnified').value;
            if (!newDate) { this.showToast('请选择日期'); return; }
            updates = photoIds.map(function(id) { return { id: id, taken_at: newDate }; });
        } else if (mode === 'offset') {
            const days = parseInt(document.getElementById('mBatchOffsetInput').value) || 0;
            updates = selectedArr.map(function(p) {
                const oldDt = new Date(p.taken_at || p.created_at);
                return { id: p.id, taken_at: new Date(oldDt.getTime() + days * 86400000).toISOString() };
            });
        }

        if (updates.length === 0) return;
        try {
            const supabase = this.initSupabase();
            const { error } = await supabase.from('photos').upsert(updates.slice(0, 50), { onConflict: 'id' });
            if (error) throw error;
            const updateMap = {};
            updates.forEach(function(u) { updateMap[u.id] = u.taken_at; });
            this.photos.forEach(function(p) { if (updateMap[p.id]) p.taken_at = updateMap[p.id]; });
            document.getElementById('mobileBatchDateModal').remove();
            this.selectedPhotos.clear(); this.selectMode = false; this.updateSelectModeUI(); this.renderPhotos();
            this.showToast('已更新 ' + updates.length + ' 张照片的日期');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },

    // 批量改分类 (移动端)
    openBatchCategoryModal() {
        if (this.selectedPhotos.size === 0) { this.showToast('请先选择照片'); return; }
        const self = this;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'mobileBatchCategoryModal';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = '<div class="modal-card" style="max-width:90vw;padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;">📁 批量管理分类</h3>' +
                '<button class="icon-btn" onclick="document.getElementById(\'mobileBatchCategoryModal\').remove()">×</button>' +
            '</div>' +
            '<div style="font-size:12px;color:#888;margin-bottom:10px;">已选 ' + self.selectedPhotos.size + ' 张</div>' +
            '<div id="mBatchCatList" style="max-height:240px;overflow-y:auto;margin-bottom:10px;font-size:13px;"></div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button class="btn-secondary" style="flex:1;" onclick="mobile.batchAddCategories()">追加分类</button>' +
                '<button class="btn-danger" style="flex:1;" onclick="mobile.batchRemoveCategories()">移除分类</button>' +
            '</div></div>';
        document.body.appendChild(modal);

        const list = document.getElementById('mBatchCatList');
        const cats = this.categories || [];
        if (cats.length === 0) {
            list.innerHTML = '<span style="color:#999;">暂无分类</span>';
        } else {
            list.innerHTML = cats.map(function(c) {
                return '<label style="display:flex;align-items:center;gap:6px;padding:6px 0;cursor:pointer;">' +
                    '<input type="checkbox" value="' + c.id + '" class="mBatchCatCheck"> ' + self.escapeHtml(c.name) + '</label>';
            }).join('');
        }
    },

    async batchAddCategories() {
        const self = this;
        const checked = [...document.querySelectorAll('.mBatchCatCheck:checked')].map(function(cb) { return cb.value; });
        if (checked.length === 0) { this.showToast('请选择分类'); return; }
        try {
            const supabase = this.initSupabase();
            const rows = [];
            this.selectedPhotos.forEach(function(pid) {
                checked.forEach(function(cid) { rows.push({ photo_id: pid, category_id: cid }); });
            });
            await supabase.from('photo_categories').upsert(rows, { onConflict: 'photo_id,category_id', ignoreDuplicates: true });
            document.getElementById('mobileBatchCategoryModal').remove();
            await this.loadAllPhotoCategories();
            this.showToast('已为 ' + this.selectedPhotos.size + ' 张照片追加分类');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },

    async batchRemoveCategories() {
        const checked = [...document.querySelectorAll('.mBatchCatCheck:checked')].map(function(cb) { return cb.value; });
        if (checked.length === 0) { this.showToast('请选择分类'); return; }
        try {
            const supabase = this.initSupabase();
            const photoIds = [...this.selectedPhotos];
            await supabase.from('photo_categories').delete().in('photo_id', photoIds).in('category_id', checked);
            document.getElementById('mobileBatchCategoryModal').remove();
            await this.loadAllPhotoCategories();
            this.showToast('已从 ' + photoIds.length + ' 张照片移除分类');
        } catch (e) { this.showToast('失败: ' + e.message); }
    },


    // ========================================
    // 上传相关
    // ========================================
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        this.previewFiles = files;
        const previewArea = document.getElementById('previewArea');
        const previewGrid = document.getElementById('previewGrid');

        previewArea.style.display = 'block';
        previewGrid.innerHTML = files.map((file, index) => `
            <div class="preview-item">
                <img src="${URL.createObjectURL(file)}" alt="Preview">
                <button class="remove-btn" onclick="mobile.removePreview(${index})">×</button>
            </div>
        `).join('');
    },

    removePreview(index) {
        this.previewFiles.splice(index, 1);
        if (this.previewFiles.length === 0) {
            document.getElementById('previewArea').style.display = 'none';
        } else {
            this.renderPreviews();
        }
    },

    renderPreviews() {
        const previewGrid = document.getElementById('previewGrid');
        if (!previewGrid) return;
        previewGrid.innerHTML = this.previewFiles.map((file, index) => `
            <div class="preview-item">
                <img src="${URL.createObjectURL(file)}" alt="Preview">
                <button class="remove-btn" onclick="mobile.removePreview(${index})">×</button>
            </div>
        `).join('');
    },

    clearPreviews() {
        this.previewFiles = [];
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('photoInput').value = '';
    },

    async uploadPhotos() {
        if (this.previewFiles.length === 0) {
            this.showToast('请先选择照片');
            return;
        }

        const progressSection = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const uploadBtn = document.getElementById('uploadBtn');
        const supabase = this.initSupabase();

        progressSection.style.display = 'block';
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';

        const total = this.previewFiles.length;
        const namePrefix = document.getElementById('mobilePhotoName').value.trim();
        const description = document.getElementById('mobilePhotoDesc').value.trim();
        const categoryId = this.getSelectedUploadCategoryId();
        const locationName = (document.getElementById('mobilePhotoLocationName')?.value || '').trim() || null;
        const latitude = parseFloat(document.getElementById('mobilePhotoLatitude')?.value) || null;
        const longitude = parseFloat(document.getElementById('mobilePhotoLongitude')?.value) || null;
        
        let successCount = 0;
        
        for (let i = 0; i < total; i++) {
            let file = this.previewFiles[i];

            // 文件类型校验
            const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
            const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
                this.showToast('仅支持 JPG/PNG/GIF/WebP/HEIC 格式图片');
                continue;
            }

            // 压缩超过1.5MB的图片
            if (file.size > 1.5 * 1024 * 1024) {
                this.showToast(`压缩第 ${i + 1} 张图片...`);
                file = await this.compressImage(file, 1.5);
                this.showToast(`压缩完成: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
            }
            
            const fileName = namePrefix ? `${namePrefix}_${i + 1}` : file.name;
            const fileExtension = file.name.split('.').pop();
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
            
            try {
                // 上传到 Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('photo')
                    .upload(uniqueName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });
                
                if (uploadError) throw uploadError;
                
                // 保存到 photos 表
                const { data: photoData, error: insertError } = await supabase
                    .from('photos')
                    .insert([{
                        name: fileName,
                        description: description,
                        storage_path: uniqueName,
                        original_name: file.name,
                        size: file.size,
                        is_favorite: false,
                        latitude,
                        longitude,
                        location_name: locationName
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                successCount++;

                // 写入 photo_categories 关联表
                if (categoryId) {
                    const photoId = photoData.id;
                    await supabase.from('photo_categories').insert([{
                        photo_id: photoId,
                        category_id: categoryId
                    }]);
                }
            } catch (err) {
                console.error('上传失败:', err);
            }
            
            const percent = Math.round(((i + 1) / total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }

        // 重置
        progressSection.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传照片';

        this.clearPreviews();
        document.getElementById('mobilePhotoName').value = '';
        document.getElementById('mobilePhotoDesc').value = '';
        const locNameEl = document.getElementById('mobilePhotoLocationName');
        const latEl = document.getElementById('mobilePhotoLatitude');
        const lngEl = document.getElementById('mobilePhotoLongitude');
        if (locNameEl) locNameEl.value = '';
        if (latEl) latEl.value = '';
        if (lngEl) lngEl.value = '';
        this.renderUploadCategoryCascade();
        this.showToast(`成功上传 ${successCount} 张照片`);
        for (let i = 0; i < successCount; i++) this.addXP(5, 'upload');
        if (latitude && longitude) this.addXP(20, 'location');

        // 记住本次使用的分类
        if (categoryId) {
            localStorage.setItem('lastUploadCategoryId', categoryId);
        }
        
        // 重新加载照片和分类关联
        await this.loadPhotos();
        await this.loadAllPhotoCategories();
        this.renderPhotos();
    },


    // ========================================
    // 分类相关
    // ========================================
    updateCategorySelects() {
        // 只更新 filterCategory 下拉框（扁平列表）
        const filterSelect = document.getElementById('mobileFilterCategory');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="all">全部分类</option>';
            this.categories.forEach(cat => {
                filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        }
        
        // 渲染上传页面的级联分类选择器
        this.renderUploadCategoryCascade();
        
        // 渲染添加分类的父分类级联选择器
        this.renderParentCategoryCascade();
    },

    // 渲染上传页面的级联分类选择器
    renderUploadCategoryCascade() {
        const container = document.getElementById('mobileUploadCategoryCascade');
        const lastBtn = document.getElementById('useLastCategoryBtn');
        if (!container) return;
        container.innerHTML = '';

        // 先更新上次分类按钮（只要localStorage有记录就显示，不依赖categories是否加载）
        const lastCatId = localStorage.getItem('lastUploadCategoryId');
        const lastCat = lastCatId ? this.categories.find(c => String(c.id) === lastCatId) : null;
        if (lastBtn) {
            if (lastCatId) {
                lastBtn.textContent = lastCat ? `📂 上次: ${lastCat.name}` : '📂 上次分类';
                lastBtn.style.display = 'block';
            } else {
                lastBtn.style.display = 'none';
            }
        }

        const topLevel = this.categories.filter(c => !c.parent_id);
        if (topLevel.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:13px;">暂无分类</p>';
            return;
        }

        const select = document.createElement('select');
        select.id = 'mobileUploadCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.onchange = () => this.onUploadCatLevelChange(0);
        select.innerHTML = `<option value="">选择分类（可选）</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        container.appendChild(select);
    },

    useLastUploadCategory() {
        const lastCatId = localStorage.getItem('lastUploadCategoryId');
        if (!lastCatId) return;
        const lastCat = this.categories.find(c => String(c.id) === lastCatId);
        if (!lastCat) return;

        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return;
        container.innerHTML = '';

        const select = document.createElement('select');
        select.id = 'mobileUploadCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.innerHTML = `<option value="">选择分类（可选）</option>${this.categories.filter(c => !c.parent_id).map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        select.value = lastCatId;
        container.appendChild(select);

        // 如果有子分类也要补上
        const children = this.categories.filter(c => String(c.parent_id) === String(lastCatId));
        if (children.length > 0) {
            const childSelect = document.createElement('select');
            childSelect.id = 'mobileUploadCatLevel1';
            childSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
            childSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
            container.appendChild(childSelect);
        }

        this.showToast(`已选择: ${lastCat.name}`);
    },

    onUploadCatLevelChange(level) {
        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return;
        const select = document.getElementById(`mobileUploadCatLevel${level}`);
        if (!select) return;
        
        const selectedValue = select.value;
        
        // 删除高于当前级别的选择器
        const selects = container.querySelectorAll('select');
        selects.forEach((s, i) => {
            if (i > level) s.remove();
        });
        
        // 如果选中了某个分类，显示其子分类作为下一级
        if (selectedValue) {
            const children = this.categories.filter(c => String(c.parent_id) === selectedValue);
            if (children.length > 0) {
                const nextLevel = level + 1;
                const nextSelect = document.createElement('select');
                nextSelect.id = `mobileUploadCatLevel${nextLevel}`;
                nextSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
                nextSelect.onchange = () => this.onUploadCatLevelChange(nextLevel);
                nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
                container.appendChild(nextSelect);
            }
        }
    },

    getSelectedUploadCategoryId() {
        const container = document.getElementById('mobileUploadCategoryCascade');
        if (!container) return null;
        const selects = container.querySelectorAll('select');
        for (let i = selects.length - 1; i >= 0; i--) {
            if (selects[i].value) return selects[i].value;
        }
        return null;
    },

    // 渲染添加分类的父分类级联选择器
    renderParentCategoryCascade() {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return;
        container.innerHTML = '';
        
        const topLevel = this.categories.filter(c => !c.parent_id);
        if (topLevel.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:13px;">暂无父分类可选</p>';
            return;
        }
        
        const select = document.createElement('select');
        select.id = 'parentCatLevel0';
        select.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;';
        select.onchange = () => this.onParentCatLevelChange(0);
        select.innerHTML = `<option value="">无父分类</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
        container.appendChild(select);
    },

    onParentCatLevelChange(level) {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return;
        const select = document.getElementById(`parentCatLevel${level}`);
        if (!select) return;
        
        const selectedValue = select.value;
        
        // 删除高于当前级别的选择器
        const selects = container.querySelectorAll('select');
        selects.forEach((s, i) => {
            if (i > level) s.remove();
        });
        
        // 如果选中了某个分类，显示其子分类作为下一级
        if (selectedValue) {
            const children = this.categories.filter(c => String(c.parent_id) === selectedValue);
            if (children.length > 0) {
                const nextLevel = level + 1;
                const nextSelect = document.createElement('select');
                nextSelect.id = `parentCatLevel${nextLevel}`;
                nextSelect.style.cssText = 'width:100%;padding:12px 16px;border:1px solid #e9ecef;border-radius:10px;font-size:15px;background:white;margin-top:8px;';
                nextSelect.onchange = () => this.onParentCatLevelChange(nextLevel);
                nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
                container.appendChild(nextSelect);
            }
        }
    },

    getSelectedParentCategoryId() {
        const container = document.getElementById('parentCategoryCascade');
        if (!container) return null;
        const selects = container.querySelectorAll('select');
        for (let i = selects.length - 1; i >= 0; i--) {
            if (selects[i].value) return selects[i].value;
        }
        return null;
    },

    renderCategories() {
        const list = document.getElementById('categoryList');
        const rootCategories = this.categories.filter(c => !c.parent_id);

        // 添加 ALL 选项在最前面
        let html = `
            <div class="category-item" id="cat-all" onclick="mobile.switchToHomeAndFilter('all')">
                <div class="category-header">
                    <div class="category-name">
                        <span>📷</span>
                        <span class="category-name-text">全部</span>
                    </div>
                </div>
            </div>
        `;
        
        html += rootCategories.map(cat => this.renderCategoryItem(cat, 0)).join('');
        list.innerHTML = html;

        if (rootCategories.length === 0) {
            list.innerHTML += '<div class="empty-state"><span class="empty-icon">📁</span><p>暂无分类</p></div>';
        }
    },

    renderCategoryItem(cat, level) {
        const strCatId = String(cat.id);
        const children = this.categories.filter(c => String(c.parent_id) === strCatId);
        const isMarked = this.markedCategories.map(m => String(m)).includes(strCatId);
        const isLocked = !!this.lockedCategories[strCatId];
        const indent = level * 16;
        const hasChildren = children.length > 0;
        const arrow = hasChildren ? '<span class="category-arrow" onclick="event.stopPropagation(); mobile.toggleChildren(\'' + strCatId + '\')">›</span>' : '';
        const icon = level === 0 ? (isMarked ? '⭐' : '📁') : '📄';

        return `
            <div class="category-item" id="cat-${strCatId}" style="padding-left:${indent}px;">
                <div class="category-header" onclick="mobile.toggleCategoryActions('${strCatId}')">
                    <div class="category-name">
                        <span>${icon}${isLocked ? ' 🔒' : ''}</span>
                        <span class="category-name-text">${this.escapeHtml(cat.name)}</span>
                        ${arrow}
                    </div>
                </div>
                ${hasChildren ? `
                    <div class="category-children" id="children-${strCatId}">
                        ${children.map(child => this.renderCategoryItem(child, level + 1)).join('')}
                    </div>
                ` : ''}
                <div class="category-actions" id="actions-${strCatId}" style="display:none;">
                    <button class="btn-secondary" onclick="mobile.markCategory('${strCatId}')">
                        ${isMarked ? '⭐ 已标记' : '☆ 标记'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.toggleLockCategory('${strCatId}')">
                        ${isLocked ? '🔓 解锁' : '🔒 加锁'}
                    </button>
                    <button class="btn-secondary" onclick="mobile.editCategoryName('${strCatId}')">
                        ✏️ 编辑
                    </button>
                    <button class="btn-secondary" onclick="mobile.deleteCategory('${strCatId}')">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        `;
    },

    toggleCategoryActions(id) {
        const actions = document.getElementById(`actions-${id}`);
        const isActionsVisible = actions && actions.style.display !== 'none';
        
        // 如果操作栏当前显示，点击后跳转到首页筛选
        if (isActionsVisible) {
            this.switchToHomeAndFilter(id);
            return;
        }
        
        // 否则显示操作栏（标记/删除）
        // 先隐藏所有其他操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });
        
        if (actions) {
            actions.style.display = 'flex';
        }
    },

    toggleChildren(id) {
        const children = document.getElementById(`children-${id}`);
        const item = document.getElementById(`cat-${id}`);
        
        if (children) {
            const isHidden = children.style.display === 'none';
            children.style.display = isHidden ? 'block' : 'none';
            if (item) {
                item.classList.toggle('expanded', isHidden);
            }
        }
    },

    switchToHomeAndFilter(categoryId) {
        // 切换到照片页
        this.switchTab('photos');

        // 设置筛选器并筛选
        const filterSelect = document.getElementById('mobileFilterCategory');
        if (filterSelect) {
            filterSelect.value = categoryId;
        }
        this.currentCategory = categoryId;
        this.currentPage = 1;

        // 更新分类路径显示
        this.updateCategoryPathDisplay();

        this.loadPhotos();
    },

    showAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'flex';
        this.renderParentCategoryCascade();
    },

    closeAddCategory() {
        document.getElementById('addCategoryModal').style.display = 'none';
        document.getElementById('newCategoryName').value = '';
        // 重置父分类选择器
        this.renderParentCategoryCascade();
    },

    async createCategory() {
        const name = document.getElementById('newCategoryName').value.trim();
        const parentId = this.getSelectedParentCategoryId();

        if (!name) {
            this.showToast('请输入分类名称');
            return;
        }

        try {
            const supabase = this.initSupabase();
            const { data, error } = await supabase
                .from('categories')
                .insert([{ name, parent_id: parentId || null }])
                .select()
                .single();

            if (error) throw error;

            this.categories.push(data);
            this.updateCategorySelects();
            this.renderCategories();
            this.closeAddCategory();
            this.showToast('分类已添加');
            this.addXP(15, 'category');
        } catch (err) {
            this.showToast('添加失败: ' + err.message);
        }
    },

    markCategory(id) {
        const strId = String(id);
        if (this.markedCategories.map(m => String(m)).includes(strId)) {
            this.markedCategories = this.markedCategories.filter(c => String(c) !== strId);
            this.showToast('已取消标记');
        } else {
            this.markedCategories.push(strId);
            this.showToast('已标记分类 ⭐');
        }
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        this.renderCategories();
    },

    editCategoryName(id) {
        // 隐藏操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });

        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) return;

        const nameEl = document.querySelector(`#cat-${strId} .category-name-text`);
        if (!nameEl) return;
        
        // 保存原始名称
        const originalName = category.name;
        
        // 替换为输入框
        nameEl.innerHTML = `<input type="text" id="edit-cat-name-${id}" value="${this.escapeHtml(originalName)}" class="category-name-input" />`;
        
        // 添加保存/取消按钮
        const headerEl = document.querySelector(`#cat-${id} .category-header`);
        headerEl.innerHTML += `
            <div class="category-edit-actions">
                <button class="btn-save" onclick="mobile.saveCategoryName('${id}')">✓ 保存</button>
                <button class="btn-cancel" onclick="mobile.cancelEditCategory('${id}')">✕ 取消</button>
            </div>
        `;
        
        // 聚焦输入框
        const input = document.getElementById(`edit-cat-name-${id}`);
        if (input) {
            input.focus();
            input.select();
            // 监听回车键
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.saveCategoryName(id);
                } else if (e.key === 'Escape') {
                    this.cancelEditCategory(id);
                }
            });
        }
    },

    async saveCategoryName(id) {
        const input = document.getElementById(`edit-cat-name-${id}`);
        if (!input) return;
        
        const newName = input.value.trim();
        if (!newName) {
            this.showToast('分类名称不能为空');
            return;
        }
        
        // id 可能是 string 或 number，统一转为字符串比较
        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) {
            this.showToast('未找到分类');
            return;
        }

        // 更新到 Supabase
        try {
            const supabase = this.initSupabase();
            const { error } = await supabase
                .from('categories')
                .update({ name: newName })
                .eq('id', strId);
            
            if (error) throw error;
            
            // 更新本地状态
            category.name = newName;
            
            // 更新照片关联中的分类名称显示
            this.photos.forEach(photo => {
                if (String(photo.category_id) === strId) {
                    photo.category_name = newName;
                }
            });
            
            this.showToast('分类已重命名');
            this.renderCategories();
            
            // 如果当前正在筛选这个分类，更新篩選显示
            if (String(this.currentCategory) === strId) {
                const filterSelect = document.getElementById('mobileFilterCategory');
                if (filterSelect) {
                    const option = filterSelect.querySelector(`option[value="${strId}"]`);
                    if (option) option.textContent = newName;
                }
            }
        } catch (error) {
            console.error('重命名分类失败:', error);
            this.showToast('重命名失败，请重试');
        }
    },

    cancelEditCategory(id) {
        // 恢复原始显示
        const nameEl = document.querySelector(`#cat-${id} .category-name-text`);
        const category = this.categories.find(c => String(c.id) === String(id));
        if (nameEl) {
            nameEl.textContent = category?.name || '';
        }
        
        // 移除保存/取消按钮
        const actions = document.querySelector(`#cat-${id} .category-edit-actions`);
        if (actions) actions.remove();
    },

    toggleLockCategory(id) {
        // 隐藏操作栏
        document.querySelectorAll('.category-actions').forEach(el => {
            el.style.display = 'none';
        });

        const strId = String(id);
        if (this.lockedCategories[strId]) {
            // 已加锁，解锁需要验证密码
            this.pendingLockId = strId;
            this.pendingLockAction = 'unlock';
            this.showLockPasswordModal('unlock');
        } else {
            // 未加锁，设置为加锁
            this.pendingLockId = strId;
            this.pendingLockAction = 'lock';
            this.showLockPasswordModal('lock');
        }
    },

    showLockPasswordModal(action) {
        const isLock = action === 'lock';
        const isDelete = action === 'delete';
        let title, hint;
        
        if (isDelete) {
            title = '🔒 分类已加锁';
            hint = '请输入密码验证后才能删除';
        } else if (isLock) {
            title = '🔒 设置解锁密码';
            hint = '设置密码后，删除分类需输入此密码';
        } else {
            title = '🔓 输入密码解锁';
            hint = '请输入分类解锁密码';
        }
        
        const modal = document.createElement('div');
        modal.id = 'lockPasswordModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p class="modal-hint" style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${hint}</p>
                <div class="form-item">
                    <input type="password" id="lockPasswordInput" placeholder="输入密码" style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;background:var(--bg);color:var(--text);">
                </div>
                ${isLock ? `
                <div class="form-item">
                    <input type="password" id="lockPasswordConfirm" placeholder="确认密码" style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;background:var(--bg);color:var(--text);">
                </div>
                ` : ''}
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="mobile.closeLockPasswordModal()">取消</button>
                    <button class="btn-primary" onclick="mobile.confirmLockAction()">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        
        // 自动聚焦
        setTimeout(() => {
            const input = document.getElementById('lockPasswordInput');
            if (input) input.focus();
        }, 100);
        
        // 回车确认
        const input = document.getElementById('lockPasswordInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.confirmLockAction();
                } else if (e.key === 'Escape') {
                    this.closeLockPasswordModal();
                }
            });
        }
    },

    closeLockPasswordModal() {
        const modal = document.getElementById('lockPasswordModal');
        if (modal) modal.remove();
        this.pendingLockId = null;
        this.pendingLockAction = null;
    },

    confirmLockAction() {
        const password = document.getElementById('lockPasswordInput').value;
        
        if (!password) {
            this.showToast('请输入密码');
            return;
        }
        
        if (this.pendingLockAction === 'lock') {
            const confirmPassword = document.getElementById('lockPasswordConfirm').value;
            if (password !== confirmPassword) {
                this.showToast('两次密码不一致');
                return;
            }
            if (password.length < 4) {
                this.showToast('密码至少4位');
                return;
            }
            
            // 设置密码
            this.lockedCategories[this.pendingLockId] = password;
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            this.showToast('分类已加锁 🔒');
            
        } else if (this.pendingLockAction === 'unlock') {
            // 验证密码
            if (this.lockedCategories[this.pendingLockId] !== password) {
                this.showToast('密码错误');
                return;
            }
            
            // 解锁
            delete this.lockedCategories[this.pendingLockId];
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            this.showToast('分类已解锁 🔓');
            this.closeLockPasswordModal();
            this.renderCategories();
            return;
            
        } else if (this.pendingLockAction === 'delete') {
            // 验证密码后才能删除
            if (this.lockedCategories[this.pendingDeleteId] !== password) {
                this.showToast('密码错误');
                return;
            }
            
            // 密码正确，继续删除流程
            this.closeLockPasswordModal();
            
            // 获取这个分类及其子分类的照片数量
            const categoryIds = this.getCategoryAndChildrenIds(this.pendingDeleteId);
            const photoCount = this.photos.filter(photo => {
                const photoCats = this.photoCategories[String(photo.id)] || [];
                return categoryIds.some(catId => photoCats.includes(catId));
            }).length;
            
            const category = this.categories.find(c => String(c.id) === String(this.pendingDeleteId));
            this.pendingCategoryName = category?.name || '未命名分类';
            this.pendingPhotoCount = photoCount;
            this.showCategoryDeleteOptions(photoCount);
            return;
        }
        
        this.closeLockPasswordModal();
        this.renderCategories();
    },

    // 更新分类路径显示
    updateCategoryPathDisplay() {
        const pathDisplay = document.getElementById('categoryPathDisplay');
        if (!pathDisplay) return;
        
        const categoryId = this.currentCategory;
        
        if (!categoryId || categoryId === 'all') {
            pathDisplay.textContent = '';
            pathDisplay.style.display = 'none';
            return;
        }
        
        const path = this.getCategoryPath(categoryId);
        if (path.length === 0) {
            pathDisplay.textContent = '';
            pathDisplay.style.display = 'none';
            return;
        }
        
        pathDisplay.textContent = path.join(' › ');
        pathDisplay.style.display = 'block';
    },

    async deleteCategory(id) {
        const strId = String(id);
        const category = this.categories.find(c => String(c.id) === strId);
        if (!category) return;

        // 检查是否加锁
        if (this.lockedCategories[strId]) {
            this.pendingDeleteId = strId;
            this.pendingDeleteType = 'category-locked';
            this.showLockPasswordModal('delete');
            return;
        }

        // 获取这个分类及其子分类的照片数量
        const categoryIds = this.getCategoryAndChildrenIds(strId);
        const photoCount = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        }).length;
        
        this.pendingDeleteId = strId;
        this.pendingCategoryName = category.name;
        this.pendingPhotoCount = photoCount;
        
        // 显示删除选项弹窗
        this.showCategoryDeleteOptions(photoCount);
    },

    showCategoryDeleteOptions(photoCount) {
        const photoMsg = photoCount > 0 ? `该分类下有 ${photoCount} 张照片` : '该分类下暂无照片';
        const safeCategoryName = this.escapeHtml(this.pendingCategoryName || '');
        
        const modal = document.createElement('div');
        modal.id = 'categoryDeleteModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>🗑️ 删除「${safeCategoryName}」</h3>
                <p class="modal-hint" style="color:var(--text-muted);font-size:13px;margin:8px 0 16px;">${photoMsg}</p>
                <div class="delete-options">
                    <button class="delete-option-btn" onclick="mobile.confirmDeleteCategoryOnly()">
                        <span class="option-icon">📁</span>
                        <span class="option-text">只删除分类</span>
                        <span class="option-desc">保留照片，移至未分类</span>
                    </button>
                    ${photoCount > 0 ? `
                    <button class="delete-option-btn" onclick="mobile.confirmDeleteCategoryAndPhotos()">
                        <span class="option-icon">💥</span>
                        <span class="option-text">删除分类和照片</span>
                        <span class="option-desc">分类及关联照片全部删除</span>
                    </button>
                    <button class="delete-option-btn" onclick="mobile.confirmDeletePhotosOnly()">
                        <span class="option-icon">🗃️</span>
                        <span class="option-text">只删除照片</span>
                        <span class="option-desc">保留分类，仅删除照片</span>
                    </button>
                    ` : ''}
                </div>
                <div class="modal-actions" style="margin-top:16px;">
                    <button class="btn-secondary" onclick="mobile.closeCategoryDeleteModal()">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    },

    closeCategoryDeleteModal() {
        const modal = document.getElementById('categoryDeleteModal');
        if (modal) modal.remove();
        this.pendingDeleteId = null;
        this.pendingCategoryName = null;
        this.pendingPhotoCount = 0;
    },

    // 只删除分类，保留照片
    async confirmDeleteCategoryOnly() {
        const categoryId = this.pendingDeleteId;
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        try {
            // 删除分类与照片的关联（照片保留）
            const { error: relDeleteError } = await supabase.from('photo_categories').delete().eq('category_id', categoryId);
            if (relDeleteError) throw relDeleteError;
            
            // 删除分类
            const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
            if (categoryDeleteError) throw categoryDeleteError;
            
            // 更新本地状态
            this.categories = this.categories.filter(c => c.id !== categoryId);
            
            // 更新markedCategories
            this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
            localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
            
            // 更新lockedCategories
            if (this.lockedCategories[categoryId]) {
                delete this.lockedCategories[categoryId];
                localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            }
            
            this.updateCategorySelects();
            this.renderCategories();
            this.showToast('分类已删除，照片保留');
        } catch (err) {
            console.error('删除分类失败:', err);
            this.showToast('删除失败，请重试');
        }
    },

    // 删除分类和照片
    async confirmDeleteCategoryAndPhotos() {
        const categoryId = this.pendingDeleteId;
        const categoryIds = this.getCategoryAndChildrenIds(categoryId);
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        // 找出属于这些分类的所有照片
        const photosToDelete = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;

        // 清理 Storage 文件
        const storagePaths = photosToDelete.map(p => p.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
            try { await supabase.storage.from('photo').remove(storagePaths); } catch (e) { console.warn('Storage 清理失败:', e); }
        }

        // 删除照片
        for (const photo of photosToDelete) {
            try {
                const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                if (photoDeleteError) throw photoDeleteError;
                deletedPhotoCount++;
            } catch (err) {
                console.error('删除照片失败:', photo.id, err);
            }
        }

        // 删除分类
        try {
            const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
            if (categoryDeleteError) throw categoryDeleteError;
        } catch (err) {
            console.error('删除分类失败:', err);
            this.showToast('删除分类失败，请重试');
            return;
        }
        
        // 更新本地状态
        this.photos = this.photos.filter(p => !photosToDelete.includes(p));
        this.categories = this.categories.filter(c => c.id !== categoryId);
        
        // 更新markedCategories
        this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
        localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
        
        // 更新lockedCategories
        if (this.lockedCategories[categoryId]) {
            delete this.lockedCategories[categoryId];
            localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
        }
        
        this.updateCategorySelects();
        this.renderCategories();
        this.renderPhotos();
        this.showToast(`已删除分类及 ${deletedPhotoCount} 张照片`);
    },

    // 只删除照片，保留分类
    async confirmDeletePhotosOnly() {
        const categoryId = this.pendingDeleteId;
        const categoryIds = this.getCategoryAndChildrenIds(categoryId);
        const supabase = this.initSupabase();
        if (!supabase) return;
        
        this.closeCategoryDeleteModal();
        
        // 找出属于这些分类的所有照片
        const photosToDelete = this.photos.filter(photo => {
            const photoCats = this.photoCategories[String(photo.id)] || [];
            return categoryIds.some(catId => photoCats.includes(catId));
        });
        
        let deletedPhotoCount = 0;

        // 清理 Storage 文件
        const storagePaths = photosToDelete.map(p => p.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
            try { await supabase.storage.from('photo').remove(storagePaths); } catch (e) { console.warn('Storage 清理失败:', e); }
        }

        // 删除照片
        for (const photo of photosToDelete) {
            try {
                const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                if (photoDeleteError) throw photoDeleteError;
                deletedPhotoCount++;
            } catch (err) {
                console.error('删除照片失败:', photo.id, err);
            }
        }

        // 更新本地状态
        this.photos = this.photos.filter(p => !photosToDelete.includes(p));
        
        this.renderPhotos();
        this.showToast(`已删除 ${deletedPhotoCount} 张照片，分类保留`);
    },

    closeConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.pendingDeleteId = null;
        this.pendingDeleteType = null;
    },

    async confirmDelete() {
        if (this.pendingDeleteType === 'category') {
            const categoryId = this.pendingDeleteId;
            const supabase = this.initSupabase();
            if (!supabase) return;
            
            // 获取分类及其所有子分类的ID
            const categoryIds = this.getCategoryAndChildrenIds(categoryId);
            
            // 找出属于这些分类的所有照片
            const photosToDelete = this.photos.filter(photo => {
                const photoCats = this.photoCategories[String(photo.id)] || [];
                return categoryIds.some(catId => photoCats.includes(catId));
            });
            
            let deletedPhotoCount = 0;
            
            // 先删除这些照片（会级联删除关联和留言）
            for (const photo of photosToDelete) {
                try {
                    const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photo.id);
                    if (photoDeleteError) throw photoDeleteError;
                    deletedPhotoCount++;
                } catch (err) {
                    console.error('删除照片失败:', photo.id, err);
                }
            }
            
            // 删除分类本身
            try {
                const { error: categoryDeleteError } = await supabase.from('categories').delete().eq('id', categoryId);
                if (categoryDeleteError) throw categoryDeleteError;
            } catch (err) {
                console.error('删除分类失败:', err);
                this.showToast('删除分类失败，请重试');
                return;
            }
            
            // 更新本地状态
            this.photos = this.photos.filter(p => !photosToDelete.includes(p));
            this.categories = this.categories.filter(c => c.id !== categoryId);
            
            // 更新markedCategories
            this.markedCategories = this.markedCategories.filter(id => id !== categoryId);
            localStorage.setItem('markedCategories', JSON.stringify(this.markedCategories));
            
            // 从加锁列表中移除
            if (this.lockedCategories[categoryId]) {
                delete this.lockedCategories[categoryId];
                localStorage.setItem('lockedCategories', JSON.stringify(this.lockedCategories));
            }
            
            this.updateCategorySelects();
            this.renderCategories();
            this.renderPhotos();
            this.showToast(`分类及关联的 ${deletedPhotoCount} 张照片已删除`);
            
        } else if (this.pendingDeleteType === 'photo') {
            const photoId = this.pendingDeleteId;
            const supabase = this.initSupabase();
            if (!supabase) return;
            try {
                // 清理 Storage 文件
                const photo = this.photos.find(p => p.id === photoId);
                if (photo && photo.storage_path) {
                    await supabase.storage.from('photo').remove([photo.storage_path]);
                }

                const { error: relationDeleteError } = await supabase
                    .from('photo_categories')
                    .delete()
                    .eq('photo_id', photoId);
                if (relationDeleteError) throw relationDeleteError;

                const { error: commentDeleteError } = await supabase
                    .from('comments')
                    .delete()
                    .eq('photo_id', photoId);
                if (commentDeleteError) throw commentDeleteError;

                const { error: photoDeleteError } = await supabase
                    .from('photos')
                    .delete()
                    .eq('id', photoId);
                if (photoDeleteError) throw photoDeleteError;

                this.photos = this.photos.filter(p => p.id !== photoId);
                this.renderPhotos();
                this.closeDetail();
                this.showToast('照片已删除');
            } catch (err) {
                console.error('删除照片失败:', err);
                this.showToast('删除失败，请重试');
                return;
            }
        } else if (this.pendingDeleteType === 'batch-photo') {
            // 批量删除
            const supabase = this.initSupabase();
            if (!supabase) return;

            // 先获取所有选中照片的 storage_path
            const photoIds = [...this.selectedPhotos];
            let storagePaths = [];
            try {
                const { data: photoRecords } = await supabase
                    .from('photos')
                    .select('id, storage_path')
                    .in('id', photoIds);
                if (photoRecords) {
                    storagePaths = photoRecords.map(p => p.storage_path).filter(Boolean);
                }
            } catch (e) {
                console.warn('获取 storage_path 失败，跳过文件清理:', e);
            }

            // 清理 Storage 文件
            if (storagePaths.length > 0) {
                try {
                    await supabase.storage.from('photo').remove(storagePaths);
                } catch (e) {
                    console.warn('Storage 文件清理失败:', e);
                }
            }

            let deletedCount = 0;
            for (const photoId of photoIds) {
                try {
                    await supabase.from('photo_categories').delete().eq('photo_id', photoId);
                    await supabase.from('comments').delete().eq('photo_id', photoId);
                    const { error: photoDeleteError } = await supabase.from('photos').delete().eq('id', photoId);
                    if (photoDeleteError) throw photoDeleteError;
                    this.photos = this.photos.filter(p => p.id !== photoId);
                    deletedCount++;
                } catch (err) {
                    console.error('删除失败:', err);
                }
            }
            this.selectedPhotos.clear();
            this.selectMode = false;
            this.updateSelectModeUI();
            this.renderPhotos();
            this.showToast(`已删除 ${deletedCount} 张照片`);
        }
        this.closeConfirmModal();
    },


    // ========================================
    // 留言
    // ========================================
    async loadComments(photoId) {
        const list = document.getElementById('commentsList');
        try {
            const supabase = this.initSupabase();
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('photo_id', photoId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无留言</p>';
                return;
            }
            
            list.innerHTML = data.map(c => `
                <div class="comment-item">
                    <div class="comment-text">${this.escapeHtml(c.content)}</div>
                    <div class="comment-time">${this.formatTime(c.created_at)}</div>
                </div>
            `).join('');
        } catch (err) {
            console.error('加载留言失败:', err);
            list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无留言</p>';
        }
    },

    async addComment(e) {
        e.preventDefault();
        const input = document.getElementById('mobileCommentInput');
        const text = input.value.trim();
        if (!text) return;

        try {
            const supabase = this.initSupabase();
            const { error } = await supabase
                .from('comments')
                .insert([{ photo_id: this.currentPhotoId, content: text }]);
            
            if (error) throw error;
            
            input.value = '';
            this.showToast('留言已发送');
            this.loadComments(this.currentPhotoId);
        } catch (err) {
            console.error('留言失败:', err);
            this.showToast('留言失败，请重试');
        }
    },

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = (now - date) / 1000;
        
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        if (diff < 604800) return Math.floor(diff / 86400) + '天前';
        return date.toLocaleDateString('zh-CN');
    },


    // ========================================
    // 改分类弹窗
    // ========================================
    openCategoryModal() {
        this.renderDetailCategoryTree();
        document.getElementById('categoryModal').style.display = 'flex';
    },

    // 渲染分类树（checkbox选择 + 箭头展开）
    renderDetailCategoryTree() {
        const container = document.getElementById('detailCategoryCascade');
        if (!container) return;
        container.innerHTML = '';
        
        // 获取当前照片的分类
        const currentCats = this.photoCategories[this.currentPhotoId] || [];
        
        // 获取顶级分类
        const rootCats = this.categories.filter(c => !c.parent_id);
        
        if (rootCats.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无分类</p>';
            return;
        }
        
        // 递归渲染
        const renderCat = (cat, level, parentContainer) => {
            const children = this.categories.filter(c => c.parent_id === cat.id);
            const hasChildren = children.length > 0;
            const isSelected = currentCats.includes(cat.id);
            const indent = level * 16;
            
            const item = document.createElement('div');
            item.className = 'cat-tree-item';
            item.style.cssText = `padding-left:${indent}px;`;
            item.id = `cat-tree-${cat.id}`;
            
            const arrowHtml = hasChildren 
                ? `<span class="cat-tree-arrow" onclick="event.stopPropagation();mobile.toggleCatTreeExpand('${cat.id}')">›</span>` 
                : '<span style="width:16px;display:inline-block;"></span>';
            
            item.innerHTML = `
                <label class="cat-tree-label" onclick="mobile.toggleCatTreeSelect('${cat.id}')">
                    <input type="checkbox" class="cat-tree-checkbox" id="cat-check-${cat.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();mobile.toggleCatTreeSelect('${cat.id}')">
                    <span class="cat-tree-name">${cat.name}</span>
                </label>
                ${arrowHtml}
            `;
            
            parentContainer.appendChild(item);
            
            // 如果有子分类，渲染子分类容器
            if (hasChildren) {
                const childContainer = document.createElement('div');
                childContainer.id = `cat-tree-children-${cat.id}`;
                childContainer.className = 'cat-tree-children';
                childContainer.style.display = 'none';
                children.forEach(child => renderCat(child, level + 1, childContainer));
                container.appendChild(childContainer);
            }
        };
        
        rootCats.forEach(cat => renderCat(cat, 0, container));
    },

    // 展开/折叠子分类
    toggleCatTreeExpand(catId) {
        const childContainer = document.getElementById(`cat-tree-children-${catId}`);
        if (!childContainer) return;
        
        const arrow = document.querySelector(`#cat-tree-${catId} .cat-tree-arrow`);
        const isHidden = childContainer.style.display === 'none';
        
        if (isHidden) {
            childContainer.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(90deg)';
        } else {
            childContainer.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    },

    // 选中/取消选中分类
    toggleCatTreeSelect(catId) {
        const checkbox = document.getElementById(`cat-check-${catId}`);
        if (!checkbox) return;
        
        checkbox.checked = !checkbox.checked;
    },

    closeCategoryModal() {
        document.getElementById('categoryModal').style.display = 'none';
    },

    async saveCategoryChange() {
        const container = document.getElementById('detailCategoryCascade');
        if (!container) return;
        
        // 获取所有选中的分类
        const checkboxes = container.querySelectorAll('.cat-tree-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.id.replace('cat-check-', ''));
        
        const photoId = this.currentPhotoId;
        
        try {
            const supabase = this.initSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');
            
            // 删除旧关联
            const { error: relationDeleteError } = await supabase.from('photo_categories').delete().eq('photo_id', photoId);
            if (relationDeleteError) throw relationDeleteError;
            
            // 添加新关联
            if (selectedIds.length > 0) {
                const inserts = selectedIds.map(catId => ({
                    photo_id: photoId,
                    category_id: catId
                }));
                const { error: relationInsertError } = await supabase.from('photo_categories').insert(inserts);
                if (relationInsertError) throw relationInsertError;
            }
            
            // 更新本地状态
            this.photoCategories[photoId] = selectedIds;
            
            // 更新照片的显示
            const photo = this.photos.find(p => p.id === photoId);
            if (photo) {
                if (selectedIds.length > 0) {
                    const cat = this.categories.find(c => c.id === selectedIds[0]);
                    photo.category_id = selectedIds[0];
                    photo.category_name = cat ? cat.name : '分类';
                } else {
                    photo.category_id = null;
                    photo.category_name = '未分类';
                }
            }
            
            this.closeCategoryModal();
            this.showToast('分类已更新');
            
            // 更新详情页的分类显示
            document.getElementById('detailCategory').textContent = selectedIds.length > 0
                ? (this.categories.find(c => c.id === selectedIds[0])?.name || '分类')
                : '未分类';
        } catch (err) {
            console.error('更新分类失败:', err);
            this.showToast('更新失败，请重试');
        }
    },


    // ========================================
    // 编辑弹窗
    // ========================================
    openEditModal() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        document.getElementById('editPhotoName').value = photo.name || '';
        document.getElementById('editPhotoDesc').value = photo.description || '';

        const locNameEl = document.getElementById('editPhotoLocationName');
        const latEl = document.getElementById('editPhotoLatitude');
        const lngEl = document.getElementById('editPhotoLongitude');
        if (locNameEl) locNameEl.value = photo.location_name || '';
        if (latEl) latEl.value = photo.latitude || '';
        if (lngEl) lngEl.value = photo.longitude || '';

        document.getElementById('editModal').style.display = 'flex';
    },

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    },

    async saveEdit() {
        const name = document.getElementById('editPhotoName').value.trim();
        const desc = document.getElementById('editPhotoDesc').value.trim();
        const location_name = (document.getElementById('editPhotoLocationName')?.value || '').trim() || null;
        const latitude = parseFloat(document.getElementById('editPhotoLatitude')?.value) || null;
        const longitude = parseFloat(document.getElementById('editPhotoLongitude')?.value) || null;

        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        try {
            const supabase = this.initSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { error } = await supabase
                .from('photos')
                .update({ name, description: desc, latitude, longitude, location_name })
                .eq('id', this.currentPhotoId);

            if (error) throw error;

            const hadLocation = !!(photo.latitude && photo.longitude);

            photo.name = name;
            photo.description = desc;
            photo.latitude = latitude;
            photo.longitude = longitude;
            photo.location_name = location_name;
            document.getElementById('detailName').textContent = name;
            document.getElementById('detailDesc').textContent = desc;

            this.closeEditModal();
            this.renderPhotos();
            this.showToast('已保存');
            if (!hadLocation && latitude && longitude) this.addXP(20, 'location');
        } catch (err) {
            console.error('保存编辑失败:', err);
            this.showToast('保存失败，请重试');
        }
    },


    // ========================================
    // 下载照片
    // ========================================
    downloadPhoto() {
        const photo = this.photos.find(p => p.id === this.currentPhotoId);
        if (!photo) return;

        const link = document.createElement('a');
        link.href = this.getPhotoUrl(photo.storage_path) || 'https://picsum.photos/800/600';
        link.download = photo.name || 'photo';
        link.click();
    },


    // ========================================
    // 删除照片
    // ========================================
    deletePhoto() {
        this.pendingDeleteId = this.currentPhotoId;
        this.pendingDeleteType = 'photo';
        document.getElementById('confirmTitle').textContent = '删除照片';
        document.getElementById('confirmMessage').textContent = '确定要删除这张照片吗？';
        document.getElementById('confirmModal').style.display = 'flex';
    },


    // ========================================
    // 通用照片选择器
    // ========================================

    async openPhotoPicker(callback) {
        const supabase = this.initSupabase();
        if (!supabase) { this.showToast('数据库未连接'); return; }
        const { data } = await supabase
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        const photoList = data || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'genericPhotoPicker';
        modal.style.display = 'flex';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:90vw;max-height:85vh;overflow-y:auto;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">选择照片</h3>
                    <button class="icon-btn" onclick="document.getElementById('genericPhotoPicker').remove()">×</button>
                </div>
                <input type="text" id="genericPhotoSearch" placeholder="🔍 搜索照片..."
                    style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;font-size:14px;"
                    oninput="mobile.filterGenericPhotos()">
                <div id="genericPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
                    ${photoList.map(p => `
                        <div class="generic-photo-item" data-name="${this.escapeHtml(p.name || '')}"
                            style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;"
                            onclick="mobile.pickGenericPhoto('${p.id}', '${(p.storage_path||'').replace(/'/g, "\\'")}', '${(p.name||'').replace(/'/g, "\\'")}')">
                            <img src="${this.getPhotoUrl(p.storage_path)}" style="width:100%;height:75px;object-fit:cover;" onerror="this.style.display='none'">
                            <div style="padding:3px;font-size:10px;text-align:center;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml((p.name || '').substring(0, 12))}</div>
                        </div>
                    `).join('')}
                </div>
                ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
                <button class="btn-secondary" style="margin-top:12px;width:100%;border-radius:8px;" onclick="document.getElementById('genericPhotoPicker').remove()">取消</button>
            </div>
        `;
        document.body.appendChild(modal);
        this._photoPickerCallback = callback;
    },

    filterGenericPhotos() {
        const query = document.getElementById('genericPhotoSearch').value.toLowerCase();
        document.querySelectorAll('.generic-photo-item').forEach(el => {
            el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
        });
    },

    pickGenericPhoto(id, storagePath, name) {
        if (this._photoPickerCallback) {
            this._photoPickerCallback({ id, storage_path: storagePath, name });
            this._photoPickerCallback = null;
        }
        const picker = document.getElementById('genericPhotoPicker');
        if (picker) picker.remove();
    },

    });
})();
