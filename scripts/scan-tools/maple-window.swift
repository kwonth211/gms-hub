// Prints the CGWindowID of the largest MapleStory window (the game draws on a raised layer, so any layer counts), for `screencapture -l<id>` (captures that
// window even when other windows cover it). Built once by mega-collector.mjs with swiftc.
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
var best: (id: Int, area: Double) = (0, 0)
for w in list {
  guard (w[kCGWindowOwnerName as String] as? String ?? "").contains("MapleStory"),
        let b = w[kCGWindowBounds as String] as? [String: Double], let id = w[kCGWindowNumber as String] as? Int else { continue }
  let area = (b["Width"] ?? 0) * (b["Height"] ?? 0)
  if area > best.area { best = (id, area) }
}
if best.id > 0 { print(best.id) }
