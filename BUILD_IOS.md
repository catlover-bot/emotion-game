# BUILD_IOS

## 1. 依存関係を入れる

```bash
npm install
```

## 2. Web アセットをビルドする

```bash
npm run validate:models
npm run validate:mediapipe
npm run validate:cosmetics:metadata
npm run build
```

音声ファイルを追加した場合も同じ手順で `npm run build` と `npx cap sync ios` を実行します。音声ファイルが未配置でも、Build 21 以降は内蔵テスト音源の WebAudio フォールバックで BGM / 効果音を確認できます。

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
7. `Build` 番号を変更したあとは、`npm run validate:models`、`npm run validate:mediapipe`、`npm run validate:cosmetics:metadata`、`npm run build`、`npx cap sync ios` を実行してから Archive します。PNG を配置済みの TestFlight / リリース候補では `npm run validate:cosmetics` も実行します。

## 8. TestFlight 用メモ

- TestFlight の説明文には、表情操作とタップ操作の両対応であることを書くと分かりやすいです。
- 審査メモには、カメラ用途が「表情でキャラクターを操作するため」であり、映像は端末内処理で保存・送信しないことを明記します。
- App Store Connect の Privacy Nutrition Label は、実装に合わせて慎重に入力します。
- Build 16 は expression-only navigation / gacha preview / PNG cosmetic asset polish build です。表情操作モードでは、笑顔で決定、驚いた顔で次へ、怒った顔で戻るメニュー操作を確認します。
- Build 16 では `public/cosmetics/manifest.json` から PNG のキャラ / 背景 / アクセサリーを読み込み、ガチャ結果と着せ替え画面にプレビュー表示します。PNG が無い場合は従来の色ベース表示へ安全にフォールバックします。
- PNG の実ファイルがまだ無い段階では `npm run validate:cosmetics:metadata` と `npm run cosmetics:missing` を使います。画像を配置したあとの TestFlight / release candidate では strict な `npm run validate:cosmetics` を通してください。
- Build 15 は gameplay / rewards polish build です。MediaPipe 表情操作は維持しつつ、ローカル実績、今日のミッション、最高スコア、ローカルランキング画面、Game Center接続準備レイヤーを追加しています。
- Build 20 では iOS向けの GameKit / Game Center ブリッジを追加しています。接続できない環境ではローカル記録に安全に戻ります。
- Build 21 は audio / Game Center diagnostic build です。音声ファイルが未配置でも `BGMテスト` / `効果音テスト` で内蔵テスト音源が鳴り、Game Center は native diagnostics と最後のエラーをランキング画面で確認できます。
- `public/mediapipe` には MediaPipe の wasm runtime と `face_landmarker.task` を同梱しています。TestFlight インストール後は CDN なし / オフラインでも起動できることを確認します。
- 通常画面では診断ビルド表示を出さず、起動失敗時や `診断情報を表示` を押した場合だけ詳細を確認できます。
- カメラの再確認時は、Xcode Console で `EMOTION_RUNNER_CAMERA` と `EMOTION_RUNNER_MODEL` を検索すると、試行した制約・`getUserMedia` の失敗理由・video サイズ・model 読み込み結果を追えます。
- 表情認識の確認時は、Xcode Console で `EMOTION_RUNNER_MEDIAPIPE` と `EMOTION_RUNNER_EXPR` を検索します。wasm/model path、初期化結果、blendshape 由来の raw / smoothed score、選択された表情、感度、検出間隔、操作発火が追えます。
- 表情操作が不安定な場合でも、タイトルや設定から `タップ操作` に切り替えて最後までプレイできることを確認してください。
- `表情操作チェック` で 笑顔 / 怒った顔 / 驚いた顔 の認識状態、confidence 表示、ホールド進捗が自然に見えることを確認してください。
- Build 15のゲームループQAでは、開始 → プレイ → 結果 → もう一度 が素早く回れること、獲得コイン、ミッション達成、実績解除トースト、最高スコア更新が分かりやすいことを確認します。
- Build 16の表情ナビQAでは、タイトル → 表情操作チェック → ゲーム開始 → 結果 → もう一度 / タイトルへ を、できるだけタッチせずに操作できることを確認します。メニュー操作は誤操作防止のためホールド式です。
- Build 16のガチャQAでは、ガチャ開始、カプセル演出、レアリティ表示、アイテム名、新規 / ダブり表示、装備ボタン、もう一度回すボタンが横画面で重ならないことを確認します。
- `ランキング` は Game Center接続、Game Centerランキング表示、Game Center実績表示、ローカル記録 fallback を確認します。App Store Connect 側の leaderboard / achievement が未作成でもアプリはクラッシュせず、ローカル記録を表示します。
- iPhone SE 系や小さめの横画面では、モーダル本文がスクロールでき、CTA / 結果ボタン / タッチ操作がホームインジケータやノッチに重ならないことを確認してください。
- MediaPipe asset の確認には `npm run validate:mediapipe` を使います。`face_landmarker.task` や wasm が HTML / Git LFS pointer / 異常に小さいファイルになっていないことを確認します。
- カメラが起動しても表情認識が動かない場合は、まず `npm run validate:models` を実行してください。Build 8/9 の `tensor should have 576 values but has 116` は、runtime で shard の byte 数が壊れている時に出やすい症状です。
- Capacitor iOS では extensionless な model shard URL が `index.html` のような fallback payload を返すことがあります。現在は `.bin` shard asset と patched manifest を使います。
- shard が `3652 bytes` 前後しか読めていない場合は明らかに異常です。正しい `tiny_face_detector_model-shard1.bin` は `193321 bytes`、`face_expression_model-shard1.bin` は `329468 bytes` です。
- Xcode の Devices and Simulators Console では `EMOTION_RUNNER_NATIVE_DIAG` と `EMOTION_RUNNER_NATIVE_STAGE` で検索します。
- Game Center の確認では Xcode Console で `EMOTION_RUNNER_GAMECENTER` を検索します。native plugin 登録、authenticate、submit score、report achievement、leaderboard表示の結果を追えます。
- TestFlight へ再アップロードするたびに `CURRENT_PROJECT_VERSION` を増やします。
- Build 19 は result / non-run UI / audio polish build です。結果画面はDOMベースのカードで、スコア、ランク、最大コンボ、今日のベスト、最高スコア、獲得コイン、ミッション、実績を読みやすく確認します。
- Build 20 は readable scale / scroll-safe UI / Game Center bridge / gameplay tuning build です。結果画面と非プレイ画面は縮小しすぎず、短い横画面では内容をスクロールして操作できます。
- Build 19 では `設定とデータ` に BGM / 効果音のオンオフと音量スライダーがあります。Build 21 ではスライダー操作中に設定画面が先頭へ戻らないよう、音量変更は画面全体を再描画せず反映します。
- BGM / 効果音は `public/audio/` 配下のローカルファイルだけを参照します。CDN は使いません。詳しくは `docs/AUDIO_ASSETS.md` を確認してください。
- iOS では音声はユーザー操作後に解放されます。初回タップ前に自動再生されないこと、タップ後にタイトル / gameplay / result / gacha BGM が切り替わることを確認します。
- Xcode Console で `EMOTION_RUNNER_AUDIO` を検索すると、audio unlock、AudioContext state、BGM request、file missing、procedural fallback、音量変更を確認できます。

