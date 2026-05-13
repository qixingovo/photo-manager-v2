# 经期忌口打卡 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在经期窗口期内触发每日忌口打卡任务，与 RPG 成就系统联动，完成打卡获得 XP + 分级称号奖励。

**Architecture:** 方案 A — 扩展现有 RPG 任务系统。核心逻辑放在 `modules/extras-module.js`（与经期追踪和 RPG 系统同文件），首页浮球在 `mobile-app.js` 中渲染管理，打卡弹窗和经期追踪页卡片在 extras-module 中渲染。

**Tech Stack:** Vanilla JS (ES6+), Supabase (PostgreSQL), CSS3

---

## 文件涉及概览

| 文件 | 改动类型 | 职责 |
|------|---------|------|
| `common.js` | 修改 | 新增 DIETARY_RESTRICTIONS 常量 |
| `modules/extras-module.js` | 修改 | 核心逻辑：窗口判定、打卡 CRUD、RPG 联动、称号、弹窗、经期页卡片 |
| `mobile-app.js` | 修改 | 首页浮球渲染/显隐、首页刷新时触发窗口检查 |
| `index-mobile.html` | 修改 | 经期追踪页 dietary 卡片容器、浮球 DOM |
| `mobile.css` | 修改 | 浮球、弹窗、忌口卡片样式 |
| Supabase | 迁移 | `dietary_checkins` 新表；`rpg_progress` 新增 3 个字段 |

---

### Task 1: Supabase 迁移

**Files:**
- Create: `migrations/2026-05-12-dietary-checkin.sql`

- [ ] **Step 1: 创建 dietary_checkins 表 + 扩展 rpg_progress**

```sql
-- 忌口打卡记录表
CREATE TABLE IF NOT EXISTS dietary_checkins (
    id BIGSERIAL PRIMARY KEY,
    user_name TEXT NOT NULL,
    checkin_date DATE NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT true,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_name, checkin_date)
);

-- 扩展 rpg_progress 表
ALTER TABLE rpg_progress
ADD COLUMN IF NOT EXISTS dietary_month_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dietary_completed_cycles JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dietary_custom_rewards JSONB DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: 在 Supabase SQL Editor 执行迁移**

打开 Supabase Dashboard → SQL Editor，粘贴上述 SQL 并执行。验证：`SELECT * FROM dietary_checkins` 应返回空结果集。

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-05-12-dietary-checkin.sql
git commit -m "feat: add dietary_checkins table and rpg_progress extensions"
```

---

### Task 2: 添加忌口清单常量到 common.js

**Files:**
- Modify: `common.js` (在 `window.CommonUtils = U;` 之前插入)

- [ ] **Step 1: 插入常量定义**

在 `common.js` 的 `window.CommonUtils = U;` 之前（约第 149 行），插入：

```javascript
  // 经期忌口清单（共享常量）
  U.DIETARY_RESTRICTIONS = ['冰的', '辣的', '咖啡', '酒', '生冷', '油炸', '奶茶'];
```

- [ ] **Step 2: 验证**

打开浏览器控制台，在 mobile 端加载后执行 `CommonUtils.DIETARY_RESTRICTIONS`，应返回 7 项数组。

- [ ] **Step 3: Commit**

```bash
git add common.js
git commit -m "feat: add DIETARY_RESTRICTIONS constant to common.js"
```

---

### Task 3: 核心忌口打卡逻辑

**Files:**
- Modify: `modules/extras-module.js`
- Modify: `mobile-app.js`

包含的方法：`_getDietaryWindow()`, `_isInDietaryWindow()`, `_loadDietaryCheckins()`, `_getTodayDietaryCheckin()`, `_openDietaryCheckinModal()`, `_doDietaryCheckin()`, `_checkDietaryWindowCompletion()`, `_checkDietaryTitles()`

- [ ] **Step 1: 在 mobile-app.js 中添加状态初始化**

