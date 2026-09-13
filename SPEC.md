# 台灣的舊飛行場 — 建置規格（給執行者）

站點定位：1945 年日治結束時，台灣與澎湖有八十座左右的陸海軍飛行場（含特攻、秘密與偽裝機場）。
今天大多數變成了機場、軍事基地、科學園區、農田、學校、高鐵站。這個站把每一座放在地圖上，
一鍵切到「今日衛星影像」看它變成了什麼，能的話再疊上 1944 年美軍地圖看當年的跑道。
公開網址預計 https://airfields.skyfaring.net（Cloudflare Pages，Git 連動）。

## 硬性限制

1. **零建置**：`index.html`、`assets/style.css`、`assets/app.js`、`data/airfields.json`、`data/taiwan.json`。第三方只允許 cdn.jsdelivr.net 的 Leaflet 1.9.4（JS 與 CSS）；字型走 fonts.googleapis.com（Noto Serif TC 700、Noto Sans TC 400/500）。
2. **圖磚來源**只允許三個，都要在頁面上標明出處：
   - 今日衛星影像：Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`，attribution「Esri, Maxar, Earthstar Geographics」。
   - 底圖（找位置用）：OpenStreetMap 標準圖磚 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`，attribution「© OpenStreetMap contributors」。
   - 當年地圖：中研院「臺灣百年歷史地圖」圖磚伺服器，形式 `https://gis.sinica.edu.tw/tileserver/file-exists.php?img=<LAYER>-jpg-{z}-{x}-{y}`。執行者要先用真實的台灣座標（例如 z=13, 松山機場附近 x≈6861, y≈3450）測試哪個圖層代碼有內容：優先試 `USArmy1944`、`JM50K_1944`、`JM25K_1921`、`JM50K_1924`，挑一個 1940 年代的當「當年」層；每個圖層 attribution「中央研究院人社中心 GIS 專題中心 臺灣百年歷史地圖」。若全部都是空白圖磚，就把「當年」層做成可選但預設關閉，並在回報說明。
3. **繁體中文（台灣用語）**。不出現本名，只用 Adam Pan。固定正文 ≤ 220 字。
4. **不得有 AI 感**：禁止 emoji、漸層、霓虹、玻璃擬態、陰影卡片、圓角小工具、感嘆號。Leaflet 預設的縮放控制要改成細框單色；不用 Leaflet 預設的藍色 marker 圖片，點位用 `L.circleMarker`。
5. **資料驅動**：地圖點、清單、數字、篩選都從 `data/airfields.json` 算出。`coord_confidence` 要顯示：`confirmed` 不加註；`landmark` 加小字「位置：依今日地標」；`estimated` 加小字「位置：鄉鎮估計」，並且在衛星圖上用虛線圓（半徑 1.5 公里）而不是點，表示不確定。
6. 深淺色都要能看（跟隨系統；地圖圖磚本身不變色，只有介面）。手機優先，360px 到 1440px 不可水平捲軸。
7. 不追蹤使用者、不放分析程式碼。圖磚請求是瀏覽器直接向上述三個來源發出，本站不代理。

## 資料

`data/airfields.json`：陣列，每筆：
```json
{"name_zh":"虎尾飛行場","name_ja":"虎尾飛行場","county":"雲林縣","operator":"海軍","kind":"主要基地",
 "lat":23.72,"lon":120.43,"coord_confidence":"landmark","coord_source":"…","runway_heading":null,
 "opened":"1943","today":"高鐵雲林站、虎尾科技大學一帶","today_kind":"station","remains":"建國眷村保存部分營舍","heritage":"建國眷村（歷史建築）",
 "history":"海軍練習航空隊，1945 年特攻出擊基地之一。","sources":["https://…"],"confidence":"medium"}
```
- `today_kind` 值：airport、airbase、science_park、industrial、farmland、school、residential、station、park、mixed、unknown。中文標籤：機場、軍事基地、科學園區、工業區、農田、學校、住宅、車站、公園、混合、不明。
- `runway_heading` 為角度（0–179）的數字或 null，不接受文字敘述。
- `runway_note`（選填）：跑道配置的文字敘述（例如「V字形雙向跑道」），側欄多一行「跑道」。
- `duplicate_of`（選填）：史料把同一座寫成兩筆時，指向主筆的 `name_zh`。這一筆不上地圖、不進清單、
  不算進統計，只在主筆側欄顯示「亦稱：…」，`#a=<它的名字>` 導到主筆。
- `data/taiwan.json`：台灣縣市邊界 GeoJSON（已提供），只用來畫總覽底圖的縣界，不上圖磚時也能看。

## 頁面（單頁）

順序（就是 DOM 順序，也是手機由上到下的順序）：頁首 → 開場 → 地圖 → 篩選 → 清單 → 數字 → 怎麼看 → 頁尾。

**≥ 1100px 改成兩欄**：上列 2、4–8 全部進左欄（1100–1279px 寬 400px，≥1280px 寬 460px，可捲動），地圖固定在右欄（`sticky`，高 `calc(100vh - 頁首高)`），捲左欄時地圖不動；頁首全寬、也固定在上緣。側欄詳細面板覆蓋在地圖右側，不擠壓左欄。

