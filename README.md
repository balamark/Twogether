# Twogether — 諮商延伸工具（Therapy Companion）

> 諮商室只有一小時，真正的關係發生在剩下的 167 個小時。
> Twogether 幫伴侶把心理師教的方法帶回每一天。**不取代諮商，而是延伸諮商。**

Twogether is a **Therapy Companion** for couples — it helps partners carry what a
therapist teaches back into everyday life: record what happened between sessions,
practise communication, and repair connection. It stands *beside* therapists
rather than competing with them (the AI demonstrates and organizes; diagnosis and
treatment stay with a licensed professional). Built on a cost-optimized
single-server architecture using Node.js + React.

See [`docs/UX_PLAYBOOK.md`](docs/UX_PLAYBOOK.md) for the binding product stances.

## 💛 我們怎麼幫你溝通：三個原則

Twogether 幫伴侶溝通的三個核心設計理念，貫穿整個 App（文案單一來源：
[`src/content/communicationPrinciples.ts`](src/content/communicationPrinciples.ts)）：

- **冰山 · 說出口的往往只是冰山一角**：明明在氣一件小事，真正在意的卻說不出口；對方也只聽到指責，沒聽到底下的需要。Twogether 幫你看見話語底下的情緒與需求，把「你都不在乎」翻成「我需要被重視」，讓對方聽到的是需要，不是攻擊。
- **模式 · 看見你們反覆卡住的那個循環**：一方一開口就像在攻擊，另一方立刻築起防禦，然後越吵越高。像中立的第三方，Twogether 幫你們認出反覆出現的循環（追問、退縮、追得更急、更加沉默），也點出理性包裝下的酸味，讓你們一起跳出來。
- **書寫 · 用寫的，把話說對**：說者無心、聽者有意；當下脫口而出的話常常詞不達意，反而造成本來沒有的傷害。先寫下來，AI 幫你把話整理成對方聽得進去的版本，改到滿意再送出。

## ⚡ TL;DR - Get Started in 3 Commands

```bash
cp .env.example .env          # Copy and edit with your credentials
npm install                   # Install all dependencies
npm run build && npm run dev:backend
```

Then visit: http://localhost:8080

## 🎯 What's New - Single Server Architecture

✅ **Combined Architecture**: Frontend + Backend in one Node.js instance  
✅ **Cost Optimization**: From expensive App Engine Flex → Free-tier App Engine Standard  
✅ **Simplified Deployment**: One command builds and deploys everything  
✅ **Faster Cold Starts**: Node.js starts much faster than Rust  
✅ **No CORS Issues**: Same origin for frontend and backend

## Features

Twogether is a **Therapy Companion** first — the therapy-extension features lead,
and the intimacy/roleplay features are the *connection* side of the same
relationship-health story (not hidden, just not the headline a therapist sees).

**諮商延伸 · 把方法帶回日常 (Therapy extension)**

- **好好說 (事件記錄)**: Log what happened between sessions so the next therapy hour starts on the real issue, not 30 minutes of recall
- **AI 諮商師 · 引導模式**: The AI *demonstrates* how a therapist might guide the two of you — turn-based practice cards (鏡映/換位/肯定), not a verdict
- **治療摘要 & 諮商摘要**: A structured note after each repaired conflict, plus a two-week 諮商摘要 to bring into a session
- **情緒翻譯 · 安全踩剎車**: Translate blame into the underlying need; auto de-escalate a thread when it heats up
- **婚姻檢查**: Each partner rates key dimensions, then reveal side-by-side with a neutral AI summary
- **心理諮商名錄**: Book a real, licensed counselor when a topic needs professional help
- **關係時間軸 · 統計分析**: Conflict patterns and trends over time

**日常連結 · 關係的另一面 (Everyday connection)**

- **親密記錄**: Log intimate moments with mood, duration, location, and photos
- **角色扮演**: Custom roleplay scripts and scenarios with predefined templates
- **親密邀請系統 & 替代選項**: Send/respond to intimacy requests; suggest alternatives when declined
- **我們的牆**: A shared wall for photos, videos and notes to each other
- **成就系統 & 金幣商店**: Badges for milestones and a virtual-currency reward system

**基礎 (Platform)**

- **配對系統**: Secure partner pairing with codes
- **通知系統**: Real-time notifications (in-app, Email, LINE)
- **隱私保護**: Secure authentication and data storage

## 📝 Changelog

User-facing feature changes, newest first. (Convention: every UI feature change
adds a fragment file in `changelog/`; CI compiles them into the block below —
see `CLAUDE.md`.)

