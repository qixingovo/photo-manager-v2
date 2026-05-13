# 周期追踪功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为移动端添加月经周期追踪功能（日历记录+症状标签+周期预测），替换首页相册卡片

**Architecture:** 新增 `period_daily_records` 表（按日记录），新增 `periodTrackerPage` 页面，修改 FEATURE_CARD_CONFIG 替换相册为周期追踪，相册入口移至照片页顶部

**Tech Stack:** Vanilla JS + Supabase + CSS Variables (mobile.css 现有体系)

---

### Task 1: 数据库迁移

**Files:**
- Create: `migrations/013_period_daily.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- 周期追踪每日记录表
CREATE TABLE IF NOT EXISTS period_daily_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    record_date DATE NOT NULL,
    is_period BOOLEAN DEFAULT FALSE,
    flow_level INT DEFAULT 0,
    symptoms TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_name, record_date)
);

ALTER TABLE period_daily_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_period_daily" ON period_daily_records
    USING (true) WITH CHECK (true);
```

- [ ] **Step 2: 提交迁移文件**

```bash
git add migrations/013_period_daily.sql
git commit -m "feat: add period_daily_records table for cycle tracking"
```

---

### Task 2: 更新 index-mobile.html

**Files:**
- Modify: `index-mobile.html`

- [ ] **Step 1: 在相册页面之后添加 periodTrackerPage**

在 `<!-- ========== 相册详情页 ========== -->` 之前（`albumsPage` 的 `</div>` 之后）插入：

```html
<!-- ========== 周期追踪页 ========== -->
<div id="periodTrackerPage" class="page">
    <header class="top-bar">
        <div class="logo">
            <span>🩸</span>
            <span>周期追踪</span>
        </div>
    </header>
    <div id="periodTrackerContent" style="flex:1;overflow-y:auto;">
        <!-- 顶部周期信息卡 -->
        <div id="periodInfoCard" class="period-info-card">
            <div class="period-info-left">
                <div class="period-phase" id="periodPhase">--</div>
                <div class="period-day-label" id="periodDayLabel">--</div>
            </div>
            <div class="period-info-right">
                <div class="period-next-label">预计下次经期</div>
                <div class="period-next-date" id="periodNextDate">--</div>
                <div class="period-countdown" id="periodCountdown">--</div>
            </div>
        </div>
        <!-- 月历 -->
        <div class="period-calendar" id="periodCalendar">
            <div class="period-calendar-header">
                <button class="period-month-btn" id="periodPrevMonth">◀</button>
                <span class="period-month-label" id="periodMonthLabel">--</span>
                <button class="period-month-btn" id="periodNextMonth">▶</button>
            </div>
            <div class="period-weekdays">
                <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>
            <div class="period-days-grid" id="periodDaysGrid"></div>
            <div class="period-legend">
                <span><i class="period-dot today"></i> 今天</span>
                <span><i class="period-dot period"></i> 经期</span>
                <span><i class="period-dot predicted"></i> 预测经期</span>
                <span><i class="period-dot ovulation"></i> 排卵期</span>
            </div>
        </div>
        <!-- 记录按钮 -->
        <div style="padding:0 12px 12px;">
            <button class="period-record-btn" id="periodRecordTodayBtn">📝 记录今天</button>
        </div>
        <!-- 近期记录列表 -->
        <div class="period-recent" id="periodRecent">
            <div class="period-recent-title">📋 近期记录</div>
            <div id="periodRecentList">
                <div class="empty-state" id="periodRecentEmpty">
                    <span class="empty-icon">📋</span>
                    <p>还没有记录</p>
                    <small>点击"记录今天"开始追踪周期</small>
                </div>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: 在照片页顶部添加相册入口按钮**

在 `index-mobile.html` 的 `#photosPage .top-actions` 中，于现有三个按钮之前插入：

```html
<button class="icon-btn" onclick="mobile.switchTab('albums')" title="相册">📸</button>
```

即修改为：

```html
<div class="top-actions">
    <button class="icon-btn" onclick="mobile.switchTab('albums')" title="相册">📸</button>
    <button class="icon-btn" onclick="mobile.switchTab('upload')" title="上传">📤</button>
    <button class="icon-btn" onclick="mobile.switchTab('category')" title="分类">📁</button>
    <button class="icon-btn" onclick="mobile.toggleSearch()">🔍</button>
</div>
```