1. **頁首**：左「Skyfaring」連 https://skyfaring.net，右「舊飛行場」。
2. **開場**：襯線一行：「1945 年，台灣有 N 座飛行場。」（數字用資料算）下一行小字：「現在它們是機場、基地、園區、農田、學校、車站。」
3. **總覽地圖**（兩欄版佔滿右欄一個視窗高，單欄版 60vh 全寬出血）：Leaflet，底圖 OSM（預設）／衛星／舊地圖（右上細框文字切換）。所有飛行場用 `circleMarker`（半徑 5，accent 色，estimated 用虛線圓）。點位 hover 顯示主名 tooltip；點擊 → 地圖飛到該點（zoom 14，衛星層自動開啟）並打開側欄。若 `runway_heading` 有值，在該點畫一條 1.6 公里長、依方位的細線代表跑道方向。座標可信度圖例：兩欄版貼在地圖內左下角，單欄版貼在地圖下緣。
4. **側欄／底部抽屜**（桌機右側 380px，手機由下方升起，可拖或點關閉）：主名（襯線，`name_zh` 括號前那一段，不斷行）、括號內補充／日文名／亦稱（小字，日文名同主名就不印）、當年與今日縮圖、縣市、軍種、種類、啟用年、方位羅盤、跑道、「現在是」一句話 + today_kind 標籤、遺跡、文化資產、歷史兩三行、位置可信度小字、來源連結（文字連結，新分頁）。下方兩個文字連結：「在 Google 地圖打開」（`https://www.google.com/maps?q=lat,lon`，開新分頁）、「回總覽」。
5. **篩選**（緊接在清單上方，兩者之間只有一條細線，沒有編號小標）：依 `today_kind` 的文字按鈕（含全部）、依縣市的直條圖（點一根＝選那個縣市）、縣市下拉（原生 `<select>`，細框）。篩選只影響地圖點與清單，不重載地圖。
6. **清單**：依縣市分組（由北到南：基隆、台北、新北、桃園、新竹、苗栗、台中、彰化、南投、雲林、嘉義、台南、高雄、屏東、宜蘭、花蓮、台東、澎湖），每筆一列：主名（前景色 17px）、括號內補充與軍種（次要色 15px）、「現在是」（次要色，最多兩行）、today_kind 標籤；點了等同點地圖，左欄捲動位置不變。
7. **數字**（小標只有「數字」）：三張圖表，兩欄版單欄堆疊——「現在是什麼」水平長條、「剩下什麼」三列比例條、「誰的飛行場」100％ 堆疊條，全部由資料現算。
8. **怎麼看**：三行小字：點一座，切到衛星，就看得到跑道變成了什麼；位置標「鄉鎮估計」的表示史料只到鄉鎮；「舊地圖」是 1921／1924 年地形圖，歡迎補充來源。
9. **頁尾**：「資料整理自中研院 GIS 專題中心、維基百科、國家文化資產網等公開資料；圖磚版權見地圖角落。」右側「Skyfaring」。

## 視覺

- 配色同 logbook（淺：底 `#f6f3ee`、字 `#1c1b19`、次要 `#6b6660`、線 `#dcd6cc`、accent `#1f4e79`；深：底 `#101210`、字 `#ebe7e0`、次要 `#9a948b`、線 `#2a2b28`、accent `#d9b98a`）。地圖上的點在衛星層改用 `#f2d27a`（黃）以免被綠地吃掉。
- Leaflet 的控制項、tooltip、attribution 全部重新設樣式：細框、無圓角、無陰影、字 12px。
- 動效只允許：地圖 flyTo（Leaflet 內建，0.8s）、側欄開關 180ms。

## 檔案

```
index.html
assets/style.css
assets/app.js
data/airfields.json      # 規劃者提供，之後會換成座標更精確的版本（同 schema）
data/taiwan.json         # 規劃者提供
scripts/validate.mjs     # node 內建：欄位齊全、today_kind 與 coord_confidence 值合法、座標在台灣範圍（lat 21–26.5, lon 118–122.5）、名稱唯一
.github/workflows/validate.yml
CLAUDE.md                # 繁中：零建置、資料欄位與可信度規則、怎麼補一座（含怎麼取座標）、圖磚來源與出處規則、部署方式
README.md                # 三行
.gitignore
```

## 驗收

- `node scripts/validate.mjs` 通過。
- 本機 `python -m http.server` 開啟，用瀏覽器面板確認：OSM 與衛星圖磚載入、1944 層測試結果、點擊飛到並開側欄、篩選與清單同步、hash `#a=<name_zh>` 可直接開某一座、無 console 錯誤、375px 無水平捲軸。
- 桌機與 375px 各截：總覽、點開一座（衛星層）、側欄。
- 固定正文 ≤ 220 字；無 emoji、驚嘆號、漸層、陰影、圓角。