在 `mobile-app.js` 的 `mobile` 对象中 `_periodCalendarMonth` 附近（约第 135 行），添加：

```javascript
    // 忌口打卡状态
    _dietaryWindowStart: null,
    _dietaryWindowEnd: null,
    _dietaryCheckins: {},
    _dietaryTodayDone: false,
```

- [ ] **Step 2: 窗口判定方法**

在 `extras-module.js` 的周期追踪代码块末尾（约第 1902 行 `_savePeriodRecord` 的 `},` 之后）插入：

```javascript

    // ========================================
    // 忌口打卡系统
    // ========================================

    _getDietaryWindow() {
        var predictedStart = this._getPredictedPeriodStart();
        if (!predictedStart) return null;

        var pd = new Date(predictedStart + 'T00:00:00');
        var windowStart = new Date(pd);
        windowStart.setDate(windowStart.getDate() - 3);

        var allRecords = this._periodAllRecords || [];
        var sortedPeriodDays = allRecords
            .filter(function(r) { return r.is_period; })
            .map(function(r) { return r.record_date; })
            .sort();

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var windowEnd;
        if (sortedPeriodDays.length > 0) {
            var lastPeriodDay = sortedPeriodDays[sortedPeriodDays.length - 1];
            if (lastPeriodDay >= windowStart.toISOString().split('T')[0]) {
                windowEnd = new Date(lastPeriodDay + 'T00:00:00');
            } else {
                windowEnd = new Date(pd);
                windowEnd.setDate(windowEnd.getDate() + 5);
            }
        } else {
            windowEnd = new Date(pd);
            windowEnd.setDate(windowEnd.getDate() + 5);
        }

        if (windowEnd < windowStart) {
            windowEnd = new Date(windowStart);
            windowEnd.setDate(windowEnd.getDate() + 5);
        }

        var dates = [];
        var cursor = new Date(windowStart);
        while (cursor <= windowEnd) {
            dates.push(cursor.toISOString().split('T')[0]);
            cursor.setDate(cursor.getDate() + 1);
        }

        return {
            start: windowStart.toISOString().split('T')[0],
            end: windowEnd.toISOString().split('T')[0],
            dates: dates
        };
    },

    _isInDietaryWindow() {
        var w = this._getDietaryWindow();
        if (!w) return false;
        var today = new Date().toISOString().split('T')[0];
        this._dietaryWindowStart = w.start;
        this._dietaryWindowEnd = w.end;
        return today >= w.start && today <= w.end;
    },

    async _loadDietaryCheckins() {
        var w = this._getDietaryWindow();
        if (!w) return;

        var client = this.initSupabase();
        if (!client) return;

        try {
            var result = await client
                .from('dietary_checkins')
                .select('*')
                .gte('checkin_date', w.start)
                .lte('checkin_date', w.end);

            this._dietaryCheckins = {};
            if (!result.error && result.data) {
                for (var i = 0; i < result.data.length; i++) {
                    this._dietaryCheckins[result.data[i].checkin_date] = result.data[i];
                }
            }
        } catch (e) {
            console.warn('加载忌口打卡记录失败:', e.message);
        }
    },

    _getTodayDietaryCheckin() {
        var today = new Date().toISOString().split('T')[0];
        return this._dietaryCheckins[today] || null;
    },
```

- [ ] **Step 3: 窗口完成判定 + 称号逻辑**

在上一步代码之后继续插入：

