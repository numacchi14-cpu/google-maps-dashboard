// Application State
let places = [];
// 削除済みスポットのゴミ箱（誤削除からの復元用）。ここに入っている項目のマッチキー
// （buildPlaceMatchKey）は、Takeout等の再インポート時に自動再登録されないよう
// handleFiles側で除外フィルターとしても使う。「削除済みスポット」ボタンから
// 個別に復元／完全削除できる。端末ローカルのみで、ローカルキャッシュのON/OFFに連動する
// （4節のプライバシー方針と同じ理由：氏名・住所を含むデータのため）。
let deletedPlaces = [];
let map = null;
let markersGroup = [];
let categoryChart = null;
let prefectureChart = null;
// デフォルトは最終更新日の新しい順（自分の直近の編集・取り込みがすぐ確認できるように、
// 2026-07-26変更。従来はスポット名の昇順だった）。
// 「最終更新日」は内部的にはpublishTimeフィールド（Google Takeoutは真の初回投稿日を
// 出力せず、この日付が編集のたびに更新されて返ってくるため）。updateTimeフィールドは
// 実データではほぼ空で信頼できないため使わない（2026-07-26、ユーザーからの指摘で判明。
// 詳細はSPEC.md参照。一度updateTime寄りに直したが、これは誤りだったため巻き戻した）。
let currentSortColumn = 'publishTime';
let currentSortDirection = 'desc';

// テーブル表示のページネーション（2026-07-28実装）：実データ900件超を一覧テーブルに
// 一括描画すると描画が重く、かつ「開いたら全件が画面に並ぶ」こと自体が運用上好ましくない
// ため、50件区切りでページ切り替えする。絞り込み・地図・グラフ・統計カードは引き続き
// 絞り込み結果全体を対象にし、ページングの対象はテーブルの描画のみ。
const TABLE_PAGE_SIZE = 50;
let currentTablePage = 1;
// カテゴリー比率チャートの集計軸: 'google'（Google連動カテゴリー、生ラベルそのまま）
// または 'my'（マイカテゴリー。未設定はGoogle連動にフォールバック＝従来の実効値）
let categoryChartAxis = 'google';
// User-created マイカテゴリー定義, keyed like CATEGORIES: { [key]: { name, color, custom: true } }.
// Kept separate from CATEGORIES because that constant represents the fixed Google連動 taxonomy.
let customCategories = {};
// Gemini等から取得した「Google連動カテゴリー」の生ラベルをそのまま使うための動的カテゴリー registry。
// key: `gemini_<ラベル>`, value: { name: ラベル, color, source: "gemini" }。
// 固定12種に丸め込まず、ラベルの数だけ増えていく（同じラベルは同じキーに集約される）。
let geminiCategories = {};
// Set to a place's id while the manual-add modal is open in "edit" mode; null when adding new.
let editingManualPlaceId = null;
// True whenever places/customCategories have changed since the last successful
// save (Drive save or JSON export — the lossless formats). The local IndexedDB
// cache (below) is a convenience layer, not a "real" backup (it's device-local
// and can be cleared by the user/browser at any time), so it does NOT clear
// this flag — closing the tab with this true still silently risks losing the
// changes from the user's other devices' perspective. Drives the beforeunload
// warning below.
let hasUnsavedChanges = false;
function markUnsavedChanges() { hasUnsavedChanges = true; updateUnsavedIndicator(); scheduleLocalCacheWrite(); }
function clearUnsavedChanges() { hasUnsavedChanges = false; updateUnsavedIndicator(); }

// beforeunloadの警告はタブを閉じる/リロードする瞬間にしか出ないため、開きっぱなしで
// 作業を続けている間は気づく手段が無かった。Driveに保存ボタンの隣に常時表示のバッジを置き、
// 未保存の変更がある間はいつでも一目で分かるようにする。
function updateUnsavedIndicator() {
  const el = document.getElementById("unsaved-indicator");
  if (!el) return;
  el.style.display = hasUnsavedChanges ? "inline-flex" : "none";
}

// Per-device ON/OFF preference for the local offline cache (below). Kept in
// localStorage (not IndexedDB) since it's app preference metadata, not place
// data, and must be readable synchronously at startup before deciding whether
// to touch IndexedDB at all.
const LOCAL_CACHE_PREF_KEY = "localCacheEnabled";
let localCacheWriteTimer = null; // debounce handle for scheduleLocalCacheWrite()

// Constants
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const PREFECTURE_COORDINATES = [
  { name: "北海道", lat: 43.0642, lng: 141.3469 },
  { name: "青森県", lat: 40.8244, lng: 140.7400 },
  { name: "岩手県", lat: 39.7036, lng: 141.1525 },
  { name: "宮城県", lat: 38.2689, lng: 140.8719 },
  { name: "秋田県", lat: 39.7186, lng: 140.1025 },
  { name: "山形県", lat: 38.2406, lng: 140.3633 },
  { name: "福島県", lat: 37.7500, lng: 140.4678 },
  { name: "茨城県", lat: 36.3414, lng: 140.4467 },
  { name: "栃木県", lat: 36.5658, lng: 139.8836 },
  { name: "群馬県", lat: 36.3911, lng: 139.0608 },
  { name: "埼玉県", lat: 35.8569, lng: 139.6489 },
  { name: "千葉県", lat: 35.6047, lng: 140.1233 },
  { name: "東京都", lat: 35.6894, lng: 139.6917 },
  { name: "神奈川県", lat: 35.4478, lng: 139.6425 },
  { name: "新潟県", lat: 37.9022, lng: 139.0236 },
  { name: "富山県", lat: 36.6953, lng: 137.2114 },
  { name: "石川県", lat: 36.5944, lng: 136.6256 },
  { name: "福井県", lat: 36.0653, lng: 136.2219 },
  { name: "山梨県", lat: 35.6639, lng: 138.5683 },
  { name: "長野県", lat: 36.6514, lng: 138.1811 },
  { name: "岐阜県", lat: 35.3911, lng: 136.7222 },
  { name: "静岡県", lat: 34.9769, lng: 138.3831 },
  { name: "愛知県", lat: 35.1803, lng: 136.9067 },
  { name: "三重県", lat: 34.7303, lng: 136.5086 },
  { name: "滋賀県", lat: 35.0044, lng: 135.8683 },
  { name: "京都府", lat: 35.0214, lng: 135.7556 },
  { name: "大阪府", lat: 34.6864, lng: 135.5200 },
  { name: "兵庫県", lat: 34.6914, lng: 135.1831 },
  { name: "奈良県", lat: 34.6853, lng: 135.8328 },
  { name: "和歌山県", lat: 34.2261, lng: 135.1675 },
  { name: "鳥取県", lat: 35.5036, lng: 134.2383 },
  { name: "島根県", lat: 35.4722, lng: 133.0506 },
  { name: "岡山県", lat: 34.6617, lng: 133.9350 },
  { name: "広島県", lat: 34.3964, lng: 132.4594 },
  { name: "山口県", lat: 34.1858, lng: 131.4714 },
  { name: "徳島県", lat: 34.0658, lng: 134.5594 },
  { name: "香川県", lat: 34.3403, lng: 134.0433 },
  { name: "愛媛県", lat: 33.8417, lng: 132.7661 },
  { name: "高知県", lat: 33.5597, lng: 133.5311 },
  { name: "福岡県", lat: 33.6064, lng: 130.4181 },
  { name: "佐賀県", lat: 33.2494, lng: 130.2989 },
  { name: "長崎県", lat: 32.7447, lng: 129.8736 },
  { name: "熊本県", lat: 32.8031, lng: 130.7079 },
  { name: "大分県", lat: 33.2382, lng: 131.6126 },
  { name: "宮崎県", lat: 31.9111, lng: 131.4239 },
  { name: "鹿児島県", lat: 31.5602, lng: 130.5581 },
  { name: "沖縄県", lat: 26.2124, lng: 127.6809 }
];


const CATEGORIES = {
  "gourmet_ramen": { name: "グルメ（ラーメン・麺類）", color: "#ff7a00", keywords: ["ラーメン", "らーめん", "拉麺", "つけ麺", "担々麺", "坦々麺", "ちゃんぽん", "うどん", "饂飩", "そば", "蕎麦", "ramen", "udon", "soba"] },
  "gourmet_sushi": { name: "グルメ（寿司・海鮮）", color: "#06b6d4", keywords: ["寿司", "鮨", "すし", "刺身", "海鮮", "さば", "サバ", "鯖", "sushi", "seafood"] },
  "gourmet_yakiniku": { name: "グルメ（焼肉・肉料理）", color: "#ef4444", keywords: ["焼肉", "やきにく", "ステーキ", "ホルモン", "ハンバーグ", "とんかつ", "トンカツ", "豚カツ", "焼き鳥", "焼鳥", "串カツ", "串焼き", "肉料理", "steak", "yakiniku", "yakitori"] },
  "gourmet_cafe": { name: "グルメ（カフェ・スイーツ）", color: "#ec4899", keywords: ["カフェ", "cafe", "喫茶", "スイーツ", "デザート", "パン", "ベーカリー", "サンドイッチ", "ケーキ", "パフェ", "クレープ", "ドーナツ", "珈琲", "コーヒー", "お茶", "抹茶", "紅茶", "coffee", "bakery", "dessert", "sweets"] },
  "gourmet_izakaya": { name: "グルメ（居酒屋・バー）", color: "#8b5cf6", keywords: ["居酒屋", "酒場", "バル", "バー", "パブ", "ビール", "ワイン", "日本酒", "焼酎", "ウイスキー", "pub", "bar", "izakaya"] },
  "gourmet_other": { name: "グルメ（その他）", color: "#3b82f6", keywords: ["食堂", "レストラン", "洋食", "和食", "中華", "ピザ", "パスタ", "イタリアン", "フレンチ", "カレー", "餃子", "ギョーザ", "bistro", "restaurant", "dining", "curry", "pizza", "pasta"] },
  "sightseeing": { name: "観光・レジャー", color: "#10b981", keywords: ["公園", "観光", "美術館", "博物館", "城", "展望台", "動物園", "水族館", "温泉", "スパ", "ビーチ", "海水浴場", "滝", "山", "渓谷", "テーマパーク", "アミューズメント", "映画館", "劇場", "庭園", "park", "museum", "zoo", "aquarium", "onsen", "hot spring", "mountain", "beach", "theater", "garden"] },
  "temple": { name: "寺社仏閣", color: "#d97706", keywords: ["神社", "大社", "神宮", "天満宮", "東照宮", "大仏", "お寺", "寺院", "仏閣", "観音", "不動尊", "shrine", "temple"] },
  "lodging": { name: "宿泊施設", color: "#f43f5e", keywords: ["ホテル", "旅館", "ゲストハウス", "ホステル", "民宿", "ペンション", "コテージ", "宿", "温泉宿", "hotel", "ryokan", "hostel", "guesthouse", "inn", "resort"] },
  "shopping": { name: "ショッピング", color: "#a855f7", keywords: ["モール", "ショップ", "スーパー", "百貨店", "市場", "アウトレット", "デパート", "専門店", "本屋", "書店", "薬局", "ドラッグストア", "コンビニ", "服", "ファッション", "shop", "store", "mall", "supermarket", "market"] },
  "transport": { name: "交通機関", color: "#64748b", keywords: ["駅", "空港", "バス", "ターミナル", "港", "停留所", "インターチェンジ", "IC", "高速道路", "サービスエリア", "PA", "station", "airport", "terminal", "port", "highway"] },
  "other": { name: "その他", color: "#94a3b8", keywords: [] }
};

// Effective prefecture/category: the user's own override ("マイ都道府県"/"マイカテゴリー")
// takes precedence over the auto-detected ("Google連動") value when set.
// This keeps the two axes structurally separate so re-imports can refresh the
// Google連動 side without ever clobbering a manual edit.
function getEffectivePrefecture(p) {
  return p.myPrefecture || p.prefecture;
}
function getEffectiveCategory(p) {
  return p.myCategory || p.category;
}

// Built-in (Google連動の12分類) categories plus any user-created マイカテゴリー、
// および Gemini 等から取得した Google連動カテゴリーの生ラベルを、lookup/display用に
// すべてマージする。category はCATEGORIES/geminiCategoriesのいずれかを、
// myCategory はCATEGORIES/customCategories/geminiCategoriesのいずれかを参照しうる。
function getAllCategories() {
  return { ...CATEGORIES, ...customCategories, ...geminiCategories };
}

