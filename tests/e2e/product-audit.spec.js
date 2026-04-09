import { test, expect } from "@playwright/test";

test("main product smoke flow keeps guest gating visible", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("sanmao-state");
  });

  let guestStarted = false;
  let likedUserIds = [];
  let activeMessages = [
    { sender_id: 1001, content: "你好，看到你也在深圳。", created_at: "2026-04-05T00:00:00" }
  ];

  const buildState = () => ({
    viewer: {
      authenticated: guestStarted,
      status: guestStarted ? "partial" : "visitor",
      is_guest: guestStarted
    },
    profile: guestStarted
      ? {
          user_id: 9001,
          username: "guest9001",
          name: "体验用户",
          gender: "male",
          city: "深圳",
          company: "",
          role: "",
          school: "",
          tags: "",
          bio: "",
          profile_completed: false
        }
      : null,
    discover: [
      {
        user_id: 1001,
        name: "林清禾",
        age: 23,
        gender: "female",
        city: "深圳",
        company: "腾讯",
        role: "产品经理",
        school: "中山大学",
        avatar_url: "",
        tags: ["散步", "咖啡"],
        bio: "慢热，但愿意认真认识人。",
        prompt: "如果第一次见面不尴尬，我会想一起散步。"
      }
    ].filter((item) => !likedUserIds.includes(item.user_id)),
    liked: [],
    liked_by: [],
    matches: guestStarted
      ? [
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
      : []
  });

  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildState())
    });
  });

  await page.route("**/api/guest/start", async (route) => {
    guestStarted = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route("**/api/like", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    likedUserIds.push(Number(body.target_user_id));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, matched: true })
    });
  });

  await page.goto("/index.html");

  await expect(page.locator("text=今天还可以看 30 份资料")).toBeVisible();
  await expect(page.locator("text=林清禾，23")).toBeVisible();

  await page.locator('[data-action="like-user"][data-user-id="1001"]').click();
  await expect(page.locator("text=第一次喜欢之前")).toBeVisible();
  await page.locator("select[name='gender']").selectOption("male");
  await page.locator("input[name='name']").fill("体验用户");
  await page.getByRole("button", { name: "继续喜欢" }).click();

  await page.getByRole("button", { name: "消息" }).click();
  await expect(page.locator("text=AI 恋爱助手")).toBeVisible();
  await expect(page.locator("text=先去“我的”里补完整资料，再回来发第一条消息。")).toBeVisible();
  await expect(page.getByRole("button", { name: "去补资料" })).toBeVisible();
  await expect(page.locator("#chat-input")).toHaveCount(0);
});
