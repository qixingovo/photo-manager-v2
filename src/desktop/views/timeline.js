// src/desktop/views/timeline.js — 纪念日时间线、经期记录、纪念日CRUD
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

let periodRecords = [];

async function loadPeriodRecords() {
    try {
        const { data } = await supabase.from('period_records').select('*').order('start_date', { ascending: false });
        periodRecords = data || [];
    } catch (e) { periodRecords = []; }
}

function predictNextPeriod() {
    if (periodRecords.length < 2) return null;
    const sorted = [...periodRecords].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const cycles = [];
    for (let i = 0; i < sorted.length - 1 && i < 3; i++) {
        const curr = new Date(sorted[i].start_date);
        const prev = new Date(sorted[i + 1].start_date);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays < 60) cycles.push(diffDays);
    }
    if (cycles.length === 0) return null;
    const avgCycle = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
    const lastStart = new Date(sorted[0].start_date);
    const predicted = new Date(lastStart.getTime() + avgCycle * 24 * 60 * 60 * 1000);
    return { date: predicted.toISOString().split('T')[0], avgCycle };
}

async function loadMilestones() {
    let shouldMigrate = false;
    let selectOk = false;
    try {
        const { data, error } = await supabase
            .from('milestones')
            .select('*')
            .order('date', { ascending: false });

        if (!error && data && data.length > 0) {
            console.log('LOAD DEBUG:', JSON.stringify(data.map(r => ({id:r.id,title:r.title,category_id:r.category_id,category_name:r.category_name}))));
            Main.anniversaryMilestones = data.map(m => ({
                id: String(m.id),
                date: m.date,
                title: m.title,
                description: m.description || '',
                photoId: m.photo_id || null,
                photoPath: m.photo_path || null,
                photoName: m.photo_name || null,
                categoryId: m.category_id || null,
                categoryName: m.category_name || null,
                milestone_type: m.milestone_type || 'anniversary',
                repeat_yearly: m.repeat_yearly || false
            }));
            selectOk = true;
            const saved = localStorage.getItem('anniversary_milestones');
            if (saved) {
                const localMilestones = JSON.parse(saved);
                localMilestones.forEach(lm => {
                    const existing = Main.anniversaryMilestones.find(m => m.id === lm.id);
                    if (existing) {
                        if (lm.categoryId) existing.categoryId = lm.categoryId;
                        if (lm.categoryName) existing.categoryName = lm.categoryName;
                        if (lm.photoId) existing.photoId = lm.photoId;
                        if (lm.photoPath) existing.photoPath = lm.photoPath;
                        if (lm.photoName) existing.photoName = lm.photoName;
                    } else {
                        Main.anniversaryMilestones.push(lm);
                    }
                });
                shouldMigrate = true;
            }
        } else if (!error) {
            selectOk = true;
            const saved = localStorage.getItem('anniversary_milestones');
            if (saved) {
                Main.anniversaryMilestones = JSON.parse(saved);
                shouldMigrate = true;
            } else {
                Main.anniversaryMilestones = CommonUtils.getDefaultMilestones();
            }
        }
    } catch (e) { /* 静默 */ }

    if (Main.anniversaryMilestones.length === 0) {
        const saved = localStorage.getItem('anniversary_milestones');
        Main.anniversaryMilestones = saved ? JSON.parse(saved) : CommonUtils.getDefaultMilestones();
    }

    if (shouldMigrate) {
        await migrateMilestonesToSupabase();
    }
    await loadStartDate();
}

async function loadStartDate() {
    Main.anniversaryStartDate = localStorage.getItem('anniversary_start_date') || '2020-06-15';
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'anniversary_start_date')
            .single();
        if (!error && data) {
            Main.anniversaryStartDate = data.value;
        } else if (!error) {
            await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: Main.anniversaryStartDate });
        }
    } catch (e) { /* 静默 */ }
}

async function migrateMilestonesToSupabase() {
    try {
        const rows = Main.anniversaryMilestones.map(m => ({
            id: CommonUtils.safeBigint(m.id, Date.now() + Math.floor(Math.random() * 1000)),
            date: m.date,
            title: m.title,
            description: m.description || '',
            photo_id: m.photoId || null,
            photo_path: m.photoPath || null,
            photo_name: m.photoName || null,
            category_id: m.categoryId || null,
            category_name: m.categoryName || null,
            milestone_type: m.milestone_type || 'anniversary',
            repeat_yearly: m.repeat_yearly || false
        }));
        const { error } = await supabase.from('milestones').upsert(rows);
        if (error) { console.error('迁移纪念日失败:', error); return; }
        localStorage.removeItem('anniversary_milestones');
    } catch (e) {
        console.error('迁移纪念日异常:', e);
    }
}