```javascript

    async _checkDietaryWindowCompletion() {
        var w = this._getDietaryWindow();
        if (!w || w.dates.length === 0) return;

        var today = new Date().toISOString().split('T')[0];
        if (today < w.end) return;

        var completedCycles = this.rpgData.dietary_completed_cycles || [];
        var cycleKey = w.start;
        if (completedCycles.indexOf(cycleKey) >= 0) return;

        await this._loadDietaryCheckins();

        var allDone = true;
        for (var i = 0; i < w.dates.length; i++) {
            var rec = this._dietaryCheckins[w.dates[i]];
            if (!rec || !rec.completed) { allDone = false; break; }
        }

        if (allDone) {
            this.rpgData.dietary_month_count = (this.rpgData.dietary_month_count || 0) + 1;
            completedCycles.push(cycleKey);
            this.rpgData.dietary_completed_cycles = completedCycles;
            await this._saveRPGData();
            this._checkDietaryTitles();
            this.showToast('🎉 恭喜！本月忌口挑战完成！');
        }
    },

    _checkDietaryTitles() {
        var count = this.rpgData.dietary_month_count || 0;
        if (count >= 6) this.unlockTitle('好乖宝宝');
        else if (count >= 3) this.unlockTitle('乖宝宝');
        else if (count >= 1) this.unlockTitle('好宝宝');
    },
```

- [ ] **Step 4: 打卡弹窗 + 执行打卡**

继续插入：

```javascript

    _openDietaryCheckinModal() {
        var self = this;
        var today = new Date();
        var todayStr = today.toISOString().split('T')[0];
        var w = this._getDietaryWindow();

        var periodDayText = '';
        if (w) {
            var allRecords = this._periodAllRecords || [];
            var sortedPeriodDays = allRecords
                .filter(function(r) { return r.is_period; })
                .map(function(r) { return r.record_date; })
                .sort();
            if (sortedPeriodDays.length > 0) {
                for (var i = 0; i < sortedPeriodDays.length; i++) {
                    if (sortedPeriodDays[i] === todayStr) {
                        periodDayText = '经期第 ' + (i + 1) + ' 天';
                        break;
                    }
                }
            }
            if (!periodDayText) {
                var startDate = new Date(w.start + 'T00:00:00');
                var diffFromStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
                if (diffFromStart > 0) periodDayText = '窗口第 ' + diffFromStart + ' 天';
            }
        }

        var restrictions = CommonUtils.DIETARY_RESTRICTIONS;
        var tagsHTML = restrictions.map(function(item) {
            return '<span class="dietary-tag">🚫 ' + item + '</span>';
        }).join('');

        var modal = document.createElement('div');
        modal.className = 'modal-overlay dietary-modal-overlay';
        modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

        modal.innerHTML = '<div class="dietary-checkin-panel" onclick="event.stopPropagation()">' +
            '<div class="dietary-panel-icon">🍽️</div>' +
            '<div class="dietary-panel-title">今日忌口打卡</div>' +
            '<div class="dietary-panel-date">' + todayStr + (periodDayText ? ' · ' + periodDayText : '') + '</div>' +
            '<div class="dietary-restrictions-box">' +
                '<div class="dietary-restrictions-label">今日忌口清单</div>' +
                '<div class="dietary-tags-grid">' + tagsHTML + '</div>' +
            '</div>' +
            '<textarea class="dietary-note-input" id="dietaryNoteInput" placeholder="说点什么...（可选）"></textarea>' +
            '<div class="dietary-panel-actions">' +
                '<button class="dietary-btn-cancel" onclick="document.querySelector(\'.dietary-modal-overlay\').remove()">算了</button>' +
                '<button class="dietary-btn-done" onclick="mobile._doDietaryCheckin()">✅ 完成打卡 +30 XP</button>' +
            '</div>' +
        '</div>';

        document.body.appendChild(modal);
    },

    async _doDietaryCheckin() {
        var self = this;
        var noteEl = document.getElementById('dietaryNoteInput');
        var note = noteEl ? noteEl.value.trim() : '';

        var client = this.initSupabase();
        if (!client) return;

        var todayStr = new Date().toISOString().split('T')[0];
        var record = {
            user_name: (this.currentUser && this.currentUser.username) ? this.currentUser.username : 'default',
            checkin_date: todayStr,
            completed: true,
            note: note || null
        };

        try {
            var result = await client
                .from('dietary_checkins')
                .upsert(record, { onConflict: 'user_name,checkin_date' });

            if (result.error) {
                console.error('忌口打卡失败:', result.error);
                this.showToast('打卡失败，请重试');
                return;
            }

            this._dietaryCheckins[todayStr] = record;
            this._dietaryTodayDone = true;

            var modal = document.querySelector('.dietary-modal-overlay');
            if (modal) modal.remove();

            await this.addXP(30, 'dietary');

            this._renderDietaryCard();
            this._renderFloatingBall();
            this.showToast('✅ 忌口打卡完成！+30 XP');

            await this._checkDietaryWindowCompletion();
        } catch (e) {
            console.error('忌口打卡出错:', e.message);
            this.showToast('打卡失败');
        }
    },
```

