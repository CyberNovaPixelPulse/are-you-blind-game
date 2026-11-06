# Google 搜尋上線設定

目前正式網站：https://guess.necterelux.com/

1. 自訂網域 DNS 生效後，在部署平台將 `NEXT_PUBLIC_SITE_URL` 設為正式網站根網址並重新部署。不要填 localhost 或 Preview 網址。
2. 確認正式網站首頁、`/robots.txt`、`/sitemap.xml` 可以公開存取，沒有登入、部署保護或 `X-Robots-Tag: noindex`。
3. 在 https://search.google.com/search-console 加入正式網站。建議使用網域資源與 DNS TXT 驗證；若使用網址前置字元資源的 HTML 標記驗證，將 Google 提供的 content 值填入部署環境變數 `GOOGLE_SITE_VERIFICATION`，重新部署後驗證。
4. 在 Search Console 的「Sitemap」提交 `sitemap.xml`。
5. 用「網址審查」檢查正式首頁，測試即時網址並要求建立索引。之後查看「網頁索引」報告追蹤結果。

`guess.necterelux.com` 已在 Namecheap 設定 CNAME，並由 Vercel 透過 HTTPS 提供網站。網站 canonical、robots sitemap URL 與 sitemap 均使用 `https://guess.necterelux.com`。Vercel 專案目前沒有設定 `NEXT_PUBLIC_SITE_URL`，程式使用此自訂網域作為預設值。

個人題目頁與管理頁有 noindex；API 不供搜尋引擎爬取。公開遊戲頁各有自己的 canonical，挑戰與 PK 的查詢參數會合併到各自的主要網址。網站的語言切換目前使用瀏覽器設定，沒有獨立語言 URL，因此不宣告 hreflang。

Google 決定是否及何時收錄；提交 sitemap 和索引要求不能保證排名或立即出現在搜尋結果。

## 2026-10-13 上線紀錄

- SEO 與 Google HTML 驗證檔已部署到正式站。
- Vercel 部署：`dpl_7yK5athSaVKd1pfkVHQ8yRo1KAxm`，以正式版提交 `afbe1ef227283a65c363c3af2103c45fdd890db9` 加入 SEO 變更部署。
- 驗證檔：`public/google2544585effffe406.html`。Google Search Console 已通過 HTML 檔案擁有權驗證，未來部署必須保留此檔。
- Sitemap 已提交：`https://are-you-blind-game.vercel.app/sitemap.xml`，包含 7 個公開頁面。
- 本次使用 Vercel CLI 直接部署；SEO 原始碼與驗證檔仍保留於本機工作目錄，尚未提交或推送到 GitHub。後續以 GitHub 部署時須包含這些檔案，才能保留 SEO 與驗證設定。
- Google 已成功讀取 sitemap，狀態「成功」，探索到 7 個網頁。
- 首頁索引要求已成功提交，Google 顯示「已將網址加入優先檢索佇列」；提交當下首頁仍未正式編入索引。
- 提交證明：`docs/seo-proof/google-index-request.png`、`docs/seo-proof/google-sitemap-success.png`。

## 2026-10-15 自訂網域

- 專案已綁定 `necterelux.com`；`www.necterelux.com` 設為 308 轉址到根網域。
- 網域使用外部 nameservers，已設定根網域 A 記錄 `64.29.17.1`、`216.198.79.1` 和 `www` CNAME `b969799be2583d63.vercel-dns-017.com`；保留既有郵件轉寄 MX 與 SPF TXT 記錄。
- 2026-10-15 已確認權威 DNS、Google DNS 與 Cloudflare DNS 均回傳網站記錄，且 `https://necterelux.com` 可透過 HTTPS 回傳網站；`https://www.necterelux.com` 以 308 轉址到根網域。
- 下一次正式部署後，在 Google Search Console 新增並驗證 `https://necterelux.com/` 網址前置字元資源，再提交 `https://necterelux.com/sitemap.xml` 並對首頁使用網址審查要求建立索引。原本 `vercel.app` 網址前置字元資源不會自動涵蓋新網域。

## 2026-10-15 遊戲子網域

- 遊戲網站正式網址切換為 `https://guess.necterelux.com/`；Namecheap CNAME 指向 `b969799be2583d63.vercel-dns-017.com`，Vercel 已驗證並提供 HTTPS。
- `necterelux.com` 與 `www.necterelux.com` 已從遊戲 Vercel 專案解除；根網域的 A 記錄仍指向 Vercel，需在將根網域交給其他網站時按該網站的 DNS 指示更新。
- 2026-10-15 已部署新版 canonical、robots 與 sitemap；Search Console 自動以 HTML 驗證檔驗證 `https://guess.necterelux.com/`，`/sitemap.xml` 狀態「成功」，探索到 7 個網頁，首頁索引要求已送入優先檢索佇列。
- Search Console 仍顯示 1 項「不實網頁」安全性問題；待查明並修正後才能要求 Google 重新審查。Google 決定是否及何時收錄。