- [ ] **Step 3: 提交 HTML 修改**

```bash
git add index-mobile.html
git commit -m "feat: add periodTracker page and move album entry to photos"
```

---

### Task 3: 更新 mobile-app.js - 卡片配置 + 路由

**Files:**
- Modify: `mobile-app.js`

- [ ] **Step 1: 替换 FEATURE_CARD_CONFIG 中的 albums 为 periodTracker**

修改 `mobile-app.js` 第 27 行，将：
```js
albums:          { id:'albums', icon:'📸', title:'相册',      sub:'我们的回忆',        gradient:'linear-gradient(135deg,#E3F2FD,#BBDEFB)' }
```

替换为：
```js
periodTracker:   { id:'periodTracker', icon:'🩸', title:'周期追踪', sub:'经期记录与预测',   gradient:'linear-gradient(135deg,#FFE0E6,#FFD4DD)' }
```

- [ ] **Step 2: 替换 DEFAULT_FEATURE_CARD_ORDER 中的 albums**

修改 `mobile-app.js` 第 30 行，将：
```js
const DEFAULT_FEATURE_CARD_ORDER = ['moodDiary','dailyChatter','coupleTasks','map','emotionTimeline','albums'];
```

替换为：
```js
const DEFAULT_FEATURE_CARD_ORDER = ['moodDiary','dailyChatter','coupleTasks','map','emotionTimeline','periodTracker'];
```

- [ ] **Step 3: 在 switchTab 中添加 periodTracker 路由**

在 `mobile-app.js` 的 `switchTab` 函数中（`albums` 路由之后），添加：

```js
} else if (tab === 'periodTracker') {
    this.showPage('periodTracker');
    this.loadPeriodTracker();
```

- [ ] **Step 4: 提交配置修改**

```bash
git add mobile-app.js
git commit -m "feat: replace albums card with periodTracker in home config"
```

---

### Task 4: 更新 mobile-app.js - 核心逻辑

**Files:**
- Modify: `mobile-app.js`

在文件末尾（最后一个函数之后，`// ========================================` 注释块之前）添加完整模块。

- [ ] **Step 1: 添加周期追踪状态变量**

在 `mobile-app.js` 顶部，其他状态变量附近添加：
```js
_periodCalendarYear: null,
_periodCalendarMonth: null,
_periodEditingDate: null,
```

- [ ] **Step 2: 添加 loadPeriodTracker() 函数**

```js
async loadPeriodTracker() {
    const now = new Date();
    this._periodCalendarYear = now.getFullYear();
    this._periodCalendarMonth = now.getMonth() + 1;
    await this.loadPeriodRecords();
    this.renderPeriodCalendar();
    this.renderPeriodInfo();
    this.renderPeriodRecent();
    this.bindPeriodCalendarEvents();
},
```

- [ ] **Step 3: 添加 loadPeriodRecords() 函数**

```js
async loadPeriodRecords() {
    const year = this._periodCalendarYear;
    const month = this._periodCalendarMonth;
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

    const { data, error } = await supabase
        .from('period_daily_records')
        .select('*')
        .gte('record_date', startDate)
        .lte('record_date', endDateStr)
        .order('record_date', { ascending: true });

    if (!error) {
        this._periodRecords = {};
        (data || []).forEach(r => {
            this._periodRecords[r.record_date] = r;
        });
    }

    // 同时加载最近3个月的所有记录用于预测
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

    const { data: allData } = await supabase
        .from('period_daily_records')
        .select('*')
        .gte('record_date', threeMonthsAgoStr)
        .order('record_date', { ascending: true });

    if (!error) {
        this._periodAllRecords = allData || [];
    }
},
```

- [ ] **Step 4: 添加 renderPeriodCalendar() 函数**

