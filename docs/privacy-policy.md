# 表情ランナー Privacy Policy / プライバシーポリシー

Last updated: 2026-06-05

## 日本語

### 1. アプリについて

表情ランナーは、カメラで読み取った表情を使ってキャラクターを操作するカジュアルゲームです。

### 2. カメラの利用目的

- カメラは表情を検出するためだけに使用します。
- カメラ映像は端末内で処理されます。
- カメラ画像や表情データを、開発者のサーバーへ送信・保存・共有することはありません。

### 3. 端末内に保存されるデータ

以下のゲーム進行データは、端末内のローカルストレージに保存されます。

- スコア
- 今日のベスト記録
- コイン
- スキンや着せ替え状態
- オンボーディングやチュートリアルの表示状態
- ランキング用の匿名 device_id とニックネーム

これらのデータは、アプリの利用体験を維持するために端末内へ保存されます。

### 4. 外部送信について

- アプリ内に広告、解析、トラッキング SDK は含まれていません。
- アカウント登録、ログイン、課金、サブスクリプション機能はありません。
- ゲーム内から、カメラ画像や表情データを外部サービスへ送信しません。
- オンラインランキングが有効なビルドでは、Firebase Firestore にニックネーム、匿名 device_id、最高スコア、最高コンボ、プレイ回数、累計コイン、直近スコア、装備中のコスメID、更新日時を送信する場合があります。
- オンラインランキング送信に失敗した場合でも、ローカル記録は端末内に保存されます。

### 5. ネットワークアクセスについて

- iOS アプリ版では、ゲームプレイに必要なモデルファイルはアプリ内に同梱されます。
- そのため、表情認識のために外部サーバーへカメラ映像を送ることはありません。
- オンラインランキングが有効なビルドでは、ランキング取得とスコア送信のために Firebase Firestore へネットワーク接続します。
- Web 版を公開した場合、ブラウザは HTML / CSS / JavaScript / モデルファイルなどの静的ファイルをホスティング先から取得します。
- ただし、その場合でもカメラ映像、顔ランドマーク、表情フレーム、MediaPipe blendshape score を開発者サーバーへ送信しません。

### 6. データの削除

- アプリ内の設定から、チュートリアル状態やローカルゲームデータをリセットできます。
- ブラウザ版では、ブラウザのサイトデータ削除機能でもローカル保存データを削除できます。

### 7. お問い合わせ

このアプリや本ポリシーに関する問い合わせ先は、配布ページまたは GitHub リポジトリの案内をご確認ください。

## English

### 1. About the App

Hyojo Runner is a casual game that uses facial expressions detected by the camera to control the character.

### 2. Camera Use

- The camera is used only to detect facial expressions.
- Camera frames are processed locally on the device.
- Camera images and expression data are not uploaded to, stored on, or shared with the developer's servers.

### 3. Data Stored on the Device

The following gameplay data may be stored locally on the device:

- Score
- Daily best score
- Coins
- Skins and customization state
- Onboarding and tutorial completion state
- Anonymous ranking device ID and nickname

This local storage is used only to preserve gameplay progress and user experience.

### 4. No Analytics or Tracking

- The app does not include advertising SDKs, analytics SDKs, or tracking SDKs.
- The app does not require account registration, login, payments, or subscriptions.
- The app does not transmit camera images or expression data to external services.
- If online ranking is enabled in a build, the app may send nickname, anonymous device ID, best score, best combo, total runs, total coins, last score, equipped cosmetic IDs, and timestamps to Firebase Firestore.
- If online ranking submission fails, local records remain stored on the device.

### 5. Network Access

- In the iOS app build, the model files required for expression recognition are bundled with the app.
- No camera frames are sent to an external server for expression recognition.
- If online ranking is enabled in a build, the app connects to Firebase Firestore to fetch rankings and submit scores.
- If a web version is published, the browser may download static files such as HTML, CSS, JavaScript, and model files from the hosting provider.
- Even in the web version, camera frames, face landmarks, expression frames, and MediaPipe blendshape scores are not uploaded to the developer's server.

### 6. Deleting Data

- Users can reset tutorial state and local gameplay data from the app settings.
- In the web version, locally stored data can also be removed using the browser's site data controls.

### 7. Contact

For questions about the app or this policy, please refer to the distribution page or the GitHub repository information.
