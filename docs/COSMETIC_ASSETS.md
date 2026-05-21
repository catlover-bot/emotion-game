# Cosmetic Assets

このリポジトリは、PNG をあとから追加できる着せ替えアセット構成になっています。PNG がまだ無い状態でもアプリはビルドでき、ガチャ / 着せ替え画面では内蔵の色ベース表示にフォールバックします。

## Directory Structure

```text
public/cosmetics/
public/cosmetics/characters/
public/cosmetics/backgrounds/
public/cosmetics/items/
public/cosmetics/manifest.json
```

## Manifest Format

`public/cosmetics/manifest.json` に、キャラ、背景、アクセサリーを登録します。

```json
{
  "characters": [
    {
      "id": "green_runner_face",
      "name": "グリーンランナー",
      "rarity": "common",
      "image": "/cosmetics/characters/green_runner_face.png"
    }
  ],
  "backgrounds": [
    {
      "id": "night_alley",
      "name": "夜の路地裏",
      "rarity": "common",
      "image": "/cosmetics/backgrounds/night_alley.png"
    }
  ],
  "items": [
    {
      "id": "black_round_glasses",
      "name": "黒ぶち丸メガネ",
      "rarity": "rare",
      "image": "/cosmetics/items/black_round_glasses.png"
    }
  ]
}
```

`rarity` は `common`、`rare`、`epic`、`legendary` のいずれかです。`image` は必ず `/cosmetics/` 配下の `.png` にしてください。

## Planned PNG Files

まだ実ファイルは入れていません。画像が完成したら、以下のファイル名で配置してください。

```text
public/cosmetics/characters/green_runner_face.png
public/cosmetics/characters/cool_night_face.png
public/cosmetics/characters/pink_idol_face.png
public/cosmetics/characters/cosmic_face.png

public/cosmetics/backgrounds/night_alley.png
public/cosmetics/backgrounds/neon_city.png
public/cosmetics/backgrounds/sunset_beach.png
public/cosmetics/backgrounds/cosmic_galaxy.png

public/cosmetics/items/black_round_glasses.png
public/cosmetics/items/jeweled_gold_crown.png
public/cosmetics/items/pink_star_hair_clip.png
public/cosmetics/items/cyber_blue_visor.png
```

## Add A New Character

1. PNG を `public/cosmetics/characters/` に置きます。
2. `manifest.json` の `characters` に `id`、`name`、`rarity`、`image` を追加します。
3. `npm run validate:cosmetics` で厳密チェックします。

## Add A New Background

1. PNG を `public/cosmetics/backgrounds/` に置きます。
2. `manifest.json` の `backgrounds` に登録します。
3. 背景は横長プレビューで表示されるため、横長構図の PNG が見栄えします。

## Add A New Item

1. PNG を `public/cosmetics/items/` に置きます。
2. `manifest.json` の `items` に登録します。
3. アクセサリーはキャラ上に載せる想定なので、透明背景 PNG が扱いやすいです。

## Validation

PNG がまだ無い、メタデータだけ準備した状態ではこちらを使います。

```bash
npm run validate:cosmetics:metadata
npm run cosmetics:missing
```

PNG を置いたあと、TestFlight やリリース前はこちらを使います。

```bash
npm run validate:cosmetics
npm run build
npx cap sync ios
```

`validate:cosmetics:metadata` は manifest の構造、id 重複、rarity、image path を検証し、未配置 PNG は `TODO` として表示します。`validate:cosmetics` は strict mode なので、PNG が存在しない、空ファイル、PNG ではない場合に失敗します。

## Optional Import Helper

以下のフォルダに画像を書き出しておくと、まとめて `public/cosmetics/` へコピーできます。

```text
~/Downloads/emotion_game_cosmetics/characters/
~/Downloads/emotion_game_cosmetics/backgrounds/
~/Downloads/emotion_game_cosmetics/items/
```

```bash
npm run cosmetics:import
npm run cosmetics:missing
npm run validate:cosmetics
```

存在するファイルだけコピーし、無いファイルは missing として表示します。
