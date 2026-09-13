// 檢查 data/airfields.json，零相依（只用 node 內建）。node scripts/validate.mjs
import { readFileSync } from 'node:fs';

const KINDS = new Set(['airport', 'airbase', 'science_park', 'industrial', 'farmland',
  'school', 'residential', 'station', 'park', 'mixed', 'unknown']);
const CONFIDENCE = new Set(['confirmed', 'landmark', 'estimated']);
const SOURCE_QUALITY = new Set(['high', 'medium', 'low']);

// 一定要有的欄位。today_kind 與 runway_heading 可以缺（缺了只警告）。
const REQUIRED = ['name_zh', 'county', 'operator', 'kind', 'lat', 'lon',
  'coord_confidence', 'opened', 'today', 'remains', 'heritage', 'history', 'sources'];

// 台灣（含澎湖）範圍
const LAT = [21, 26.5];
const LON = [118, 122.5];

const errors = [];
const warnings = [];

// 提醒會成批出現（例如整份資料都還沒填 today_kind），所以分類收斂後再印
function warn(type, msg) {
  warnings.push({ type, msg });
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    fail(`無法讀取 ${path}：${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${path} 不是合法的 JSON：${e.message}`);
  }
}

const data = readJson('data/airfields.json');
if (!Array.isArray(data)) fail('data/airfields.json 的最外層必須是陣列');
if (!data.length) fail('data/airfields.json 是空陣列');

const geo = readJson('data/taiwan.json');
if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features) || !geo.features.length) {
  errors.push('data/taiwan.json 必須是有 features 的 GeoJSON FeatureCollection');
}

const seen = new Map();

data.forEach((r, i) => {
  const at = `airfields[${i}]`;
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    errors.push(`${at}：必須是物件`);
    return;
  }
  const label = typeof r.name_zh === 'string' && r.name_zh ? r.name_zh : at;

  for (const key of REQUIRED) {
    if (!(key in r)) errors.push(`${label}：缺少欄位 ${key}`);
  }

  for (const key of ['name_zh', 'county', 'operator', 'kind', 'opened', 'today', 'history']) {
    if (key in r && (typeof r[key] !== 'string' || r[key].trim() === '')) {
      errors.push(`${label}：${key} 必須是非空字串`);
    }
  }

  if (typeof r.name_zh === 'string') {
    if (seen.has(r.name_zh)) {
      errors.push(`${label}：name_zh 重複（也出現在 airfields[${seen.get(r.name_zh)}]）`);
    } else {
      seen.set(r.name_zh, i);
    }
  }

  if (typeof r.lat !== 'number' || !Number.isFinite(r.lat) || r.lat < LAT[0] || r.lat > LAT[1]) {
    errors.push(`${label}：lat 必須是 ${LAT[0]}–${LAT[1]} 之間的數字，目前是 ${JSON.stringify(r.lat)}`);
  }
  if (typeof r.lon !== 'number' || !Number.isFinite(r.lon) || r.lon < LON[0] || r.lon > LON[1]) {
    errors.push(`${label}：lon 必須是 ${LON[0]}–${LON[1]} 之間的數字，目前是 ${JSON.stringify(r.lon)}`);
  }

  if (!CONFIDENCE.has(r.coord_confidence)) {
    errors.push(`${label}：coord_confidence 必須是 confirmed / landmark / estimated，目前是 ${JSON.stringify(r.coord_confidence)}`);
  }
  if (r.coord_confidence !== 'confirmed' && !('coord_source' in r)) {
    warn('coord_source', `${label}：coord_confidence 不是 confirmed，建議補上 coord_source 說明座標怎麼來的`);
  }

  if (!('today_kind' in r) || r.today_kind == null || r.today_kind === '') {
    warn('today_kind', `${label}：沒有 today_kind，網頁會依 today 的字面推測，推不出來就標「不明」`);
  } else if (!KINDS.has(r.today_kind)) {
    errors.push(`${label}：today_kind 不合法（${JSON.stringify(r.today_kind)}），可用值：${[...KINDS].join('、')}`);
  }

  if ('runway_heading' in r && r.runway_heading !== null) {
    const h = r.runway_heading;
    if (typeof h === 'number') {
      if (!Number.isFinite(h) || h < 0 || h >= 180) {
        errors.push(`${label}：runway_heading 必須落在 0–179，目前是 ${h}`);
      }
    } else if (typeof h === 'string') {
      errors.push(`${label}：runway_heading 不可以是文字「${h}」，只能是 0–179 的數字或 null；跑道形狀之類的敘述寫進 runway_note`);
    } else {
      errors.push(`${label}：runway_heading 必須是 0–179 的數字或 null`);
    }
  }

  if ('runway_note' in r && (typeof r.runway_note !== 'string' || r.runway_note.trim() === '')) {
    errors.push(`${label}：runway_note 必須是非空字串（沒有內容就不要放這個欄位）`);
  }

  if ('duplicate_of' in r && (typeof r.duplicate_of !== 'string' || r.duplicate_of.trim() === '')) {
    errors.push(`${label}：duplicate_of 必須是非空字串（另一筆的 name_zh）`);
  }

  if (!Array.isArray(r.sources) || !r.sources.length) {
    errors.push(`${label}：sources 必須是至少一個網址的陣列`);
  } else {
    r.sources.forEach((u, j) => {
      if (typeof u !== 'string' || !/^https?:\/\//.test(u)) {
        errors.push(`${label}：sources[${j}] 必須是 http(s) 開頭的網址`);
      }
    });
  }

  if ('confidence' in r && !SOURCE_QUALITY.has(r.confidence)) {
    errors.push(`${label}：confidence 必須是 high / medium / low，目前是 ${JSON.stringify(r.confidence)}`);
  }
});

/* duplicate_of 要等 name_zh 全收完才能查：必須指向另一筆存在的名稱，
   不能指向自己，也不能指向另一筆本身就是 duplicate 的（不准鏈狀）。 */
const dupTarget = new Map();
data.forEach((r) => {
  if (r && typeof r.name_zh === 'string' && typeof r.duplicate_of === 'string' && r.duplicate_of.trim() !== '') {
    dupTarget.set(r.name_zh, r.duplicate_of);
  }
});
for (const [name, target] of dupTarget) {
  if (target === name) {
    errors.push(`${name}：duplicate_of 不可以指向自己`);
  } else if (!seen.has(target)) {
    errors.push(`${name}：duplicate_of 指向不存在的 name_zh「${target}」`);
  } else if (dupTarget.has(target)) {
    errors.push(`${name}：duplicate_of 指向「${target}」，但那一筆自己也是 duplicate；請直接指向主筆`);
  }
}

if (warnings.length) {
  const byType = new Map();
  for (const w of warnings) {
    if (!byType.has(w.type)) byType.set(w.type, []);
    byType.get(w.type).push(w.msg);
  }
  console.warn(`WARN: ${warnings.length} 個提醒（不擋 CI）`);
  for (const [type, list] of byType) {
    console.warn(`  ${type}：${list.length} 筆`);
    for (const m of list.slice(0, 3)) console.warn(`    - ${m}`);
    if (list.length > 3) console.warn(`    - ⋯ 另外 ${list.length - 3} 筆同類`);
  }
}

if (errors.length) {
  console.error(`FAIL: 發現 ${errors.length} 個問題`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`OK: ${data.length} airfields`);
