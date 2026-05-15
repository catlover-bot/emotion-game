# BUILD_IOS

## 1. 依存関係を入れる

```bash
npm install
```

## 2. Web アセットをビルドする

```bash
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

## 6. 実機テスト

- シミュレータではカメラ挙動が不十分なことがあるため、必ず実機 iPhone でも確認します。
- 初回起動時にカメラ許可ダイアログが出ることを確認します。
- カメラ拒否後もタップ操作で継続できることを確認します。
- 表情認識が失敗してもクラッシュせず遊べることを確認します。

## 7. Archive と App Store Connect へのアップロード

1. Xcode で `Any iOS Device (arm64)` または接続中の実機を選びます。
2. `Product` → `Archive` を実行します。
3. Organizer で生成された Archive を選びます。
4. `Distribute App` → `App Store Connect` → `Upload` を選びます。
5. 自動署名を使う場合は、そのまま推奨設定で進めます。

## 8. TestFlight 用メモ

- TestFlight の説明文には、表情操作とタップ操作の両対応であることを書くと分かりやすいです。
- 審査メモには、カメラ用途が「表情でキャラクターを操作するため」であり、映像は端末内処理で保存・送信しないことを明記します。
- App Store Connect の Privacy Nutrition Label は、実装に合わせて慎重に入力します。

## 9. トラブルシュート

- `npm run build` が失敗したら、TypeScript エラーを先に解消します。
- `npx cap sync ios` が失敗したら、`npm install` 済みか確認します。
- CocoaPods 関連で失敗したら、Xcode / Command Line Tools / CocoaPods の状態を確認します。
- 権限文言を更新したあとは、再度 `npx cap sync ios` を実行して Xcode 側に反映します。
