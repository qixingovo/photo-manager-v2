/* ========================================
   Extract feature modules from mobile-app.js.bak
   Reads the backup file and creates 7 module files
   Run: node scripts/extract-modules.js
   ======================================== */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..');
const MODULES_DIR = path.join(SRC_DIR, 'modules');
const BAK_FILE = path.join(SRC_DIR, 'mobile-app.js.bak');

// Read the backup file (contains all sections including feature code)
const bakSrc = fs.readFileSync(BAK_FILE, 'utf8');
const bakLines = bakSrc.split('\n');

// ============================================================
// Helper: extract text between line numbers (0-indexed, inclusive)
// ============================================================
function extractLines(lines, startLine, endLine) {
    return lines.slice(startLine, endLine + 1).join('\n');
}

// ============================================================
// Helper: count methods in extracted code
// ============================================================
function countMethods(code) {
    const matches = code.match(/^\s+[a-zA-Z_$][\w$]*\s*[\(:]/gm);
    const asyncMatches = code.match(/^\s+async\s+[a-zA-Z_$][\w$]*\s*\(/gm);
    return (matches ? matches.length : 0) + (asyncMatches ? asyncMatches.length : 0);
}

// ============================================================
// Helper: find the first meaningful comment/label in a section
// ============================================================
function findSectionLabel(startLine, endLine) {
    for (let i = startLine; i <= Math.min(startLine + 5, endLine); i++) {
        const line = bakLines[i] || '';
        const m = line.match(/^\s*\/\/\s+(.+)/);
        if (m && !/^=+$/.test(m[1].trim()) && m[1].trim().length > 0) {
            return m[1].trim();
        }
    }
    return '(unnamed)';
}

// ============================================================
// SECTION DEFINITIONS (0-indexed line numbers from bakLines)
//
// Sections that are ALREADY IN mobile-app.js (CORE):
//   [206-318]   主题相关
//   [319-471]   生日彩蛋
//   [472-596]   登录相关
//   [597-791]   页面导航
//   [792-1054]  功能卡片 编辑模式
//   [1055-1196] 数据加载
//   [1197-1650] 照片相关
//   [3101-3133] 搜索和过滤
//   [3202-3221] 个人页面
//   [3222-3279] 已标记分类
//   [3520-3531] Toast 提示
//   [3532-3592] 图片压缩
//   [6068-6108] 纪念日升级 (countdown)
//
// Sections to EXTRACT to modules:
// ============================================================

const MODULES = {
    'photos-module.js': {
        desc: '照片管理功能（批量设置、上传、分类、评论、编辑、照片选择器、删除确认）',
        sections: [
            [1651, 1911],   // 批量设置位置
            [1912, 2086],   // 上传相关
            [2087, 3100],   // 分类相关
            [3134, 3201],   // 留言（评论）
            [3280, 3430],   // 改分类弹窗
            [3431, 3495],   // 编辑弹窗
            [3496, 3508],   // 下载照片
            [3509, 3519],   // 删除照片（确认弹窗）
            [6233, 6294],   // 通用照片选择器
        ]
    },
    'map-passport-module.js': {
        desc: '地图功能与足迹护照',
        sections: [
            [3593, 3746],   // 地图功能
            [5336, 5463],   // 足迹护照（移动端）
        ]
    },
    'timeline-module.js': {
        desc: '纪念日时间线与情感时间轴',
        sections: [
            [3747, 4267],   // 纪念日时间线
            [7326, 7583],   // 情感时间轴
        ]
    },
    'albums-module.js': {
        desc: '相册功能与分享链接',
        sections: [
            [4922, 5255],   // 相册功能
            [5256, 5335],   // 分享链接（移动端）
        ]
    },
    'diary-module.js': {
        desc: '心情日记与每日叨叨',
        sections: [
            [5464, 5614],   // 心情日记
            [6109, 6232],   // 每日叨叨
        ]
    },
    'records-module.js': {
        desc: '情侣打卡、亲密记录与伴侣喜好',
        sections: [
            [5615, 5801],   // 情侣打卡
            [5802, 6067],   // 亲密记录
            [6426, 6622],   // 对方喜好档案（伴侣喜好）
        ]
    },
    'extras-module.js': {
        desc: '其他功能（拼贴墙、RPG、漂流瓶、悄悄话、戳一戳、时光胶囊、周期追踪、游戏中心）',
        sections: [
            [4268, 4478],   // 照片拼贴墙
            [4479, 4765],   // 恋爱成就 RPG 系统（含等级计算）
            [4766, 4921],   // 成就页渲染（RPG 成就）
            [6295, 6424],   // 照片漂流瓶
            [6623, 6874],   // 悄悄话
            [6875, 6950],   // 戳一戳
            [6951, 7325],   // 时光胶囊
            [7584, 7983],   // 周期追踪
            [7984, 8119],   // 游戏中心
        ]
    }
};

// ============================================================
// MAIN EXTRACTION
// ============================================================
console.log('Extracting modules from mobile-app.js.bak...\n');

// Ensure modules directory exists
if (!fs.existsSync(MODULES_DIR)) {
    fs.mkdirSync(MODULES_DIR, { recursive: true });
}

const moduleStats = {};
let grandTotalExtracted = 0;

for (const [filename, config] of Object.entries(MODULES)) {
    const modulePath = path.join(MODULES_DIR, filename);
    let totalLines = 0;
    let allCode = '';

    console.log(`--- ${filename}: ${config.desc} ---`);

    for (const [start, end] of config.sections) {
        const label = findSectionLabel(start, end);
        const code = extractLines(bakLines, start, end);
        const sectionLines = end - start + 1;

        // Always extract (no auto-skip - the CORE file is already trimmed)
        allCode += code + '\n\n';
        totalLines += sectionLines;
        console.log(`  Lines ${start}-${end} (${sectionLines} lines): "${label}"`);
    }

    if (allCode.trim()) {
        // Wrap in IIFE with module header
        const moduleContent = `/* MODULE: ${filename} — ${config.desc}
 *
 * This module is lazy-loaded by mobile-app.js via _ensureModule().
 * All methods extend the global 'mobile' object.
 */

(function() {

${allCode.trim()}

})();
`;

        fs.writeFileSync(modulePath, moduleContent, 'utf8');
        const methodCount = countMethods(allCode);
        moduleStats[filename] = { lines: totalLines, methods: methodCount };
        grandTotalExtracted += totalLines;
        console.log(`  => Wrote ${modulePath} (${totalLines} lines, ~${methodCount} methods)\n`);
    }
}

// ============================================================
// SUMMARY
// ============================================================
console.log('========================================');
console.log('  EXTRACTION SUMMARY');
console.log('========================================');
for (const [filename, stats] of Object.entries(moduleStats)) {
    console.log(`  ${filename}: ${stats.lines} lines, ~${stats.methods} methods`);
}

console.log(`\n  Total extracted: ${grandTotalExtracted} lines across ${Object.keys(moduleStats).length} module files`);
console.log('  CORE (mobile-app.js): already trimmed to ~1877 lines');
console.log('\nDone.');
