# GAME CENTER

Build 20 では、iOS の GameKit を使う Capacitor native plugin を追加しています。Build 21 では認証、診断、ランキング表示、実績表示のエラー情報を強化しています。未ログイン、未設定、Web実行、Game Center利用不可のときはローカル記録へ安全にフォールバックします。

## Xcode Setup

1. Xcode で `ios/App/App.xcworkspace` を開きます。
2. Target `App` → `Signing & Capabilities` を開きます。
3. `Game Center` capability が有効になっていることを確認します。
4. 自動署名を使う場合、Apple Developer 側の App ID に Game Center capability が反映されていることを確認します。

## App Store Connect Setup

App Store Connect の Game Center 設定で、以下の ID を作成してください。

```text
leaderboard.best_score
achievement.first_play
achievement.score_1000
achievement.score_5000
achievement.combo_10
achievement.combo_30
achievement.first_fever
achievement.expression_mode_play
achievement.tap_mode_play
achievement.first_gacha
achievement.first_skin_change
```

## Runtime Behavior

- ラン終了時に最高スコア leaderboard へ送信します。
- 実績解除時に achievement を報告します。
- Game Center未接続時は送信イベントを端末内に一時保存します。
- 接続できない場合でも結果画面、ローカルランキング、共有、ガチャ、着せ替えは止まりません。
- ランキング画面の `診断情報をコピー` で native bridge の状態、認証状態、player id、最後のエラーを確認できます。
- 認証はmain threadで実行し、Game Center認証画面が必要な場合はアプリ上に表示します。
- 認証が返らない場合もタイムアウトし、画面が固まらないようにしています。

## Diagnostics

Xcode Console で以下を検索します。

```text
EMOTION_RUNNER_GAMECENTER
```

確認ポイント:

- `diagnostics requested`
- `authenticate requested`
- `authenticate presenting-view-controller`
- `authenticate finished success=true/false`
- `submit-score requested` / `submit-score success` / `submit-score failed`
- `achievement requested` / `achievement success` / `achievement failed`
- `show-leaderboard requested`
- `show-achievements requested`
- `present success`

## Troubleshooting

- `Game Center接続` で何も起きない場合は、iPhoneのGame Centerサインイン状態と、App Store Connectで iOS App 1.0 の Game Center が有効か確認します。
- `最後のエラー` に leaderboard / achievement ID の失敗が出る場合は、App Store Connect側のID文字列がこのファイルと完全一致しているか確認します。
- Archive の entitlements に `com.apple.developer.game-center` が入っていることを確認します。
- 接続できない状態でも、アプリは `ローカル記録のみ表示中` としてプレイ、結果、共有、ガチャ、着せ替えを継続できます。
