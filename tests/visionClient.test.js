import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIcebreakerPrompt,
  buildVisionRequestBody,
  normalizeIcebreakerResponse,
  generateIcebreakers
} from "../server/visionClient.mjs";
import { chatThreads, defaultProfile, seedProfiles } from "../src/data.js";

test("vision request body includes viewer, candidate, and recent thread context", () => {
  const candidateProfile = seedProfiles[0];
  const recentMessages = chatThreads[candidateProfile.id].slice(0, 2);
  const payload = buildVisionRequestBody({
    viewerProfile: defaultProfile,
    candidateProfile,
    recentMessages
  });

  assert.equal(payload.temperature, 0.8);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].role, "user");
  assert.match(payload.messages[0].content, /我的资料：/);
  assert.match(payload.messages[0].content, /对方资料：/);
  assert.match(payload.messages[0].content, new RegExp(candidateProfile.name));
  assert.match(payload.messages[0].content, /最近聊天记录：/);
  assert.equal(buildIcebreakerPrompt({
    viewerProfile: defaultProfile,
    candidateProfile,
    recentMessages: []
  }).includes('"suggestions"'), true);
});

test("normalizeIcebreakerResponse keeps three clean unique suggestions from json content", () => {
  const result = normalizeIcebreakerResponse({
    content: JSON.stringify({
      suggestions: [
        "  你好呀，看到你也喜欢周末徒步。  ",
        "你好呀，看到你也喜欢周末徒步。",
        "想问问你最近一次看海是在什么时候？",
        "如果周末放松一下，你会更想散步还是喝咖啡？"
      ]
    })
  });

  assert.deepEqual(result.suggestions, [
    "你好呀，看到你也喜欢周末徒步。",
    "想问问你最近一次看海是在什么时候？",
    "如果周末放松一下，你会更想散步还是喝咖啡？"
  ]);
  assert.equal(result.valid, true);
});

test("normalizeIcebreakerResponse falls back to line parsing for bullet lists", () => {
  const result = normalizeIcebreakerResponse({
    output: "1. 想先问问你最近在听什么播客？\n2. 看到你喜欢羽毛球，你平时会固定打吗？\n3. 如果周末 citywalk，你一般会怎么安排？"
  });

  assert.deepEqual(result.suggestions, [
    "想先问问你最近在听什么播客？",
    "看到你喜欢羽毛球，你平时会固定打吗？",
    "如果周末 citywalk，你一般会怎么安排？"
  ]);
  assert.equal(result.valid, true);
});

test("generateIcebreakers marks fallback when provider output is malformed", async () => {
  const result = await generateIcebreakers({
    viewerProfile: defaultProfile,
    candidateProfile: seedProfiles[0],
    recentMessages: [],
    apiUrl: "https://example.com/vision",
    apiKey: "secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output: "只有一句话" })
    })
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.source, "fallback");
});

test("generateIcebreakers returns fallback when env is missing", async () => {
  const result = await generateIcebreakers({
    viewerProfile: defaultProfile,
    candidateProfile: seedProfiles[0],
    recentMessages: [],
    apiUrl: "",
    apiKey: ""
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.source, "fallback");
  assert.deepEqual(result.suggestions, []);
});
