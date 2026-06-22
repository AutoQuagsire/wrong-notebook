# CURRENT SYSTEM AUDIT — 错题本 (Wrong Notebook)

**审计日期**: 2026-06-20
**分支**: `feat/kaoyan-review-system`
**审计范围**: 只读，不修改业务代码和数据库

---

## 1. 技术栈概览

| 层级 | 技术 |
|------|------|
| 框架 | Next.js (App Router) |
| 数据库 | SQLite + Prisma ORM |
| 认证 | NextAuth.js (Credentials + JWT) |
| AI | Gemini / OpenAI / Azure OpenAI (可切换) |
| 前端 | React 18 + Tailwind CSS + shadcn/ui + Recharts |
| 测试 | Vitest (单元+集成) + Playwright (E2E) |
| 图片存储 | Base64 内联存储在 `ErrorItem.originalImageUrl` |

---

## 2. 数据模型 (Prisma Schema)

```
User ──┬── ErrorItem[] ──┬── KnowledgeTag[] (多对多 via tags)
       │                  ├── ReviewSchedule[]
       │                  └── Subject? (多对一)
       ├── Subject[]
       ├── PracticeRecord[]
       └── KnowledgeTag[] (自定义标签)
```

### 关键字段速查

| 模型 | 关键字段 | 说明 |
|------|----------|------|
| `ErrorItem` | `masteryLevel` Int @default(0) | 0=New, 1=Reviewing, 2=Mastered |
| `ErrorItem` | `knowledgePoints` String? | [DEPRECATED] JSON字符串, 保留用于迁移 |
| `ErrorItem` | `tags KnowledgeTag[]` | **当前使用** 的多对多标签关联 |
| `ErrorItem` | `originalImageUrl` String | Base64 图片数据 |
| `ReviewSchedule` | `scheduledFor`, `completedAt`, `isCorrect` | 艾宾浩斯复习计划 |
| `PracticeRecord` | `subject`, `difficulty`, `isCorrect` | 练习记录 |
| `KnowledgeTag` | `parentId`, `isSystem`, `userId` | 无限层级标签树 |

---

## 3. 错题创建调用链

### 路径 A：拍照上传（主流程）

```
主页 UploadZone 组件
  → ImageCropper (裁剪)
  → handleAnalyze(file)
    → processImageFile(file)                          // 压缩为 Base64
    → POST /api/analyze { imageBase64, language, subjectId }
      → getAIService().analyzeImage(...)              // AI 识别图片
      → 返回 ParsedQuestion
  → CorrectionEditor (用户审阅/修改)
  → handleSave(finalData)
    → POST /api/error-items { questionText, answerText, analysis, knowledgePoints, originalImageUrl, subjectId, ... }
      → prisma.errorItem.create({ ... })             // 含去重检查(2秒窗口)
      → 遍历 knowledgePoints: findFirst or create KnowledgeTag → connect
      → 返回 ErrorItem
```

**文件链路**:
- `src/app/page.tsx:105-293` — 主页面，三种输入模式
- `src/components/upload-zone.tsx` — 图片上传组件
- `src/components/image-cropper.tsx` — 裁剪组件
- `src/lib/image-utils.ts:9-74` — 图片压缩 (canvas → Base64)
- `src/app/api/analyze/route.ts:13-157` — AI 分析 API
- `src/components/correction-editor.tsx` — 审阅编辑器
- `src/app/api/error-items/route.ts:14-206` — 创建 ErrorItem API

### 路径 B：AI 解题（文字输入）

```
主页 TextInputZone
  → handleTextSubmit(questionText)
    → POST /api/reanswer { questionText, language, subject }
      → getAIService().reanswerQuestion(...)          // AI 解答
      → 返回 { answerText, analysis, knowledgePoints, ... }
  → CorrectionEditor
  → POST /api/error-items
```

**文件链路**:
- `src/components/text-input-zone.tsx` — 文字输入组件
- `src/app/api/reanswer/route.ts:10-63` — AI 解题 API

### 路径 C：直接录入

```
主页 DirectTextEditor
  → handleDirectSave(data)
    → POST /api/error-items { questionText, answerText, analysis, knowledgePoints, ... }
```

**文件链路**:
- `src/components/direct-text-editor.tsx` — 直接录入组件

---

## 4. 标签关联流程

```
ErrorItem 创建时传入 knowledgePoints: string[]
  → 对每个 tagName:
    ① prisma.knowledgeTag.findFirst({ name, OR: [isSystem, userId] })
    ② 不存在 → findParentTagIdForGrade(gradeSemester, subjectKey)
                → prisma.knowledgeTag.create({ name, subject, parentId, userId })
    ③ tagConnections.push({ id: tag.id })
  → prisma.errorItem.create({ tags: { connect: tagConnections } })
  → 同时写入 knowledgePoints = JSON.stringify(tagNames)  // 保留兼容
```