```js
renderPeriodCalendar() {
    const year = this._periodCalendarYear;
    const month = this._periodCalendarMonth;

    document.getElementById('periodMonthLabel').textContent = `${year}年${month}月`;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    // 计算预测日
    const predictedStart = this._getPredictedPeriodStart();
    const ovulationDate = this._getOvulationDate(predictedStart);

    let html = '';
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="period-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const record = this._periodRecords[dateStr];
        let cls = 'period-day';
        if (dateStr === todayStr) cls += ' today';
        if (record && record.is_period) cls += ' period';
        if (dateStr === predictedStart) cls += ' predicted';
        if (dateStr === ovulationDate) cls += ' ovulation';
        if (!record || (!record.is_period && !record.symptoms.length && !record.notes)) {
            // no record yet
        }

        html += `<div class="${cls}" data-date="${dateStr}" onclick="mobile.openPeriodRecordPanel('${dateStr}')">${d}</div>`;
    }

    document.getElementById('periodDaysGrid').innerHTML = html;
},
```

- [ ] **Step 5: 添加预测相关函数**

```js
_getPredictedPeriodStart() {
    const records = this._periodAllRecords || [];
    // 找出所有经期段（连续 is_period=true 的日期段）
    const sortedRecords = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date));
    const periodSegments = [];
    let currentSegment = null;

    for (const r of sortedRecords) {
        if (r.is_period) {
            if (!currentSegment) {
                currentSegment = { start: r.record_date, end: r.record_date };
            } else {
                const lastDate = new Date(currentSegment.end);
                const thisDate = new Date(r.record_date);
                const diffDays = Math.round((thisDate - lastDate) / (1000 * 60 * 60 * 24));
                if (diffDays <= 1) {
                    currentSegment.end = r.record_date;
                } else {
                    periodSegments.push(currentSegment);
                    currentSegment = { start: r.record_date, end: r.record_date };
                }
            }
        } else if (currentSegment) {
            periodSegments.push(currentSegment);
            currentSegment = null;
        }
    }
    if (currentSegment) periodSegments.push(currentSegment);

    if (periodSegments.length < 2) {
        // 不足2个周期，使用默认28天
        if (periodSegments.length === 1) {
            const lastStart = new Date(periodSegments[periodSegments.length - 1].start);
            lastStart.setDate(lastStart.getDate() + 28);
            return lastStart.toISOString().split('T')[0];
        }
        return null;
    }

    // 最近3个间隔取平均
    const intervals = [];
    for (let i = 1; i < periodSegments.length; i++) {
        const prev = new Date(periodSegments[i-1].start);
        const curr = new Date(periodSegments[i].start);
        intervals.push(Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
    }

    const recentIntervals = intervals.slice(-3);
    const avgInterval = Math.round(recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length);

    const lastStart = new Date(periodSegments[periodSegments.length - 1].start);
    lastStart.setDate(lastStart.getDate() + avgInterval);
    return lastStart.toISOString().split('T')[0];
},

_getOvulationDate(predictedStart) {
    if (!predictedStart) return null;
    const d = new Date(predictedStart);
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
},
```

- [ ] **Step 6: 添加 renderPeriodInfo() 函数**

```js
renderPeriodInfo() {
    const records = this._periodAllRecords || [];
    const sortedRecords = [...records].filter(r => r.is_period).sort((a, b) => b.record_date.localeCompare(a.record_date));

    let phase = '黄体期';
    let dayInCycle = '--';
    let nextDate = '--';
    let countdown = '--';

    if (sortedRecords.length > 0) {
        const lastPeriodStart = new Date(sortedRecords[0].record_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((today - lastPeriodStart) / (1000 * 60 * 60 * 24));
        dayInCycle = diffDays + 1;

        if (dayInCycle <= 7) phase = '经期/卵泡早期';
        else if (dayInCycle <= 14) phase = '卵泡期';
        else if (dayInCycle <= 16) phase = '排卵期';
        else phase = '黄体期';

        const predictedStart = this._getPredictedPeriodStart();
        if (predictedStart) {
            nextDate = predictedStart;
            const predDate = new Date(predictedStart);
            const daysLeft = Math.floor((predDate - today) / (1000 * 60 * 60 * 24));
            countdown = daysLeft > 0 ? `还有 ${daysLeft} 天` : (daysLeft === 0 ? '今天' : `已过 ${Math.abs(daysLeft)} 天`);
        }
    }

    document.getElementById('periodPhase').textContent = phase;
    document.getElementById('periodDayLabel').textContent = `第 ${dayInCycle} 天`;
    document.getElementById('periodNextDate').textContent = nextDate;
    document.getElementById('periodCountdown').textContent = countdown;
},
```

