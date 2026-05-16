// src/desktop/views/collage.js — 照片拼贴墙：分类选择、爱心拼贴生成与下载
import * as Main from '../main.js';
import { supabase } from '../../core/supabase.js';

// ========================================
// 照片拼贴墙
// ========================================
window.renderCollageCategorySelect = function() {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return;
    container.innerHTML = '';

    const topLevel = Main.categories.filter(c => !c.parent_id);
    if (topLevel.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">暂无分类</p>';
        return;
    }

    const select = document.createElement('select');
    select.id = 'collageCatLevel0';
    select.className = 'category-select';
    select.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;';
    select.onchange = () => window.onCollageCatLevelChange(0);
    select.innerHTML = `<option value="">全部照片</option>${topLevel.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
    container.appendChild(select);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:#888;margin:4px 0 0 0;';
    hint.textContent = '提示：选择父分类并留空子分类下拉，将自动包含所有子分类的照片';
    container.appendChild(hint);
};

window.onCollageCatLevelChange = function(level) {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return;
    const select = document.getElementById(`collageCatLevel${level}`);
    if (!select) return;

    const selectedValue = select.value;

    // 删除高于当前级别的选择器
    const selects = container.querySelectorAll('select');
    selects.forEach((s, i) => {
        if (i > level) s.remove();
    });

    // 如果选中了某个分类，显示其子分类
    if (selectedValue) {
        const children = Main.categories.filter(c => String(c.parent_id) === String(selectedValue));
        if (children.length > 0) {
            const nextLevel = level + 1;
            const nextSelect = document.createElement('select');
            nextSelect.id = `collageCatLevel${nextLevel}`;
            nextSelect.className = 'category-select';
            nextSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;';
            nextSelect.onchange = () => window.onCollageCatLevelChange(nextLevel);
            nextSelect.innerHTML = `<option value="">包含所有子分类</option>${children.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}`;
            container.appendChild(nextSelect);
        }
    }
};

window.getCollageSelectedCategoryId = function() {
    const container = document.getElementById('collageCategoryCascade');
    if (!container) return null;
    const selects = container.querySelectorAll('select');
    for (let i = selects.length - 1; i >= 0; i--) {
        if (selects[i].value) return selects[i].value;
    }
    return null;
};

// 拼贴墙专用：从 Supabase 拉取匹配的照片（不依赖分页的 photos 数组）
async function fetchPhotosForCollage(matchingPhotoIds) {
    const idList = [...matchingPhotoIds].slice(0, 200);
    if (idList.length === 0) return [];
    const { data } = await supabase
        .from('photos')
        .select('*')
        .in('id', idList)
        .order('created_at', { ascending: false })
        .limit(200);
    return data || [];
}

window.generateCollage = async function() {
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 确保照片-分类映射已加载
    if (Object.keys(Main.photoCategories).length === 0) {
        await window.loadAllPhotoCategories();
    }

    const catId = window.getCollageSelectedCategoryId();
    let collagePhotos;
    if (catId) {
        const categoryIds = CommonUtils.getCategoryAndChildrenIds(catId, Main.categories);
        const matchingPhotoIds = new Set();
        const pcEntries = Object.entries(Main.photoCategories);
        pcEntries.forEach(([photoId, catIds]) => {
            if (catIds.some(cid => categoryIds.includes(cid))) {
                matchingPhotoIds.add(photoId);
            }
        });
        if (matchingPhotoIds.size === 0) {
            const selCat = Main.categories.find(c => String(c.id) === String(catId));
            alert('所选分类"' + (selCat ? selCat.name : catId) + '"下没有照片');
            return;
        }
        collagePhotos = await fetchPhotosForCollage(matchingPhotoIds);
    } else {
        // 全部照片：直接从数据库拉取
        const { data: allPhotos } = await supabase
            .from('photos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        collagePhotos = allPhotos || [];
    }

    if (collagePhotos.length === 0) {
        alert('所选分类下没有照片');
        return;
    }

    const size = 800;
    canvas.width = size;
    canvas.height = size;

    // 背景
    ctx.fillStyle = '#fff0f5';
    ctx.fillRect(0, 0, size, size);

    // 预加载图片（最多 80 张用于拼贴）
    const imageCache = new Map();
    const photosToUse = collagePhotos.slice(0, 80);
    await Promise.all(photosToUse.map(async (photo) => {
        const url = window.getPhotoUrl(photo.storage_path);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            imageCache.set(photo.id, img);
        } catch (e) { /* 忽略加载失败 */ }
    }));

    const loadedPhotos = photosToUse.filter(p => imageCache.has(p.id));
    if (loadedPhotos.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('无法加载照片', size / 2, size / 2);
        return;
    }

    // 参数化爱心路径: x = 16 sin³(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    // 范围: x∈[-16,16], y∈[-17,15], 宽32 高约22, 自然中心偏下
    const heartScale = size / 34;
    const hx = size / 2;
    const hy = size * 0.42;

    function drawHeart() {
        ctx.beginPath();
        const pts = 200;
        for (let i = 0; i <= pts; i++) {
            const t = (i / pts) * Math.PI * 2;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            const px = hx + x * heartScale;
            const py = hy - y * heartScale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    // 裁剪到爱心区域，填充照片
    ctx.save();
    drawHeart();
    ctx.clip();

    const cellSize = size / 22;
    const cols = Math.ceil(size / cellSize);
    const rows = Math.ceil(size / cellSize);
    const cells = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            cells.push({ x: col * cellSize, y: row * cellSize, s: cellSize + 1 });
        }
    }
    // 随机打乱
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let photoIndex = 0;
    for (const cell of cells) {
        const photo = loadedPhotos[photoIndex % loadedPhotos.length];
        const img = imageCache.get(photo.id);
        ctx.drawImage(img, cell.x, cell.y, cell.s, cell.s);
        photoIndex++;
    }

    ctx.restore();

    // 描边爱心轮廓
    drawHeart();
    ctx.strokeStyle = '#ff6b81';
    ctx.lineWidth = 3;
    ctx.stroke();
};

window.downloadCollage = function() {
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = '爱心拼贴_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
};
