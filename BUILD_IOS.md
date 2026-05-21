# BUILD_IOS

## 1. 依存関係を入れる

```bash
npm install
```

## 2. Web アセットをビルドする

```bash
npm run validate:models
npm run validate:mediapipe
npm run build
```

## 3. Capacitor の iOS プロジェクトへ反映する

```bash
npx cap sync ios
```

## 4. Xcode を開く

```bash
npx cap open ios
```

## 5. Xcode での基本設定

- `ios/App/App.xcworkspace` を開きます。
- `App` ターゲットの `Signing & Capabilities` で Apple Developer Team を選びます。
- `Bundle Identifier` はそのまま使います。変更が必要な場合は、既存の配布計画と衝突しないか先に確認します。
- `CFBundleDisplayName` は `表情ランナー` です。
- このアプリは横画面専用です。`Info.plist` では `Landscape Left / Landscape Right` のみを許可し、`UIRequiresFullScreen = true` にして iPad マルチタスク前提の向き検証を避けます。

## 6. 実機テスト

- シミュレータではカメラ挙動が不十分なことがあるため、必ず実機 iPhone でも確認します。
- 横向きで起動し、ノッチ側とホームインジケータ側のセーフエリアに重要 UI が重ならないことを確認します。
- 初回起動時にカメラ許可ダイアログが出ることを確認します。
- カメラ拒否後もタップ操作で継続できることを確認します。
- 表情認識が失敗してもクラッシュせず遊べることを確認します。

## 7. Archive と App Store Connect へのアップロード

1. Xcode で `Any iOS Device (arm64)` または接続中の実機を選びます。
2. `Product` → `Archive` を実行します。
3. Organizer で生成された Archive を選びます。
4. `Distribute App` → `App Store Connect` → `Upload` を選びます。
5. 自動署名を使う場合は、そのまま推奨設定で進めます。
6. 新しい TestFlight アップロードごとに `Build` 番号を 1 つ増やしてから Archive します。
7. `Build` 番号を変更したあとは、`npm run validate:models`、`npm run validate:mediapipe`、`npm run build`、`npx cap sync ios` を実行してから Archive します。

## 8. TestFlight 用メモ