- [ ] **Step 7: 添加 renderPeriodRecent() 函数**

```js
renderPeriodRecent() {
    const list = document.getElementById('periodRecentList');
    const empty = document.getElementById('periodRecentEmpty');
    const allRecords = (this._periodAllRecords || [])
        .filter(r => r.is_period || r.symptoms.length > 0 || r.notes)
        .sort((a, b) => b.record_date.localeCompare(a.record_date))
        .slice(0, 10);

    if (allRecords.length === 0) {
        list.innerHTML = '';
        list.appendChild(empty);
        empty.style.display = '';
        return;
    }

    empty.style.display = 'none';

    const flowLabels = { 0: '', 1: '流量少', 2: '流量中', 3: '流量多' };
    const symptomLabels = {
        '痛经': '😣 痛经', '疲劳': '😴 疲劳', '情绪波动': '😤 情绪波动',
        '头痛': '🤕 头痛', '腰酸': '💢 腰酸', '食欲变化': '🍔 食欲变化',
        '焦虑': '😰 焦虑', '失眠': '🥱 失眠', '排卵期': '✨ 排卵期'
    };

    let html = '';
    for (const r of allRecords) {
        const displayDate = r.record_date.slice(5);
        const statusText = r.is_period ? `经期 · ${flowLabels[r.flow_level] || ''}` : '';
        const symptomTags = (r.symptoms || []).map(s => symptomLabels[s] || s);

        html += `<div class="period-record-item">
            <div class="period-record-date">${displayDate}</div>
            <div class="period-record-body">${statusText}</div>`;

        if (symptomTags.length > 0) {
            html += `<div class="period-record-tags">${symptomTags.map(s => `<span class="period-record-tag">${s}</span>`).join('')}</div>`;
        }
        if (r.notes) {
            html += `<div class="period-record-notes">${r.notes}</div>`;
        }
        html += `</div>`;
    }

    list.innerHTML = html;
},
```

- [ ] **Step 8: 添加 bindPeriodCalendarEvents() 函数**

```js
bindPeriodCalendarEvents() {
    document.getElementById('periodPrevMonth').onclick = () => {
        if (this._periodCalendarMonth === 1) {
            this._periodCalendarYear--;
            this._periodCalendarMonth = 12;
        } else {
            this._periodCalendarMonth--;
        }
        this.loadPeriodTracker();
    };
    document.getElementById('periodNextMonth').onclick = () => {
        if (this._periodCalendarMonth === 12) {
            this._periodCalendarYear++;
            this._periodCalendarMonth = 1;
        } else {
            this._periodCalendarMonth++;
        }
        this.loadPeriodTracker();
    };
    document.getElementById('periodRecordTodayBtn').onclick = () => {
        const today = new Date().toISOString().split('T')[0];
        this.openPeriodRecordPanel(today);
    };
},
```

- [ ] **Step 9: 添加 openPeriodRecordPanel() 函数**