**文件链路**:
- `src/app/api/error-items/route.ts:112-156` — 创建时标签处理
- `src/app/api/error-items/[id]/route.ts:121-176` — 更新时标签处理
- `src/lib/tag-recognition.ts` — `findParentTagIdForGrade()`
- `src/lib/knowledge-tags.ts` — `inferSubjectFromName()`

---

## 5. 练习流程（现有）

### 5.1 "开始练习" 流程

```
错题详情页 /error-items/{id}
  → 点击 "练习" 按钮 → 导航到 /practice?id={errorItemId}
  → PracticePage 加载
  → 用户选择难度 (easy/medium/hard/harder)
  → 点击 "生成题目" → generateQuestion()
    → POST /api/practice/generate { errorItemId, language, difficulty }
      → prisma.errorItem.findUnique({ include: subject })
      → 解析 knowledgePoints JSON → tags[]
      → getAIService().generateSimilarQuestion(questionText, tags, language, difficulty, gradeSemester)
      → 注入 subject (从数据库获取)
      → 返回 ParsedQuestion
  → 显示题目
```

**文件链路**:
- `src/app/error-items/[id]/page.tsx:427-431` — "练习" 按钮
- `src/app/practice/page.tsx:52-93` — `generateQuestion()`
- `src/app/api/practice/generate/route.ts:11-57` — 生成相似题 API
- `src/lib/ai/types.ts` — `AIService.generateSimilarQuestion()`

### 5.2 "提交结果" 流程

```
练习页用户输入答案 → 点击 "提交答案" → submitAnswer()
  → 本地比较答案 (normalize + enhanced comparison)
  → 显示正确/错误结果
  → POST /api/practice/record { subject, difficulty, isCorrect }
    → prisma.practiceRecord.create({ userId, subject, difficulty, isCorrect })
    → 返回 PracticeRecord
```

**关键发现**: PracticeRecord 只关联了 User，**没有关联 ErrorItem**！
- 无法知道是对哪个错题的练习
- `subject` 字段是自由文本字符串，不是外键

**文件链路**:
- `src/app/practice/page.tsx:95-126` — `submitAnswer()`
- `src/app/api/practice/record/route.ts:10-37` — 保存练习记录 API

---

## 6. masteryLevel 更新

```
错题详情页 → 点击 "已掌握" 切换按钮 → toggleMastery()
  → PATCH /api/error-items/{id}/mastery { masteryLevel: 0|1 }
    → 验证所有权
    → prisma.errorItem.update({ masteryLevel })
    → 返回更新后的 ErrorItem
```

**当前状态**:
- `masteryLevel` 只有两个值被使用: 0 (未掌握) 和 1 (已掌握)
- Schema 定义是 Int @default(0)，注释写 0=New, 1=Reviewing, 2=Mastered
- 但 `/api/error-items/[id]/mastery` 仅做 toggle (0↔1)，值 2 从未使用
- **与练习流程完全独立** — 练习不更新 masteryLevel

**文件链路**:
- `src/app/error-items/[id]/page.tsx:131-143` — `toggleMastery()`
- `src/app/api/error-items/[id]/mastery/route.ts:10-59` — mastery PATCH API

---

## 7. ReviewSchedule 使用情况

### 结论：ReviewSchedule **完全没有参与** 现有业务逻辑

| 文件 | 使用方式 |
|------|----------|
| `src/lib/scheduler.ts` | 定义了 `calculateNextReviewDate()` 和 `getReviewStageDescription()`，但 **从未被调用** |
| `src/app/api/export/route.ts:54-58` | 导出时读取 reviewSchedules |
| `src/app/api/import/route.ts:301-323` | 导入时写入 reviewSchedules |
| `src/components/settings-dialog.tsx:404,443` | 显示 reviewSchedulesCreated 统计数字 |

- 没有 API 创建 ReviewSchedule
- 没有 cron job 或定时任务生成 ReviewSchedule
- 没有页面展示或使用 ReviewSchedule 进行复习提醒
- `scheduler.ts` 中的艾宾浩斯间隔 `[1,2,4,7,15,30]` 是死代码

---

## 8. PracticeRecord 完整链路

```
写入:
  练习页 submitAnswer() → POST /api/practice/record → prisma.practiceRecord.create()

读取:
  统计页 PracticeStats → GET /api/stats/practice → prisma.practiceRecord.groupBy/aggregate
  导出 GET /api/export → prisma.practiceRecord.findMany()
  导入 POST /api/import → prisma.practiceRecord.create()
```

**文件链路**:
- `src/app/api/practice/record/route.ts` — 写入
- `src/app/api/stats/practice/route.ts:11-106` — 统计读取
- `src/components/practice-stats.tsx` — 统计展示 (Recharts 图表)
- `src/app/stats/page.tsx` — 统计页面 (含 Tabs: 错题统计 + 练习统计)

---

## 9. 错题浏览 / 列表