// ラベル文字列から決定的な色を1つ生成する（同じラベルなら常に同じ色になる）。
// Gemini等が返す業種ラベルは件数が読めない開放集合なので、固定パレットの割り当てではなく
// ハッシュベースで生成する。この色は地図ピン等の個別スポット表示に使うためのもので、
// カテゴリー比率チャートの凡例色（CVD配慮が必要な箇所）には使わない
// （そちらはrenderChartsのtop-N＋「その他」集約ロジックで別途扱う）。
function colorForGeminiLabel(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 62%, 55%)`;
}

// Geminiが返した生の業種ラベルをキーに、Google連動カテゴリーのエントリーを
// 取得または新規作成する。同じラベルは常に同じキー・同じ色に集約される
// （＝「Geminiのカテゴリーをそのまま使う」の実体）。
function getOrCreateGeminiCategory(rawLabel) {
  const label = (rawLabel || "").trim();
  if (!label) return null;
  const key = `gemini_${label}`;
  if (!geminiCategories[key]) {
    geminiCategories[key] = { name: label, color: colorForGeminiLabel(label), source: "gemini" };
  }
  return key;
}

function generateCustomCategoryKey() {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

// Register a custom category if not already known (used both when the user
// creates one via the settings modal, and when restoring one referenced by
// a JSON backup that was exported from a different/earlier session).
function registerCustomCategory(key, name, color) {
  if (!customCategories[key]) {
    customCategories[key] = { name: name, color: color || "#6b7280", custom: true };
  }
}

// コピー成功時、ボタンを一時的に「コピーしました」表示へ切り替える（2026-07-28実装）。
// navigator.clipboard.writeText自体は一瞬で終わり見た目に変化が無いため、実際にコピー
// できたのかが特にデータ量が多く重い時ほど分かりづらいというユーザーからの指摘で追加。
function showCopySuccess(button) {
  if (!button) return;
  const original = button.innerHTML;
  button.innerHTML = '<i data-lucide="check"></i> コピーしました';
  button.classList.add("copy-btn-success");
  lucide.createIcons();
  setTimeout(() => {
    button.innerHTML = original;
    button.classList.remove("copy-btn-success");
    lucide.createIcons();
  }, 1500);
}

// Initialize UI and Events
document.addEventListener("DOMContentLoaded", () => {
  // Lucide Icons
  lucide.createIcons();

  // Initialize Map
  initMap();

  // Setup Event Listeners
  setupEventListeners();

  // Reflect the saved local-cache preference into the header toggle, then
  // (if enabled) try to restore the last session from IndexedDB — async,
  // fire-and-forget; it no-ops quietly if there's nothing cached or the
  // toggle is off.
  updateLocalCacheToggleUI();
  restoreFromLocalCache();

  // Warn before an accidental tab close/reload throws away unsaved edits —
  // Drive save / JSON export are the only real backups (the local cache above
  // is device-local convenience, not a substitute — see hasUnsavedChanges
  // comment), so this is still the safety net for those.
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // PWA installability (フェーズ4): registers the app-shell service worker so the
  // app can be added to the home screen / launched in its own window without
  // browser chrome. Leaflet/Chart.js/Lucide/フォント are still CDN-loaded at
  // runtime and are not cached here, so this is not full offline support
  // (see sw.js comment / SPEC.md §4 "外部CDN依存").
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("Service worker registration failed:", e);
    });
  }
});

// Initialize Leaflet Map
function initMap() {
  // Default centered at Japan
  map = L.map('map').setView([36.2048, 138.2529], 5);
  
  // Sleek Dark CartoDB Map Tile Layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
}

// 一覧テーブルのソート矢印アイコンを、現在のcurrentSortColumn/currentSortDirectionに
// 合わせて更新する。列ヘッダークリック時と、初期表示（デフォルトソートの反映）の両方から呼ぶ。
function updateSortIcons() {
  // lucide.createIcons()は初回描画時に<i data-lucide="...">を<svg data-lucide="...">に
  // 置き換える（タグ自体がiではなくなる）ため、"th i"では2回目以降ヒットしない
  // （回帰: 列ヘッダーをクリックしても矢印の向きが一度も変わっていなかった不具合）。
  // タグ名を問わず[data-lucide]属性で辿る。
  document.querySelectorAll("th[data-sort] [data-lucide]").forEach(icon => {
    const th = icon.closest("th[data-sort]");
    if (th.getAttribute("data-sort") === currentSortColumn) {
      icon.setAttribute("data-lucide", currentSortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
    } else {
      icon.setAttribute("data-lucide", "chevrons-up-down");
    }
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
}

// Setup Event Listeners
function setupEventListeners() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const selectFileBtn = document.getElementById("select-file-btn");
  const loadSampleBtn = document.getElementById("load-sample-btn");
  const searchBox = document.getElementById("search-box");
  const filterPref = document.getElementById("filter-prefecture");
  const filterCatGoogle = document.getElementById("filter-category-google");
  const filterCatMy = document.getElementById("filter-category-my");
  const filterRating = document.getElementById("filter-rating");
  const filterWishlistList = document.getElementById("filter-wishlist-list");
  const filterDateFrom = document.getElementById("filter-date-from");
  const filterDateTo = document.getElementById("filter-date-to");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const btnExportJson = document.getElementById("btn-export-json");
  const btnReset = document.getElementById("btn-reset");
  const btnCategorySettings = document.getElementById("btn-category-settings");
  const categorySettingsOverlay = document.getElementById("category-settings-overlay");
  const categorySettingsClose = document.getElementById("category-settings-close");
  const addCategoryForm = document.getElementById("add-category-form");
  const btnGeminiCategory = document.getElementById("btn-gemini-category");
  const geminiCategoryOverlay = document.getElementById("gemini-category-overlay");
  const geminiCategoryClose = document.getElementById("gemini-category-close");
  const btnGeminiCopyPrompt = document.getElementById("btn-gemini-copy-prompt");
  const btnGeminiApply = document.getElementById("btn-gemini-apply");
  const btnGeminiLocation = document.getElementById("btn-gemini-location");
  const geminiLocationOverlay = document.getElementById("gemini-location-overlay");
  const geminiLocationClose = document.getElementById("gemini-location-close");
  const btnGeminiLocCopyPrompt = document.getElementById("btn-gemini-loc-copy-prompt");
  const btnGeminiLocApply = document.getElementById("btn-gemini-loc-apply");
  const catAxisToggle = document.getElementById("cat-axis-toggle");
  const btnManualAdd = document.getElementById("btn-manual-add");
  const btnManualAddEmpty = document.getElementById("btn-manual-add-empty");
  const manualAddOverlay = document.getElementById("manual-add-overlay");
  const manualAddClose = document.getElementById("manual-add-close");
  const manualAddForm = document.getElementById("manual-add-form");
  const btnManualCsvExport = document.getElementById("btn-manual-csv-export");
  const btnManualCsvImport = document.getElementById("btn-manual-csv-import");
  const manualCsvInput = document.getElementById("manual-csv-input");
  const btnDriveConnect = document.getElementById("btn-drive-connect");
  const btnDriveSave = document.getElementById("btn-drive-save");
  const localCacheToggle = document.getElementById("local-cache-toggle");
  const btnPlaceLookup = document.getElementById("btn-place-lookup");
  const placeLookupOverlay = document.getElementById("place-lookup-overlay");
  const placeLookupClose = document.getElementById("place-lookup-close");
  const btnPlaceLookupGenerate = document.getElementById("btn-place-lookup-generate");
  const btnPlaceLookupCopyPrompt = document.getElementById("btn-place-lookup-copy-prompt");
  const btnPlaceLookupApply = document.getElementById("btn-place-lookup-apply");
  const unknownSpotOverlay = document.getElementById("unknown-spot-overlay");
  const unknownSpotClose = document.getElementById("unknown-spot-close");
  const unknownSpotSelectAll = document.getElementById("unknown-spot-select-all");
  const btnUnknownSpotDelete = document.getElementById("btn-unknown-spot-delete");
  const btnUnknownSpotKeep = document.getElementById("btn-unknown-spot-keep");
  const btnDeletedSpots = document.getElementById("btn-deleted-spots");
  const deletedSpotsOverlay = document.getElementById("deleted-spots-overlay");
  const deletedSpotsClose = document.getElementById("deleted-spots-close");
  const btnLocationReview = document.getElementById("btn-location-review");
  const locationReviewOverlay = document.getElementById("location-review-overlay");
  const locationReviewClose = document.getElementById("location-review-close");
  const paginationPrev = document.getElementById("pagination-prev");
  const paginationNext = document.getElementById("pagination-next");

  // Google Drive sync
  btnDriveConnect.addEventListener("click", connectGoogleDrive);
  btnDriveSave.addEventListener("click", saveToDrive);

  // Local offline cache toggle (Phase 3)
  if (localCacheToggle) {
    localCacheToggle.addEventListener("change", (e) => handleLocalCacheToggleChange(e.target.checked));
  }

  // Select file trigger
  selectFileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  // Header shortcut to import more files (e.g. a newer Takeout export) once
  // the dashboard is already showing — #upload-section (and its drop zone)
  // is hidden at that point, so this was previously unreachable without
  // resetting all data first.
  const btnAddFiles = document.getElementById("btn-add-files");
  btnAddFiles.addEventListener("click", () => fileInput.click());

  // モバイル専用の操作メニュー折りたたみ（デスクトップでは.toolbar-toggle自体が
  // 非表示なのでクリックされない。CSS側の@media (max-width: 768px)参照）
  const toolbarToggle = document.getElementById("toolbar-toggle");
  const toolbarButtons = document.getElementById("toolbar-buttons");
  const toolbarToggleIcon = document.getElementById("toolbar-toggle-icon");
  toolbarToggle.addEventListener("click", () => {
    const collapsed = toolbarButtons.classList.toggle("collapsed");
    toolbarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toolbarToggleIcon.setAttribute("data-lucide", collapsed ? "chevron-down" : "chevron-up");
    lucide.createIcons();
  });

  // Drag & drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  // Sample data loading
  loadSampleBtn.addEventListener("click", loadSampleData);

  // Filters and Search（絞り込み条件が変わったら1ページ目に戻す。データ編集時に
  // 呼ばれるfilterAndRender()は現在のページを維持したいため、ここだけ専用にする）
  const filterAndRenderFromPage1 = () => { currentTablePage = 1; filterAndRender(); };
  searchBox.addEventListener("input", filterAndRenderFromPage1);
  filterPref.addEventListener("change", filterAndRenderFromPage1);
  filterCatGoogle.addEventListener("change", filterAndRenderFromPage1);
  filterCatMy.addEventListener("change", filterAndRenderFromPage1);
  filterRating.addEventListener("change", filterAndRenderFromPage1);
  filterWishlistList.addEventListener("change", filterAndRenderFromPage1);
  filterDateFrom.addEventListener("change", filterAndRenderFromPage1);
  filterDateTo.addEventListener("change", filterAndRenderFromPage1);

  // Sorting
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");
      if (currentSortColumn === col) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortColumn = col;
        currentSortDirection = 'asc';
      }
      updateSortIcons();
      currentTablePage = 1;
      filterAndRender();
    });
  });
  // 初期状態（デフォルトソート）にも矢印を反映しておく。クリックするまで
  // chevrons-up-down のままだと、実際は最終更新日の降順で並んでいるのに
  // 見た目上どの列でソートされているか分からない。
  updateSortIcons();

  // Export & Reset
  btnExportCsv.addEventListener("click", exportCSV);
  btnExportJson.addEventListener("click", exportJSON);
  btnReset.addEventListener("click", resetApp);

  // マイカテゴリー設定 (custom category management modal)
  btnCategorySettings.addEventListener("click", openCategorySettings);
  categorySettingsClose.addEventListener("click", closeCategorySettings);
  categorySettingsOverlay.addEventListener("click", (e) => {
    if (e.target === categorySettingsOverlay) closeCategorySettings();
  });
  addCategoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-category-name");
    const colorInput = document.getElementById("new-category-color");
    const name = nameInput.value.trim();
    if (!name) return;

    const isDuplicate = Object.values(customCategories).some(c => c.name === name);
    if (isDuplicate) {
      alert("同じ名前のマイカテゴリーが既にあります。");
      return;
    }

    const key = generateCustomCategoryKey();
    customCategories[key] = { name: name, color: colorInput.value, custom: true };
    nameInput.value = "";
    colorInput.value = "#3b82f6";
    markUnsavedChanges();

    renderCustomCategoryList();
    setupDropdownFilters();
    filterAndRender();
  });

  // Google連動カテゴリーの取得（Geminiプロンプト方式）
  btnGeminiCategory.addEventListener("click", openGeminiCategoryModal);
  geminiCategoryClose.addEventListener("click", closeGeminiCategoryModal);
  geminiCategoryOverlay.addEventListener("click", (e) => {
    if (e.target === geminiCategoryOverlay) closeGeminiCategoryModal();
  });
  btnGeminiCopyPrompt.addEventListener("click", async () => {
    const promptEl = document.getElementById("gemini-cat-prompt");
    if (!promptEl.value) return;
    try {
      await navigator.clipboard.writeText(promptEl.value);
    } catch (e) {
      promptEl.select();
      document.execCommand("copy");
    }
    showCopySuccess(btnGeminiCopyPrompt);
  });
  btnGeminiApply.addEventListener("click", () => {
    const responseEl = document.getElementById("gemini-cat-response");
    const statusEl = document.getElementById("gemini-cat-status");
    const resultListEl = document.getElementById("gemini-cat-result-list");
    const results = parseGeminiCategoryResponse(responseEl.value);
    if (!results) {
      alert("JSONの形式を読み取れませんでした。Geminiの回答をそのまま貼り付けてください。");
      return;
    }
    const applied = applyGeminiCategoryResults(results);
    if (applied.length > 0) markUnsavedChanges();
    responseEl.value = "";
    setupDropdownFilters();
    filterAndRender();
    refreshGeminiCategoryModal();
    const remaining = getGeminiUnclassifiedPlaces().length;
    statusEl.textContent = `${applied.length}件を分類しました。` + (remaining > 0 ? ` 続けて次のバッチ（残り${remaining}件）を取得できます。` : " すべて取得済みです。");

    // Geminiが実際に何と答えたかをその場で確認できるように、適用結果を一覧表示する
    resultListEl.innerHTML = "";
    if (applied.length > 0) {
      const heading = document.createElement("p");
      heading.className = "gemini-cat-result-heading";
      heading.textContent = "適用結果（Geminiの回答 → 分類されたカテゴリー）";
      resultListEl.appendChild(heading);

      const ul = document.createElement("ul");
      applied.forEach(item => {
        const li = document.createElement("li");
        li.textContent = `${item.name}: 「${item.rawCategory}」 → ${item.categoryName}`;
        ul.appendChild(li);
      });
      resultListEl.appendChild(ul);
    }
  });

  // Googleマップリンク・緯度経度の取得（Geminiプロンプト方式）
  btnGeminiLocation.addEventListener("click", openGeminiLocationModal);
  geminiLocationClose.addEventListener("click", closeGeminiLocationModal);
  geminiLocationOverlay.addEventListener("click", (e) => {
    if (e.target === geminiLocationOverlay) closeGeminiLocationModal();
  });
  btnGeminiLocCopyPrompt.addEventListener("click", async () => {
    const promptEl = document.getElementById("gemini-loc-prompt");
    if (!promptEl.value) return;
    try {
      await navigator.clipboard.writeText(promptEl.value);
    } catch (e) {
      promptEl.select();
      document.execCommand("copy");
    }
    showCopySuccess(btnGeminiLocCopyPrompt);
  });
  btnGeminiLocApply.addEventListener("click", () => {
    const responseEl = document.getElementById("gemini-loc-response");
    const statusEl = document.getElementById("gemini-loc-status");
    const resultListEl = document.getElementById("gemini-loc-result-list");
    const results = parseGeminiLocationResponse(responseEl.value);
    if (!results) {
      alert("JSONの形式を読み取れませんでした。Geminiの回答をそのまま貼り付けてください。");
      return;
    }
    const applied = applyGeminiLocationResults(results);
    if (applied.some(item => item.urlApplied || item.coordsApplied)) markUnsavedChanges();
    responseEl.value = "";
    setupDropdownFilters();
    filterAndRender();
    refreshGeminiLocationModal();
    const remaining = getGeminiLocationIncompletePlaces().length;
    const reviewCount = applied.filter(item => item.coordsNeedsReview).length;
    statusEl.textContent = `${applied.length}件を反映しました。`
      + (remaining > 0 ? ` 続けて次のバッチ（残り${remaining}件）を取得できます。` : " すべて取得済みです。")
      + (reviewCount > 0 ? ` うち${reviewCount}件は座標が住所と食い違う疑いがあるため「リンク・緯度経度 要確認」に追加されました。` : "");

    // Geminiが実際に何と答えたか、どこまで反映できたかをその場で確認できるようにする
    resultListEl.innerHTML = "";
    if (applied.length > 0) {
      const heading = document.createElement("p");
      heading.className = "gemini-cat-result-heading";
      heading.textContent = "適用結果";
      resultListEl.appendChild(heading);

      const ul = document.createElement("ul");
      applied.forEach(item => {
        const li = document.createElement("li");
        const parts = [];
        if (item.urlApplied) parts.push("リンクを反映");
        if (item.coordsNeedsReview) parts.push(`緯度経度を反映（⚠️ 要確認: ${item.coordsReviewReason}）`);
        else if (item.coordsApplied) parts.push("緯度経度を反映");
        if (parts.length === 0) parts.push("反映できる項目がありませんでした");
        li.textContent = `${item.name}: ${parts.join(" / ")}`;
        ul.appendChild(li);
      });
      resultListEl.appendChild(ul);
    }
  });

  // スポット情報のGemini検索（手動追加の補助）
  btnPlaceLookup.addEventListener("click", openPlaceLookupModal);
  placeLookupClose.addEventListener("click", closePlaceLookupModal);
  placeLookupOverlay.addEventListener("click", (e) => {
    if (e.target === placeLookupOverlay) closePlaceLookupModal();
  });
  btnPlaceLookupGenerate.addEventListener("click", () => {
    const inputEl = document.getElementById("place-lookup-input");
    const promptEl = document.getElementById("place-lookup-prompt");
    const statusEl = document.getElementById("place-lookup-status");
    document.getElementById("place-lookup-result-list").innerHTML = "";

    const rawLines = inputEl.value.split("\n").filter(l => l.trim().length > 0);
    const queries = parsePlaceLookupQueries(inputEl.value);
    if (queries.length === 0) {
      statusEl.textContent = "①に検索したいスポットを1行1件で入力してください（例: 福岡県 ラーメン二郎目黒店）。";
      promptEl.value = "";
      geminiPlaceLookupQueries = [];
      return;
    }

    geminiPlaceLookupQueries = queries;
    promptEl.value = buildPlaceLookupPrompt(queries);
    const truncatedNote = rawLines.length > GEMINI_PLACE_LOOKUP_MAX_QUERIES
      ? `（最大${GEMINI_PLACE_LOOKUP_MAX_QUERIES}件までのため、先頭${GEMINI_PLACE_LOOKUP_MAX_QUERIES}件のみ対象にしました）`
      : "";
    statusEl.textContent = `${queries.length}件のプロンプトを生成しました。${truncatedNote}`;
  });
  btnPlaceLookupCopyPrompt.addEventListener("click", async () => {
    const promptEl = document.getElementById("place-lookup-prompt");
    if (!promptEl.value) return;
    try {
      await navigator.clipboard.writeText(promptEl.value);
    } catch (e) {
      promptEl.select();
      document.execCommand("copy");
    }
    showCopySuccess(btnPlaceLookupCopyPrompt);
  });
  btnPlaceLookupApply.addEventListener("click", () => {
    const responseEl = document.getElementById("place-lookup-response");
    const statusEl = document.getElementById("place-lookup-status");
    const results = parsePlaceLookupResponse(responseEl.value);
    if (!results) {
      alert("JSONの形式を読み取れませんでした。Geminiの回答をそのまま貼り付けてください。");
      return;
    }
    renderPlaceLookupResults(results);
    const totalCandidates = results.reduce((sum, r) => sum + r.candidates.length, 0);
    statusEl.textContent = `${results.length}件中、候補が見つかったのは${results.filter(r => r.candidates.length > 0).length}件です（候補${totalCandidates}件）。追加したいものを選んでください。`;
  });

  // 不明なスポットの確認（閉店等でGoogle側から名前が取得できなかった項目の削除確認）
  unknownSpotClose.addEventListener("click", closeUnknownSpotModal);
  btnUnknownSpotKeep.addEventListener("click", closeUnknownSpotModal);
  unknownSpotOverlay.addEventListener("click", (e) => {
    if (e.target === unknownSpotOverlay) closeUnknownSpotModal();
  });
  unknownSpotSelectAll.addEventListener("change", (e) => {
    document.querySelectorAll(".unknown-spot-checkbox").forEach(cb => {
      cb.checked = e.target.checked;
    });
  });
  btnUnknownSpotDelete.addEventListener("click", () => {
    const idsToDelete = Array.from(document.querySelectorAll(".unknown-spot-checkbox:checked"))
      .map(cb => cb.dataset.id);
    if (idsToDelete.length === 0) {
      alert("削除するスポットを選択してください。");
      return;
    }
    if (!confirm(`選択した${idsToDelete.length}件を削除します（「削除済みスポット」から復元できます）。よろしいですか？`)) return;
    moveToTrash(idsToDelete);
    setupDropdownFilters();
    filterAndRender();
    closeUnknownSpotModal();
  });

  // 削除済みスポット（ゴミ箱）
  btnDeletedSpots.addEventListener("click", openDeletedSpotsModal);
  deletedSpotsClose.addEventListener("click", closeDeletedSpotsModal);
  deletedSpotsOverlay.addEventListener("click", (e) => {
    if (e.target === deletedSpotsOverlay) closeDeletedSpotsModal();
  });

  // リンク・緯度経度 要確認（座標のハルシネーション疑いがあるまま登録されたスポットの確認）
  btnLocationReview.addEventListener("click", openLocationReviewModal);
  locationReviewClose.addEventListener("click", closeLocationReviewModal);
  locationReviewOverlay.addEventListener("click", (e) => {
    if (e.target === locationReviewOverlay) closeLocationReviewModal();
  });

  // テーブルのページネーション（実データ量が多い場合の描画負荷対策）
  paginationPrev.addEventListener("click", () => {
    if (currentTablePage > 1) {
      currentTablePage--;
      filterAndRender();
      document.querySelector(".table-card").scrollIntoView({ block: "start" });
    }
  });
  paginationNext.addEventListener("click", () => {
    currentTablePage++;
    filterAndRender();
    document.querySelector(".table-card").scrollIntoView({ block: "start" });
  });

  // カテゴリー比率チャートの集計軸切り替え（Google連動 / マイカテゴリー）
  catAxisToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-axis-toggle-btn");
    if (!btn) return;
    categoryChartAxis = btn.dataset.axis;
    catAxisToggle.querySelectorAll(".cat-axis-toggle-btn").forEach(b => {
      b.classList.toggle("active", b === btn);
    });
    filterAndRender();
  });

  // クチコミの手動追加 (Takeout's ~600-item export cap can leave reviews out)
  btnManualAdd.addEventListener("click", () => openManualAdd());
  btnManualAddEmpty.addEventListener("click", () => openManualAdd());
  manualAddClose.addEventListener("click", closeManualAdd);
  manualAddOverlay.addEventListener("click", (e) => {
    if (e.target === manualAddOverlay) closeManualAdd();
  });
  manualAddForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("manual-name").value.trim();
    if (!name) return;

    const ratingVal = document.getElementById("manual-rating").value;
    const dateVal = document.getElementById("manual-date").value;
    const input = {
      name: name,
      address: document.getElementById("manual-address").value.trim(),
      rating: ratingVal ? parseInt(ratingVal) : null,
      comment: document.getElementById("manual-comment").value.trim(),
      url: document.getElementById("manual-url").value.trim(),
      publishTime: dateVal ? dateVal.replace(/-/g, "/") : "",
      coordinateText: document.getElementById("manual-coords").value
    };

    if (editingManualPlaceId) {
      const place = places.find(p => p.id === editingManualPlaceId);
      if (place) {
        updateManualPlaceFields(place, input);
        markUnsavedChanges();
        setupDropdownFilters();
        filterAndRender();
      }
      closeManualAdd();
    } else {
      const wasEmpty = places.length === 0;
      addManualPlace(input);
      markUnsavedChanges();
      closeManualAdd();
      if (wasEmpty) showDashboard();
    }
  });

  // 手動入力データのCSVエクスポート／インポート（まとめて編集したい場合用）
  btnManualCsvExport.addEventListener("click", exportManualCSV);
  btnManualCsvImport.addEventListener("click", () => manualCsvInput.click());
  manualCsvInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await importManualCSV(file);
    manualCsvInput.value = "";
  });
}

// Open/close the マイカテゴリー management modal
function openCategorySettings() {
  renderCustomCategoryList();
  document.getElementById("category-settings-overlay").classList.add("active");
}

function closeCategorySettings() {
  document.getElementById("category-settings-overlay").classList.remove("active");
}

// Open/close the Gemini連携カテゴリー取得モーダル
function openGeminiCategoryModal() {
  document.getElementById("gemini-cat-response").value = "";
  document.getElementById("gemini-cat-result-list").innerHTML = "";
  refreshGeminiCategoryModal();
  document.getElementById("gemini-category-overlay").classList.add("active");
}

function closeGeminiCategoryModal() {
  document.getElementById("gemini-category-overlay").classList.remove("active");
}

// 未取得スポットの先頭バッチ分のプロンプトを生成してモーダルに反映する
function refreshGeminiCategoryModal() {
  const remaining = getGeminiUnclassifiedPlaces();
  const statusEl = document.getElementById("gemini-cat-status");
  const promptEl = document.getElementById("gemini-cat-prompt");

  if (remaining.length === 0) {
    statusEl.textContent = places.length === 0
      ? "データがまだ読み込まれていません。"
      : "未分類のスポットはありません。すべて取得済みです。";
    promptEl.value = "";
    geminiCategoryBatch = [];
    return;
  }

  geminiCategoryBatch = remaining.slice(0, GEMINI_CATEGORY_BATCH_SIZE);
  promptEl.value = buildGeminiCategoryPrompt(geminiCategoryBatch);
  statusEl.textContent = `未取得 ${remaining.length}件中、今回のバッチは${geminiCategoryBatch.length}件です。`;
}

// Open/close the Gemini連携 リンク・緯度経度取得モーダル
function openGeminiLocationModal() {
  document.getElementById("gemini-loc-response").value = "";
  document.getElementById("gemini-loc-result-list").innerHTML = "";
  refreshGeminiLocationModal();
  document.getElementById("gemini-location-overlay").classList.add("active");
}

function closeGeminiLocationModal() {
  document.getElementById("gemini-location-overlay").classList.remove("active");
}

// 未取得スポットの先頭バッチ分のプロンプトを生成してモーダルに反映する
function refreshGeminiLocationModal() {
  const remaining = getGeminiLocationIncompletePlaces();
  const statusEl = document.getElementById("gemini-loc-status");
  const promptEl = document.getElementById("gemini-loc-prompt");

  if (remaining.length === 0) {
    statusEl.textContent = places.length === 0
      ? "データがまだ読み込まれていません。"
      : "リンク・緯度経度が未設定のスポットはありません。すべて取得済みです。";
    promptEl.value = "";
    geminiLocationBatch = [];
    return;
  }

  geminiLocationBatch = remaining.slice(0, GEMINI_LOCATION_BATCH_SIZE);
  promptEl.value = buildGeminiLocationPrompt(geminiLocationBatch);
  statusEl.textContent = `未取得 ${remaining.length}件中、今回のバッチは${geminiLocationBatch.length}件です。`;
}

// Open the manual クチコミ add/edit modal. Pass an existing place to edit it
// in place; omit it to add a brand new manual entry.
function openManualAdd(place) {
  const form = document.getElementById("manual-add-form");
  const title = document.getElementById("manual-add-title");
  const submitBtn = document.getElementById("manual-add-submit");

  if (place) {
    editingManualPlaceId = place.id;
    document.getElementById("manual-name").value = place.name || "";
    document.getElementById("manual-address").value = place.address || "";
    document.getElementById("manual-rating").value = place.rating || "";
    document.getElementById("manual-comment").value = place.comment || "";
    document.getElementById("manual-url").value = place.url || "";
    document.getElementById("manual-date").value = place.publishTime ? place.publishTime.replace(/\//g, "-") : "";
    document.getElementById("manual-coords").value = (place.lat && place.lng) ? `${place.lat}, ${place.lng}` : "";
    title.textContent = "ログを編集";
    submitBtn.innerHTML = '<i data-lucide="save"></i> 保存する';
  } else {
    editingManualPlaceId = null;
    form.reset();
    title.textContent = "ログを手動で追加";
    submitBtn.innerHTML = '<i data-lucide="plus"></i> 追加する';
  }
  lucide.createIcons();

  document.getElementById("manual-add-overlay").classList.add("active");
  document.getElementById("manual-name").focus();
}

function closeManualAdd() {
  document.getElementById("manual-add-overlay").classList.remove("active");
  editingManualPlaceId = null;
}

// Export/import 手動入力-only records as CSV so they can be bulk-edited in a
// spreadsheet and re-imported. A matching ID updates that record in place; a
// blank/unmatched ID adds it as a new manual entry.
function exportManualCSV() {
  const manualPlaces = places.filter(p => p.source === "手動入力");
  if (manualPlaces.length === 0) {
    alert("手動入力したデータがありません。");
    return;
  }

  const csvRows = [];
  csvRows.push(["ID", "スポット名", "住所", "評価", "コメント", "投稿日", "Googleマップリンク", "緯度経度"].join(","));
  manualPlaces.forEach(p => {
    csvRows.push([
      escapeCSVValue(p.id),
      escapeCSVValue(p.name),
      escapeCSVValue(p.address),
      escapeCSVValue(p.rating ? p.rating.toString() : ""),
      escapeCSVValue(p.comment),
      escapeCSVValue(p.publishTime || ""),
      escapeCSVValue(p.url),
      escapeCSVValue(p.lat && p.lng ? `${p.lat}, ${p.lng}` : "")
    ].join(","));
  });

  const csvContent = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `manual_entries_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Shared upsert core for this app's own 手動入力 CSV export/import: detect
// columns from the header row, then for each data row either update the
// existing place with a matching ID or add it as a brand new 手動入力 entry.
// Returns null if the CSV has no recognizable スポット名 column at all.
// Used both by the dedicated "CSVから読み込む" button (importManualCSV) and by
// handleFiles' auto-detection when this kind of CSV is dropped on the main
// upload area instead (see isManualExportCSV).
function applyManualCSVRows(rows) {
  if (rows.length < 2) return { addedCount: 0, updatedCount: 0 };

  const headers = rows[0];
  const idIdx = headers.findIndex(h => /^id$/i.test(h.trim()));
  const nameIdx = headers.findIndex(h => /name|title|名前|スポット名/i.test(h));
  const addressIdx = headers.findIndex(h => /address|住所/i.test(h));
  const ratingIdx = headers.findIndex(h => /rating|評価/i.test(h));
  const commentIdx = headers.findIndex(h => /comment|コメント|クチコミ|レビュー/i.test(h));
  const dateIdx = headers.findIndex(h => /date|投稿日/i.test(h));
  const urlIdx = headers.findIndex(h => /url|link|リンク/i.test(h));
  const coordIdx = headers.findIndex(h => /緯度経度|座標|coordinates|lat.?lng/i.test(h));

  if (nameIdx === -1) return null;

  let updatedCount = 0;
  let addedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = csvField(row, nameIdx);
    if (!name) continue;

    const input = {
      name: name,
      address: csvField(row, addressIdx),
      rating: csvField(row, ratingIdx) ? parseRatingValue(csvField(row, ratingIdx)) : null,
      comment: csvField(row, commentIdx),
      url: csvField(row, urlIdx),
      publishTime: csvField(row, dateIdx) ? formatDateString(csvField(row, dateIdx)) : "",
      coordinateText: csvField(row, coordIdx)
    };

    const id = csvField(row, idIdx).trim();
    const existing = id ? places.find(p => p.id === id) : null;

    if (existing) {
      updateManualPlaceFields(existing, input);
      updatedCount++;
    } else {
      addManualPlace(input);
      addedCount++;
    }
  }

  return { addedCount, updatedCount };
}

// True when a CSV's header row matches this app's own 手動入力 export format
// (exportManualCSV always writes an "ID" column; ordinary Google Takeout /
// third-party CSVs never do). Lets the main upload area auto-detect and
// correctly restore such a file instead of silently importing it as generic,
// un-editable "CSVインポート" data (which is what happened before — dropping
// a re-exported 手動入力 CSV on the first screen lost the 編集 icon).
function isManualExportCSV(rows) {
  return rows.length > 0 && rows[0].some(h => /^id$/i.test(h.trim()));
}

async function importManualCSV(file) {
  let text;
  try {
    text = await readFileAsText(file);
  } catch (e) {
    alert(`ファイル「${file.name}」の読み込み中にエラーが発生しました。`);
    return;
  }

  const rows = parseCSVRows(text.replace(/^﻿/, ""));
  if (rows.length < 2) {
    alert("有効なデータが見つかりませんでした。");
    return;
  }

  const wasEmpty = places.length === 0;
  const result = applyManualCSVRows(rows);
  if (result === null) {
    alert("CSVに「スポット名」の列が見つかりませんでした。");
    return;
  }

  if (result.addedCount > 0 || result.updatedCount > 0) markUnsavedChanges();
  setupDropdownFilters();
  filterAndRender();
  if (wasEmpty && places.length > 0) showDashboard();

  alert(`${result.addedCount}件を新規追加、${result.updatedCount}件を更新しました。`);
}

// Render the list of user-created categories inside the settings modal
function renderCustomCategoryList() {
  const container = document.getElementById("custom-category-list");
  const keys = Object.keys(customCategories);

  if (keys.length === 0) {
    container.innerHTML = '<div class="custom-category-empty">まだマイカテゴリーはありません</div>';
    return;
  }

  container.innerHTML = "";
  keys.forEach(key => {
    const info = customCategories[key];
    const count = places.filter(p => p.myCategory === key).length;

    const row = document.createElement("div");
    row.className = "custom-category-item";
    row.innerHTML = `
      <span class="custom-category-swatch" style="background:${info.color};"></span>
      <span class="custom-category-name">${info.name}</span>
      <span class="custom-category-count">${count}件</span>
      <button class="custom-category-edit" type="button" title="編集"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
      <button class="custom-category-delete" type="button" title="削除"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
    `;
    row.querySelector(".custom-category-edit").addEventListener("click", () => startEditCustomCategory(row, key));
    row.querySelector(".custom-category-delete").addEventListener("click", () => deleteCustomCategory(key));
    container.appendChild(row);
  });

  lucide.createIcons();
}

