# GAME CENTER

Build 20 では、iOS の GameKit を使う Capacitor native plugin を追加しています。未ログイン、未設定、Web実行、Game Center利用不可のときはローカル記録へ安全にフォールバックします。

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

## Diagnostics

Xcode Console で以下を検索します。

```text
EMOTION_RUNNER_GAMECENTER
```

確認ポイント:

- `native-plugin-registered`
- `authenticate-start`
- `authenticate-success` または `authenticate-failed`
- `submit-score-start` / `submit-score-success`
- `achievement-start` / `achievement-success`
- `present-success`

