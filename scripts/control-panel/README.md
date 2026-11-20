# GMS Hub Control (macOS)

`/bin/zsh scripts/control-panel/install.sh` builds and opens
`~/Applications/GMS Hub Control.app`. SwiftUI/AppKit and the system Python are
used; no new runtime dependencies. The source checkout must remain at `~/gms-hub`.

The window connects the existing `~/gms-hub-shop/raycast/` actions:

- **상점 올리기**: `shop-list.sh` (`sync.py`); registers Use-tab scrolls at sheet prices.
- **메소·판매 내역**: `shop-sold.sh` (`sold.py`).
- **팔린 아이템 정리**: `shop-grey.sh` (`done.py --apply`); updates the sheet.
- **상점 작업 중지**: `shop-stop.sh`.
- **고확 수집 시작 / 수집 중지**: installed `mega.sh start / stop`.

Opening the panel does not start a shop action. Existing processes are detected;
duplicate shop jobs are prevented with an OS file lock. Shop actions temporarily
pause megaphone option clicks and restore only their own pause marker afterwards.
Other pause reasons, including cursor protection, remain intact.

The existing bots require the game shop and bag windows to be open. Shop actions
use the mouse and stop if the user moves it. Megaphone option clicks are disabled
while MapleStory is foreground. Closing the panel leaves the bots running.

Start commands use a background Terminal launcher so the bots keep Terminal's
existing screen-capture permission. Logs are shown in the panel and stored in
`~/gms-hub-samples/shop-control.log` and `mega-collector.log`. No credentials are
copied into the GUI or launchers.

Verified locally: native build, window rendering, current process status,
megaphone stop, restart, and resumed live chat capture. The shop buttons call the
existing scripts; GUI verification does not register items or modify sheet rows.