// Switch a category row into inline edit mode. Renaming/recoloring only touches
// the customCategories registry entry — places store the category by `key`
// (see myCategory), so every place already using this category picks up the
// new name/color automatically via getAllCategories() lookups.
function startEditCustomCategory(row, key) {
  const info = customCategories[key];
  if (!info) return;

  row.classList.add("custom-category-item-editing");
  row.innerHTML = `
    <input type="color" class="custom-category-edit-color" value="${info.color}" title="カテゴリーの色">
    <input type="text" class="search-input custom-category-edit-name" value="${info.name}" maxlength="20" title="カテゴリー名">
    <button class="btn btn-primary custom-category-save" type="button">保存</button>
    <button class="btn custom-category-cancel" type="button">キャンセル</button>
  `;

  const nameInput = row.querySelector(".custom-category-edit-name");
  const colorInput = row.querySelector(".custom-category-edit-color");

  const save = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const isDuplicate = Object.entries(customCategories).some(([k, c]) => k !== key && c.name === name);
    if (isDuplicate) {
      alert("同じ名前のマイカテゴリーが既にあります。");
      return;
    }

    customCategories[key].name = name;
    customCategories[key].color = colorInput.value;
    markUnsavedChanges();

    renderCustomCategoryList();
    setupDropdownFilters();
    filterAndRender();
  };

  row.querySelector(".custom-category-save").addEventListener("click", save);
  row.querySelector(".custom-category-cancel").addEventListener("click", () => renderCustomCategoryList());
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
  nameInput.focus();
  nameInput.select();
}

// Delete a custom category, reverting any place using it back to auto-detection
function deleteCustomCategory(key) {
  const info = customCategories[key];
  if (!info) return;

  const count = places.filter(p => p.myCategory === key).length;
  const message = count > 0
    ? `「${info.name}」は${count}件のスポットで使われています。削除するとそれらのスポットは自動判定のカテゴリーに戻ります。削除しますか？`
    : `「${info.name}」を削除しますか？`;
  if (!confirm(message)) return;

  places.forEach(p => { if (p.myCategory === key) p.myCategory = null; });
  delete customCategories[key];
  markUnsavedChanges();

  renderCustomCategoryList();
  setupDropdownFilters();
  filterAndRender();
}

// Reset App State
function resetApp() {
  if (places.length > 0) {
    if (confirm(`リセットすると現在のデータ（${places.length}件）は完全に削除されます。\n先にJSONファイルとしてバックアップをダウンロードしますか？`)) {
      exportJSON();
    }
  }

  if (confirm("データをリセットしますか？")) {
    places = [];
    deletedPlaces = [];
    updateTrashBadge();
    updateLocationReviewBadge();
    customCategories = {};
    geminiCategories = {};
    clearUnsavedChanges();
    // Regardless of the current toggle state — otherwise a reset could look
    // like it worked and then silently "un-reset" itself from the cache on
    // the next page load.
    clearLocalCache();
    document.getElementById("upload-section").style.display = "block";
    document.getElementById("dashboard-section").classList.remove("visible");
    setTimeout(() => {
      document.getElementById("dashboard-section").style.display = "none";
    }, 500);
    document.getElementById("header-actions").style.display = "none";

    // Clear filters
    document.getElementById("search-box").value = "";
    document.getElementById("filter-prefecture").value = "";
    document.getElementById("filter-category-google").value = "";
    document.getElementById("filter-category-my").value = "";
    document.getElementById("filter-rating").value = "";
    document.getElementById("filter-wishlist-list").value = "";
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";

    // Clear map markers
    clearMapMarkers();
    map.setView([36.2048, 138.2529], 5);
  }
}

// Handle Uploaded Files
async function handleFiles(files) {
  if (files.length === 0) return;
  
  showLoading(true, "ファイルを解析中...", "0%");
  let newPlaces = [];
  let manualImportHappened = false;
  let manualAdded = 0;
  let manualUpdated = 0;
  let unresolvedMyCategoryNames = [];

  // The whole body runs under try/finally so showLoading(false) always fires,
  // even if something downstream of parsing (e.g. dedup/render) throws on
  // unexpected data — otherwise the loading overlay is left spinning forever
  // with no way for the user to recover short of reloading the page.
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = Math.round(((i) / files.length) * 100) + "%";
      showLoading(true, `ファイルを解析中: ${file.name}`, progress);

      try {
        const text = await readFileAsText(file);
        const ext = file.name.split('.').pop().toLowerCase();

        // Auto-detect this app's own 手動入力 CSV export (has an "ID"
        // column) even when it's dropped on the main upload area instead of
        // the dedicated "CSVから読み込む" button, so it's restored via
        // ID-matched upsert (source: 手動入力, 編集アイコンあり) rather than
        // imported as generic, un-editable "CSVインポート" rows.
        if (ext === 'csv') {
          const rows = parseCSVRows(text.replace(/^﻿/, ""));

          // This app's own full CSV export (exportCSV) — restore source
          // (手動入力/etc.) and マイ都道府県／マイカテゴリー as-is instead of
          // recomputing everything and tagging every row "CSVインポート".
          if (isAppCSVBackup(rows)) {
            const restored = parseAppCSVBackup(rows);
            newPlaces = newPlaces.concat(restored);
            if (restored.unresolvedMyCategoryNames && restored.unresolvedMyCategoryNames.length > 0) {
              unresolvedMyCategoryNames = unresolvedMyCategoryNames.concat(restored.unresolvedMyCategoryNames);
            }
            continue;
          }

          if (isManualExportCSV(rows)) {
            const result = applyManualCSVRows(rows);
            if (result) {
              manualImportHappened = true;
              manualAdded += result.addedCount;
              manualUpdated += result.updatedCount;
            }
            continue;
          }

          // Googleマップのカスタムリスト（「行ってみたい」等）のTakeout CSV。ファイル名
          // （拡張子を除いたもの）がそのままGoogleマップ上のリスト名なので、それを
          // wishlistListNameとして各レコードに持たせる（2026-07-28実装）。
          if (isSavedListCSV(rows)) {
            const listName = file.name.replace(/\.csv$/i, "");
            const savedListPlaces = parseSavedListCSV(rows, listName);
            newPlaces = newPlaces.concat(savedListPlaces);
            continue;
          }
        }

        const parsed = parseFileData(file.name, text);
        newPlaces = newPlaces.concat(parsed);
      } catch (e) {
        console.error("Error reading file:", file.name, e);
        alert(`ファイル「${file.name}」の読み込み中にエラーが発生しました。\nフォーマットをご確認ください。`);
      }
    }

    // 一覧から削除してゴミ箱に入れたスポットは、Takeout等の再インポートで自動的に
    // 復活させない（マッチキーが一致するものを取り込み対象から除外する）。
    let trashSuppressedCount = 0;
    if (newPlaces.length > 0 && deletedPlaces.length > 0) {
      const deletedKeySet = new Set(deletedPlaces.map(buildPlaceMatchKey));
      const beforeCount = newPlaces.length;
      newPlaces = newPlaces.filter(p => !deletedKeySet.has(buildPlaceMatchKey(p)));
      trashSuppressedCount = beforeCount - newPlaces.length;
    }

    const hasNewPlaces = newPlaces.length > 0;
    if (hasNewPlaces) {
      places = places.concat(newPlaces);
      // Deduplicate based on coordinates or URL or name
      places = deduplicatePlaces(places);
    }

    if (hasNewPlaces || manualImportHappened) {
      markUnsavedChanges();
      setupDropdownFilters();
      filterAndRender();
      showDashboard();
    } else if (trashSuppressedCount === 0) {
      alert("有効なGoogle Mapsデータが検出されませんでした。");
    }

    if (trashSuppressedCount > 0) {
      alert(`${trashSuppressedCount}件は削除済みスポットのため取り込みませんでした。誤って削除した場合は「削除済みスポット」から復元してください。`);
    }

    if (manualImportHappened) {
      alert(`手動入力データとして復元しました（新規${manualAdded}件・更新${manualUpdated}件）。`);
    }

    if (unresolvedMyCategoryNames.length > 0) {
      alert(
        `マイカテゴリー ${summarizeUnresolvedMyCategoryNames(unresolvedMyCategoryNames)} は未登録のため反映されませんでした。\n` +
        `先に「マイカテゴリー設定」で作成してから、もう一度CSVを読み込んでください。`
      );
    }

    // 閉店・削除済みスポット等でGoogle側から名前を取得できなかった項目が今回の
    // 取り込みに含まれていないか確認する（手動入力CSVのみの取り込みでは発生しないため対象外）。
    if (hasNewPlaces && getUnknownSpots().length > 0) {
      openUnknownSpotModal();
    }
  } catch (e) {
    console.error("Unexpected error while importing files:", e);
    alert("データの取り込み中に予期しないエラーが発生しました。ファイルの内容をご確認ください。");
  } finally {
    showLoading(false);
  }
}

// Switch from the upload screen to the loaded dashboard UI. Used both after a
// file import and after adding the first manual entry.
function showDashboard() {
  document.getElementById("upload-section").style.display = "none";
  const dash = document.getElementById("dashboard-section");
  dash.style.display = "grid";
  setTimeout(() => {
    dash.classList.add("visible");
    // Force leaflet sizing recalculation
    map.invalidateSize();
    fitMapToMarkers();
  }, 50);
  document.getElementById("header-actions").style.display = "block";
}

// Helper to read file as text
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// Robust value extraction helpers
function getRobustValue(obj, keysList) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keysList) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
}

function extractNameRobustly(props) {
  const directKeys = [
    "Title", "title", "Name", "name", "locationName", "placeName", "displayName",
    "名前", "タイトル", "店舗名", "施設名", "場所の名前"
  ];
  let val = getRobustValue(props, directKeys);
  if (val) {
    if (typeof val === 'object') {
      return val.text || val.name || "不明なスポット";
    }
    return val;
  }
  
  const locKeys = ["Location", "location", "Place", "place", "場所"];
  for (const lKey of locKeys) {
    const loc = props[lKey];
    if (loc && typeof loc === 'object') {
      const nestedVal = loc.name || loc.title || loc.displayName || loc["Location Default Name"] || loc["Business Name"] || loc["名前"] || loc["タイトル"] || loc["店舗名"] || loc["施設名"];
      if (nestedVal) {
        if (typeof nestedVal === 'object') return nestedVal.text || nestedVal.name || "不明なスポット";
        return nestedVal;
      }
    }
  }
  
  return "不明なスポット";
}

function extractAddressRobustly(props) {
  const directKeys = [
    "address", "Address", "formattedAddress", "formatted_address", "LocationAddress", "locationAddress",
    "住所", "所在地", "場所"
  ];
  let val = getRobustValue(props, directKeys);
  if (val && typeof val === 'string') return val;

  const locKeys = ["Location", "location", "Place", "place", "場所"];
  for (const lKey of locKeys) {
    const loc = props[lKey];
    if (loc && typeof loc === 'object') {
      const nestedVal = loc["Location Default Name"] || loc["Address"] || loc["address"] || loc["formattedAddress"] || loc["formatted_address"] || loc["住所"] || loc["所在地"];
      if (nestedVal && typeof nestedVal === 'string') return nestedVal;
    }
  }

  return "";
}

function extractUrlRobustly(props) {
  const directKeys = [
    "URL", "url", "googleMapsUrl", "GoogleMapsUrl", "Google Maps URL", "link", "Link",
    "リンク", "マップリンク", "googleMapsLink", "GoogleMapsLink", "google_maps_url"
  ];
  let val = getRobustValue(props, directKeys);
  if (val && typeof val === 'string') return val;

  const locKeys = ["Location", "location", "Place", "place", "場所"];
  for (const lKey of locKeys) {
    const loc = props[lKey];
    if (loc && typeof loc === 'object') {
      const nestedVal = loc["url"] || loc["URL"] || loc["googleMapsUrl"] || loc["link"] || loc["リンク"];
      if (nestedVal && typeof nestedVal === 'string') return nestedVal;
    }
  }

  return "";
}

function extractCommentRobustly(props) {
  const directKeys = [
    "Comment", "comment", "Note", "note", "Memo", "memo", "description", "Description",
    "review", "Review", "reviewText", "text",
    "コメント", "メモ", "説明", "クチコミ", "レビュー", "クチコミの本文", "review_text_published"
  ];
  let val = getRobustValue(props, directKeys);
  if (val) {
    if (typeof val === 'object') return val.text || val.comment || val.note || "";
    return val;
  }

  const locKeys = ["review", "Comment", "comment"];
  for (const lKey of locKeys) {
    const nested = props[lKey];
    if (nested && typeof nested === 'object') {
      const nestedVal = nested.text || nested.comment || nested.reviewText || nested.note;
      if (nestedVal) return nestedVal;
    }
  }

  return "";
}

function parseRatingValue(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return Math.round(val);
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    
    // Check if it consists of star characters
    const starsCount = (s.match(/[★]/g) || []).length;
    if (starsCount > 0) return starsCount;
    
    // Check patterns like "5つ星のうち4", "4つ星"
    const starMatch = s.match(/([1-5])つ星/);
    if (starMatch) return parseInt(starMatch[1]);

    const starMatch2 = s.match(/星\s*([1-5])/);
    if (starMatch2) return parseInt(starMatch2[1]);

    // Check fractions like "4/5" or "4 / 5"
    const fractionMatch = s.match(/^([1-5])\s*\/\s*5/);
    if (fractionMatch) return parseInt(fractionMatch[1]);
    
    // English labels
    const uVal = s.toUpperCase();
    if (uVal === 'FIVE' || uVal === '5') return 5;
    if (uVal === 'FOUR' || uVal === '4') return 4;
    if (uVal === 'THREE' || uVal === '3') return 3;
    if (uVal === 'TWO' || uVal === '2') return 2;
    if (uVal === 'ONE' || uVal === '1') return 1;

    // Direct number
    const num = parseInt(s);
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
  }
  return null;
}

function extractRatingRobustly(props) {
  const directKeys = [
    "rating", "Rating", "starRating", "StarRating", "score", "Score",
    "評価", "星", "評価（星5つ中）", "評価（星）", "得点", "five_star_rating_published"
  ];
  let val = getRobustValue(props, directKeys);
  if (val === undefined || val === null) {
    const nestedKeys = ["review", "rating", "Comment", "comment"];
    for (const nKey of nestedKeys) {
      const nested = props[nKey];
      if (nested && typeof nested === 'object') {
        val = nested.rating || nested.starRating || nested.score;
        if (val !== undefined && val !== null) break;
      }
    }
  }

  return parseRatingValue(val);
}

function formatDateString(val) {
  try {
    let parsedVal = val;
    if (typeof val === 'number') {
      if (val < 10000000000) parsedVal = val * 1000;
    } else if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
      const num = parseInt(val.trim());
      parsedVal = num < 10000000000 ? num * 1000 : num;
    }
    
    const d = new Date(parsedVal);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
  } catch (e) {}
  return String(val);
}

function extractPublishTimeRobustly(props) {
  const keys = [
    "publishTime", "PublishTime", "published", "Published", 
    "createTime", "CreateTime", "createTimestamp", "CreateTimestamp", "date", "Date", "timestamp", "Timestamp",
    "created", "Created", "作成日時", "投稿日時", "投稿日", "作成日", "初投稿日"
  ];
  let val = getRobustValue(props, keys);
  if (val) {
    return formatDateString(val);
  }
  return "";
}

function extractUpdateTimeRobustly(props) {
  const keys = [
    "updateTime", "UpdateTime", "updated", "Updated", 
    "updateTimestamp", "UpdateTimestamp", "modifyTime", "ModifyTime", "lastModified", "LastModified",
    "更新日時", "更新日", "最終更新日", "修正日"
  ];
  let val = getRobustValue(props, keys);
  if (val) {
    return formatDateString(val);
  }
  return "";
}


// Parse File Content (JSON, GeoJSON, CSV)
function parseFileData(filename, content) {
  const ext = filename.split('.').pop().toLowerCase();
  
  if (ext === 'geojson' || filename.includes('Saved places') || filename.includes('保存済みの場所')) {
    try {
      const json = JSON.parse(content);
      if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
        return parseSavedPlacesGeoJSON(json);
      }
    } catch (e) { /* ignore and try other parsers */ }
  }

  if (ext === 'json') {
    try {
      let json = JSON.parse(content);
      
      // If it is wrapped in an object with a reviews array
      if (json && !Array.isArray(json) && Array.isArray(json.reviews)) {
        json = json.reviews;
      }
      
      // If it is wrapped in an object with a features array (GeoJSON)
      if (json && !Array.isArray(json) && Array.isArray(json.features)) {
        return parseSavedPlacesGeoJSON(json);
      }
      
      if (Array.isArray(json)) {
        // Restore from this app's own JSON export (e.g. the pre-reset backup) as-is,
        // without recomputing category/prefecture or losing coordinates to a key-name mismatch.
        const isAppBackup = json.length > 0 && json[0].categoryKey !== undefined;
        if (isAppBackup) {
          return parseAppBackupJSON(json);
        }

        const isReviews = json.length > 0 && (
          json[0].review || json[0].place || json[0].comment || 
          json[0].title || json[0].starRating || json[0].location || 
          (json[0].latitude && json[0].longitude) ||
          json[0].reviewText || json[0].text ||
          json[0].評価 || json[0].コメント || json[0].タイトル ||
          json[0].店舗名 || json[0].施設名 || json[0].名前 ||
          json[0].住所 || json[0].クチコミ || json[0].レビュー ||
          json[0]["評価（星5つ中）"] || json[0]["評価（星）"]
        );
        if (isReviews) {
          return parseReviewsJSON(json);
        } else if (json.length > 0 && json[0].features) {
          // Sometimes GeoJSON is wrapped inside an array
          return parseSavedPlacesGeoJSON(json[0]);
        }
      } else if (json.features) {
        return parseSavedPlacesGeoJSON(json);
      }
    } catch (e) { /* ignore */ }
  }

  if (ext === 'csv') {
    return parseCSVData(content);
  }

  return [];
}

// Parse Google Takeout GeoJSON (Saved Places)
function parseSavedPlacesGeoJSON(geojson) {
  const parsed = [];
  geojson.features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;
    
    const props = feature.properties || {};
    const name = extractNameRobustly(props);
    const address = extractAddressRobustly(props);
    const url = extractUrlRobustly(props);
    const comment = extractCommentRobustly(props);
    const rating = extractRatingRobustly(props);
    const publishTime = extractPublishTimeRobustly(props);
    const updateTime = extractUpdateTimeRobustly(props);
    
    const lng = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];
    
    const pref = extractPrefecture(address, name, lat, lng);
    const cat = classifyCategory(name, comment);
    
    parsed.push({
      id: `saved-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
      name: name,
      address: address,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      prefecture: pref,
      category: cat,
      googleCategoryRaw: null,
      myPrefecture: null,
      myCategory: null,
      rating: rating,
      comment: comment,
      url: url,
      source: "保存済みの場所",
      publishTime: publishTime,
      updateTime: updateTime
    });
  });
  return parsed;
}

// Parse Google Takeout Reviews JSON
function parseReviewsJSON(json) {
  const parsed = [];
  json.forEach((item, index) => {
    const name = extractNameRobustly(item);
    const address = extractAddressRobustly(item);

    // Coordinates extraction
    let lat = null;
    let lng = null;
    if (item.latitude !== undefined && item.longitude !== undefined) {
      lat = item.latitude;
      lng = item.longitude;
    } else if (item.lat !== undefined && item.lng !== undefined) {
      lat = item.lat;
      lng = item.lng;
    } else if (item.location && (item.location.latitude !== undefined || item.location.lat !== undefined)) {
      lat = item.location.latitude || item.location.lat;
      lng = item.location.longitude || item.location.lng;
    } else if (item.place && item.place.location) {
      lat = item.place.location.latitude || item.place.location.lat || item.place.location.latitudeE7 / 1e7 || null;
      lng = item.place.location.longitude || item.place.location.lng || item.place.location.longitudeE7 / 1e7 || null;
    } else if (item.place && (item.place.latitude !== undefined || item.place.lat !== undefined)) {
      lat = item.place.latitude || item.place.lat;
      lng = item.place.longitude || item.place.lng;
    } else if (item.geo) {
      lat = item.geo.latitude || item.geo.lat;
      lng = item.geo.longitude || item.geo.lng;
    }

    if (lat !== null && lat !== undefined) lat = parseFloat(lat);
    if (lng !== null && lng !== undefined) lng = parseFloat(lng);

    const comment = extractCommentRobustly(item);
    const rating = extractRatingRobustly(item);
    const url = extractUrlRobustly(item);
    const publishTime = extractPublishTimeRobustly(item);
    const updateTime = extractUpdateTimeRobustly(item);

    // Pref and Cat
    const pref = extractPrefecture(address, name, lat, lng);
    const cat = classifyCategory(name, comment);

    parsed.push({
      id: `review-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
      name: name,
      address: address,
      lat: lat,
      lng: lng,
      prefecture: pref,
      category: cat,
      googleCategoryRaw: null,
      myPrefecture: null,
      myCategory: null,
      rating: rating,
      comment: comment,
      url: url,
      source: "クチコミ投稿",
      publishTime: publishTime,
      updateTime: updateTime
    });
  });
  return parsed;
}

