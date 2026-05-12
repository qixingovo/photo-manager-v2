// common.js — 照片管理系统共享工具函数
// 挂载到 window.CommonUtils，兼容桌面版/手机版/分享页
// v=1
(function () {
  const U = {};

  U.escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  U.sha256 = async function (message) {
    var encoder = new TextEncoder();
    var data = encoder.encode(message);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  U.safeBigint = function (val, fallback) {
    if (val === null || val === undefined) return fallback;
    var n = parseInt(val, 10);
    return isFinite(n) ? n : fallback;
  };

  U.highlightKeywords = function (text, searchValue) {
    if (!searchValue || !text) return text;
    var keywords = searchValue.trim().split(/\s+/).filter(function (k) { return k.length > 0; });
    if (keywords.length === 0) return text;
    var escaped = keywords.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    var regex = new RegExp('(' + escaped.join('|') + ')', 'gi');
    return String(text).replace(regex, '<mark>$1</mark>');
  };

  // formatRelativeTime: <30天显示天数，>=30天显示日期字符串（用于时光胶囊等场景）
  U.formatRelativeTime = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  };

  // getRelativeTime: 始终显示相对时间，含周/月/年（用于评论、动态等场景）
  U.getRelativeTime = function (dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + '分钟前';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + '天前';
    var weeks = Math.floor(days / 7);
    if (weeks < 4) return weeks + '周前';
    var months = Math.floor(days / 30);
    if (months < 12) return months + '个月前';
    return Math.floor(days / 365) + '年前';
  };

  U.formatFileSize = function (bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  U.generateShareToken = function () {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    var arr = new Uint8Array(16);
    if (typeof crypto !== 'undefined') {
      crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  U.getCategoryAndChildrenIds = function (categoryId, categories) {
    var strId = String(categoryId);
    var ids = [strId];
    (categories || []).forEach(function (c) {
      if (String(c.parent_id) === strId) {
        ids.push.apply(ids, U.getCategoryAndChildrenIds(c.id, categories));
      }
    });
    return ids;
  };

  U.getCategoryPath = function (categoryId, categories, field) {
    var path = [];
    var currentId = categoryId;
    var visited = new Set();
    field = field || 'id';
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      var cat = (categories || []).find(function (c) { return c.id === currentId; });
      if (!cat) break;
      path.unshift(cat[field]);
      currentId = cat.parent_id;
    }
    return path;
  };

  // 情感类型（共享常量）
  U.EMOTION_TYPES = [
    { key: 'photo', icon: '📷', label: '照片' },
    { key: 'mood', icon: '📝', label: '心情日记' },
    { key: 'chatter', icon: '💬', label: '每日叨叨' },
    { key: 'milestone', icon: '🎉', label: '纪念日' },
    { key: 'checkin', icon: '✅', label: '情侣打卡' },
    { key: 'bottle', icon: '🍾', label: '漂流瓶' },
    { key: 'time_capsule', icon: '⏳', label: '时光胶囊' }
  ];

  // 心情表情（共享常量）
  U.MOOD_EMOJIS = ['😊', '😢', '😡', '😴', '🥰', '😰', '🤩', '😤'];

  // 伴侣喜好档案默认模板（共享常量）
  U.DEFAULT_PROFILE = {
    updated_by: '', updated_at: '',
    categories: {
      food:    { label: '食物', icon: '🍔', likes: [], dislikes: [] },
      drinks:  { label: '饮品', icon: '🧋', likes: [], dislikes: [] },
      colors:  { label: '颜色', icon: '🎨', likes: [], dislikes: [] },
      movies:  { label: '电影/剧', icon: '🎬', likes: [], dislikes: [] },
      music:   { label: '音乐', icon: '🎵', likes: [], dislikes: [] },
      brands:  { label: '品牌', icon: '🛍', likes: [], dislikes: [] },
      restaurants: { label: '餐厅', icon: '🍽', likes: [], dislikes: [] },
      gifts:   { label: '想要的礼物', icon: '🎁', likes: [], dislikes: [] },
      other:   { label: '其他备忘', icon: '📌', notes: '' }
    }
  };

  U.getDefaultMilestones = function () {
    return [
      { id: '1', date: '2020-06-15', title: '我们在一起的第一天', description: '故事从这里开始', photoId: null },
      { id: '2', date: '2021-02-14', title: '第一个情人节', description: '', photoId: null },
      { id: '3', date: '2021-01-01', title: '第一个新年', description: '', photoId: null },
      { id: '4', date: '2021-12-25', title: '第一个圣诞节', description: '', photoId: null }
    ];
  };

  // 经期忌口清单（共享常量）
  U.DIETARY_RESTRICTIONS = ['冰的', '辣的', '咖啡', '酒', '生冷', '油炸', '奶茶'];

  window.CommonUtils = U;
})();