- [ ] **Step 5: 更新 _saveRPGData 包含新字段**

修改 `_saveRPGData`（约第 294-311 行），在 upsert 对象中，`updated_at: new Date().toISOString()` 之前增加三个字段：

```javascript
                dietary_month_count: this.rpgData.dietary_month_count,
                dietary_completed_cycles: this.rpgData.dietary_completed_cycles,
                dietary_custom_rewards: this.rpgData.dietary_custom_rewards,
```

- [ ] **Step 6: 在 loadRPGData 中初始化默认值**

修改 `loadRPGData`（约第 273 行 `this.rpgData = data;` 之后），增加：

```javascript
                this.rpgData.dietary_month_count = this.rpgData.dietary_month_count || 0;
                this.rpgData.dietary_completed_cycles = this.rpgData.dietary_completed_cycles || [];
                this.rpgData.dietary_custom_rewards = this.rpgData.dietary_custom_rewards || [];
```

同时修改 `_initLocalRPG`（约第 288-291 行）：

```javascript
    _initLocalRPG() {
        this.rpgData = { xp: 0, daily_quests: [], weekly_quests: [], unlocked_titles: [], active_title: '', custom_rewards: [], login_streak: 1, last_login_date: new Date().toISOString().slice(0, 10), dietary_month_count: 0, dietary_completed_cycles: [], dietary_custom_rewards: [] };
        this._refreshDailyQuests();
        this._refreshWeeklyQuests();
    },
```

- [ ] **Step 7: 在 loadPeriodTracker 末尾挂载忌口渲染**

修改 `loadPeriodTracker`（约第 1508-1514 行），在 `this._bindPeriodCalendarEvents();` 之后、`},` 之前插入：

```javascript
        if (this._isInDietaryWindow()) {
            await this._loadDietaryCheckins();
        }
        this._renderDietaryCard();
```

- [ ] **Step 8: Commit**

```bash
git add modules/extras-module.js mobile-app.js
git commit -m "feat: add dietary checkin core logic — window detection, checkin CRUD, RPG XP/title integration"
```

---

### Task 4: 经期追踪页嵌入忌口卡片

**Files:**
- Modify: `modules/extras-module.js`
- Modify: `index-mobile.html`

- [ ] **Step 1: 在 index-mobile.html 中添加忌口卡片容器**

在经期追踪页记录按钮之前（约第 491 行 `<!-- 记录按钮 -->` 之前），插入：

```html
            <!-- 忌口打卡卡片（仅窗口期显示） -->
            <div id="dietaryCheckinCard" class="dietary-checkin-card" style="display:none;margin:0 12px 12px;"></div>
```

- [ ] **Step 2: 在 extras-module.js 中添加渲染方法**

在忌口打卡系统代码块中插入：

