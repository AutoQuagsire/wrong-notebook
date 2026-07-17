import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel(/邮箱|Email/).fill("admin@localhost");
    await page.getByLabel(/^密码$|^Password$/).fill("123456");
    await page.getByRole("button", { name: /登录|Login/ }).click();
    await page.waitForURL("**/", { timeout: 15000 });
}

test("knowledge list keeps subject filter and return state", async ({ page }) => {
    test.setTimeout(120000);

    const unique = `knowledge-e2e-${Date.now()}`;
    const subjectAName = `${unique}-高数`;
    const subjectBName = `${unique}-线代`;
    const createdItemIds: string[] = [];
    let subjectAId = "";
    let subjectBId = "";

    await login(page);

    try {
        const subjectAResponse = await page.request.post("/api/notebooks", {
            data: { name: subjectAName },
        });
        expect(subjectAResponse.ok()).toBeTruthy();
        subjectAId = (await subjectAResponse.json()).id as string;

        const subjectBResponse = await page.request.post("/api/notebooks", {
            data: { name: subjectBName },
        });
        expect(subjectBResponse.ok()).toBeTruthy();
        subjectBId = (await subjectBResponse.json()).id as string;

        for (let index = 1; index <= 21; index += 1) {
            const response = await page.request.post("/api/knowledge-items", {
                data: {
                    subjectId: subjectAId,
                    prompt: `${unique} 二重积分 第${index}题`,
                    deck: "第一章",
                    questionType: "DICTATION",
                },
            });
            expect(response.ok()).toBeTruthy();
            createdItemIds.push((await response.json()).id as string);
        }

        const otherSubjectResponse = await page.request.post("/api/knowledge-items", {
            data: {
                subjectId: subjectBId,
                prompt: `${unique} 二重积分 线代题`,
                deck: "第二章",
                questionType: "DICTATION",
            },
        });
        expect(otherSubjectResponse.ok()).toBeTruthy();
        createdItemIds.push((await otherSubjectResponse.json()).id as string);

        await page.goto("/knowledge");
        await page.getByPlaceholder("搜索知识点...").fill(unique);
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}`));

        const subjectCombobox = page.getByRole("combobox", { name: "科目筛选" });
        await subjectCombobox.click();
        await page.getByRole("option", { name: subjectAName }).click();

        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectAId}`));
        await expect(subjectCombobox).toContainText(subjectAName);
        await expect(page.getByText(`${unique} 二重积分 第21题`)).not.toBeVisible();

        await page.getByRole("button", { name: "下一页" }).click();
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectAId}&page=2`));
        await expect(page.getByText(`${unique} 二重积分 第21题`)).toBeVisible();

        await page.getByRole("link", { name: new RegExp(`${unique} 二重积分 第21题`) }).click();
        await expect(page).toHaveURL(new RegExp(`/knowledge/.+returnTo=`));
        await page.getByRole("link", { name: "返回列表" }).click();

        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectAId}&page=2`));
        await expect(page.getByPlaceholder("搜索知识点...")).toHaveValue(unique);
        await expect(page.getByText("第 2 页 / 共 2 页")).toBeVisible();

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectAId}&page=2`));
        await expect(page.getByText(`${unique} 二重积分 第21题`)).toBeVisible();

        await page.getByRole("link", { name: new RegExp(`${unique} 二重积分 第21题`) }).click();
        await expect(page).toHaveURL(new RegExp(`/knowledge/.+returnTo=`));
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectAId}&page=2`));

        await page.goto(`/knowledge?query=${unique}&subjectId=bad-subject&page=2`);
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&page=2$`));
        await expect(subjectCombobox).toContainText("全部科目");

        await subjectCombobox.click();
        await page.getByRole("option", { name: subjectBName }).click();
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}&subjectId=${subjectBId}$`));
        await expect(subjectCombobox).toContainText(subjectBName);
        await expect(page.getByText(`${unique} 二重积分 线代题`)).toBeVisible();

        await subjectCombobox.click();
        await page.getByRole("option", { name: "全部科目" }).click();
        await expect(page).toHaveURL(new RegExp(`/knowledge\\?query=${unique}$`));
        await expect(page.getByText(`${unique} 二重积分 线代题`)).toBeVisible();
    } finally {
        for (const itemId of createdItemIds.reverse()) {
            await page.request.delete(`/api/knowledge-items/${itemId}`);
        }

        if (subjectAId) {
            await page.request.delete(`/api/notebooks/${subjectAId}`);
        }
        if (subjectBId) {
            await page.request.delete(`/api/notebooks/${subjectBId}`);
        }
    }
});
