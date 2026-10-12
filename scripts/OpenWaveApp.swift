import AppKit
import Foundation
import WebKit

final class OpenWaveAppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var server: Process?
    private var localURL: URL?
    private var quitting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
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
        var available = false
        let task = session.dataTask(with: url) { data, response, _ in
            lock.lock()
            available = (response as? HTTPURLResponse)?.statusCode == 200 &&
                data.flatMap { String(data: $0, encoding: .utf8) } == "openwave-tv-local-v1"
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
            window.minSize = NSSize(width: 760, height: 540)
            window.center()
            window.contentView = view
            self.webView = view
            self.window = window
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            view.load(URLRequest(url: url))
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