```js
openPeriodRecordPanel(dateStr) {
    this._periodEditingDate = dateStr;
    const record = this._periodRecords[dateStr] || { is_period: false, flow_level: 0, symptoms: [], notes: '' };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'periodRecordModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

    const flowLabels = ['', '💧 少', '💧💧 中', '💧💧💧 多'];
    const allSymptoms = ['痛经', '疲劳', '情绪波动', '头痛', '腰酸', '食欲变化', '焦虑', '失眠', '排卵期'];
    const symptomIcons = { '痛经': '😣', '疲劳': '😴', '情绪波动': '😤', '头痛': '🤕', '腰酸': '💢', '食欲变化': '🍔', '焦虑': '😰', '失眠': '🥱', '排卵期': '✨' };

    const flowHTML = flowLabels.map((label, idx) => {
        const sel = idx === record.flow_level ? ' selected' : '';
        return `<button class="period-flow-btn${sel}" data-level="${idx}" onclick="mobile._onPeriodFlowClick(this)">${label || '无'}</button>`;
    }).join('');

    const symptomHTML = allSymptoms.map(s => {
        const sel = (record.symptoms || []).includes(s) ? ' selected' : '';
        return `<span class="period-symptom-tag${sel}" data-symptom="${s}" onclick="mobile._onPeriodSymptomClick(this)">${symptomIcons[s]} ${s}</span>`;
    }).join('');

    modal.innerHTML = `<div class="period-record-panel" onclick="event.stopPropagation()">
        <div class="period-panel-header">
            <button class="period-panel-cancel" onclick="document.getElementById('periodRecordModal').remove()">取消</button>
            <span>${dateStr} · 记录</span>
            <button class="period-panel-save" onclick="mobile.savePeriodRecord()">保存</button>
        </div>
        <div class="period-panel-body">
            <div class="period-panel-section">
                <div class="period-panel-label">经期状态</div>
                <div class="period-toggle-group">
                    <button class="period-toggle-btn${record.is_period ? ' active' : ''}" data-value="period" onclick="mobile._onPeriodToggle(this)">🩸 经期中</button>
                    <button class="period-toggle-btn${!record.is_period ? ' active' : ''}" data-value="clean" onclick="mobile._onPeriodToggle(this)">✅ 干净</button>
                </div>
            </div>
            <div class="period-panel-section period-flow-section" style="display:${record.is_period ? '' : 'none'}">
                <div class="period-panel-label">流量</div>
                <div class="period-flow-group">${flowHTML}</div>
            </div>
            <div class="period-panel-section">
                <div class="period-panel-label">症状（可多选）</div>
                <div class="period-symptom-group">${symptomHTML}</div>
            </div>
            <div class="period-panel-section">
                <div class="period-panel-label">备注</div>
                <textarea class="period-panel-notes" id="periodPanelNotes" placeholder="记录今天的身体感受...">${record.notes || ''}</textarea>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);

    // 存储临时状态
    this._periodPanelState = {
        isPeriod: record.is_period,
        flowLevel: record.flow_level,
        symptoms: [...(record.symptoms || [])],
    };
},

