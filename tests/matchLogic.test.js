import test from "node:test";
import assert from "node:assert/strict";

import {
  appendChatMessage,
  getCurrentCandidate,
  getProfilesByIds,
  getDailyState,
  incrementViews,
  getCandidatesForViewer,
  registerLike,
  getChatThread,
  mergeProfileUpdate
} from "../src/matchLogic.js";

const viewer = {
  id: "u-me",
  gender: "male"
};

const candidates = [
  { id: "u-a", gender: "female" },
  { id: "u-b", gender: "female" },
  { id: "u-c", gender: "male" }
];

const likesMap = {
  "u-a": ["u-me"]
};

const chats = {
  "u-a": [
    { from: "u-a", text: "周末要不要去深圳湾散步？" }
  ]
};

test("getDailyState resets count when date changes", () => {
  const state = getDailyState({ date: "2026-03-27", viewed: 30 }, "2026-03-28");
  assert.deepEqual(state, { date: "2026-03-28", viewed: 0 });
});

test("incrementViews increases viewed count by one", () => {
  const state = incrementViews({ date: "2026-03-28", viewed: 4 });
  assert.equal(state.viewed, 5);
});

test("getCandidatesForViewer only returns opposite gender candidates", () => {
  const result = getCandidatesForViewer(viewer, candidates);
  assert.deepEqual(result.map((item) => item.id), ["u-a", "u-b"]);
});

test("getCurrentCandidate returns the first available candidate", () => {
  const result = getCurrentCandidate(candidates);
  assert.equal(result.id, "u-a");
});

test("getCurrentCandidate returns null for an empty deck", () => {
  const result = getCurrentCandidate([]);
  assert.equal(result, null);
});

test("registerLike reports a match when candidate already likes viewer", () => {
  const result = registerLike({
    viewerId: "u-me",
    candidateId: "u-a",
    likesMap,
    likedIds: []
  });

  assert.equal(result.matched, true);
  assert.deepEqual(result.likedIds, ["u-a"]);
  assert.deepEqual(result.matches, ["u-a"]);
});

test("registerLike does not match when candidate has not liked viewer", () => {
  const result = registerLike({
    viewerId: "u-me",
    candidateId: "u-b",
    likesMap,
    likedIds: []
  });

  assert.equal(result.matched, false);
  assert.deepEqual(result.matches, []);
});

test("getChatThread returns scripted messages for a matched profile", () => {
  const result = getChatThread("u-a", chats);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "周末要不要去深圳湾散步？");
});

test("getChatThread returns an empty array for unknown profile ids", () => {
  const result = getChatThread("u-missing", chats);
  assert.deepEqual(result, []);
});

test("getProfilesByIds preserves requested ordering", () => {
  const profiles = [
    { id: "u-a", name: "A" },
    { id: "u-b", name: "B" },
    { id: "u-c", name: "C" }
  ];

  const result = getProfilesByIds(["u-c", "u-a"], profiles);
  assert.deepEqual(
    result.map((item) => item.id),
    ["u-c", "u-a"]
  );
});

test("appendChatMessage appends a local outgoing message to the thread", () => {
  const result = appendChatMessage({
    chats,
    matchId: "u-a",
    senderId: "u-me",
    text: "那就周末见。"
  });

  assert.equal(result["u-a"].length, 2);
  assert.deepEqual(result["u-a"][1], {
    from: "u-me",
    text: "那就周末见。"
  });
});

test("appendChatMessage trims blank content and keeps original thread", () => {
  const result = appendChatMessage({
    chats,
    matchId: "u-a",
    senderId: "u-me",
    text: "   "
  });

  assert.deepEqual(result, chats);
});

test("mergeProfileUpdate overwrites editable profile fields with trimmed values", () => {
  const result = mergeProfileUpdate(
    {
      id: "demo-user",
      city: "深圳",
      name: "旧昵称",
      bio: "旧介绍"
    },
    {
      name: "  新昵称  ",
      bio: "  新介绍  ",
      city: "  杭州 "
    }
  );

  assert.deepEqual(result, {
    id: "demo-user",
    city: "杭州",
    name: "新昵称",
    bio: "新介绍"
  });
});
