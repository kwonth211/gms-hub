// Verified with MapleStory Classic World on macOS, 2026-11-20.
// Usage: background-item-input move|click|release <window-image-x> <window-image-y>
// Coordinates include the title bar, as in a shadow-free window capture.
// Never activates an app, posts globally, warps the pointer, or injects code.
import AppKit
import ApplicationServices
import Darwin
let cursorProbe = dlsym(UnsafeMutableRawPointer(bitPattern:-2), "CGCursorIsVisible").map { unsafeBitCast($0, to: (@convention(c) () -> UInt32).self) }

func emit(_ data: [String:Any]) {
    print(String(data:try! JSONSerialization.data(withJSONObject:data,options:.sortedKeys),encoding:.utf8)!)
    fflush(stdout)
}
func snapshot() -> [String:Any] {
    let p=CGEvent(source:nil)!.location
    let front=NSWorkspace.shared.frontmostApplication
    return ["cursor":[Double(p.x),Double(p.y)],"frontPid":Int(front?.processIdentifier ?? -1),"frontName":front?.localizedName ?? "", "cursorVisible":cursorProbe?() ?? 2]
}
let args=CommandLine.arguments
guard (args.count==4 || args.count==6),["move","click","release"].contains(args[1]),let x=Double(args[2]),let y=Double(args[3]),AXIsProcessTrusted() else {
    emit(["error":"Usage: background-item-input move|click windowX windowY; accessibility permission required"]);exit(2)
}
let windows=CGWindowListCopyWindowInfo(.optionAll,kCGNullWindowID) as? [[String:Any]] ?? []
guard let w=windows.first(where:{ ($0[kCGWindowName as String] as? String)=="MapleStory" && ($0[kCGWindowOwnerName as String] as? String ?? "").contains("MapleStory") }),
      let bounds=w[kCGWindowBounds as String] as? [String:Double],let pid=w[kCGWindowOwnerPID as String] as? Int32,
      let wid=w[kCGWindowNumber as String] as? Int,let width=bounds["Width"],let height=bounds["Height"],let ox=bounds["X"],let oy=bounds["Y"],
      x>=0,x<width,y>=28,y<height else {emit(["error":"Game window missing or point outside client area"]);exit(3)}
let before=snapshot()
if args.count==6 && (Double(args[4]) != width || Double(args[5]) != height) {
    emit(["error":"Window resized since capture"]);exit(3)
}
guard (before["frontPid"] as? Int) != Int(pid),
      !CGEventSource.buttonState(.combinedSessionState,button:.left),
      !CGEventSource.buttonState(.combinedSessionState,button:.right) else {
    emit(["error":"Requires background game and no held mouse buttons"]);exit(4)
}
emit(["phase":"before","state":before,"pid":pid,"windowId":wid,"windowPoint":[x,y],"screenPoint":[ox+x,oy+y]])
func post(_ type:NSEvent.EventType,_ flags:NSEvent.ModifierFlags=[]) {
    let native=NSEvent.mouseEvent(with:type,location:NSPoint(x:x,y:height-y),modifierFlags:flags,
        timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:wid,context:nil,eventNumber:0,
        clickCount:type == .leftMouseDragged ? 0 : 1,pressure:type == .leftMouseDown ? 1 : 0)!
    let event=native.cgEvent!
    event.location=CGPoint(x:ox+x,y:oy+y)
    event.setIntegerValueField(.mouseEventWindowUnderMousePointer,value:Int64(wid))
    event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent,value:Int64(wid))
    event.postToPid(pid)
}
// Release Wine's mouse ownership using the real pointer position. A synthetic drag otherwise leaves
// lastTargetWindow set to the game, allowing Wine to hide the macOS cursor over another app.
func releasePointer() {
    if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { return }
    let point=CGEvent(source:nil)!.location
    // Associate the event with the game so AppKit actually delivers it in the background.
    // Wine routes mouseMoved using the topmost window at point instead of the associated window.
    // A windowless CGEvent (or windowless drag) is discarded and does not release cursor ownership.
    guard let native=NSEvent.mouseEvent(with:.mouseMoved,location:NSPoint(x:point.x-ox,y:height-(point.y-oy)),modifierFlags:[],timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:wid,context:nil,eventNumber:0,clickCount:0,pressure:0),let event=native.cgEvent else { return }
    event.location=point
    event.setIntegerValueField(.mouseEventWindowUnderMousePointer,value:0)
    event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent,value:0)
    event.postToPid(pid)
}
// Wine routes ordinary mouseMoved by the topmost window at the screen point.
// A window-associated drag event routes directly; no button is held or pressed.
if args[1] != "release" { post(.leftMouseDragged) }
usleep(50000)
// postToPid never warps the system pointer. Ordinary pointer movement or switching between
// other apps is not a capture failure. Stop only if the user starts interacting with the game.
guard NSWorkspace.shared.frontmostApplication?.processIdentifier != pid else {releasePointer();emit(["error":"Game became foreground after move","state":snapshot()]);exit(5)}
if args[1]=="click" {
    // Command-modified native click prevents the background window being raised.
    // This sets only event flags; no Command keydown/keyup is sent.
    post(.leftMouseDown,[.command]);usleep(80000)
    post(.leftMouseUp,[.command]) // Always release the synthetic button pair.
    emit(["phase":"clicked","at":Date().timeIntervalSince1970*1000])
}
for delay in [UInt32(10000),90000,200000] {
    usleep(delay)
    releasePointer();usleep(20000)
    let now=snapshot();emit(["phase":"after","state":now])
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier != pid else {releasePointer();emit(["error":"Game became foreground"]);exit(5)}
    if (before["cursorVisible"] as? UInt32)==1 && (now["cursorVisible"] as? UInt32)==0 {
        // Editors intentionally hide the cursor when the user types. That is user activity,
        // not a collector failure, and must not permanently disable option capture.
        if CGEventSource.secondsSinceLastEventType(.combinedSessionState,eventType:.keyDown)<1 {
            releasePointer();emit(["phase":"user_typing","state":now]);continue
        }
        // Wine processes cursor ownership asynchronously. A single 20ms probe
        // can precede its release event. Verify recovery before accepting the
        // operation; a cursor that stays hidden still stops option collection.
        var restored=false
        for _ in 0..<5 {
            releasePointer();usleep(50000)
            let state=snapshot();emit(["phase":"restore","state":state])
            guard NSWorkspace.shared.frontmostApplication?.processIdentifier != pid else {emit(["error":"Game became foreground during release"]);exit(5)}
            if (state["cursorVisible"] as? UInt32)==1 {restored=true;break}
        }
        if restored {continue}
        releasePointer();emit(["error":"Cursor became hidden","state":snapshot()]);exit(6)
    }
}
emit(["result":"events_posted_game_stayed_background","note":"Confirm the intended UI result in a fresh game-window capture"])
