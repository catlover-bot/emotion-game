# AUDIO ASSETS

`表情ランナー` の BGM / 効果音はローカル同梱ファイルだけを使います。CDN や外部配信サービスは使いません。

## Directory Structure

```text
public/audio/
public/audio/bgm/
public/audio/sfx/
```

## Planned BGM Files

```text
public/audio/bgm/title.mp3
public/audio/bgm/gameplay.mp3
public/audio/bgm/result.mp3
public/audio/bgm/gacha.mp3
public/audio/bgm/customize.mp3
```

## Planned SFX Files

```text
public/audio/sfx/confirm.mp3
public/audio/sfx/back.mp3
public/audio/sfx/jump.mp3
public/audio/sfx/attack.mp3
public/audio/sfx/boost.mp3
public/audio/sfx/fever_start.mp3
public/audio/sfx/gacha_reveal.mp3
public/audio/sfx/mission_clear.mp3
public/audio/sfx/achievement.mp3
public/audio/sfx/result_fanfare.mp3
```

## Build 21 Fallback Audio

Build 21 以降は、音声ファイルが未配置でも WebAudio の内蔵テスト音源で BGM / 効果音を鳴らせます。これは本番用の楽曲ではなく、TestFlight で「音が出る経路」を確認するための軽量フォールバックです。

- 設定画面の `BGMテスト` で現在のBGMを再生します。
- 設定画面の `効果音テスト` で確認音を再生します。
- ファイルが存在すれば音声ファイルを優先します。
- ファイルが見つからない、またはiOS WebViewで読み込めない場合は `内蔵テスト音源を使用中` と表示されます。
- iOSでは必ずユーザー操作後に音声を解放します。初回タップ前の自動再生はしません。

## Notes

- `mp3` または `m4a` 推奨です。現在のコード定義は `mp3` を参照しています。
- ファイルは短く、小さめにしてください。TestFlight の起動速度とアプリサイズに効きます。
- 音声ファイルが未配置でもアプリはクラッシュせず、内蔵テスト音源へフォールバックします。
- iOS ではユーザー操作後に音声が解放されます。初回タップ前に自動再生しない設計です。
- 音が出ない場合は、iPhoneの消音モード、本体音量、Bluetooth出力先も確認してください。
- 音声を追加したら `npm run build` と `npx cap sync ios` を実行してください。
- TestFlight では設定画面で BGM / 効果音のオンオフと音量が保存されることを確認します。
- Console では `EMOTION_RUNNER_AUDIO` を検索すると、unlock、AudioContext state、file missing、procedural fallback、volume change を追えます。