// Restore places from this app's own JSON export, preserving saved
// category/prefecture/coordinates instead of recomputing them.
function parseAppBackupJSON(json) {
  return json.map((item, index) => {
    const coords = item.coordinates || {};
    // googleCategoryRawがあれば常にそこから再生成する（同じラベルは常に同じキー・同じ色に
    // なるので自己修復的に復元できる）。なければ従来通り、固定12種のキーかヒューリスティック。
    let category;
    if (item.googleCategoryRaw) {
      category = getOrCreateGeminiCategory(item.googleCategoryRaw);
    } else if (CATEGORIES[item.categoryKey]) {
      category = item.categoryKey;
    } else {
      category = classifyCategory(item.name || "", item.comment || "");
    }

    // myCategoryKey may point at a built-in category, a マイカテゴリー the user made
    // in an earlier session, or a Gemini由来のGoogle連動カテゴリーをマイカテゴリーとして
    // 選んだもの；後者2つは再登録して、設定モーダル/ドロップダウンに再度現れるようにする。
    let myCategory = null;
    if (CATEGORIES[item.myCategoryKey]) {
      myCategory = item.myCategoryKey;
    } else if (item.myCategoryKey && item.myCategoryKey.startsWith("gemini_") && item.myCategoryName) {
      myCategory = getOrCreateGeminiCategory(item.myCategoryName);
    } else if (item.myCategoryKey && item.myCategoryName) {
      registerCustomCategory(item.myCategoryKey, item.myCategoryName, item.myCategoryColor);
      myCategory = item.myCategoryKey;
    }

    return {
      id: `backup-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
      name: item.name || "不明なスポット",
      address: item.address || "",
      lat: coords.latitude !== undefined ? parseFloat(coords.latitude) : null,
      lng: coords.longitude !== undefined ? parseFloat(coords.longitude) : null,
      prefecture: item.prefecture || "その他・海外",
      category: category,
      googleCategoryRaw: item.googleCategoryRaw || null,
      myPrefecture: item.myPrefecture || null,
      myCategory: myCategory,
      rating: item.rating ?? null,
      comment: item.comment || "",
      url: item.googleMapsUrl || "",
      source: item.source || "JSONバックアップ復元",
      publishTime: item.publishTime || "",
      updateTime: item.updateTime || "",
      locationNeedsReview: item.locationNeedsReview || false,
      locationReviewReason: item.locationReviewReason || null,
      wishlistListName: item.wishlistListName || null,
      wishlistMemo: item.wishlistMemo || null,
      wishlistTags: item.wishlistTags || null,
      wishlistComment: item.wishlistComment || null
    };
  });
}

// True when a CSV's header row matches this app's own full data export
// (exportCSV always writes a "データソース" column; ordinary Google Takeout /
// third-party CSVs never do).
function isAppCSVBackup(rows) {
  return rows.length > 0 && rows[0].some(h => /^データソース$/.test(h.trim()));
}

// Restore this app's own full CSV export (exportCSV) as-is: keeps 手動入力/
// other source values (so the 編集 icon still shows for manual entries) and
// マイ都道府県／マイカテゴリー overrides, instead of recomputing everything
// and tagging every row generic "CSVインポート" like a third-party CSV would
// get. Mirrors parseAppBackupJSON, but exportCSV stores category *names*
// (for Excel-friendliness) rather than internal keys/colors, so a custom
// マイカテゴリー that isn't already registered in this session (e.g. a fresh
// reload) can't be fully reconstructed from CSV alone — only its assignment
// is lost, falling back to no override. Use the JSON export for a fully
// lossless backup/restore.
function parseAppCSVBackup(rows) {
  const headers = rows[0];
  const nameIdx = headers.findIndex(h => /^スポット名$/.test(h.trim()));
  const prefIdx = headers.findIndex(h => /^都道府県$/.test(h.trim()));
  const myPrefIdx = headers.findIndex(h => /^マイ都道府県$/.test(h.trim()));
  const catIdx = headers.findIndex(h => /^カテゴリー$/.test(h.trim()));
  const myCatIdx = headers.findIndex(h => /^マイカテゴリー$/.test(h.trim()));
  const addressIdx = headers.findIndex(h => /^住所$/.test(h.trim()));
  const ratingIdx = headers.findIndex(h => /^評価$/.test(h.trim()));
  const commentIdx = headers.findIndex(h => /^レビュー・メモ$/.test(h.trim()));
  // 2026-07-26まではこのCSVに「初投稿日」（実データ上の意味ある日付）と「最終更新日」
  // （実データではほぼ空。詳細はSPEC.md参照）の2列があったが、「最終更新日」1列に統合した。
  // 旧フォーマットのCSVを読み込んだ場合は「初投稿日」列を優先し、新フォーマットのCSVでは
  // 「最終更新日」列を読む。
  const legacyPublishIdx = headers.findIndex(h => /^初投稿日$/.test(h.trim()));
  const updateIdx = headers.findIndex(h => /^最終更新日$/.test(h.trim()));
  const publishIdx = legacyPublishIdx !== -1 ? legacyPublishIdx : updateIdx;
  const latIdx = headers.findIndex(h => /^緯度$/.test(h.trim()));
  const lngIdx = headers.findIndex(h => /^経度$/.test(h.trim()));
  const urlIdx = headers.findIndex(h => /^Googleマップリンク$/.test(h.trim()));
  const sourceIdx = headers.findIndex(h => /^データソース$/.test(h.trim()));

  const nameToKey = {};
  Object.entries(getAllCategories()).forEach(([key, info]) => { nameToKey[info.name] = key; });

  const parsed = [];
  // Names typed into the マイカテゴリー column that don't match any category
  // this app currently knows about (no color info to reconstruct them from,
  // per the CSV round-trip limitation in SPEC.md §4) — one entry per affected
  // row, so the caller can tell the user exactly what silently didn't apply.
  const unresolvedMyCategoryNames = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = csvField(row, nameIdx);
    if (!name) continue;

    const comment = csvField(row, commentIdx);
    const catName = csvField(row, catIdx);
    const category = nameToKey[catName] || classifyCategory(name, comment);

    const myCatName = csvField(row, myCatIdx);
    let myCategory = null;
    if (myCatName) {
      if (nameToKey[myCatName]) {
        myCategory = nameToKey[myCatName];
      } else {
        unresolvedMyCategoryNames.push(myCatName);
      }
    }

    const latRaw = csvField(row, latIdx);
    const lngRaw = csvField(row, lngIdx);
    const ratingRaw = csvField(row, ratingIdx);

    parsed.push({
      id: `csvbackup-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      name: name,
      address: csvField(row, addressIdx),
      lat: latRaw ? parseFloat(latRaw) : null,
      lng: lngRaw ? parseFloat(lngRaw) : null,
      prefecture: csvField(row, prefIdx) || "その他・海外",
      category: category,
      googleCategoryRaw: null,
      myPrefecture: csvField(row, myPrefIdx) || null,
      myCategory: myCategory,
      rating: ratingRaw ? parseRatingValue(ratingRaw) : null,
      comment: comment,
      url: csvField(row, urlIdx),
      source: csvField(row, sourceIdx) || "CSVインポート",
      // Excel等で編集された日付は "2021/1/5" のようにゼロ埋めが崩れて返ってくることがあるため、
      // 他の取り込み経路（JSON復元・手動追加フォーム等）と同じくformatDateStringで
      // "YYYY/MM/DD" に揃える（回帰: ゼロ埋め表記ゆれが最終更新日ソート/絞り込みを狂わせていた不具合）
      publishTime: csvField(row, publishIdx) ? formatDateString(csvField(row, publishIdx)) : "",
      updateTime: csvField(row, updateIdx) ? formatDateString(csvField(row, updateIdx)) : ""
    });
  }
  // Attached to the array (not a {places, warnings} wrapper) so every
  // existing caller/test that treats the return value as a plain places
  // array keeps working unchanged; callers that care can opt in via this.
  parsed.unresolvedMyCategoryNames = unresolvedMyCategoryNames;
  return parsed;
}

// Turns a flat list of unresolved マイカテゴリー names (one entry per
// affected row, possibly with duplicates across several imported files)
// into a human-readable summary for the post-import warning, e.g.
// 「ラーメン」(2件)、「よく行く店」(1件)
function summarizeUnresolvedMyCategoryNames(names) {
  if (!names || names.length === 0) return "";
  const counts = {};
  names.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  return Object.entries(counts).map(([name, count]) => `「${name}」(${count}件)`).join("、");
}

// Parse CSV Format
function parseCSVData(csvText) {
  const parsed = [];
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  // Parse headers
  const headers = rows[0];
  const nameIdx = headers.findIndex(h => /name|title|名前|スポット名|店舗名|施設名|場所の名前/i.test(h));
  const addressIdx = headers.findIndex(h => /address|location|住所|場所|所在地/i.test(h));
  const latIdx = headers.findIndex(h => /lat|latitude|緯度/i.test(h));
  const lngIdx = headers.findIndex(h => /lng|lon|longitude|経度/i.test(h));
  const commentIdx = headers.findIndex(h => /comment|note|memo|desc|コメント|メモ|クチコミ|クチコミの本文|レビュー|説明|詳細/i.test(h));
  const urlIdx = headers.findIndex(h => /url|link|リンク|マップリンク|map/i.test(h));
  const ratingIdx = headers.findIndex(h => /rating|star|星|評価|得点/i.test(h));
  const publishIdx = headers.findIndex(h => /publish|create|date|timestamp|投稿日|作成日/i.test(h));
  const updateIdx = headers.findIndex(h => /update|modify|last|更新日|最終更新日/i.test(h));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const name = csvField(row, nameIdx) || "名称未設定";
    if (!name || name === "名称未設定") continue;

    const address = csvField(row, addressIdx);
    const latRaw = csvField(row, latIdx);
    const lngRaw = csvField(row, lngIdx);
    const lat = latRaw ? parseFloat(latRaw) : null;
    const lng = lngRaw ? parseFloat(lngRaw) : null;
    const comment = csvField(row, commentIdx);
    const url = csvField(row, urlIdx);
    const ratingRaw = csvField(row, ratingIdx);
    const rating = ratingRaw ? parseRatingValue(ratingRaw) : null;
    const publishRaw = csvField(row, publishIdx);
    const updateRaw = csvField(row, updateIdx);
    const publishTime = publishRaw ? formatDateString(publishRaw) : "";
    const updateTime = updateRaw ? formatDateString(updateRaw) : "";

    const pref = extractPrefecture(address, name, lat, lng);
    const cat = classifyCategory(name, comment);

    parsed.push({
      id: `csv-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      name: name,
      address: address,
      lat: lat && !isNaN(lat) ? lat : null,
      lng: lng && !isNaN(lng) ? lng : null,
      prefecture: pref,
      category: cat,
      googleCategoryRaw: null,
      myPrefecture: null,
      myCategory: null,
      rating: rating,
      comment: comment,
      url: url,
      source: "CSVインポート",
      publishTime: publishTime,
      updateTime: updateTime
    });
  }

  return parsed;
}

// --- Googleマップのカスタムリスト（「行ってみたい」等）CSVの取り込み（2026-07-28実装）---
// Google Takeoutの「保存済みの場所」フォルダには、Saved places.json（全件）とは別に、
// ユーザーが作成したカスタムリストがリスト名そのままのファイル名のCSVとして個別に含まれる
// （例: 行ってみたい.csv）。ヘッダーは「タイトル,メモ,URL,タグ,コメント」固定で、住所・
// 緯度経度・評価は一切含まれない。上のparseCSVDataは名前列判定が英語"title"のみを見ており
// 「タイトル」という表記にはマッチしないため、そのままではこのCSVは1件も取り込めなかった。
function isSavedListCSV(rows) {
  if (rows.length === 0) return false;
  const headers = rows[0].map(h => h.trim());
  const hasTitle = headers.some(h => /^タイトル$/.test(h));
  const hasUrl = headers.some(h => /url|link|リンク/i.test(h));
  const hasAddressOrCoords = headers.some(h => /address|location|住所|所在地|lat|latitude|緯度|lng|lon|longitude|経度/i.test(h));
  return hasTitle && hasUrl && !hasAddressOrCoords;
}

// 上記のカスタムリストCSVをplace形状のレコードへ変換する。住所・緯度経度が無いため
// 都道府県は「その他・海外」・カテゴリーは店名のみからのヒューリスティック判定になる
// （後日クチコミ等が同じURLで取り込まれれば、deduplicatePlacesの追従上書きにより
// 正しい住所・カテゴリー・評価へ自動的に置き換わる）。listNameは呼び出し元（handleFiles）
// がCSVのファイル名（拡張子を除いたもの＝Googleマップ上のリスト名そのもの）を渡す。
// メモ・タグ・コメントは既存のcomment（クチコミ本文）とは別物としてwishlistMemo/
// wishlistTags/wishlistCommentに保持する（同じ場所が「クチコミ投稿」等で既に登録済みの
// 場合も、既存のcommentを上書きしてしまわないようにするため）。
function parseSavedListCSV(rows, listName) {
  const parsed = [];
  if (rows.length < 2) return parsed;

  const headers = rows[0];
  const nameIdx = headers.findIndex(h => /^タイトル$/.test(h.trim()));
  const urlIdx = headers.findIndex(h => /url|link|リンク/i.test(h));
  const memoIdx = headers.findIndex(h => /^メモ$/.test(h.trim()));
  const tagsIdx = headers.findIndex(h => /^タグ$/.test(h.trim()));
  const commentIdx = headers.findIndex(h => /^コメント$/.test(h.trim()));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = csvField(row, nameIdx) || "不明なスポット";
    const url = csvField(row, urlIdx);
    if (!url && name === "不明なスポット") continue;

    parsed.push({
      id: `savedlist-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      name: name,
      address: "",
      lat: null,
      lng: null,
      prefecture: "その他・海外",
      category: classifyCategory(name, ""),
      googleCategoryRaw: null,
      myPrefecture: null,
      myCategory: null,
      rating: null,
      comment: "",
      url: url,
      source: "行きたいリスト",
      publishTime: "",
      updateTime: "",
      wishlistListName: listName || null,
      wishlistMemo: csvField(row, memoIdx),
      wishlistTags: csvField(row, tagsIdx),
      wishlistComment: csvField(row, commentIdx)
    });
  }

  return parsed;
}

// Parse an entire CSV text into rows (each an array of trimmed field
// strings). Handles quoted fields that contain commas AND embedded newlines
// (e.g. a multi-paragraph クチコミ comment) — splitting the text into lines
// with .split(/\r?\n/) *before* parsing quotes (the previous approach) breaks
// those rows apart mid-field, misaligning every column that follows and
// eventually feeding undefined values into deduplicatePlaces.
function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (c === '\r') {
        // drop bare CR (from CRLF line endings inside the quoted field)
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field.trim());
      field = '';
    } else if (c === '\r') {
      // ignore; the row ends on \n below
    } else if (c === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  // Last field/row when the file doesn't end with a trailing newline
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter(r => r.some(f => f !== ''));
}

// Safe indexed field access: a malformed/short CSV row (or a header column
// that simply wasn't found, idx === -1) should read as "" rather than throw
// later when something calls .toLowerCase()/.trim() on it.
function csvField(row, idx) {
  return idx !== -1 && row[idx] !== undefined ? row[idx] : "";
}