async function saveMilestonesToSupabase() {
    try {
        const rows = Main.anniversaryMilestones.map(m => ({
            id: CommonUtils.safeBigint(m.id, Date.now()),
            date: m.date,
            title: m.title,
            description: m.description || '',
            photo_id: m.photoId || null,
            photo_path: m.photoPath || null,
            photo_name: m.photoName || null,
            category_id: m.categoryId || null,
            category_name: m.categoryName || null,
            milestone_type: m.milestone_type || 'anniversary',
            repeat_yearly: m.repeat_yearly || false
        }));
        console.log('SAVE DEBUG:', JSON.stringify(rows.map(r => ({id:r.id,title:r.title,category_id:r.category_id,category_name:r.category_name}))));
        const { error } = await supabase.from('milestones').upsert(rows);
        if (error) { console.error('保存纪念日失败:', error); return; }
        console.log('纪念日保存成功');
        localStorage.removeItem('anniversary_milestones');
    } catch (e) {
        console.error('保存纪念日异常:', e);
    }
}

async function saveStartDateToSupabase() {
    try {
        const { error } = await supabase.from('app_settings').upsert({ key: 'anniversary_start_date', value: Main.anniversaryStartDate });
        if (!error) {
            localStorage.removeItem('anniversary_start_date');
            return;
        }
        console.error('保存开始日期失败:', error);
    } catch (e) {
        console.error('保存开始日期异常:', e);
    }
}

function updateDaysCounter() {
    if (!Main.anniversaryStartDate) return;
    const el = document.getElementById('daysCount');
    if (!el) return;
    const start = new Date(Main.anniversaryStartDate);
    const today = new Date();
    const diffTime = today - start;
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    el.textContent = diffDays;
}

async function initTimeline() {
    Main._timelinePage = 1;
    await loadMilestones();
    await loadPeriodRecords();
    const startInput = document.getElementById('startDateInput');
    if (startInput) startInput.value = Main.anniversaryStartDate;
    updateDaysCounter();
    updateCountdownDisplay();
    renderTimeline();
    renderPeriodSection();
}

function updateCountdownDisplay() {
    const container = document.getElementById('countdownContainer');
    if (!container) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let nextMilestone = null;
    let minDiff = Infinity;
    Main.anniversaryMilestones.forEach(m => {
        let targetDate;
        if (m.repeat_yearly || m.milestone_type === 'birthday') {
            const parts = m.date.split('-');
            targetDate = new Date(today.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[2]));
            if (targetDate <= today) {
                targetDate = new Date(today.getFullYear() + 1, parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
        } else {
            targetDate = new Date(m.date);
        }
        const diff = targetDate - today;
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nextMilestone = { ...m, targetDate };
        }
    });

    if (nextMilestone) {
        const diffDays = Math.ceil(minDiff / (1000 * 60 * 60 * 24));
        container.innerHTML = `<div style="text-align:center;padding:12px;background:linear-gradient(135deg,#a8edea 0%,#fed6e3 100%);border-radius:12px;margin-bottom:12px;">
            <div style="font-size:0.9rem;color:#666;">下一个纪念日</div>
            <div style="font-size:1.5rem;font-weight:bold;color:#e74c3c;">${CommonUtils.escapeHtml(nextMilestone.title)}</div>
            <div style="font-size:2rem;font-weight:bold;color:#e74c3c;">还有 ${diffDays} 天</div>
            <div style="font-size:0.8rem;color:#999;">${nextMilestone.targetDate.toLocaleDateString('zh-CN')}</div>
        </div>`;
    } else {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:12px;">还没有纪念日</p>';
    }
}

