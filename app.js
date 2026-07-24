// Application State
let places = [];
let map = null;
let markersGroup = [];
let categoryChart = null;
let prefectureChart = null;
let currentSortColumn = 'name';
let currentSortDirection = 'asc';
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
// save (Drive save, JSON export, or CSV export) — state lives in memory only
// (no localStorage/IndexedDB, per SPEC.md §4), so closing the tab with this
// true silently loses the changes. Drives the beforeunload warning below.
let hasUnsavedChanges = false;
function markUnsavedChanges() { hasUnsavedChanges = true; }
function clearUnsavedChanges() { hasUnsavedChanges = false; }

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

// Initialize UI and Events
document.addEventListener("DOMContentLoaded", () => {
  // Lucide Icons
  lucide.createIcons();

  // Initialize Map
  initMap();

  // Setup Event Listeners
  setupEventListeners();

  // Warn before an accidental tab close/reload throws away unsaved edits —
  // there's no auto-save or local persistence, so this is the only safety net.
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = "";
  });
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
  const btnPlaceLookup = document.getElementById("btn-place-lookup");
  const placeLookupOverlay = document.getElementById("place-lookup-overlay");
  const placeLookupClose = document.getElementById("place-lookup-close");
  const btnPlaceLookupGenerate = document.getElementById("btn-place-lookup-generate");
  const btnPlaceLookupCopyPrompt = document.getElementById("btn-place-lookup-copy-prompt");
  const btnPlaceLookupApply = document.getElementById("btn-place-lookup-apply");

  // Google Drive sync
  btnDriveConnect.addEventListener("click", connectGoogleDrive);
  btnDriveSave.addEventListener("click", saveToDrive);

  // Select file trigger
  selectFileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  // Header shortcut to import more files (e.g. a newer Takeout export) once
  // the dashboard is already showing — #upload-section (and its drop zone)
  // is hidden at that point, so this was previously unreachable without
  // resetting all data first.
  const btnAddFiles = document.getElementById("btn-add-files");
  btnAddFiles.addEventListener("click", () => fileInput.click());

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

  // Filters and Search
  searchBox.addEventListener("input", filterAndRender);
  filterPref.addEventListener("change", filterAndRender);
  filterCatGoogle.addEventListener("change", filterAndRender);
  filterCatMy.addEventListener("change", filterAndRender);
  filterRating.addEventListener("change", filterAndRender);
  filterDateFrom.addEventListener("change", filterAndRender);
  filterDateTo.addEventListener("change", filterAndRender);

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
      
      // Update arrows UI
      document.querySelectorAll("th i").forEach(icon => {
        icon.setAttribute("data-lucide", "chevrons-up-down");
      });
      const icon = th.querySelector("i");
      if (icon) {
        icon.setAttribute("data-lucide", currentSortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
      }
      lucide.createIcons();

      filterAndRender();
    });
  });

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
    title.textContent = "クチコミを編集";
    submitBtn.innerHTML = '<i data-lucide="save"></i> 保存する';
  } else {
    editingManualPlaceId = null;
    form.reset();
    title.textContent = "クチコミを手動で追加";
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
      <button class="custom-category-delete" type="button" title="削除"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
    `;
    row.querySelector(".custom-category-delete").addEventListener("click", () => deleteCustomCategory(key));
    container.appendChild(row);
  });

  lucide.createIcons();
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
    customCategories = {};
    geminiCategories = {};
    clearUnsavedChanges();
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
        }

        const parsed = parseFileData(file.name, text);
        newPlaces = newPlaces.concat(parsed);
      } catch (e) {
        console.error("Error reading file:", file.name, e);
        alert(`ファイル「${file.name}」の読み込み中にエラーが発生しました。\nフォーマットをご確認ください。`);
      }
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
    } else {
      alert("有効なGoogle Mapsデータが検出されませんでした。");
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
  document.getElementById("header-actions").style.display = "flex";
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
      updateTime: item.updateTime || ""
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
  const publishIdx = headers.findIndex(h => /^初投稿日$/.test(h.trim()));
  const updateIdx = headers.findIndex(h => /^最終更新日$/.test(h.trim()));
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
      publishTime: csvField(row, publishIdx),
      updateTime: csvField(row, updateIdx)
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

// "YYYY/MM/DD" と "YYYY-MM-DD" のどちらでも文字列の大小比較で新旧判定できるよう区切り文字を揃える
function normalizeDateForCompare(dateStr) {
  return (dateStr || "").replace(/\//g, "-");
}

// Deduplicate places list
function deduplicatePlaces(list) {
  const unique = [];
  const keys = new Set();
  
  list.forEach(item => {
    // Generate a unique match key: either URL, or name + lat + lng
    let key = "";
    if (item.url) {
      key = item.url;
    } else if (item.lat && item.lng) {
      key = `${(item.name || "").toLowerCase()}-${item.lat.toFixed(4)}-${item.lng.toFixed(4)}`;
    } else {
      key = `${(item.name || "").toLowerCase()}-${(item.address || "").toLowerCase()}`;
    }
    
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(item);
    } else {
      // If duplicate exists, merge comments or ratings if the current has more data
      const existing = unique.find(x => {
        if (item.url && x.url === item.url) return true;
        if (item.lat && item.lng && x.lat && x.lng && Math.abs(x.lat - item.lat) < 0.0001 && Math.abs(x.lng - item.lng) < 0.0001) return true;
        return false;
      });
      if (existing) {
        // Googleマップ側でレビュー本文・評価が編集されると、Takeoutの再エクスポートで
        // 最終更新日（updateTime）が新しくなって返ってくる。手動入力レコード以外は、
        // 取り込みデータの方が新しければGoogle由来フィールドを追従上書きする。
        // 手動入力（source: "手動入力"）はユーザーが直接編集したデータなので対象外。
        const incomingIsNewer = existing.source !== "手動入力" && item.updateTime &&
          (!existing.updateTime || normalizeDateForCompare(item.updateTime) > normalizeDateForCompare(existing.updateTime));

        if (incomingIsNewer) {
          if (item.comment) existing.comment = item.comment;
          if (item.rating) existing.rating = item.rating;
          if (item.address) existing.address = item.address;
          if (item.prefecture) existing.prefecture = item.prefecture;
          existing.updateTime = item.updateTime;
          if (item.googleCategoryRaw) {
            existing.googleCategoryRaw = item.googleCategoryRaw;
            existing.category = getOrCreateGeminiCategory(item.googleCategoryRaw);
          }
        } else {
          if (!existing.comment && item.comment) existing.comment = item.comment;
          if (!existing.rating && item.rating) existing.rating = item.rating;
          if (!existing.address && item.address) existing.address = item.address;
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
      }
    }
  });
  
  return unique;
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
function parseGeminiCategoryResponse(text) {
  if (!text) return null;
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(data)) return null;

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
  if (!text) return null;
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(data)) return null;

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
// として保存する）。評価・コメント・投稿日はGeminiには分からないため空欄のまま、
// 追加後は既存の編集フローで書き足す運用を想定。
function buildManualPlaceFieldsFromLookupCandidate(candidate) {
  return {
    name: candidate.name,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    prefecture: extractPrefecture(candidate.address, candidate.name, candidate.lat, candidate.lng),
    category: candidate.category ? getOrCreateGeminiCategory(candidate.category) : classifyCategory(candidate.name, ""),
    googleCategoryRaw: candidate.category || null,
    rating: null,
    comment: "",
    url: "",
    publishTime: "",
    updateTime: ""
  };
}

function addManualPlaceFromLookupCandidate(candidate) {
  const newPlace = {
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...buildManualPlaceFieldsFromLookupCandidate(candidate),
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
      empty.textContent = "候補が見つかりませんでした。「クチコミを手動で追加」から直接入力してください。";
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

      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-primary";
      addBtn.type = "button";
      addBtn.textContent = "これを追加する";
      addBtn.addEventListener("click", () => {
        addManualPlaceFromLookupCandidate(candidate);
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

// Populate dropdown filters based on loaded data
function setupDropdownFilters() {
  const filterPref = document.getElementById("filter-prefecture");
  const filterCatGoogle = document.getElementById("filter-category-google");
  const filterCatMy = document.getElementById("filter-category-my");

  // Save current selections
  const currentPref = filterPref.value;
  const currentCatGoogle = filterCatGoogle.value;
  const currentCatMy = filterCatMy.value;

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

  // Restore selection
  filterPref.value = currentPref;
  filterCatGoogle.value = currentCatGoogle;
  filterCatMy.value = currentCatMy;
}

// Filter, Sort, and Render UI
// Check whether a "YYYY/MM/DD" date string (the app's stored format, see
// formatDateString) falls within an inclusive range given as "YYYY-MM-DD"
// strings from <input type="date">. Both are zero-padded, so a straight
// string compare after normalizing the separator is enough (no Date parsing,
// no timezone drift).
function matchesDateRange(dateStr, fromStr, toStr) {
  if (!fromStr && !toStr) return true;
  if (!dateStr) return false;
  const normalized = dateStr.replace(/\//g, "-");
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
    const matchDate = matchesDateRange(p.publishTime, dateFrom, dateTo);
    return matchSearch && matchPref && matchCatGoogle && matchCatMy && matchRating && matchDate;
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
  tbody.innerHTML = "";

  if (filteredList.length === 0) {
    emptyState.style.display = "flex";
    return;
  }
  emptyState.style.display = "none";

  filteredList.forEach(p => {
    const tr = document.createElement("tr");
    
    // Name Column with link icon
    const nameTd = document.createElement("td");
    nameTd.className = "col-name";
    nameTd.innerHTML = `
      <div class="cell-scrollable">
        ${p.url ? `<a href="${p.url}" target="_blank" class="maps-link-btn" title="Googleマップで開く"><i data-lucide="external-link" style="width:14px;height:14px;margin-right:4px;vertical-align:middle;display:inline-block;"></i></a>` : ''}
        <span title="${p.name}">${p.name}</span>
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

    // Update Date Column (derived from publishTime / date property)
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

    // Delete listener
    actTd.querySelector(".btn-delete").addEventListener("click", () => {
      if (confirm(`「${p.name}」をリストから削除しますか？`)) {
        places = places.filter(x => x.id !== p.id);
        markUnsavedChanges();
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
  csvRows.push(["スポット名", "都道府県", "マイ都道府県", "カテゴリー", "マイカテゴリー", "住所", "評価", "レビュー・メモ", "初投稿日", "最終更新日", "緯度", "経度", "Googleマップリンク", "データソース"].join(","));

  places.forEach(p => {
    const row = [
      escapeCSVValue(p.name),
      escapeCSVValue(p.prefecture),
      escapeCSVValue(p.myPrefecture || ""),
      escapeCSVValue(getAllCategories()[p.category]?.name || "その他"),
      escapeCSVValue(p.myCategory ? (getAllCategories()[p.myCategory]?.name || "") : ""),
      escapeCSVValue(p.address),
      escapeCSVValue(p.rating ? p.rating.toString() : ""),
      escapeCSVValue(p.comment),
      escapeCSVValue(p.publishTime || ""),
      escapeCSVValue(p.updateTime || ""),
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
function buildBackupJSONPayload() {
  return places.map(p => ({
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
    source: p.source
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
    document.getElementById("header-actions").style.display = "flex";

    showLoading(false);
  }, 1000);
}

// Expose pure logic functions for Node-based tests (no-op in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { classifyCategory, extractPrefecture, parseAppBackupJSON, getAllCategories, customCategories, geminiCategories, matchesDateRange, parseCoordinatePair, buildManualPlaceFields, parseCSVRows, csvField, parseCSVData, isAppCSVBackup, parseAppCSVBackup, summarizeUnresolvedMyCategoryNames, getOrCreateGeminiCategory, buildGeminiCategoryPrompt, parseGeminiCategoryResponse, applyGeminiCategoryResults, parsePlaceLookupQueries, buildPlaceLookupPrompt, parsePlaceLookupResponse, checkPlaceLookupCoordinateMismatch, buildManualPlaceFieldsFromLookupCandidate, deduplicatePlaces, places };
}
