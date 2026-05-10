// ========================================
//   公开分享页面 - 无需登录
//   通过 share.html?token=xxx 访问
//   使用 SECURITY DEFINER RPC 函数绕过 RLS
// ========================================

const APP_CONFIG = window.__APP_CONFIG__ || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || '';
const STORAGE_URL = APP_CONFIG.SUPABASE_STORAGE_URL || (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/photo/` : '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    showError('⚠️', '配置缺失', '请联系管理员检查服务器配置');
    throw new Error('缺少 Supabase 配置');
}

var shareClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getPhotoUrl(storagePath) {
    if (!storagePath) return '';
    return STORAGE_URL + storagePath;
}

function escapeHtml(str) {
    var div = document.createElement('div');
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

function showShareContent(album, photos) {
    document.getElementById('shareAlbumName').textContent = album.name || '相册';
    var container = document.getElementById('shareContent');

    if (!photos || photos.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>📭 这个相册中还没有照片</p></div>';
        return;
    }

    container.innerHTML = '<div class="photo-grid">' +
        photos.map(function(p) {
            var imgSrc = getPhotoUrl(p.storage_path);
            return '<div class="photo-card" onclick="window.open(\'' + escapeHtml(imgSrc) + '\', \'_blank\')">' +
                '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(p.name || '') + '" loading="lazy">' +
                '<div class="photo-info">' +
                '<h3>' + escapeHtml(p.name || '未命名') + '</h3>' +
                '<p>' + escapeHtml(p.description || '') + '</p>' +
                '<div class="photo-meta">' +
                (p.location_name ? '<span class="photo-category">📍 ' + escapeHtml(p.location_name) + '</span>' : '') +
                '</div></div></div>';
        }).join('') + '</div>';
}

async function init() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');

    if (!token) {
        showError('🔗', '无效链接', '缺少分享令牌，请检查链接是否完整');
        return;
    }

    try {
        // 通过 SECURITY DEFINER RPC 获取分享数据（绕过 RLS）
        var { data, error } = await shareClient.rpc('get_shared_album', { share_code: token });

        if (error) {
            console.error('加载分享内容失败:', error);
            showError('⚠️', '加载失败', '请稍后重试或联系分享者');
            return;
        }

        if (data.error) {
            var errMsg = data.error;
            if (errMsg === '链接无效') {
                showError('🔗', '链接无效', '此分享链接不存在或已被删除');
            } else if (errMsg === '链接已过期') {
                showError('⏰', '链接已过期', '此分享链接已过期');
            } else if (errMsg === '相册不存在') {
                showError('📸', '相册不存在', '此相册可能已被删除');
            } else {
                showError('⚠️', '出错了', errMsg);
            }
            return;
        }

        showShareContent(data.album, data.photos);

    } catch (e) {
        console.error('加载分享内容失败:', e);
        showError('⚠️', '加载失败', '请稍后重试或联系分享者');
    }
}

document.addEventListener('DOMContentLoaded', init);