function renderPeriodSection() {
    const container = document.getElementById('periodSection');
    if (!container) return;

    const prediction = predictNextPeriod();
    const sorted = [...periodRecords].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    container.innerHTML = `
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:1rem;">📅 经期记录</h3>
                <button class="btn btn-primary btn-sm" onclick="window.openPeriodRecordModal()">+ 记录</button>
            </div>
            ${prediction ? `<div style="text-align:center;padding:10px;background:#fff3e0;border-radius:8px;margin-bottom:12px;font-size:13px;">
                预计下次: <strong>${prediction.date}</strong> (周期约${prediction.avgCycle}天)
            </div>` : (periodRecords.length > 0 ? '<p style="text-align:center;color:#999;font-size:13px;">需要至少2次记录才能预测</p>' : '')}
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${sorted.slice(0, 10).map(r => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8f9fa;border-radius:8px;font-size:13px;">
                        <span>${r.start_date}${r.end_date ? ' ~ ' + r.end_date : ''} (${r.end_date ? Math.ceil((new Date(r.end_date) - new Date(r.start_date)) / (1000*60*60*24)) + 1 : '?'}天)</span>
                        <button class="btn-danger" style="padding:2px 8px;font-size:11px;" onclick="window.deletePeriodRecord(${r.id})">×</button>
                    </div>`).join('')}
            </div>
            ${periodRecords.length === 0 ? '<p style="text-align:center;color:#999;font-size:13px;">还没有记录</p>' : ''}
        </div>`;
}

function openPeriodRecordModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'periodRecordModal';
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('periodRecordModal').remove()">&times;</span>
            <h3>记录经期</h3>
            <div class="form-group">
                <label>开始日期</label>
                <input type="date" id="periodStartDate" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>结束日期（可选）</label>
                <input type="date" id="periodEndDate">
            </div>
            <div class="form-group">
                <label>备注（可选）</label>
                <textarea id="periodNotes" rows="2" placeholder="症状、心情等..."></textarea>
            </div>
            <button class="btn btn-primary" onclick="window.savePeriodRecord()" style="width:100%;">保存</button>
        </div>
    `;
    document.body.appendChild(modal);
}

