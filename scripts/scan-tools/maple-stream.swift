// Keeps ONE screen-capture stream open on the largest MapleStory window and writes its newest frame (PNG, at most one a
// second) to the path given as the first argument. Starting `screencapture` every tick opened and closed a capture
// session each time, which kept macOS's systemstatusd (the screen-recording indicator) at a full CPU core; one stream
// that stays open does not. The window may be covered by other windows. Built once by mega-collector.mjs with swiftc.
// Exits when: stdin closes (the collector went away), the window is gone (3), the stream stops (1) or the window was
// resized so frames no longer match the game's pixels (2). The collector starts it again.
import Foundation
import ScreenCaptureKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/gms-mega-shot.png"
func fail(_ why: String, _ code: Int32) -> Never { FileHandle.standardError.write("maple-stream: \(why)\n".data(using: .utf8)!); exit(code) }

final class Camera: NSObject, SCStreamOutput, SCStreamDelegate {
  var stream: SCStream?
  var width = 0, height = 0

  func start() async {
    guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false) else { fail("no screen recording permission", 1) }
    let games = content.windows.filter { ($0.owningApplication?.applicationName ?? "").contains("MapleStory") }
    guard let window = games.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }), window.frame.width > 200 else { fail("MapleStory window not found", 3) }
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let config = SCStreamConfiguration()
    width = Int((filter.contentRect.width * CGFloat(filter.pointPixelScale)).rounded())
    height = Int((filter.contentRect.height * CGFloat(filter.pointPixelScale)).rounded())
    config.width = width
    config.height = height
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = true
    config.scalesToFit = false
    config.queueDepth = 3
    let s = SCStream(filter: filter, configuration: config, delegate: self)
    do {
      try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "frames"))
      try await s.startCapture()
    } catch { fail("could not start: \(error.localizedDescription)", 1) }
    stream = s
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, let pixels = sample.imageBuffer,
          let info = (CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
          let raw = info[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
    // A resized window is scaled into the old frame size; the chat font is read pixel by pixel, so start over.
    if let scale = info[.contentScale] as? Double, abs(scale - 1) > 0.001 { fail("window resized", 2) }
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(pixels), width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels),
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
          let image = context.makeImage() else { return }
    let part = URL(fileURLWithPath: out + ".part")
    guard let file = CGImageDestinationCreateWithURL(part as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(file, image, nil)
    if CGImageDestinationFinalize(file) { rename(part.path, out) }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) { fail("stream stopped: \(error.localizedDescription)", 1) }
}

_ = CGMainDisplayID() // a command-line tool has to open its window-server connection before ScreenCaptureKit is used
let camera = Camera()
Task { await camera.start() }
// The collector holds our stdin open; when it exits (however it exits) the read ends and so do we.
Thread.detachNewThread { while FileHandle.standardInput.availableData.count > 0 {}; exit(0) }
RunLoop.main.run()
