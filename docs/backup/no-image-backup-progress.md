# wrong-notebook 无图片异地备份进度记录

- 状态日期：2026-07-12
- 文档性质：阶段性进度记录
- 当前状态：代码已合并，尚未生产安装或运行
- 主分支 commit：`82dd5c423b736d05fa3facf3f66d2e15acf321aa`
- 当前已知生产版本：`f756135325f0004d84f0e1106c68c493f2a760a8`

## 1. 项目目标

- 本项目要解决的核心问题，是避免服务器磁盘、云盘副本或 SQLite 文件意外损坏后，整站结构化业务数据无法恢复。
- 最终异地备份的落点不是生产服务器，也不是公开网盘，而是用户个人 Windows 电脑。
- Windows 端的后续方案定位为主动拉取：通过 SSH/SFTP 从服务器下载可分发备份包，而不是由服务器主动推送。
- 最终异地备份不得包含任何图片数据，包括 Base64、Data URL、图像二进制、上传目录或图片附件。
- 因此，本方案不是“原始整库镜像备份”，也不是把生产数据库原样复制到个人电脑。
- 本方案的准确定位是：**无图片整站结构化数据异地备份**。

## 2. 核心业务约束

- 不允许将原始 `production.db` 作为最终异地备份文件。
- 不允许下载 `production.db-wal` 或 `production.db-shm` 到个人电脑。
- 不允许最终备份包包含 `uploads/`、图片目录、附件目录、Base64、Data URL 或任何图像二进制。
- 当前已确认的持久化图片字段包括：
  - `ErrorItem.originalImageUrl`
  - `PracticeRecord.answerImageUrl`
- 脱敏后的目标值定义为：
  - `ErrorItem.originalImageUrl = ''`
  - `PracticeRecord.answerImageUrl = NULL`
- 最终数据库必须从“已脱敏的临时副本”通过 `VACUUM INTO` 重新生成，不能直接分发只做过 `UPDATE` 的旧副本。
- 这样做的原因是 SQLite 空闲页中可能残留已删除图片数据，不能把仅执行过字段清空的旧文件作为最终分发件。
- 最终 `manifest.json` 必须显式声明：
  - `imagesExcluded: true`

## 3. 生产环境只读核验结论

以下内容来自此前的只读核验结论，用于明确当前生产基础，不代表本次已经安装或启用无图片备份：

- 应用服务：`wrong-notebook.service`
- 工作目录：`/var/www/wrong-notebook/.next/standalone`
- 生产数据库：`/var/www/wrong-notebook/prisma/production.db`
- 数据库 owner/group：`root:root`
- 当前 SQLite：`3.45.1`
- journal mode：`delete`
- `PRAGMA quick_check;`：`ok`
- 当前 `app-config.json`：不存在
- 当前生产已有完整备份脚本：`/opt/wrong-notebook/backup.sh`
- 当前完整备份目录：`/var/backups/wrong-notebook`
- 当前定时任务：`/etc/cron.d/wrong-notebook-backup`
- 运行时间：每天 `03:30`
- 当前完整备份使用 `sqlite3 .backup`
- 当前完整备份仍会保留含图片的完整 `production.db` 和 SQL dump
- 当前历史目录中还存在多个部署前原始数据库副本
- 现有完整备份链路尚未修改或清理

本文档不记录生产 IP、SSH 参数、密码、密钥或任何 secret。

## 4. 已完成的代码实现

已完成并合并到主分支的代码变更如下：

- PR：`#30 feat: add no-image backup generator`
- 合并 commit：`82dd5c423b736d05fa3facf3f66d2e15acf321aa`

新增文件：

- `scripts/backup/create-no-images-backup.sh`
- `scripts/backup/test-create-no-images-backup.sh`
- `scripts/backup/README.md`
- `scripts/backup/RESTORE-NO-IMAGES.md`

当前已合并的生成流程为：

