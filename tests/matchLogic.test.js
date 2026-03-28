import test from "node:test";
import assert from "node:assert/strict";

import {
  getDailyState,
  incrementViews,
  getCandidatesForViewer,
  registerLike,
  getChatThread
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
