// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getGeminiLocationIncompletePlaces,
  buildGeminiLocationPrompt,
  parseGeminiLocationResponse,
  applyGeminiLocationResults,
  places
} = require("../app.js");

test("getGeminiLocationIncompletePlaces: urlまたは緯度経度のどちらかが欠けている行のみを対象にする", () => {
  places.length = 0;
  places.push({ id: "p1", name: "完備", url: "https://maps.example/1", lat: 35, lng: 139 });
  places.push({ id: "p2", name: "urlのみ欠", url: "", lat: 35, lng: 139 });
  places.push({ id: "p3", name: "座標のみ欠", url: "https://maps.example/3", lat: null, lng: null });
  places.push({ id: "p4", name: "両方欠", url: "", lat: null, lng: null });

  const targets = getGeminiLocationIncompletePlaces().map(p => p.id);
  assert.deepEqual(targets, ["p2", "p3", "p4"]);
});

test("buildGeminiLocationPrompt: 評価・コメントを含めず名前と住所のみを送る", () => {
  const batch = [{ id: "p1", name: "一蘭 天神店", address: "福岡県福岡市中央区天神1-1", comment: "最高", rating: 5 }];
  const prompt = buildGeminiLocationPrompt(batch);

  assert.ok(prompt.includes("一蘭 天神店"));
  assert.ok(prompt.includes("福岡県福岡市中央区天神1-1"));
  assert.ok(prompt.includes("p1"));
  assert.ok(!prompt.includes("最高"));
  assert.ok(!prompt.includes("rating"));
});

test("buildGeminiLocationPrompt: 既にurlが分かっている項目（行ってみたいリスト由来等）はknownUrlとして手がかりに含める（2026-07-28実装）", () => {
  const batch = [{ id: "p1", name: "わさび", address: "", url: "https://www.google.com/maps/place/わさび/data=!4m2!3m1!1s0x1:0x2" }];
  const prompt = buildGeminiLocationPrompt(batch);

  assert.ok(prompt.includes('"knownUrl"'));
  assert.ok(prompt.includes("https://www.google.com/maps/place/わさび/data=!4m2!3m1!1s0x1:0x2"));
});

test("buildGeminiLocationPrompt: urlが無い項目のJSONにはknownUrlキーを含めない（説明文中の一般的な言及は除く）", () => {
  const batch = [{ id: "p1", name: "テスト", address: "東京都渋谷区1-1" }];
  const prompt = buildGeminiLocationPrompt(batch);
  assert.ok(!prompt.includes('"knownUrl"'));
});

test("parseGeminiLocationResponse: 素のJSON配列をパースする", () => {
  const text = '[{"id": "p1", "url": "https://maps.google.com/?q=1", "lat": 35.6586, "lng": 139.7454}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1", url: "https://maps.google.com/?q=1", lat: 35.6586, lng: 139.7454 }]);
});

test("parseGeminiLocationResponse: ```json コードフェンス付きの回答も許容する", () => {
  const text = '```json\n[{"id": "p1", "url": "https://maps.google.com/?q=1"}]\n```';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1", url: "https://maps.google.com/?q=1" }]);
});

test("parseGeminiLocationResponse: url/lat/lngは任意項目で、無ければ省略されたものとして扱う", () => {
  const text = '[{"id": "p1"}, {"id": "p2", "lat": 35.6, "lng": 139.7}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1" }, { id: "p2", lat: 35.6, lng: 139.7 }]);
});

test("parseGeminiLocationResponse: 緯度経度が数値でない/範囲外の場合はlat/lngを採用しない", () => {
  const text = '[{"id": "p1", "lat": "35.6", "lng": 139.7}, {"id": "p2", "lat": 999, "lng": 139.7}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1" }, { id: "p2" }]);
});

test("parseGeminiLocationResponse: コードフェンス無しで前後に説明文が付いていても抽出してパースする（2026-07-28追加）", () => {
  const text = '承知しました。\n[{"id": "p1", "url": "https://maps.google.com/?q=1"}]\n以上です。';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1", url: "https://maps.google.com/?q=1" }]);
});

test("parseGeminiLocationResponse: addressも任意項目としてパースする（2026-07-28実装）", () => {
  const text = '[{"id": "p1", "lat": 35.6, "lng": 139.7, "address": "東京都渋谷区1-1"}, {"id": "p2", "address": "  "}]';
  const results = parseGeminiLocationResponse(text);
  assert.equal(results[0].address, "東京都渋谷区1-1");
  assert.equal(results[1].address, undefined);
});

test("parseGeminiLocationResponse: 不正なJSON/配列以外はnullを返す", () => {
  assert.equal(parseGeminiLocationResponse("これはJSONではありません"), null);
  assert.equal(parseGeminiLocationResponse('{"id": "p1"}'), null);
  assert.equal(parseGeminiLocationResponse(""), null);
});