async function savePeriodRecord() {
    const startDate = document.getElementById('periodStartDate').value;
    const endDate = document.getElementById('periodEndDate').value || null;
    const notes = document.getElementById('periodNotes').value.trim();
    if (!startDate) { alert('请选择开始日期'); return; }

    try {
        await supabase.from('period_records').insert({
            user_name: Main.currentUser?.username || '用户',
            start_date: startDate,
            end_date: endDate,
            notes
        });
        document.getElementById('periodRecordModal').remove();
        loadPeriodRecords().then(() => renderPeriodSection());
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

async function deletePeriodRecord(id) {
    if (!confirm('确定删除这条记录？')) return;
    try {
        await supabase.from('period_records').delete().eq('id', id);
        loadPeriodRecords().then(() => renderPeriodSection());
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

async function updateStartDate() {
    const input = document.getElementById('startDateInput');
    if (!input) return;
    Main.anniversaryStartDate = input.value;
    await saveStartDateToSupabase();
    updateDaysCounter();
}

function renderSingleMilestone(m, i) {
    const milestoneDate = new Date(m.date);
    const today = new Date();
    const diffDays = Math.floor((today - milestoneDate) / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const remainDays = diffDays % 365;

    const side = i % 2 === 0 ? 'left' : 'right';

    let catHtml = '';
    if (m.categoryId) {
        catHtml = `<div style="margin-top:8px;">
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;"
                onclick="window.goToCategory('${m.categoryId}')">📁 ${CommonUtils.escapeHtml(m.categoryName || '查看分类')}</button>
        </div>`;
    }

    let photoHtml = '';
    if (m.photoId) {
        const photoUrl = m.photoPath ? window.getPhotoUrl(m.photoPath) : '';
        if (photoUrl) {
            photoHtml = `<img src="${photoUrl}"
                style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-top:8px;cursor:pointer;"
                onclick="window.openPhotoModal('${m.photoId}')"
                onerror="this.style.display='none'">`;
        }
    }

    let timeAgo = '';
    if (years > 0) timeAgo += years + '年';
    if (remainDays > 0 || years === 0) timeAgo += remainDays + '天';
    timeAgo += '前';

    return `
        <div class="timeline-item timeline-${side}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-date">${m.date}</div>
                <h3>${CommonUtils.escapeHtml(m.title)}</h3>
                ${m.description ? '<p>' + CommonUtils.escapeHtml(m.description) + '</p>' : ''}
                <small style="color:#999;">${timeAgo}</small>
                ${catHtml}
                ${photoHtml}
                <div class="milestone-actions" style="margin-top:8px;display:flex;gap:8px;">
                    <button class="btn btn-secondary" style="font-size:11px;padding:4px 8px;"
                        onclick="window.openEditMilestoneModal('${m.id}')">✏️</button>
                    <button class="btn-danger" style="font-size:11px;padding:4px 8px;"
                        onclick="window.deleteMilestone('${m.id}')">🗑️</button>
                </div>
            </div>
        </div>
    `;
}

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    const sorted = [...Main.anniversaryMilestones].sort((a, b) => new Date(b.date) - new Date(a.date));
    const visible = sorted.slice(0, Main._timelinePage * Main.TIMELINE_PAGE_SIZE);
    const hasMore = sorted.length > visible.length;

    container.innerHTML = visible.map((m, i) => renderSingleMilestone(m, i)).join('');

    if (hasMore) {
        container.innerHTML += `
            <div style="text-align:center;padding:20px 0;">
                <button class="btn btn-secondary" onclick="window.loadMoreTimeline()" style="font-size:14px;padding:8px 32px;">
                    加载更多 (${visible.length}/${sorted.length})
                </button>
            </div>`;
    }
}

function loadMoreTimeline() {
    Main._timelinePage++;
    renderTimeline();
}

function onFilterCatLevelChange(level) {
    const container = document.getElementById('filterCategoryCascade');
    if (!container) return;

    const select = document.getElementById(`filterCatLevel${level}`);
    if (!select) return;

    const selectedValue = select.value;

    const selects = container.querySelectorAll('select');
    selects.forEach((s, i) => {
        if (i > level) s.remove();
    });

    if (selectedValue === 'all') {
        Main.currentCategory = 'all';
        Main.currentPage = 1;
        window.loadPhotos();
        return;
    }

    if (selectedValue) {
        Main.currentCategory = selectedValue;
        Main.currentPage = 1;
        const children = Main.categories.filter(c => String(c.parent_id) === String(selectedValue));
        if (children.length > 0) {
            const nextLevel = level + 1;
            const nextSelect = document.createElement('select');
            nextSelect.id = `filterCatLevel${nextLevel}`;
            nextSelect.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
            nextSelect.onchange = () => onFilterCatLevelChange(nextLevel);
            nextSelect.innerHTML = `<option value="">选择子分类</option>${children.map(cat => {
                const count = window.getCategoryPhotoCount(cat.id);
                return `<option value="${cat.id}">${cat.name} (${count})</option>`;
            }).join('')}`;
            container.appendChild(nextSelect);
        }
        window.loadPhotos();
    }
}

function renderFilterCategoryCascadePath(catId) {
    const container = document.getElementById('filterCategoryCascade');
    if (!container) return;
    const path = [];
    let cur = Main.categories.find(c => c.id === catId);
    while (cur) {
        path.unshift(cur);
        cur = cur.parent_id ? Main.categories.find(c => c.id === cur.parent_id) : null;
    }
    container.innerHTML = '';
    let parentId = null;
    path.forEach((cat, index) => {
        const level = index;
        const opts = (index === 0
            ? Main.categories.filter(c => !c.parent_id)
            : Main.categories.filter(c => c.parent_id === parentId));
        const select = document.createElement('select');
        select.id = `filterCatLevel${level}`;
        select.style.cssText = 'padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
        select.onchange = () => onFilterCatLevelChange(level);
        select.innerHTML = `<option value="">选择分类</option>${opts.map(oc => {
            const sel = oc.id === cat.id ? 'selected' : '';
            return `<option value="${oc.id}" ${sel}>${oc.name} (${window.getCategoryPhotoCount(oc.id)})</option>`;
        }).join('')}`;
        container.appendChild(select);
        parentId = cat.id;
    });
}

function goToCategory(catId) {
    Main.currentCategory = String(catId);
    Main.currentPage = 1;
    Main.showFavoritesOnly = false;
    window.toggleSection('photos');
    window.loadPhotos();
    renderFilterCategoryCascadePath(catId);
    document.getElementById('photoGrid').scrollIntoView({ behavior: 'smooth' });
}

function buildCategoryOptions(selectedId, indent) {
    indent = indent || 0;
    const list = Main.categories.filter(c => (indent === 0 ? !c.parent_id : c.parent_id === selectedId));
    return '';
}

function buildAllCategoryOptions(selectedCatId) {
    function walk(cats, depth) {
        let html = '';
        cats.forEach(cat => {
            const prefix = '　'.repeat(depth);
            const sel = String(cat.id) === String(selectedCatId || '') ? 'selected' : '';
            html += `<option value="${cat.id}" ${sel}>${prefix}${CommonUtils.escapeHtml(cat.name)}</option>`;
            const children = Main.categories.filter(c => c.parent_id === cat.id);
            if (children.length > 0) html += walk(children, depth + 1);
        });
        return html;
    }
    const roots = Main.categories.filter(c => !c.parent_id);
    return walk(roots, 0);
}

function openAddMilestoneModal() {
    const catOpts = buildAllCategoryOptions('');
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestoneModal';
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('milestoneModal').remove()">&times;</span>
            <h3>添加纪念日</h3>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="milestoneDate">
            </div>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="milestoneTitle">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="milestoneDesc" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>类型</label>
                <select id="milestoneType" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="anniversary">纪念日</option>
                    <option value="birthday">生日</option>
                    <option value="festival">节日</option>
                    <option value="period">经期</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="milestoneRepeatYearly">
                    <span>每年重复</span>
                </label>
            </div>
            <div class="form-group">
                <label>关联类别（可选）</label>
                <select id="milestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="">不关联类别</option>
                    ${catOpts}
                </select>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="milestonePhotoPreview" style="margin-bottom:8px;"></div>
                <button type="button" class="btn btn-secondary" onclick="window.openMilestonePhotoPicker()">📷 选择照片</button>
                <button type="button" class="btn btn-secondary" onclick="window.clearMilestonePhoto()" style="display:none;" id="clearMilestonePhotoBtn">✕ 取消关联</button>
            </div>
            <input type="hidden" id="milestonePhotoId" value="">
            <button class="btn btn-primary" onclick="window.saveMilestone()">保存</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function pickMilestonePhoto(photo) {
    window._milestonePhotoData = photo;
    document.getElementById('milestonePhotoId').value = photo.id;
    const preview = document.getElementById('milestonePhotoPreview');
    preview.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;">
        <img src="${window.getPhotoUrl(photo.storage_path)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;">
        <div>
            <div style="font-size:13px;font-weight:500;">${CommonUtils.escapeHtml(photo.name || '未命名')}</div>
            <div style="font-size:11px;color:#999;">ID: ${photo.id}</div>
        </div>
    </div>`;
    document.getElementById('clearMilestonePhotoBtn').style.display = 'inline-block';
    const picker = document.getElementById('milestonePhotoPicker');
    if (picker) picker.remove();
}

function clearMilestonePhoto() {
    window._milestonePhotoData = null;
    document.getElementById('milestonePhotoId').value = '';
    document.getElementById('milestonePhotoPreview').innerHTML = '';
    document.getElementById('clearMilestonePhotoBtn').style.display = 'none';
}

async function openMilestonePhotoPicker() {
    const { data } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
    const photoList = data || [];

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestonePhotoPicker';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto;padding:20px;">
            <span class="modal-close" onclick="document.getElementById('milestonePhotoPicker').remove()">&times;</span>
            <h3>选择关联照片</h3>
            <input type="text" id="milestonePhotoSearch" placeholder="🔍 搜索照片..."
                style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;"
                oninput="window.filterMilestonePhotos()">
            <div id="milestonePhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
                ${photoList.map(p => `
                    <div class="milestone-photo-item" data-name="${CommonUtils.escapeHtml(p.name || '')}" style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border .2s;"
                        onclick="window.pickMilestonePhoto(${JSON.stringify({id:p.id,storage_path:p.storage_path,name:p.name}).replace(/"/g,'&quot;')})">
                        <img src="${window.getPhotoUrl(p.storage_path)}" style="width:100%;height:90px;object-fit:cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect fill=%22%23eee%22 width=%22120%22 height=%2290%22/><text x=%2260%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2212%22>无预览</text></svg>'">
                        <div style="padding:4px;font-size:11px;text-align:center;color:#666;">${CommonUtils.escapeHtml((p.name || '').substring(0,15))}</div>
                    </div>
                `).join('')}
            </div>
            ${photoList.length === 0 ? '<p style="text-align:center;color:#999;">暂无照片</p>' : ''}
        </div>
    `;
    document.body.appendChild(modal);
}

function filterMilestonePhotos() {
    const query = document.getElementById('milestonePhotoSearch').value.toLowerCase();
    document.querySelectorAll('.milestone-photo-item').forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(query) ? '' : 'none';
    });
}

