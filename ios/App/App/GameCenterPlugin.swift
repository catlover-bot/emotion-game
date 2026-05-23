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
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise)
    ]

    private let defaultLeaderboardId = "leaderboard.best_score"

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(statusPayload(message: "Game Centerを利用できます。"))
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        NSLog("EMOTION_RUNNER_GAMECENTER authenticate-start")
        let player = GKLocalPlayer.local
        var resolved = false

        player.authenticateHandler = { [weak self] viewController, error in
            DispatchQueue.main.async {
                guard !resolved else { return }

                if let viewController = viewController {
                    NSLog("EMOTION_RUNNER_GAMECENTER authenticate-present-ui")
                    self?.bridge?.viewController?.present(viewController, animated: true)
                    return
                }

                resolved = true
                if player.isAuthenticated {
                    NSLog("EMOTION_RUNNER_GAMECENTER authenticate-success")
                    call.resolve(self?.statusPayload(message: "Game Centerに接続しました。") ?? [:])
                    return
                }

                let message = error?.localizedDescription ?? "Game Centerに接続できませんでした。ローカル記録で遊べます。"
                NSLog("EMOTION_RUNNER_GAMECENTER authenticate-failed %@", message)
                call.resolve(self?.statusPayload(message: message) ?? [:])
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        let score = max(0, call.getInt("score") ?? 0)
        let leaderboardId = call.getString("leaderboardId") ?? defaultLeaderboardId

        guard GKLocalPlayer.local.isAuthenticated else {
            NSLog("EMOTION_RUNNER_GAMECENTER submit-score-skipped unauthenticated")
            call.resolve(statusPayload(success: false, message: "Game Center未接続のため、ローカル記録に保存しました。"))
            return
        }

        NSLog("EMOTION_RUNNER_GAMECENTER submit-score-start %@ %d", leaderboardId, score)
        GKLeaderboard.submitScore(
            score,
            context: 0,
            player: GKLocalPlayer.local,
            leaderboardIDs: [leaderboardId]
        ) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    NSLog("EMOTION_RUNNER_GAMECENTER submit-score-failed %@", error.localizedDescription)
                    call.resolve(self?.statusPayload(success: false, message: error.localizedDescription) ?? [:])
                    return
                }

                NSLog("EMOTION_RUNNER_GAMECENTER submit-score-success")
                call.resolve(self?.statusPayload(success: true, message: "スコアをGame Centerに送信しました。") ?? [:])
            }
        }
    }

    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard let achievementId = call.getString("achievementId") else {
            call.reject("achievementId is required")
            return
        }
        let percent = max(0, min(100, call.getDouble("percent") ?? 100))

        guard GKLocalPlayer.local.isAuthenticated else {
            NSLog("EMOTION_RUNNER_GAMECENTER achievement-skipped unauthenticated")
            call.resolve(statusPayload(success: false, message: "Game Center未接続のため、実績はローカル記録に保存しました。"))
            return
        }

        let achievement = GKAchievement(identifier: achievementId)
        achievement.percentComplete = percent
        achievement.showsCompletionBanner = true

        NSLog("EMOTION_RUNNER_GAMECENTER achievement-start %@ %.1f", achievementId, percent)
        GKAchievement.report([achievement]) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    NSLog("EMOTION_RUNNER_GAMECENTER achievement-failed %@", error.localizedDescription)
                    call.resolve(self?.statusPayload(success: false, message: error.localizedDescription) ?? [:])
                    return
                }

                NSLog("EMOTION_RUNNER_GAMECENTER achievement-success")
                call.resolve(self?.statusPayload(success: true, message: "実績をGame Centerに送信しました。") ?? [:])
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let leaderboardId = call.getString("leaderboardId") ?? defaultLeaderboardId
        presentGameCenter(call, viewController: GKGameCenterViewController(
            leaderboardID: leaderboardId,
            playerScope: .global,
            timeScope: .allTime
        ))
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        presentGameCenter(call, viewController: GKGameCenterViewController(state: .achievements))
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }

    private func presentGameCenter(_ call: CAPPluginCall, viewController: GKGameCenterViewController) {
        guard GKLocalPlayer.local.isAuthenticated else {
            NSLog("EMOTION_RUNNER_GAMECENTER present-skipped unauthenticated")
            call.resolve(statusPayload(success: false, message: "Game Centerに接続すると表示できます。"))
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.resolve(self?.statusPayload(success: false, message: "Game Center画面を表示できませんでした。") ?? [:])
                return
            }

            viewController.gameCenterDelegate = self
            presenter.present(viewController, animated: true)
            NSLog("EMOTION_RUNNER_GAMECENTER present-success")
            call.resolve(self.statusPayload(success: true, message: "Game Centerを表示しました。"))
        }
    }

    private func statusPayload(success: Bool = true, message: String) -> [String: Any] {
        let player = GKLocalPlayer.local
        return [
            "available": true,
            "authenticated": player.isAuthenticated,
            "success": success,
            "playerName": player.isAuthenticated ? player.displayName : "",
            "message": message,
            "usingNative": true
        ]
    }
}
