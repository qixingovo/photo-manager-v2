# 周期追踪功能设计文档

## 概述

为移动端添加月经周期追踪功能，支持日历视图记录经期、症状标签、流量强度、备注，自动预测下次经期和排卵日。仅移动端，双方可见。

## 平台范围

- **仅移动端** (`index-mobile.html` + `mobile-app.js` + `mobile.css`)
- 桌面端不变

## 功能需求

### 1. 首页卡片

- 替换现有"相册"卡片，用"周期追踪"替代
- 首页卡片布局保持 2x3（2列3行）
- 卡片显示：当前周期阶段、第几天、预计下次经期日期、剩余天数
- 相册功能入口移到"照片"页面顶部，添加"📸 相册"按钮

### 2. 日历页面 (`periodTrackerPage`)

- **顶部状态条**：渐变背景（暖粉色），显示当前周期阶段（经期/卵泡期/黄体期）、第几天、预计下次经期日期、剩余天数
- **月历**：标准月历，支持前后翻月
  - 经期日：粉色实心圆标记
  - 预测下次经期日：粉色虚线圈
  - 排卵日：水滴图标标记
- **"记录今天"按钮**：暖粉渐变按钮
- **近期记录列表**：时间线样式，显示日期、流量、症状标签、备注

### 3. 记录面板（底部弹窗）

点击日历日期或"记录今天"触发，分为两种模式：

**经期日模式**（is_period=true）：
- 经期状态切换：经期中 / 干净（单选）
- 流量强度：少/中/多（三选一，仅在"经期中"时显示）
- 症状标签：痛经、疲劳、情绪波动、头痛、腰酸、食欲变化、焦虑、失眠、排卵期（多选）
- 备注文本框

**非经期日模式**（is_period=false）：
- 经期状态切换（同上，默认"干净"）
- 症状标签（同上）
- 备注文本框

交互：取消/保存按钮，保存后关闭面板并刷新日历和记录列表。

### 4. 周期预测

- 从历史记录提取每个经期段（连续 is_period=true 的日期）
- 取最近 3 个经期间隔的平均值作为预测周期长度
- 预测下次经期开始日 = 最近经期开始日 + 平均周期
- 预测排卵日 = 下次经期日 - 14 天
- 首次使用（少于 2 次经期记录）使用默认 28 天周期

### 5. 隐私

- 双方可见，无需额外权限控制

## 数据模型

### 新建表：`period_daily_records`

```sql
CREATE TABLE IF NOT EXISTS period_daily_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    record_date DATE NOT NULL,
    is_period BOOLEAN DEFAULT FALSE,
    flow_level INT DEFAULT 0,          -- 0=无, 1=少, 2=中, 3=多
    symptoms TEXT[] DEFAULT '{}',       -- 症状标签数组
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_name, record_date)
);

ALTER TABLE period_daily_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_period_daily" ON period_daily_records
    USING (true) WITH CHECK (true);
```

### 保留旧表

`period_records` 表保留不动（已在 desktop `app.js` 中有引用）。

## UI 设计

### 首页卡片

```
┌──────────────────┐
│  🩸 周期追踪       │
│  当前：卵泡期 第8天 │
│  预计：6月3日      │
│  还有23天          │
└──────────────────┘
```

### 页面路由

- `mobile.switchTab('periodTracker')` → 显示 `#periodTrackerPage`
- 返回按钮路由到 `home`

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `migrations/013_period_daily.sql` | 新建 | 创建 period_daily_records 表 |
| `index-mobile.html` | 修改 | 新增 periodTrackerPage + 调整照片页添加相册入口 + 调整首页卡片 |
| `mobile-app.js` | 修改 | 新增周期追踪全部逻辑 + 调整 FEATURE_CARD_CONFIG |
| `mobile.css` | 修改 | 新增周期追踪样式 |

## 不修改的部分

- 桌面端所有文件（`index.html`, `app.js`, `style.css`）
- `common.js`
- Supabase 其他表结构
- 照片、打卡、心情日记等其他功能模块

## 验证清单

1. 首页卡片从 6 张变为 6 张（相册 → 周期追踪），2x3 布局正常
2. 照片页顶部出现"📸 相册"入口，点击可进入相册列表
3. 点击周期追踪卡片 → 进入日历页面，月历正常渲染
4. 经期日显示粉色实心圆，预测日显示粉色虚线圈
5. 点击"记录今天"或日历日期 → 弹出记录面板
6. 选择"经期中"→ 流量强度选项出现；选择"干净"→ 流量强度隐藏
7. 症状标签可多选，备注可填写
8. 保存后日历和记录列表即时更新
9. 周期预测：有历史数据时正确计算下次经期和排卵日
10. 双方登录均能看到周期追踪数据