```javascript

    _renderDietaryCard() {
        var card = document.getElementById('dietaryCheckinCard');
        if (!card) return;

        if (!this._isInDietaryWindow()) { card.style.display = 'none'; return; }

        var w = this._getDietaryWindow();
        if (!w) { card.style.display = 'none'; return; }

        var today = new Date().toISOString().split('T')[0];
        var todayRec = this._dietaryCheckins[today];
        var isDone = todayRec && todayRec.completed;

        var todayIdx = w.dates.indexOf(today);
        var totalDays = w.dates.length;

        var restrictions = CommonUtils.DIETARY_RESTRICTIONS;
        var tagsHTML = restrictions.map(function(item) {
            return '<span class="dietary-tag">🚫 ' + item + '</span>';
        }).join('');

        if (isDone) {
            card.innerHTML = '<div class="dietary-card dietary-card-done">' +
                '<div class="dietary-card-header">' +
                    '<span class="dietary-card-icon">✅</span>' +
                    '<span class="dietary-card-title">忌口完成</span>' +
                '</div>' +
                '<div class="dietary-card-date">' + today + ' · 今天表现超棒</div>' +
                (todayRec.note ? '<div class="dietary-card-note">"' + todayRec.note + '"</div>' : '') +
                '<div class="dietary-tags-grid" style="margin-top:8px;">' + tagsHTML + '</div>' +
            '</div>';
        } else {
            card.innerHTML = '<div class="dietary-card dietary-card-pending">' +
                '<div class="dietary-card-header">' +
                    '<span class="dietary-card-icon">🩸</span>' +
                    '<span class="dietary-card-title">经期忌口 · 第 ' + (todayIdx + 1) + ' 天</span>' +
                '</div>' +
                '<div class="dietary-card-date">还剩 ' + (totalDays - todayIdx) + ' 天 · 月经期注意饮食</div>' +
                '<div class="dietary-tags-grid" style="margin:8px 0;">' + tagsHTML + '</div>' +
                '<button class="dietary-card-btn" onclick="mobile._openDietaryCheckinModal()">今日打卡</button>' +
            '</div>';
        }

        card.style.display = 'block';
    },
```

- [ ] **Step 3: Commit**

```bash
git add modules/extras-module.js index-mobile.html
git commit -m "feat: embed dietary checkin card in period tracker page"
```

---

### Task 5: 首页浮动圆球

**Files:**
- Modify: `mobile-app.js`
- Modify: `index-mobile.html`

- [ ] **Step 1: 在 index-mobile.html 首页添加浮球容器**

在 `#homePage` 内，`featureCardsContainer` 之前（约第 83 行）添加：

```html
        <!-- 忌口打卡浮球（仅窗口期显示） -->
        <div id="dietaryFloatingBall" class="dietary-floating-ball" style="display:none;" onclick="mobile._openDietaryCheckinModal()">
            <span class="dietary-ball-icon">🍽️</span>
            <span class="dietary-ball-label">忌口</span>
            <span id="dietaryBallDot" class="dietary-ball-dot"></span>
        </div>
```

- [ ] **Step 2: 在 mobile-app.js 中添加浮球渲染方法**

在 `mobile-app.js` 中 `switchTab` 方法附近插入：

```javascript

    _renderFloatingBall() {
        var ball = document.getElementById('dietaryFloatingBall');
        if (!ball) return;

        var self = this;
        this._ensureModule('extras').then(function() {
            if (self._isInDietaryWindow && self._isInDietaryWindow()) {
                self._checkDietaryWindowCompletion();
                ball.style.display = 'flex';
                var todayRec = self._getTodayDietaryCheckin ? self._getTodayDietaryCheckin() : null;
                var dot = document.getElementById('dietaryBallDot');
                if (dot) dot.style.display = (todayRec && todayRec.completed) ? 'none' : 'block';
                ball.style.opacity = (todayRec && todayRec.completed) ? '0.6' : '1';
            } else {
                ball.style.display = 'none';
            }
        }).catch(function() {
            ball.style.display = 'none';
        });
    },
```

- [ ] **Step 3: 在首页渲染和 tab 切换时调用浮球刷新**

在 `switchTab` 中 `case 'home':` 分支（约第 1041 行 `this.renderFeatureCards();` 之后）添加：

```javascript
                this._renderFloatingBall();
```

在登录后首页初始加载处（约第 580 行 `this.renderFeatureCards();` 之后）也添加：

