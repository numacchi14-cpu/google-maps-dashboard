// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getWishlistRemovedCandidates, places } = require("../app.js");

function place(overrides) {
  return {
    id: "id1",
    name: "テスト店",
    url: "https://maps.google.com/?cid=1",
    source: "行きたいリスト",
    wishlistListName: "行ってみたい",
    rating: null,
    comment: "",
    ...overrides
  };
}

test("getWishlistRemovedCandidates: 今回のCSVに存在しないリスト由来のスポットを候補にする", () => {
  places.length = 0;
  places.push(place({ id: "p1", url: "https://maps.google.com/?cid=1" }));
  places.push(place({ id: "p2", url: "https://maps.google.com/?cid=2" }));

  // p1のURLだけが今回のCSVに存在する = p2はリストから外れたと判定される
  const matchKeysByListName = new Map([["行ってみたい", new Set(["https://maps.google.com/?cid=1"])]]);
  const candidates = getWishlistRemovedCandidates(matchKeysByListName);

  assert.deepEqual(candidates.map(p => p.id), ["p2"]);
});

test("getWishlistRemovedCandidates: 既に評価/クチコミが付いた「行きたい→行った」スポットは対象外", () => {
  places.length = 0;
  places.push(place({ id: "p1", url: "https://maps.google.com/?cid=1", rating: 4 }));
  places.push(place({ id: "p2", url: "https://maps.google.com/?cid=2", comment: "美味しかった" }));

  const matchKeysByListName = new Map([["行ってみたい", new Set()]]); // どちらも今回のCSVには無い
  const candidates = getWishlistRemovedCandidates(matchKeysByListName);

  assert.equal(candidates.length, 0);
});

test("getWishlistRemovedCandidates: source が「行きたいリスト」以外（手動追加等）は対象外", () => {
  places.length = 0;
  places.push(place({ id: "p1", url: "https://maps.google.com/?cid=1", source: "手動入力" }));

  const matchKeysByListName = new Map([["行ってみたい", new Set()]]);
  const candidates = getWishlistRemovedCandidates(matchKeysByListName);

  assert.equal(candidates.length, 0);
});

test("getWishlistRemovedCandidates: 今回インポートしていない別のリストのスポットは対象外", () => {
  places.length = 0;
  places.push(place({ id: "p1", url: "https://maps.google.com/?cid=1", wishlistListName: "今度行きたい店" }));

  // 今回インポートしたのは「行ってみたい」のみ
  const matchKeysByListName = new Map([["行ってみたい", new Set()]]);
  const candidates = getWishlistRemovedCandidates(matchKeysByListName);

  assert.equal(candidates.length, 0);
});

test("getWishlistRemovedCandidates: 今回のCSVにも存在するスポットは候補にしない", () => {
  places.length = 0;
  places.push(place({ id: "p1", url: "https://maps.google.com/?cid=1" }));

  const matchKeysByListName = new Map([["行ってみたい", new Set(["https://maps.google.com/?cid=1"])]]);
  const candidates = getWishlistRemovedCandidates(matchKeysByListName);

  assert.equal(candidates.length, 0);
});
