/* 舊飛行場 airfields — 零建置。所有數字、清單、地圖點都由 data/airfields.json 算出。 */

(function () {
  'use strict';

  /* ---------- 常數 ---------- */

  var KIND_LABEL = {
    airport: '機場',
    airbase: '軍事基地',
    science_park: '科學園區',
    industrial: '工業區',
    farmland: '農田',
    school: '學校',
    residential: '住宅',
    station: '車站',
    park: '公園',
    mixed: '混合',
    unknown: '不明'
  };

  var KIND_ORDER = ['airport', 'airbase', 'science_park', 'industrial', 'station',
    'school', 'park', 'farmland', 'residential', 'mixed', 'unknown'];

  var ACTIVE_KINDS = { airport: true, airbase: true };

  /* 軍種：由 operator 字串判斷（「陸軍（後海軍亦使用）」算共用）。
     堆疊條的段序＝這個順序，明度由深到淺。 */
  var SVC_ORDER = ['陸軍', '海軍', '共用', '不詳'];
  /* 明度用透明度疊在底色上，淺色深色都通用；下限訂在 0.26，再低在深色底上就看不見了 */
  var SVC_ALPHA = { '陸軍': 1, '海軍': 0.70, '共用': 0.46, '不詳': 0.26 };

  /* 清單分組順序：由北到南 */
  var COUNTY_ORDER = ['基隆', '台北', '新北', '桃園', '新竹', '苗栗', '台中', '彰化',
    '南投', '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖'];

  var ATTR_OSM = '© OpenStreetMap contributors';
  var ATTR_ESRI = 'Esri, Maxar, Earthstar Geographics';
  var ATTR_SINICA = '中央研究院人社中心 GIS 專題中心 臺灣百年歷史地圖';

  var SAT_DOT = '#f2d27a';
  var RUNWAY_M = 800;      /* 由中心往兩側各 800 公尺，全長 1.6 公里 */
  var EST_RADIUS_M = 1500; /* 鄉鎮估計的虛線圓半徑 */

  /* 側欄縮圖的圖磚：跟地圖同三個來源，瀏覽器直接向來源請求，本站不代理 */
  var TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var TILE_OLD_A = 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM50K_1924-jpg-{z}-{x}-{y}';
  var TILE_OLD_B = 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM25K_1921-jpg-{z}-{x}-{y}';
  var THUMB_Z_SAT = 15;
  var THUMB_Z_OLD = 14;

  var CONF_ORDER = ['confirmed', 'landmark', 'estimated'];
  var CONF_LEGEND = {
    confirmed: '可對上跑道',
    landmark: '依今日地標',
    estimated: '鄉鎮估計'
  };

  /* today_kind 缺漏時，只認明確字眼，其餘留「不明」 */
  var KIND_HINTS = [
    ['airbase', ['空軍基地', '海軍基地', '軍事基地', '軍港', '軍事用地', '軍用', '營區',
      '新兵訓練', '軍官學校', '國防大學', '空軍']],
    ['airport', ['機場', '航空站']],
    ['science_park', ['科學園區', '科技園區', '經貿園區']],
    ['industrial', ['工業區', '工業園區', '工廠', '廠區', '酒廠', '港埠']],
    ['station', ['高鐵', '車站']],
    ['school', ['大學', '國小', '中學', '高中', '學校', '校區']],
    ['park', ['公園', '風景區']],
    ['farmland', ['農地', '農田', '農場', '稻米', '魚塭']],
    ['residential', ['都市化', '住宅', '眷村', '特區', '市區']]
  ];
  var GONE_HINTS = ['舊址', '已無', '無跡', '原機場', '已陸化'];
  var EMPTY_RE = /^(無|不詳|未知|未見|沒有|不明|待查|—|-)/;

  /* ---------- 小工具 ---------- */

  function $(id) { return document.getElementById(id); }

  /* 圖表標籤要量寬度，視窗改變就重排一次（節流） */
  function onResize(fn) {
    var t = null;
    window.addEventListener('resize', function () {
      if (t) clearTimeout(t);
      t = setTimeout(fn, 120);
    });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(fn);
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hasText(v) {
    if (v == null) return false;
    var s = String(v).trim();
    return s !== '' && !EMPTY_RE.test(s);
  }

  /* 側欄裡「沒有這回事」的各種寫法統一顯示成「無」（資料本身不動） */
  var NONE_WORDS = { '無': 1, '無資料': 1, '沒有': 1, '未見': 1, '無跡': 1, '無遺跡': 1, '無存': 1 };

  function tidyNone(v) {
    var s = String(v == null ? '' : v).trim();
    return NONE_WORDS[s] ? '無' : s;
  }

  /* ---------- 孤字 ---------- */

  /* 中文每個字都能斷行，Safari 也還不支援 text-wrap: pretty，所以動態產生的文字
     一律把結尾兩個字（含結尾標點）包進不可斷行的 span，避免一個字掉到下一行。 */

  var TAIL_PUNCT = '，。、；：？！（）「」『』〈〉《》〔〕【】—…‧·～’”';
  var OPEN_PUNCT = '（「『〈《〔【';

  function lastTextNode(node) {
    if (!node) return null;
    if (node.nodeType === 3) return /\S/.test(node.nodeValue) ? node : null;
    for (var i = node.childNodes.length - 1; i >= 0; i--) {
      var t = lastTextNode(node.childNodes[i]);
      if (t) return t;
    }
    return null;
  }

  function noOrphan(node) {
    if (!node) return node;
    var t = lastTextNode(node);
    if (!t) return node;
    var s = t.nodeValue.replace(/\s+$/, '');
    if (s.length < 4) return node;

    var i = s.length;
    var words = 0;
    while (i > 0 && (s.length - i) < 8) {
      var ch = s.charAt(i - 1);
      i--;
      if (TAIL_PUNCT.indexOf(ch) < 0 && !/\s/.test(ch)) words++;
      if (words >= 2) break;
    }
    /* 左緣剛好切在開頭標點（例如「（」）後面時，把它一起吞進來 */
    while (i > 0 && OPEN_PUNCT.indexOf(s.charAt(i - 1)) >= 0) i--;
    if (i <= 0 || i >= s.length) return node;

    var span = el('span', 'nb', s.slice(i));
    t.nodeValue = s.slice(0, i);
    if (t.nextSibling) t.parentNode.insertBefore(span, t.nextSibling);
    else t.parentNode.appendChild(span);
    return node;
  }

  function setText(node, text) {
    node.textContent = text == null ? '' : text;
    if (node.textContent) noOrphan(node);
    return node;
  }

  /* runway_heading 可能是中文敘述（例如「東北—西南」），非數字一律當成沒有 */
  function normHeading(v) {
    var n = null;
    if (typeof v === 'number' && isFinite(v)) n = v;
    else if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) n = Number(v);
    if (n == null) return null;
    return ((n % 180) + 180) % 180;
  }

  function normKind(rec) {
    var k = rec.today_kind;
    if (typeof k === 'string' && KIND_LABEL[k]) return k;
    return guessKind(rec.today);
  }

  function guessKind(today) {
    if (!hasText(today)) return 'unknown';
    var s = String(today);
    var gone = GONE_HINTS.some(function (w) { return s.indexOf(w) >= 0; });
    var hit = [];
    KIND_HINTS.forEach(function (pair) {
      var kind = pair[0];
      if (gone && (kind === 'airport' || kind === 'airbase')) return;
      if (pair[1].some(function (w) { return s.indexOf(w) >= 0; })) hit.push(kind);
    });
    if (hit.indexOf('airbase') >= 0) return 'airbase';
    if (hit.indexOf('airport') >= 0) return 'airport';
    if (hit.length > 1) return 'mixed';
    if (hit.length === 1) return hit[0];
    return 'unknown';
  }

  function normCounty(v) {
    var s = String(v || '').replace(/臺/g, '台');
    for (var i = 0; i < COUNTY_ORDER.length; i++) {
      if (s.indexOf(COUNTY_ORDER[i]) === 0) return COUNTY_ORDER[i];
    }
    return '其他';
  }

  /* 由起點依方位角推算終點（球面） */
  function dest(lat, lon, bearingDeg, distM) {
    var R = 6371000;
    var d = distM / R;
    var b = bearingDeg * Math.PI / 180;
    var p1 = lat * Math.PI / 180;
    var l1 = lon * Math.PI / 180;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 * 180 / Math.PI, ((l2 * 180 / Math.PI + 540) % 360) - 180];
  }

  /* operator 是自由文字（「陸軍（戰時海軍台南航空隊亦進駐）」等），只看有沒有出現兩個軍種 */
  function svcOf(operator) {
    var s = String(operator == null ? '' : operator);
    var army = s.indexOf('陸軍') >= 0;
    var navy = s.indexOf('海軍') >= 0;
    if (army && navy) return '共用';
    if (navy) return '海軍';
    if (army) return '陸軍';
    return '不詳';
  }

  /* 網頁墨卡托：回傳小數的圖磚座標（整數部分是圖磚編號，小數是磚內比例） */
  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z);
    var x = (lon + 180) / 360 * n;
    var s = Math.sin(lat * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return [x, y];
  }

  function tileUrl(tpl, z, x, y) {
    return tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  /* 中研院的圖磚在沒有覆蓋的地方回傳 936 bytes 的全透明 PNG（不是 404），
     所以「有沒有舊圖」只能看畫素。tileserver 帶 Access-Control-Allow-Origin: *，
     配 crossOrigin 後可以畫進 canvas 取樣，不必多發一次請求。 */
  function isBlankTile(img) {
    try {
      var c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0, 64, 64);
      var px = g.getImageData(0, 0, 64, 64).data;
      for (var i = 3; i < px.length; i += 4) if (px[i] > 8) return false;
      return true;
    } catch (e) {
      return false; /* 取樣失敗就當它有圖，寧可多顯示 */
    }
  }

  /* ---------- 狀態 ---------- */

  var records = [];
  var byName = {};
  var map = null;
  var layers = {};          /* base layers */
  var markerLayer = null;
  var current = null;       /* 目前打開的那一座 */
  var baseName = 'osm';
  var filters = { kind: 'all', county: 'all' };
  var hashLock = false;

  /* ---------- 啟動 ---------- */

  function boot() {
    fetch('data/airfields.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        records = dedupe((Array.isArray(raw) ? raw : []).map(prepare));
        if (!records.length) throw new Error('資料是空的');
        renderCharts();
        buildMap();
        buildFilters();
        renderList();
        renderMapLegend();
        openFromHash(true);
        window.addEventListener('hashchange', function () { openFromHash(false); });
        onResize(function () {
          layoutSvcLabels();
          layoutCountyChart();
        });
      })
      .catch(function (e) {
        setText($('map-note'), '資料讀取失敗：' + e.message);
      });
  }

  function prepare(r, i) {
    var o = Object.create(null);
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
    o.id = 'af-' + i;
    o.name_zh = String(r.name_zh || '（無名）');
    o.kindKey = normKind(r);
    o.kindLabel = KIND_LABEL[o.kindKey];
    o.countyKey = normCounty(r.county);
    o.heading = normHeading(r.runway_heading);
    o.conf = r.coord_confidence === 'landmark' || r.coord_confidence === 'estimated'
      ? r.coord_confidence : 'confirmed';
    o.lat = Number(r.lat);
    o.lon = Number(r.lon);
    o.aliases = [];
    return o;
  }

  /* 疑似重複的兩筆（`duplicate_of` 指向主筆）不上地圖、不進清單、不算進統計，
     只在主筆的側欄用「亦稱」列出來；`#a=<那個名字>` 也導到主筆。 */
  function dedupe(all) {
    var all_by = {};
    all.forEach(function (r) { all_by[r.name_zh] = r; });

    var primary = all.filter(function (r) {
      var t = r.duplicate_of;
      return !(typeof t === 'string' && t !== r.name_zh && all_by[t]);
    });

    primary.forEach(function (r) { byName[r.name_zh] = r; });

    all.forEach(function (r) {
      if (primary.indexOf(r) >= 0) return;
      var main = all_by[r.duplicate_of];
      /* 不准鏈狀：指到的那一筆自己也是 duplicate 時，往上找到主筆 */
      var guard = 0;
      while (main && byName[main.name_zh] !== main && guard++ < 8) {
        main = all_by[main.duplicate_of];
      }
      if (!main) return;
      main.aliases.push(r.name_zh);
      byName[r.name_zh] = main;
    });

    return primary;
  }

  /* ---------- 開場圖表 ---------- */

  /* 圖表規則：一種數量只用一個色相（--accent），數值與標籤用文字色；
     長條細、無圓角、無陰影；每一段都有 title 寫完整名稱與座數。 */

  function countBy(fn) {
    var m = {};
    records.forEach(function (r) {
      var k = fn(r);
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function renderCharts() {
    setText($('lede'), '1945 年，台灣有 ' + records.length + ' 座飛行場。');
    renderKindBars();
    renderRatios();
    renderSvcStack();
  }

  /* 「現在是什麼」水平長條：由多到少，點一列等於按 kind 篩選 */
  function renderKindBars() {
    var counts = countBy(function (r) { return r.kindKey; });
    var rows = Object.keys(counts).sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b);
    });
    var max = rows.reduce(function (m, k) { return Math.max(m, counts[k]); }, 0) || 1;

    var box = $('kind-bars');
    box.textContent = '';
    rows.forEach(function (k) {
      var b = el('button', 'bar-row');
      b.type = 'button';
      b.dataset.kind = k;
      b.title = KIND_LABEL[k] + ' ' + counts[k] + ' 座';
      b.setAttribute('aria-pressed', filters.kind === k ? 'true' : 'false');
      b.appendChild(el('span', 'bar-l', KIND_LABEL[k]));
      var track = el('span', 'bar-track');
      var fill = el('span', 'bar-fill');
      fill.style.width = (counts[k] / max * 100).toFixed(2) + '%';
      track.appendChild(fill);
      b.appendChild(track);
      b.appendChild(el('span', 'bar-v serif', String(counts[k])));
      b.addEventListener('click', function () {
        setKind(filters.kind === k ? 'all' : k);
        scrollToList();
      });
      box.appendChild(b);
    });
  }

  /* 三列比例條：分子填 accent，其餘留 rule 色 */
  function renderRatios() {
    var total = records.length;
    var rows = [
      ['仍是機場或基地', records.filter(function (r) { return ACTIVE_KINDS[r.kindKey]; }).length],
      ['有遺跡', records.filter(function (r) { return hasText(r.remains); }).length],
      ['列為文化資產', records.filter(function (r) { return hasText(r.heritage); }).length]
    ];
    var box = $('ratio-rows');
    box.textContent = '';
    rows.forEach(function (pair) {
      var row = el('div', 'ratio-row');
      row.title = pair[0] + ' ' + pair[1] + '／' + total + ' 座';
      row.appendChild(el('span', 'ratio-l', pair[0]));
      var track = el('span', 'ratio-track');
      var fill = el('span', 'ratio-fill');
      fill.style.width = (pair[1] / total * 100).toFixed(2) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'ratio-v serif', pair[1] + '／' + total));
      box.appendChild(row);
    });
  }

  /* 軍種 100％ 堆疊條：accent 的四個明度＋2px 底色縫，標籤直接放段下方，
     太窄放不下的段改進圖例。段寬用 flex-grow 分配，縫隙才不會讓總寬溢出。 */
  var svcSegs = [];

  function renderSvcStack() {
    var counts = countBy(function (r) { return svcOf(r.operator); });
    svcSegs = SVC_ORDER.filter(function (k) { return counts[k]; })
      .map(function (k) { return { key: k, n: counts[k] }; });

    var stack = $('svc-stack');
    var labels = $('svc-labels');
    stack.textContent = '';
    labels.textContent = '';

    svcSegs.forEach(function (s) {
      var seg = el('span', 'seg');
      seg.style.flexGrow = String(s.n);
      seg.style.opacity = String(SVC_ALPHA[s.key]);
      seg.title = s.key + ' ' + s.n + ' 座';
      stack.appendChild(seg);
      s.el = seg;

      var cell = el('span', 'sl');
      cell.style.flexGrow = String(s.n);
      cell.appendChild(el('span', 'sl-n', s.key));
      cell.appendChild(el('span', 'sl-v', String(s.n)));
      labels.appendChild(cell);
      s.cell = cell;
    });

    layoutSvcLabels();
  }

  /* 段太窄（放不下兩個字）就把標籤收到圖例那一行 */
  function layoutSvcLabels() {
    if (!svcSegs.length) return;
    var legend = $('svc-legend');
    legend.textContent = '';
    var spill = [];
    svcSegs.forEach(function (s) {
      var w = s.el.getBoundingClientRect().width;
      var narrow = w < 34;
      s.cell.classList.toggle('sl-hide', narrow);
      if (narrow) spill.push(s);
    });
    spill.forEach(function (s, i) {
      if (i) legend.appendChild(document.createTextNode('；'));
      var item = el('span', 'lg-item');
      var sw = el('span', 'lg-swatch');
      sw.style.opacity = String(SVC_ALPHA[s.key]);
      item.appendChild(sw);
      item.appendChild(el('span', null, s.key + ' ' + s.n));
      legend.appendChild(item);
    });
  }

  /* ---------- 地圖 ---------- */

  function buildMap() {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: 6,
      maxZoom: 18
    });

    map.attributionControl.setPrefix('');

    layers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: ATTR_OSM
    });
    layers.sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: ATTR_ESRI
      });
    /* 中研院「臺灣百年歷史地圖」：1944 年美軍圖的圖磚實測全是空白（透明 placeholder），
       改用有內容的日治地形圖兩層相疊（1924 五萬分一蓋台灣本島、1921 二萬五千分一補澎湖）。 */
    layers.old = L.layerGroup([
      L.tileLayer('https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM25K_1921-jpg-{z}-{x}-{y}', {
        maxZoom: 19, maxNativeZoom: 16, attribution: ATTR_SINICA
      }),
      L.tileLayer('https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM50K_1924-jpg-{z}-{x}-{y}', {
        maxZoom: 19, maxNativeZoom: 16, attribution: ATTR_SINICA
      })
    ]);

    layers.osm.addTo(map);

    drawCounties();

    markerLayer = L.layerGroup().addTo(map);
    records.forEach(buildLayersFor);
    applyFilters();

    /* 版面（例如側欄寬度、字型）在初次進頁時可能還沒定型，容器尺寸這時量到的
       值不準，取景會跑掉；fitBounds 前先強迫 Leaflet 重新量一次容器大小。
       取景已經是依所有飛行場點的 bounds（含澎湖），不是縣界 GeoJSON 的 bounds。 */
    map.invalidateSize({ animate: false });
    var bounds = L.latLngBounds(records.map(function (r) { return [r.lat, r.lon]; }));
    map.fitBounds(bounds, { padding: [24, 24] });

    /* 台灣＋澎湖的外框「窄高」，地圖容器「寬扁」：fitBounds 被高度那邊卡住（基隆到恆春
       的高度已經不能再縮），寬度因此多出一大截。多出來的寬度兩側均分、再往東偏一點點
       （東 63％／西 37％），台灣才會落在畫面中央偏左、澎湖完整可見；西側露一點福建海岸
       沒關係，但不要把整個廈門、泉州帶進來。手機直式畫面比較窄高，多出來的寬度少，
       這段位移也跟著小。 */
    var visible = map.getBounds();
    var slack = (visible.getEast() - visible.getWest()) - (bounds.getEast() - bounds.getWest());
    if (slack > 0) {
      var c = map.getCenter();
      map.setView([c.lat, c.lng + slack * 0.13], map.getZoom(), { animate: false });
    }

    addLayerSwitch();

    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (dark && dark.addEventListener) dark.addEventListener('change', restyleMarkers);
  }

  function drawCounties() {
    fetch('data/taiwan.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (gj) {
        if (!gj) return;
        L.geoJSON(gj, {
          interactive: false,
          /* 只畫台灣本島與澎湖。金門、連江在畫面西邊很遠的地方，畫了會把視線往外拉，
             而且它們一座飛行場也沒有。用經度判斷：整個 feature 都在 119.2 以西就跳過。 */
          filter: function (f) { return featureEast(f) >= 119.2; },
          style: function () {
            return { color: cssVar('--muted'), weight: 0.6, opacity: 0.55, fill: false };
          }
        }).addTo(map);
      })
      .catch(function () { /* 縣界只是輔助，失敗就算了 */ });
  }

  /* feature 座標裡最東的經度 */
  function featureEast(f) {
    var east = -180;
    (function walk(c) {
      if (!c) return;
      if (typeof c[0] === 'number') { if (c[0] > east) east = c[0]; return; }
      for (var i = 0; i < c.length; i++) walk(c[i]);
    })(f.geometry && f.geometry.coordinates);
    return east;
  }

  /* ---------- 地圖圖例 ---------- */

  /* 三種座標可信度各畫一個跟圖上一樣的記號。地圖點在衛星層會轉黃色，
     圖例固定用 accent，不隨底圖跳色。 */
  function confMark(kind) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'lg-mk');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    function circle(r, fill, dash, w) {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', '8');
      c.setAttribute('cy', '8');
      c.setAttribute('r', String(r));
      c.setAttribute('fill', fill);
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', String(w));
      if (dash) c.setAttribute('stroke-dasharray', dash);
      svg.appendChild(c);
    }
    if (kind === 'estimated') {
      circle(6.6, 'none', '3,2.4', 1);
      circle(2.6, 'none', '1.8,1.8', 1);
    } else {
      circle(3.6, 'currentColor', null, 1);
    }
    return svg;
  }

  function renderMapLegend() {
    var counts = countBy(function (r) { return r.conf; });
    var note = $('map-note');
    note.textContent = '';
    CONF_ORDER.forEach(function (k) {
      if (!counts[k]) return;
      var item = el('span', 'lg-item');
      item.title = CONF_LEGEND[k] + ' ' + counts[k] + ' 座';
      item.appendChild(confMark(k));
      item.appendChild(el('span', 'lg-t', CONF_LEGEND[k] + ' ' + counts[k]));
      note.appendChild(item);
    });
  }

  function dotColor() { return baseName === 'sat' ? SAT_DOT : cssVar('--accent'); }

  function buildLayersFor(r) {
    var color = dotColor();
    var group = [];

    var marker = L.circleMarker([r.lat, r.lon], {
      radius: 5,
      color: color,
      weight: r.conf === 'estimated' ? 1.2 : 1,
      opacity: 1,
      fillColor: color,
      fillOpacity: r.conf === 'estimated' ? 0 : 0.85,
      dashArray: r.conf === 'estimated' ? '2,2' : null,
      bubblingMouseEvents: false
    });
    marker.bindTooltip(r.name_zh, { direction: 'top', offset: [0, -8], sticky: false });
    marker.on('click', function () { open(r, true); });
    group.push(marker);

    if (r.conf === 'estimated') {
      var ring = L.circle([r.lat, r.lon], {
        radius: EST_RADIUS_M,
        color: color,
        weight: 1,
        opacity: 0.8,
        dashArray: '4,4',
        fill: false,
        bubblingMouseEvents: false
      });
      ring.on('click', function () { open(r, true); });
      group.push(ring);
    }

    if (r.heading != null) {
      var a = dest(r.lat, r.lon, r.heading, RUNWAY_M);
      var b = dest(r.lat, r.lon, r.heading + 180, RUNWAY_M);
      group.push(L.polyline([a, b], {
        color: color, weight: 1.2, opacity: 0.9, interactive: false
      }));
    }

    r._layers = group;
    r._marker = marker;
  }

  function restyleMarkers() {
    var color = dotColor();
    records.forEach(function (r) {
      (r._layers || []).forEach(function (l) {
        var opt = { color: color };
        if (l instanceof L.CircleMarker && !(l instanceof L.Circle)) {
          opt.fillColor = color;
        }
        l.setStyle(opt);
      });
    });
  }

  function addLayerSwitch() {
    var Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'layer-switch');
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', '底圖');
        [['osm', '地圖'], ['sat', '衛星'], ['old', '舊地圖']].forEach(function (pair) {
          var b = el('button', null, pair[1]);
          b.type = 'button';
          b.dataset.base = pair[0];
          b.setAttribute('aria-pressed', pair[0] === baseName ? 'true' : 'false');
          if (pair[0] === 'old') b.title = '日治二萬五千分一（1921）與五萬分一（1924）地形圖';
          b.addEventListener('click', function () { setBase(pair[0]); });
          box.appendChild(b);
        });
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        return box;
      }
    });
    map.addControl(new Ctl());
  }

  function setBase(name) {
    if (!layers[name] || name === baseName) return;
    map.removeLayer(layers[baseName]);
    layers[name].addTo(map);
    if (layers[name].bringToBack) layers[name].bringToBack();
    baseName = name;
    var btns = document.querySelectorAll('.layer-switch button');
    Array.prototype.forEach.call(btns, function (b) {
      b.setAttribute('aria-pressed', b.dataset.base === name ? 'true' : 'false');
    });
    restyleMarkers();
  }

  /* ---------- 篩選 ---------- */

  function buildFilters() {
    var kinds = KIND_ORDER.filter(function (k) {
      return records.some(function (r) { return r.kindKey === k; });
    });
    var box = $('kind-filter');
    box.textContent = '';
    [['all', '全部']].concat(kinds.map(function (k) { return [k, KIND_LABEL[k]]; }))
      .forEach(function (pair) {
        var b = el('button', 'kind-btn', pair[1]);
        b.type = 'button';
        b.dataset.kind = pair[0];
        b.setAttribute('aria-pressed', pair[0] === filters.kind ? 'true' : 'false');
        b.addEventListener('click', function () { setKind(pair[0]); });
        box.appendChild(b);
      });

    var counties = COUNTY_ORDER.concat(['其他']).filter(function (c) {
      return records.some(function (r) { return r.countyKey === c; });
    });
    var sel = $('county-select');
    sel.textContent = '';
    [['all', '全部縣市']].concat(counties.map(function (c) { return [c, c]; }))
      .forEach(function (pair) {
        var o = document.createElement('option');
        o.value = pair[0];
        o.textContent = pair[1];
        sel.appendChild(o);
      });
    sel.value = filters.county;
    sel.addEventListener('change', function () { setCounty(sel.value); });

    buildCountyChart(counties);
  }

  /* 縣市直條圖：由北到南一根一根，點一根等於選那個縣市（再點一次取消）。
     沒有飛行場的縣市（例如基隆）不畫空桿，直接不列。 */
  function buildCountyChart(counties) {
    var counts = countBy(function (r) { return r.countyKey; });
    var max = counties.reduce(function (m, c) { return Math.max(m, counts[c] || 0); }, 0) || 1;
    var box = $('county-chart');
    box.textContent = '';
    counties.forEach(function (c) {
      var n = counts[c] || 0;
      var b = el('button', 'cty');
      b.type = 'button';
      b.dataset.county = c;
      b.title = c + ' ' + n + ' 座';
      b.setAttribute('aria-pressed', filters.county === c ? 'true' : 'false');
      var bar = el('span', 'cty-bar');
      var fill = el('span', 'cty-fill');
      fill.style.height = (n / max * 100).toFixed(2) + '%';
      bar.appendChild(fill);
      b.appendChild(bar);
      b.appendChild(el('span', 'cty-n', c));
      b.addEventListener('click', function () {
        setCounty(filters.county === c ? 'all' : c);
        scrollToList();
      });
      box.appendChild(b);
    });
    layoutCountyChart();
  }

  /* 窄畫面一根只有二十來 px，縣市名讓它一個字一行；夠寬就排成一行 */
  function layoutCountyChart() {
    var box = $('county-chart');
    var first = box.querySelector('.cty');
    if (!first) return;
    box.classList.toggle('cty-stack', first.getBoundingClientRect().width < 30);
  }

  function syncKindUI() {
    Array.prototype.forEach.call(document.querySelectorAll('.kind-btn'), function (x) {
      x.setAttribute('aria-pressed', x.dataset.kind === filters.kind ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.bar-row'), function (x) {
      x.setAttribute('aria-pressed', x.dataset.kind === filters.kind ? 'true' : 'false');
    });
  }

  function syncCountyUI() {
    $('county-select').value = filters.county;
    Array.prototype.forEach.call(document.querySelectorAll('.cty'), function (x) {
      x.setAttribute('aria-pressed', x.dataset.county === filters.county ? 'true' : 'false');
    });
  }

  function setKind(k) {
    filters.kind = k;
    syncKindUI();
    applyFilters();
    renderList();
  }

  function setCounty(c) {
    filters.county = c;
    syncCountyUI();
    applyFilters();
    renderList();
  }

  function scrollToList() {
    var h = $('list-h');
    if (!h || !h.scrollIntoView) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    h.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }

  function passes(r) {
    if (filters.kind !== 'all' && r.kindKey !== filters.kind) return false;
    if (filters.county !== 'all' && r.countyKey !== filters.county) return false;
    return true;
  }

  function applyFilters() {
    records.forEach(function (r) {
      var on = passes(r);
      (r._layers || []).forEach(function (l) {
        var has = markerLayer.hasLayer(l);
        if (on && !has) markerLayer.addLayer(l);
        else if (!on && has) markerLayer.removeLayer(l);
      });
    });
  }

  /* ---------- 清單 ---------- */

  function renderList() {
    var wrap = $('list');
    wrap.textContent = '';
    var shown = records.filter(passes);

    if (!shown.length) {
      wrap.appendChild(noOrphan(el('p', 'empty', '這個條件下沒有飛行場。')));
      return;
    }

    var order = COUNTY_ORDER.concat(['其他']);
    order.forEach(function (county) {
      var rows = shown.filter(function (r) { return r.countyKey === county; });
      if (!rows.length) return;

      var grp = el('section', 'grp');
      var h = el('h3', 'grp-h');
      h.appendChild(el('span', 'grp-t', county));
      h.appendChild(el('span', 'grp-n', rows.length + ' 座'));
      grp.appendChild(h);

      rows.forEach(function (r) {
        var b = el('button', 'row');
        b.type = 'button';
        b.dataset.name = r.name_zh;
        if (current === r) b.setAttribute('aria-current', 'true');

        var name = el('span', 'r-name');
        /* 名稱自己一個 span：孤字處理與 hover 變色只作用在名稱，不含軍種小字 */
        name.appendChild(noOrphan(el('span', 'r-nt', r.name_zh)));
        if (hasText(r.operator)) name.appendChild(el('span', 'r-op', r.operator));
        b.appendChild(name);
        b.appendChild(noOrphan(el('span', 'r-today', hasText(r.today) ? r.today : '不詳')));
        b.appendChild(el('span', 'tag', r.kindLabel));

        b.addEventListener('click', function () { open(r, true); });
        grp.appendChild(b);
      });

      wrap.appendChild(grp);
    });
  }

  function markListCurrent() {
    Array.prototype.forEach.call(document.querySelectorAll('.row'), function (b) {
      if (current && b.dataset.name === current.name_zh) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  /* ---------- 側欄 ---------- */

  function fact(dl, label, value, tag, always) {
    if (!always && !hasText(value) && !tag) return;
    var text = tidyNone(value) || '不詳';
    var row = document.createElement('div');
    row.appendChild(el('dt', null, label));
    var dd = noOrphan(el('dd', null, text));
    if (tag) dd.appendChild(el('span', 'tag', tag));
    row.appendChild(dd);
    dl.appendChild(row);
  }

  /* 跑道方位小羅盤：細圓框＋一條穿過圓心、依方位角旋轉的線。0° 是正北。 */
  function compass(deg) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'cmp');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '0 0 28 28');
    svg.setAttribute('aria-hidden', 'true');

    var ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', '14');
    ring.setAttribute('cy', '14');
    ring.setAttribute('r', '12.5');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('class', 'cmp-ring');
    svg.appendChild(ring);

    var line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '14');
    line.setAttribute('y1', '2.5');
    line.setAttribute('x2', '14');
    line.setAttribute('y2', '25.5');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('class', 'cmp-line');
    line.setAttribute('transform', 'rotate(' + deg + ' 14 14)');
    svg.appendChild(line);

    return svg;
  }

  /* 方位角是 0–179，所以只有四個方向詞 */
  var AXIS_WORD = ['南北向', '東北—西南向', '東西向', '西北—東南向'];

  function axisWord(deg) {
    return AXIS_WORD[Math.round(((deg % 180) + 180) % 180 / 45) % 4];
  }

  function headingRow(dl, deg) {
    var row = document.createElement('div');
    row.appendChild(el('dt', null, '方位'));
    var dd = el('dd', 'p-hdg');
    dd.appendChild(compass(deg));
    dd.appendChild(el('span', 'p-hdg-t', deg + '°（' + axisWord(deg) + '）'));
    row.appendChild(dd);
    dl.appendChild(row);
  }

  /* ---------- 側欄縮圖：當年／今日 ---------- */

  /* 用 2×2 張 256px 圖磚鋪一個 overflow:hidden 的方框，translate 讓該點落在正中央。
     origin 依點落在磚內的哪一半決定，該點的位置因此一定落在 [128, 384] 之間，
     方框再大到 256px 也不會露出邊界。 */
  function tileMosaic(box, lat, lon, tpls, done) {
    var z = box.dataset.z ? Number(box.dataset.z) : THUMB_Z_SAT;
    var xy = tileXY(lat, lon, z);
    var tx = Math.floor(xy[0]);
    var ty = Math.floor(xy[1]);
    var fx = xy[0] - tx;
    var fy = xy[1] - ty;
    var ox = fx < 0.5 ? tx - 1 : tx;
    var oy = fy < 0.5 ? ty - 1 : ty;
    var px = (xy[0] - ox) * 256;
    var py = (xy[1] - oy) * 256;

    box.textContent = '';
    var pending = 0;
    var centreImgs = [];

    tpls.forEach(function (tpl, layer) {
      var grid = el('span', 'th-grid');
      grid.style.transform = 'translate(' + (-px).toFixed(1) + 'px,' + (-py).toFixed(1) + 'px)';
      box.appendChild(grid);
      for (var dy = 0; dy < 2; dy++) {
        for (var dx = 0; dx < 2; dx++) {
          var img = new Image();
          img.className = 'th-t';
          img.decoding = 'async';
          img.alt = '';
          img.crossOrigin = 'anonymous';
          img.style.left = (dx * 256) + 'px';
          img.style.top = (dy * 256) + 'px';
          var isCentre = (ox + dx === tx) && (oy + dy === ty);
          if (isCentre) centreImgs.push({ img: img, layer: layer });
          pending++;
          img.addEventListener('load', settle);
          img.addEventListener('error', function () { this.style.display = 'none'; settle(); });
          img.src = tileUrl(tpl, z, ox + dx, oy + dy);
          grid.appendChild(img);
        }
      }
    });

    function settle() {
      if (--pending > 0) return;
      if (!done) return;
      var any = centreImgs.some(function (c) {
        return c.img.style.display !== 'none' && c.img.naturalWidth && !isBlankTile(c.img);
      });
      done(any);
    }
  }

  function renderThumbs(r) {
    var wrap = $('p-thumbs');
    wrap.hidden = false;

    var oldBox = $('th-old-box');
    oldBox.dataset.z = String(THUMB_Z_OLD);
    oldBox.classList.remove('th-empty');
    /* 1924 五萬分一鋪底、1921 二萬五千分一疊上去：沒覆蓋的那層是全透明圖磚，
       會自動讓下面那層透出來，跟地圖的「舊地圖」層同一套設定。 */
    tileMosaic(oldBox, r.lat, r.lon, [TILE_OLD_A, TILE_OLD_B], function (any) {
      if (any) return;
      oldBox.textContent = '';
      oldBox.classList.add('th-empty');
      oldBox.appendChild(el('span', 'th-none', '此處無舊圖'));
    });

    var satBox = $('th-sat-box');
    satBox.dataset.z = String(THUMB_Z_SAT);
    satBox.classList.remove('th-empty');
    tileMosaic(satBox, r.lat, r.lon, [TILE_SAT], null);

    [oldBox, satBox].forEach(function (b) {
      if (b.querySelector('.th-pin')) return;
      b.appendChild(el('span', 'th-pin'));
    });
  }

  function renderPanel(r) {
    setText($('p-name'), r.name_zh);
    setText($('p-ja'), (hasText(r.name_ja) && r.name_ja !== r.name_zh) ? r.name_ja : '');
    setText($('p-alias'), (r.aliases && r.aliases.length)
      ? '亦稱：' + r.aliases.join('、') : '');

    renderThumbs(r);

    var dl = $('p-facts');
    dl.textContent = '';
    fact(dl, '縣市', r.county);
    fact(dl, '軍種', r.operator);
    fact(dl, '種類', r.kind);
    fact(dl, '啟用', r.opened);
    if (r.heading != null) headingRow(dl, r.heading);
    fact(dl, '跑道', r.runway_note);
    fact(dl, '現在是', hasText(r.today) ? r.today : '不詳', r.kindLabel);
    /* 遺跡與文化資產一定列出來：寫「無」也是資訊 */
    fact(dl, '遺跡', String(r.remains || '').trim() || '無', null, true);
    fact(dl, '文化資產', String(r.heritage || '').trim() || '無', null, true);

    setText($('p-history'), hasText(r.history) ? r.history : '');

    var conf = '';
    if (r.conf === 'landmark') conf = '位置：依今日地標';
    else if (r.conf === 'estimated') conf = '位置：鄉鎮估計';
    if (conf && hasText(r.coord_source)) conf += '（' + r.coord_source + '）';
    setText($('p-conf'), conf);

    /* 來源：不印網域全名、不加底線，只留短名（去掉 www），用全形「、」分隔 */
    var src = $('p-sources');
    src.textContent = '';
    var list = Array.isArray(r.sources) ? r.sources.filter(function (u) {
      return typeof u === 'string' && /^https?:\/\//.test(u);
    }) : [];
    if (list.length) {
      src.appendChild(el('span', 'p-src-label', '來源'));
      list.forEach(function (u, i) {
        if (i) src.appendChild(document.createTextNode('、'));
        var a = el('a', null, shortHost(u));
        a.href = u;
        a.target = '_blank';
        a.rel = 'noopener';
        src.appendChild(a);
      });
    }

    $('p-gmap').href = 'https://www.google.com/maps?q=' + r.lat + ',' + r.lon;
  }

  function shortHost(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; }
  }

  function open(r, fly) {
    current = r;
    renderPanel(r);
    markListCurrent();
    var p = $('panel');
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    if (map) map.invalidateSize({ animate: false });
    if (fly) {
      setBase('sat');
      map.flyTo([r.lat, r.lon], 14);
    }
    setHash(r.name_zh);
    void p.offsetWidth; /* 先讓 visibility 生效，焦點才進得去 */
    $('p-name').focus();
  }

  function close() {
    var prev = current;
    var fromPanel = $('panel').contains(document.activeElement);
    current = null;
    var p = $('panel');
    p.classList.remove('open');
    p.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
    if (map) map.invalidateSize({ animate: false });
    markListCurrent();
    setHash(null);
    /* 鍵盤操作時把焦點交回清單上那一列 */
    if (prev && fromPanel) {
      var rows = document.querySelectorAll('.row');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].dataset.name === prev.name_zh) { rows[i].focus(); break; }
      }
    }
  }

  function setHash(name) {
    hashLock = true;
    var base = location.pathname + location.search;
    if (name) history.replaceState(null, '', base + '#a=' + encodeURIComponent(name));
    else history.replaceState(null, '', base);
    setTimeout(function () { hashLock = false; }, 0);
  }

  function scrollMapToTop() {
    var mw = $('mapwrap');
    if (!mw || !mw.scrollIntoView) return;
    var go = function () { mw.scrollIntoView({ block: 'start' }); };
    go();
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(go);
    }
    window.addEventListener('load', go);
  }

  function openFromHash(initial) {
    if (hashLock) return;
    var m = /^#a=(.*)$/.exec(location.hash || '');
    if (!m) return;
    var name = '';
    try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; }
    var r = byName[name];
    if (!r) return;
    open(r, true);
    /* 用網址直接開某一座時，把地圖捲到視窗頂，不然一進來看到的是開場那段。
       字型晚一步載完會把開場那段撐高，捲動位置就跑掉了，所以字型就緒後再捲一次。 */
    if (initial === true) scrollMapToTop();
  }

  /* ---------- 側欄互動 ---------- */

  function wirePanel() {
    $('p-close').addEventListener('click', close);

    /* 點縮圖＝把主地圖切到那個圖層 */
    $('th-old').addEventListener('click', function () { setBase('old'); });
    $('th-sat').addEventListener('click', function () { setBase('sat'); });

    $('p-back').addEventListener('click', function () {
      close();
      setBase('osm');
      if (map && records.length) {
        map.flyToBounds(L.latLngBounds(records.map(function (r) { return [r.lat, r.lon]; })),
          { padding: [28, 28] });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('panel').classList.contains('open')) close();
    });

    /* 手機：抓住把手往下拖可關閉 */
    var grip = $('sheet-grip');
    var panel = $('panel');
    var startY = null;
    var moved = 0;

    grip.addEventListener('pointerdown', function (e) {
      startY = e.clientY;
      moved = 0;
      panel.style.transition = 'none';
      grip.setPointerCapture(e.pointerId);
    });

    grip.addEventListener('pointermove', function (e) {
      if (startY == null) return;
      moved = Math.max(0, e.clientY - startY);
      panel.style.transform = 'translateY(' + moved + 'px)';
    });

    function endDrag(e) {
      if (startY == null) return;
      startY = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (grip.hasPointerCapture && e && grip.hasPointerCapture(e.pointerId)) {
        grip.releasePointerCapture(e.pointerId);
      }
      if (moved > 60) close();
    }

    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);
  }

  wirePanel();
  boot();
})();
