import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let diagnosticBuild = "20"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        logNativeStage("didFinishLaunching")
        logBundleDiagnostics(context: "didFinishLaunching")
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        logNativeStage("applicationDidBecomeActive")
        logBundleDiagnostics(context: "applicationDidBecomeActive")
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func logNativeStage(_ stage: String) {
        NSLog("EMOTION_RUNNER_NATIVE_STAGE: %@", stage)

        let resolvedWindow = activeWindow()
        let rootDescription: String
        if let rootViewController = resolvedWindow?.rootViewController {
            rootDescription = String(describing: type(of: rootViewController))
        } else {
            rootDescription = "<nil>"
        }

        NSLog("EMOTION_RUNNER_NATIVE_STAGE: rootViewController=%@", rootDescription)
        NSLog("EMOTION_RUNNER_NATIVE_STAGE: window=%@", String(describing: resolvedWindow))
    }

    private func logBundleDiagnostics(context: String) {
        NSLog("EMOTION_RUNNER_NATIVE_DIAG: build=%@", diagnosticBuild)
        NSLog("EMOTION_RUNNER_NATIVE_DIAG: context=%@", context)
        NSLog("EMOTION_RUNNER_NATIVE_DIAG: bundlePath=%@", Bundle.main.bundlePath)

        let indexPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "public")
        NSLog(
            "EMOTION_RUNNER_NATIVE_DIAG: public/index.html exists=%@ path=%@",
            indexPath == nil ? "false" : "true",
            indexPath ?? "<nil>"
        )

        let resourceURL = Bundle.main.resourceURL
        let assetsURL = resourceURL?.appendingPathComponent("public/assets", isDirectory: true)
        let modelsURL = resourceURL?.appendingPathComponent("public/models", isDirectory: true)

        NSLog(
            "EMOTION_RUNNER_NATIVE_DIAG: public/assets exists=%@ path=%@",
            directoryExists(at: assetsURL) ? "true" : "false",
            assetsURL?.path ?? "<nil>"
        )
        NSLog(
            "EMOTION_RUNNER_NATIVE_DIAG: public/models exists=%@ path=%@",
            directoryExists(at: modelsURL) ? "true" : "false",
            modelsURL?.path ?? "<nil>"
        )
    }

    private func activeWindow() -> UIWindow? {
        if let existingWindow = window {
            return existingWindow
        }

        let windowScenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let keyWindow = windowScenes.flatMap(\.windows).first(where: \.isKeyWindow) {
            return keyWindow
        }

        return windowScenes.flatMap(\.windows).first
    }

    private func directoryExists(at url: URL?) -> Bool {
        guard let path = url?.path else {
            return false
        }

        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return exists && isDirectory.boolValue
    }
}
