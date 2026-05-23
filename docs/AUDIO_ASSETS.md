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

## Notes

- `mp3` または `m4a` 推奨です。現在のコード定義は `mp3` を参照しています。
- ファイルは短く、小さめにしてください。TestFlight の起動速度とアプリサイズに効きます。
- 音声ファイルが未配置でもアプリはクラッシュせず、無音で動作します。
- iOS ではユーザー操作後に音声が解放されます。初回タップ前に自動再生しない設計です。
- 音声を追加したら `npm run build` と `npx cap sync ios` を実行してください。
- TestFlight では設定画面で BGM / 効果音のオンオフと音量が保存されることを確認します。
