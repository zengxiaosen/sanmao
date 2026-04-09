import { test, expect } from "@playwright/test";

test("sending a message does not jump page back to hero", async ({ page }) => {
  const scrollTelemetry = [];

  await page.addInitScript(() => {
    const seededState = {
      ui: {
        activeTab: "messages",
        activeMatchId: "12"
      },
      local: {
        viewedCount: 0,
        skippedIds: []
      },
      draftMessage: "你好呀"
    };
    window.localStorage.setItem("sanmao-state", JSON.stringify(seededState));

    window.__scrollTelemetry = [];
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      window.__scrollTelemetry.push({
        type: "scrollTo",
        args,
        before: window.scrollY
      });
      return originalScrollTo(...args);
    };
    document.addEventListener(
      "scroll",
      () => {
        window.__scrollTelemetry.push({
          type: "scroll",
          y: window.scrollY
        });
      },
      { passive: true }
    );
  });

  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        viewer: {
          authenticated: true,
          user_id: 99,
          status: "complete",
          is_guest: false
        },
        profile: {
          user_id: 99,
          username: "tester",
          name: "Tester",
          gender: "male",
          age: 28,
          city: "深圳",
          company: "ACME",
          role: "工程师",
          school: "中大",
          tags: "散步/播客",
          bio: "bio",
          profile_completed: true
        },
        discover: [],
        liked: [],
        liked_by: [],
        matches: [
          {
            match_id: 12,
            other: {
              user_id: 1001,
              name: "小雨",
              avatar_url: "",
              company: "A公司",
              role: "设计师",
              city: "深圳",
              prompt: "喜欢慢节奏周末",
              tags: ["散步", "咖啡"]
            },
            assistant: { title: "AI 恋爱助手" },
            messages: [
              { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }
            ]
          }
        ]
      })
    });
  });

  await page.route("**/api/message", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || "{}");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
          { sender_id: 99, content: body.content, created_at: "2026-04-05T00:00:01" }
        ]
      })
    });
  });

  await page.goto("/index.html");
  await expect(page.locator("#chat-form")).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 900));
  const beforeY = await page.evaluate(() => window.scrollY);

  await page.locator("#chat-input").fill("你好呀");
  await page.locator("#chat-input").press("Enter");

  await expect(page.locator(".bubble.mine").last()).toContainText("你好呀");

  const afterY = await page.evaluate(() => window.scrollY);
  scrollTelemetry.push(...(await page.evaluate(() => window.__scrollTelemetry || [])));
  expect(Math.abs(afterY - beforeY), JSON.stringify(scrollTelemetry, null, 2)).toBeLessThan(5);
});
