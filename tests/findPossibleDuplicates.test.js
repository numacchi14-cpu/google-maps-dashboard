// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { findPossibleDuplicates, places } = require("../app.js");

function place(overrides) {
  return {
    id: "id1",
    name: "テスト店",
    address: "福岡県福岡市博多区1-1",
    prefecture: "福岡県",
    myPrefecture: null,
    rating: 4,
    publishTime: "2026/01/01",
    ...overrides
  };
}

test("findPossibleDuplicates: 同じ店名・同じ都道府県で住所が異なる行を候補として検出する（店舗移転を想定、2026-07-28実装）", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "つけ麺 らーめん 油そば 辰寅 宗像店", address: "福岡県宗像市野坂2655-1" }));
  places.push(place({ id: "p2", name: "つけ麺 らーめん 油そば 辰寅 宗像店", address: "福岡県宗像市光昇町3-1" }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "つけ麺 らーめん 油そば 辰寅 宗像店");
  assert.equal(groups[0].prefecture, "福岡県");
  assert.deepEqual(groups[0].items.map(p => p.id).sort(), ["p1", "p2"]);
});

test("findPossibleDuplicates: 都道府県が異なる同名店（チェーン店の別店舗）は候補にしない", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "スターバックス コーヒー", address: "東京都渋谷区1-1", prefecture: "東京都" }));
  places.push(place({ id: "p2", name: "スターバックス コーヒー", address: "大阪府大阪市1-1", prefecture: "大阪府" }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 0);
});

test("findPossibleDuplicates: 住所が完全に同じでも候補として拾う（2026-07-28変更：片方だけURLがある等の理由で重複排除の判定キーが分岐し、住所が同じでも2件残るケースがあるため）", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "テスト店", address: "福岡県福岡市博多区1-1" }));
  places.push(place({ id: "p2", name: "テスト店", address: "福岡県福岡市博多区1-1" }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 1);
});

test("findPossibleDuplicates: 同名が1件しかない場合は候補にしない", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "唯一の店" }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 0);
});

test("findPossibleDuplicates: マイ都道府県の上書きがある場合は実効値（マイ都道府県優先）で判定する", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "テスト店", address: "住所A", prefecture: "東京都", myPrefecture: "福岡県" }));
  places.push(place({ id: "p2", name: "テスト店", address: "住所B", prefecture: "福岡県", myPrefecture: null }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 1);
  assert.equal(groups[0].prefecture, "福岡県");
});

test("findPossibleDuplicates: 3件以上の同名・同都道府県グループでも1つのグループとしてまとめる", () => {
  places.length = 0;
  places.push(place({ id: "p1", name: "テスト店", address: "住所A" }));
  places.push(place({ id: "p2", name: "テスト店", address: "住所B" }));
  places.push(place({ id: "p3", name: "テスト店", address: "住所C" }));

  const groups = findPossibleDuplicates();

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
});
