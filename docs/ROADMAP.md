# ROADMAP

当前分支 `feat/kaoyan-review-system` 的阶段任务顺序。

## 已完成

| Task | 描述 | 状态 |
|------|------|------|
| TASK-001 | PracticeRecord 关联 ErrorItem + 扩展字段 | 已完成 |
| TASK-AI-UI-001 | Markdown/LaTeX 渲染与 AI 输出可读性 | 已完成 |

## 待进行（按顺序）

| Task | 描述 |
|------|------|
| TASK-LINT-001 | 只修复当前改动文件中的 lint 问题 |
| TASK-002 | 原错题重做流程：浏览 → 重做原题 → 提交评分 → 写入 PracticeRecord（practiceType=ORIGINAL_REVIEW） |
| TASK-003 | FSRS 状态表与适配层：新建 `FSRSState` 或扩展 ErrorItem，接入 `ts-fsrs` 纯函数 |
| TASK-004 | 评分事务提交：一次评分 → 更新 FSRS 状态 + 写入 PracticeRecord（事务） |
| TASK-005 | 今日复习计划：按 FSRS due 日期筛选 → 生成每日任务列表 → 简单 UI |

## 当前阶段禁止提前做

- 不接入 `ReviewSchedule` 作为调度核心
- 不让 AI 直接决定每日选题
- 不让 AI 相似题练习直接驱动第一版 FSRS
- 不做图片存储迁移（Base64 → 文件系统）
- 不做教材知识卡
- 不做双 Provider 架构
- 不重构整个项目
- 不接入第三方推送/通知服务