// 经期状态切换
_onPeriodToggle(btn) {
    const value = btn.dataset.value;
    const container = btn.parentElement;
    container.querySelectorAll('.period-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    this._periodPanelState.isPeriod = (value === 'period');

    const flowSection = btn.closest('.period-record-panel').querySelector('.period-flow-section');
    if (flowSection) flowSection.style.display = (value === 'period') ? '' : 'none';
},

// 流量选择
_onPeriodFlowClick(btn) {
    const container = btn.parentElement;
    container.querySelectorAll('.period-flow-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this._periodPanelState.flowLevel = parseInt(btn.dataset.level);
},

// 症状标签点击
_onPeriodSymptomClick(span) {
    span.classList.toggle('selected');
    const symptom = span.dataset.symptom;
    const idx = this._periodPanelState.symptoms.indexOf(symptom);
    if (idx >= 0) {
        this._periodPanelState.symptoms.splice(idx, 1);
    } else {
        this._periodPanelState.symptoms.push(symptom);
    }
},
```

- [ ] **Step 10: 添加 savePeriodRecord() 函数**

```js
async savePeriodRecord() {
    const state = this._periodPanelState;
    const dateStr = this._periodEditingDate;
    const notes = document.getElementById('periodPanelNotes')?.value || '';

    const record = {
        user_name: this.currentUser?.username || 'default',
        record_date: dateStr,
        is_period: state.isPeriod,
        flow_level: state.isPeriod ? state.flowLevel : 0,
        symptoms: state.symptoms,
        notes: notes,
    };

    const { error } = await supabase
        .from('period_daily_records')
        .upsert(record, { onConflict: 'user_name,record_date' });

    document.getElementById('periodRecordModal')?.remove();

    if (error) {
        console.error('保存周期记录失败:', error);
        return;
    }

    await this.loadPeriodTracker();
},
```

- [ ] **Step 11: 提交核心逻辑**

```bash
git add mobile-app.js
git commit -m "feat: add period tracker core logic (calendar, record panel, prediction)"
```

---

### Task 5: 更新 mobile.css - 周期追踪样式

**Files:**
- Modify: `mobile.css`

- [ ] **Step 1: 在 mobile.css 末尾添加周期追踪样式**

```css
/* ========================================
   周期追踪
   ======================================== */

/* 顶部周期信息卡 */
.period-info-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    margin: 12px;
    background: linear-gradient(135deg, var(--primary, #e896a8), var(--accent, #f5a0b0));
    border-radius: var(--radius-lg, 16px);
    color: #fff;
}
body.dark .period-info-card {
    background: linear-gradient(135deg, #b07080, #a06070);
}

.period-info-left .period-phase {
    font-size: 14px;
    opacity: 0.9;
}
.period-info-left .period-day-label {
    font-size: 20px;
    font-weight: bold;
    margin-top: 2px;
}
.period-info-right {
    text-align: right;
}
.period-info-right .period-next-label {
    font-size: 11px;
    opacity: 0.85;
}
.period-info-right .period-next-date {
    font-size: 16px;
    font-weight: bold;
}
.period-info-right .period-countdown {
    font-size: 11px;
    opacity: 0.8;
}

/* 月历 */
.period-calendar {
    padding: 8px 12px;
    background: var(--card-bg, #fff);
    margin: 0 12px;
    border-radius: var(--radius-lg, 16px);
    border: 1px solid var(--border-light, #f0e0e0);
}

.period-calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.period-month-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--bg, #f5f5f5);
    color: var(--text, #333);
    font-size: 12px;
    cursor: pointer;
}
.period-month-label {
    font-weight: bold;
    font-size: 14px;
    color: var(--text, #333);
}

.period-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: 10px;
    color: var(--text-muted, #999);
    margin-bottom: 4px;
}

.period-days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    text-align: center;
}

.period-day {
    padding: 8px 0;
    font-size: 13px;
    color: var(--text, #333);
    border-radius: 50%;
    cursor: pointer;
    transition: background var(--transition, 0.2s);
    position: relative;
    width: 32px;
    height: 32px;
    line-height: 32px;
    margin: 0 auto;
    box-sizing: border-box;
}
.period-day.empty {
    cursor: default;
}
.period-day.today {
    font-weight: bold;
    color: var(--primary, #e896a8);
}
.period-day.period {
    background: var(--primary, #e896a8);
    color: #fff;
}
.period-day.predicted {
    border: 2px dashed var(--primary, #e896a8);
    color: var(--primary, #e896a8);
}
.period-day.ovulation::after {
    content: '💧';
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 8px;
}
.period-day:not(.empty):active {
    transform: scale(0.9);
}

.period-legend {
    display: flex;
    gap: 14px;
    padding: 10px 4px 4px;
    font-size: 10px;
    color: var(--text-muted, #999);
    justify-content: center;
    flex-wrap: wrap;
}
.period-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 2px;
}
.period-dot.today { background: var(--primary, #e896a8); outline: 1px solid var(--primary, #e896a8); outline-offset: 1px; }
.period-dot.period { background: var(--primary, #e896a8); }
.period-dot.predicted { border: 1.5px dashed var(--primary, #e896a8); background: transparent; }
.period-dot.ovulation { background: #4fc3f7; }

/* 记录按钮 */
.period-record-btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, var(--primary, #e896a8), var(--accent, #f5a0b0));
    color: #fff;
    border: none;
    border-radius: var(--radius, 10px);
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    transition: transform var(--transition, 0.2s), box-shadow var(--transition, 0.2s);
}
.period-record-btn:active {
    transform: scale(0.97);
}

/* 近期记录 */
.period-recent {
    padding: 12px;
}
.period-recent-title {
    font-size: 13px;
    font-weight: bold;
    color: var(--text-light, #666);
    margin-bottom: 10px;
}

.period-record-item {
    border-left: 2px solid var(--primary, #e896a8);
    padding-left: 12px;
    margin-bottom: 12px;
}
.period-record-date {
    font-size: 11px;
    color: var(--text-muted, #999);
}
.period-record-body {
    font-size: 13px;
    color: var(--text, #333);
    margin-top: 2px;
}
.period-record-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}
.period-record-tag {
    background: var(--primary-bg, #fff0f0);
    color: var(--primary-dark, #d98092);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
}
.period-record-notes {
    font-size: 11px;
    color: var(--text-muted, #999);
    margin-top: 2px;
}

/* 记录面板 (Modal) */
.period-record-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 85vh;
    background: var(--card-bg, #fff);
    border-radius: 20px 20px 0 0;
    overflow-y: auto;
    animation: periodSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes periodSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}

.period-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light, #f0e0e0);
    font-size: 14px;
    font-weight: bold;
    color: var(--text, #333);
}
.period-panel-cancel {
    border: none;
    background: none;
    font-size: 13px;
    color: var(--text-muted, #999);
    cursor: pointer;
}
.period-panel-save {
    border: none;
    background: none;
    font-size: 13px;
    color: var(--primary, #e896a8);
    font-weight: bold;
    cursor: pointer;
}

.period-panel-body {
    padding: 12px 16px;
}
.period-panel-section {
    margin-bottom: 16px;
}
.period-panel-label {
    font-size: 12px;
    color: var(--text-muted, #999);
    margin-bottom: 8px;
}

/* 经期状态切换 */
.period-toggle-group {
    display: flex;
    gap: 8px;
}
.period-toggle-btn {
    flex: 1;
    padding: 10px;
    border: 1px solid var(--border, #e0e0e0);
    background: var(--card-bg, #fff);
    border-radius: var(--radius-sm, 10px);
    font-size: 13px;
    color: var(--text-light, #666);
    cursor: pointer;
    transition: all var(--transition, 0.2s);
}
.period-toggle-btn.active {
    border-color: var(--primary, #e896a8);
    background: var(--primary-bg, #fff0f5);
    color: var(--primary, #e896a8);
    font-weight: bold;
}

/* 流量选择 */
.period-flow-group {
    display: flex;
    gap: 8px;
}
.period-flow-btn {
    flex: 1;
    padding: 8px;
    border: 1px solid var(--border, #e0e0e0);
    background: var(--card-bg, #fff);
    border-radius: var(--radius-sm, 8px);
    font-size: 11px;
    color: var(--text-light, #666);
    cursor: pointer;
    transition: all var(--transition, 0.2s);
}
.period-flow-btn.selected {
    border-color: var(--primary, #e896a8);
    background: var(--primary-bg, #fff0f5);
    color: var(--primary, #e896a8);
    font-weight: bold;
}

/* 症状标签 */
.period-symptom-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.period-symptom-tag {
    background: var(--bg, #f5f5f5);
    color: var(--text-light, #666);
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 11px;
    cursor: pointer;
    transition: all var(--transition, 0.2s);
    border: 1px solid transparent;
}
.period-symptom-tag.selected {
    background: var(--primary-bg, #fff0f0);
    color: var(--primary-dark, #d98092);
    border-color: var(--primary, #e896a8);
}

/* 备注 */
.period-panel-notes {
    width: 100%;
    height: 56px;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-sm, 10px);
    padding: 10px;
    font-size: 12px;
    resize: none;
    box-sizing: border-box;
    font-family: var(--font, inherit);
    color: var(--text, #333);
    background: var(--card-bg, #fff);
}
.period-panel-notes:focus {
    outline: none;
    border-color: var(--primary, #e896a8);
    box-shadow: 0 0 0 3px rgba(232, 150, 168, 0.15);
}
.period-panel-notes::placeholder {
    color: var(--text-muted, #999);
}
```

- [ ] **Step 2: 更新 mobile.css 缓存版本号**

修改 `index-mobile.html` 中的引用：
```
mobile.css?v=72 → mobile.css?v=73
```

- [ ] **Step 3: 提交样式**

```bash
git add mobile.css index-mobile.html
git commit -m "feat: add period tracker mobile styles"
```

---

### Task 6: 验证

- [ ] **Step 1: 检查所有修改文件**

```bash
git diff --stat HEAD~5
```
确认修改了 4 个文件：`migrations/013_period_daily.sql`（新）、`index-mobile.html`、`mobile-app.js`、`mobile.css`

- [ ] **Step 2: 验证清单**
  - [ ] 首页 2x3 卡片中"相册"已替换为"周期追踪"
  - [ ] 照片页顶部出现"📸 相册"按钮
  - [ ] 点击"周期追踪"卡片 → 进入日历页面
  - [ ] 月历正常渲染，经期日粉红实心，预测日虚线
  - [ ] 点击日期或"记录今天"→ 弹出底部面板
  - [ ] "经期中"切换后出现流量选项
  - [ ] 症状标签可多选
  - [ ] 保存后日历和记录列表即时更新
  - [ ] 前后翻月正常
  - [ ] 返回按钮回到首页
