// Verified with MapleStory Classic World on macOS, 2026-11-20.
// Usage: background-item-input move|click|release <window-image-x> <window-image-y>
// Coordinates include the title bar, as in a shadow-free window capture.
// Background: never activates an app, posts globally, warps the pointer, or injects code.
// Foreground (game in front): moves the real pointer only while the owner is idle, then puts it back.
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
// ---- Foreground mode: the game is the front app (the owner is looking at it) ----
// Wine follows the real pointer while the game is in front, so window-targeted events are not enough.
// Act only after the owner has left mouse and keyboard alone for a while, move the real pointer to the
// link, click, keep it there long enough for the tooltip frame, then put the pointer back where it was.
// Any real (hardware) input during that time aborts at once and leaves the pointer to the owner.
if (before["frontPid"] as? Int) == Int(pid) {
    // Posted mouse events reset the system's mouse idle timers too, so the owner's mouse is judged by the
    // pointer position instead: unchanged since our last foreground action, or no mouse event for 2 s.
    // Keyboard timers are only touched by real typing (we never post keys).
    let stateFile=(NSTemporaryDirectory() as NSString).appendingPathComponent("gms-maple-input-fg.json")
    func since(_ t:CGEventType) -> Double { CGEventSource.secondsSinceLastEventType(.hidSystemState,eventType:t) }
    let mouseTypes:[CGEventType]=[.mouseMoved,.leftMouseDown,.rightMouseDown,.leftMouseDragged,.rightMouseDragged,.scrollWheel]
    let keyIdle=min(since(.keyDown),since(.flagsChanged))
    let mouseIdle=mouseTypes.map(since).min() ?? 0
    let home=CGEvent(source:nil)!.location
    var mineLast=false
    if let d=try? Data(contentsOf:URL(fileURLWithPath:stateFile)),
       let j=try? JSONSerialization.jsonObject(with:d) as? [String:Double],
       let t=j["t"],let hx=j["x"],let hy=j["y"] {
        let ago=Date().timeIntervalSince1970-t
        // the newest mouse event is our own return glide, and the pointer is still where we left it
        mineLast = mouseIdle >= ago-0.15 && abs(hx-home.x)<1 && abs(hy-home.y)<1
    }
    guard keyIdle>=2.0, mouseIdle>=2.0 || mineLast,
          !CGEventSource.buttonState(.hidSystemState,button:.left),
          !CGEventSource.buttonState(.hidSystemState,button:.right) else {
        emit(["error":"Owner is using the game (foreground, recent input)","keyIdle":keyIdle,"mouseIdle":mouseIdle]);exit(4)
    }
    let src=CGEventSource(stateID:.privateState)
    let target=CGPoint(x:ox+x,y:oy+y)
    var at=home
    let started=Date()
    // The owner took over if the pointer is not where we put it, or they typed since we started.
    func ownerMoved() -> Bool {
        let p=CGEvent(source:nil)!.location
        return abs(p.x-at.x)>2 || abs(p.y-at.y)>2 || min(since(.keyDown),since(.flagsChanged)) < Date().timeIntervalSince(started)
    }
    func send(_ type:CGEventType,_ p:CGPoint) {
        guard let e=CGEvent(mouseEventSource:src,mouseType:type,mouseCursorPosition:p,mouseButton:.left) else { return }
        e.setIntegerValueField(.mouseEventDeltaX,value:Int64((p.x-at.x).rounded()))
        e.setIntegerValueField(.mouseEventDeltaY,value:Int64((p.y-at.y).rounded()))
        if type == .leftMouseDown || type == .leftMouseUp { e.setIntegerValueField(.mouseEventClickState,value:1) }
        e.post(tap:.cghidEventTap)
        at=p
    }
    // A few small steps with movement deltas: Wine ignores a jump without them.
    func glide(_ to:CGPoint) -> Bool {
        let from=at, n=max(4,min(10,Int(hypot(to.x-from.x,to.y-from.y)/60)))
        for i in 1...n {
            if ownerMoved() { return false }
            let f=Double(i)/Double(n), e=f*f*(3-2*f)
            send(.mouseMoved,CGPoint(x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e)); usleep(6000)
        }
        return true
    }
    func remember() {
        let j=["t":Date().timeIntervalSince1970,"x":Double(at.x),"y":Double(at.y)]
        try? JSONSerialization.data(withJSONObject:j).write(to:URL(fileURLWithPath:stateFile))
    }
    func giveBack(_ reason:String) -> Never { try? FileManager.default.removeItem(atPath:stateFile); emit(["error":reason,"mode":"foreground","state":snapshot()]); exit(5) }
    emit(["phase":"before","mode":"foreground","state":before,"pid":pid,"windowId":wid,"windowPoint":[x,y],"screenPoint":[target.x,target.y]])
    guard glide(target) else { giveBack("Owner moved the mouse") }
    usleep(60000)
    if args[1]=="click" {
        guard !ownerMoved() else { giveBack("Owner moved the mouse") }
        send(.leftMouseDown,target); usleep(70000)
        send(.leftMouseUp,target)                         // always release the button we pressed
        // In front the panel fades in; report the click a little later so the grabbed frame shows it fully.
        usleep(250000)
        emit(["phase":"clicked","at":Date().timeIntervalSince1970*1000,"mode":"foreground"])
        usleep(650000)                                    // the collector grabs the tooltip frame meanwhile
    } else {
        usleep(150000)
    }
    // Put the pointer back where the owner left it, unless they already took it.
    if ownerMoved() { giveBack("Owner moved the mouse") }
    _ = glide(home)
    remember()
    emit(["phase":"after","state":snapshot(),"mode":"foreground"])
    emit(["result":"events_posted_game_foreground","note":"Pointer returned to where the owner left it"])
    exit(0)
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