// Parse a coordinate pair pasted in the "lat, lng" form Google Maps shows in
// its URL/share sheet (e.g. "35.6586, 139.7454"). Returns { lat, lng } or null.
function parseCoordinatePair(text) {
  if (!text) return null;
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

// Compute the hand-entered/derived fields shared by "add a new manual place"
// and "edit an existing place's manually-entered fields" (id/source/myカテゴリー
// axis are intentionally excluded here since those differ between add vs. edit).
function buildManualPlaceFields(input) {
  const coords = parseCoordinatePair(input.coordinateText);
  const lat = coords ? coords.lat : null;
  const lng = coords ? coords.lng : null;
  const address = input.address || "";
  const comment = input.comment || "";

  return {
    name: input.name,
    address: address,
    lat: lat,
    lng: lng,
    prefecture: extractPrefecture(address, input.name, lat, lng),
    category: classifyCategory(input.name, comment),
    rating: input.rating || null,
    comment: comment,
    url: input.url || "",
    publishTime: input.publishTime || "",
    updateTime: input.publishTime || ""
  };
}

// Add a single hand-entered place (e.g. a review posted on Google Maps that
// Takeout didn't capture, such as when the 600-review export cap is hit).
// Runs through the same classify/dedup pipeline as any imported record so it
// merges into an existing entry instead of creating a near-duplicate.
function addManualPlace(input) {
  const newPlace = {
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...buildManualPlaceFields(input),
    googleCategoryRaw: null,
    myPrefecture: null,
    myCategory: null,
    source: "手動入力"
  };

  places = places.concat([newPlace]);
  places = deduplicatePlaces(places);

  setupDropdownFilters();
  filterAndRender();
}

// Apply edits to an existing place's hand-entered fields (used by the
// single-entry edit form and by re-importing a 手動入力 CSV whose ID matches
// an existing record). マイ都道府県/マイカテゴリーは触れない — only the
// Google連動 axis (prefecture/category) is recomputed from the edited name/address.
function updateManualPlaceFields(place, input) {
  Object.assign(place, buildManualPlaceFields(input));
  // Keep the Gemini/Places由来の生カテゴリーと表示用category の対応を保つ
  // （編集で名前/住所が変わってもclassifyCategoryへ巻き戻さない）。
  if (place.googleCategoryRaw) {
    place.category = getOrCreateGeminiCategory(place.googleCategoryRaw);
  }
}

// "YYYY/MM/DD" と "YYYY-MM-DD"、さらに月日がゼロ埋めされていない場合（"2021/1/5"）でも
// 文字列の大小比較だけで正しく新旧判定できるよう、区切り文字を揃えた上で年月日をゼロ埋めする。
// ゼロ埋めが揃っていないと、例えば"2021/1/5"と"2021/01/05"のような表記ゆれ同士で
// 文字列比較が実際の日付の前後関係と逆転してしまう（回帰: 手入力分をCSVから読み込んだ際に
// 混在した表記が最終更新日ソートを狂わせていた不具合）。
function normalizeDateForCompare(dateStr) {
  const trimmed = (dateStr || "").trim();
  if (!trimmed) return "";
  const parts = trimmed.replace(/-/g, "/").split("/");
  if (parts.length !== 3 || parts.some(p => !p || isNaN(p))) return trimmed;
  const [y, m, d] = parts;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 「同一スポットか」を判定するマッチキー。URL→緯度経度→名前+住所の3段階（重複排除・
// ゴミ箱による再登録抑止の両方で共通して使う）。
function buildPlaceMatchKey(item) {
  if (item.url) {
    return item.url;
  } else if (item.lat && item.lng) {
    return `${(item.name || "").toLowerCase()}-${item.lat.toFixed(4)}-${item.lng.toFixed(4)}`;
  }
  return `${(item.name || "").toLowerCase()}-${(item.address || "").toLowerCase()}`;
}

// Deduplicate places list
function deduplicatePlaces(list) {
  // Keyed by the same match key used to detect duplicates (URL, else
  // name+coordinates, else name+address as a last resort for records with
  // neither — e.g. hand-added spots Gemini couldn't geocode). Using one Map
  // for both registration and lookup guarantees a record recognized as a
  // duplicate always has a mergeable `existing` counterpart; a previous
  // version computed the key with a name+address fallback but only ever
  // looked up `existing` by URL/coordinates, so name+address-only duplicates
  // were silently dropped — recognized as dupes but never merged, losing
  // whatever the incoming record had (rating/comment/date/etc.) entirely.
  const uniqueByKey = new Map();

  list.forEach(item => {
    const key = buildPlaceMatchKey(item);

    const existing = uniqueByKey.get(key);
    if (!existing) {
      uniqueByKey.set(key, item);
    } else {
      // Googleマップ側でレビュー本文・評価が編集されると、Takeoutの再エクスポートで
      // 最終更新日が新しくなって返ってくる。手動入力レコード以外は、取り込みデータの
      // 方が新しければGoogle由来フィールドを追従上書きする。手動入力（source: "手動入力"）
      // はユーザーが直接編集したデータなので対象外。
      // （2026-07-26修正：以前はupdateTimeフィールドで新旧判定していたが、Google Takeoutは
      // 真の初回投稿日を出力せずpublishTimeが編集のたびに更新される一方、updateTimeに
      // 対応する実データはほぼ常に空だったため、この判定は実運用でまともに機能していな
      // かった。publishTimeベースの判定に切り替えた。詳細は4節）
      const incomingIsNewer = existing.source !== "手動入力" && item.publishTime &&
        (!existing.publishTime || normalizeDateForCompare(item.publishTime) > normalizeDateForCompare(existing.publishTime));

      if (incomingIsNewer) {
        if (item.comment) existing.comment = item.comment;
        if (item.rating) existing.rating = item.rating;
        if (item.address) existing.address = item.address;
        if (item.prefecture) existing.prefecture = item.prefecture;
        existing.publishTime = item.publishTime;
        if (item.googleCategoryRaw) {
          existing.googleCategoryRaw = item.googleCategoryRaw;
          existing.category = getOrCreateGeminiCategory(item.googleCategoryRaw);
        }
      } else {
        if (!existing.comment && item.comment) existing.comment = item.comment;
        if (!existing.rating && item.rating) existing.rating = item.rating;
        if (!existing.address && item.address) existing.address = item.address;
        if (!existing.publishTime && item.publishTime) existing.publishTime = item.publishTime;
        if (!existing.updateTime && item.updateTime) existing.updateTime = item.updateTime;
        // Google連動カテゴリーの生データも同様に、既存側が未取得のときだけ埋め合わせる
        if (!existing.googleCategoryRaw && item.googleCategoryRaw) {
          existing.googleCategoryRaw = item.googleCategoryRaw;
          existing.category = getOrCreateGeminiCategory(item.googleCategoryRaw);
        }
      }

      // マイ都道府県/マイカテゴリーは常にユーザー編集を優先し、未設定の場合のみ埋め合わせる
      // （Google側の更新日に関わらず、フレッシュな取り込みで上書きされることはない）。
      if (!existing.myPrefecture && item.myPrefecture) existing.myPrefecture = item.myPrefecture;
      if (!existing.myCategory && item.myCategory) existing.myCategory = item.myCategory;

      // 「行ってみたい」等のカスタムリスト由来フィールドも、新旧判定に関わらず
      // 常に「既存が空欄の場合のみ埋め合わせ」で保護する。行きたいリストで先に取り込んだ後
      // クチコミが後から来ても（あるいは逆順でも）、両方の情報が1レコードに統合される
      // （2026-07-28実装。詳細はSPEC.md参照）。
      if (!existing.wishlistListName && item.wishlistListName) existing.wishlistListName = item.wishlistListName;
      if (!existing.wishlistMemo && item.wishlistMemo) existing.wishlistMemo = item.wishlistMemo;
      if (!existing.wishlistTags && item.wishlistTags) existing.wishlistTags = item.wishlistTags;
      if (!existing.wishlistComment && item.wishlistComment) existing.wishlistComment = item.wishlistComment;
    }
  });

  return Array.from(uniqueByKey.values());
}

// --- 削除済みスポット（ゴミ箱） ---
// 一覧の削除ボタン・不明なスポットの一括削除は、どちらもここを経由して「即消去」ではなく
// ゴミ箱送りにする。ゴミ箱にある間はマッチキー（buildPlaceMatchKey）がhandleFilesの
// 取り込みフィルターに使われ、Takeout等の再インポートで自動的に復活しないようにする。
function moveToTrash(ids) {
  const idSet = new Set(ids);
  const toDelete = places.filter(p => idSet.has(p.id));
  if (toDelete.length === 0) return;
  places = places.filter(p => !idSet.has(p.id));
  deletedPlaces = deletedPlaces.concat(toDelete);
  markUnsavedChanges();
  updateTrashBadge();
}

function restorePlaceFromTrash(id) {
  const idx = deletedPlaces.findIndex(p => p.id === id);
  if (idx === -1) return;
  const [place] = deletedPlaces.splice(idx, 1);
  places.push(place);
  markUnsavedChanges();
  setupDropdownFilters();
  filterAndRender();
  renderDeletedSpotsList();
  updateTrashBadge();
}

// ゴミ箱から完全に消す（＝以後は再インポートで復活してよい、という明示的な選択）。
// exportJSON/saveToDrive同様の「取り消せる保存」ではなく端末ローカルの一時領域なので、
// hasUnsavedChangesは動かさずローカルキャッシュの書き込みだけ予約する。
function purgePlaceFromTrash(id) {
  deletedPlaces = deletedPlaces.filter(p => p.id !== id);
  scheduleLocalCacheWrite();
  renderDeletedSpotsList();
  updateTrashBadge();
}

function updateTrashBadge() {
  const badge = document.getElementById("deleted-spots-count");
  if (!badge) return;
  badge.textContent = deletedPlaces.length > 0 ? `(${deletedPlaces.length})` : "";
}

function renderDeletedSpotsList() {
  const listEl = document.getElementById("deleted-spots-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (deletedPlaces.length === 0) {
    const empty = document.createElement("p");
    empty.className = "unknown-spot-empty";
    empty.textContent = "削除済みスポットはありません。";
    listEl.appendChild(empty);
    return;
  }

  deletedPlaces.forEach(spot => {
    const item = document.createElement("div");
    item.className = "unknown-spot-item deleted-spot-item";

    const info = document.createElement("div");
    info.className = "unknown-spot-item-info";
    const nameEl = document.createElement("strong");
    nameEl.textContent = spot.name;
    info.appendChild(nameEl);
    const metaEl = document.createElement("span");
    const metaParts = [
      spot.address || "住所不明",
      spot.prefecture || "都道府県不明",
      spot.rating ? `★${spot.rating}` : "評価なし"
    ].filter(Boolean);
    metaEl.textContent = metaParts.join(" / ");
    info.appendChild(metaEl);
    item.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "deleted-spot-item-actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn btn-primary";
    restoreBtn.type = "button";
    restoreBtn.textContent = "復元する";
    restoreBtn.addEventListener("click", () => restorePlaceFromTrash(spot.id));
    actions.appendChild(restoreBtn);

    const purgeBtn = document.createElement("button");
    purgeBtn.className = "btn";
    purgeBtn.type = "button";
    purgeBtn.textContent = "完全に削除";
    purgeBtn.addEventListener("click", () => {
      if (confirm(`「${spot.name}」を完全に削除しますか？（以後、再インポートすると復活する可能性があります）`)) {
        purgePlaceFromTrash(spot.id);
      }
    });
    actions.appendChild(purgeBtn);

    item.appendChild(actions);
    listEl.appendChild(item);
  });
}

function openDeletedSpotsModal() {
  renderDeletedSpotsList();
  document.getElementById("deleted-spots-overlay").classList.add("active");
}

function closeDeletedSpotsModal() {
  document.getElementById("deleted-spots-overlay").classList.remove("active");
}

// Extract Prefecture Name from Address / Title with Coordinates Fallback
const EN_PREFECTURE_NAMES = {
  "Tokyo": "東京都", "Kyoto": "京都府", "Osaka": "大阪府", "Hokkaido": "北海道", "Okinawa": "沖縄県",
  "Fukuoka": "福岡県", "Kanagawa": "神奈川県", "Chiba": "千葉県", "Saitama": "埼玉県", "Aichi": "愛知県",
  "Hiroshima": "広島県", "Nara": "奈良県", "Hyogo": "兵庫県", "Kobe": "兵庫県", "Shizuoka": "静岡県"
};

// 日本語/英語の都道府県名がテキスト中に含まれるかを調べる（住所・店名どちらにも使う共通ロジック）
function matchPrefectureInText(text) {
  if (!text) return null;
  for (const pref of PREFECTURES) {
    if (text.includes(pref)) return pref;
  }
  for (const [en, jp] of Object.entries(EN_PREFECTURE_NAMES)) {
    const regex = new RegExp(`\\b${en}\\b`, "i");
    if (regex.test(text)) return jp;
  }
  return null;
}

function extractPrefecture(address, name, lat, lng) {
  // 1. 住所（最も信頼できる情報源）を最優先でチェックする。
  const fromAddress = matchPrefectureInText(address);
  if (fromAddress) return fromAddress;

  // Fallback for Japan addresses without prefecture explicit (e.g. starting with "日本、")
  if (address && (address.includes("日本") || address.startsWith("〒"))) {
    // Try to guess from cities if address is in Japan
    const cityGuess = [
      { key: "横浜", pref: "神奈川県" }, { key: "名古屋", pref: "愛知県" },
      { key: "札幌", pref: "北海道" }, { key: "仙台", pref: "宮城県" },
      { key: "神戸", pref: "兵庫県" }, { key: "金沢", pref: "石川県" }
    ];
    for (const item of cityGuess) {
      if (address.includes(item.key)) return item.pref;
    }
  }

  // 2. 座標（住所の次に信頼できる、位置に基づく客観的な情報源）
  if (lat && lng && lat > 20 && lat < 46 && lng > 120 && lng < 150) {
    let minDistance = Infinity;
    let closestPref = "その他・海外";

    PREFECTURE_COORDINATES.forEach(pref => {
      const dLat = pref.lat - lat;
      const dLng = pref.lng - lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < minDistance) {
        minDistance = dist;
        closestPref = pref.name;
      }
    });

    return closestPref;
  }

  // 3. 店名からの推測は最後の手段にする。「北海道ラーメン」のようにご当地名を冠した
  //    チェーン店名など、実際の所在地と無関係な地名が店名に含まれることがあるため、
  //    住所にも座標にも都道府県が判定できなかった場合にのみ使う（回帰: 福岡の店が
  //    店名の「北海道」だけで北海道と誤判定されていたバグの修正）。
  const fromName = matchPrefectureInText(name);
  if (fromName) return fromName;

  return "その他・海外";
}

// Categorize place using simple keywords
function classifyCategory(name, comment) {
  const lowerName = name.toLowerCase();
  const lowerComment = comment ? comment.toLowerCase() : "";
  const text = lowerName + " " + lowerComment;

  // 1. Check commercial/public exclusions for Temple (寺社仏閣) first
  const isCommercialOrPublic = /(店|駅|温泉|湯|ビル|センター|教室|学習塾|クリニック|医院|病院|整骨|接骨|鍼灸|整体|美容|サロン|歯科|歯医者|郵便局|銀行|役所|警察署|消防署|パーキング|駐車場|オフィス|スクール|学校|大学|高校|中学|小学|階|ホテル|旅館|宿|バル|居酒屋|カフェ|レストラン|食堂)/.test(lowerName);

  // 2. Lodging (宿泊施設)
  const lodgingKeywords = ["ホテル", "旅館", "ゲストハウス", "ホステル", "民宿", "ペンション", "コテージ", "宿", "温泉宿", "セレクトン", "hotel", "ryokan", "hostel", "guesthouse", "resort"];
  
  // Note: Only check the name (not review text) to avoid false positives like "イートイン" in comments.
  const hasHotelChain = /(ドーミーイン|東横イン|ルートイン|スーパーホテル|アパホテル|イン屋)/.test(lowerName);
  const endsWithInn = /イン$/.test(lowerName) || /イン\s/.test(lowerName);
  const isExcludedInn = /(コイン|ツイン|ワイン|ファイン|ライン|ペイン|サイン|デザイン|メイン|オンライン|ダイニング|バイン|クレープ|イートイン|マフィン|プリン|マリン|マイン|コカイン)/.test(lowerName);
  
  const isLodging = lodgingKeywords.some(k => lowerName.includes(k)) || 
                    (hasHotelChain) || 
                    (endsWithInn && !isExcludedInn);

  if (isLodging) return "lodging";

  // 3. Gourmet (グルメ) - Classify subcategories of gourmet
  // Ramen (ラーメン・麺類)
  if (/(ラーメン|らーめん|拉麺|らぁ麺|らぁめん|つけ麺|担々麺|坦々麺|ちゃんぽん|うどん|饂飩|そば|蕎麦|製麺|麺や|麺屋|麺処|麺家|麺松|一麺庵|承天寺前店|男のLL|きりん|元気一杯|一龍|魁龍|博多金龍|一蘭|一風堂|shin-shin|しんしん|暖暮|元祖長浜|長浜屋|小麦冶|資さん|牧のうどん|ウエスト|リンガーハット|一幸舎|一双|どさんこ|島系|文龍|マシマシ|中本|タンメン|彰膳|金斗雲|だるま|ぴかいち|あかちょこべ|一歩|明鏡志水|ゆで太郎|もつ次郎|ビリー|煮干し|ramen|udon|soba)/i.test(text)) {
    return "gourmet_ramen";
  }
  // Sushi & Seafood (寿司・海鮮)
  if (/(寿司|鮨|すし|刺身|海鮮|さば|サバ|鯖|いか|イカ|たこ|タコ|まぐろ|マグロ|かに|カニ|蟹|牡蠣|カキ|がき|鮮魚|水産|漁火|豊久丸|住吉丸|大栄丸|高栄丸|若潮丸|竜宮の鯖|ごまさば|うなぎ|ウナギ|鰻|蒲焼き|かばやき|おきよ|豊一|丸天|魚河岸|ひらお|てんぷら|天ぷら|天麩羅|天婦羅|玄海丸|活魚|おおてら|かべしま|sushi|seafood)/i.test(text)) {
    return "gourmet_sushi";
  }
  // Yakiniku & Meat (焼肉・肉料理)
  if (/(焼肉|やきniku|ステーキ|ホルモン|ハンバーグ|とんかつ|トンカツ|豚カツ|焼き鳥|焼鳥|焼とり|串カツ|串焼き|串揚げ|肉料理|カルビ|とり|鳥|鶏|牛|豚|肉|ビフテキ|炭火|七輪|鉄板|まえわり屋|きんのつる|うえすたん|吉野家|松屋|すき家|なか卯|かつや|鍋|しゃぶしゃぶ|すき焼き|味道苑|菅乃屋|馬肉|馬刺し|赤から|ミート|meat|steak|yakiniku|yakitori)/i.test(text)) {
    return "gourmet_yakiniku";
  }
  // Cafe & Sweets (カフェ・スイーツ)
  if (/(カフェ|cafe|喫茶|スイーツ|デザート|パン|ベーカリー|サンドイッチ|ケーキ|パフェ|クレープ|ドーナツ|カステラ|クリーム|ジェラート|アイス|甘味|菓子|あん|珈琲|コーヒー|お茶|抹茶|紅茶|tea|green tea|みるく|ミルク|菓|餅|もち|団子|芋屋|スイートポテト|トランドール|パナシェ|工房|donuts|むじゃき|白熊|かき氷|いちご|苺|きんぐ|金次郎|ice|ぱん|ブレッド|大福|茶屋|coffee|bakery|dessert|sweets)/i.test(text)) {
    return "gourmet_cafe";
  }
  // Izakaya & Alcohol (居酒屋・バー)
  if (/(居酒屋|酒場|バル|バー|パブ|おでん|角打ち|晩酌|炉端|ビール|ワイン|日本酒|焼酎|ウイスキー|竹乃屋|くーた|pub|bar|izakaya)/i.test(text)) {
    return "gourmet_izakaya";
  }
  // Other Gourmet (グルメ・その他)
  const isGeneralEatery = /(食堂|レストラン|洋食|和食|中華|割烹|料亭|小料理|厨房|キッチン|グリル|ダイニング|ビストロ|フード|お食事|料理|軒|亭|庵)/.test(lowerName);
  const hasGourmetComment = /(美味しい|おいしい|旨い|うまい|料理|メニュー|美味|ランチ|ディナー|ディナータイム|ランチタイム|完食|ごちそう|コスパ)/.test(lowerComment);
  if (isGeneralEatery || hasGourmetComment || /(食堂|レストラン|洋食|和食|中華|ピザ|パスタ|イタリアン|フレンチ|カレー|餃子|ギョーザ|タコス|たこ焼き|たこやき|お好み焼き|お好みやき|もんじゃ|バーバー|バーガー|ハンバーガー|burger|ホットドッグ|サンド|ガスト|ジョイフル|ロイヤルホスト|サイゼリヤ|ファミレス|赤兵衛|天一|さんぞくや|a&w|bigman|diner|ログキット|佐世保バーガー|あほや|のぶりん|弁当|bistro|restaurant|dining|curry|pizza|pasta)/i.test(text)) {
    return "gourmet_other";
  }

  // 4. Temple (寺社仏閣)
  if (!isCommercialOrPublic) {
    const hasTempleKeywords = /(神社|大社|神宮|天満宮|東照宮|大仏|お寺|寺院|仏閣|観音|不動尊|shrine|temple)/i.test(text);
    const endsWithTempleChar = /(寺|院)$/.test(lowerName) || /(寺|院)\s/.test(lowerName);
    const hasMiyaShrine = /宮/.test(text) && !/(宮崎|宮城|宮古|宇都宮|西宮|大宮|新宮|今宮|若宮|芝宮|宮の|宮下|宮本|宮原|宮地|宮脇|二宮|三宮|四宮|五宮)/.test(text);
    if (hasTempleKeywords || endsWithTempleChar || hasMiyaShrine) {
      return "temple";
    }
  }

  // 5. Transport (交通機関)
  const isTransportExcluded = /(店|バル|バー|カフェ|喫茶|居酒屋|食堂|レストラン|ベーカリー|本舗|屋|亭|軒|庵|家|ブック|レンタル|ダイソー|ナフコ|トライアル|ビッグ|マックスバリュ|イオン|ロピア|ローソン|ファミリーマート|セブンイレブン|コメリ|コーナン|サロン|クリニック|整骨|接骨|鍼灸|整体|美容)/.test(lowerName);
  if (!isTransportExcluded) {
    if (/(駅|空港|バス|ターミナル|港|停留所|インターチェンジ|高速道路|サービスエリア|パーキングエリア|駐車場|パーキング|parking|station|airport|terminal|port|highway)/i.test(lowerName)) {
      return "transport";
    }
  }

  // 6. Shopping (ショッピング)
  if (/(ショッピング|モール|ショップ|スーパー|百貨店|デパート|市場|アウトレット|ストア|専門店|本屋|書店|レンタル|薬局|ドラッグ|コンビニ|ロピア|ルミエール|トライアル|ダイソー|ドン・キホーテ|ナフコ|しまむら|マックスバリュ|大黒天|ミスターマックス|mrmax|イオン|ファディ|コメリ|コーナン|shop|store|mall|supermarket|market)/i.test(text)) {
    return "shopping";
  }

  // 7. Sightseeing (観光・レジャー)
  if (/(公園|観光|美術館|博物館|城|展望台|動物園|水族館|温泉|スパ|銭湯|湯|サウナ|岩盤浴|ドーム|ビレッジ|ふくの湯|郷|荘|会館|砂楽|ビーチ|海水浴場|滝|山|渓谷|テーマパーク|アミューズメント|映画館|劇場|庭園|park|museum|zoo|aquarium|onsen|beach|theater|garden)/i.test(text)) {
    return "sightseeing";
  }

  return "other";
}

// --- Google連動カテゴリーのGemini取得（プロンプト方式） ---
// スポット名・住所のみをプロンプト化してユーザーがGeminiに貼り付け→結果を貼り戻す方式。
// 評価・レビュー本文は個人的な感想を含むため送信対象から除外する（プライバシー配慮）。
const GEMINI_CATEGORY_BATCH_SIZE = 50;
// 現在プロンプトに含まれているバッチ（"適用する"時にどのidが対象かの参照用）
let geminiCategoryBatch = [];

// 差分方式の対象：Google連動カテゴリーの生データをまだ取得していないスポットのみ
function getGeminiUnclassifiedPlaces() {
  return places.filter(p => !p.googleCategoryRaw);
}

function buildGeminiCategoryPrompt(batchPlaces) {
  const items = batchPlaces.map(p => ({ id: p.id, name: p.name, address: p.address || "" }));
  return [
    "以下は日本国内外のスポット（店舗・施設）の名前と住所のリストです。",
    "それぞれについて、Googleマップ上での実際の業種・カテゴリーを日本語の短い単語（例:「ラーメン店」「ホテル」「神社」「美容室」など）で判定してください。",
    "出力は説明文を一切含めず、以下の形式のJSON配列のみを返してください（コードブロックも不要です）。",
    '[{"id": "対象と同じid", "category": "業種名"}, ...]',
    "",
    "対象リスト:",
    JSON.stringify(items, null, 2)
  ].join("\n");
}

// Geminiの回答テキストをパースする。```json ... ``` のコードフェンス付きでも許容する。
// 配列でない/JSONとして壊れている場合はnullを返す。
// Geminiの回答からJSON配列を抽出する共通ヘルパー（2026-07-28実装）。```json フェンス付き
// 回答はこれまで通り剥がすが、フェンスなしで前後に「こちらが結果です」のような説明文が
// 付いてしまった回答は従来ここでパース失敗になっていた。フェンスを外した上での直接パースが
// 失敗した場合、最初の "[" から最後の "]" までを切り出して再度パースを試みることで救済する
// （3つのGemini連携＝カテゴリー・リンク緯度経度・スポット検索で共通のパース前処理）。
function extractJSONArrayFromGeminiResponse(text) {
  if (!text) return null;
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const tryParseArray = (str) => {
    try {
      const data = JSON.parse(str);
      return Array.isArray(data) ? data : null;
    } catch (e) {
      return null;
    }
  };

  const direct = tryParseArray(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    return tryParseArray(cleaned.slice(start, end + 1));
  }
  return null;
}

function parseGeminiCategoryResponse(text) {
  const data = extractJSONArrayFromGeminiResponse(text);
  if (!data) return null;

  return data
    .filter(item => item && typeof item.id === "string" && typeof item.category === "string" && item.category.trim())
    .map(item => ({ id: item.id, category: item.category.trim() }));
}

// パース済みの結果をplacesへ反映する。実際に適用できた各件について
// { id, name, rawCategory, categoryKey, categoryName } の配列を返す
// （呼び出し側がGeminiの回答内容そのものをUIへ表示できるように、件数だけでなく中身も渡す）。
function applyGeminiCategoryResults(results) {
  const applied = [];
  results.forEach(({ id, category }) => {
    const place = places.find(p => p.id === id);
    if (!place) return;
    place.googleCategoryRaw = category;
    place.category = getOrCreateGeminiCategory(category);
    applied.push({
      id: place.id,
      name: place.name,
      rawCategory: category,
      categoryKey: place.category,
      categoryName: getAllCategories()[place.category]?.name || "その他"
    });
  });
  return applied;
}

// --- Googleマップリンク・緯度経度のGemini取得（プロンプト方式、2026-07-25実装）---
// カテゴリー取得（上記）と同じ「プロンプト生成→貼り付け→適用」の差分バッチ方式だが、
// 対象はGoogleマップリンク（url）または緯度経度（lat/lng）のどちらかが未設定のスポット。
// 既に値がある項目は上書きしない（空欄埋めのみ）。緯度経度はハルシネーションのリスクが
// あるため、既存のcheckPlaceLookupCoordinateMismatch（住所由来の都道府県と座標由来の
// 最寄り都道府県の食い違いチェック）を通す。
// 食い違いが見つかった場合の扱い（2026-07-28変更）：以前は反映せず警告のみに留めていたが、
// これだと該当スポットはlat/lngが未設定のまま残り、次回以降の「リンク・緯度経度をGeminiで
// 調べる」バッチにも毎回出てきてしまい、同じスポットを何度も調べ直す羽目になっていた
// （ユーザー報告）。座標はいったん登録した上でplace.locationNeedsReview=trueを立てて隔離し、
// 「リンク・緯度経度 要確認」モーダル（renderLocationReviewList等）から中身を確認して
// 「確認OK」を押すとフラグが外れる方式に変更。
const GEMINI_LOCATION_BATCH_SIZE = 50;
// 現在プロンプトに含まれているバッチ（"適用する"時にどのidが対象かの参照用）
let geminiLocationBatch = [];

// 差分方式の対象：Googleマップリンクまたは緯度経度のどちらかが未設定のスポットのみ
function getGeminiLocationIncompletePlaces() {
  return places.filter(p => !p.url || p.lat == null || p.lng == null);
}

function buildGeminiLocationPrompt(batchPlaces) {
  const items = batchPlaces.map(p => ({ id: p.id, name: p.name, address: p.address || "" }));
  return [
    "以下は日本国内外のスポット（店舗・施設）の名前と住所のリストです。",
    "それぞれについて、Googleマップ上のそのスポットのリンク（URL）と、緯度・経度を調べてください。",
    "確信が持てない項目は無理に埋めず、該当するキー自体を省略してください（不正確な値を返すよりは省略を優先してください）。",
    "出力は説明文を一切含めず、以下の形式のJSON配列のみを返してください（コードブロックも不要です）。",
    '[{"id": "対象と同じid", "url": "https://maps.google.com/?q=...", "lat": 35.6586, "lng": 139.7454}, ...]',
    "",
    "対象リスト:",
    JSON.stringify(items, null, 2)
  ].join("\n");
}

// Geminiの回答テキストをパースする。```json コードフェンス付きでも許容する。
// 配列でない/JSONとして壊れている場合はnullを返す。url/lat/lngはすべて任意項目で、
// 値がある場合のみ型・範囲をチェックして採用する（無ければ省略されたものとして扱う）。
function parseGeminiLocationResponse(text) {
  const data = extractJSONArrayFromGeminiResponse(text);
  if (!data) return null;

  return data
    .filter(item => item && typeof item.id === "string")
    .map(item => {
      const result = { id: item.id };
      if (typeof item.url === "string" && item.url.trim()) result.url = item.url.trim();
      if (typeof item.lat === "number" && typeof item.lng === "number"
        && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180) {
        result.lat = item.lat;
        result.lng = item.lng;
      }
      return result;
    });
}

// パース済みの結果をplacesへ反映する（空欄埋めのみ、既存値は上書きしない）。
// 実際に処理した各件について { id, name, urlApplied, coordsApplied, coordsNeedsReview, coordsReviewReason }
// を返す（呼び出し側がGeminiの回答内容そのものをUIへ表示できるように、件数だけでなく中身も渡す）。
function applyGeminiLocationResults(results) {
  const applied = [];
  results.forEach(({ id, url, lat, lng }) => {
    const place = places.find(p => p.id === id);
    if (!place) return;

    let urlApplied = false;
    if (!place.url && url) {
      place.url = url;
      urlApplied = true;
    }

    let coordsApplied = false;
    let coordsNeedsReview = false;
    let coordsReviewReason = null;
    if (place.lat == null && place.lng == null && typeof lat === "number" && typeof lng === "number") {
      const mismatch = checkPlaceLookupCoordinateMismatch({ address: place.address, name: place.name, lat, lng });
      place.lat = lat;
      place.lng = lng;
      coordsApplied = true;
      if (mismatch) {
        place.locationNeedsReview = true;
        place.locationReviewReason = mismatch;
        coordsNeedsReview = true;
        coordsReviewReason = mismatch;
      }
    }

    applied.push({ id: place.id, name: place.name, urlApplied, coordsApplied, coordsNeedsReview, coordsReviewReason });
  });
  return applied;
}

// 「リンク・緯度経度 要確認」バッジ（ヘッダーのボタンに件数を表示）を最新の状態にする。
function updateLocationReviewBadge() {
  const badge = document.getElementById("location-review-count");
  if (!badge) return;
  const count = places.filter(p => p.locationNeedsReview).length;
  badge.textContent = count > 0 ? `(${count})` : "";
}

// 要確認フラグの立ったスポット一覧を、削除済みスポット（ゴミ箱）モーダルと同じ
// カード形式で描画する。「確認OK」でフラグのみ外す（座標・スポット自体は変更しない）。
function renderLocationReviewList() {
  const listEl = document.getElementById("location-review-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const targets = places.filter(p => p.locationNeedsReview);
  if (targets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "unknown-spot-empty";
    empty.textContent = "要確認のスポットはありません。";
    listEl.appendChild(empty);
    return;
  }

  targets.forEach(spot => {
    const item = document.createElement("div");
    item.className = "unknown-spot-item deleted-spot-item";

    const info = document.createElement("div");
    info.className = "unknown-spot-item-info";
    const nameEl = document.createElement("strong");
    nameEl.textContent = spot.name;
    info.appendChild(nameEl);
    const metaEl = document.createElement("span");
    metaEl.textContent = [spot.address || "住所不明", spot.lat != null ? `${spot.lat}, ${spot.lng}` : "座標なし"].join(" / ");
    info.appendChild(metaEl);
    const reasonEl = document.createElement("span");
    reasonEl.className = "place-lookup-candidate-warning";
    reasonEl.textContent = `⚠️ ${spot.locationReviewReason || "座標が住所と食い違っている可能性があります"}`;
    info.appendChild(reasonEl);
    item.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "deleted-spot-item-actions";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary";
    confirmBtn.type = "button";
    confirmBtn.textContent = "確認OK";
    confirmBtn.addEventListener("click", () => confirmLocationReview(spot.id));
    actions.appendChild(confirmBtn);

    item.appendChild(actions);
    listEl.appendChild(item);
  });
}

// 「確認OK」：座標・スポット自体は変更せず、要確認フラグのみ外す。
function confirmLocationReview(id) {
  const place = places.find(p => p.id === id);
  if (!place) return;
  place.locationNeedsReview = false;
  place.locationReviewReason = null;
  markUnsavedChanges();
  scheduleLocalCacheWrite();
  renderLocationReviewList();
  updateLocationReviewBadge();
}

function openLocationReviewModal() {
  renderLocationReviewList();
  document.getElementById("location-review-overlay").classList.add("active");
}

function closeLocationReviewModal() {
  document.getElementById("location-review-overlay").classList.remove("active");
}

// --- スポット情報のGemini検索（手動追加の補助、2026-07-24実装）---
// Takeoutの600件上限等で漏れた古いクチコミを手動で追加する際、正式名称・住所・
// 緯度経度・カテゴリーをうろ覚えの情報（都道府県+店名など）からGeminiに検索して
// もらう。カテゴリー取得機能と同じ「プロンプト生成→貼り付け→適用」方式だが、
// 対象は既存のplacesではなくまだ登録されていない候補である点が異なるため、
// 候補が複数返ってきた場合はユーザーに選ばせるステップを挟む。
const GEMINI_PLACE_LOOKUP_MAX_QUERIES = 30;
// 直近に生成したプロンプトのクエリ一覧（結果表示時に元の入力文言を出すための参照用）
let geminiPlaceLookupQueries = [];

// 自由記述のテキストエリア（1行1件）を { id, query } の配列にパースする。
// 空行は無視し、件数はGEMINI_PLACE_LOOKUP_MAX_QUERIES件までに制限する。
function parsePlaceLookupQueries(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, GEMINI_PLACE_LOOKUP_MAX_QUERIES)
    .map((query, index) => ({ id: `q${index + 1}`, query }));
}

function buildPlaceLookupPrompt(queries) {
  return [
    "以下は、うろ覚えで入力された日本国内外のスポット（店舗・施設）の手がかり（都道府県名や店名など）のリストです。",
    "それぞれについて、Googleマップ上に実在すると考えられる候補を最大3件まで挙げてください。",
    "各候補には、正式名称・住所・緯度・経度・業種（日本語の短い単語、例:「ラーメン店」「ホテル」「神社」）を含めてください。",
    "該当する候補が見つからない場合は candidates を空配列にしてください。緯度経度が分からない候補は含めないでください。",
    "出力は説明文を一切含めず、以下の形式のJSON配列のみを返してください（コードブロックも不要です）。",
    '[{"id": "対象と同じid", "candidates": [{"name": "正式名称", "address": "住所", "lat": 35.123, "lng": 139.123, "category": "業種名"}]}]',
    "",
    "対象リスト:",
    JSON.stringify(queries.map(q => ({ id: q.id, query: q.query })), null, 2)
  ].join("\n");
}

// Geminiの回答テキストをパースする。```json コードフェンス付きでも許容する。
// 配列でない/JSONとして壊れている場合はnullを返す。緯度経度が数値でない候補は除外する。
function parsePlaceLookupResponse(text) {
  const data = extractJSONArrayFromGeminiResponse(text);
  if (!data) return null;

  return data
    .filter(item => item && typeof item.id === "string" && Array.isArray(item.candidates))
    .map(item => ({
      id: item.id,
      candidates: item.candidates
        .filter(c => c && typeof c.name === "string" && c.name.trim()
          && typeof c.lat === "number" && typeof c.lng === "number"
          && c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180)
        .map(c => ({
          name: c.name.trim(),
          address: typeof c.address === "string" ? c.address.trim() : "",
          lat: c.lat,
          lng: c.lng,
          category: typeof c.category === "string" ? c.category.trim() : ""
        }))
    }));
}

// 住所からの都道府県判定と、座標からの最寄り都道府県判定が食い違う場合に警告文を返す
// （Geminiが緯度経度をハルシネーションした際の簡易セーフティネット。null=問題なし）。
function checkPlaceLookupCoordinateMismatch(candidate) {
  const addressPref = extractPrefecture(candidate.address, candidate.name, null, null);
  if (addressPref === "その他・海外") return null;

  let closestPref = "その他・海外";
  let minDistance = Infinity;
  PREFECTURE_COORDINATES.forEach(pref => {
    const dLat = pref.lat - candidate.lat;
    const dLng = pref.lng - candidate.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDistance) {
      minDistance = dist;
      closestPref = pref.name;
    }
  });

  if (closestPref !== addressPref) {
    return `座標が住所（${addressPref}）と大きく異なります（座標からは${closestPref}付近と判定）`;
  }
  return null;
}