## PNG cosmetic asset workflow

PNG アイテムを追加する場合は、画像を以下のいずれかに配置し、`public/cosmetics/manifest.json` に登録します。

- `public/cosmetics/characters/`
- `public/cosmetics/backgrounds/`
- `public/cosmetics/items/`

例:

```json
{
  "characters": [
    {
      "id": "cat_pink",
      "name": "ピンクねこ",
      "rarity": "rare",
      "image": "/cosmetics/characters/cat_pink.png"
    }
  ],
  "backgrounds": [
    {
      "id": "city_night",
      "name": "ネオンシティ",
      "rarity": "epic",
      "image": "/cosmetics/backgrounds/city_night.png"
    }
  ],
  "items": [
    {
      "id": "glasses_black",
      "name": "黒ぶちメガネ",
      "rarity": "rare",
      "image": "/cosmetics/items/glasses_black.png"
    }
  ]
}
```

登録後、PNG がまだ無い段階では `npm run validate:cosmetics:metadata` を実行します。PNG 配置後は必ず `npm run validate:cosmetics` を実行します。検証では manifest の JSON、id 重複、rarity、`/cosmetics/` 配下の PNG 参照、PNG signature、空ファイルでないことを確認します。

詳細なファイル一覧と追加手順は `docs/COSMETIC_ASSETS.md` にまとめています。

## Game Center setup

Build 20 では iOS native plugin と Game Center entitlement を追加しています。Build 21 では native plugin の `getDiagnostics()`、認証タイムアウト、最後のエラー表示、leaderboard / achievement 表示の詳細ログを強化しています。Archive / TestFlight で実際にランキングと実績を使うには、App Store Connect と Xcode の設定が必要です。詳細は `docs/GAME_CENTER.md` も確認してください。

1. Xcode target `App` → `Signing & Capabilities` で `Game Center` が有効になっていることを確認します。
2. App Store Connect → App → Features / Game Center で leaderboard と achievements を作成します。
3. 下記 ID を App Store Connect 側にも同じ文字列で登録します。
4. Game Center が未設定・未ログイン・利用不可の場合、アプリは `ローカル記録のみ表示中` として安全に動作します。

トラブルシュート:

- ランキング画面の `診断情報をコピー` で native bridge の状態、認証状態、最後のエラー、player id を確認します。
- Xcode Console / Devices and Simulators Console で `EMOTION_RUNNER_GAMECENTER` を検索します。
- 認証画面が出ない場合は、iPhone の Game Center サインイン状態、App Store Connect の Game Center 有効化、Archive の entitlements を確認します。

## Game Center identifiers

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
npm run validate:cosmetics:metadata
npm run validate:cosmetics
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
