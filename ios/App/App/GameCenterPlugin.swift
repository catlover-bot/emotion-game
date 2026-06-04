import Capacitor
import GameKit
import UIKit

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "autoAuthenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnostics", returnType: CAPPluginReturnPromise)
    ]

    private let defaultLeaderboardId = "leaderboard.best_score"
    private var lastErrorCode = ""
    private var lastErrorMessage = ""
    private var authInFlight = false

    public override func load() {
        super.load()
        NSLog("EMOTION_RUNNER_GAMECENTER native plugin loaded")
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        NSLog("EMOTION_RUNNER_GAMECENTER isAvailable requested")
        call.resolve(statusPayload(message: "Game Centerブリッジを利用できます。"))
    }

    @objc func getDiagnostics(_ call: CAPPluginCall) {
        NSLog("EMOTION_RUNNER_GAMECENTER diagnostics requested")
        call.resolve(statusPayload(message: "Game Center診断情報を取得しました。"))
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        NSLog("EMOTION_RUNNER_GAMECENTER authenticate requested")
        DispatchQueue.main.async { [weak self] in
            self?.authenticateOnMain(call, source: "manual")
        }
    }

    @objc func autoAuthenticate(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? "auto"
        NSLog("EMOTION_RUNNER_GAMECENTER autoAuthenticate requested source=%@", source)
        DispatchQueue.main.async { [weak self] in
            self?.authenticateOnMain(call, source: source)
        }
    }

    private func authenticateOnMain(_ call: CAPPluginCall, source: String) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            clearLastError()
            NSLog("EMOTION_RUNNER_GAMECENTER authenticate already-authenticated source=%@", source)
            call.resolve(statusPayload(message: "Game Centerに接続済みです。", source: source, attempted: true))
            return
        }

        if authInFlight {
            rememberError(code: "AUTH_IN_FLIGHT", message: "Game Center認証を確認中です。")
            NSLog("EMOTION_RUNNER_GAMECENTER authenticate skipped in-flight source=%@", source)
            call.resolve(statusPayload(success: false, message: "Game Center認証を確認中です。", source: source, attempted: false))
            return
        }

        authInFlight = true
        var didResolve = false
        var didReceiveAuthViewController = false
        func finish(_ success: Bool, _ message: String, _ error: Error? = nil) {
            guard !didResolve else { return }
            didResolve = true
            authInFlight = false
            if let error = error {
                rememberError(error)
            } else if success {
                clearLastError()
            } else {
                rememberError(code: "AUTH_FAILED", message: message)
            }
            NSLog(
                "EMOTION_RUNNER_GAMECENTER authenticate finished source=%@ success=%@ authenticated=%@ message=%@",
                source,
                success ? "true" : "false",
                player.isAuthenticated ? "true" : "false",
                message
            )
            call.resolve(statusPayload(
                success: success,
                message: message,
                source: source,
                attempted: true,
                requiresUserAction: didReceiveAuthViewController
            ))
        }

        player.authenticateHandler = { [weak self] viewController, error in
            DispatchQueue.main.async {
                guard let self = self else {
                    finish(false, "Game Centerブリッジを参照できませんでした。")
                    return
                }
                guard !didResolve else { return }

                if let viewController = viewController {
                    didReceiveAuthViewController = true
                    NSLog("EMOTION_RUNNER_GAMECENTER auth viewController received source=%@", source)
                    guard let presenter = self.topViewController() else {
                        finish(false, "Game Center認証画面を表示できませんでした。")
                        return
                    }
                    presenter.present(viewController, animated: true)
                    NSLog("EMOTION_RUNNER_GAMECENTER auth viewController presented source=%@", source)
                    return
                }

                if player.isAuthenticated {
                    finish(true, "Game Centerに接続しました。")
                    return
                }

                let message = error?.localizedDescription ?? "Game Centerに接続できませんでした。ローカル記録で遊べます。"
                finish(false, message, error)
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            guard let self = self else { return }
            if !didResolve && !player.isAuthenticated {
                finish(false, "Game Center認証の応答がありませんでした。設定とサインイン状態を確認してください。")
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        let score = max(0, call.getInt("score") ?? 0)
        let leaderboardId = call.getString("leaderboardId") ?? defaultLeaderboardId

        guard GKLocalPlayer.local.isAuthenticated else {
            rememberError(code: "NOT_AUTHENTICATED", message: "Game Center未接続です。")
            NSLog("EMOTION_RUNNER_GAMECENTER submit-score skipped unauthenticated leaderboard=%@ score=%d", leaderboardId, score)
            call.resolve(statusPayload(success: false, message: "Game Center未接続のため、ローカル記録に保存しました。"))
            return
        }

        NSLog("EMOTION_RUNNER_GAMECENTER submit-score requested leaderboard=%@ score=%d", leaderboardId, score)
        GKLeaderboard.submitScore(
            score,
            context: 0,
            player: GKLocalPlayer.local,
            leaderboardIDs: [leaderboardId]
        ) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.rememberError(error)
                    NSLog("EMOTION_RUNNER_GAMECENTER submit-score failed leaderboard=%@ error=%@", leaderboardId, error.localizedDescription)
                    call.resolve(self?.statusPayload(success: false, message: error.localizedDescription) ?? [:])
                    return
                }

                self?.clearLastError()
                NSLog("EMOTION_RUNNER_GAMECENTER submit-score success leaderboard=%@ score=%d", leaderboardId, score)
                call.resolve(self?.statusPayload(success: true, message: "スコアをGame Centerに送信しました。") ?? [:])
            }
        }
    }

    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard let achievementId = call.getString("achievementId") else {
            rememberError(code: "MISSING_ACHIEVEMENT_ID", message: "achievementId is required")
            call.resolve(statusPayload(success: false, message: "実績IDが指定されていません。"))
            return
        }
        let percent = max(0, min(100, call.getDouble("percent") ?? 100))

        guard GKLocalPlayer.local.isAuthenticated else {
            rememberError(code: "NOT_AUTHENTICATED", message: "Game Center未接続です。")
            NSLog("EMOTION_RUNNER_GAMECENTER achievement skipped unauthenticated id=%@", achievementId)
            call.resolve(statusPayload(success: false, message: "Game Center未接続のため、実績はローカル記録に保存しました。"))
            return
        }

        let achievement = GKAchievement(identifier: achievementId)
        achievement.percentComplete = percent
        achievement.showsCompletionBanner = true

        NSLog("EMOTION_RUNNER_GAMECENTER achievement requested id=%@ percent=%.1f", achievementId, percent)
        GKAchievement.report([achievement]) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.rememberError(error)
                    NSLog("EMOTION_RUNNER_GAMECENTER achievement failed id=%@ error=%@", achievementId, error.localizedDescription)
                    call.resolve(self?.statusPayload(success: false, message: "\(achievementId): \(error.localizedDescription)") ?? [:])
                    return
                }

                self?.clearLastError()
                NSLog("EMOTION_RUNNER_GAMECENTER achievement success id=%@", achievementId)
                call.resolve(self?.statusPayload(success: true, message: "実績をGame Centerに送信しました。") ?? [:])
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let leaderboardId = call.getString("leaderboardId") ?? defaultLeaderboardId
        NSLog("EMOTION_RUNNER_GAMECENTER show-leaderboard requested id=%@", leaderboardId)
        let viewController = GKGameCenterViewController(
            leaderboardID: leaderboardId,
            playerScope: .global,
            timeScope: .allTime
        )
        presentGameCenter(call, viewController: viewController)
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        NSLog("EMOTION_RUNNER_GAMECENTER show-achievements requested")
        presentGameCenter(call, viewController: GKGameCenterViewController(state: .achievements))
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        NSLog("EMOTION_RUNNER_GAMECENTER view-controller dismissed")
        gameCenterViewController.dismiss(animated: true)
    }

    private func presentGameCenter(_ call: CAPPluginCall, viewController: GKGameCenterViewController) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve(["success": false, "message": "Game Centerブリッジを参照できませんでした。"])
                return
            }
            guard GKLocalPlayer.local.isAuthenticated else {
                self.rememberError(code: "NOT_AUTHENTICATED", message: "Game Center未接続です。")
                NSLog("EMOTION_RUNNER_GAMECENTER present skipped unauthenticated")
                call.resolve(self.statusPayload(success: false, message: "Game Centerに接続すると表示できます。"))
                return
            }
            guard let presenter = self.topViewController() else {
                self.rememberError(code: "NO_PRESENTER", message: "Game Center画面を表示するViewControllerが見つかりません。")
                call.resolve(self.statusPayload(success: false, message: "Game Center画面を表示できませんでした。"))
                return
            }

            viewController.gameCenterDelegate = self
            presenter.present(viewController, animated: true)
            self.clearLastError()
            NSLog("EMOTION_RUNNER_GAMECENTER present success")
            call.resolve(self.statusPayload(success: true, message: "Game Centerを表示しました。"))
        }
    }

    private func statusPayload(
        success: Bool = true,
        message: String,
        source: String = "",
        attempted: Bool = true,
        requiresUserAction: Bool = false
    ) -> [String: Any] {
        let player = GKLocalPlayer.local
        return [
            "available": true,
            "authenticated": player.isAuthenticated,
            "success": success,
            "attempted": attempted,
            "requiresUserAction": requiresUserAction,
            "source": source,
            "playerName": player.isAuthenticated ? player.displayName : "",
            "playerGamePlayerID": player.isAuthenticated ? player.gamePlayerID : "",
            "message": message,
            "usingNative": true,
            "supportsGameCenterBridge": true,
            "entitlementDetected": "unknown",
            "lastErrorCode": lastErrorCode,
            "lastErrorMessage": lastErrorMessage
        ]
    }

    private func topViewController() -> UIViewController? {
        var top = bridge?.viewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    private func rememberError(_ error: Error) {
        let nsError = error as NSError
        lastErrorCode = "\(nsError.domain):\(nsError.code)"
        lastErrorMessage = nsError.localizedDescription
    }

    private func rememberError(code: String, message: String) {
        lastErrorCode = code
        lastErrorMessage = message
    }

    private func clearLastError() {
        lastErrorCode = ""
        lastErrorMessage = ""
    }
}