// 選ばれた候補から手動入力レコードのフィールドを組み立てる。buildManualPlaceFields
// （フォーム入力用、classifyCategory/extractPrefectureで名前からカテゴリー・
// 都道府県を再計算する）とは異なり、こちらは候補の住所・座標・業種をそのまま
// 信頼して使う（業種は既存のGemini取得カテゴリーの仕組みに乗せ、googleCategoryRaw
// として保存する）。コメント・投稿日はGeminiには分からないため空欄のまま、追加後は
// 既存の編集フローで書き足す運用を想定。評価だけは候補カード上で選んでから追加できる
// （2026-07-25追加：Geminiは実際に行ったかどうかや感想までは分からないが、評価は
// 追加のタイミングでまとめて選べた方が後から一覧を開き直す手間がないというユーザー要望）。
function buildManualPlaceFieldsFromLookupCandidate(candidate, rating) {
  return {
    name: candidate.name,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    prefecture: extractPrefecture(candidate.address, candidate.name, candidate.lat, candidate.lng),
    category: candidate.category ? getOrCreateGeminiCategory(candidate.category) : classifyCategory(candidate.name, ""),
    googleCategoryRaw: candidate.category || null,
    rating: rating || null,
    comment: "",
    url: "",
    publishTime: "",
    updateTime: ""
  };
}

function addManualPlaceFromLookupCandidate(candidate, rating) {
  const newPlace = {
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...buildManualPlaceFieldsFromLookupCandidate(candidate, rating),
    myPrefecture: null,
    myCategory: null,
    source: "手動入力"
  };

  places = places.concat([newPlace]);
  places = deduplicatePlaces(places);

  setupDropdownFilters();
  filterAndRender();
}

// パース済みの検索結果を、クエリごとの候補選択カードとして描画する。
function renderPlaceLookupResults(results) {
  const container = document.getElementById("place-lookup-result-list");
  container.innerHTML = "";

  results.forEach(result => {
    const original = geminiPlaceLookupQueries.find(q => q.id === result.id);
    const block = document.createElement("div");
    block.className = "place-lookup-query-block";

    const header = document.createElement("div");
    header.className = "place-lookup-query-header";
    header.textContent = original ? original.query : result.id;
    block.appendChild(header);

    if (result.candidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "place-lookup-empty";
      empty.textContent = "候補が見つかりませんでした。「ログを手動で追加」から直接入力してください。";
      block.appendChild(empty);
      container.appendChild(block);
      return;
    }

    result.candidates.forEach(candidate => {
      const card = document.createElement("div");
      card.className = "place-lookup-candidate";

      const mismatch = checkPlaceLookupCoordinateMismatch(candidate);

      const info = document.createElement("div");
      info.className = "place-lookup-candidate-info";
      const nameEl = document.createElement("strong");
      nameEl.textContent = candidate.name;
      info.appendChild(nameEl);
      const addrEl = document.createElement("span");
      addrEl.textContent = candidate.address || "住所不明";
      info.appendChild(addrEl);
      const catEl = document.createElement("span");
      catEl.textContent = candidate.category || "業種不明";
      info.appendChild(catEl);
      if (mismatch) {
        const warnEl = document.createElement("span");
        warnEl.className = "place-lookup-candidate-warning";
        warnEl.textContent = `⚠️ ${mismatch}`;
        info.appendChild(warnEl);
      }
      card.appendChild(info);

      const ratingSelect = document.createElement("select");
      ratingSelect.className = "select-input place-lookup-candidate-rating";
      ratingSelect.title = "評価";
      ratingSelect.innerHTML = `
        <option value="">評価（任意）</option>
        <option value="5">★5</option>
        <option value="4">★4</option>
        <option value="3">★3</option>
        <option value="2">★2</option>
        <option value="1">★1</option>
      `;
      card.appendChild(ratingSelect);

      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-primary";
      addBtn.type = "button";
      addBtn.textContent = "これを追加する";
      addBtn.addEventListener("click", () => {
        const rating = ratingSelect.value ? parseInt(ratingSelect.value) : null;
        addManualPlaceFromLookupCandidate(candidate, rating);
        markUnsavedChanges();
        block.innerHTML = "";
        const doneMsg = document.createElement("p");
        doneMsg.className = "place-lookup-added-msg";
        doneMsg.textContent = `✓ 「${candidate.name}」を追加しました`;
        block.appendChild(doneMsg);
      });
      card.appendChild(addBtn);

      block.appendChild(card);
    });

    container.appendChild(block);
  });
}

function openPlaceLookupModal() {
  document.getElementById("place-lookup-input").value = "";
  document.getElementById("place-lookup-prompt").value = "";
  document.getElementById("place-lookup-response").value = "";
  document.getElementById("place-lookup-result-list").innerHTML = "";
  document.getElementById("place-lookup-status").textContent = "";
  geminiPlaceLookupQueries = [];
  document.getElementById("place-lookup-overlay").classList.add("active");
}

function closePlaceLookupModal() {
  document.getElementById("place-lookup-overlay").classList.remove("active");
}

// 不明なスポットの確認（閉店・削除等でGoogle側からスポット名を取得できなかった項目の削除確認）。
// extractNameRobustly系のパーサーは名前が一切見つからない場合「不明なスポット」を名前として
// 埋めるため、そのラベルを目印にスキャンする。取り込み直後の一括確認用であり、常時監視はしない。
function getUnknownSpots() {
  return places.filter(p => p.name === "不明なスポット");
}

function renderUnknownSpotList(spots) {
  const listEl = document.getElementById("unknown-spot-list");
  listEl.innerHTML = "";

  if (spots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "unknown-spot-empty";
    empty.textContent = "不明なスポットはありません。";
    listEl.appendChild(empty);
    return;
  }

  spots.forEach(spot => {
    const item = document.createElement("div");
    item.className = "unknown-spot-item";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "unknown-spot-checkbox";
    checkbox.checked = true;
    checkbox.dataset.id = spot.id;
    label.appendChild(checkbox);

    const info = document.createElement("div");
    info.className = "unknown-spot-item-info";
    const addrEl = document.createElement("strong");
    addrEl.textContent = spot.address || "住所不明";
    info.appendChild(addrEl);
    const metaEl = document.createElement("span");
    const metaParts = [
      spot.prefecture || "都道府県不明",
      spot.rating ? `★${spot.rating}` : "評価なし",
      spot.publishTime || "日付不明",
      spot.source || ""
    ].filter(Boolean);
    metaEl.textContent = metaParts.join(" / ");
    info.appendChild(metaEl);
    if (spot.comment) {
      const commentEl = document.createElement("span");
      commentEl.textContent = spot.comment;
      info.appendChild(commentEl);
    }
    label.appendChild(info);

    item.appendChild(label);
    listEl.appendChild(item);
  });
}

function openUnknownSpotModal() {
  const spots = getUnknownSpots();
  renderUnknownSpotList(spots);
  document.getElementById("unknown-spot-select-all").checked = true;
  document.getElementById("unknown-spot-overlay").classList.add("active");
}

function closeUnknownSpotModal() {
  document.getElementById("unknown-spot-overlay").classList.remove("active");
}

// Populate dropdown filters based on loaded data
function setupDropdownFilters() {
  const filterPref = document.getElementById("filter-prefecture");
  const filterCatGoogle = document.getElementById("filter-category-google");
  const filterCatMy = document.getElementById("filter-category-my");
  const filterWishlistList = document.getElementById("filter-wishlist-list");

  // Save current selections
  const currentPref = filterPref.value;
  const currentCatGoogle = filterCatGoogle.value;
  const currentCatMy = filterCatMy.value;
  const currentWishlistList = filterWishlistList.value;

  // Prefectures set
  const loadedPrefs = new Set();
  places.forEach(p => loadedPrefs.add(getEffectivePrefecture(p)));
  
  // Sort them
  const sortedPrefs = Array.from(loadedPrefs).sort((a, b) => {
    if (a === "その他・海外") return 1;
    if (b === "その他・海外") return -1;
    return PREFECTURES.indexOf(a) - PREFECTURES.indexOf(b);
  });

  // Populate Prefectures dropdown
  filterPref.innerHTML = '<option value="">すべての都道府県</option>';
  sortedPrefs.forEach(pref => {
    const opt = document.createElement("option");
    opt.value = pref;
    opt.textContent = `${pref} (${places.filter(p => getEffectivePrefecture(p) === pref).length})`;
    filterPref.appendChild(opt);
  });

  // Populate category filters. Google連動とマイカテゴリーは別軸なので、それぞれ独立した
  // ドロップダウンで絞り込めるようにする（両方指定した場合はAND条件）。
  const allCats = getAllCategories();

  // Google連動カテゴリー: p.categoryそのものを集計する（マイカテゴリーの上書きは考慮しない）
  filterCatGoogle.innerHTML = '<option value="">すべてのGoogle連動カテゴリー</option>';
  const googleCatCounts = {};
  places.forEach(p => { googleCatCounts[p.category] = (googleCatCounts[p.category] || 0) + 1; });
  Object.entries(googleCatCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${allCats[key]?.name || "その他"} (${count})`;
      filterCatGoogle.appendChild(opt);
    });

  // マイカテゴリー: 上書きされている行のみを対象にするが、「未設定」でも絞り込めるようにする
  filterCatMy.innerHTML = '<option value="">すべてのマイカテゴリー</option>';
  const unsetCount = places.filter(p => !p.myCategory).length;
  if (unsetCount > 0) {
    const unsetOpt = document.createElement("option");
    unsetOpt.value = "__unset__";
    unsetOpt.textContent = `未設定 (${unsetCount})`;
    filterCatMy.appendChild(unsetOpt);
  }
  const myCatCounts = {};
  places.forEach(p => { if (p.myCategory) myCatCounts[p.myCategory] = (myCatCounts[p.myCategory] || 0) + 1; });
  Object.entries(myCatCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${allCats[key]?.name || "その他"} (${count})`;
      filterCatMy.appendChild(opt);
    });

  // Googleマップのカスタムリスト（「行ってみたい」等）で絞り込み。同じURLのクチコミと
  // マージ済みでも wishlistListName は保護されて残るため、「実際に行った後」も引き続き
  // このリストで絞り込める（2026-07-28実装）。リスト由来ではない行も「リスト由来ではない」
  // で絞り込めるようにする（マイカテゴリーの「未設定」と同じ考え方）。
  filterWishlistList.innerHTML = '<option value="">すべて（リスト問わず）</option>';
  const notFromListCount = places.filter(p => !p.wishlistListName).length;
  if (notFromListCount > 0 && notFromListCount < places.length) {
    const notFromListOpt = document.createElement("option");
    notFromListOpt.value = "__none__";
    notFromListOpt.textContent = `リスト由来ではない (${notFromListCount})`;
    filterWishlistList.appendChild(notFromListOpt);
  }
  const wishlistListCounts = {};
  places.forEach(p => { if (p.wishlistListName) wishlistListCounts[p.wishlistListName] = (wishlistListCounts[p.wishlistListName] || 0) + 1; });
  Object.entries(wishlistListCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([listName, count]) => {
      const opt = document.createElement("option");
      opt.value = listName;
      opt.textContent = `${listName} (${count})`;
      filterWishlistList.appendChild(opt);
    });

  // Restore selection
  filterPref.value = currentPref;
  filterCatGoogle.value = currentCatGoogle;
  filterCatMy.value = currentCatMy;
  filterWishlistList.value = currentWishlistList;
}

// Filter, Sort, and Render UI
// Check whether a date string (normally "YYYY/MM/DD", the app's stored
// format — see formatDateString — but not always zero-padded in practice,
// e.g. 手動入力データのCSV一括編集を経由した値) falls within an inclusive
// range given as "YYYY-MM-DD" strings from <input type="date"> (always
// zero-padded). normalizeDateForCompare zero-pads dateStr too so the string
// compare stays correct even when the two sides' padding wouldn't otherwise
// match (no Date parsing, no timezone drift).
function matchesDateRange(dateStr, fromStr, toStr) {
  if (!fromStr && !toStr) return true;
  if (!dateStr) return false;
  const normalized = normalizeDateForCompare(dateStr);
  if (fromStr && normalized < fromStr) return false;
  if (toStr && normalized > toStr) return false;
  return true;
}

function filterAndRender() {
  const searchVal = document.getElementById("search-box").value.toLowerCase();
  const prefVal = document.getElementById("filter-prefecture").value;
  const catGoogleVal = document.getElementById("filter-category-google").value;
  const catMyVal = document.getElementById("filter-category-my").value;
  const minRating = document.getElementById("filter-rating").value ? parseInt(document.getElementById("filter-rating").value) : null;
  const wishlistListVal = document.getElementById("filter-wishlist-list").value;
  const dateFrom = document.getElementById("filter-date-from").value; // "YYYY-MM-DD" or ""
  const dateTo = document.getElementById("filter-date-to").value;

  // Filter
  let filtered = places.filter(p => {
    const matchSearch = !searchVal ||
                        p.name.toLowerCase().includes(searchVal) ||
                        p.address.toLowerCase().includes(searchVal) ||
                        p.comment.toLowerCase().includes(searchVal);
    const matchPref = !prefVal || getEffectivePrefecture(p) === prefVal;
    // Google連動とマイカテゴリーは別軸の絞り込み（両方指定した場合はAND）
    const matchCatGoogle = !catGoogleVal || p.category === catGoogleVal;
    const matchCatMy = !catMyVal || (catMyVal === "__unset__" ? !p.myCategory : p.myCategory === catMyVal);
    const matchRating = !minRating || (p.rating && p.rating >= minRating);
    // Googleマップのカスタムリスト（「行ってみたい」等）で絞り込み（2026-07-28実装）
    const matchWishlistList = !wishlistListVal || (wishlistListVal === "__none__" ? !p.wishlistListName : p.wishlistListName === wishlistListVal);
    // 「最終更新日」列・ソートと同じくpublishTimeを見る（Google Takeoutは真の初回投稿日を
    // 出力せず、この日付が編集のたびに更新されて返ってくるため。2026-07-26に一度updateTime
    // 側に直したが、実データではupdateTimeがほぼ空で誤りだったため巻き戻した。詳細はSPEC.md）。
    const matchDate = matchesDateRange(p.publishTime, dateFrom, dateTo);
    return matchSearch && matchPref && matchCatGoogle && matchCatMy && matchRating && matchWishlistList && matchDate;
  });

  // Sort
  filtered.sort((a, b) => {
    let valA = a[currentSortColumn];
    let valB = b[currentSortColumn];

    // Handle null values
    if (valA === null || valA === undefined) return currentSortDirection === 'asc' ? 1 : -1;
    if (valB === null || valB === undefined) return currentSortDirection === 'asc' ? -1 : 1;

    // Special sorting logic
    if (currentSortColumn === 'category') {
      // Google連動カテゴリー列でのソートなので、マイカテゴリーの上書きは考慮しない
      valA = getAllCategories()[a.category]?.name || "";
      valB = getAllCategories()[b.category]?.name || "";
    }
    if (currentSortColumn === 'prefecture') {
      valA = getEffectivePrefecture(a);
      valB = getEffectivePrefecture(b);
    }
    if (currentSortColumn === 'publishTime' || currentSortColumn === 'updateTime') {
      // ゼロ埋め表記ゆれ（"2021/1/5" 等）があっても正しく新旧順になるよう正規化してから比較する
      valA = normalizeDateForCompare(valA);
      valB = normalizeDateForCompare(valB);
    }

    if (typeof valA === 'string') {
      return currentSortDirection === 'asc' 
        ? valA.localeCompare(valB, 'ja') 
        : valB.localeCompare(valA, 'ja');
    } else {
      return currentSortDirection === 'asc' ? valA - valB : valB - valA;
    }
  });

  // Render
  renderStats(filtered);
  renderTable(filtered);
  renderMapMarkers(filtered);
  renderCharts(filtered);
  updateLocationReviewBadge();
}

// Render Stats Cards
function renderStats(filteredList) {
  document.getElementById("stat-total-places").textContent = filteredList.length;
  
  const uniquePrefs = new Set(filteredList.map(p => getEffectivePrefecture(p)).filter(p => p !== "その他・海外"));
  document.getElementById("stat-total-prefectures").textContent = uniquePrefs.size;

  // 最多カテゴリーはGoogle連動／マイカテゴリーそれぞれ別軸で集計・表示する
  const allCats = getAllCategories();

  const googleCatCounts = {};
  filteredList.forEach(p => {
    googleCatCounts[p.category] = (googleCatCounts[p.category] || 0) + 1;
  });
  document.getElementById("stat-top-category").textContent = topCategoryLabel(googleCatCounts, allCats);

  // マイカテゴリーは未設定行を除いた「実際に上書きされている行」だけを集計する
  const myCatCounts = {};
  filteredList.forEach(p => {
    if (p.myCategory) myCatCounts[p.myCategory] = (myCatCounts[p.myCategory] || 0) + 1;
  });
  document.getElementById("stat-top-my-category").textContent = topCategoryLabel(myCatCounts, allCats);
}

// { key: count } の集計から最多カテゴリーの表示ラベル（"名前 (件数)"）を作る。空ならプレースホルダー。
function topCategoryLabel(counts, allCats) {
  let topKey = null;
  let maxCount = 0;
  Object.entries(counts).forEach(([key, val]) => {
    if (val > maxCount) {
      maxCount = val;
      topKey = key;
    }
  });
  return topKey && allCats[topKey] ? `${allCats[topKey].name} (${maxCount})` : "-";
}

// Split address into Line 1 (Country/Postcode) and Line 2 (Prefecture onwards)
function splitAddress(address) {
  if (!address) return { line1: "-", line2: "" };
  
  // Try to match "日本、〒123-4567 "
  const match = address.match(/^(日本[、\s]*〒?\d{3}-\d{4})\s*(.*)$/);
  if (match) {
    return { line1: match[1], line2: match[2] };
  }
  
  // Try to match "〒123-4567 "
  const matchPostal = address.match(/^(〒?\d{3}-\d{4})\s*(.*)$/);
  if (matchPostal) {
    return { line1: matchPostal[1], line2: matchPostal[2] };
  }
  
  // Try to match "日本、" at the start
  if (address.startsWith("日本、")) {
    return { line1: "日本", line2: address.substring(3).trim() };
  }
  
  return { line1: address, line2: "" };
}

