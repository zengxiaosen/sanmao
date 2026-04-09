import { test, expect } from "@playwright/test";

test("profile completion flow returns to messages with gating state visible", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "sanmao-state",
      JSON.stringify({
        ui: {
          activeTab: "messages",
          activeMatchId: "3001"
        },
        local: {
          viewedCount: 1,
          skippedIds: [1001]
        }
      })
    );
  });

  let profileCompleted = false;
  let activeMessages = [
    { sender_id: 1001, content: "你好，看到你也在深圳。", created_at: "2026-04-05T00:00:00" }
  ];

  const buildState = () => ({
    viewer: {
      authenticated: true,
      user_id: 9001,
      status: profileCompleted ? "complete" : "partial",
      is_guest: !profileCompleted
    },
    profile: {
      user_id: 9001,
      username: "guest9001",
      name: "体验用户",
      gender: "male",
      age: profileCompleted ? 25 : "",
      city: "深圳",
      company: profileCompleted ? "ACME" : "",
      role: profileCompleted ? "工程师" : "",
      school: profileCompleted ? "深大" : "",
      tags: profileCompleted ? "散步/咖啡" : "",
      bio: profileCompleted ? "喜欢真实一点的聊天。" : "",
      profile_completed: profileCompleted
    },
    discover: [],
    liked: [],
    liked_by: [],
    matches: [
      {
        match_id: 3001,
        other: {
          user_id: 1001,
          name: "林清禾",
          avatar_url: "",
          company: "腾讯",
          role: "产品经理",
          city: "深圳",
          prompt: "如果第一次见面不尴尬，我会想一起散步。",
          tags: ["散步", "咖啡"]
        },
        assistant: { title: "AI 恋爱助手" },
        demo_mode: true,
        demo_mode_copy: {
          badge: "演示模式",
          description: "这里展示的是冷启动样板对话，用来帮你感受聊天节奏，不是真人在线即时回复。"
        },
        messages: activeMessages
      }
    ]
  });

  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildState())
    });
  });

  await page.route("**/api/profile", async (route) => {
    profileCompleted = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/index.html");

  await expect(page.locator("text=先去“我的”里补完整资料，再回来发第一条消息。")).toBeVisible();
  await expect(page.getByRole("button", { name: "去补资料" })).toBeVisible();
  await expect(page.locator("#chat-input")).toHaveCount(0);

  await page.getByRole("button", { name: "去补资料" }).click();
  await expect(page.getByRole("heading", { name: "体验用户" })).toBeVisible();
  await page.getByRole("button", { name: "编辑资料" }).click();
  await expect(page.locator("form#profile-form")).toBeVisible();

  await page.locator("input[name='age']").fill("25");
  await page.locator("input[name='company']").fill("ACME");
  await page.locator("input[name='role']").fill("工程师");
  await page.locator("input[name='school']").fill("深大");
  await page.locator("input[name='tags']").fill("散步/咖啡");
  await page.locator("textarea[name='bio']").fill("喜欢真实一点的聊天。");
  await page.getByRole("button", { name: "保存资料" }).click();

  await expect(page.locator("form#profile-form")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "消息" })).toBeVisible();
  await expect(page.locator("text=先去“我的”里补完整资料，再回来发第一条消息。")).toBeVisible();
  await expect(page.locator("#chat-input")).toHaveCount(0);
});
