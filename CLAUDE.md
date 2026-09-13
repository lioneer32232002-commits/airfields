# 舊飛行場 airfields — 維護說明

1945 年台灣與澎湖日軍飛行場的純靜態單頁地圖。網址 https://airfields.skyfaring.net。

## 零建置（硬性約束）

沒有 npm、沒有 bundler、沒有框架。Cloudflare Pages 的 build command 留空、輸出目錄 `/`。
檔案就是最終產物：

```
index.html
assets/style.css
assets/app.js
data/airfields.json    ← 平常只會改這個
data/taiwan.json       ← 縣界 GeoJSON，幾乎不會動
scripts/validate.mjs   ← node 內建即可跑
```

第三方只允許從 `cdn.jsdelivr.net` 載入 Leaflet 1.9.4（JS 與 CSS），字型走
`fonts.googleapis.com`（Noto Serif TC 700、Noto Sans TC 400/500）。不要新增其他外部相依，
也不要加分析程式碼——本站不追蹤使用者。

頁面上**所有**數字、地圖點、篩選選項、清單分組都在瀏覽器端從 `data/airfields.json` 算出來，
HTML 裡不得寫死任何統計數字。改資料就等於改網站。

**圖表也一樣**：開場的三張圖（「現在是什麼」水平長條、三列比例條、「誰的飛行場」100％
堆疊條）、地圖下緣的座標可信度圖例、篩選區的縣市直條圖，長度、比例、數字、有哪幾列，
統統是載入後現算的，`index.html` 只有空容器。排除 `duplicate_of` 的規則跟清單一致，
所以分母永遠是 78 而不是 81。軍種是從 `operator` 字串判斷：同時出現「陸軍」與「海軍」
算共用，只出現一個就算那一軍，都沒有算不詳——`operator` 是自由文字（「陸軍（戰時海軍
台南航空隊亦進駐）」也算共用），不要為了做圖表另外加欄位。

圖表的樣式規則（改圖表時要守）：一種數量只用一個色相（`--accent`），不用彩虹、不用多色；
數值與標籤一律用文字色，不塗成資料色；長條 8–10px、無圓角無陰影；堆疊條各段之間留 2px
底色縫，明度用透明度疊在底色上（下限 0.26，再低深色模式就看不見）；不做雙軸、不做圓餅；
每一段都要有 `title` 寫完整名稱與座數。段太窄放不下標籤時，`layoutSvcLabels()` 會把它收進
下面那行圖例——它是量出來的，不是寫死的門檻，換字型或改寬度不必回來改數字。

## 資料欄位

一筆飛行場長這樣：

```json
{"name_zh":"虎尾飛行場","name_ja":"虎尾飛行場","county":"雲林縣虎尾鎮","operator":"海軍",
 "kind":"主要基地","lat":23.72,"lon":120.43,"coord_confidence":"landmark",
 "coord_source":"依高鐵雲林站西側舊跑道痕跡","runway_heading":null,"opened":"1943",
 "today":"高鐵雲林站、虎尾科技大學一帶","today_kind":"station",
 "remains":"建國眷村保存部分營舍","heritage":"建國眷村（歷史建築）",
 "history":"海軍練習航空隊，1945 年特攻出擊基地之一。",
 "sources":["https://…"],"confidence":"medium"}
```

- `name_zh` 必須唯一，它同時是網址 hash（`#a=<name_zh>`）的鍵。改名等於換網址。
- `county` 寫到鄉鎮區（例：`台南市鹽水區`）。清單分組只看開頭的縣市，順序固定由北到南：
  基隆、台北、新北、桃園、新竹、苗栗、台中、彰化、南投、雲林、嘉義、台南、高雄、屏東、
  宜蘭、花蓮、台東、澎湖。`臺` 會自動當成 `台`。
- `today_kind` 只能是：`airport`、`airbase`、`science_park`、`industrial`、`farmland`、
  `school`、`residential`、`station`、`park`、`mixed`、`unknown`。
  **缺這個欄位時**，網頁會照 `today` 的字面推測（看到「空軍基地」算 `airbase`、看到「農地」算
  `farmland`、命中兩類以上算 `mixed`），推不出來就標「不明」。推測只是暫時的；查清楚就把
  `today_kind` 寫進 JSON，數字與篩選才算有根據。（2026-09 起 81 筆都已填好，字面推測只是後備。）
