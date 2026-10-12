import AppKit
import Foundation
import WebKit

private struct UpdateVersion: Comparable {
    let numbers: [Int]
    let beta: Int?

    init?(_ tag: String) {
        let value = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        let parts = value.components(separatedBy: "-beta.")
        guard (parts.count == 1 || parts.count == 2),
              parts[0].split(separator: ".").count == 3 else { return nil }
        let numbers = parts[0].split(separator: ".").compactMap { Int($0) }
        guard numbers.count == 3, numbers.allSatisfy({ $0 >= 0 }) else { return nil }
        let beta: Int?
        if parts.count == 2 {
            guard let value = Int(parts[1]), value >= 0 else { return nil }
            beta = value
        } else {
            beta = nil
        }
        self.numbers = numbers
        self.beta = beta
    }

    static func < (lhs: Self, rhs: Self) -> Bool {
        for index in 0..<3 where lhs.numbers[index] != rhs.numbers[index] {
            return lhs.numbers[index] < rhs.numbers[index]
        }
        switch (lhs.beta, rhs.beta) {
        case (nil, nil): return false
        case (nil, _?): return false
        case (_?, nil): return true
        case (let left?, let right?): return left < right
        }
    }
}

private struct GitHubRelease: Decodable {
    struct Asset: Decodable {
        let name: String
        let browser_download_url: String
    }
    let tag_name: String
    let draft: Bool
    let assets: [Asset]
}

private struct AvailableUpdate {
    let version: String
    let url: URL
}

final class OpenWaveAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var server: Process?
    private var localURL: URL?
    private var quitting = false
    private var playerFullscreen = false
    private let buildVersion = Bundle.main.object(forInfoDictionaryKey: "OpenWaveBuildVersion") as? String ?? "dev"
    private let automaticUpdatesKey = "OpenWaveAutomaticallyCheckForUpdates"
    private let lastUpdateCheckKey = "OpenWaveLastUpdateCheck"
    private var checkingUpdates = false
    private var manualUpdateRequested = false
    private var availableUpdate: AvailableUpdate?

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
        if message.name == "openwaveUpdates", message.body as? String == "check" {
            checkForUpdates(manual: true)
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
        syncUpdateButton()
        checkForUpdates(manual: false)
    }

    private var automaticallyChecksForUpdates: Bool {
        let defaults = UserDefaults.standard
        return defaults.object(forKey: automaticUpdatesKey) == nil || defaults.bool(forKey: automaticUpdatesKey)
    }

    private func syncUpdateButton() {
        let ready = availableUpdate != nil
        webView?.evaluateJavaScript("{ const button = document.querySelector('#updates-button'); if (button) { button.classList.toggle('has-update', \(ready)); button.textContent = \(ready) ? 'Update ready' : 'Updates'; } }", completionHandler: nil)
    }

    private func checkForUpdates(manual: Bool) {
        if manual, availableUpdate != nil {
            showUpdateAlert(error: false)
            return
        }
        if manual { manualUpdateRequested = true }
        if !manual {
            guard automaticallyChecksForUpdates else { return }
            if let last = UserDefaults.standard.object(forKey: lastUpdateCheckKey) as? Date,
               Date().timeIntervalSince(last) < 24 * 60 * 60 { return }
        }
        guard !checkingUpdates else { return }
        guard let current = UpdateVersion(buildVersion),
              let url = URL(string: "https://api.github.com/repos/jobinebanezer18/openwave-tv/releases?per_page=20") else {
            manualUpdateRequested = false
            if manual { showUpdateAlert(error: true) }
            return
        }
        checkingUpdates = true
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("OpenWave-TV/\(buildVersion)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 12
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let result: Result<AvailableUpdate?, Error>
            do {
                if let error { throw error }
                guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                      let data else { throw URLError(.badServerResponse) }
                let releases = try JSONDecoder().decode([GitHubRelease].self, from: data)
                let candidates = releases.compactMap { release -> (UpdateVersion, AvailableUpdate)? in
                    let releaseNumber = release.tag_name.hasPrefix("v") ? String(release.tag_name.dropFirst()) : release.tag_name
                    let assetName = "OpenWave-TV-\(releaseNumber)-macOS-universal-unsigned.dmg"
                    guard !release.draft, let version = UpdateVersion(release.tag_name), version > current,
                          let asset = release.assets.first(where: { $0.name == assetName }),
                          let assetURL = URL(string: asset.browser_download_url),
                          assetURL.scheme == "https", assetURL.host == "github.com",
                          assetURL.path.hasPrefix("/jobinebanezer18/openwave-tv/releases/download/") else { return nil }
                    return (version, AvailableUpdate(version: release.tag_name, url: assetURL))
                }
                result = .success(candidates.max(by: { $0.0 < $1.0 })?.1)
            } catch {
                result = .failure(error)
            }
            DispatchQueue.main.async {
                guard let self else { return }
                self.checkingUpdates = false
                let showResult = self.manualUpdateRequested
                self.manualUpdateRequested = false
                switch result {
                case .success(let update):
                    UserDefaults.standard.set(Date(), forKey: self.lastUpdateCheckKey)
                    self.availableUpdate = update
                    self.syncUpdateButton()
                    if showResult { self.showUpdateAlert(error: false) }
                case .failure:
                    if showResult { self.showUpdateAlert(error: true) }
                }
            }
        }.resume()
    }

    private func showUpdateAlert(error: Bool) {
        guard let window else { return }
        let alert = NSAlert()
        alert.alertStyle = .informational
        if error {
            alert.messageText = "Could not check for updates"
            alert.informativeText = "Check your connection and try again."
        } else if let update = availableUpdate {
            alert.messageText = "OpenWave TV \(update.version) is ready"
            alert.informativeText = "Download the Mac DMG from the OpenWave GitHub release, then drag the new app to Applications."
            alert.addButton(withTitle: "Download DMG")
        } else {
            alert.messageText = "OpenWave TV is up to date"
            alert.informativeText = "Version \(buildVersion) is installed."
        }
        alert.addButton(withTitle: error || availableUpdate == nil ? "Done" : "Later")
        let automatic = NSButton(checkboxWithTitle: "Automatically check for updates", target: nil, action: nil)
        automatic.state = automaticallyChecksForUpdates ? .on : .off
        automatic.sizeToFit()
        alert.accessoryView = automatic
        alert.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            UserDefaults.standard.set(automatic.state == .on, forKey: self.automaticUpdatesKey)
            if !error, response == .alertFirstButtonReturn, let update = self.availableUpdate {
                NSWorkspace.shared.open(update.url)
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
