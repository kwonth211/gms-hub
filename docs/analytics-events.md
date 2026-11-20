# GMS Hub 분석 이벤트 정의

모든 이벤트는 `window.track(name, params)`(assets/analytics.js)로 보내며 GA4와 Clarity에 같은 이름으로 기록돼요.
개인정보·인증값·판매자 닉네임은 보내지 않아요. 검색어는 사용자가 입력한 문자열 그대로 40자까지만 보내요.

## 내부·테스트 트래픽

- `localhost`, `127.0.0.1`, `[::1]`에서 연 페이지와, 한 번이라도 `?internal=1`을 붙여 연 브라우저는
  `gtag('config', …, { traffic_type: 'internal' })`로 보고돼요(브라우저 `localStorage.gmshub_internal`).
- GA4 관리 → 데이터 필터 → "Internal Traffic" 제외 필터는 **활성** 상태예요(2026-11-14 확인). 운영자 테스트는 일반 보고서에서 제외돼요.
- 운영자는 자기 기기마다 `https://gms-hub.com/?internal=1`을 한 번 열어 두면 돼요.
- 2026-11-20부터 Clarity도 로컬 호스트와 같은 내부 플래그에서는 태그를 로드하지 않아요. GA가 꺼진 구성에서도 내부 방문을 제외해요.

## 기능 발견과 재사용 (2026-11-20)

- `home_character`, `home_wishlist`, `home_exp`, `training_exp`, `wishlist_cta`, `hollow_drop`, `price_alert`에 각각 `_view`와 `_click` 이벤트를 붙여요.
- `_view`는 해당 컨트롤의 50% 이상이 화면에 들어온 경우예요. 한 페이지 로드 안에서 기능·배치·대상 조합별 한 번만 세며, 목록 재렌더링은 중복 노출로 세지 않아요. 백그라운드 탭에서는 세지 않아요. 지속해서 읽었다는 의미는 아니에요.
- `_click`은 실제 클릭이에요. `placement`, `content_id`, `page_type`으로 배치와 아이템/사냥터를 구분해요. URL 쿼리·사용자 입력·개인 계정 식별값은 보내지 않아요.
- 관심 저장은 `wishlist_cta_view/click` → 기존 `wishlist_add(storage=ok)` → 이후 방문의 `wishlist_open`/`market_item`으로 봐요. 클릭에는 저장 취소도 포함되므로 저장 성공으로 대체하지 않아요.
- 경험치 도구는 `training_exp_click`/`home_exp_click` → `exp_start` → `exp_first_read`로 봐요. 배포 시점이 다른 원시 이벤트 수를 나눠 퍼널 전환율로 쓰지 않아요.
- `price_alert_start`: Discord 알림 승인을 시작함. `item_id`, `channel=discord`.
- `price_alert_result`: Discord 복귀 화면을 표시함. `item_id`, `channel=discord`, `result=ok|nodm|full|cancel|off|fail`. `nodm`은 저장됐지만 DM 전달이 안 된 경우예요. URL 복귀 결과를 읽은 클라이언트 이벤트이며 서버 발송 성공 지표는 아니에요. 새로고침으로 반복 기록하지 않도록 복귀 파라미터는 기존처럼 제거해요.
- 알림 CTA와 설정 폼은 기존 노출을 유지해요. `alert_on`은 브라우저 푸시 경로이므로 Discord 성공과 혼동하지 않아요.
- 기존 `tool_use`의 정의는 바꾸지 않아요. 새 노출 이벤트를 주요 이벤트로 올려 전환율을 부풀리지 않아요. GA 사용자 정의 매개변수별 분석은 해당 맞춤 측정기준 등록 여부를 확인해야 하며, 이벤트 이름별 집계와 Clarity 확인은 별도로 가능해요.

## 검색 측정 보정 (2026-11-20)

- `market_search`와 `market_no_results`는 입력이 잠시 멈춘 상태의 이벤트이며 검색 확정·포기 건수는 아니에요. 검색어·탭이 바뀌면 이전 예약 이벤트를 버리고, 결과가 발견되면 예약된 무결과 이벤트를 취소해요. 무결과 이벤트는 카테고리가 바뀌어도 버려요.
- `ui_search`는 검색 의미가 지정된 입력칸만 대상으로 해요. placeholder가 있다는 이유만으로 가격 알림 금액·일반 메모·메시지 입력을 검색어로 집계하지 않아요.

## 실사용 전환 (2026-11-14부터)