<!-- changelog:begin (generated from changelog/*.md — edit those, not this) -->
### 2026-08-29
- **私人對話終於能好好用 AI 諮商師了**: 修正兩個讓「說開一件事」私人對話卡住的問題——一是你自己補充的留言、還有 AI 諮商師的建議之前都沒有顯示在對話串上，看起來像壞掉；二是「請 AI 諮商師加入」常常等一下就跳出「連線逾時」，其實是前端等太短就放棄了。現在留言會正常顯示，AI 諮商師（以及改寫、情緒檢測、引導、一起收尾的 AI）也有足夠時間回應，不會再誤報逾時。
- **回覆欄位會隨字變高**: 說開一件事、我們的牆、心情回應、情緒檢查的回覆框不再只有小小兩行，一打開就有更多空間，而且會隨著你寫的內容自動長高（手機上尤其明顯），不用再擠在兩行裡看不到自己寫了什麼。

### 2026-08-28
- **快速回應變成看得出來能按的按鈕**: 親密記錄下方的「愛你／意猶未盡／想再抱一次／很難忘」原本只是四個字，看起來像說明文字，很難發現可以點。現在改成有外框的按鈕，選中的那個會填成玫瑰色，一眼就知道你回應了哪一個。
- **點「對話」直接開「說開一件事」，上面一排就能切換**: 點「對話」不再多一層頁面，直接進到最常用的「說開一件事」。上方有一條可以左右滑的切換列，一鍵跳到情緒檢查、角色扮演、我們的牆或找專業諮商師；進到任何一個之後那排都還在，不用退回去重找。手機上就是一排字，不再是佔半個畫面的卡片。
- **我們的牆搬到「對話」**: 想留悄悄話、稱讚 TA，現在從「對話」進去；「我們」分頁專心留給月曆與記錄。
- **個人選單多了幾個快速入口**: 右上角的個人選單新增了角色扮演、我們的牆、找專業諮商師、愛情旅程，想從哪裡進去都行。
- **話題建議（治療話題建議）**: 每次整理事件時，AI 會主動列出 3 到 5 個下次諮商可以聊的話題，附上「為什麼建議」和幾個可以直接照著問的引導——就算最近很平靜，也一樣有話題可聊。可以標記「加入諮商」「先收藏」「不相關」，還能寫下自己想延伸聊的點；不想等 AI 整理，也有一個隨時可以直接挑選的話題庫。你們的專屬心理師也看得到這些建議與筆記。

### 2026-08-26
- **長文不再被縮成一小段**: 在「說開一件事」寫下一大段（400 字以上）時，除了原本中性的事件紀錄，AI 會另外整理一段「完整經過」，把你提到的每一件事、每一個例子都保留下來，只拿掉攻擊性的字眼。摘要負責讓對方一眼看懂，完整經過負責讓你們真的有東西可以談。
- **私人對話可以一個人繼續寫**: 存成私人的對話不用先公開就能繼續補充，也能直接找 AI 諮商師討論、用 AI 幫你改寫草稿。想清楚了再決定要不要讓另一半看到；在那之前，這些內容只有你看得到。

### 2026-08-25
- **全新四分頁：今天・對話・我們・成長**: 主導覽從六個分頁精簡成四個，更貼近「記錄關係 → AI 理解 → 一起溝通 → 看見成長」的節奏。「今天」是全新首頁，一次只給你們現在最需要知道的一件事；「對話」把說開一件事、接住情緒與檢查、角色扮演、心理諮商都收進同一個地方；「我們」是重新命名的記錄時光，新增月曆／時間軸切換，也能直接連到我們的牆和愛情旅程；「成長」則把統計數字、AI 觀察到的溝通模式和真實故事放在一起，回答「我們有沒有變好」。角色扮演、心理諮商、真實故事都還在，只是換了更順手的入口。
- **上傳進度圈圈**: 牆上貼文夾帶大張照片或影片時，送出後會顯示即時進度圈圈（0-100%），不再是按下去就卡住不知道傳了沒；點一下圈圈可以隨時取消上傳，草稿內容都會留著。

### 2026-08-24
- **情緒翻譯與 AI 諮商師：多一層把關，回應更貼你的心意**: 現在每一則情緒翻譯與 AI 諮商師的回應，在送到你眼前之前，會先由第二層 AI 幫忙檢查一次，特別盯著「你／我」有沒有搞混（例如一次貼了很多句「你…我…」時，把某一方的感受寫成了另一方的）、有沒有偏離你真正想說的、讀起來順不順。發現不對就會自動重寫一次再給你。另外每則 AI 回應下方多了 👍／👎，覺得不通順或不合理，一秒就能回饋，還能補一句哪裡怪，我們會把這些收集起來持續讓翻譯更準。

### 2026-08-20
- **情緒深潛更好打字、更精簡**: 修好在 iOS 上輸入中文會被打斷、只能一個字一個字打的問題；把「看見情緒」的前兩步合併成一步、情緒標籤也更精簡，流程更短；把「好好說話」裡那個大的入口卡片拿掉，改成在開啟情緒翻譯、真的感覺到「這好像不只是現在」時，才在對話裡輕輕提醒你可以深入看看。

### 2026-08-19
- **情緒深潛**: 新增一條引導旅程，陪你看看現在的衝突為什麼這麼痛：從當下的情緒，到熟悉的感受、過去的記憶，寫一封給過去的信、一封安撫自己的信，最後把想讓另一半懂的話，寫成一封不指責的信分享出去。過去的信永遠只留給你自己；每一步都能跳過，也能先暫停、之後再接著走。

### 2026-08-13
- **上傳容量放寬**: 牆上貼文與劇本封面的照片上限從 5MB 提高到 10MB、影片從 20MB 提高到 30MB，手機直出的照片和短片不用先壓縮就能上傳。

### 2026-08-10
- **親密記錄可以互相回應了**: 記錄不再只是清單上冷冰冰的一條。點一下「愛你」「意猶未盡」「想再抱一次」「很難忘」，就能回應另一半記下的那段時光，也可以留一句 80 字以內的短話。兩個人都能回應同一則記錄——那是你們共同的回憶，不是誰的單方面貼文。點下去畫面立刻更新，不用等連線來回。
- **回應會通知另一半**: 對方會在 App 內和 LINE 收到通知，點通知就直接跳到「記錄時光」。一個心意不該變成垃圾郵件，所以這類回應不寄 email。

### 2026-08-08
- **收尾時「幫我想一個」不再把你踢去付費頁**: 如果當天 AI 次數用完，會直接在原地提示「你仍然可以自己寫」，你正在打的約定不會不見；升級付費頁只有你自己想看時才會出現。
- **一起收尾更順了**: 取消收尾不再清掉 AI 幫你們整理的治療摘要；重新開啟討論後可以再收一次尾；寫好的約定可以隨時「改一下我的約定」；「先不寫，跳過這次」按了「再想一下」之後仍然點得開。
- **看得懂輪到誰**: 對話列表會標出「輪到你了」，篩選到空清單時也能一鍵看全部，不會卡住。
- **好好說話少一排按鈕**: 標題直接叫「說開一件事」和「接住情緒」，跟上面的分頁一致；開始對話變成標題旁的主要按鈕，手機上少一整排選項。分頁列改成固定在上方，滑到一半也能切回另一邊。
- **從「接住情緒」寫下感受**: 點「寫下我的情緒，讓對方接住」會直接打開撰寫畫面，不用自己再找一次「開始對話」。
- **對話一眼分得出誰在說話**: 兩個人、AI 諮商師、引導練習擠在同一條時間軸上，靠顏色分辨太吃力。現在改用位置：對方靠左、你靠右、諮商師置中（他不站在任何一方）。第一次進來會有一張小圖例說明，看過就不再出現。
- **引導練習有了自己的專注畫面**: 按下「開始引導」會進入全螢幕的練習模式，這一步要做什麼、輪到誰、進度與分數都在同一個畫面裡，不再和對話混在一起。隨時可以「回到對話」，練習不會中斷，時間軸上會留一條 🧭 標記讓你點回去。
- **情緒翻譯不再被誤認成 AI 的發言**: 翻譯結果改成掛在原句底下的註解樣式，和 AI 諮商師的回覆明顯區隔，牆上和「好好說話」裡的樣子也統一了。
- **工程師模式（深色）修好一批看不見的區塊**: 淡綠、淡玫瑰底的提示卡在深色模式下會變成淺底淺字，現在都補上了深色配色，並加了自動檢查避免再發生。
- **賺硬幣即時到帳**: 在「前戲靈感」點「已嘗試／組合技達成」時，硬幣現在會立刻入帳、通知也馬上跳出，不用再等連線來回。背後幫硬幣發放加了防重複機制，就算網路慢或逾時重送也只會發一次，不會多給也不會少給。

### 2026-08-07
- **一起收尾更順手**：修好了收尾畫面「幫我想一個」按下去沒反應的問題，現在會穩定給你幾個可以直接改的寫法；就算 AI 這次沒想到，也會清楚提示你可以再按一次或自己寫。
- **畫面更清爽**：拿掉收尾第一步裡的範例對照小卡，專注在寫下你願意做的那件小事。
- **按鈕更好認**：把偏淡、容易被誤會成「不能按」的按鈕，統一換成更鮮明的綠色，全 App 的主要按鈕一致。
- **牆上傳照片不再誤報「網路失敗」**: 在較慢的網路上傳照片／影片時，貼文其實已送出卻顯示連線失敗的問題已修正。上傳逾時會依檔案大小自動延長，若真的太慢，也會提示「內容可能已送出」並自動重新整理牆面，避免你重複發文。

### 2026-08-04
- **一起收尾**: 對話講完了，一鍵就能開始「一起收尾」。你們各自寫下「下次我願意做的一件小事」，也可以一起決定一件事；寫完再看到彼此的答案，AI 會留下一段小小的觀察。舊的「標記為解決」兩步流程改成一次到位，比較不擅長開口的一方也能寫出自己的答案，不會被對方帶著走。
- **未配對時多了一個常駐的配對提醒**: 以前配對邀請只會在登入時跳一次，按了「稍後再說」就再也不會出現。現在還沒配對的話，頁面上方會有一條溫和的提醒，說明配對後會多出什麼（日曆、親密紀錄與成就自動同步），旁邊直接放「邀請另一半」和「用配對碼配對」兩個按鈕。可以按 ✕ 暫時關掉，七天後才會再出現。
- **看得到邀請寄出後的狀態**: 已經寄出邀請時，提醒會改成顯示寄給了誰、連結還剩幾天到期，並提供「重新寄送」與「傳連結給 TA」（複製或用 LINE 傳）。連結快到期時就算先前關掉過也會再提醒你一次，不會讓邀請默默失效。
- **官方客服信箱**: 客服聯絡方式統一為 support@twogether.fun，付款與退費問題有正式管道可以找到人。「使用說明」與「意見回饋」也直接看得到客服信箱，不用再翻到方案頁才找得到。
- **牆上看得到「TA 已讀」**: 你貼的文，另一半真的滑到、看過之後才會標成已讀，不用再對著沉默猜是被忽略還是還沒打開。
- **一鍵心意回應**: 不知道怎麼回的時候，點一下「抱抱」「我懂」「謝謝你說」「晚點好好回你」，對方就知道你接住了。已讀不再是句點。

### 2026-08-03
- **手機上點哪裡就中哪裡**: 之前在手機上打開編輯視窗後，按鈕常常「按了沒反應」或按到旁邊那顆。現在點擊位置回到該有的地方，全站的視窗都適用。
- **「新增照片／影片」修好了**: 牆上編輯貼文時這顆按鈕點下去沒有任何反應，現在正常開啟相簿。
- **按鈕變好按，也不容易誤觸**: 心情標籤、關閉、移除照片等小按鈕都放大到手指好按的尺寸；貼文上的「編輯」和「刪除」不再緊貼在一起，中間加了分隔，不會想按編輯卻刪掉貼文。
- **不可逆的動作會先問一聲**: 標記事件為已解決、把私密貼文分享給對方、刪除週期紀錄與評分，現在都會先確認再執行。
- **照片超過數量時會說清楚**: 一次選太多張時，不再默默丟掉多的那幾張，而是告訴你加入了幾個、哪幾個沒加進來。
- **配對邀請不再石沉大海**: 邀請信改由 Twogether 自己的網域寄出（不再借用個人 Gmail 信箱），並補上 SPF／DKIM／DMARC 與一鍵退訂標頭，大幅降低被丟進垃圾郵件的機率。信件內容也重寫成一封簡短的個人邀請，回信會直接回到邀請人手上。
- **寄出邀請後可以直接傳連結**: 送出邀請後會顯示配對連結，一鍵複製或直接用 LINE 傳給另一半 — 不用再乾等信件送達，也不必請對方翻垃圾信箱。
- **通知信可以一鍵退訂**: 伴侶動態通知信新增退訂連結，點一下就停止，不必先登入。帳號驗證、重設密碼、購買收據等重要信件仍會照常寄出。

### 2026-08-02
- **情緒翻譯**: 修正長篇留言的對話開啟情緒翻譯後整片空白的問題，現在能完整翻譯完。萬一沒翻完也會直接說明並提供「重試」，而且不會白扣今日 AI 額度。
- **AI 改寫**: 草稿太長時不再回傳空白版本，會明確告訴你需要縮短草稿或分成兩則。
- **留言輸入**: 補上字數計數器，超過 2000 字會直接告訴你還要刪幾個字，不再只顯示「送出失敗」。
- **我們的牆・範本更好用**: 新增 5 則一眼就看得完的短範本（謝謝你今天…、我需要一點空間、今天想被抱抱、想念你的一個瞬間、有一件小事想拜託你），空的牆上一次看到 3 則，挑一則就能改成自己的話。
- **「從範本開始」不再每次都佔位**: 用過一次範本、發過一則貼文，或按下「我自己寫就好，下次別自動展開」之後，這區塊下次開啟就收成一行，寫字的地方直接在最上面；想看範本時再點開就好。

### 2026-07-29
- **工程師模式看得清楚了**: 修好深色模式下部分區塊「淺底配淺字」看不見的問題——通知中心的未讀通知、成功／錯誤／警告提示、衝突提醒橫幅等，現在都是深色底配亮色字，未讀通知也還是看得出來是未讀。
- **照片防隨手下載**: 牆上與全站的照片、影片現在擋掉右鍵另存與拖曳下載，手機長按也不會跳出儲存選單，影片播放器也拿掉了下載鈕。第一次被擋時會告訴你為什麼。這是讓照片不被「順手存走」的一層防護，不是加密——真的想抓還是抓得到，所以請一樣只跟信任的人分享。
- **牆支援 Markdown**：貼文、回覆與 AI 留言現在會渲染 Markdown（粗體、標題、清單、引用、連結、程式碼…），排版更清楚。同時放寬字數上限——內文從 2,000 提高到 6,000 字、回覆從 1,000 提高到 3,000 字，長篇分享不再被截斷。

### 2026-07-27
- **防止重複送出、反饋更即時**: 所有送出／建立按鈕（做親密紀錄、金幣兌換、發布貼文、發送邀請等）按下後會立刻顯示「處理中…」並鎖住，手殘連點也不會再送出兩次、產生重複紀錄；成功通知也從右上角移到畫面上方置中，更容易看見。

### 2026-07-26
- **工程師模式（Premium 彩蛋）**: 在「設定」新增一個 Premium 限定開關，一鍵把整個 App 切換成工程師的深色終端機介面，所有詞彙改用 on-call 事故處理黑話——吵架變「開 Incident」、和好變「Postmortem」、傳親密邀請變「開 Merge Request」。純好玩、隨時可關，偏好記在本機。

### 2026-07-25
- **三個溝通原則，貫穿整個 App**: 我們把幫你們溝通的三個核心設計理念寫清楚了：冰山（說出口的往往只是冰山一角，底下才是真正的情緒與需求）、模式（看見你們反覆卡住的那個循環）、書寫（用寫的，把話說對）。未登入首頁、使用說明都會介紹，你在還沒開始前就知道 Twogether 怎麼幫你們。
- **新功能・你們的溝通模式**: 在「說開一件事」的分析頁，Twogether 會像看過你們吵過幾次架的中立第三方，讀過最近幾件已說開的事，幫你們認出反覆出現的循環（例如：追問、退縮、追得更急、更加沉默），溫和點出理性話語底下偶爾的酸味，並給一個一起跳出循環的小練習。看見它，才有機會不再重複它。

### 2026-07-24
- **一眼看出誰在說話**：多人對話（公開問答、衝突對話、諮商室、牆）現在每位參與者的名字旁邊，都會多一顆專屬顏色的頭像圓圈。真人顯示名字的第一個字、AI 諮商師顯示自己的 emoji，同一個人到哪都是同一個顏色，不用再回頭猜這句話是誰講的。

### 2026-07-20
- **專屬心理師**: 可從心理師名錄指定一位諮商師成為你們的專屬心理師，讓他唯讀檢視你們的「牆」與「好好說話」內容（不含私密項目），更了解你們的關係脈絡；也可選擇是否開放他留言，並隨時解除。
- **Premium 到期提前提醒**: Premium 快到期時（7 天內），會在頁面上方主動出現溫和提醒，告訴你到期日、到期後會發生什麼（AI 每日次數會回到免費上限），並提供「立即續購」一鍵延續。使用者選單也會常駐顯示 Premium 到期日，不用進到升級頁才看得到。續購後提醒會自動消失，不再重複打擾。
- **諮商摘要多了「歷史紀錄」，舊摘要隨時點開、不重複扣 AI 次數**: 以前每次整理諮商摘要都要重新產生一份；現在「諮商摘要」卡片新增「歷史紀錄」，把你們之前選過的期間（最近兩週／最近 30 天）整理過的摘要都保存下來，依日期排列。想回顧上次帶去諮商的那份摘要，直接點開就看得到——不會重新產生、也不扣 AI 次數，還能一樣「複製給心理師」。少花 token、少等待，過去的整理成果不再一次性用完就消失。

### 2026-07-19
- **通知中心：知道另一半做了什麼**: 現在另一半的每個重要操作都會出現在你的通知中心——新增/更新愛的記錄、建立劇本、送出客製禮物、記錄週期、更新關係評估與愛的願望、發起或回覆婚姻健檢、調整共同設定與個人資料。點一下通知就能直接跳到對應的頁面，也可透過 LINE 與 Email 收到提醒（依你的通知設定）。讓彼此的每個用心，都不會被錯過。

### 2026-07-18
- **可編輯親密紀錄的時長**: 記錄／編輯親密時光時，新增「時長」欄位與快速選項（15-30分鐘、30-60分鐘、1小時以上），角色扮演帶入的預設時長現在也能自由修改。
- **精簡劇本卡片操作**: 移除角色扮演劇本卡片上的紅色「開始」按鈕，改由「查看」進入劇本後再選擇「開始扮演 — 記入今晚」，避免誤觸直接記錄。

### 2026-07-16
- **「真實故事」升級為「好文 · 故事」，還能分享好文章**: 把原本藏在「好好說話」裡的長文〈翻譯彼此的語言〉搬進「真實故事」，和智慧故事合併成「好文 · 故事」一個地方。現在除了看伴侶們的真實故事，還能分享你讀到的好文章（純文字貼上、附上出處即可），用「全部／好文／故事」隨手切換，一起讀、一起變得更好。
- **新定位：Twogether 是心理諮商的延伸工具，不是取代**: 全站訊息更新——「諮商室只有一小時，真正的關係發生在剩下的 167 個小時」。Twogether 幫伴侶把心理師教的方法帶回每一天。登入前的介紹頁、「心理諮商」分頁、認識 AI 諮商師的畫面，都清楚說明：AI 是日常練習的陪伴，示範心理師可能會怎麼引導雙方思考，而真正的診斷與治療仍由合格的心理師負責。我們和心理師站在同一陣線，而不是競爭。
- **諮商摘要：把最近兩週，一鍵整理成帶去諮商的摘要**: 「心理諮商」分頁新增「諮商摘要」。選「最近兩週」或「最近 30 天」，AI 會把你們這段期間記錄的事件整理成一份摘要——最常出現的衝突主題、雙方最常感受到的情緒、已經成功修復的事件、還沒解決的事件，以及三個想帶去和心理師討論的問題。進諮商室時不用再花 30 分鐘回想發生了什麼，心理師可以更快進入真正有價值的討論。摘要兩人共享、只會產生一次（事件有變動才會重新整理，不重複扣 AI 次數），還能一鍵「複製給心理師」。這是 Twogether 作為「諮商延伸工具」的核心：諮商室只有一小時，我們幫你們用好剩下的 167 個小時。
- **牆上貼文可設為私密**：每則貼文都能一鍵切換「只有我看得到」，對方看不到也不會收到通知；分享給對方的貼文仍可照常「匿名公開」。
- **照片自動依方向顯示**：直式、橫式照片都會用合適的比例呈現，不再左右一大片留白，也不會裁切。
- **自訂心情標籤**：除了預設標籤，現在可以自己輸入心情，常用的自訂標籤下次還會記得，一鍵再選。

### 2026-07-15
- **私人對話可以分享給伴侶**: 原本只有自己看得到的私人對話，現在能一鍵「讓伴侶也看得到」，一起討論這件事；分享成為共同對話後，也能像其他對話一樣選擇匿名公開到「公開問答」幫助其他伴侶。
- **我們的牆支援照片與影片**：現在貼文除了文字，也能一次上傳最多 4 張照片或影片，甚至可以只發照片/影片不寫字，把約會與日常的畫面一起留在你們的牆上。

### 2026-07-13
- **通知語氣更溫柔：從「事件」到「情境」**: 通知文字全面調整——「伴侶開啟了一個事件」改為
  「伴侶分享了一個情境」、「事件已解決」改為「你們一起走過了這個情境」、「希望標記為已解決」
  改為「覺得可以一起劃下句點了」。通知是邀請彼此理解，不是誰被指控的訊號；Email、App 內
  與 LINE 推播同步更新。
- **記錄時光改版**: 登入後的第一頁更好上手了。月曆移到最上方成為主角，點任一天就能新增或查看紀錄，另加一顆「＋ 記錄今天」快捷鈕，一鍵記下今天。
- **畫面更清爽**: 「健康參考（建議每週幾次）」收進標題旁的 (?) 提示，需要時再看；「關係之屋」平時收合成一行，有待辦訊號或久未登入時才自動展開，也能隨手關閉。

### 2026-07-12
- **修正：親密天數兩處數字不一致**: 「關係之屋」顯示的「已經 N 天沒有親密了」與「記錄時光」
  下方的統計卡片，之前會差一天（一個算實際滿 24 小時、一個算跨過幾個日期）。現在兩處都以
  你們的時區、用「跨過幾個日期」計算，數字一致了。
- **修正：情緒翻譯打開後沒有出現、圈圈一直轉**: 之前 AI 產生翻譯後，因為訊息編號對不上而被
  整批丟掉，導致翻譯沒存進快取、每次打開都重新產生（很慢）也看不到結果。已改用穩定的編號對應，
  翻譯會正確顯示並快取，第二次打開就很快。也加了前後端記錄方便日後追查。
- **修正：角色扮演劇本封面影片無法播放**: 劇本封面的影片因網頁安全政策（CSP 未設定 media-src）
  被瀏覽器擋下。已允許影片來源，封面影片正常播放。
- **真實故事新增「大家怎麼做」投票**: 一系列關係情境投票（例如「吵架後誰該先低頭？」
  「另一半已讀不回，你會？」），選一個你的答案、立刻看見大家的選擇分布，還能留下你的
  「心聲」說說為什麼這樣選。沒有標準答案，只有真實的聲音；未登入可以看，登入後就能投票、
  留言，還沒配對也能參與。心聲一樣可以檢舉、由管理員審核。
- **不再叫「事件」，改叫「對話」**: 好好說話裡的每個畫面（按鈕、分析、通知、常見問答）現在一致用「對話」而不是「事件」，少一點像在寫事故報告，多一點像在好好聊。
- **LINE 通知整合**: 伴侶的重要通知（在事件中回覆、親密邀請、牆上留言、關係提醒等）現在可以
  同步推播到你的 LINE。到「設定 → LINE 通知」點「綁定 LINE 通知」，加官方帳號為好友後把綁定碼
  傳給它就完成綁定；之後可隨時用開關暫停，或解除綁定。與 Email 通知相同的那組重要通知，
  現在多了一個更即時的管道。

### 2026-07-11
- **送出前，先看看這句話會怎麼被聽見**: 事件回覆框新增「情緒檢測」。送出一句話之前，AI 會即時
  分析這句草稿：底層的情緒和強度（例如 傷心 70%、焦慮 80%）、對方可能「誤聽」成什麼 vs 其實
  想說的是什麼、你真正的需求，還會給一句「試著這樣說」的版本，一鍵就能採用。另外，當你打的
  草稿帶有指責或很衝的語氣時，回覆框下方也會即時、免費地輕輕提醒你先檢查一下。同一句草稿的
  檢測結果會被記住，不會重複扣 AI 次數。
- **情緒翻譯：把每句指責翻成需求**: 事件對話與「我們的牆」的對話串上多了一顆「情緒翻譯」
  開關。打開後，AI 會在每一句話下方顯示「可能真正想表達的是⋯」，把攻擊或抱怨翻成底層的
  情緒與需求（例如「你根本沒有把家庭放第一」→「我最近很沒有安全感，希望家庭能被放在更
  重要的位置」）。兩個人都看得到，讓對話從「爭立場」轉向「聽見彼此的需要」。翻譯會被記住，
  不會每次都重算。
- **AI 諮商師不再把你們推走**: 修正了 AI 諮商師在衝突中反過來叫你們「去找別的諮商師」的
  問題。它現在會當下就承接、翻譯彼此的情緒與需求並協助修復；只有在偵測到安全風險（例如
  暴力、自傷）時，才會引導尋求專業或緊急協助。
- **對話升溫時，AI 會先幫你們踩剎車**: 事件對話與「我們的牆」的對話串現在會自動偵測氣氛。
  當對話開始互相指責、有一方情緒滿出來、或說出很傷人的話時，上方會出現一則溫柔的提醒（例如
  「我注意到你們現在比較像是在保護自己，而不是理解彼此。要不要先暫停十分鐘？」），幫你們在
  說出會後悔的話之前先降溫。這不是要阻止你們，而是把注意力拉回照顧彼此；提醒可隨時關閉，
  也不會一直跳出來。
- **分享連結有預覽卡片了**: 把 Twogether（首頁、付費方案、成為諮商師）貼到 LINE、
  Facebook 或 Threads，現在會顯示品牌預覽圖與說明文字，不再是一條光禿禿的網址。
- **全新品牌 icon**: 瀏覽器分頁與 iOS 加入主畫面的圖示換成 Twogether 的雙環標誌
  （玫瑰色與鼠尾草綠漸層），取代原本的開發工具預設圖示。
- **引導模式：AI 不再只給建議，而是帶你們「做練習」**: 事件對話新增「開始引導」。AI 諮商師會
  像真的伴侶諮商師一樣，帶你們一步一步做練習，而不是丟一大段道理。它一次只出一張「練習卡」
  （🪞 鏡映、🔄 換位、🫶 肯定、🎯 情緒標記、💬 需求翻譯…），指定由誰先做、給一個可以直接照著
  說的句子開頭（例如「我聽到你說的是…」），等你完成後溫柔評分（✅ 做到了／🟡 差一點／
  ❌ 再試一次），再換下一步。上方「今日練習」會記錄你們練過哪些技巧，還有一個「關係技巧分數」，
  讓每次吵完都變成一次一起變好的練習。原本的「請 AI 諮商師加入」建議功能仍然保留。
- **吵完之後，AI 幫你們寫「治療摘要」**: 把一件事標記為解決後，事件頁多了一份 AI 產生的
  「治療摘要」——不是流水帳，而是幫你們看懂這次到底發生了什麼：最大的觸發點、雙方各自「真正
  的需求」、你們落入的負向循環（一方追、一方逃⋯）、這次修復成功的地方，以及「下次相同情況
  可以先說的一句話」。兩個人看到的是同一份，只會產生一次；重新開啟討論會重新整理。

### 2026-07-09
- **真實故事：一次寫完，AI 幫你分段**: 不想照 6 步模板慢慢填？現在可以選「一次寫完，
  AI 幫你分段」，把整個故事一次打完或貼上，AI 會幫你分成 6 段，你再確認、修改就能發表。
  「跟著步驟寫」的引導模式也保留。
- **「修復智慧」改叫「AI 重點整理」**: 發表後 AI 幫你抓出的重點換了更好懂的名字，
  一看就知道是 AI 幫你整理故事的重點。

### 2026-07-08
- **全新主分頁「真實故事」：智慧故事庫上線**: 把你們最難的時刻，變成幫助其他伴侶的智慧。
  依 6 段引導模板（背景→發生了什麼→情緒衝擊→試過什麼→轉捩點與修復→現在的我們）寫下
  真實經歷，預設匿名發表（依「設定」的公開分享選項），還沒配對的單人用戶也能發表。
  發表後 AI 立刻整理出重點附在故事頁；所有訪客（含未登入）都能瀏覽與搜尋，登入後可投三種票
  （有幫助／有共鳴／修復有效）、留言鼓勵作者。
- **本週精選與影響力統計**: 最近 7 天最被肯定的故事會釘選在「本週精選」；「我的故事」
  會告訴你「你的故事已被閱讀 X 次、獲得 Y 個投票」。新增三枚社群徽章：說故事的人 📖、
  智慧守護者 🏛️、修復領航員 🧭。
- **公開問答搬新家**: 原本藏在「心理諮商」裡的公開問答移到「真實故事」分頁；
  心理諮商分頁回歸純諮商師名錄與預約。
- **安心機制**: 故事與留言可一鍵檢舉，AI 會在發表時自動標記激烈用語供管理員覆核；
  被隱藏的內容立即從前台消失。

### 2026-07-07
- **「好好說話」：兩個分頁合而為一**: 「和諧相處」與「衝突事件」合併成一個正向命名的
  主分頁「好好說話」，內部分「說開一件事」（原衝突事件）與「接住情緒・檢查」（原和諧相處）
  兩個子分頁。少一個要猜的分頁名，吵架當下、平常保養都在同一個地方。
- **AI 次數看得見**: 會用到 AI 的地方（整理事件、AI 重寫、接住建議、請諮商師）現在會顯示
  「今日 AI 次數還剩 N 次」；用完時不是灰掉的死按鈕，而是清楚告訴你明天會補上、
  升級 Premium 可提高上限。
- **第一次成功後帶你走下一步**: 第一次送出事件會提示「等待回覆時可以先試試接住TA的情緒」；
  第一筆記錄完成後，未配對會提醒配對共享、已配對會推薦到牆上留句話。只提示一次，不囉嗦。
- **新手上路：開始三步驟**: 「記錄時光」最上方新增一張新手卡片，列出三個開始步驟
  （選 AI 諮商師、邀請另一半、記下第一筆），完成自動打勾、全部完成自動消失，
  再也不會註冊完不知道要做什麼。
- **還沒配對也有事可做**: 「衝突事件」不再只擋一句「請先配對」，改為說明這功能配對後
  能為你們做什麼、一鍵邀請另一半，以及配對前就能先做的事（愛的語言測驗、逛公開問答、
  瀏覽劇本）。
- **使用說明上線**: 個人選單新增「使用說明」，每個分頁在做什麼、常見問題一次看懂；
  「和諧相處」「衝突事件」「我們的牆」標題旁也有 (?) 小提示，點了馬上懂。
- **空白頁會帶路了**: 事件列表、月曆記錄、親密邀請的空狀態改為「這功能對感情的價值＋
  一鍵開始」的引導，不再只有一句「還沒有資料」。
- **AI 回覆不再用破折號**: 所有 AI 產生的文字（事件整理、諮商師留言、接住建議⋯）改用
  冒號與括號，更貼近中文的閱讀習慣。
- **事件簡介送出前就能改**: 建立事件時，版本選擇頁上的「事件簡介」現在可以直接點鉛筆編輯，
  改到滿意再送出，不用等事件建立完才能修改；改過會標示「已編輯」。
- **AI 不再叫錯性別**: 產生事件簡介、AI 重寫與接住情緒建議時，會把你和伴侶在「設定」選的
  性別一併告訴 AI——男性用「他」、女性用「她」，不再把男生寫成「她」。
- **中性版改用你自己的口吻**: 送給對方的中性開場訊息不再是第三人稱旁白（「這件事讓她感到⋯」），
  改成像你親口說的話（「這件事讓我感到⋯」）——旁白式的紀錄只保留在事件簡介，之後回看對話
  不會再覺得奇怪。
- **AI 建議不再重複扣次數**: 「如何接住TA的情緒」和「請 AI 諮商師加入」的建議會先存起來——
  對話沒有新訊息時再按一次，直接拿回同一份建議，不重新產生、不扣每日 AI 次數。
- **送出的開場白可以換版本**: 當時 AI 產生的三個版本（中性／堅定／善意）都有保存，
  事後編輯你的開場訊息時可以一鍵改用其他版本。
- **對話卡片標示是誰說的**: 事件對話串的每則訊息現在會顯示發話者的暱稱，一眼看清楚
  是誰對誰說；「請 AI 諮商師加入」按鈕也移到對話串下方（回覆框外）——它讀的是你們的
  對話歷史，不是你正在打的字。

### 2026-07-06
- **歷史事件卡片改版**: 事件歷史列表的卡片改為白色卡面＋柔和陰影，在米色背景上清楚浮起，
  不再與頁面底色融成一片；卡片間距與卡片內部留白統一，沒有摘要或標籤的卡片也不會再出現
  多餘的空白，整份列表看起來更整齊、更好掃讀。
- **選擇你的 AI 諮商師**: 全新的個人化功能——9 位個性不同的 AI 諮商師（Sophie 溫柔傾聽、
  Kai 務實教練、Luma 沉穩陪伴⋯）任你挑選。註冊後會先認識你的 AI 諮商師（推薦 Luma），
  之後在「設定」隨時更換；事件討論與牆上的邀請按鈕、AI 留言都會顯示 TA 的名字（例如
  「Luma・AI 諮商師」），Email 通知也是。每位諮商師的回覆風格不同，但都守住同樣的原則：
  不選邊站、先理解再解決。更換只影響之後的回覆，過去的對話保留原本的署名。
- **按鈕更清楚可點**: 事件討論串的「請 AI 諮商師加入」「如何接住TA的情緒」「讓 AI 重寫」
  「標記為解決」與牆上的「請 AI 諮商師看看」從淡色外框改為實色按鈕——之前看起來像不能按的
  灰色狀態，現在一眼就知道可以點；還沒輸入文字時「讓 AI 重寫」「送出」會明顯變淡，可點與
  不可點終於分得出來。
- **事件通知 Email 帶上實際內容**: 事件更新的 Email 不再只有事件標題——伴侶的回覆、AI 諮商師
  的留言、開啟事件時想說的話，現在都會直接顯示在信裡，不用登入就能先看到對方（或 AI）說了什麼。
  AI 諮商師留言與重新開啟事件也有了專屬的信件標題（🧑‍⚕️／🔄），不再顯示籠統的「事件更新」。
- **事件簡介顯示在版本選擇頁最上方**: 讓 AI 整理完情緒後，選擇回覆版本的畫面現在會先顯示
  「事件簡介」——一段雙方都會看到的中性事件紀錄——再列出三個回覆版本，讓你先確認 AI 理解的
  事件經過，再決定怎麼開口。
- **中性旁白版不再與簡介重複**: 重新設計 AI 的分工——事件簡介只寫「發生了什麼事」（客觀事實、
  零情緒字眼），第三方中性旁白版則是「要傳給對方的開場訊息」（事件＋你的感受＋一句訊息收尾），
  兩者不再像雙胞胎。
- **送出前可以修改 AI 寫的訊息**: 選好版本後，下方會出現「送出前可以修改這段訊息」編輯框，
  改到滿意再送出；每個版本的修改各自保留，切換版本不會弄丟。改過的版本會標示「已編輯」。
- **送出後也能編輯**: 事件頁新增編輯功能——發起人可修改事件標題與簡介，雙方都可修改自己
  送出的訊息（點訊息旁的鉛筆）；修改過的內容會顯示「已編輯」讓對方知道，AI 諮商師留言與
  已解決的事件則不可修改。

### 2026-07-04
- **親密邀請帶上劇本資訊**: 由劇本發出的入戲邀請，現在會清楚標示是哪一部劇本——收邀請的一方
  在「親密邀請紀錄」列表與詳情中都會看到 🎭 劇本名稱與情境簡介，並可一鍵「查看劇本內容」直接
  跳到該劇本；Email 通知同樣附上劇本名稱、簡介與快速連結，另一半不再看到一句入戲台詞卻摸不著
  頭緒。
- **頁尾顯示版本資訊**: 網頁最下方新增一行版本列——版本號、環境、建置時間與 commit hash
  （例如 `v1.0.0 | production | 2026/7/4 上午10:19:51 | 5da817b`），每次部署自動更新，
  回報問題時附上這行即可精準對應到程式版本。
- **修正：AI 入戲邀請的視角跟著你的性別走**: 男性用戶產生的劇本邀請訊息，先前可能以劇中女主角
  的口吻撰寫（例如以女方視角說「我會準時回家」）。已強化 AI 的角色判斷——現在會先確認傳送者在
  劇本中扮演哪個角色，再以該角色的第一人稱撰寫全部訊息，並清除舊的錯誤快取，重新產生即可看到
  正確視角。
- **劇本庫升級：Google 文件匯入＋場景地點＋市集搜尋**: 上傳劇本時可直接貼上 Google 文件
  分享連結一鍵匯入內容（文件需開啟「知道連結的任何人皆可檢視」）；新增「場景地點」欄位
  （教室、辦公室、飯店⋯），我的劇本可用地點小標籤篩選；創作市集新增搜尋框，可依標題、
  情境、地點即時搜尋公開劇本。
- **AI 智慧辨識角色性別（Premium）**: 匯入或貼上含角色名的劇本後，Premium 用戶可一鍵讓
  AI 判斷每個角色是男是女並自動完成「角色對應」，劇本立即帶入你們的暱稱；免費用戶會看到
  清楚的升級說明，草稿不會遺失。
- **劇本角色自動帶入你們的暱稱（依性別）**: 劇本裡的 [男]／[他] 現在會帶入男方的暱稱、
  [女]／[她] 帶入女方的暱稱（在「設定」選好性別即可），不再固定「上傳者=男」。上傳劇本時
  貼上含角色名的內容（例如「小明：對白」），系統會自動偵測角色並讓你把每個角色指定為男／女，
  日後改暱稱或性別，劇本顯示也會跟著更新。伴侶雙方看同一份劇本，各自的暱稱都會出現在
  正確的角色上。
- **修正：親密記錄照片上傳真的能用了**: 上傳照片會 500（後端 SQL 用了資料表沒有的欄位），
  已改成對應實際的 `photos` 結構。現在新增記錄時上傳照片可正確保存並顯示。
- **編輯記錄也能換照片**: 從月曆點日期→編輯，按「更換照片」現在會真的上傳並更新照片
  （之前編輯時完全忽略照片變更）；清空照片也會一併移除。

### 2026-07-02
- **修正：親密記錄的照片終於顯示**: 之前上傳的照片因為上傳端點與紀錄的連結都壞掉，導致詳情
  與列表都看不到照片。現已修好——新記錄上傳的照片會正確保存並顯示在列表與詳情頁（需先配對，
  照片才存得下來）。
- **親密記錄顯示間隔天數**: 「記錄時光」的親密記錄列表，每一筆紀錄旁現在會顯示「距上次相隔
  N 天」，一眼看出你們的節奏變化。
- **周平均改為功能開關**: 「周平均」統計卡片預設隱藏，改由管理後台 (`/admin`) 的「功能開關」
  分頁即時開啟／關閉——這也是新的「功能開關」機制，之後的 UI 實驗都能藏在開關後面試用，
  不必重新部署。
- **月曆補滿上下月的日子**: 記錄時光的月檢視不再只顯示當月、月初月底留白，現在會把該週補滿的
  上個月／下個月日子也一起顯示（淡色呈現），這些日子上的紀錄（親密、月經、備孕）也看得到、
  也能點進去。例如 7/1 是週三時，同一列會看到 6/30 當天的紀錄，不再被藏起來。

### 2026-07-01
- **劇本圖片可在小圖直接翻頁**: 打開劇本 modal 後，不用再點進放大檢視，直接在預覽小圖上用
  左右箭頭或滑動就能瀏覽多張照片；點小圖仍可放大，放大檢視也支援滑動翻頁。
- **縮圖變大、標籤可篩選**: 「我的劇本」卡片縮圖放大（桌面更大、手機也比原本清楚），並新增
  「查看所有標籤」按鈕——展開後可點任一標籤（劇本的 tags）進一步過濾清單，預設收合不占空間。
- **角色扮演改用單一清單 + 篩選**: 「我的劇本」不再拆成「我的最愛／所有／自訂」三個區塊，改成
  一排篩選標籤（所有／浪漫／冒險／校園／大膽／我的最愛／自訂）過濾同一份清單；點「自訂」就只看
  自訂劇本、點「我的最愛」就只看收藏的劇本。搜尋、縮圖/清單切換、編輯／分享／查看／開始都保留，
  「上傳劇本」按鈕移到最上方。

### 2026-06-30
- **刪除自訂劇本**: 編輯自訂劇本時新增「刪除這個劇本」按鈕，二次確認後即可移除，不再需要保留
  不想要的劇本。
- **最近動態**: 個人選單新增「最近動態」分頁，一眼看見你與另一半最近的 20 筆互動紀錄——
  親密時光、上傳劇本、留言板、事件、成就、金幣與關係檢查，依時間排序並標示是「你」還是
  對方做的。
- **搜尋自訂劇本**: 自訂劇本區塊新增搜尋框，可用標題、情境或標籤快速找到劇本，劇本多也不怕。
- **重新整理保留分頁**: 重新整理頁面後會停留在原本的分頁（例如角色扮演），不再跳回記錄時光。
- **登出回到首頁**: 點擊登出後會清空畫面並回到未登入首頁，不再停在原本的設定／商店等頁面。
- **未登入月曆改用愛心**: 未登入首頁的範例月曆現在用 ♥ 標記親密時光（與登入後一致），
  並移除「心情」標記，讓圖例更貼近真實使用畫面。

### 2026-06-28
- **婚姻檢查**: 「和諧相處」新增「婚姻檢查」區塊 — 每隔一段時間，兩個人各自誠實為
  溝通、親密、家務、金錢、情緒支持、共同未來打分數，寫下想感謝對方的事與最想一起改善的，
  雙方都完成後一起揭曉並排呈現，AI 會像中立的第三方給出總結與可以一起聊的對話方向。
- **先接住情緒，溝通才開始**: 衝突事件的對話串新增「如何接住TA的情緒」按鈕 — 當對方
  表達情緒時，AI 會先幫你看見對方的感受，並給三句肯定、能被接受的回應，讓你先接住情緒、
  再談事情。「和諧相處」改以「先接住情緒」為主軸，移除了「相處練習」；原本的對話指引
  移到「親密邀請」裡的新類型「情緒指引」，可挑選想說的步驟與句子傳給對方。
- **最常出現的情緒 & 接住提示**: 衝突事件的分析新增「你最常出現的情緒」，點任一情緒即可
  看到這種情緒在表達什麼、可以怎麼接住，以及幾句可以直接說的話。
- **藍新金流 (NewebPay) 雙金流**: 升級 Premium 與預約付費視訊諮商時，現在可以選擇
  以「綠界 ECPay」或「藍新金流」付款，支援信用卡、LINE Pay、ATM 與超商代碼／條碼。
  兩種金流走相同的開通邏輯、購買天數一樣會累加堆疊。
- **未登入也能看方案**: 未登入首頁新增「Premium」分頁，直接呈現 30／90／365 天方案、
  價格與包含的權益，並可一鍵註冊或前往完整方案頁 (`/pricing`)。完整方案頁同步更新
  雙金流付款說明。

### 2026-06-25
- **愛的行動 & 好感存款明細**: The 愛的語言 result page now suggests 5 actions for
  your partner's love language and lets each partner keep a custom "what makes me
  feel loved" wishlist. The 關係之屋 好感存款 meter is now explainable — a 明細 view
  of what adds/costs goodwill (with the actual items + why), a (?) hint on the 5:1
  ratio, and a 檢視結果 view of past 關係檢視 scores for both partners.
- **心理諮商頁精簡**: 成為諮商師 moved to a low-key page footer, the separate
  therapist-login button was removed (therapists use the normal login), and the
  focus-area tags collapse to a few common ones behind a 更多 toggle.

### 2026-06-24
- **關係之屋 智能提醒儀表板**: A relationship-cultivation dashboard at the top of
  記錄時光 — one ranked nudge (intimacy gap / check-in due / goodwill / appreciation),
  a weekly 關係檢視 rating 信賴 / 奉獻 / 連結, and a 好感存款 (5:1) meter. In-app +
  email reminders go to both partners.
- **愛的語言測驗**: A 15-question quiz that finds your primary love language and
  saves it to your profile; you can see your partner's result too.

### 2026-06-23
- **未登入體驗改版**: Each nav tab now previews its own feature when logged out
  (sample calendar, the conflict-repair flywheel, real roleplay scripts), plus a
  「聽聽其他用戶怎麼說」testimonials section and a stats hook (周平均 / 已經幾天沒有親密了).
- **衝突事件 AI 諮商師 + 公開問答分享**: A「請 AI 諮商師加入」button brings an AI
  counselor into the conflict thread; conflict and wall threads can be shared
  anonymously to the public 公開問答.
- **親密提醒升級**: The「已經幾天沒有親密了」stat escalates (font + colour + a one-tap
  親密邀請) as the gap passes 7 / 10 / 12 / 15 days.
- **金幣商店移入 Profile**: Coin shop moved into the Profile menu so the Two*gether*
  logo renders fully on mobile.
<!-- changelog:end -->

## 📧 Email 通知

Email 由 `services/emailService.js` 統一寄送，所有信件共用 `_activityEmailHtml`
模板（簡潔表頭 + 引言區塊 + 單一 CTA），寄件人來自 `EMAIL_FROM`。

> 📮 **送達率**：寄件網域必須與信中連結的網域一致，否則信件會被判為垃圾郵件。
> SPF / DKIM / DMARC 的設定步驟見 **[docs/EMAIL_DELIVERABILITY.md](docs/EMAIL_DELIVERABILITY.md)**。

### 會發送 Email 的功能

| 功能 | 觸發時機 | 主旨（範例） | 受「Email 通知」開關控制 |
|---|---|---|---|
| 帳號註冊（歡迎 + 驗證） | 使用者完成註冊 | `🎉 歡迎加入 Twogether！請驗證你的 Email` | 否（交易型） |
| 重寄驗證信 | 使用者於提示橫幅按「重新寄送驗證信」 | `🎉 歡迎加入 Twogether！請驗證你的 Email` | 否（交易型，限流 60 秒） |
| 重設密碼 | 登入頁「忘記密碼？」送出 | `🔑 重設你的 Twogether 密碼` | 否（交易型，連結 1 小時有效） |
| 配對邀請 | 以 Email 邀請伴侶 / 重寄 | `{名字} 邀請你一起用 Twogether` | 否（交易型，`Reply-To` 為邀請人本人） |
| 配對成功 | 對方接受配對邀請 | `{名字} 接受了你的配對邀請` | 否（交易型） |
| 傳訊息給伴侶（含和解訊息） | 伴侶送出訊息／邀請 | `💌 {名字} 傳了一則訊息給你` | ⚠️ 否（直接寄給伴侶） |
| 邀請回應（接受／婉拒） | 伴侶回應你的訊息 | 接受／婉拒通知 | 是 |
| 親密互動洞察提醒（Nudge） | 主動寄出提醒 | `💞 {名字} 想和你聊聊彼此的親密時光` | ⚠️ 否（直接寄給伴侶） |
| 牆上留言／回覆 | 伴侶在牆上發文或回覆 | `💌 / 💬 / ⭐ {名字} …` | 是 |
| 事件通知 | 事件 建立／回覆／請求解決／已解決 | `📣 / 💬 / 🤝 / ✅ {名字} …` | 是 |
| 付款收據 | Premium 付款成功（ECPay callback） | `🧾 Twogether Premium 購買收據` | 否（交易型，寄給購買者） |
| 諮商「第一次預約」 | 使用者首次預約諮商 | `🗓️ {名字} 向你預約了諮商` + `🗓️ 你的諮商預約已送出`（雙方各一封） | 否（交易型） |
| 諮商師 Email 驗證 | 諮商師申請註冊 | `🩺 請驗證你的 Email · Twogether 諮商師申請` | 否（交易型） |

### 只有 App 內通知、不寄 Email 的功能

| 功能 | 說明 |
|---|---|
| 諮商室後續聊天訊息 | 第一次預約寄 Email，之後的對話只發 App 內通知（`consultation_message`） |
| 記錄親密時光 / 月經週期 | 只存資料 |
| 金幣商店兌換、自訂禮品 | 無 |
| 上傳／編輯自訂劇本、收藏、創作市集評分 | 無 |
| 情趣遊戲 / 前戲 / 姿勢 / 組合技 | 無 |
| 成就、里程碑、愛情旅程 | 無 |
| 升級頁 / 優惠碼兌換 | 無（付款成功才寄收據） |
| App 內通知（通知匣） | 站內通知，與 Email 各自獨立 |

> 「Email 通知」開關存於 `users.email_notifications_enabled`（設定頁可調），
> 控制牆上、事件、邀請回應。標記 ⚠️ 的兩種（傳訊息、洞察提醒）目前會繞過此開關
> 直接寄給伴侶。Email 驗證採**軟性**機制：未驗證仍可使用 App，只顯示提示橫幅。

> 受開關控制的通知信都帶 RFC 8058 一鍵退訂標頭（`List-Unsubscribe` +
> `List-Unsubscribe-Post`），指向 `GET|POST /api/email/unsubscribe?t=<簽章 token>`
> （`routes/email.js`）— 免登入，點一下就把 `email_notifications_enabled` 設為
> `false`。token 由 `lib/emailUnsubscribe.js` 以 `JWT_SECRET` 做 HMAC，無狀態、
> 不需額外資料表。交易型信件沒有可退訂的訂閱，只帶 `mailto:` 形式。

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons

### Backend
- Node.js with Express framework
- PostgreSQL database (Supabase)
- JWT authentication
- Supabase for file storage
- Docker containerization

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (or Supabase account)
- Google Cloud CLI (for deployment)

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials (required before running)
```

### 2. Install Dependencies
```bash
# Install all dependencies (both frontend and backend)
npm install
```

### 3. Development Mode

#### Option A: With Cloud Database (Supabase)
```bash
# Build frontend first
npm run build

# Start combined server (uses cloud database)
npm run dev:backend

# Visit: http://localhost:8080
```

#### Option B: With Local PostgreSQL Database
```bash
# 1. Set up local PostgreSQL database
./scripts/setup-local-db.sh

# 2. Copy your .env to .env.local and update DATABASE_URL
cp .env .env.local
# Edit .env.local to use: DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev

# 3. Run migrations to create tables
NODE_ENV=development npm run migrate

# 4. Build and start server
npm run build
NODE_ENV=development npm run dev:backend

# Visit: http://localhost:8080
```

#### Development with Hot Reload (For Frontend Changes)
```bash
# Terminal 1: Start backend API
npm run dev:backend

# Terminal 2: Start frontend dev server with hot reload
npm run dev

# Visit: http://localhost:5174 (proxies to backend on :8080)
```

### 4. Production Deployment

#### Automatic (GitHub Actions)
```bash
# Push to main branch triggers automatic deployment
git add .
git commit -m "Deploy update"
git push origin main
```

#### Manual Deployment
```bash
# Build frontend
npm run build

# Deploy to Google App Engine
gcloud app deploy

# Check deployment
gcloud app browse
```

## 🗄️ Local PostgreSQL Setup

For local development, you can use a local PostgreSQL database instead of the cloud database:

### Installation

**macOS (with Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Quick Setup
```bash
# Run the automated setup script
./scripts/setup-local-db.sh

# This creates:
# - Database: twogether_dev
# - User: twogether
# - Password: twogether123
# - Connection: postgresql://twogether:twogether123@localhost:5432/twogether_dev
```

### Manual Setup
```bash
# 1. Create database user
psql postgres -c "CREATE USER twogether WITH PASSWORD 'twogether123';"
psql postgres -c "ALTER USER twogether CREATEDB;"

# 2. Create database
createdb -O twogether twogether_dev

# 3. Update .env.local
echo "DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev" >> .env.local

# 4. Run migrations
NODE_ENV=development npm run migrate
```

### Database Management
```bash
# Connect to local database
psql postgresql://twogether:twogether123@localhost:5432/twogether_dev

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status

# Reset database (drops all tables)
psql twogether_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
NODE_ENV=development npm run migrate
```

## 🧪 Database Setup for Different Environments

### Test Environment (Automated)
The test database is automatically set up when running tests:

```bash
# Run tests with automatic database setup
npm run test:backend

# The test script automatically:
# 1. Creates test database (twogether_test) if it doesn't exist
# 2. Runs all migrations to ensure schema is up to date
# 3. Optionally cleans existing data for fresh test runs
```

**Manual Test Database Setup:**
```bash
# Set up test database manually (if needed)
node scripts/setup-test-db.js

# Or clean and set up test database
node scripts/setup-test-db.js --clean

# Check test migration status
NODE_ENV=test npm run migrate:status
```

### Local Development Environment
```bash
# Quick setup (automated)
./scripts/setup-local-db.sh

# Manual setup
psql postgres -c "CREATE USER twogether WITH PASSWORD 'twogether123';"
psql postgres -c "ALTER USER twogether CREATEDB;"
createdb -O twogether twogether_dev

# Run migrations for local development
NODE_ENV=development npm run migrate

# Check local development migration status
NODE_ENV=development npm run migrate:status
```

### Production Environment
```bash
# Production database setup (usually managed by cloud provider)
# For Supabase: Database is auto-created, just run migrations

# Run production migrations (if using custom PostgreSQL)
NODE_ENV=production npm run migrate

# Check production migration status
NODE_ENV=production npm run migrate:status
```

### Database Environments Summary

| Environment | Database Name | Environment File | Auto-Setup |
|-------------|---------------|------------------|-----------|
| **Test** | `twogether_test` | `.env.test` | ✅ Automatic (during tests) |
| **Local Dev** | `twogether_dev` | `.env.local` | ⚙️ Manual (run script) |
| **Production** | (Cloud managed) | `.env` | 🌐 Cloud provider |

### Database Configuration Files
- **Test**: `.env.test` - Contains `DATABASE_URL` for test database
- **Local Development**: `.env.local` - Contains `DATABASE_URL` for local PostgreSQL
- **Production**: `.env` - Contains `DATABASE_URL` for cloud database (Supabase)

## 📋 Development Commands

### Quick Reference
```bash
# Development
npm run build              # Build frontend for production
npm run dev               # Start frontend dev server with hot reload
npm run dev:backend       # Start backend API server
npm start                 # Start production server

# Testing
npm test                  # Run all tests (backend + E2E)
npm run test:backend      # Run backend tests only
npm run test:e2e          # Run E2E tests only
npm run test:e2e:ui       # Run E2E tests with UI

# Linting & Code Quality
npm run lint              # Lint TypeScript/JavaScript code
```

## 📁 Project Structure

```
twogether/
├── server.js              # Main Express server (serves API + frontend)
├── package.json           # Combined dependencies (frontend + backend)
├── app.yaml               # App Engine Standard config
├── vite.config.ts         # Vite frontend build configuration
├── index.html             # HTML entry point
├── src/                   # React source code
│   ├── App.tsx            # Main React component
│   ├── components/        # React components
│   └── services/          # API service layer
├── dist/                  # Built React app (auto-generated)
├── routes/                # Backend API routes (auth, couples, etc.)
├── database/              # PostgreSQL connection
├── middleware/            # Auth & validation middleware
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── cloudbuild.yaml        # Google Cloud Build configuration
```

## Environment Variables

### Required Variables
```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost/twogether

# JWT Authentication
JWT_SECRET=your-long-random-secret-key

# Supabase (required for storage features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Server Configuration
NODE_ENV=production
PORT=8080
CORS_ORIGIN=http://localhost:5174

# Email (services/emailService.js — nodemailer over SMTP).
# Production uses Resend so mail is DKIM-signed for twogether.fun.
# EMAIL_FROM must be on a domain verified with your provider, or invites
# land in spam. Setup guide: docs/EMAIL_DELIVERABILITY.md
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_USER=resend                 # literal string for Resend, not an address
SMTP_PASS=your-resend-api-key
EMAIL_FROM=Twogether <hello@twogether.fun>
EMAIL_REPLY_TO=support@twogether.fun

# Admin funnel dashboard (gates /admin and /api/admin/*)
ADMIN_PASSWORD=pick-a-long-random-password
```

## 🔧 Supabase Setup

### 1. Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note your Project URL and Service Role Key

### 2. Create Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Create a bucket named `photos`
3. Enable **Public bucket** for direct image access

### 3. Update Environment
Add your Supabase credentials to `.env`:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🔒 Security Best Practices

### Environment Security
- ✅ **DO**: Use `.env` file for all secrets
- ✅ **DO**: Use different secrets for development and production
- ❌ **DON'T**: Commit `.env` file to version control
- ❌ **DON'T**: Share your `SUPABASE_SERVICE_ROLE_KEY`

### Password Security
- ✅ **DO**: Use long, random strings for `JWT_SECRET` (minimum 32 characters)
- ✅ **DO**: Use strong passwords for database
- ✅ **DO**: Rotate secrets regularly in production

## API Endpoints

All API routes are prefixed with `/api/`:

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Couples
- `GET /api/couples` - Get couple information
- `POST /api/couples` - Create or join couple (with pairing code)
- `POST /api/couples/generate-pairing-code` - Generate pairing code
- `PUT /api/couples/nicknames` - Update partner nicknames
- `PUT /api/couples/journey` - Update couple journey milestones

### Love Moments
- `GET /api/love-moments` - Get all records
- `POST /api/love-moments` - Create new record
- `GET /api/love-moments/{id}` - Get specific record
- `PUT /api/love-moments/{id}` - Update record
- `DELETE /api/love-moments/{id}` - Delete record

### Photos
- `POST /api/photos/upload` - Upload photo to Supabase
- `GET /api/photos` - Get photo listings

### Achievements & Coins
- `GET /api/achievements` - Get achievements
- `GET /api/coins/balance` - Get coin balance
- `POST /api/coins/transactions` - Coin transactions

### Statistics
- `GET /api/stats` - Get user statistics
- `GET /api/stats/leaderboard` - Get leaderboard

### Intimacy Requests
- `GET /api/intimacy-requests` - Get intimacy requests
- `POST /api/intimacy-requests` - Create intimacy request
- `PUT /api/intimacy-requests/:id/respond` - Respond to intimacy request
- `DELETE /api/intimacy-requests/:id` - Delete intimacy request

### Intimacy Templates & Options
- `GET /api/intimacy-requests/intimacy-templates` - Get all intimacy templates
- `GET /api/intimacy-requests/intimacy-templates/:category` - Get templates by category
- `GET /api/intimacy-requests/alternative-intimacy-options` - Get alternative intimacy options

### Notifications
- `GET /api/intimacy-requests/notifications` - Get user notifications
- `PUT /api/intimacy-requests/notifications/mark-read` - Mark notifications as read
- `GET /api/intimacy-requests/notifications/unread-count` - Get unread count
- `GET /api/intimacy/notifications/unread-count` - Alternative endpoint for frontend compatibility

## 🚀 Development Workflow

### Scripts Available
```bash
# Development
npm run dev              # Start backend API server
npm run dev:frontend     # Start frontend with hot reload

# Production
npm run build            # Build frontend to /public
npm run start            # Start production server

# Utilities
npm run install:all      # Install all dependencies
npm run test            # Run tests
```

## 🌐 Architecture Benefits

### Cost Optimization
- **Before**: App Engine Flex ~$50-100/month (always-on instances)
- **After**: App Engine Standard ~$0-5/month (scales to zero, free tier)

### Performance
- **Cold Start**: Node.js ~1-2s vs Rust ~5-10s
- **Memory**: Lower memory usage with combined instance
- **Network**: No inter-service calls (frontend ↔ backend)

### Development
- **Single Deploy**: One command deploys everything
- **Shared Dependencies**: No version mismatches
- **Simplified CORS**: No cross-origin issues in production

## 🐛 Troubleshooting

### Common Issues

#### 1. Environment Setup
```bash
# Check if .env file exists
ls -la .env

# Verify environment variables are set
cat .env | grep -E "(DATABASE_URL|JWT_SECRET|SUPABASE_URL)"

# Create .env from template if missing
cp .env.example .env
```

#### 2. Database Connection Issues
```bash
# Test database connection (requires psql)
psql $DATABASE_URL -c "SELECT NOW();"

# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:port/database
```

#### 3. Port Issues
```bash
# Check what's running on port 8080
lsof -i :8080

# Kill processes on port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
PORT=8081 node server.js
```

#### 4. Frontend Build Issues
```bash
# Clean and rebuild frontend
rm -rf dist
npm run build

# Check build output
ls -la dist/
```

#### 5. Dependencies Issues
```bash
# Clean install all dependencies
rm -rf node_modules
npm install
```

#### 6. Deployment Issues
```bash
# Check Google Cloud auth
gcloud auth list

# Set project
gcloud config set project YOUR_PROJECT_ID

# Check App Engine status
gcloud app describe

# View deployment logs
gcloud app logs tail -s default
```

### Health Checks

#### Local Development
```bash
# Test backend health
curl http://localhost:8080/health

# Test API endpoint (if exists)
curl http://localhost:8080/api/auth/me

# Expected health response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "version": "1.0.0"
}
```

#### Production
```bash
# Test production health (replace with your domain)
curl https://your-project.uc.r.appspot.com/health

# Check Google Cloud Console for logs and metrics
```

### Debug Mode
```bash
# Start backend with debug logging
DEBUG=* npm run dev:backend

# Or specific debug namespace
DEBUG=express:* npm run dev:backend

# Start frontend in development mode for debugging
npm run dev
```

## 🔍 Monitoring

- **Health Endpoint**: `/health` for uptime monitoring
- **App Engine Logs**: Centralized logging in Google Cloud Console
- **Error Tracking**: Automatic error logging
- **Performance**: Built-in App Engine metrics

### Querying email failures in Cloud Logging

All server code uses `lib/logger.js`, which emits one structured JSON entry
per call. SMTP errors come with `jsonPayload.code` (e.g. `EAUTH`),
`jsonPayload.kind` (`pairing_invite`, `intimacy_request`, `wall_post`,
`event`, `intimacy_response`, etc.), and `jsonPayload.responseCode`.

```bash
# Tail email-related errors in real time
gcloud app logs tail -s default --project=$GCP_PROJECT_ID \
  | grep -iE 'smtp|email'

# Pull the last 24h of email errors as structured rows
gcloud logging read \
  'resource.type="gae_app" AND severity>=ERROR AND jsonPayload.message=~"email|SMTP"' \
  --project=$GCP_PROJECT_ID --limit=50 --freshness=24h \
  --format='value(timestamp, jsonPayload.message, jsonPayload.code, jsonPayload.kind, jsonPayload.err)'

# Find auth failures specifically (typical when the App Password is wrong
# or hasn't been redeployed)
gcloud logging read \
  'resource.type="gae_app" AND jsonPayload.code="EAUTH"' \
  --project=$GCP_PROJECT_ID --limit=20 --freshness=7d
```

### Verifying SMTP credentials locally

Before deploying a new `SMTP_PASS`, confirm the credential works against the
SMTP provider without sending any user-facing email. The script also prints
the `From:` / `Reply-To:` it resolved from `EMAIL_FROM` / `EMAIL_REPLY_TO`,
so you can catch a misconfigured sender before it costs you deliverability:

```bash
# Auth check only (TLS handshake + AUTH)
node scripts/verify-smtp.js

# Auth check + send a real test email
node scripts/verify-smtp.js --to you@example.com
```

The script never prints the password (only a length + first/last char) and
exits non-zero on failure. When the test email arrives, open its raw source
and confirm SPF/DKIM/DMARC all say `PASS` **and** that the DKIM domain
matches the `From:` domain — see
[docs/EMAIL_DELIVERABILITY.md](docs/EMAIL_DELIVERABILITY.md).

> ⚠️ **Production note**: Updating `SMTP_PASS` (or `EMAIL_FROM`, or any
> other secret) in GitHub only takes effect on the *next* `gcloud app deploy`
> — App Engine env vars are substituted from `_SMTP_PASS` etc. at deploy
> time. After rotating a credential, push to `main` (or run the deploy
> workflow manually) before expecting prod emails to start flowing.

## 💰 Cost Breakdown & Optimization

This project uses the following GCP services and their associated costs:

### Service Cost Distribution

**Current Monthly Cost: ~$3-8/month** (varies with usage)

| Service | % of Cost | Monthly Estimate | What It's For |
|---------|-----------|------------------|---------------|
| **Artifact Registry** | ~40-50% | $0.30-0.50 | Stores Docker images from deployments |
| **Cloud Build** | ~30-40% | $0.50-2.00 | Builds and deploys app on each push to main |
| **App Engine Standard** | ~10-20% | $0-0.50 | Hosts the application (F1 instance) |
| **Cloud Storage** | ~5-10% | $0.10-0.30 | GitHub Actions artifacts & logs |

**Note**: Supabase (database & file storage) costs are separate and not included above.

### Cost Optimization Tips

#### 1. Reduce Artifact Registry Storage (Save ~60%)
```bash
# Set up automatic cleanup policy (keeps last 5 images only)
gcloud artifacts repositories set-cleanup-policies gae-standard \
  --location=asia-east1 \
  --policy=cleanup-policy.json

# Create cleanup-policy.json:
{
  "rules": [{
    "id": "keep-recent-5",
    "action": "KEEP",
    "mostRecentVersions": {
      "keepCount": 5
    }
  }, {
    "id": "delete-old",
    "action": "DELETE",
    "olderThan": "7d"
  }]
}

# Or manually delete old images
gcloud artifacts docker images list \
  asia-east1-docker.pkg.dev/twogether-couples-app/gae-standard \
  --format="value(IMAGE)" | head -n -5 | xargs -I {} gcloud artifacts docker images delete {} --quiet
```

#### 2. Reduce Build Frequency (Save ~70%)
Your GitHub Actions currently triggers on every push to main. Consider:
- **Batching commits**: Push less frequently, or use feature branches
- **Skip CI for docs**: Add `[skip ci]` to commit messages for documentation-only changes
- **Use pull requests**: Test on PRs before merging to main (workflow already has this)

#### 3. Monitor Build Status
```bash
# Check recent builds
gcloud builds list --limit=10

# Check artifact registry usage
gcloud artifacts repositories describe gae-standard --location=asia-east1

# View current costs
# Visit: https://console.cloud.google.com/billing/
```

#### 4. App Engine Optimization
Your current setup is already optimized:
- ✅ Using App Engine Standard (not Flex) - saves ~$50/month
- ✅ `min_instances: 0` - scales to zero when idle
- ✅ `max_instances: 1` - prevents unexpected scaling
- ✅ `instance_class: F1` - smallest instance size

### Why Costs Increased Recently

Common causes of cost spikes:
1. **Multiple failed builds**: Failed builds still consume Cloud Build minutes and create artifacts
2. **Accumulated Docker images**: Old images not cleaned up (currently 3.26 GB)
3. **Frequent deployments**: 20 builds in 2 days = excessive Cloud Build usage
4. **Build timeouts**: Timeout builds (15 min each) consume maximum minutes

### Cost Monitoring Dashboard

Track your costs in real-time:
1. Go to [GCP Billing Dashboard](https://console.cloud.google.com/billing/)
2. Set up budget alerts for > $10/month
3. Enable cost breakdown by service

![Cost Breakdown Graph](https://i.imgur.com/example.png)

### Expected Costs by Usage Level

| Usage Level | Monthly Cost | Details |
|-------------|--------------|---------|
| **Development** | $0-2 | Few deployments, free tier covers most |
| **Light Production** | $2-5 | 1-2 deployments/week, minimal traffic |
| **Active Production** | $5-15 | Daily deployments, moderate traffic |
| **Heavy Production** | $15+ | Multiple daily deployments, high traffic |

**Pro Tip**: Most production apps with 100-500 MAU stay under $5/month with proper optimization.

## 🎛️ Scaling

The app is designed for small to medium couple user bases:

- **Free Tier**: ~1000 MAU with basic usage
- **Paid Tier**: Scales automatically based on traffic
- **Database**: PostgreSQL on Supabase (separate scaling)
- **Storage**: Supabase Storage (separate scaling)

## 📊 E2E Testing Checklist

To verify everything is working:

1. 註冊兩個帳號 → 登入 A
2. 透過 `配對碼` 或 email 完成配對 → 登入 B 確認
3. 在 A 端發送「親密邀請」→ B 端通知中心可看到
4. B 端輸入自訂回覆並「接受」→ A 端收到通知、可見回覆文字

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use TypeScript for all code; prefer interfaces over types
- Use functional and declarative programming patterns
- Write concise, technical code with accurate examples
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@twogether.fun or create an issue in this repository.
(The address lives in `lib/supportContact.json` — change it there, not here or in
`public/pricing.html`.)