- `runway_heading` 只能是跑道方位角 `0–179` 的**數字**或 `null`，文字會被 validate 擋下（以前
  允許中文敘述，2026-09 已全部整理成數字或 null）。有值時網頁會在點位上畫一條 1.6 公里的
  方向線。
- `runway_note`（選填）放跑道配置的文字敘述，例如「V字形雙向跑道」、「多方向5條跑道」、
  「雙跑道（北跑道在鹿草庄，南跑道在義竹庄）」。側欄會多一行「跑道」。沒有實質資訊的
  （「不詳」、「不適用」、「單一跑道」）就不要放這個欄位，也不要放空字串。
- `duplicate_of`（選填）用在**史料把同一座寫成兩筆**的情況：值是主筆的 `name_zh`。有這個欄位的
  那一筆不上地圖、不進清單、不算進任何統計，只會在主筆側欄的日文名下面顯示「亦稱：…」，
  而 `#a=<它的名字>` 會導到主筆。必須指向另一筆存在的名稱，不能指向自己，也不能指向
  另一筆本身就是 `duplicate_of` 的（不准鏈狀），否則 validate 會擋。目前三組：金山＝金包里、
  水林＝北港西、鹿港東南＝彰化。所以頁面上的座數是 81 減 3 = 78。
- `remains`、`heritage` 沒有就寫 `無`。開頭是 無／不詳／未知／未見／沒有／不明 的字串，
  在「有遺跡」「列為文化資產」的統計裡都不算數。
- `confidence` 是**史料**可信度（`high`／`medium`／`low`），跟座標可信度是兩回事。
- 中文欄位的標點一律全形（，（）；：／？），validate 會擋半形。`sources` 陣列與值以
  `http` 開頭的字串（網址）不受此限。半形小數點（例如 `25.07`）、破折號、連字號、年份範圍
  （例如 `1936–1945`）也不算標點，不用改。

## 座標可信度（`coord_confidence`）

| 值 | 意思 | 畫面上 |
| --- | --- | --- |
| `confirmed` | 跑道或場區位置可直接對上 | 實心點，不加註 |
| `landmark` | 只確定到今日某個地標 | 實心點，小字「位置：依今日地標」 |
| `estimated` | 史料只到鄉鎮 | 虛線點加半徑 1.5 公里虛線圓，小字「位置：鄉鎮估計」 |

不是 `confirmed` 的就補一句 `coord_source` 說座標怎麼來的，側欄會接在可信度後面顯示。

## 怎麼補一座

1. 複製 `data/airfields.json` 裡任何一筆，改值。欄位順序不重要，`name_zh`、`county`、
   `operator`、`kind`、`lat`、`lon`、`coord_confidence`、`opened`、`today`、`remains`、
   `heritage`、`history`、`sources` 每筆都要有。
2. 取座標，按順序試：
   - **維基百科**：條目右上角的座標（例如「25°04′11″N 121°33′08″E」）點下去會展開十進位度數，
     取到小數第四位即可。這種通常算 `confirmed`。
   - **國家文化資產網**（https://nchdb.boch.gov.tw/）：搜遺構名稱，抄它的地址，丟給
     Nominatim 換座標：
     ```bash
     curl -s 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&q=<地址>'
     ```
     取回傳的 `lat`／`lon`。地址只到路段就算 `landmark`，只到鄉鎮就算 `estimated`。
     （Nominatim 只是查地址用的一次性工具，不要接進網頁。）
   - **中研院百年歷史地圖**（https://gis.sinica.edu.tw/）：疊舊圖找跑道輪廓，對照今日影像
     讀出中心點，這是最準的做法，也最花時間。
3. `node scripts/validate.mjs`，通過會印 `OK: N airfields`。提醒（WARN）不擋 CI，錯誤會。
4. 開 `python -m http.server 8771` 看一眼：點得開、側欄對、篩選有動。