- 주요 이벤트 이름: **`tool_use`**, 집계 방법: **세션당 한 번**, 기본 금액: **설정 안 함**.
- `market_item`이 `result=ok`이고 `listings > 0`이면 `tool=market`으로 발생해요. 아이템을 지정한 직접/공유 링크도 실제 매물이 로드되면 포함해요.
- `training_search`가 `result=ok`이고 `results > 0`이면 `tool=training`으로 발생해요. 사용자가 조건을 변경/제출해야 하며 첫 자동 표시와 공유 링크의 자동 표시는 제외해요.
- 빈 결과·오류·단순 방문·공유 버튼 클릭은 실사용 전환이 아니에요. 원래 이벤트는 진단용으로 계속 남아요.
- 원시 `tool_use` 이벤트 수는 정상 사용 횟수이고, 주요 이벤트 수는 전환한 세션 수예요. 사용자 수와 세션 수를 혼동하지 않아요. 같은 사용자가 새 세션에서 다시 쓰면 다시 집계해요.
- 트래픽 획득에서 세션 소스/매체별 `tool_use` 세션 주요 이벤트 비율을 비교하세요. 도구별 세부 사용량은 `tool` 이벤트 측정기준으로 봐요. Google Ads 전환 연결·광고 집행은 별도예요.

## 유입 출처 정정

- 내부 클릭 위치에 쓰던 `source`는 GA의 유입 출처와 충돌했어요. 모든 발신부는 `interaction_source`로 바꾸고, 공통 전송부에서도 이전 캐시 코드의 `source`를 변환해요.
- 외부 링크의 `utm_source`, `utm_medium`, `utm_campaign`, 광고 클릭 ID와 referrer는 그대로 GA가 처리해요. 내부 이동 링크에 광고용 UTM을 붙이지 않아요.
- 변경 전의 잘못된 소스/매체 및 과거 주요 이벤트 수는 소급 복구되지 않아요. 배포 시점 이후 새 방문부터 비교하며, 이미 열려 있던 이전 페이지와 기존 세션에는 이전 값이 잠시 남을 수 있어요.

## 이벤트

| 이벤트 | 발생 조건 | 파라미터 |
|---|---|---|
| `market_item` | 시세 페이지에서 아이템을 선택해 상세 매물이 처음 로드됐을 때. 같은 아이템의 필터 변경·페이지 이동·새로고침에는 다시 발생하지 않음 | `item_id`, `listings`(조건에 맞는 매물 수), `result`: `ok`·`empty`·`error`, `interaction_source`: `list`·`search`·`wishlist`·`recent`·`url`·`share`·`home`, `lang` |
| `market_no_results` | 시세 검색어가 결과 0건일 때(1.2초 안정 후, 같은 검색어는 한 번만) | `search_term`, `view`, `category`, `lang` |
| `wishlist_add` / `wishlist_remove` | 시세 페이지 별표로 관심 아이템 추가·삭제(저장 실패 시에도 기록) | `item_id`, `page_type: market`, `storage`: `ok`·`unavailable` |
| `wishlist_open` | 시세 페이지 "관심 아이템 N" 칩으로 관심 목록을 열었을 때 | `count`, `page_type` |
| `recent_remove` | 최근 본 아이템을 개별 삭제하거나 모두 지웠을 때 | `count`, `page_type` |
| `share_copy` | 공유 링크 복사 버튼을 눌렀을 때(성공·실패 모두) | `page_type`: `market`·`training`, `item_id` 또는 `level`/`job`, `result`: `ok`·`fail` |
| `share_open` | `utm_source=share`가 붙은 주소로 페이지가 열렸을 때(세션 소스에도 `share / link`로 남음) | `page_type`, `content`: `market-item`·`training` |
| `training_search` | 사냥터 페이지에서 사용자가 조건을 제출하거나 바꿨을 때. 첫 자동 렌더와 공유 링크 열기에는 발생하지 않음 | `search_term`(`Lv42 archer exp solo` 꼴, GA4 검색어 측정기준으로 바로 보임), `level`, `job`(`all` 포함), `goal`, `party`, `advanced`(0/1), `results`, `result`: `ok`·`empty`, `lang` |
| `home_resume_click` | 메인 "이어서 보기"에서 관심·최근 아이템을 눌렀을 때 | `kind`: `wishlist`·`recent`, `item_id` |
| `monster_drop_click` | 몬스터 상세에서 드롭 아이템의 "아이템·시세 보기"를 눌렀을 때 | `mob_id`, `item_id` |
| `monster_calc_click` | 몬스터 상세에서 몇 방 컷 계산기 버튼을 눌렀을 때 | `mob_id` |
| `video_play` / `video_open` | 페이지에 넣은 유튜브 영상을 재생했을 때 / "유튜브에서 보기"를 눌렀을 때 | `video_id`, `page_type` |
| `item_market_click` | 아이템 시세 페이지에서 실시간 시세 버튼을 눌렀을 때 | `item_id`, `page_type: item` |

