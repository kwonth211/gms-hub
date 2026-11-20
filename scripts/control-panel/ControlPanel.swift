import SwiftUI
import AppKit

struct Status: Decodable {
    var message = "상태를 확인하고 있습니다…"
    var error = false
    var shop_running = false
    var mega_running = false
    var options_paused = false
    var shop_log = ""
    var mega_log = ""
}

@MainActor final class PanelModel: ObservableObject {
    @Published var status = Status()
    @Published var busy = false
    @Published var logTab = 0
    private var timer: Timer?
    private var polling = false
    private let bridge = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("gms-hub/scripts/control-panel/control.py").path

    init() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    nonisolated static func execute(_ bridge: String, _ arguments: [String]) throws -> Data {
        let process = Process(), pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [bridge] + arguments
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = environment
        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        if process.terminationStatus != 0 { throw CocoaError(.executableRuntimeMismatch) }
        return data
    }

    func refresh() {
        guard !polling else { return }
        polling = true
        let path = bridge
        Task {
            do {
                let data = try await Task.detached { try Self.execute(path, ["status"]) }.value
                status = try JSONDecoder().decode(Status.self, from: data)
            } catch {
                status.message = "실행 상태를 읽지 못했습니다. 설치 경로를 확인해 주세요."
                status.error = true
            }
            polling = false
        }
    }

    func run(_ arguments: [String], log: Int) {
        guard !busy else { return }
        busy = true; logTab = log
        status.message = "요청을 처리하고 있습니다…"
        let path = bridge
        Task {
            do { _ = try await Task.detached { try Self.execute(path, arguments) }.value }
            catch { status.message = "실행하지 못했습니다. 아래 기록을 확인해 주세요."; status.error = true }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            busy = false
            refresh()
        }
    }

    func openLog() {
        let name = logTab == 0 ? "shop-control.log" : "mega-collector.log"
        let file = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("gms-hub-samples/" + name)
        if FileManager.default.fileExists(atPath: file.path) { NSWorkspace.shared.open(file) }
    }
}

struct ControlPanel: View {
    @StateObject private var model = PanelModel()
    private let accent = Color(red: 0.22, green: 0.69, blue: 0.62)

    func badge(_ running: Bool, text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(running ? accent : Color.secondary.opacity(0.45)).frame(width: 6, height: 6)
            Text(text).font(.system(size: 11, weight: .medium))
        }.padding(.horizontal, 9).padding(.vertical, 5)
            .background(running ? accent.opacity(0.12) : Color.primary.opacity(0.05), in: Capsule())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "leaf.fill").font(.system(size: 25)).foregroundStyle(accent)
                    .frame(width: 48, height: 48).background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text("GMS Hub").font(.system(size: 25, weight: .bold, design: .rounded))
                    Text("상점과 고확 수집을 한 곳에서").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Text("CONTROL PANEL").font(.system(size: 9, weight: .semibold, design: .monospaced)).tracking(1.5).foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("상점 관리", systemImage: "storefront").font(.system(size: 16, weight: .semibold))
                    Spacer()
                    badge(model.status.shop_running, text: model.status.shop_running ? "작업 중" : "대기 중")
                }
                Text("상점과 가방 창을 열어 두세요. 시트 가격으로 주문서를 등록합니다.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Button { model.run(["shop-start", "list"], log: 0) } label: { Label("상점 올리기", systemImage: "cart.badge.plus") }
                        .buttonStyle(.borderedProminent).tint(accent)
                        .disabled(model.busy || model.status.shop_running)
                    Button("메소·판매 내역") { model.run(["shop-start", "sold"], log: 0) }
                        .disabled(model.busy || model.status.shop_running)
                    Button("팔린 아이템 정리") { model.run(["shop-start", "grey"], log: 0) }
                        .disabled(model.busy || model.status.shop_running)
                    Spacer(minLength: 0)
                    Button { model.run(["shop-stop"], log: 0) } label: { Image(systemName: "stop.fill") }
                        .help("상점 작업 중지").disabled(model.busy || !model.status.shop_running)
                }.controlSize(.large)
                Text("상점 작업 중에는 마우스를 사용하지 마세요. 직접 움직이면 작업이 중단됩니다.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }.padding(18).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("고확 수집", systemImage: "megaphone").font(.system(size: 16, weight: .semibold))
                    Spacer()
                    badge(model.status.mega_running, text: model.status.mega_running ? "수집 중" : "중지됨")
                }
                Text("노란색·파란색 고확의 아이템 옵션을 함께 수집합니다.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    Button { model.run(["mega-start"], log: 1) } label: { Label("고확 수집 시작", systemImage: "play.fill") }
                        .buttonStyle(.borderedProminent).tint(accent)
                        .disabled(model.busy || model.status.mega_running || model.status.shop_running)
                    Button { model.run(["mega-stop"], log: 1) } label: { Label("수집 중지", systemImage: "stop.fill") }
                        .disabled(model.busy || !model.status.mega_running)
                    Spacer()
                    Text(model.status.options_paused ? "옵션 클릭 일시 중지" : "게임 플레이 중 옵션 클릭 중지")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                }.controlSize(.large)
            }.padding(18).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14))

            HStack(spacing: 8) {
                if model.busy { ProgressView().controlSize(.small) }
                else { Image(systemName: model.status.error ? "exclamationmark.circle" : "checkmark.circle").foregroundStyle(model.status.error ? Color.orange : accent) }
                Text(model.status.message).font(.system(size: 12)).lineLimit(2).textSelection(.enabled)
                Spacer()
            }.frame(minHeight: 20)

            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Picker("실행 기록", selection: $model.logTab) {
                        Text("상점 기록").tag(0)
                        Text("고확 기록").tag(1)
                    }.pickerStyle(.segmented).frame(width: 185)
                    Spacer()
                    Button("전체 기록 열기") { model.openLog() }.buttonStyle(.link).font(.system(size: 11))
                }
                ScrollView {
                    Text((model.logTab == 0 ? model.status.shop_log : model.status.mega_log).isEmpty ? "아직 실행 기록이 없습니다." : (model.logTab == 0 ? model.status.shop_log : model.status.mega_log))
                        .font(.system(size: 10, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                }.frame(height: 122).background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 10))
            }
            Text("창을 닫아도 실행 중인 작업은 계속됩니다. 멈추려면 중지 버튼을 눌러 주세요.")
                .font(.system(size: 10)).foregroundStyle(.secondary)
        }.padding(24).frame(width: 650)
            .background(Color(nsColor: .windowBackgroundColor))
            .onAppear { model.logTab = model.status.mega_running ? 1 : 0 }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main struct GMSHubControl: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        Window("GMS Hub · 상점 & 고확", id: "main") {
            ControlPanel()
        }.windowResizability(.contentSize).defaultPosition(.center)
    }
}