function openEditMilestoneModal(id) {
    const m = Main.anniversaryMilestones.find(ms => ms.id === id);
    if (!m) return;

    window._milestonePhotoData = m.photoId ? { id: m.photoId, storage_path: m.photoPath || '', name: m.photoName || '' } : null;

    const previewHtml = window._milestonePhotoData ? `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;">
            <img src="${window.getPhotoUrl(window._milestonePhotoData.storage_path)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">
            <div>
                <div style="font-size:13px;font-weight:500;">${CommonUtils.escapeHtml(window._milestonePhotoData.name || '未命名')}</div>
                <div style="font-size:11px;color:#999;">ID: ${window._milestonePhotoData.id}</div>
            </div>
        </div>` : '';

    const catOpts = buildAllCategoryOptions(m.categoryId || '');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'milestoneModal';
    modal.innerHTML = `
        <div class="modal-content modal-small" style="padding:24px;">
            <span class="modal-close" onclick="document.getElementById('milestoneModal').remove()">&times;</span>
            <h3>编辑纪念日</h3>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="milestoneDate" value="${m.date}">
            </div>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="milestoneTitle" value="${CommonUtils.escapeHtml(m.title)}">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="milestoneDesc" rows="2">${CommonUtils.escapeHtml(m.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>类型</label>
                <select id="milestoneType" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="anniversary" ${(m.milestone_type || 'anniversary') === 'anniversary' ? 'selected' : ''}>纪念日</option>
                    <option value="birthday" ${m.milestone_type === 'birthday' ? 'selected' : ''}>生日</option>
                    <option value="festival" ${m.milestone_type === 'festival' ? 'selected' : ''}>节日</option>
                    <option value="period" ${m.milestone_type === 'period' ? 'selected' : ''}>经期</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="milestoneRepeatYearly" ${m.repeat_yearly ? 'checked' : ''}>
                    <span>每年重复</span>
                </label>
            </div>
            <div class="form-group">
                <label>关联类别（可选）</label>
                <select id="milestoneCategoryId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                    <option value="">不关联类别</option>
                    ${catOpts}
                </select>
            </div>
            <div class="form-group">
                <label>关联照片（可选）</label>
                <div id="milestonePhotoPreview" style="margin-bottom:8px;">${previewHtml}</div>
                <button type="button" class="btn btn-secondary" onclick="window.openMilestonePhotoPicker()">📷 选择照片</button>
                <button type="button" class="btn btn-secondary" onclick="window.clearMilestonePhoto()" id="clearMilestonePhotoBtn"
                    style="${window._milestonePhotoData ? '' : 'display:none;'}">✕ 取消关联</button>
            </div>
            <input type="hidden" id="milestonePhotoId" value="${m.photoId || ''}">
            <button class="btn btn-primary" onclick="window.updateMilestone('${id}')">保存</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function saveMilestone() {
    const date = document.getElementById('milestoneDate').value;
    const title = document.getElementById('milestoneTitle').value.trim();
    const desc = document.getElementById('milestoneDesc').value.trim();
    const photoId = document.getElementById('milestonePhotoId').value.trim() || null;
    const catId = document.getElementById('milestoneCategoryId').value || null;
    const catName = catId ? (Main.categories.find(c => String(c.id) === String(catId)) || {}).name || '' : '';
    const type = document.getElementById('milestoneType').value || 'anniversary';
    const repeatYearly = document.getElementById('milestoneRepeatYearly').checked;

    if (!date || !title) {
        alert('请填写日期和标题');
        return;
    }

    const pd = window._milestonePhotoData;
    const newMilestone = {
        id: Date.now().toString(),
        date, title,
        description: desc,
        photoId: photoId || null,
        photoPath: pd ? pd.storage_path : null,
        photoName: pd ? pd.name : null,
        categoryId: catId || null,
        categoryName: catName || null,
        milestone_type: type,
        repeat_yearly: repeatYearly
    };

    Main.anniversaryMilestones.push(newMilestone);
    window._milestonePhotoData = null;
    saveMilestonesToSupabase();
    renderTimeline();
    updateCountdownDisplay();
    document.getElementById('milestoneModal').remove();
}

function updateMilestone(id) {
    const m = Main.anniversaryMilestones.find(ms => ms.id === id);
    if (!m) return;

    m.date = document.getElementById('milestoneDate').value;
    m.title = document.getElementById('milestoneTitle').value.trim();
    m.description = document.getElementById('milestoneDesc').value.trim();
    m.photoId = document.getElementById('milestonePhotoId').value.trim() || null;
    const pd = window._milestonePhotoData;
    m.photoPath = pd ? pd.storage_path : null;
    m.photoName = pd ? pd.name : null;
    const catId = document.getElementById('milestoneCategoryId').value || null;
    m.categoryId = catId || null;
    m.categoryName = catId ? (Main.categories.find(c => String(c.id) === String(catId)) || {}).name || '' : null;
    console.log('UPDATE DEBUG: catId=', catId, 'categoryName=', m.categoryName, 'categoryId=', m.categoryId);
    const typeEl = document.getElementById('milestoneType');
    if (typeEl) m.milestone_type = typeEl.value || 'anniversary';
    const repeatEl = document.getElementById('milestoneRepeatYearly');
    if (repeatEl) m.repeat_yearly = repeatEl.checked;

    window._milestonePhotoData = null;
    saveMilestonesToSupabase();
    renderTimeline();
    updateCountdownDisplay();
    document.getElementById('milestoneModal').remove();
}

function deleteMilestone(id) {
    if (!confirm('确定删除这个纪念日？')) return;
    Main.anniversaryMilestones = Main.anniversaryMilestones.filter(m => m.id !== id);
    saveMilestonesToSupabase();
    renderTimeline();
}

window._milestonePhotoData = null;
window.loadMilestones = loadMilestones;
window.loadStartDate = loadStartDate;
window.migrateMilestonesToSupabase = migrateMilestonesToSupabase;
window.saveMilestonesToSupabase = saveMilestonesToSupabase;
window.saveStartDateToSupabase = saveStartDateToSupabase;
window.updateDaysCounter = updateDaysCounter;
window.initTimeline = initTimeline;
window.updateCountdownDisplay = updateCountdownDisplay;
window.renderPeriodSection = renderPeriodSection;
window.openPeriodRecordModal = openPeriodRecordModal;
window.savePeriodRecord = savePeriodRecord;
window.deletePeriodRecord = deletePeriodRecord;
window.updateStartDate = updateStartDate;
window.renderSingleMilestone = renderSingleMilestone;
window.renderTimeline = renderTimeline;
window.loadMoreTimeline = loadMoreTimeline;
window.onFilterCatLevelChange = onFilterCatLevelChange;
window.renderFilterCategoryCascadePath = renderFilterCategoryCascadePath;
window.goToCategory = goToCategory;
window.buildCategoryOptions = buildCategoryOptions;
window.buildAllCategoryOptions = buildAllCategoryOptions;
window.openAddMilestoneModal = openAddMilestoneModal;
window.pickMilestonePhoto = pickMilestonePhoto;
window.clearMilestonePhoto = clearMilestonePhoto;
window.openMilestonePhotoPicker = openMilestonePhotoPicker;
window.filterMilestonePhotos = filterMilestonePhotos;
window.openEditMilestoneModal = openEditMilestoneModal;
window.saveMilestone = saveMilestone;
window.updateMilestone = updateMilestone;
window.deleteMilestone = deleteMilestone;

export {
    loadPeriodRecords,
    predictNextPeriod,
    loadMilestones,
    loadStartDate,
    migrateMilestonesToSupabase,
    saveMilestonesToSupabase,
    saveStartDateToSupabase,
    updateDaysCounter,
    initTimeline,
    updateCountdownDisplay,
    renderPeriodSection,
    openPeriodRecordModal,
    savePeriodRecord,
    deletePeriodRecord,
    updateStartDate,
    renderSingleMilestone,
    renderTimeline,
    loadMoreTimeline,
    onFilterCatLevelChange,
    renderFilterCategoryCascadePath,
    goToCategory,
    buildCategoryOptions,
    buildAllCategoryOptions,
    openAddMilestoneModal,
    pickMilestonePhoto,
    clearMilestonePhoto,
    openMilestonePhotoPicker,
    filterMilestonePhotos,
    openEditMilestoneModal,
    saveMilestone,
    updateMilestone,
    deleteMilestone
};
