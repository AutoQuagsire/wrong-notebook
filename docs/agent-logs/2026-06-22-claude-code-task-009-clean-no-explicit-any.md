# 2026-06-22 — Claude Code — TASK-009 清理 pre-existing no-explicit-any lint

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Task
清理 src/ 下所有 pre-existing ESLint `@typescript-eslint/no-explicit-any` 错误（~70 个），改为具体类型或 `unknown`/`Record<string, unknown>`。

## Fixes Applied

### session role 模式 (13 处)
`(session.user as any).role` / `(session?.user as any)?.role` → `session.user.role` / `session?.user?.role`
- next-auth.d.ts 已通过 module augmentation 提供 `role?: string`

### 外部/浏览器 API (7 处)
- `(window as any).GGBApplet` → `(window as Record<string, unknown>).GGBApplet`
- `apiRef.useRef<any>()` → `useRef<Record<string, unknown> | null>()`
- `(displayMediaOptions as any)` → `(displayMediaOptions as Record<string, unknown>)`
- `(settings as any).displaySurface` → `(settings as Record<string, unknown>).displaySurface`
- `controller?: any` → `controller?: CaptureController | null`

### API/翻译 (10 处)
- `(t.errors as any)` → `(t.errors as Record<string, string>)`
- `(t.tags?.subjects as any)` → `(t.tags?.subjects as Record<string, string>)`
- `(response as any).stats` → 泛型类型 `post<{ stats: Record<string, number> }>(...)`
- `(res as any).count` → 泛型类型 `post<{ count: number }>(...)`
- `(result.mistakeStatus as any)` → `(result.mistakeStatus as string)`

### catch error (17 处)
`catch (error: any)` → `catch (error: unknown)`

### 测试 mock (8 处)
- `} as any)` → `} as import("next-auth").Session)` / `} as import("@/types/api").AppConfig)`
- `args: any` → 内联具体类型
- `(s: any)` → `(s: { name: string; value: number })`

### 类型参数 (15 处)
- `t: any` → `Record<string, Record<string, string>>`
- `content: any` → `content: unknown`
- `any[]` → 具体接口类型
- `updateData: any` → `Record<string, unknown>`
- `whereCondition: any` → `Record<string, unknown>`
- `TBody = any` → `TBody = unknown`

### Record<string, any> → Record<string, unknown> (7 处)

## Files Changed (29 files)
覆盖 src/app/api/, src/app/, src/components/, src/lib/, src/__tests__/

## Tests Run
- `npx prisma validate`: passed
- `npx eslint src/ --ext .ts,.tsx`: **0 no-explicit-any errors** (was ~70)
- `npm test`: 37 files, 634 tests passed

## Remaining Lint Issues
- 93 warnings (pre-existing: `<img>`, unused vars, react-hooks/exhaustive-deps)
- No errors in src/ (excluding scripts/ and e2e/)

## Database Changes
- None

## Risks
- None

## Ready to Commit
- Yes
