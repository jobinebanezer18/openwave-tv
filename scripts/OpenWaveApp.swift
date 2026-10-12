import AppKit
import Foundation
import Sparkle
import WebKit

final class OpenWaveAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var server: Process?
    private var localURL: URL?
    private var quitting = false
    private var playerFullscreen = false
    private let buildVersion = Bundle.main.object(forInfoDictionaryKey: "OpenWaveBuildVersion") as? String ?? "dev"
    private lazy var updaterController = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        _ = updaterController
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.startLocalServer()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        if let server, server.isRunning { server.terminate() }
    }

    private func statusAvailable(on port: Int) -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/status") else { return false }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 0.7
        let session = URLSession(configuration: config)
        let semaphore = DispatchSemaphore(value: 0)
        let lock = NSLock()
        let expectedMarker = "openwave-tv-local-v1:\(buildVersion)"
        var available = false
        let task = session.dataTask(with: url) { data, response, _ in
            lock.lock()
            available = (response as? HTTPURLResponse)?.statusCode == 200 &&
                data.flatMap { String(data: $0, encoding: .utf8) } == expectedMarker
            lock.unlock()
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 1)
        task.cancel()
        session.invalidateAndCancel()
        lock.lock()
        let result = available
        lock.unlock()
        return result
    }

    private func startLocalServer() {
        guard let executable = Bundle.main.resourceURL?.appendingPathComponent("openwave-server") else {
            showStartupError()
            return
        }
        for port in 8765...8769 {
            if statusAvailable(on: port) {
                showGuide(on: port)
                return
            }
            let process = Process()
            process.executableURL = executable
            process.arguments = ["-no-browser", "-addr", "127.0.0.1:\(port)"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            do { try process.run() }
            catch { continue }
            for _ in 0..<40 {
                if statusAvailable(on: port) {
                    server = process
                    process.terminationHandler = { [weak self] _ in
                        DispatchQueue.main.async {
                            guard let self, !self.quitting else { return }
                            NSApp.terminate(nil)
                        }
                    }
                    showGuide(on: port)
                    return
                }
                if !process.isRunning { break }
                Thread.sleep(forTimeInterval: 0.1)
            }
            if process.isRunning { process.terminate() }
        }
        showStartupError()
    }

    private func showGuide(on port: Int) {
        guard let url = URL(string: "http://127.0.0.1:\(port)/") else { showStartupError(); return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.localURL = url
            let configuration = WKWebViewConfiguration()
            configuration.mediaTypesRequiringUserActionForPlayback = []
            configuration.userContentController.addUserScript(WKUserScript(
                source: "window.__OPENWAVE_NATIVE__ = true;",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
            configuration.userContentController.add(self, name: "openwaveFullscreen")
            configuration.userContentController.add(self, name: "openwaveUpdates")
            let view = WKWebView(frame: .zero, configuration: configuration)
            view.navigationDelegate = self
            view.uiDelegate = self
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "OpenWave TV"
            window.minSize = NSSize(width: 1024, height: 700)
            window.center()
            window.contentView = view
            window.delegate = self
            self.webView = view
            self.window = window
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            view.load(URLRequest(url: url))
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "openwaveUpdates", message.body as? String == "settings" {
            showUpdateSettings()
            return
        }
        guard message.name == "openwaveFullscreen", message.body as? String == "toggle", let window else { return }
        playerFullscreen = !window.styleMask.contains(.fullScreen)
        window.toggleFullScreen(nil)
    }

    func windowDidEnterFullScreen(_ notification: Notification) {
        syncPlayerFullscreen(playerFullscreen)
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        playerFullscreen = false
        syncPlayerFullscreen(false)
    }

    private func syncPlayerFullscreen(_ enabled: Bool) {
        webView?.evaluateJavaScript("document.documentElement.classList.toggle('native-theater', \(enabled)); window.dispatchEvent(new Event('openwave-native-fullscreenchange'));", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("document.querySelector('#updates-button')?.setAttribute('title', 'Update settings and check now');", completionHandler: nil)
    }

    private func showUpdateSettings() {
        guard let window else { return }
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "OpenWave TV updates"
        alert.informativeText = "Version \(buildVersion) is installed. Updates are downloaded and installed in the app."
        alert.addButton(withTitle: "Check now")
        alert.addButton(withTitle: "Done")
        let automaticChecks = NSButton(checkboxWithTitle: "Check for updates automatically", target: nil, action: nil)
        automaticChecks.state = updaterController.updater.automaticallyChecksForUpdates ? .on : .off
        let automaticInstall = NSButton(checkboxWithTitle: "Download and install updates automatically", target: nil, action: nil)
        automaticInstall.state = updaterController.updater.automaticallyDownloadsUpdates ? .on : .off
        let options = NSStackView(views: [automaticChecks, automaticInstall])
        options.orientation = .vertical
        options.alignment = .leading
        options.spacing = 8
        options.frame = NSRect(x: 0, y: 0, width: 330, height: 50)
        alert.accessoryView = options
        alert.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            let checksEnabled = automaticChecks.state == .on || automaticInstall.state == .on
            self.updaterController.updater.automaticallyChecksForUpdates = checksEnabled
            self.updaterController.updater.automaticallyDownloadsUpdates = automaticInstall.state == .on
            if response == .alertFirstButtonReturn {
                self.updaterController.checkForUpdates(nil)
            }
        }
    }

    private func showStartupError() {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText = "OpenWave TV could not start"
            alert.informativeText = "Its local server could not open a port. Close other OpenWave copies and try again."
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "127.0.0.1" && url.port == localURL?.port {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}

@main struct OpenWaveApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = OpenWaveAppDelegate()
        app.delegate = delegate
        app.run()
    }
}