기존 이벤트(변경 없음): `search`(메인 검색어 안정 후, `search_term`, `results`), `home_search_click`(`result_type`, `result_id`), `visit_site`, `live_market_click`, `filter_category`, `switch_language`, `scroll_calc`, `drop_calc`, `damage_read`, `price_search`, `scan_*`, `recommend`, `favorite_add/remove`(사이트 즐겨찾기, `site_id`).

## 퍼널·재방문 보는 법

- 방문 → 검색 → 열람: `page_view` → `search`/`home_search_click` → `market_item`(`interaction_source`별).
- 재방문: 날짜가 다른 세션에서 `market_item`의 `interaction_source`가 `wishlist`·`recent`·`home`인 사용자. 조회수가 아니라 활동일로 봐요.
- 공유: `share_copy`(기능 사용)와 세션 소스 `share / link` 또는 `share_open`(공유 링크 유입)을 따로 세요.
- `search_term`, `site_id`는 2026-10-31부터 GA4 맞춤 측정기준으로 등록돼 있어요. 실사용 도구(`tool`)와 내부 진입 위치(`interaction_source`)는 2026-11-14에 이벤트 범위 맞춤 측정기준으로 등록했어요. 외부 유입 소스/매체와 분리해서 분석해요.

`theme_toggle`(`to`: `light` 또는 `dark`): 헤더의 낮/밤 버튼을 누를 때 보내요. 처음 테마는 저장된 선택을 따르고, 저장된 게 없으면 시스템 설정을 따라요. 선택은 `localStorage`의 `gms-theme` 키에 저장돼요.

`equipment_filter`(`level`, `slot`): 장비 찾기 페이지에서 내 레벨·부위·레벨 근처만 보기를 바꿀 때 보내요. 페이지를 열 때 저장된 캐릭터 레벨로 채우는 건 보내지 않아요.

`drop_search`(`results`): 확률 계산기 위 드롭 찾기에 아이템 이름을 입력하고 1.2초 멈췄을 때 보내요. 결과 수(최대 8)를 같이 보내요.

`scroll_pick`(`family`, `ladder`): 주문서 계산기에서 실제 주문서를 고를 때 보내요. 고르면 등급별 시세 중앙값을 불러와 가격 칸과 비교표에 채워요.

`my_shop_search`(`found`): 내 상점 시세 비교에서 판매자 이름을 직접 입력해 조회할 때 보내요. 찾은 판매 중 매물 수를 같이 보내요. 저장된 이름으로 자동 조회할 때는 보내지 않아요. 이름은 `localStorage`의 `gms-my-shop` 키에 저장돼요.

`discord_click`(`place`: `header`·`footer`·`menu`·`contact`·`search-empty`(검색 결과 없음)·`market-empty`(시세 검색 결과 없음)·`bot-install`(봇 페이지의 디스코드에 추가)·`bot-page`): 디스코드 초대 링크를 누를 때 보내요. 링크 주소는 `site.config.json`의 `discord`예요.