```text
只读打开生产 SQLite
→ sqlite3 .backup 生成一致性临时快照
→ 仅在临时快照中清空图片字段
→ VACUUM INTO 生成全新的无图数据库
→ SQL、SQLite、结构和图片签名校验
→ 生成 manifest.json 和 SHA256SUMS
→ 生成 tar.gz.part
→ 生成 sidecar.part
→ 发布正式 tar.gz
→ 最后发布 .tar.gz.sha256 作为完成标志
→ 清理临时含图快照和半成品
```

当前脚本与文档已覆盖的关键实现点包括：

- 只对临时快照做脱敏，不触碰源库
- 使用 `VACUUM INTO` 生成最终无图片 SQLite
- 校验最终库中不再出现 `data:image/` 等图片签名
- 输出 `manifest.json`、`SHA256SUMS` 和 sidecar
- 以 `.tar.gz.sha256` 作为“完整发布完成”标志
- 失败时清理 `.part` 半成品，并在需要时撤回孤立正式 archive

## 5. 当前尚未完成的事项

截至 2026-07-12，以下工作**尚未开始实施到生产环境**：

- 尚未在生产服务器安装或执行 `create-no-images-backup.sh`
- 尚未对真实生产数据库运行无图片备份生成
- 尚未创建专用生产输出目录或临时目录
- 尚未配置受限 SSH/SFTP 拉取账户
- 尚未编写 Windows 端拉取脚本
- 尚未配置 Windows 计划任务
- 尚未建立异地备份保留策略和轮转策略
- 尚未对生产历史含图完整备份做清理或迁移

因此，当前状态仍然是：**代码已合并，但生产侧无图片异地备份链路尚未落地。**

## 6. 当前边界与风险

### 已明确的边界

- 现有生产 `backup.sh` 仍是完整备份方案，继续保留图片数据。
- `create-no-images-backup.sh` 是单独的新链路，不替代现有完整备份。
- 当前生产环境尚未部署 PR #30，因此线上机器还不能直接使用该脚本。
- 当前异地备份方案只针对“结构化数据”，不承诺恢复任何图片内容。

### 已接受但未消除的风险

- 尚无真实 Linux 临时环境下的 symlink / permission / PATH 全链路动态验证证据。
- 当前结构比较对 index 主要比较名称，尚未扩展为完整 SQL 定义逐项比较。
- 测试故障注入开关仅用于测试，但仍需在后续生产安装时注意使用边界。

### 现阶段绝不能误解的点

- “代码已合并”不等于“功能已上线”。
- “服务器已有完整备份”不等于“已经有无图片异地备份”。
- “可以生成无图片备份包”不等于“Windows 端已经能自动拉取”。

## 7. 下一阶段入口

下一阶段必须单独授权，建议按以下顺序推进：

1. **隔离的真实 Linux 临时环境验证**
   - 不使用生产服务器
   - 不使用真实 `production.db`
   - 验证脚本在真实 Linux 文件权限、目录权限、符号链接和 PATH 环境下的行为

2. **生产服务器安装准备**
   - 仅在确认 Linux 临时验证通过后，评估生产上的目录、权限和执行账号
   - 不修改现有完整备份链路

3. **Windows 拉取方案设计**
   - 设计专用 SSH/SFTP 拉取方式
   - 约束最终下载目录、校验方式和保留策略

4. **人工演练恢复**
   - 用脱敏包验证文本数据恢复
   - 确认图片字段为空时应用页面不崩溃

在没有单独授权之前，不应自动进入上述任何阶段。

## 8. 下一阶段执行前的最小检查清单

正式进入下一阶段前，至少应重新确认：

- 生产当前版本是否已包含 PR #30 合并提交
- 生产服务器上是否已经具备合适的临时目录和输出目录
- 应用是否能够在图片字段为空时正常渲染错题详情、练习记录和知识点记录
- 是否明确区分“服务器侧完整备份”与“个人电脑异地无图片备份”
- 是否已确认 Windows 端不会保存原始整库或任何图片数据

## 9. 当前结论

- 无图片异地备份的**代码实现阶段**已经完成，并已合并到主分支。
- 无图片异地备份的**生产安装与实际运行阶段**尚未开始。
- 当前生产环境仍停留在：有完整含图备份、无最终无图片异地拉取包。
- 后续所有上线、安装、验证和 Windows 拉取动作，都需要单独授权后再执行。
