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
// Areas the collector must never press or drag in (the owner's shop window: CLOSE/LEAVE STORE).
// GMS_FORBID="x,y,w,h;x,y,w,h" in window coordinates. Any action aimed inside one is refused outright.
let forbid:[CGRect]=(ProcessInfo.processInfo.environment["GMS_FORBID"] ?? "").split(separator:";").compactMap{
    let v=$0.split(separator:",").compactMap{Double($0)}; return v.count==4 ? CGRect(x:v[0],y:v[1],width:v[2],height:v[3]) : nil }
func forbidden(_ px:Double,_ py:Double) -> Bool { forbid.contains{ $0.contains(CGPoint(x:px,y:py)) } }
if forbidden(x,y) { emit(["error":"Point is inside a no-input area (shop window)","point":[x,y]]); exit(7) }
// GMS_ALLOW="x,y,w,h": a click may only press inside this area (the chat box). Required for every click.
let allowV=(ProcessInfo.processInfo.environment["GMS_ALLOW"] ?? "").split(separator:",").compactMap{Double($0)}
let allow:CGRect?=allowV.count==4 ? CGRect(x:allowV[0],y:allowV[1],width:allowV[2],height:allowV[3]) : nil
func pressAllowed(_ px:Double,_ py:Double) -> Bool { allow.map{ $0.contains(CGPoint(x:px,y:py)) } ?? false }
if args[1]=="click" && !pressAllowed(x,y) { emit(["error":"Click outside the allowed area (chat box only)","point":[x,y]]); exit(7) }
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
    var at=home, prev=home, trail=[home]
    let started=Date()
    // The owner took over if the pointer is away from every point we posted this run (the reported location
    // can lag several posted events), or they typed since we started.
    func ownerMoved() -> Bool {
        let p=CGEvent(source:nil)!.location
        let near=trail.contains{abs(p.x-$0.x)<=8 && abs(p.y-$0.y)<=8}
        let onPath=zip(trail,trail.dropFirst()).contains{ a,b in
            let dx=b.x-a.x,dy=b.y-a.y,l=max(1,dx*dx+dy*dy),t=max(0,min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l))
            return hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy))<=8 }
        return (!near && !onPath) || min(since(.keyDown),since(.flagsChanged)) < Date().timeIntervalSince(started)
    }
    func send(_ type:CGEventType,_ p:CGPoint) {
        if type != .mouseMoved && forbidden(Double(p.x-ox),Double(p.y-oy)) { return }
        if (type == .leftMouseDown || type == .leftMouseUp) && !pressAllowed(Double(p.x-ox),Double(p.y-oy)) { return }
        guard let e=CGEvent(mouseEventSource:src,mouseType:type,mouseCursorPosition:p,mouseButton:.left) else { return }
        e.setIntegerValueField(.mouseEventDeltaX,value:Int64((p.x-at.x).rounded()))
        e.setIntegerValueField(.mouseEventDeltaY,value:Int64((p.y-at.y).rounded()))
        if type == .leftMouseDown || type == .leftMouseUp { e.setIntegerValueField(.mouseEventClickState,value:1) }
        e.post(tap:.cghidEventTap)
        prev=at; at=p; trail.append(p)
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
    usleep(25000)
    if args[1]=="click" {
        guard !ownerMoved() else { giveBack("Owner moved the mouse") }
        send(.leftMouseDown,target)
        // the frame at this moment proves which chat row was under the pointer when it was pressed
        emit(["phase":"pressed","at":Date().timeIntervalSince1970*1000,"mode":"foreground"])
        usleep(70000)
        send(.leftMouseUp,target)                         // always release the button we pressed
        // In front the panel fades in; report the click a little later so the grabbed frame shows it fully.
        usleep(250000)
        emit(["phase":"clicked","at":Date().timeIntervalSince1970*1000,"mode":"foreground"])
        usleep(380000)                                    // the collector grabs the tooltip frame meanwhile (+200 ms)
        // Close the panel: it only closes while the pointer moves inside the game window (top-right corner).
        if ownerMoved() { giveBack("Owner moved the mouse") }
        guard glide(CGPoint(x:ox+width-40,y:oy+40)) else { giveBack("Owner moved the mouse") }
        usleep(80000)
    } else {
        usleep(120000)                                    // park: the panel closes only while the pointer moves inside the game
    }
    // Put the pointer back where the owner left it, unless they already took it. After a click the panel stays
    // open (the owner's spot may be outside the game window), so the collector sends a park move next.
    // The owner asked (2026-11-21): no trip back to where the pointer was. It stays at our corner spot (one move per click).
    if ownerMoved() { giveBack("Owner moved the mouse") }
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
// If the real pointer rests over a visible part of the game window, Wine follows it and ignores the
// window-targeted events below (measured 2026-11-21: 0% captures until the pointer left the game window).
// When the owner is idle, move the pointer just outside the game window first and leave it there.
func topmostPid(_ p:CGPoint) -> Int32? {
    let list=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    for w in list {
        guard (w[kCGWindowLayer as String] as? Int ?? 1)==0,let b=w[kCGWindowBounds as String] as? [String:Double],
              let bx=b["X"],let by=b["Y"],let bw=b["Width"],let bh=b["Height"] else { continue }
        if p.x>=bx && p.x<bx+bw && p.y>=by && p.y<by+bh { return w[kCGWindowOwnerPID as String] as? Int32 }
    }
    return nil
}
let pointerNow=CGEvent(source:nil)!.location
if topmostPid(pointerNow)==pid {
    func since(_ t:CGEventType) -> Double { CGEventSource.secondsSinceLastEventType(.hidSystemState,eventType:t) }
    let keyIdle=min(since(.keyDown),since(.flagsChanged))
    let mouseIdle=[CGEventType.mouseMoved,.leftMouseDown,.rightMouseDown,.leftMouseDragged,.scrollWheel].map(since).min() ?? 0
    guard keyIdle>=2.0, mouseIdle>=2.0 else { emit(["error":"Pointer over the game window and the owner is active","mouseIdle":mouseIdle]);exit(4) }
    var displays=[CGDirectDisplayID](repeating:0,count:8);var n:UInt32=0
    CGGetActiveDisplayList(8,&displays,&n)
    let screens=displays.prefix(Int(n)).map{CGDisplayBounds($0)}
    let cands=[CGPoint(x:ox-30,y:pointerNow.y),CGPoint(x:ox+width+30,y:pointerNow.y),CGPoint(x:pointerNow.x,y:oy+height+30),CGPoint(x:pointerNow.x,y:oy-30)]
    guard let spot=cands.first(where:{ c in screens.contains{ $0.contains(c) } && topmostPid(c) != pid }) else {
        emit(["error":"Pointer over the game window and no spot outside it"]);exit(4)
    }
    let src=CGEventSource(stateID:.privateState)
    var at=pointerNow
    for i in 1...6 {
        let f=Double(i)/6, e=f*f*(3-2*f), q=CGPoint(x:pointerNow.x+(spot.x-pointerNow.x)*e,y:pointerNow.y+(spot.y-pointerNow.y)*e)
        if let ev=CGEvent(mouseEventSource:src,mouseType:.mouseMoved,mouseCursorPosition:q,mouseButton:.left) {
            ev.setIntegerValueField(.mouseEventDeltaX,value:Int64((q.x-at.x).rounded()));ev.setIntegerValueField(.mouseEventDeltaY,value:Int64((q.y-at.y).rounded()))
            ev.post(tap:.cghidEventTap)
        }
        at=q;usleep(6000)
    }
    emit(["phase":"pointer_moved_off_game","from":[pointerNow.x,pointerNow.y],"to":[spot.x,spot.y]])
    usleep(80000)
}
func post(_ type:NSEvent.EventType,_ flags:NSEvent.ModifierFlags=[],at px:Double=x,_ py:Double=y) {
    if forbidden(px,py) { emit(["phase":"skipped_forbidden","point":[px,py]]); return }
    if (type == .leftMouseDown || type == .leftMouseUp) && !pressAllowed(px,py) { emit(["phase":"skipped_outside_allowed","point":[px,py]]); return }
    let native=NSEvent.mouseEvent(with:type,location:NSPoint(x:px,y:height-py),modifierFlags:flags,
        timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:wid,context:nil,eventNumber:0,
        clickCount:type == .leftMouseDragged ? 0 : 1,pressure:type == .leftMouseDown ? 1 : 0)!
    let event=native.cgEvent!
    event.location=CGPoint(x:ox+px,y:oy+py)
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
// Real-cursor check (2026-11-22, the owner's shop kept closing): a background press lands wherever the GAME's own
// pointer is, not where we aimed. If the move above is dropped, the press would hit whatever is under the game's
// pointer (LEAVE STORE included). So before pressing, look at the window itself: the game draws its hand cursor,
// and it must have just appeared exactly at our point. No hand there -> no press. Costs ~10 ms per look.
typealias CapFn = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
let capFn:CapFn?=dlsym(dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",RTLD_NOW),"CGWindowListCreateImage").map{unsafeBitCast($0,to:CapFn.self)}
func grab(_ rx:Double,_ ry:Double,_ rw:Int,_ rh:Int) -> [UInt8]? {
    guard let capFn, let img=capFn(CGRect(x:ox+rx,y:oy+ry,width:Double(rw),height:Double(rh)),8,UInt32(wid),1|16)?.takeRetainedValue(),
          let ctx=CGContext(data:nil,width:rw,height:rh,bitsPerComponent:8,bytesPerRow:rw*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.draw(img,in:CGRect(x:0,y:0,width:rw,height:rh))
    return Array(UnsafeBufferPointer(start:ctx.data!.assumingMemoryBound(to:UInt8.self),count:rw*rh*4))
}
// Newly appeared near-white pixels (the glove) in a 28x32 box around the tip, against the same box before the move.
func gloveScore(_ a:[UInt8],_ c:[UInt8]) -> Int {
    var n=0
    for i in stride(from:0,to:min(a.count,c.count),by:4) {
        let d=abs(Int(a[i])-Int(c[i]))+abs(Int(a[i+1])-Int(c[i+1]))+abs(Int(a[i+2])-Int(c[i+2]))
        if d>60 && c[i]>200 && c[i+1]>200 && c[i+2]>200 { n+=1 }
    }
    return n
}
let gloveBox=(x:x-4,y:y-6,w:28,h:32), ctrlBox=(x:x-48,y:y-6,w:28,h:32)
let gloveBefore=args[1]=="click" ? grab(gloveBox.x,gloveBox.y,gloveBox.w,gloveBox.h) : nil
let ctrlBefore=args[1]=="click" ? grab(ctrlBox.x,ctrlBox.y,ctrlBox.w,ctrlBox.h) : nil
if args[1] != "release" { post(.leftMouseDragged) }
usleep(50000)
// postToPid never warps the system pointer. Ordinary pointer movement or switching between
// other apps is not a capture failure. Stop only if the user starts interacting with the game.
guard NSWorkspace.shared.frontmostApplication?.processIdentifier != pid else {releasePointer();emit(["error":"Game became foreground after move","state":snapshot()]);exit(5)}
if args[1]=="click" {
    // Press only once the game's own hand cursor is seen sitting on our point (see grab above).
    guard let gb=gloveBefore, let cb=ctrlBefore else { emit(["error":"Cannot see the game cursor (capture failed); no press"]); exit(8) }
    var seen=false, last=0, ctrl=0
    for _ in 0..<40 {                                     // up to ~0.5 s; usually ~0.1 s
        guard let g=grab(gloveBox.x,gloveBox.y,gloveBox.w,gloveBox.h), let c=grab(ctrlBox.x,ctrlBox.y,ctrlBox.w,ctrlBox.h) else { break }
        last=gloveScore(gb,g); ctrl=gloveScore(cb,c)
        if last>=40 && ctrl<20 { seen=true; break }
        usleep(12000)
    }
    guard seen else { releasePointer(); emit(["error":"Game cursor not at the target; no press","glove":last,"control":ctrl]); exit(8) }
    emit(["phase":"cursor_verified","glove":last])
    // Command-modified native click prevents the background window being raised.
    // This sets only event flags; no Command keydown/keyup is sent.
    post(.leftMouseDown,[.command])
    emit(["phase":"pressed","at":Date().timeIntervalSince1970*1000])
    usleep(80000)
    post(.leftMouseUp,[.command]) // Always release the synthetic button pair.
    emit(["phase":"clicked","at":Date().timeIntervalSince1970*1000])
    // Keep the panel up while the collector grabs it (+125 ms), then move the game pointer to the top-right
    // corner, which closes the panel, in the same run instead of a separate park move.
    usleep(320000)
    post(.leftMouseDragged,at:width-40,40)
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
