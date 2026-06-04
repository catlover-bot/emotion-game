import Capacitor
import UIKit

class AppViewController: CAPBridgeViewController {
    override open func viewDidLoad() {
        super.viewDidLoad()
        NSLog("EMOTION_RUNNER_GAMECENTER AppViewController loaded")
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginType(GameCenterPlugin.self)
        NSLog("EMOTION_RUNNER_GAMECENTER native-plugin-registered")
    }
}
