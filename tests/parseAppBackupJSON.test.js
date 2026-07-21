// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseAppBackupJSON, getAllCategories, customCategories } = require("../app.js");

test("エクスポート形式のレコードをカテゴリー・都道府県を再計算せずそのまま復元する", () => {
  const backup = [{
    name: "手動でその他に直した店",
    prefecture: "沖縄県",
    categoryKey: "gourmet_ramen", // 元は自動判定でラーメンだったが、店名だけ見ると誤判定されうる名前
    categoryName: "グルメ（ラーメン・麺類）",
    address: "沖縄県那覇市1-1-1",
    rating: 4,
    comment: "テストコメント",
    publishTime: "2026/01/01",
    updateTime: "2026/02/02",
    coordinates: { latitude: 26.2124, longitude: 127.6809 },
    googleMapsUrl: "https://maps.google.com/?q=test",
    source: "保存済みの場所"
  }];

  const [place] = parseAppBackupJSON(backup);

  assert.equal(place.category, "gourmet_ramen");
  assert.equal(place.prefecture, "沖縄県");
  assert.equal(place.lat, 26.2124);
  assert.equal(place.lng, 127.6809);
  assert.equal(place.comment, "テストコメント");
  assert.equal(place.url, "https://maps.google.com/?q=test");
});

test("categoryKeyが不正/欠落している場合はclassifyCategoryにフォールバックする", () => {
  const backup = [{
    name: "博多ラーメン一風堂",
    prefecture: "福岡県",
    categoryKey: "not_a_real_category",
    address: "福岡県福岡市",
    comment: "",
    coordinates: { latitude: 33.6, longitude: 130.4 }
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.category, "gourmet_ramen");
});

test("prefectureや座標が欠けている場合は既定値にフォールバックする", () => {
  const backup = [{
    name: "座標なしスポット",
    categoryKey: "other",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.prefecture, "その他・海外");
  assert.equal(place.lat, null);
  assert.equal(place.lng, null);
});

test("マイ都道府県/マイカテゴリー（手動上書き）をGoogle連動側と別軸で復元する", () => {
  const backup = [{
    name: "手動でマイカテゴリーを設定した店",
    prefecture: "福岡県",
    categoryKey: "gourmet_ramen",
    myPrefecture: "熊本県",
    myCategoryKey: "gourmet_other",
    myCategoryName: "グルメ（その他）",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.prefecture, "福岡県");
  assert.equal(place.category, "gourmet_ramen");
  assert.equal(place.myPrefecture, "熊本県");
  assert.equal(place.myCategory, "gourmet_other");
});

test("マイ都道府県/マイカテゴリーが未設定の場合はnullに復元する（不正なmyCategoryKeyも同様）", () => {
  const backup = [{
    name: "上書きなしの店",
    prefecture: "福岡県",
    categoryKey: "gourmet_ramen",
    myCategoryKey: "not_a_real_category",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.myPrefecture, null);
  assert.equal(place.myCategory, null);
});

test("googleCategoryRaw（Gemini等から取得した生の業種ラベル）を復元する。未設定ならnullにする", () => {
  const backup = [
    {
      name: "Gemini分類済みの店",
      categoryKey: "gourmet_ramen",
      googleCategoryRaw: "ラーメン店",
      comment: ""
    },
    {
      name: "未分類の店",
      categoryKey: "other",
      comment: ""
    }
  ];

  const [classified, unclassified] = parseAppBackupJSON(backup);
  assert.equal(classified.googleCategoryRaw, "ラーメン店");
  assert.equal(unclassified.googleCategoryRaw, null);
});

test("googleCategoryRawがある場合は、保存されていたcategoryKeyより生ラベルからの再生成を優先する（自己修復・12種への丸め込みをしない）", () => {
  const backup = [{
    name: "美容室スポット",
    categoryKey: "other", // 古いバージョンの丸め込みロジックで保存された値（想定）
    googleCategoryRaw: "美容室",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.category, "gemini_美容室");
  assert.equal(getAllCategories()["gemini_美容室"].name, "美容室");
});

test("myCategoryKeyがgemini_始まりの場合は、myCategoryNameからGoogle取得カテゴリーとして再登録して復元する", () => {
  const backup = [{
    name: "マイカテゴリーにGemini取得カテゴリーを設定した店",
    categoryKey: "other",
    myCategoryKey: "gemini_ラーメン店",
    myCategoryName: "ラーメン店",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.myCategory, "gemini_ラーメン店");
  assert.equal(getAllCategories()["gemini_ラーメン店"].name, "ラーメン店");
});

test("バックアップが参照する自作マイカテゴリー（標準の12種にないキー）を再登録して復元する", () => {
  const backup = [{
    name: "自作カテゴリーを付けた店",
    prefecture: "東京都",
    categoryKey: "gourmet_cafe",
    myCategoryKey: "custom_1234_abcde",
    myCategoryName: "よく行く店",
    myCategoryColor: "#f59e0b",
    comment: ""
  }];

  const [place] = parseAppBackupJSON(backup);
  assert.equal(place.myCategory, "custom_1234_abcde");
  assert.equal(getAllCategories()["custom_1234_abcde"].name, "よく行く店");
  assert.equal(customCategories["custom_1234_abcde"].color, "#f59e0b");
});
