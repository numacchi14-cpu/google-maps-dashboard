// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCSVRows, csvField, parseCSVData } = require("../app.js");

test("カンマ区切りの単純なCSVを行・列に分解する", () => {
  const rows = parseCSVRows("スポット名,住所\n東京タワー,東京都港区\n大阪城,大阪府大阪市");
  assert.deepEqual(rows, [
    ["スポット名", "住所"],
    ["東京タワー", "東京都港区"],
    ["大阪城", "大阪府大阪市"],
  ]);
});

test("ダブルクォート内のカンマはフィールド区切りとして扱わない", () => {
  const rows = parseCSVRows('名前,住所\n"某店, 支店A",東京都渋谷区');
  assert.deepEqual(rows[1], ["某店, 支店A", "東京都渋谷区"]);
});

test("ダブルクォート内の改行を含む複数行レビューを1レコードとして読み込む（回帰: 一括CSVインポートが固まっていた原因）", () => {
  const csv = 'スポット名,住所,コメント\n喫茶店,東京都新宿区,"とても美味しいコーヒーでした。\n2杯目も頼みました。\nまた行きたいです。"\n次のスポット,東京都渋谷区,普通のコメント';
  const rows = parseCSVRows(csv);
  assert.equal(rows.length, 3); // header + 2 data rows, not split apart by the embedded newlines
  assert.equal(rows[1][0], "喫茶店");
  assert.match(rows[1][2], /2杯目も頼みました/);
  assert.equal(rows[2][0], "次のスポット");
});

test("エスケープされた\"\"は1つのダブルクォート文字として復元する", () => {
  const rows = parseCSVRows('名前\n"""鍵括弧""付きの店名"');
  assert.deepEqual(rows[1], ['"鍵括弧"付きの店名']);
});

test("csvFieldは存在しない列や短い行に対して空文字を返す（undefinedを渡さない）", () => {
  assert.equal(csvField(["a", "b"], 0), "a");
  assert.equal(csvField(["a", "b"], 5), "");
  assert.equal(csvField(["a", "b"], -1), "");
});

test("複数行レビューを含むCSV全体をparseCSVDataで取り込んでもレコードが欠損・破損しない", () => {
  const csv = 'スポット名,住所,コメント\n喫茶店,東京都新宿区,"1行目のコメント\n2行目のコメント"\nラーメン店,福岡県福岡市,普通の一行コメント';
  const parsed = parseCSVData(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "喫茶店");
  assert.ok(parsed[0].address); // must not be undefined, or later dedup crashes
  assert.equal(parsed[1].name, "ラーメン店");
  assert.equal(parsed[1].category, "gourmet_ramen");
});
