# AGENTS.md

本项目基于 `wttwins/wrong-notebook`（考研错题复习系统）渐进改造。
目标：在保留现有错题录入、AI识题、相似题练习、标签和统计功能的基础上，逐步增加原题复习、FSRS调度和每日任务。

## 1. Core Rules

- 不要重写项目、不要新建第二套独立题库、不要把项目扩展成通用教育平台。
- 每次只完成一个明确任务，不做无关重构、全局格式化、依赖升级或目录大调整。
- 发现额外问题时只写入完成报告的 Follow-ups，不要顺手修。

## 2. Data Entity Facts

- `ErrorItem` 是核心错题实体。不要新建平行的 `StudyItem` 表，除非任务明确要求。
- `PracticeRecord` 是统一作答记录表：
  - `practiceType = "SIMILAR_QUESTION"` 表示 AI 生成相似题练习。
  - `practiceType = "ORIGINAL_REVIEW"` 表示原错题重做。
- `ReviewSchedule` 是未接入业务的旧表，不作为新复习调度核心。
- `masteryLevel` 暂不由一次练习自动更新。
- `knowledgePoints` 是兼容字段，当前标签系统以 `KnowledgeTag` 多对多关系为主。
- 图片当前以 Base64 存储在 `ErrorItem.originalImageUrl`，暂不迁移。

## 3. Rendering

- Markdown/LaTeX 渲染基于 `MarkdownRenderer`（react-markdown + remark-math + rehype-katex）。
- 应复用于编辑预览、详情页、练习页和复习页。
- `normalizeMathDelimiters()` 将 AI 输出的 `\(...\)`/`\[...\]` 归一化为 KaTeX 格式。
- AI 输出格式要求：先结论 → 关键依据 → 必要推导 → 易错点；禁止 `\(`、`\[`、`\mathcal`、`\left`、`\right`。

## 4. Review & FSRS Rules

- 四级评分：1=Again 2=Hard 3=Good 4=Easy。`isCorrect` 只是兼容统计字段。
- FSRS 通过独立适配层 (`src/lib/fsrs/adapter.ts` → `service.ts`) 接入，页面和 API 不得直接散落调用 FSRS 第三方库。
- 只有 `ORIGINAL_REVIEW` 驱动 FSRS 状态更新。`SIMILAR_QUESTION` 可参与统计但不直接改变 FSRS 状态。
- 复习页默认隐藏答案/解析/错因/历史作答，只有点击"查看答案"后才显示。
- 任何 ORIGINAL_REVIEW 保存后，如果 FSRS 算出的 due 仍在当天，则钳制到次日 06:00。错题复习按天调度。
- `ReviewSchedule` 表暂不接入复习流程。
- `masteryLevel` 暂不由一次练习自动更新。

## 5. Current Scope Boundaries

**已完成（v1.x）：**
- `ts-fsrs` 接入与 FSRS 适配层
- 今日复习页面 (`/review/today`) + API (`GET /api/review/today`)
- 原题复习评分 + FSRS 更新 (`POST /api/practice/record` with `practiceType=ORIGINAL_REVIEW`)
- 保存后显示下次复习日期 (`reviewResult.nextReviewAt`)
- 同日 due 钳制到次日 06:00
- 未来 7 天复习预览（按钮 + Dialog 弹窗）

**当前阶段禁止：**
- 接入或扩展 `ReviewSchedule` 作为新复习系统
- 让 AI 直接决定每日选题或自动判定复杂数学推导题正确
- 让 AI 相似题练习直接驱动第一版 FSRS
- 教材知识卡、双模型 Provider 架构、图片存储迁移
- 提醒通知、统计大屏、复杂日历组件

## 6. Data Safety

禁止：`prisma migrate reset`、`prisma db push --force-reset`、`DROP TABLE`、`DROP DATABASE`、`DELETE without precise WHERE`、`git reset --hard`、`git clean -fd`。

修改 Prisma Schema 前必须：确认数据库备份存在、使用向后兼容字段、保留旧数据、运行 Prisma 校验和相关测试。

不提交 `.env`、`prisma/dev.db`、数据库备份、上传图片或 API Key。

## 7. Git & Files

- 修改前先执行 `git status`，不覆盖用户未提交修改，不自动 push。
- 所有文件保持 UTF-8。小改动不要重写整个文件。

## 8. Testing

- 数据模型修改：Prisma validate + migration 相关测试。
- API 修改：相关 integration tests。
- UI 修改：类型检查 + 相关组件测试 + 手动页面验证。
- 调度修改：日期边界、重复提交、事务回滚测试。
- 不得声称运行了未运行的测试、删除失败测试、降低断言强度。

## 9. Completion Report Format

```md
## Result

### Implemented
- ...

### Files Changed
- `path`: reason

### Database Changes
- None / details

### Tests Run
- command: result

### Manual Verification
- ...

### Risks
- ...

### Follow-ups
- ...
```
