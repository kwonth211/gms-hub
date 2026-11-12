# GMS Hub 분석 이벤트 정의

모든 이벤트는 `window.track(name, params)`(assets/common.js)로 보내며 GA4와 Clarity에 같은 이름으로 기록돼요.
개인정보·인증값·판매자 닉네임은 보내지 않아요. 검색어는 사용자가 입력한 문자열 그대로 40자까지만 보내요.

## 내부·테스트 트래픽

- `localhost`, `127.0.0.1`, `[::1]`에서 연 페이지와, 한 번이라도 `?internal=1`을 붙여 연 브라우저는
  `gtag('config', …, { traffic_type: 'internal' })`로 보고돼요(브라우저 `localStorage.gmshub_internal`).
- GA4 관리 → 데이터 필터 → "내부 트래픽" 필터를 **사용 중**으로 바꿔야 실제 보고서에서 빠져요 (사용자 확인 필요).
- 운영자는 자기 기기마다 `https://gms-hub.com/?internal=1`을 한 번 열어 두면 돼요.

## 이벤트

| 이벤트 | 발생 조건 | 파라미터 |
|---|---|---|
| `market_item` | 시세 페이지에서 아이템을 선택해 상세 매물이 처음 로드됐을 때. 같은 아이템의 필터 변경·페이지 이동·새로고침에는 다시 발생하지 않음 | `item_id`, `listings`(조건에 맞는 매물 수), `result`: `ok`·`empty`·`error`, `source`: `list`·`search`·`wishlist`·`recent`·`url`·`share`·`home`, `lang` |
| `market_no_results` | 시세 검색어가 결과 0건일 때(1.2초 안정 후, 같은 검색어는 한 번만) | `search_term`, `view`, `category`, `lang` |
| `wishlist_add` / `wishlist_remove` | 시세 페이지 별표로 관심 아이템 추가·삭제(저장 실패 시에도 기록) | `item_id`, `page_type: market`, `storage`: `ok`·`unavailable` |
| `wishlist_open` | 시세 페이지 "관심 아이템 N" 칩으로 관심 목록을 열었을 때 | `count`, `page_type` |
| `recent_remove` | 최근 본 아이템을 개별 삭제하거나 모두 지웠을 때 | `count`, `page_type` |
| `share_copy` | 공유 링크 복사 버튼을 눌렀을 때(성공·실패 모두) | `page_type`: `market`·`training`, `item_id` 또는 `level`/`job`, `result`: `ok`·`fail` |
| `share_open` | `utm_source=share`가 붙은 주소로 페이지가 열렸을 때(세션 소스에도 `share / link`로 남음) | `page_type`, `content`: `market-item`·`training` |
| `training_search` | 사냥터 페이지에서 사용자가 조건을 제출하거나 바꿨을 때. 첫 자동 렌더와 공유 링크 열기에는 발생하지 않음 | `level`, `job`(`all` 포함), `goal`, `party`, `advanced`(0/1), `results`, `result`: `ok`·`empty`, `lang` |
| `home_resume_click` | 메인 "이어서 보기"에서 관심·최근 아이템을 눌렀을 때 | `kind`: `wishlist`·`recent`, `item_id` |
| `monster_drop_click` | 몬스터 상세에서 드롭 아이템의 "아이템·시세 보기"를 눌렀을 때 | `mob_id`, `item_id` |
| `monster_calc_click` | 몬스터 상세에서 몇 방 컷 계산기 버튼을 눌렀을 때 | `mob_id` |
| `item_market_click` | 아이템 시세 페이지에서 실시간 시세 버튼을 눌렀을 때 | `item_id`, `page_type: item` |

기존 이벤트(변경 없음): `search`(메인 검색어 안정 후, `search_term`, `results`), `home_search_click`(`result_type`, `result_id`), `visit_site`, `live_market_click`, `filter_category`, `switch_language`, `scroll_calc`, `drop_calc`, `damage_read`, `price_search`, `scan_*`, `recommend`, `favorite_add/remove`(사이트 즐겨찾기, `site_id`).

## 퍼널·재방문 보는 법

- 방문 → 검색 → 열람: `page_view` → `search`/`home_search_click` → `market_item`(`source`별).
- 재방문: 날짜가 다른 세션에서 `market_item`의 `source`가 `wishlist`·`recent`·`home`인 사용자. 조회수가 아니라 활동일로 봐요.
- 공유: `share_copy`(기능 사용)와 세션 소스 `share / link` 또는 `share_open`(공유 링크 유입)을 따로 세요.
- `search_term`, `site_id`는 2026-10-31부터 GA4 맞춤 측정기준으로 등록돼 있어요. `item_id`, `source`, `result`를 맞춤 측정기준으로 추가하면 보고서에서 나눠 볼 수 있어요 (사용자 확인 필요).

`theme_toggle`(`to`: `light` 또는 `dark`): 헤더의 낮/밤 버튼을 누를 때 보내요. 처음 테마는 저장된 선택을 따르고, 저장된 게 없으면 시스템 설정을 따라요. 선택은 `localStorage`의 `gms-theme` 키에 저장돼요.

`equipment_filter`(`level`, `slot`): 장비 찾기 페이지에서 내 레벨·부위·레벨 근처만 보기를 바꿀 때 보내요. 페이지를 열 때 저장된 캐릭터 레벨로 채우는 건 보내지 않아요.

`drop_search`(`results`): 확률 계산기 위 드롭 찾기에 아이템 이름을 입력하고 1.2초 멈췄을 때 보내요. 결과 수(최대 8)를 같이 보내요.

`scroll_pick`(`family`, `ladder`): 주문서 계산기에서 실제 주문서를 고를 때 보내요. 고르면 등급별 시세 중앙값을 불러와 가격 칸과 비교표에 채워요.

`my_shop_search`(`found`): 내 상점 시세 비교에서 판매자 이름을 직접 입력해 조회할 때 보내요. 찾은 판매 중 매물 수를 같이 보내요. 저장된 이름으로 자동 조회할 때는 보내지 않아요. 이름은 `localStorage`의 `gms-my-shop` 키에 저장돼요.

`discord_click`(`place`: `footer`·`menu`·`contact`): 디스코드 초대 링크를 누를 때 보내요. 링크 주소는 `site.config.json`의 `discord`예요.