```javascript
        this._renderFloatingBall();
```

- [ ] **Step 4: Commit**

```bash
git add mobile-app.js index-mobile.html
git commit -m "feat: add floating ball on home page for dietary checkin"
```

---

### Task 6: 成就页展示忌口称号

**Files:**
- Modify: `modules/extras-module.js`
- Modify: `index-mobile.html`

- [ ] **Step 1: 在成就页渲染中添加忌口称号展示**

在 `_renderAchievementsPage` 中称号区域之后（约第 593 行 `}` 关闭 titlesEl 之后）、里程碑区域之前插入：

```javascript

        var dietaryTitlesEl = document.getElementById('rpgDietaryTitles');
        if (dietaryTitlesEl) {
            var dietaryCount = this.rpgData.dietary_month_count || 0;
            var dietaryTiers = [
                { count: 1, name: '好宝宝' },
                { count: 3, name: '乖宝宝' },
                { count: 6, name: '好乖宝宝' }
            ];
            var titles = this.rpgData.unlocked_titles || [];
            dietaryTitlesEl.innerHTML = '<h3>🩸 忌口成就</h3>' +
                '<div class="dietary-title-track">' +
                    '<div class="dietary-title-count">已完成 <strong>' + dietaryCount + '</strong> 次月度忌口挑战</div>' +
                    '<div class="rpg-track-badges">' +
                        dietaryTiers.map(function(t) {
                            var unlocked = titles.indexOf(t.name) >= 0;
                            return '<div class="rpg-track-badge' + (unlocked ? '' : ' locked') + '">' +
                                '<span class="rpg-track-badge-icon">' + (unlocked ? '🏅' : '🔒') + '</span>' +
                                '<span class="rpg-track-badge-name">' + (unlocked ? t.name : '???') + '</span>' +
                                '<span class="rpg-track-badge-desc">' + t.count + ' 次</span>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                '</div>';
        }
```

- [ ] **Step 2: 在 index-mobile.html 成就页中添加容器**

在 `#rpgRewards` 和 `#mobileAchievementsGrid` 之间（约第 334-336 行）插入：

```html
            <!-- 忌口成就 -->
            <div id="rpgDietaryTitles" class="rpg-section"></div>
```

- [ ] **Step 3: Commit**

```bash
git add modules/extras-module.js index-mobile.html
git commit -m "feat: show dietary titles on achievements page"
```

---

### Task 7: CSS 样式

**Files:**
- Modify: `mobile.css`
- Modify: `index-mobile.html`

- [ ] **Step 1: 在 mobile.css 末尾追加样式**

