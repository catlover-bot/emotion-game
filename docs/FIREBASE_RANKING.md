# FIREBASE RANKING

Build 23 では通常のランキングを Game Center ではなく Firebase Firestore に切り替えています。Firebase が未設定、通信不可、送信失敗の場合でも、アプリは `ローカル記録のみ` として安全に動作します。

## Environment Variables

Vite の環境変数として設定します。値がすべて揃っていない場合、Firestore は初期化されません。

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

## Collection

```text
emotion_runner_scores
```

各端末は anonymous な `device_id` を localStorage に保存し、その値を Firestore document id として使います。

## Document Fields

```text
device_id
nickname
best_score
best_combo
total_runs
total_coins
last_score
last_combo
equipped_character
equipped_background
equipped_item
created_at
updated_at
```

更新ルール:

- `best_score` は新しいスコアが高い場合だけ更新します。
- `best_combo` は新しい最大コンボが高い場合だけ更新します。
- `total_runs` はラン終了ごとに 1 増えます。
- `total_coins` はそのランで獲得したコイン分だけ増えます。
- `last_score` / `last_combo` は直近ランの結果として更新します。

## Data Not Uploaded

以下は Firestore に送信しません。

- カメラ画像
- 動画フレーム
- 顔ランドマーク
- 表情フレーム
- MediaPipe blendshape score
- raw expression score
- 音声
- Apple ID / Game Center player id
- ログイン情報

## Ranking UI

ランキング画面には以下を表示します。

- `自分の記録`
- `みんなのランキング`
- `更新`
- `ニックネーム変更`
- `診断情報をコピー`

通常UIでは以下を表示しません。

- `Game Center接続`
- `ランキングを表示`
- `実績を表示`

## Firestore Query

Top 50 を `best_score` 降順で取得します。

```text
collection: emotion_runner_scores
orderBy: best_score desc
limit: 50
```

## Suggested Firestore Rules

最初のTestFlightでは安全側に寄せて、想定外のフィールドを拒否する rules を推奨します。必要に応じて project policy に合わせて調整してください。

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /emotion_runner_scores/{deviceId} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly([
        'device_id',
        'nickname',
        'best_score',
        'best_combo',
        'total_runs',
        'total_coins',
        'last_score',
        'last_combo',
        'equipped_character',
        'equipped_background',
        'equipped_item',
        'created_at',
        'updated_at'
      ])
      && request.resource.data.device_id == deviceId
      && request.resource.data.nickname is string
      && request.resource.data.nickname.size() <= 16
      && request.resource.data.best_score is number
      && request.resource.data.best_combo is number
      && request.resource.data.total_runs is number
      && request.resource.data.total_coins is number;
    }
  }
}
```

## Diagnostics

Xcode Console で以下を検索します。

```text
EMOTION_RUNNER_RANKING
```

主なログ:

- `firebase configured true/false`
- `submit requested`
- `submit success`
- `submit failure`
- `fetch ranking requested`
- `fetch ranking success`
- `fetch ranking failure`
- `nickname updated`
- `local fallback used`

ランキング画面の `診断情報をコピー` には、Firebase設定状態、collection、device_id、nickname、最後のエラー、送信するデータ、送信しないデータが含まれます。

## QA

- Firebase env vars なしで起動し、`ローカル記録のみ` と表示されることを確認します。
- Firebase env vars ありでラン終了後に Firestore document が作成/更新されることを確認します。
- 高いスコアの時だけ `best_score` が更新されることを確認します。
- 高いコンボの時だけ `best_combo` が更新されることを確認します。
- `更新` で Top 50 が取得されることを確認します。
- `ニックネーム変更` が localStorage に保存されることを確認します。
- 通信失敗時も `オンラインランキング送信失敗` / `ローカル記録は保存済み` と表示され、プレイ継続できることを確認します。
- Firestore にカメラ画像、顔ランドマーク、表情フレーム、blendshape score が保存されていないことを確認します。