// Render Places Table
function renderTable(filteredList) {
  const tbody = document.getElementById("places-table-body");
  const emptyState = document.getElementById("table-empty-state");
  const paginationEl = document.getElementById("table-pagination");
  tbody.innerHTML = "";

  if (filteredList.length === 0) {
    emptyState.style.display = "flex";
    if (paginationEl) paginationEl.style.display = "none";
    return;
  }
  emptyState.style.display = "none";

  // ページネーション（50件区切り）：絞り込み結果全体ではなく、このページ分だけを描画する。
  // ページ番号は絞り込み・並び替えが変わるとfilterAndRenderFromPage1側で1に戻すが、
  // それ以外（行の編集など）でfilterAndRender()が呼ばれた場合は現在のページを維持したいので、
  // ここでは「範囲外なら丸める」だけに留める。
  const totalPages = Math.max(1, Math.ceil(filteredList.length / TABLE_PAGE_SIZE));
  if (currentTablePage > totalPages) currentTablePage = totalPages;
  if (currentTablePage < 1) currentTablePage = 1;
  const startIdx = (currentTablePage - 1) * TABLE_PAGE_SIZE;
  const pageList = filteredList.slice(startIdx, startIdx + TABLE_PAGE_SIZE);

  if (paginationEl) {
    if (totalPages > 1) {
      paginationEl.style.display = "flex";
      const infoEl = document.getElementById("pagination-info");
      const prevBtn = document.getElementById("pagination-prev");
      const nextBtn = document.getElementById("pagination-next");
      if (infoEl) infoEl.textContent = `${filteredList.length}件中 ${startIdx + 1}〜${startIdx + pageList.length}件（${currentTablePage} / ${totalPages}ページ）`;
      if (prevBtn) prevBtn.disabled = currentTablePage <= 1;
      if (nextBtn) nextBtn.disabled = currentTablePage >= totalPages;
    } else {
      paginationEl.style.display = "none";
    }
  }

  pageList.forEach(p => {
    const tr = document.createElement("tr");
    
    // Name Column with link icon
    const nameTd = document.createElement("td");
    nameTd.className = "col-name";
    // 「行ってみたい」等のカスタムリストにあった場所に、実際に行った（評価/クチコミが
    // ある）場合のバッジ（2026-07-28実装）。deduplicatePlacesのマージでwishlistListNameと
    // rating/commentが1レコードに揃って初めて表示される。
    const wishlistFulfilled = p.wishlistListName && (p.rating != null || p.comment);
    nameTd.innerHTML = `
      <div class="cell-scrollable">
        ${p.url ? `<a href="${p.url}" target="_blank" class="maps-link-btn" title="Googleマップで開く"><i data-lucide="external-link" style="width:14px;height:14px;margin-right:4px;vertical-align:middle;display:inline-block;"></i></a>` : ''}
        <span title="${p.name}">${p.name}</span>
        ${wishlistFulfilled ? `<i data-lucide="badge-check" class="wishlist-fulfilled-badge" title="「${p.wishlistListName}」リストにあった場所に実際に行きました"></i>` : ''}
      </div>
    `;

    // Prefecture Edit Column (edits マイ都道府県; falls back to Google連動判定 when unset)
    const prefTd = document.createElement("td");
    prefTd.className = "col-pref";
    prefTd.setAttribute("data-label", "都道府県");
    const prefSelect = document.createElement("select");
    prefSelect.className = "editable-select" + (p.myPrefecture ? " has-override" : "");
    prefSelect.title = p.myPrefecture ? "マイ都道府県で上書き中" : "自動判定された都道府県（変更するとマイ都道府県として保存されます）";
    // Only show a way back to auto-detection when an override is actually active,
    // so the common (non-overridden) row just displays the plain value like before.
    if (p.myPrefecture) {
      const resetPrefOpt = document.createElement("option");
      resetPrefOpt.value = "";
      resetPrefOpt.textContent = `↺ 自動判定に戻す (${p.prefecture})`;
      prefSelect.appendChild(resetPrefOpt);
    }
    const allPrefs = ["その他・海外", ...PREFECTURES];
    allPrefs.forEach(pref => {
      const opt = document.createElement("option");
      opt.value = pref;
      opt.textContent = pref;
      if (pref === getEffectivePrefecture(p)) opt.selected = true;
      prefSelect.appendChild(opt);
    });
    prefSelect.addEventListener("change", (e) => {
      p.myPrefecture = e.target.value || null;
      markUnsavedChanges();
      setupDropdownFilters();
      filterAndRender();
    });
    prefTd.appendChild(prefSelect);

    // Google連動カテゴリー列（読み取り専用。Geminiが返した生ラベルをそのまま表示する軸）
    const catTd = document.createElement("td");
    catTd.className = "col-cat";
    catTd.setAttribute("data-label", "Google連動カテゴリー");
    const catCellInner = document.createElement("div");
    catCellInner.className = "cat-cell-inner";
    if (p.googleCategoryRaw) {
      const rawBadge = document.createElement("i");
      rawBadge.setAttribute("data-lucide", "sparkles");
      rawBadge.className = "google-cat-raw-badge";
      rawBadge.title = `Geminiが返した業種ラベルをそのまま使用: 「${p.googleCategoryRaw}」`;
      catCellInner.appendChild(rawBadge);
    }
    const googleCatLabel = document.createElement("span");
    googleCatLabel.className = "google-cat-label";
    googleCatLabel.textContent = getAllCategories()[p.category]?.name || "その他";
    googleCatLabel.title = p.googleCategoryRaw
      ? `Geminiが返した業種ラベルをそのまま使用: 「${p.googleCategoryRaw}」`
      : "店名・住所からの自動判定（キーワードヒューリスティック）";
    catCellInner.appendChild(googleCatLabel);
    catTd.appendChild(catCellInner);

    // マイカテゴリー列（編集可能。未設定ならGoogle連動カテゴリーの見た目・値をそのまま引き継ぐ。
    // 上書きしている行だけ✨バッジを表示して区別する — Google連動カテゴリー列の
    // 「Geminiの生ラベルを示すバッジ」と同じ視覚言語を、こちらは「手動上書き」を示す用途で使う）
    const myCatTd = document.createElement("td");
    myCatTd.className = "col-my-cat";
    myCatTd.setAttribute("data-label", "マイカテゴリー");
    const myCatCellInner = document.createElement("div");
    myCatCellInner.className = "cat-cell-inner";
    if (p.myCategory) {
      const overrideBadge = document.createElement("i");
      overrideBadge.setAttribute("data-lucide", "sparkles");
      overrideBadge.className = "google-cat-raw-badge";
      overrideBadge.title = `マイカテゴリーで上書き中: 「${getAllCategories()[p.myCategory]?.name || ""}」`;
      myCatCellInner.appendChild(overrideBadge);
    }
    const myCatSelect = document.createElement("select");
    myCatSelect.className = "editable-select" + (p.myCategory ? " has-override" : "");
    myCatSelect.title = p.myCategory ? "マイカテゴリーで上書き中" : "未設定（Google連動カテゴリーがそのまま使われます）";

    const unsetCatOpt = document.createElement("option");
    unsetCatOpt.value = "";
    unsetCatOpt.textContent = getAllCategories()[p.category]?.name || "その他";
    if (!p.myCategory) unsetCatOpt.selected = true;
    myCatSelect.appendChild(unsetCatOpt);

    // 標準12カテゴリーはもう新規の選択肢としては提供しない — Google連動カテゴリーが
    // 実データ（Gemini取得の生ラベル）を持つようになったため、マイカテゴリーは
    // 完全にユーザー定義（自作 + 既出のGoogle取得カテゴリー）にする方針（2026-07-21）。
    // ただし、過去のインポート等で既に標準カテゴリーがmyCategoryとして設定されている行は、
    // 選択肢から消えて「勝手にリセットされたように見える」ことがないよう、その行にだけ残す。
    if (p.myCategory && CATEGORIES[p.myCategory]) {
      const legacyOpt = document.createElement("option");
      legacyOpt.value = p.myCategory;
      legacyOpt.textContent = CATEGORIES[p.myCategory].name;
      legacyOpt.selected = true;
      myCatSelect.appendChild(legacyOpt);
    }

    const customKeys = Object.keys(customCategories);
    if (customKeys.length > 0) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "マイカテゴリー（自作）";
      customKeys.forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = customCategories[key].name;
        if (key === p.myCategory) opt.selected = true;
        customGroup.appendChild(opt);
      });
      myCatSelect.appendChild(customGroup);
    }

    const geminiKeys = Object.keys(geminiCategories);
    if (geminiKeys.length > 0) {
      const geminiGroup = document.createElement("optgroup");
      geminiGroup.label = "Google取得カテゴリー（Gemini）";
      geminiKeys.forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = geminiCategories[key].name;
        if (key === p.myCategory) opt.selected = true;
        geminiGroup.appendChild(opt);
      });
      myCatSelect.appendChild(geminiGroup);
    }

    myCatSelect.addEventListener("change", (e) => {
      p.myCategory = e.target.value || null;
      markUnsavedChanges();
      setupDropdownFilters();
      filterAndRender();
    });
    myCatCellInner.appendChild(myCatSelect);
    myCatTd.appendChild(myCatCellInner);

    // Address Column
    const addrTd = document.createElement("td");
    addrTd.className = "col-address";
    addrTd.setAttribute("data-label", "住所");
    const addrParts = splitAddress(p.address);
    if (addrParts.line2) {
      addrTd.innerHTML = `
        <div class="cell-scrollable" title="${p.address}">${addrParts.line1}</div>
        <div class="cell-scrollable" title="${p.address}">${addrParts.line2}</div>
      `;
    } else {
      addrTd.innerHTML = `<div class="cell-scrollable" title="${p.address}">${addrParts.line1}</div>`;
    }

    // Rating Column
    const rateTd = document.createElement("td");
    rateTd.className = "col-rating";
    rateTd.setAttribute("data-label", "評価");
    if (p.rating) {
      rateTd.classList.add("rating-stars");
      rateTd.innerHTML = "★".repeat(p.rating) + "☆".repeat(5 - p.rating);
      rateTd.title = `評価: ${p.rating}`;
    } else {
      rateTd.style.color = "var(--text-muted)";
      rateTd.textContent = "-";
    }

    // Review/Comment Column
    const commentTd = document.createElement("td");
    commentTd.className = "review-text-cell";
    commentTd.setAttribute("data-label", "レビュー・メモ");
    commentTd.innerHTML = p.comment ? `<div class="cell-scrollable" title="${p.comment}">${p.comment}</div>` : `<div class="cell-scrollable">-</div>`;

    // Update Date Column（内部的にはpublishTimeフィールド。Google Takeoutは真の初回
    // 投稿日を出力せず、この日付が編集のたびに更新されて返ってくるため「最終更新日」として
    // 扱う。updateTimeフィールドは実データではほぼ空で信頼できない。詳細はSPEC.md参照）
    const updTd = document.createElement("td");
    updTd.className = "col-upd-date";
    updTd.setAttribute("data-label", "最終更新日");
    updTd.textContent = p.publishTime || "-";

    // Actions Column (Delete, Center Map, Edit for manual entries)
    const actTd = document.createElement("td");
    actTd.className = "col-actions";
    actTd.setAttribute("data-label", "操作");
    actTd.innerHTML = `
      <div style="display:flex;gap:8px;">
        ${p.lat && p.lng ? `<button class="btn btn-locate" style="padding:4px 8px;font-size:0.75rem;" title="地図の中心に表示"><i data-lucide="map-pin" style="width:12px;height:12px;"></i></button>` : ''}
        ${p.source === "手動入力" ? `<button class="btn btn-edit-manual" style="padding:4px 8px;font-size:0.75rem;" title="編集"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>` : ''}
        <button class="btn btn-delete" style="padding:4px 8px;font-size:0.75rem;background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.2);" title="削除"><i data-lucide="trash" style="width:12px;height:12px;"></i></button>
      </div>
    `;

    // Zoom Map listener
    if (p.lat && p.lng) {
      actTd.querySelector(".btn-locate").addEventListener("click", () => {
        map.setView([p.lat, p.lng], 15);
        // Find marker and open popup
        markersGroup.forEach(m => {
          if (m.options.placeId === p.id) {
            m.openPopup();
          }
        });
        // Scroll the map into view so the update is actually visible
        // (the table sits above the map in the layout, so it can be off-screen)
        document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    // Edit listener (手動入力 entries only, re-opens the manual-add modal prefilled)
    if (p.source === "手動入力") {
      actTd.querySelector(".btn-edit-manual").addEventListener("click", () => {
        openManualAdd(p);
      });
    }

    // Delete listener（ゴミ箱送り。「削除済みスポット」から復元・完全削除できる）
    actTd.querySelector(".btn-delete").addEventListener("click", () => {
      if (confirm(`「${p.name}」をリストから削除しますか？（「削除済みスポット」から復元できます）`)) {
        moveToTrash([p.id]);
        setupDropdownFilters();
        filterAndRender();
      }
    });

    // Column order: name/date/rating/actions are kept together up front so
    // they're visible without horizontal scrolling ("いつ行った・評価・操作"
    // at a glance); prefecture/category/address/review — already narrowed
    // via the filter dropdowns above the table — sit further right, behind
    // the scroll (2026-07-24 reorder, per user feedback).
    tr.appendChild(nameTd);
    tr.appendChild(updTd);
    tr.appendChild(rateTd);
    tr.appendChild(actTd);
    tr.appendChild(prefTd);
    tr.appendChild(catTd);
    tr.appendChild(myCatTd);
    tr.appendChild(addrTd);
    tr.appendChild(commentTd);
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

// Render Map Markers
function renderMapMarkers(filteredList) {
  clearMapMarkers();

  filteredList.forEach(p => {
    if (!p.lat || !p.lng) return;

    const catColor = getAllCategories()[getEffectiveCategory(p)]?.color || "#6b7280";
    const catName = getAllCategories()[getEffectiveCategory(p)]?.name || "その他";

    // Sleek Circle Marker instead of heavy icons
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 8,
      fillColor: catColor,
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85,
      placeId: p.id // store reference
    });

    // Premium Popup Content
    const popupContent = `
      <div class="map-popup-container">
        <div class="map-popup-header">${p.name}</div>
        <div class="map-popup-meta">
          <span class="tag tag-prefecture">${getEffectivePrefecture(p)}</span>
          <span class="tag tag-category">${catName}</span>
        </div>
        ${p.rating ? `<div class="rating-stars">${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}</div>` : ''}
        ${p.comment ? `<div class="map-popup-comment" title="${p.comment}">"${p.comment}"</div>` : ''}
        ${p.url ? `<a href="${p.url}" target="_blank" class="map-popup-link"><i data-lucide="external-link" style="width:12px;height:12px;vertical-align:middle;display:inline-block;"></i> Googleマップで見る</a>` : ''}
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.addTo(map);
    markersGroup.push(marker);
  });
}

// Clear all map markers
function clearMapMarkers() {
  markersGroup.forEach(m => map.removeLayer(m));
  markersGroup = [];
}

// Fit map viewport to display all active markers
function fitMapToMarkers() {
  if (markersGroup.length === 0) return;
  const group = new L.featureGroup(markersGroup);
  map.fitBounds(group.getBounds().pad(0.1));
}

// カテゴリー比率チャートの凡例に表示するスライス数の上限。Google連動カテゴリーは
// Geminiのラベルをそのまま使うため開放集合（件数が読めない）になり得るので、
// 際限なく凡例が伸びる／同じような色を使い回すことがないよう、件数の多い上位のみを
// 個別スライスにし、残りは1つの「その他」スライスへ集約する。
const MAX_CHART_CATEGORY_SLICES = 8;

// Render Analytical Charts (Chart.js)
function renderCharts(filteredList) {
  // 1. Category Chart (Doughnut)
  const allCats = getAllCategories();
  const catData = {};
  filteredList.forEach(p => {
    const cat = categoryChartAxis === 'my' ? getEffectiveCategory(p) : p.category;
    catData[cat] = (catData[cat] || 0) + 1;
  });

  const sortedCatEntries = Object.entries(catData)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const topCatEntries = sortedCatEntries.slice(0, MAX_CHART_CATEGORY_SLICES);
  const restCatCount = sortedCatEntries.slice(MAX_CHART_CATEGORY_SLICES).reduce((sum, [, count]) => sum + count, 0);

  const catLabels = topCatEntries.map(([key]) => allCats[key]?.name || "その他");
  const catCounts = topCatEntries.map(([, count]) => count);
  const catColors = topCatEntries.map(([key]) => allCats[key]?.color || "#94a3b8");

  if (restCatCount > 0) {
    catLabels.push(`その他（上位${MAX_CHART_CATEGORY_SLICES}件以外）`);
    catCounts.push(restCatCount);
    catColors.push("#94a3b8");
  }

  if (categoryChart) categoryChart.destroy();
  const ctxCat = document.getElementById("category-chart").getContext("2d");
  categoryChart = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catCounts,
        backgroundColor: catColors,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          // 'right' stacks one item per row with no wrapping, so once the category
          // count grows (especially with custom マイカテゴリー added) entries run past
          // the container's fixed height and simply don't get drawn. 'bottom' wraps
          // items across the full width instead, so it scales with category count.
          position: 'bottom',
          labels: {
            color: '#9ca3af',
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            padding: 10
          }
        }
      }
    }
  });

  // 2. Prefecture Chart (Horizontal Bar Chart)
  const prefCounts = {};
  filteredList.forEach(p => {
    const pref = getEffectivePrefecture(p);
    prefCounts[pref] = (prefCounts[pref] || 0) + 1;
  });

  // Sort prefectures by count descending
  const sortedPrefs = Object.entries(prefCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // TOP 10

  const prefLabels = sortedPrefs.map(x => x[0]);
  const prefCountsData = sortedPrefs.map(x => x[1]);

  if (prefectureChart) prefectureChart.destroy();
  const ctxPref = document.getElementById("prefecture-chart").getContext("2d");
  prefectureChart = new Chart(ctxPref, {
    type: 'bar',
    data: {
      labels: prefLabels,
      datasets: [{
        label: 'スポット数',
        data: prefCountsData,
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', precision: 0 }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

// Show/Hide Loading Overlay
function showLoading(show, text = "読み込み中...", progress = "") {
  const overlay = document.getElementById("loading-overlay");
  const textEl = overlay.querySelector(".loading-text");
  const progEl = document.getElementById("loading-progress");
  
  textEl.textContent = text;
  progEl.textContent = progress;

  if (show) {
    overlay.classList.add("active");
  } else {
    overlay.classList.remove("active");
  }
}

// Generate CSV export
function exportCSV() {
  if (places.length === 0) return;

  const csvRows = [];
  // Headers
  // マイ都道府県は列としては出力しない（2026-07-26、実質未使用のため。フィールド自体は
  // データモデル・UI・JSONバックアップにはそのまま残し、将来別の用途に転用できるようにする。
  // 詳細はSPEC.md参照）。CSV再取り込み側（parseAppCSVBackup）はこの列が無くても
  // csvFieldが安全に""を返すため、対応不要
  csvRows.push(["スポット名", "都道府県", "カテゴリー", "マイカテゴリー", "住所", "評価", "レビュー・メモ", "最終更新日", "緯度", "経度", "Googleマップリンク", "データソース"].join(","));

  places.forEach(p => {
    const row = [
      escapeCSVValue(p.name),
      escapeCSVValue(p.prefecture),
      escapeCSVValue(getAllCategories()[p.category]?.name || "その他"),
      escapeCSVValue(p.myCategory ? (getAllCategories()[p.myCategory]?.name || "") : ""),
      escapeCSVValue(p.address),
      escapeCSVValue(p.rating ? p.rating.toString() : ""),
      escapeCSVValue(p.comment),
      // Google Takeoutは真の初回投稿日を出力せず、この日付フィールド（内部的には
      // 引き続きpublishTimeという名前だが、実質「最終更新日」）が編集のたびに
      // 更新されて返ってくる。updateTimeフィールドは実データではほぼ空のため
      // CSVには出力しない（2026-07-26、ユーザーからの指摘で判明。詳細はSPEC.md参照）。
      escapeCSVValue(p.publishTime || ""),
      escapeCSVValue(p.lat ? p.lat.toString() : ""),
      escapeCSVValue(p.lng ? p.lng.toString() : ""),
      escapeCSVValue(p.url),
      escapeCSVValue(p.source)
    ];
    csvRows.push(row.join(","));
  });

  // UTF-8 with BOM so Excel parses it in Japanese correctly
  const csvContent = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `google_maps_categorized_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Helper to escape values for CSV
function escapeCSVValue(val) {
  if (val === null || val === undefined) return '""';
  let formatted = val.toString().replace(/"/g, '""'); // Escape double quotes
  if (formatted.includes(',') || formatted.includes('\n') || formatted.includes('"')) {
    formatted = `"${formatted}"`;
  }
  return formatted;
}

// Build the full backup payload shared by JSON download export and Google
// Drive save (both need the exact same self-describing, no-loss structure
// that parseAppBackupJSON knows how to restore).
function buildBackupJSONPayload(list = places) {
  return list.map(p => ({
    name: p.name,
    prefecture: p.prefecture,
    categoryKey: p.category,
    categoryName: getAllCategories()[p.category]?.name || "その他",
    // Gemini等から取得した生の業種ラベル。categoryKey/categoryNameはこのラベルから
    // 決定的に再生成できる（parseAppBackupJSON参照）ため、実質的にこちらが正データ。
    googleCategoryRaw: p.googleCategoryRaw || null,
    myPrefecture: p.myPrefecture || null,
    myCategoryKey: p.myCategory || null,
    myCategoryName: p.myCategory ? (getAllCategories()[p.myCategory]?.name || null) : null,
    // Only meaningful for a custom (non-built-in) マイカテゴリー; lets a re-import
    // reconstruct the category definition itself, not just this record's reference to it.
    myCategoryColor: (p.myCategory && customCategories[p.myCategory]) ? customCategories[p.myCategory].color : null,
    address: p.address,
    rating: p.rating,
    comment: p.comment,
    publishTime: p.publishTime || "",
    updateTime: p.updateTime || "",
    coordinates: p.lat && p.lng ? { latitude: p.lat, longitude: p.lng } : null,
    googleMapsUrl: p.url,
    source: p.source,
    // 「リンク・緯度経度をGeminiで調べる」で座標が住所と食い違う疑いがあるまま登録された
    // スポットの要確認フラグ。ロスレスなJSONバックアップでのみ保持する（CSVは他の
    // Gemini由来フィールドと同様に非対応、4節参照）。
    locationNeedsReview: p.locationNeedsReview || false,
    locationReviewReason: p.locationReviewReason || null,
    // Googleマップのカスタムリスト（「行ってみたい」等）由来のフィールド。CSVフルエクスポート
    // には含めない（他のGemini由来フィールドと同じ「JSONのみロスレス」方針、4節参照）。
    wishlistListName: p.wishlistListName || null,
    wishlistMemo: p.wishlistMemo || null,
    wishlistTags: p.wishlistTags || null,
    wishlistComment: p.wishlistComment || null
  }));
}

// Generate JSON export (download)
function exportJSON() {
  if (places.length === 0) return;

  const output = buildBackupJSONPayload();
  const jsonContent = JSON.stringify(output, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `google_maps_categorized_${Date.now()}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // JSON is the one lossless format (unlike exportCSV — see SPEC.md §4), so a
  // download here counts as a real backup and clears the unsaved-changes flag.
  clearUnsavedChanges();
}

// --- Local Offline Cache (Phase 3, IndexedDB) ---
// Stores exactly what buildBackupJSONPayload()/exportJSON()/saveToDrive() already
// produce — one record in one object store, mirroring Drive's fixed-single-filename
// model. Restoring goes through the same parseAppBackupJSON() every other ingestion
// path uses, so this inherits the same round-trip shape/limitations as JSON/Drive
// (e.g. an unused custom category still won't survive a round trip) rather than
// introducing a second schema to maintain.
const LOCAL_CACHE_DB_NAME = "g-map-dashboard-cache";
const LOCAL_CACHE_DB_VERSION = 1;
const LOCAL_CACHE_STORE_NAME = "backup";
const LOCAL_CACHE_RECORD_KEY = "current";
const LOCAL_CACHE_WRITE_DEBOUNCE_MS = 800;

// Preference defaults to ON (agreed default: most users benefit from not losing
// data on reload; shared-PC users are expected to switch it off themselves).
function isLocalCacheEnabled() {
  const pref = localStorage.getItem(LOCAL_CACHE_PREF_KEY);
  return pref === null ? true : pref === "true";
}

function setLocalCacheEnabled(enabled) {
  localStorage.setItem(LOCAL_CACHE_PREF_KEY, enabled ? "true" : "false");
}

// Promise-wrapped IndexedDB open. Resolves null (never rejects) when IndexedDB
// is unavailable/blocked (e.g. private browsing) so every caller can treat
// "no DB" as a silent no-op — the cache is a convenience layer and must never
// crash or interrupt normal in-memory operation.
function openLocalCacheDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDB.open(LOCAL_CACHE_DB_NAME, LOCAL_CACHE_DB_VERSION);
    } catch (e) {
      console.warn("Local cache unavailable (indexedDB.open threw):", e);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_CACHE_STORE_NAME)) {
        db.createObjectStore(LOCAL_CACHE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("Local cache unavailable (indexedDB.open failed):", request.error);
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
}

// Writes the current buildBackupJSONPayload() output as the single cached
// record. Fails silently (quota exceeded, DB unavailable, private browsing).
async function writeLocalCache() {
  const db = await openLocalCacheDB();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_CACHE_STORE_NAME, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(LOCAL_CACHE_STORE_NAME).put(
        {
          updatedAt: new Date().toISOString(),
          payload: buildBackupJSONPayload(),
          // ゴミ箱（削除済みスポット）も同じ形で保存し、リロード後も再インポート時の
          // 自動再登録抑止と「削除済みスポット」からの復元が続けられるようにする。
          deletedPayload: buildBackupJSONPayload(deletedPlaces)
        },
        LOCAL_CACHE_RECORD_KEY
      );
    });
  } catch (e) {
    console.warn("Local cache write failed:", e);
  } finally {
    db.close();
  }
}

// Reads the single cached record, or null if none/unavailable/corrupt.
async function readLocalCache() {
  const db = await openLocalCacheDB();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_CACHE_STORE_NAME, "readonly");
      const req = tx.objectStore(LOCAL_CACHE_STORE_NAME).get(LOCAL_CACHE_RECORD_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Local cache read failed:", e);
    return null;
  } finally {
    db.close();
  }
}

// Deletes the cached record outright — used when the toggle is switched OFF
// (so a shared PC doesn't keep plaintext data around just because writes
// stopped) and by resetApp() (so a reset can't silently "un-reset" itself on
// the next page load).
async function clearLocalCache() {
  const db = await openLocalCacheDB();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_CACHE_STORE_NAME, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(LOCAL_CACHE_STORE_NAME).delete(LOCAL_CACHE_RECORD_KEY);
    });
  } catch (e) {
    console.warn("Local cache clear failed:", e);
  } finally {
    db.close();
  }
}

// Pure gate logic for scheduleLocalCacheWrite(), kept free of any global
// access so it's directly unit-testable under Node without stubbing
// localStorage/indexedDB (see tests/localCache.test.js).
function shouldScheduleLocalCacheWrite(cacheEnabled, indexedDBAvailable) {
  return !!cacheEnabled && !!indexedDBAvailable;
}

// Debounced write scheduler — the single choke point hooked into
// markUnsavedChanges() (covers all real-edit call sites at once) and
// loadFromDrive() (which changes `places` without going through
// markUnsavedChanges()). ~800ms so rapid successive edits collapse into one
// write.
function scheduleLocalCacheWrite() {
  if (!shouldScheduleLocalCacheWrite(isLocalCacheEnabled(), typeof indexedDB !== "undefined")) return;
  if (localCacheWriteTimer) clearTimeout(localCacheWriteTimer);
  localCacheWriteTimer = setTimeout(() => {
    localCacheWriteTimer = null;
    writeLocalCache();
  }, LOCAL_CACHE_WRITE_DEBOUNCE_MS);
}

// Cold-boot restore, called once from DOMContentLoaded when the toggle is ON.
// A straight assignment is correct here (no deduplicatePlaces merge) since
// nothing else is loaded yet. Does NOT call markUnsavedChanges() — restoring
// a previous session isn't a new edit. Fails silently and leaves the app on
// the normal empty upload screen if anything about the cached record is
// missing/corrupt.
async function restoreFromLocalCache() {
  if (!isLocalCacheEnabled()) return;
  try {
    const record = await readLocalCache();
    if (!record || !Array.isArray(record.payload) || record.payload.length === 0) return;
    const restored = parseAppBackupJSON(record.payload);
    if (!Array.isArray(restored) || restored.length === 0) return;
    places = restored;
    if (Array.isArray(record.deletedPayload) && record.deletedPayload.length > 0) {
      deletedPlaces = parseAppBackupJSON(record.deletedPayload);
      updateTrashBadge();
    }
    setupDropdownFilters();
    filterAndRender();
    showDashboard();
  } catch (e) {
    console.warn("Local cache restore failed, falling back to empty state:", e);
  }
}

// Reflects the saved preference into the header toggle's checked state and
// status text. Called once at startup and after every toggle change.
function updateLocalCacheToggleUI() {
  const checkbox = document.getElementById("local-cache-toggle");
  const status = document.getElementById("local-cache-status");
  if (!checkbox) return;
  const enabled = isLocalCacheEnabled();
  checkbox.checked = enabled;
  if (status) {
    status.textContent = enabled
      ? "このデバイスにデータを保存します（オフライン閲覧可）"
      : "このデバイスには保存しません（共有PC向け）";
  }
}

// Handles the toggle's change event. Turning it OFF clears any already-cached
// data immediately (see clearLocalCache() comment above). Turning it ON does
// NOT retroactively write the current in-memory places — the next real edit
// (or Drive load) populates it naturally via the existing write hooks.
function handleLocalCacheToggleChange(enabled) {
  setLocalCacheEnabled(enabled);
  updateLocalCacheToggleUI();
  if (!enabled) {
    clearLocalCache();
    // ゴミ箱（削除済みスポットの氏名・住所を含む）も、キャッシュ本体と同じ理由で
    // 端末に平文で残さない（共有PC向け）。
    deletedPlaces = [];
    renderDeletedSpotsList();
    updateTrashBadge();
  }
}

// --- Google Drive Sync (Phase 2) ---
// Uses Google Identity Services' implicit token client (drive.file scope only,
// so this app can only see/edit files it created itself). No refresh token —
// the access token lives for this browser session only; reconnecting is a
// single click. Data is stored as one JSON file (the same shape exportJSON
// produces), found each time by name rather than a remembered ID, since the
// spec's simple conflict policy is "always fetch Drive's latest on open".
const GOOGLE_DRIVE_CLIENT_ID = "536328866896-9h97ik12fo3usbu37chanu190emra4ep.apps.googleusercontent.com";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_BACKUP_FILE_NAME = "g-map-dashboard-backup.json";

let driveTokenClient = null;
let driveAccessToken = null;
let driveFileId = null; // set once the backup file is found or first created
// Drive's modifiedTime for driveFileId as of the last time THIS session loaded
// or saved it. Used only as a cheap "has someone else saved since I last knew
// the state?" check before overwriting — not a real merge (see saveToDrive).
let driveKnownModifiedTime = null;

function getDriveTokenClient() {
  if (driveTokenClient) return driveTokenClient;
  if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
    return null;
  }
  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_DRIVE_CLIENT_ID,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: () => {} // overridden per-call in connectGoogleDrive()
  });
  return driveTokenClient;
}

function setDriveSyncStatus(message, isError) {
  const el = document.getElementById("drive-sync-status");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("is-error", !!isError);
}

// Toggles the header UI between "not connected" (連携ボタンのみ) and
// "connected" (保存ボタンも表示) states.
function updateDriveConnectionUI(connected) {
  const connectBtn = document.getElementById("btn-drive-connect");
  const saveBtn = document.getElementById("btn-drive-save");
  if (!connectBtn || !saveBtn) return;
  connectBtn.innerHTML = connected
    ? '<i data-lucide="cloud"></i> 再連携'
    : '<i data-lucide="cloud"></i> Googleドライブと連携';
  saveBtn.style.display = connected ? "flex" : "none";
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function connectGoogleDrive() {
  const client = getDriveTokenClient();
  if (!client) {
    setDriveSyncStatus("Google連携用のスクリプトを読み込めませんでした。再読み込みしてお試しください。", true);
    return;
  }
  client.callback = async (resp) => {
    if (resp.error) {
      console.error("Drive OAuth error:", resp);
      setDriveSyncStatus("Googleドライブとの連携が許可されませんでした。", true);
      return;
    }
    driveAccessToken = resp.access_token;
    updateDriveConnectionUI(true);
    await loadFromDrive();
  };
  // Skip the consent prompt on token refresh within the same session.
  client.requestAccessToken({ prompt: driveAccessToken ? "" : "consent" });
}

// Finds this app's backup file on Drive (by name, since drive.file scope
// means only files this app created are ever visible) and merges it into
// the current in-memory places via the same dedup/merge path a JSON file
// import uses, so it never blindly clobbers unsaved local edits.
async function loadFromDrive() {
  try {
    setDriveSyncStatus("Driveを確認中...");
    const listUrl = "https://www.googleapis.com/drive/v3/files"
      + `?q=${encodeURIComponent(`name='${DRIVE_BACKUP_FILE_NAME}' and trashed=false`)}`
      + "&spaces=drive&fields=files(id,name,modifiedTime)";
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${driveAccessToken}` }
    });
    if (!listRes.ok) throw new Error(`Drive list failed: ${listRes.status}`);
    const listData = await listRes.json();
    const existing = listData.files && listData.files[0];

    if (!existing) {
      driveFileId = null;
      driveKnownModifiedTime = null;
      setDriveSyncStatus("Drive上に保存データはまだありません。「Driveに保存」で新規作成できます。");
      return;
    }
    driveFileId = existing.id;
    driveKnownModifiedTime = existing.modifiedTime;

    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: `Bearer ${driveAccessToken}` } }
    );
    if (!fileRes.ok) throw new Error(`Drive file fetch failed: ${fileRes.status}`);
    const json = await fileRes.json();

    if (Array.isArray(json) && json.length > 0) {
      const restored = parseAppBackupJSON(json);
      places = deduplicatePlaces(places.concat(restored));
      setupDropdownFilters();
      filterAndRender();
      showDashboard();
      // This path changes `places` without going through markUnsavedChanges()
      // (loading isn't a local edit), but the offline cache should still pick
      // up Drive's possibly-newer data.
      scheduleLocalCacheWrite();
    }

    const modified = existing.modifiedTime ? new Date(existing.modifiedTime).toLocaleString("ja-JP") : "不明";
    setDriveSyncStatus(`Driveの最新データを読み込みました（保存日時: ${modified}）`);
  } catch (e) {
    console.error("Drive load error:", e);
    setDriveSyncStatus("Driveからの読み込みに失敗しました。時間を置いて再度お試しください。", true);
  }
}

