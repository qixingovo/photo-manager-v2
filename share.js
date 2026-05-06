// ========================================
//   公开分享页面 - 无需登录
//   通过 share.html?token=xxx 访问
// ========================================

const APP_CONFIG = window.__APP_CONFIG__ || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || '';
const STORAGE_URL = APP_CONFIG.SUPABASE_STORAGE_URL || (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/photo/` : '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    showError('⚠️', '配置缺失', '请联系管理员检查服务器配置');
    throw new Error('缺少 Supabase 配置');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getPhotoUrl(storagePath) {
    if (!storagePath) return '';
    return STORAGE_URL + storagePath;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function showError(icon, title, message) {
    document.getElementById('shareContent').style.display = 'none';
    document.getElementById('shareError').style.display = 'block';
    document.getElementById('shareErrorIcon').textContent = icon;
    document.getElementById('shareErrorTitle').textContent = title;
    document.getElementById('shareErrorMessage').textContent = message;
}

function showShareContent(albumName, photos) {
    document.getElementById('shareAlbumName').textContent = albumName;
    const container = document.getElementById('shareContent');

    if (photos.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>📭 这个相册中还没有照片</p></div>';
        return;
    }

    container.innerHTML = `
        <div class="photo-grid">
            ${photos.map(p => {
                const imgSrc = getPhotoUrl(p.storage_path);
                const catNames = (p.category_names || []).join(', ');
                return `
                <div class="photo-card" onclick="window.open('${imgSrc}', '_blank')">
                    <img src="${imgSrc}" alt="${escapeHtml(p.name || '')}" loading="lazy">
                    <div class="photo-info">
                        <h3>${escapeHtml(p.name || '未命名')}</h3>
                        <p>${escapeHtml(p.description || '')}</p>
                        <div class="photo-meta">
                            ${p.location_name ? `<span class="photo-category">📍 ${escapeHtml(p.location_name)}</span>` : ''}
                            ${catNames ? `<span class="photo-category">${escapeHtml(catNames)}</span>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
        showError('🔗', '无效链接', '缺少分享令牌，请检查链接是否完整');
        return;
    }

    try {
        // 1. 查找分享链接
        const { data: shareData, error: shareError } = await supabase
            .from('share_links')
            .select('*')
            .eq('token', token)
            .maybeSingle();

        if (shareError) throw shareError;
        if (!shareData) {
            showError('🔗', '链接无效', '此分享链接不存在或已被删除');
            return;
        }

        // 2. 检查过期
        if (shareData.expires_at) {
            const expiresAt = new Date(shareData.expires_at);
            if (expiresAt < new Date()) {
                showError('⏰', '链接已过期', `此分享链接已于 ${expiresAt.toLocaleDateString('zh-CN')} 过期`);
                return;
            }
        }

        // 3. 查找相册
        const { data: albumData, error: albumError } = await supabase
            .from('albums')
            .select('*')
            .eq('id', shareData.album_id)
            .single();

        if (albumError) throw albumError;
        if (!albumData) {
            showError('📸', '相册不存在', '此相册可能已被删除');
            return;
        }

        // 4. 获取相册中的照片 ID 列表
        const { data: apData, error: apError } = await supabase
            .from('album_photos')
            .select('photo_id')
            .eq('album_id', albumData.id);

        if (apError) throw apError;
        const photoIds = (apData || []).map(r => r.photo_id);

        if (photoIds.length === 0) {
            showShareContent(albumData.name, []);
            return;
        }

        // 5. 获取照片详情
        const { data: photosData, error: photosError } = await supabase
            .from('photos')
            .select('*')
            .in('id', photoIds)
            .order('created_at', { ascending: false });

        if (photosError) throw photosError;

        const photos = (photosData || []).map(p => ({
            ...p,
            category_names: [] // 共享页面不展示分类详情（无需额外查询）
        }));

        // 可选：尝试获取分类名称
        try {
            const { data: pcData } = await supabase
                .from('photo_categories')
                .select('photo_id, category_id')
                .in('photo_id', photoIds);
            if (pcData && pcData.length > 0) {
                const { data: catData } = await supabase
                    .from('categories')
                    .select('id, name')
                    .in('id', [...new Set(pcData.map(r => r.category_id))]);
                const catMap = {};
                for (const c of (catData || [])) catMap[c.id] = c.name;
                const photoCatMap = {};
                for (const pc of pcData) {
                    if (!photoCatMap[pc.photo_id]) photoCatMap[pc.photo_id] = [];
                    if (catMap[pc.category_id]) photoCatMap[pc.photo_id].push(catMap[pc.category_id]);
                }
                for (const p of photos) {
                    p.category_names = photoCatMap[p.id] || [];
                }
            }
        } catch (e) {
            // 分类加载失败不影响主流程
        }

        showShareContent(albumData.name, photos);

    } catch (e) {
        console.error('加载分享内容失败:', e);
        showError('⚠️', '加载失败', '请稍后重试或联系分享者');
    }
}

document.addEventListener('DOMContentLoaded', init);