```
主页 → 查看错题本 → /notebooks
  → 点击具体错题本 → /notebooks/{id}
    → ErrorList 组件 (分页卡片列表)
      → GET /api/error-items/list?subjectId=&query=&mastery=&timeRange=&tag=&page=&pageSize=
      → 支持筛选: 搜索/掌握状态/时间/年级/章节/试卷等级/知识点标签
      → 多选批量删除
  → 点击单条 → /error-items/{id}
    → GET /api/error-items/{id} (含 tags, subject)
    → 可编辑: 题目/答案/解析/错因/标签/元数据/笔记
    → 可切换掌握状态
```

**文件链路**:
- `src/components/error-list.tsx:41-488` — 错题列表组件
- `src/app/notebooks/[id]/page.tsx` — 错题本详情页
- `src/app/error-items/[id]/page.tsx:51-983` — 错题详情页
- `src/app/api/error-items/list/route.ts:12-285` — 列表 API (含复杂筛选+分页)
- `src/app/api/error-items/[id]/route.ts:13-192` — 单条 GET/PUT API

---

## 10. 数据库管理方式

| 方式 | 状态 |
|------|------|
| Prisma Migrations | **主要方式**。10 个迁移文件在 `prisma/migrations/` |
| `prisma db push` | **备用方式**。新环境无迁移文件时使用 |
| 初始化脚本 | `setup-local.ps1`: 自动检测 migration 存在 → `migrate deploy`，否则 `db push` |
| Seed | `prisma/seed.ts` — 可通过 `npx prisma db seed` 执行 |

**迁移历史**:
```
20251127143435_init
20251129152530_init
20251130150624_add_education_info
20251130161659_init
20251201050917_add_admin_role
20251203155126_cascade_delete_subject_error_items
20251213132347_add_knowledge_tag_model
20251219014445_fix_tag_constraints
20260427090000_add_mistake_analysis_fields
20260608000000_add_geogebra_commands
```

---

## 11. 测试覆盖

### 集成测试 (12 个文件, ~4,800 行)
| 测试文件 | 覆盖内容 |
|----------|----------|
| `error-items.test.ts` (892行) | CRUD + 去重 + 标签关联 + 权限 |
| `practice.test.ts` (529行) | 生成相似题 + 记录结果 + 难度 + 学科注入 |
| `analyze.test.ts` (332行) | AI 图片分析 |
| `reanswer.test.ts` (435行) | AI 文字解题 |
| `notebooks.test.ts` (412行) | 错题本 CRUD |
| `tags.test.ts` (338行) | 标签 CRUD + 统计 |
| `stats.test.ts` (332行) | 练习统计 |
| `user.test.ts` (508行) | 用户资料 |
| `register.test.ts` (254行) | 注册 |
| `settings.test.ts` (249行) | 配置 |
| `analytics.test.ts` (249行) | 分析 |
| `admin-users.test.ts` (299行) | 管理后台 |

### 单元测试 (16 个文件, ~3,300 行)
AI providers (5)、config、prompts、api-errors、auth-utils、logger、middleware、grade-calculator、mistake-status、geogebra、utils、print-preview、reanswer-request、docker/seed-admin

### E2E 测试 (3 个文件)
`auth-flow.spec.ts`, `upload-correction.spec.ts`, `admin-settings.spec.ts`

### 未覆盖的关键功能
- ❌ ReviewSchedule 相关逻辑（因为根本没被使用）
- ❌ masteryLevel 更新流程
- ❌ 图片存储/压缩（仅前端压缩，无后端测试）
- ❌ 艾宾浩斯复习调度（scheduler.ts 无调用）

---

## 12. 关键发现总结

### 已有基础设施（可复用）
1. ✅ 错题创建（3 种输入方式：拍照/AI解题/直接录入）
2. ✅ 标签系统（无限层级 KnowledgeTag + 多对多关联）
3. ✅ AI 集成（3 种 Provider 可切换，已实现 analyzeImage / generateSimilarQuestion / reanswerQuestion）
4. ✅ 练习页面（生成相似题 + 提交答案 + 记录）
5. ✅ 统计页面（练习统计：正确率/科目分布/月度趋势/难度分布）
6. ✅ 用户认证（NextAuth JWT + 注册/登录）

### 断层/缺失（待建设）
1. ❌ **ReviewSchedule 完全是空壳** — 表存在，工具函数写了，但没有任何业务代码使用
2. ❌ **PracticeRecord 未关联 ErrorItem** — 只知道做了什么练习，不知道练的是哪个错题
3. ❌ **masteryLevel 与练习脱节** — 练习结果不更新 masteryLevel，需手动切换
4. ❌ **没有复习提醒机制** — 没有定时任务/cron job 来生成或触发复习
5. ❌ **`knowledgePoints` 字段已废弃但仍在使用** — 部分代码仍读 JSON，与 `tags` 关系并存
6. ❌ **图片以 Base64 存储在 DB** — 长期可能导致 DB 膨胀
7. ❌ **没有 "review session" / "复习轮次" 概念** — 练习是一次性的，没有按艾宾浩斯曲线排程