// Fetches just the modifiedTime of a Drive file (no content download) — cheap
// enough to call right before every save as a conflict check.
async function fetchDriveModifiedTime(fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`,
    { headers: { Authorization: `Bearer ${driveAccessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive metadata fetch failed: ${res.status}`);
  const data = await res.json();
  return data.modifiedTime;
}

// Creates the backup file on first save, updates it (same file, matched by
// driveFileId) on every save after that. Not a real multi-device merge (see
// SPEC.md §5 — intentionally kept simple for solo/sequential use); the one
// safety net is the conflict check below, which just warns instead of
// silently clobbering another device's save.
async function saveToDrive() {
  if (!driveAccessToken) {
    connectGoogleDrive();
    return;
  }
  if (places.length === 0) {
    setDriveSyncStatus("保存するデータがありません。", true);
    return;
  }

  try {
    // If we already know a version of this file existed, check whether it
    // changed since we last loaded/saved it — that means another device
    // saved in between, and blindly uploading now would silently discard
    // that device's changes.
    if (driveFileId && driveKnownModifiedTime) {
      setDriveSyncStatus("競合がないか確認中...");
      const currentModifiedTime = await fetchDriveModifiedTime(driveFileId);
      if (currentModifiedTime !== driveKnownModifiedTime) {
        const modified = new Date(currentModifiedTime).toLocaleString("ja-JP");
        const proceed = confirm(
          `Driveのデータが他の端末で更新されています（更新日時: ${modified}）。\n` +
          `このまま上書き保存すると、その変更が失われます。\n\n` +
          `OK: このまま上書き保存する\n` +
          `キャンセル: 保存を中止する（ページを再読み込みして「連携」からやり直すと、最新の内容を取り込めます）`
        );
        if (!proceed) {
          setDriveSyncStatus("保存を中止しました。最新の内容を取り込むには、ページを再読み込みしてから連携し直してください。", true);
          return;
        }
      }
    }

    setDriveSyncStatus("Driveに保存中...");
    const payload = buildBackupJSONPayload();
    const boundary = "g_map_dashboard_boundary";
    const metadata = driveFileId ? {} : { name: DRIVE_BACKUP_FILE_NAME, mimeType: "application/json" };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;

    const url = driveFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart&fields=id,modifiedTime`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime";

    const res = await fetch(url, {
      method: driveFileId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${driveAccessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!res.ok) throw new Error(`Drive save failed: ${res.status}`);
    const data = await res.json();
    driveFileId = data.id;
    driveKnownModifiedTime = data.modifiedTime;
    clearUnsavedChanges();
    setDriveSyncStatus(`Driveに保存しました（${new Date().toLocaleString("ja-JP")}）`);
  } catch (e) {
    console.error("Drive save error:", e);
    setDriveSyncStatus("Driveへの保存に失敗しました。時間を置いて再度お試しください。", true);
  }
}

// Load high quality sample data
function loadSampleData() {
  showLoading(true, "サンプルデータを生成中...", "50%");
  
  const samplePlaces = [
    {
      id: "sample-1",
      name: "東京タワー",
      address: "日本、〒105-0011 東京都港区芝公園４丁目２−８",
      lat: 35.6586,
      lng: 139.7454,
      prefecture: "東京都",
      category: "sightseeing",
      rating: 5,
      comment: "夜景が本当に綺麗でした。展望台からの眺めは最高です！おすすめスポット。",
      url: "https://maps.google.com/?cid=1234567890",
      source: "サンプルデータ"
    },
    {
      id: "sample-2",
      name: "伏見稲荷大社",
      address: "日本、〒612-0882 京都府京都市伏見区深草藪之内町６８",
      lat: 34.9671,
      lng: 135.7727,
      prefecture: "京都府",
      category: "temple",
      rating: 5,
      comment: "千本鳥居の朱色が息をのむ美しさ。頂上まで登るには結構な運動になりますが価値あり。",
      url: "https://maps.google.com/?cid=1234567891",
      source: "サンプルデータ"
    },
    {
      id: "sample-3",
      name: "一蘭 道頓堀店別館",
      address: "日本、〒542-0084 大阪府大阪市中央区宗右衛門町７−３",
      lat: 34.6691,
      lng: 135.5025,
      prefecture: "大阪府",
      category: "gourmet_ramen",
      rating: 4,
      comment: "安定の美味しさのとんこつラーメン。仕切りがあって集中して食べられます。",
      url: "https://maps.google.com/?cid=1234567892",
      source: "サンプルデータ"
    },
    {
      id: "sample-4",
      name: "ザ・リッツ・カールトン京都",
      address: "日本、〒604-0902 京都府京都市中京区鉾田町 鴨川二条大橋畔",
      lat: 35.0135,
      lng: 135.7733,
      prefecture: "京都府",
      category: "lodging",
      rating: 5,
      comment: "サービスが至れり尽くせりで極上の宿泊体験。鴨川沿いのロケーションも素晴らしく、朝食のピエール・エルメのクロワッサンが絶品。",
      url: "https://maps.google.com/?cid=1234567893",
      source: "サンプルデータ"
    },
    {
      id: "sample-5",
      name: "金沢21世紀美術館",
      address: "日本、〒920-8509 石川県金沢市広坂１丁目２−１",
      lat: 36.5614,
      lng: 136.6582,
      prefecture: "石川県",
      category: "sightseeing",
      rating: 4,
      comment: "スイミング・プールが有名。建築デザイン自体も面白く、周辺の公園散策も気持ちいい。",
      url: "https://maps.google.com/?cid=1234567894",
      source: "サンプルデータ"
    },
    {
      id: "sample-6",
      name: "美ら海水族館",
      address: "日本、〒905-0206 沖縄県国頭郡本部町石川４２４",
      lat: 26.6944,
      lng: 127.8781,
      prefecture: "沖縄県",
      category: "sightseeing",
      rating: 5,
      comment: "巨大水槽「黒潮の海」のジンベエザメが圧巻！これを見るために沖縄に行く価値があります。",
      url: "https://maps.google.com/?cid=1234567895",
      source: "サンプルデータ"
    },
    {
      id: "sample-7",
      name: "ブルーボトルコーヒー 新宿カフェ",
      address: "日本、〒160-0022 東京都新宿区新宿４丁目１−６ NEWoMan 1F",
      lat: 35.6888,
      lng: 139.7008,
      prefecture: "東京都",
      category: "gourmet_cafe",
      rating: 4,
      comment: "ドリップコーヒーが美味しい。朝早くから開いているので朝活に便利。",
      url: "https://maps.google.com/?cid=1234567896",
      source: "サンプルデータ"
    },
    {
      id: "sample-8",
      name: "東京ディズニーランド",
      address: "日本、〒279-0031 千葉県浦安市舞浜１−１",
      lat: 35.6329,
      lng: 139.8804,
      prefecture: "千葉県",
      category: "sightseeing",
      rating: 5,
      comment: "夢の国。アトラクションもキャストさんのサービスも一流で何度行っても楽しめます。",
      url: "https://maps.google.com/?cid=1234567897",
      source: "サンプルデータ"
    },
    {
      id: "sample-9",
      name: "表参道ヒルズ",
      address: "日本、〒150-0001 東京都渋谷区神宮前４丁目１２−１０",
      lat: 35.6672,
      lng: 139.7088,
      prefecture: "東京都",
      category: "shopping",
      rating: 4,
      comment: "おしゃれなブランドショップがたくさん入っています。スロープ状の建築構造が美しい。",
      url: "https://maps.google.com/?cid=1234567898",
      source: "サンプルデータ"
    },
    {
      id: "sample-10",
      name: "JR 博多駅",
      address: "日本、〒812-0012 福岡県福岡市博多区博多駅中央街１−１",
      lat: 33.5897,
      lng: 130.4207,
      prefecture: "福岡県",
      category: "transport",
      rating: 4,
      comment: "駅ビルにはアミュプラザや阪急が入っており、お土産やレストランも豊富で非常に便利。",
      url: "https://maps.google.com/?cid=1234567899",
      source: "サンプルデータ"
    },
    {
      id: "sample-11",
      name: "浅草寺",
      address: "日本、〒111-0032 東京都台東区浅草２丁目３−１",
      lat: 35.7148,
      lng: 139.7967,
      prefecture: "東京都",
      category: "temple",
      rating: 5,
      comment: "雷門から仲見世通りを通り本堂へ。下町の雰囲気が感じられ、人形焼きを食べ歩くのが楽しい。",
      url: "https://maps.google.com/?cid=1234567900",
      source: "サンプルデータ"
    },
    {
      id: "sample-12",
      name: "ニセコ グラン・ヒラフ",
      address: "日本、〒044-0080 北海道虻田郡倶知安町ニセコひらふ１条２丁目９−１",
      lat: 42.8617,
      lng: 140.7011,
      prefecture: "北海道",
      category: "sightseeing",
      rating: 5,
      comment: "パウダースノーの質が世界最高峰！スキー・スノボ好きなら絶対に行くべき場所。",
      url: "https://maps.google.com/?cid=1234567901",
      source: "サンプルデータ"
    },
    {
      id: "sample-13",
      name: "白川郷 合掌造り集落",
      address: "日本、〒501-5627 岐阜県大野郡白川村荻町",
      lat: 36.2564,
      lng: 136.9064,
      prefecture: "岐阜県",
      category: "sightseeing",
      rating: 5,
      comment: "日本の原風景が残る素晴らしい世界遺産。冬の雪景色は特に絵本の中にいるような美しさでした。",
      url: "https://maps.google.com/?cid=1234567902",
      source: "サンプルデータ"
    },
    {
      id: "sample-14",
      name: "嚴島神社",
      address: "日本、〒739-0588 広島県廿日市市宮島町１−１",
      lat: 34.2960,
      lng: 132.3196,
      prefecture: "広島県",
      category: "temple",
      rating: 5,
      comment: "海の上に立つ大鳥居が非常に神秘的。満潮と干潮のどちらの時間帯もそれぞれ素晴らしい景色です。",
      url: "https://maps.google.com/?cid=1234567903",
      source: "サンプルデータ"
    },
    {
      id: "sample-15",
      name: "伊勢神宮 内宮",
      address: "日本、〒516-0023 三重県伊勢市宇治館町１",
      lat: 34.4550,
      lng: 136.7258,
      prefecture: "三重県",
      category: "temple",
      rating: 5,
      comment: "五十鈴川の御手洗場で手を清め、宇治橋を渡る時の空気の清々しさが素晴らしい。日本人の心のふるさとですね。",
      url: "https://maps.google.com/?cid=1234567904",
      source: "サンプルデータ"
    }
  ];

  setTimeout(() => {
    places = samplePlaces.map((p, idx) => ({
      ...p,
      publishTime: `2024/04/${String(10 + idx).padStart(2, '0')}`,
      updateTime: `2024/05/${String(12 + idx).padStart(2, '0')}`
    }));
    setupDropdownFilters();
    filterAndRender();

    document.getElementById("upload-section").style.display = "none";
    const dash = document.getElementById("dashboard-section");
    dash.style.display = "grid";
    setTimeout(() => {
      dash.classList.add("visible");
      map.invalidateSize();
      fitMapToMarkers();
    }, 50);
    document.getElementById("header-actions").style.display = "block";

    showLoading(false);
  }, 1000);
}

// Expose pure logic functions for Node-based tests (no-op in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { classifyCategory, extractPrefecture, parseAppBackupJSON, getAllCategories, customCategories, geminiCategories, matchesDateRange, parseCoordinatePair, buildManualPlaceFields, parseCSVRows, csvField, parseCSVData, isAppCSVBackup, parseAppCSVBackup, summarizeUnresolvedMyCategoryNames, getOrCreateGeminiCategory, buildGeminiCategoryPrompt, extractJSONArrayFromGeminiResponse, parseGeminiCategoryResponse, applyGeminiCategoryResults, getGeminiLocationIncompletePlaces, buildGeminiLocationPrompt, parseGeminiLocationResponse, applyGeminiLocationResults, parsePlaceLookupQueries, buildPlaceLookupPrompt, parsePlaceLookupResponse, checkPlaceLookupCoordinateMismatch, buildManualPlaceFieldsFromLookupCandidate, deduplicatePlaces, buildPlaceMatchKey, isSavedListCSV, parseSavedListCSV, places, shouldScheduleLocalCacheWrite };
}
