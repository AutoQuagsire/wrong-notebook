整理成两部分：**你现在立刻执行的修复步骤**，以及以后重装环境可复用的一键初始化脚本。

## 现在先把数据库表建起来

先在运行 `npm run dev` 的终端按：

```powershell
Ctrl + C
```

然后在项目根目录执行：

```powershell
Get-ChildItem .\prisma\migrations
```

### 如果能看到迁移目录

执行：

```powershell
npx prisma migrate deploy
npx prisma validate
npm run dev
```

### 如果提示 `prisma\migrations` 不存在或目录为空

说明仓库没有现成迁移文件。你现在还是全新的空数据库，可以执行：

```powershell
npx prisma db push
npx prisma validate
npm run dev
```

然后重新注册账号。

对于你当前这个报错：

```text
The table `main.User` does not exist
```

上述操作完成后，`User` 等表就会被创建。

---

## 完整的首次初始化顺序

以后在新电脑或重新克隆仓库时，按这个顺序：

```powershell
cd E:\Projects\wrong-notebook

npm install

Copy-Item .env.example .env
```

确保 `.env` 至少有：

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
NEXTAUTH_SECRET="一个随机长字符串"
```

生成随机密钥：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

接着：

```powershell
npx prisma generate
npx prisma migrate deploy
npx prisma validate
npm run dev
```

若仓库没有迁移文件，把 `migrate deploy` 换成：

```powershell
npx prisma db push
```

---

## 一键初始化脚本

我已经整理成 PowerShell 脚本：

[下载 setup-local.ps1](sandbox:/mnt/data/setup-local.ps1)

把它放到：

```text
E:\Projects\wrong-notebook\setup-local.ps1
```

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-local.ps1
```

脚本会自动：

* 检查项目目录和 Node.js
* 检查依赖
* 创建或补全 `.env`
* 自动生成 `NEXTAUTH_SECRET`
* 运行 `prisma generate`
* 优先应用已有 migration
* 没有 migration 且数据库为空时才执行 `db push`
* 运行 Prisma 校验

它不会执行：

```text
prisma migrate reset
npm audit fix --force
删除数据库
升级依赖
```

当前先执行 `Get-ChildItem .\prisma\migrations`，再根据是否存在迁移目录选择 `migrate deploy` 或 `db push`。
