# 部署紀錄

本專案屬於 easysun 的個人 side project，原始碼 repository 為 [easysun/subway](https://github.com/easysun/subway)。

## 目前部署安排

- Sites project：`appgprj_6ae9863eed148191bd52c0af5b9a5da0`。
- 已發佈的檢視網址：[開啟 Subway](https://subway-easysun.ataya-3840.chatgpt.site/)。此為目前 ChatGPT 工作區提供的 owner-private 部署；網址帶有該工作區名稱，並不是獨立個人 Cloudflare 帳戶的正式站。
- 目標自訂網域：`sub.ages.tw`。已向託管服務登記，目前狀態為 `pending`，SSL 為 `initializing`，尚未完成 DNS 驗證，不能視為已上線。
- GitHub 可公開不等於網站資料或網站存取公開；目前網站維持僅擁有者可存取。

2026-11-03 首次發佈成功。來源版本為 `fa19de69d80c04be90ee896cfaa4aecda921ce67`，部署 ID 為 `appgdep_6ae98bff5f648191864629806ccf1a95`。已透過正式服務確認 `DB` binding 與 `workspaces` 表存在；瀏覽器開啟正式網址可見 ChatGPT 登入保護頁。尚未使用真實登入完成遠端新增／重載的端對端驗證。

## 自訂網域

以下值由託管服務實際回傳，適用於目前這個私有檢視站。Cloudflare 的 `ages.tw` zone 可使用表中的相對名稱：

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| CNAME | `sub` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.sub` | `openai-site-verification=_8kDP25LD22gLa48EJmsOae80fgkrWAoKtTjLqPjbVU` |
| TXT | `_cf-custom-hostname.sub` | `9895db41-59aa-4c0c-be0c-341a1de4891a` |

完整 TXT 名稱分別為 `_openai-site-verification.sub.ages.tw`、`_cf-custom-hostname.sub.ages.tw`。網域登記 ID 為 `appgdom_6ae98c1663e8819189d570e2e5fbe6d3`。

目前工作階段沒有可操作該 Cloudflare DNS zone 的連線，因此沒有寫入 DNS。填入記錄後仍須刷新託管服務的網域驗證，直到網域與 SSL 皆為啟用狀態。綁定自訂網域不會自動把網站改為公開；登入與現有 audience 仍保留。

## 轉為獨立個人正式站

需要使用個人持有的部署／資料庫帳戶，替換目前的 Sites 身份 adapter，並以可驗證的 session 做身份與 owner 授權。不能將現有 Worker 直接公開後信任訪客傳入的 `oai-authenticated-*` HTTP 標頭。

目前沒有銀行或信用卡 API、付費帳務同步、外寄 email 或推播服務。應用程式使用的資料來自使用者手動輸入。