test("applyGeminiLocationResults: urlも緯度経度も未設定なら両方反映する", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "東京都渋谷区1-1", url: "", lat: null, lng: null });

  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/1", lat: 35.66, lng: 139.7 }]);

  assert.equal(applied.length, 1);
  assert.equal(applied[0].urlApplied, true);
  assert.equal(applied[0].coordsApplied, true);
  assert.equal(places[0].url, "https://maps.example/1");
  assert.equal(places[0].lat, 35.66);
  assert.equal(places[0].lng, 139.7);
});

test("applyGeminiLocationResults: 既に値がある項目は上書きしない（空欄埋めのみ）", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "東京都渋谷区1-1", url: "https://maps.example/existing", lat: 35.1, lng: 139.1 });

  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/new", lat: 40, lng: 140 }]);

  assert.equal(applied[0].urlApplied, false);
  assert.equal(applied[0].coordsApplied, false);
  assert.equal(places[0].url, "https://maps.example/existing");
  assert.equal(places[0].lat, 35.1);
  assert.equal(places[0].lng, 139.1);
});

test("applyGeminiLocationResults: 住所と座標の都道府県が食い違う場合でも座標は登録し、要確認フラグを立てる（2026-07-28変更）", () => {
  // 以前は反映せず理由だけ返していたが、それだと座標が未設定のまま残り、次回以降の
  // バッチにも同じスポットが毎回出てきてしまっていた（ユーザー報告）。座標はいったん
  // 登録した上でlocationNeedsReviewを立てて「リンク・緯度経度 要確認」に隔離する方式に変更。
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "福岡県福岡市中央区天神1-1", url: "", lat: null, lng: null });

  // 東京付近の座標を返してしまったケース
  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/1", lat: 35.6586, lng: 139.7454 }]);

  assert.equal(applied[0].urlApplied, true);
  assert.equal(applied[0].coordsApplied, true);
  assert.equal(applied[0].coordsNeedsReview, true);
  assert.ok(applied[0].coordsReviewReason);
  assert.equal(places[0].lat, 35.6586);
  assert.equal(places[0].lng, 139.7454);
  assert.equal(places[0].locationNeedsReview, true);
  assert.ok(places[0].locationReviewReason);

  // 座標が登録された以上、次回以降のバッチ対象からは外れる（今回直したかった再出現バグの回帰確認）
  assert.deepEqual(getGeminiLocationIncompletePlaces().map(p => p.id), []);
});

test("applyGeminiLocationResults: 住所が空欄の場合は反映し、都道府県が未確定（その他・海外）なら再判定する（2026-07-28実装、行ってみたいリスト由来のスポット向け）", () => {
  places.length = 0;
  places.push({
    id: "p1", name: "わさび", address: "", url: "https://www.google.com/maps/place/わさび/data=!4m2!3m1!1s0x1:0x2",
    lat: null, lng: null, prefecture: "その他・海外"
  });

  const applied = applyGeminiLocationResults([{
    id: "p1", lat: 33.5902, lng: 130.4017, address: "福岡県福岡市中央区天神1-1"
  }]);

  assert.equal(applied[0].addressApplied, true);
  assert.equal(places[0].address, "福岡県福岡市中央区天神1-1");
  assert.equal(places[0].prefecture, "福岡県");
});

test("applyGeminiLocationResults: 既に住所がある場合は上書きしない（空欄埋めのみ）", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "既存の住所", url: "", lat: null, lng: null, prefecture: "その他・海外" });

  const applied = applyGeminiLocationResults([{ id: "p1", address: "新しい住所" }]);

  assert.equal(applied[0].addressApplied, false);
  assert.equal(places[0].address, "既存の住所");
});

test("applyGeminiLocationResults: 都道府県が既に確定している場合は、住所/座標が新しく分かっても上書きしない", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "", url: "", lat: null, lng: null, prefecture: "大阪府" });

  applyGeminiLocationResults([{ id: "p1", lat: 33.5902, lng: 130.4017, address: "福岡県福岡市中央区天神1-1" }]);

  assert.equal(places[0].prefecture, "大阪府");
});

test("applyGeminiLocationResults: 住所が既存に無く今回新しく分かった場合は、それを使ってハルシネーションチェックする（2026-07-28実装）", () => {
  // 住所が元から空だとチェックが必ず素通りしていた問題の回帰確認。
  places.length = 0;
  places.push({ id: "p1", name: "わさび", address: "", url: "https://maps.example/1", lat: null, lng: null, prefecture: "その他・海外" });

  // 住所は福岡なのに座標は東京付近というハルシネーションケース
  const applied = applyGeminiLocationResults([{ id: "p1", lat: 35.6586, lng: 139.7454, address: "福岡県福岡市中央区天神1-1" }]);

  assert.equal(applied[0].coordsNeedsReview, true);
  assert.ok(applied[0].coordsReviewReason);
  assert.equal(places[0].locationNeedsReview, true);
});

test("applyGeminiLocationResults: 一致するidがない場合はスキップし結果に含めない", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", url: "", lat: null, lng: null });

  const applied = applyGeminiLocationResults([{ id: "not-found", url: "https://maps.example/1" }]);

  assert.equal(applied.length, 0);
  assert.equal(places[0].url, "");
});