```css
/* ========================================
   忌口打卡系统样式
   ======================================== */

.dietary-floating-ball {
    position: fixed;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FF8099, #E84A6B);
    box-shadow: 0 3px 12px rgba(232, 74, 107, 0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 100;
    transition: opacity 0.3s, transform 0.3s;
    -webkit-tap-highlight-color: transparent;
}
.dietary-floating-ball:active {
    transform: translateY(-50%) scale(0.92);
}
.dietary-ball-icon { font-size: 20px; line-height: 1; }
.dietary-ball-label { font-size: 9px; font-weight: 700; color: #fff; line-height: 1; margin-top: 1px; }
.dietary-ball-dot {
    position: absolute; top: 4px; right: 4px;
    width: 10px; height: 10px;
    background: #fff; border: 2px solid #E84A6B; border-radius: 50%;
    animation: dietary-dot-pulse 2s infinite;
}
@keyframes dietary-dot-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.3); }
}

.dietary-checkin-card { border-radius: 12px; overflow: hidden; }
.dietary-card { padding: 16px; border-radius: 12px; }
.dietary-card-pending { background: #FFF5F5; border: 1px solid #FFD4DD; }
.dietary-card-done { background: #F0FFF4; border: 1px solid #C6F6D5; }
.dietary-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dietary-card-icon { font-size: 18px; }
.dietary-card-title { font-weight: 700; font-size: 15px; color: #E84A6B; }
.dietary-card-done .dietary-card-title { color: #38A169; }
.dietary-card-date { font-size: 12px; color: #999; margin-top: 2px; }
.dietary-card-note { margin-top: 6px; font-size: 12px; color: #666; font-style: italic; }
.dietary-card-btn {
    display: block; width: 100%; background: #E84A6B; color: #fff;
    border: none; padding: 8px 16px; border-radius: 20px;
    font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;
}
.dietary-card-btn:active { opacity: 0.85; }

.dietary-tags-grid { display: flex; gap: 6px; flex-wrap: wrap; }
.dietary-tag { background: #FFE0E6; color: #E84A6B; padding: 4px 10px; border-radius: 12px; font-size: 12px; white-space: nowrap; }

.dietary-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; animation: dietary-fade-in 0.2s ease;
}
@keyframes dietary-fade-in { from { opacity: 0; } to { opacity: 1; } }
.dietary-checkin-panel {
    background: #fff; border-radius: 20px; padding: 28px 24px 20px;
    width: calc(100vw - 48px); max-width: 360px; text-align: center;
    animation: dietary-scale-in 0.25s ease;
}
@keyframes dietary-scale-in { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.dietary-panel-icon { font-size: 40px; margin-bottom: 8px; }
.dietary-panel-title { font-weight: 700; font-size: 18px; color: #333; }
.dietary-panel-date { font-size: 13px; color: #999; margin-top: 4px; }
.dietary-restrictions-box { background: #FFF5F5; border-radius: 10px; padding: 12px; margin-top: 16px; text-align: left; }
.dietary-restrictions-label { font-size: 12px; color: #999; margin-bottom: 8px; }
.dietary-note-input {
    width: 100%; border: 1px solid #e0e0e0; border-radius: 10px;
    padding: 10px 12px; font-size: 14px; margin-top: 12px;
    resize: none; height: 60px; box-sizing: border-box; font-family: inherit;
}
.dietary-note-input:focus { outline: none; border-color: #E84A6B; }
.dietary-panel-actions { display: flex; gap: 10px; margin-top: 16px; }
.dietary-btn-cancel { flex: 1; background: #f0f0f0; color: #666; border: none; padding: 12px; border-radius: 25px; font-size: 14px; cursor: pointer; }
.dietary-btn-cancel:active { background: #e0e0e0; }
.dietary-btn-done { flex: 2; background: #E84A6B; color: #fff; border: none; padding: 12px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; }
.dietary-btn-done:active { opacity: 0.85; }

.dietary-title-track { padding: 12px 0; }
.dietary-title-count { font-size: 14px; color: #666; margin-bottom: 12px; text-align: center; }
.dietary-title-count strong { color: #E84A6B; font-size: 20px; }
```

- [ ] **Step 2: 更新 mobile.css 版本号**

在 `index-mobile.html` 中将 `mobile.css?v=73` 改为 `mobile.css?v=74`。

- [ ] **Step 3: Commit**

```bash
git add mobile.css index-mobile.html
git commit -m "style: add dietary checkin styles — floating ball, modal, card, achievement track"
```

---

## 验证清单

全部任务完成后：

1. **Supabase**: `dietary_checkins` 表存在，`rpg_progress` 含三个新列
2. **常量**: `CommonUtils.DIETARY_RESTRICTIONS` 返回 7 项
3. **窗口判定**: 有经期记录 → 预测经期前 3 天浮球出现
4. **打卡弹窗**: 点击浮球 → 弹窗显示忌口清单 + 日期 + 备注框
5. **打卡执行**: 点击"完成打卡" → +30 XP toast → 状态更新
6. **窗口完成**: 每天打卡 → 窗口结束后自动结算 → 称号解锁
7. **成就页**: 忌口成就区域显示次数 + 称号
8. **非窗口期**: 浮球/卡片均不显示
9. **无数据**: 无经期预测 → 窗口不触发
