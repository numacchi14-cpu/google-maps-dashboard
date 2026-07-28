// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildFilterMatchersFromValues, placesMatchingFiltersExcept, places } = require("../app.js");

// readCurrentFilterValues()が返す形と同じ、絞り込み無し（空欄）のスナップショット
function emptyValues(overrides) {
  return {
    search: "",
    prefecture: "",
    catGoogle: "",
    catMy: "",
    rating: "",
    wishlistList: "",
    wishlistFulfilledOnly: false,
    dateFrom: "",
    dateTo: "",
    ...overrides
  };
}

function place(overrides) {
  return {
    id: "p1",
    name: "テスト店",
    address: "福岡県福岡市博多区1-1",
    comment: "美味しかった",
    prefecture: "福岡県",
    myPrefecture: null,
    category: "cat_gourmet",
    myCategory: null,
    rating: 5,
    wishlistListName: null,
    publishTime: "2026/01/01",
    ...overrides
  };
}

test("buildFilterMatchersFromValues: prefectureは実効値（マイ都道府県優先）で完全一致", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ prefecture: "福岡県" }));
  assert.equal(matchers.prefecture(place({ prefecture: "福岡県" })), true);
  assert.equal(matchers.prefecture(place({ prefecture: "東京都" })), false);
  // マイ都道府県で上書きされている場合はそちらを優先する
  assert.equal(matchers.prefecture(place({ prefecture: "東京都", myPrefecture: "福岡県" })), true);
});

test("buildFilterMatchersFromValues: catMyは__unset__でマイカテゴリー未設定行にのみ一致する", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ catMy: "__unset__" }));
  assert.equal(matchers.catMy(place({ myCategory: null })), true);
  assert.equal(matchers.catMy(place({ myCategory: "custom_1" })), false);
});

test("buildFilterMatchersFromValues: ratingは完全一致（2026-07-28変更：以前は「N以上」の閾値だった）", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ rating: "4" }));
  assert.equal(matchers.rating(place({ rating: 4 })), true);
  assert.equal(matchers.rating(place({ rating: 5 })), false, "閾値ではなく完全一致なので★5は★4の絞り込みに一致しない");
  assert.equal(matchers.rating(place({ rating: 3 })), false);
});

test("buildFilterMatchersFromValues: ratingは__unset__で未評価（null）の行にのみ一致する", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ rating: "__unset__" }));
  assert.equal(matchers.rating(place({ rating: null })), true);
  assert.equal(matchers.rating(place({ rating: 3 })), false);
});

test("buildFilterMatchersFromValues: wishlistListは__none__でリスト由来ではない行にのみ一致する", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ wishlistList: "__none__" }));
  assert.equal(matchers.wishlistList(place({ wishlistListName: null })), true);
  assert.equal(matchers.wishlistList(place({ wishlistListName: "行ってみたい" })), false);
});

test("buildFilterMatchersFromValues: wishlistFulfilledOnlyは行きたいリスト由来かつ実際に行った（評価かコメントがある）行だけに一致する（2026-07-28実装）", () => {
  const matchers = buildFilterMatchersFromValues(emptyValues({ wishlistFulfilledOnly: true }));
  // 行きたいリスト由来で、評価もコメントも無い（まだ行っていない）→ 一致しない
  assert.equal(matchers.wishlistFulfilled(place({ wishlistListName: "行ってみたい", rating: null, comment: "" })), false);
  // 行きたいリスト由来で、評価がある（実際に行った）→ 一致する
  assert.equal(matchers.wishlistFulfilled(place({ wishlistListName: "行ってみたい", rating: 5, comment: "" })), true);
  // 行きたいリスト由来で、コメントだけある → 一致する
  assert.equal(matchers.wishlistFulfilled(place({ wishlistListName: "行ってみたい", rating: null, comment: "行った" })), true);
  // 行きたいリスト由来ではない（評価はあっても対象外）→ 一致しない
  assert.equal(matchers.wishlistFulfilled(place({ wishlistListName: null, rating: 5 })), false);
});

test("placesMatchingFiltersExcept: 除外した軸の条件は無視し、他の軸には引き続きAND適用する（2026-07-28実装：段階的な絞り込み用）", () => {
  places.length = 0;
  places.push(place({ id: "p1", prefecture: "福岡県", rating: 5 }));
  places.push(place({ id: "p2", prefecture: "東京都", rating: 5 }));
  places.push(place({ id: "p3", prefecture: "福岡県", rating: 3 }));

  const values = emptyValues({ prefecture: "福岡県", rating: "5" });

  // 「評価」軸を除外 → 都道府県=福岡県だけが効き、評価は問わない
  const excludingRating = placesMatchingFiltersExcept(values, ["rating"]);
  assert.deepEqual(excludingRating.map(p => p.id).sort(), ["p1", "p3"]);

  // 「都道府県」軸を除外 → 評価=5だけが効き、都道府県は問わない
  const excludingPrefecture = placesMatchingFiltersExcept(values, ["prefecture"]);
  assert.deepEqual(excludingPrefecture.map(p => p.id).sort(), ["p1", "p2"]);

  // 除外なし（両方効く）→ 福岡県かつ評価5のp1のみ
  const excludingNothing = placesMatchingFiltersExcept(values, []);
  assert.deepEqual(excludingNothing.map(p => p.id), ["p1"]);
});

test("placesMatchingFiltersExcept: 絞り込みが何も設定されていなければ全件を返す", () => {
  places.length = 0;
  places.push(place({ id: "p1" }));
  places.push(place({ id: "p2" }));

  const result = placesMatchingFiltersExcept(emptyValues(), ["prefecture"]);
  assert.equal(result.length, 2);
});