`support_click`(`platform`: `toss`·`kakaopay`·`kofi`·`footer`(맨 아래 "서버비 후원" → 문의 페이지 #support)): 후원 버튼을 누를 때 보내요. 후원 링크는 `site.config.json`의 `support`이고, 빈 값은 버튼이 안 보여요.

홈 "내 캐릭터" 칸 (직업·레벨은 `localStorage`의 `gms-char` 키에만 저장돼요):
- `my_char_save`(`job`, `level`): 처음 직업·레벨을 저장할 때.
- `my_char_change`(`field`: `job`·`level`·`level_up`·`level_down`, `job`, `level`): 칸 위의 직업 선택이나 레벨 −/+/입력으로 바꿀 때. 숫자 입력은 0.4초 멈춘 뒤 한 번만 보내요.
- `my_char_click`(`kind`: `route`·`finder`·`class`·`quest`·`quests`·`gear`·`equipment`·`skills`, `item_id`(장비), `ui_value`(퀘스트 공략 slug), `job`, `level`): 칸 안의 링크를 누를 때. 사냥터 카드는 기존 `my_char_route_click`(`route_id`)도 같이 보내요.
- `my_char_photo`(`action`: `upload`·`reset`·`fail`): 내 캐릭터 사진을 올리거나 기본 캐릭터로 돌릴 때. 사진은 240px로 줄여 `localStorage`의 `gms-char-img` 키에만 저장하고 어디에도 보내지 않아요.
- `home_directory_open`: 홈 맨 아래 "다른 사이트 모음" 카드를 눌러 /sites/로 갈 때. 사이트 목록은 2026-11-15부터 /sites/ 페이지(검색엔진 제외)에 있고, 즐겨찾기·추천·용도 필터는 그 페이지에서 그대로 기록돼요. 예전 홈 주소(#community 등)는 /sites/의 같은 칸으로 넘어가요.
- `market_option_tip` (item_id): hovered a shop listing with options; the in-game style card opened.
- `market_stat_search` (item_id, stat, value, results): an item opened from a value search ("48슬레인") and its listings were filtered to that main-stat value.
- `market_option_filter` (item_id, value): picked a value (or "all") in the item panel's option menu.
- `scan_remove` (item_id, sent): removed a misread line on the shop scan page (sent = it had already been uploaded and was withdrawn).
- `scan_me_set`: typed "my character name" on the shop scan page (used when the own-store owner box reads blank).
- `lab_open` (lab): opened an unlisted lab page (quest-run, meso-farm, market-pulse). `lab_quest_check` (quest_id, done): checked a quest on the lab quest checklist.
- `market_refresh` (scope listings|detail, item_id): pressed the refresh button on the all-listings tab or an item's listings.
- `market_gone` (item_id, reports): pressed "팔렸어요" on a listing (the shop no longer had it); reports = that listing's count after this press.
- `exp_level_read` (level, job): the EXP tracker read the level and job from the status bar and filled them in.
- `scan_share_cancel` (reason): the screen-share picker was closed or refused on the scan page.
- `scan_first_rows` (after_s, rows): the first frame where a shop list was found.
- `scan_issue` (issue, after_s, …): once per scan where it got stuck — no_shop (20 s, no shop list; w, h, scale), no_channel / no_room (3 frames with a shop but no location), unsure_rows (a minute with rows but none sure; rows, named, priced, seller), read_error (ocr, msg), upload_fail (msg), video_play.
- `scan_stop` now also carries rows, uploaded, minutes and issues.
- `exp_share_cancel` (reason), `exp_first_read` (after_s): EXP tracker share refused / first good reading.
- `exp_issue` (issue, after_s, …): no_bar (20 s without the gauges; w, h), read_fail (6 failed reads in a row; text read, h).
- `exp_stop` now also carries read (0/1) and issues.
- `shop_page_view` (seller_found 0|1, listings): opened a shop page (/shop/?n=).
- `shop_link_copy` (what link|line|scan, result): copied the shop page link or the ready-made post text.
- `shop_page_open` (from scan): opened the shop page from the scan page after an upload.
- `market_gone_undo` (item_id, reports): took back their own "팔렸어요".
- `market_still_there` (item_id): pressed "아직 있어요" on a listing others reported gone; the reports were cleared.

## Market radar and search recovery (2026-11-20)

- `market_radar_open`: visitor expands the live listing radar (`lang`). No listings requests while closed.
- `market_radar_result`: a check completes (`results`, `sampled`, `lang`). Automatic checks are **not** active users or tool-use conversions.
- `market_radar_click`: visitor opens a candidate item (`item_id`, `lang`); subsequent `market_item(interaction_source=radar)` records actual load success.
- `share_copy(content=market-radar)`: copies an observed-price summary and canonical item link; success is `result=ok`, not proof it was posted. `share_open(content=market-radar)` measures a tagged arrival.
- `market_search_recover(action=clear_filters)`: clears restrictive filters while retaining the item-name query. A subsequent successful `market_item` is the completion signal.
- Shared market item links now preserve `opt` and prefer existing item pages. No seller names or listing text are added to analytics.

Radar compares exact-ID scrolls/stars only, with at least 5 open listings / 2 shops. It displays observations no older than one hour, excludes sold/reported-missing/options-bearing records, and requires at least a 10% discount from the catalog asking median. This is a bounded sample, not a guaranteed cheapest offer or a completed-trade valuation.
