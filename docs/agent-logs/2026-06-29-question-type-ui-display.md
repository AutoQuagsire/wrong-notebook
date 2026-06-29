# TASK-040: questionType UI display and filter

## 日期

2026-06-29

## 目标

补齐 questionType（题型）的前端展示和筛选闭环：错题详情页、列表页展示题型标签，列表页支持按题型过滤。

## 审计发现

- **TypeScript 接口缺失**：`src/types/api.ts` 的 `ErrorItem` 没有 `questionType` 字段，导致前端无法类型安全地访问 API 已返回的数据。
- **中文映射已存在**：`src/lib/question-type.ts` 已有 `QUESTION_TYPE_LABELS`，无需新增。
- **Badge 组件已就绪**：`src/components/ui/badge.tsx` 已在项目中广泛使用。
- **API 层完整**：list / detail / create / update 四个端点均已支持 questionType。
- **仅有录入页展示题型**：`correction-editor.tsx` 下拉框是唯一的 UI 位置。

## 修改文件

### 1. `src/types/api.ts`
- `ErrorItem` 接口新增 `questionType?: string | null`

### 2. `src/app/error-items/[id]/page.tsx`
- 导入 `QUESTION_TYPE_LABELS`、`VALID_QUESTION_TYPES` 和 `QuestionType`
- `ErrorItemDetail` 接口新增 `questionType`
- Question Info 区域新增题型行，用 Badge 显示中文标签（OTHER 弱化为"其他"）
- **第二轮新增**：编辑模式下新增题型 Select 下拉框
- `saveMetadataHandler` PUT body 新增 `questionType`
- `startEditingMetadata` / `cancelEditingMetadata` 初始化/重置 `questionTypeInput`

### 3. `src/components/error-list.tsx`
- 导入 `QUESTION_TYPE_LABELS`、`VALID_QUESTION_TYPES`、`QuestionType`
- 每个卡片 mistakeStatus badge 旁新增题型 outline badge（OTHER 不显示）
- 新增 `questionTypeFilter` state
- 新增题型筛选按钮行（全部题型 / 选择题 / 填空题 / 计算题 / 证明题 / 其他）
- `fetchItems` 和 `handleExportPrint` 传递 questionType 参数给 API
- filter change detection 纳入 questionTypeFilter

### 4. `src/__tests__/unit/question-type.test.ts`（新增）
- 6 个测试覆盖 `VALID_QUESTION_TYPES`、`QUESTION_TYPE_LABELS`、`normalizeQuestionType`

## 未改

- 复习页（review）— 留待后续
- AI prompt/parser — 无需改动
- 数据库 schema — 无需改动
- prisma migration — 未执行新 migration

## 测试结果

- `npx tsc --noEmit`：通过，0 错误
- 单元测试：24 files / 377 tests **全部通过**（含新增 6 tests）
- 全量测试未跑（已知 3 个 integration 文件失败属预存问题）

## 题型展示现状

| 页面 | 状态 |
|------|------|
| CorrectionEditor（录入/编辑） | ✅ 已有下拉框 |
| 错题详情页 error-items/[id] | ✅ Badge 显示 + **编辑模式下 Select 修改** |
| 笔记本/错题列表 ErrorList | ✅ Badge + 筛选 |
| 复习页 review | ❌ 未改 |

## 后续建议

- 复习卡片显示题型标签
- 按题型抽题（例如只复习选择题）
- 按题型统计正确率
- 可考虑对 OTHER 类型做更友好的默认值（当前 AI provider 回退为 CHOICE，reanswer 回退为 OTHER）