- TestFlight の説明文には、表情操作とタップ操作の両対応であることを書くと分かりやすいです。
- 審査メモには、カメラ用途が「表情でキャラクターを操作するため」であり、映像は端末内処理で保存・送信しないことを明記します。
- App Store Connect の Privacy Nutrition Label は、実装に合わせて慎重に入力します。
- Build 15 は gameplay / rewards polish build です。MediaPipe 表情操作は維持しつつ、ローカル実績、今日のミッション、最高スコア、ローカルランキング画面、Game Center接続準備レイヤーを追加しています。
- Game Center / GameKit の実装はまだ入れていません。Build 15ではローカル no-op adapter がスコア・実績イベントを安全に記録するだけです。
- `public/mediapipe` には MediaPipe の wasm runtime と `face_landmarker.task` を同梱しています。TestFlight インストール後は CDN なし / オフラインでも起動できることを確認します。
- 通常画面では診断ビルド表示を出さず、起動失敗時や `診断情報を表示` を押した場合だけ詳細を確認できます。
- カメラの再確認時は、Xcode Console で `EMOTION_RUNNER_CAMERA` と `EMOTION_RUNNER_MODEL` を検索すると、試行した制約・`getUserMedia` の失敗理由・video サイズ・model 読み込み結果を追えます。
- 表情認識の確認時は、Xcode Console で `EMOTION_RUNNER_MEDIAPIPE` と `EMOTION_RUNNER_EXPR` を検索します。wasm/model path、初期化結果、blendshape 由来の raw / smoothed score、選択された表情、感度、検出間隔、操作発火が追えます。
- 表情操作が不安定な場合でも、タイトルや設定から `タップ操作` に切り替えて最後までプレイできることを確認してください。
- `表情操作チェック` で 笑顔 / 怒った顔 / 驚いた顔 の認識状態、confidence 表示、ホールド進捗が自然に見えることを確認してください。
- Build 15のゲームループQAでは、開始 → プレイ → 結果 → もう一度 が素早く回れること、獲得コイン、ミッション達成、実績解除トースト、最高スコア更新が分かりやすいことを確認します。
- `ランキング` は現時点ではローカル記録画面です。タップ時に「Game Centerランキングは次のアップデートで対応予定です。」と表示されることを確認してください。
- iPhone SE 系や小さめの横画面では、モーダル本文がスクロールでき、CTA / 結果ボタン / タッチ操作がホームインジケータやノッチに重ならないことを確認してください。
- MediaPipe asset の確認には `npm run validate:mediapipe` を使います。`face_landmarker.task` や wasm が HTML / Git LFS pointer / 異常に小さいファイルになっていないことを確認します。
- カメラが起動しても表情認識が動かない場合は、まず `npm run validate:models` を実行してください。Build 8/9 の `tensor should have 576 values but has 116` は、runtime で shard の byte 数が壊れている時に出やすい症状です。
- Capacitor iOS では extensionless な model shard URL が `index.html` のような fallback payload を返すことがあります。現在は `.bin` shard asset と patched manifest を使います。
- shard が `3652 bytes` 前後しか読めていない場合は明らかに異常です。正しい `tiny_face_detector_model-shard1.bin` は `193321 bytes`、`face_expression_model-shard1.bin` は `329468 bytes` です。
- Xcode の Devices and Simulators Console では `EMOTION_RUNNER_NATIVE_DIAG` と `EMOTION_RUNNER_NATIVE_STAGE` で検索します。
- Game Center準備レイヤーの確認では `EMOTION_RUNNER_GAME_SERVICES` を検索します。Build 15では native GameKit へ接続せず、local adapter が `submit-score-local` / `report-achievement-local` を出します。
- TestFlight へ再アップロードするたびに `CURRENT_PROJECT_VERSION` を増やします。

## Game Center identifiers planned for Build 16

- Leaderboard: `leaderboard.best_score`
- Achievement: `achievement.first_play`
- Achievement: `achievement.score_1000`
- Achievement: `achievement.score_5000`
- Achievement: `achievement.combo_10`
- Achievement: `achievement.combo_30`
- Achievement: `achievement.first_fever`
- Achievement: `achievement.expression_mode_play`
- Achievement: `achievement.tap_mode_play`
- Achievement: `achievement.first_gacha`
- Achievement: `achievement.first_skin_change`

## 9. 検証コマンド

```bash
npm run validate:models
npm run validate:mediapipe
npm run build
npx cap sync ios
plutil -p ios/App/App/Info.plist | grep -A8 -E "UIRequiresFullScreen|UISupportedInterfaceOrientations"
```

## 10. Archive の中身を確認する

Archive 後に、実際に `.xcarchive` の中へ最新の web 資産が入っているか確認できます。

```bash
ARCHIVE_PATH="$(ls -td ~/Library/Developer/Xcode/Archives/*/*.xcarchive | head -n 1)"
find "$ARCHIVE_PATH/Products/Applications/App.app/public" -maxdepth 2 -type f | sort
grep -R "__EMOTION_RUNNER_BUILD__" "$ARCHIVE_PATH/Products/Applications/App.app/public/index.html"
```

`index.html` に `__EMOTION_RUNNER_BUILD__` が含まれ、`public/assets` と `public/models` が見えていれば、Archive 自体には最新資産が入っています。

## 11. トラブルシュート

- `npm run build` が失敗したら、TypeScript エラーを先に解消します。
- `npm run validate:models` が失敗したら、model ファイルの破損や取り違えを先に直します。
- `npx cap sync ios` が失敗したら、`npm install` 済みか確認します。
- CocoaPods 関連で失敗したら、Xcode / Command Line Tools / CocoaPods の状態を確認します。
- 権限文言を更新したあとは、再度 `npx cap sync ios` を実行して Xcode 側に反映します。