CI（`.github/workflows/validate.yml`）在每次 push 與 PR 都跑同一支。

## 圖磚來源與出處規則

只准這三個來源，而且**每一個都必須在地圖右下角標明出處**。圖磚是瀏覽器直接向來源請求，
本站不代理、不快取、不轉存。

| 層 | 網址 | attribution |
| --- | --- | --- |
| 地圖 | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | © OpenStreetMap contributors |
| 衛星 | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Esri, Maxar, Earthstar Geographics |
| 舊地圖 | `https://gis.sinica.edu.tw/tileserver/file-exists.php?img=<LAYER>-jpg-{z}-{x}-{y}` | 中央研究院人社中心 GIS 專題中心 臺灣百年歷史地圖 |

要加第四個來源之前先想清楚授權；中研院的圖磚是學術資源，非經允許不得商業使用，所以這個站
不放廣告、不做付費牆。

側欄的「當年／今日」兩張縮圖用的是同樣這三個來源，做法是自己算 tile x／y（`tileXY()`），
用 2×2 張 256px 圖磚鋪一個 `overflow:hidden` 的方框、`transform: translate` 把該點推到正中央
（衛星 z15、舊圖 z14）。圖磚一樣由瀏覽器直接向來源請求，本站不代理。舊圖那格是 1924 鋪底、
1921 疊上去，沒覆蓋的那層是全透明圖磚會自動透出下面那層；兩層都沒有時 `isBlankTile()`
（把圖磚畫進 canvas 取樣 alpha，tileserver 有 `Access-Control-Allow-Origin: *`）會偵測到，
顯示「此處無舊圖」。縮圖的說明文字寫「1921／1924 地形圖」，不要只寫其中一年——同一座
看到的可能是任一層。

### 關於 1944 年美軍地圖

規格原本要疊 1944 年美軍地圖。實測（2026-09）中研院 tileserver 的 `USArmy1944`、
`JM50K_1944`、以及 `USA50K_1944`、`AMS50K_1944`、`JM25K_1945` 等十幾個猜測代碼，
在松山（z13 x6861 y3506）與台南（z13 x6831 y3559）兩處、z10–z17 全部回傳 **936 bytes 的
全透明 PNG**，也就是空白 placeholder：那個圖層在這台 tileserver 上沒有內容。

有內容的是日治地形圖：

- `JM25K_1921`（二萬五千分一，1921）——西部與**澎湖**有圖，花蓮沒有。
- `JM50K_1924`（五萬分一，1924）——本島含**花蓮**有圖，澎湖沒有。

所以「舊地圖」層是這兩層相疊（空白圖磚全透明，會自動讓下面那層透出來），預設關閉。
年代早於多數飛行場（1936–45 才陸續興建），只能看地貌，看不到跑道——頁面上的「怎麼看」
已經寫明，不要在文案上把它說成 1944 年圖。哪天找到真的有內容的 1940 年代圖層代碼，
換掉 `assets/app.js` 裡 `layers.old` 的兩個 URL、把按鈕改名即可。

## 視覺約束

- 配色與 logbook 同一套（淺底 `#f6f3ee`／深底 `#101210`），襯線只用在標題與數字。
- 不得有 emoji、驚嘆號、漸層、霓虹、玻璃擬態、陰影卡片、圓角小工具。
- Leaflet 的縮放鈕、tooltip、attribution 都已在 `style.css` 重新設樣式（細框、無圓角、
  無陰影、12px）。升級 Leaflet 版本後要回頭確認這些覆寫還在。
- 動效只有兩個：地圖 `flyTo`（Leaflet 內建 0.8 秒）、側欄開關 180ms。
- 固定正文（不含資料）控制在 220 字以內，手機 360px 到 1440px 不可出現水平捲軸。

## 部署

程式碼放 GitHub，Cloudflare Pages 走 **Git 連動**：合併進 `main` 就自動上線，手機上改 JSON
也算。**不要用 `wrangler pages deploy` 直接上傳**——直接上傳建立的專案事後接不回 Git，
只能另開專案。第一次部署要在 Cloudflare 儀表板選這個 repo、build command 留空、輸出目錄 `/`。
