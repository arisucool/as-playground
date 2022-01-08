# as-playground

https://arisucool.github.io/as-playground/

---

## できること

- コメントのスマートフォン連携

  - アソビステージのコメントを本人の別端末 (スマートフォンなど) から閲覧できます。
  - 例: テレビやプロジェクタなどの大画面でライブを鑑賞しながら、手元にあるスマートフォンで快適にコメントを閲覧...。

---

## Q＆A

### WebRTC (SkyWay) の使用目的は？

本人の端末間でコメントを転送する際、なるべくサーバを介さずに、その端末間で完結させるために WebRTC を使用しています。
また、SkyWay を利用しているのは開発工数を下げるためです。

※アソビステージの映像や音声は一切扱っていません。今後も扱いません！

### 荒らし対策・踏み台対策はありますか？

アソビステージを閲覧している各端末 (PC など) に対し、別端末 (スマートフォンなど) を 1 台までしか連携できません。
また他者から推測困難なランダムなトークンによって接続します。

### アソビステージについて

アソビステージは、アソビストア (BANDAI NAMCO Entertainment Inc.) 様が運営されているサービスであり商標です。
対して、本プロジェクトは関係のない個人が開発しています。

---

## 開発の初め方

### 1. SkyWay のアプリケーション登録

Skyway Community Edition (無料版) でアカウント登録し、アプリケーション登録を行ってください。

### 2. ソースコードの取得

```
$ git clone git@github.com:arisucool/as-playground.git

$ npm install
```

### 3. 環境設定ファイルの編集

環境設定ファイルを開き、SkyWay の API キーを記述してください。

`src/environments/environment.ts`:

```
export const environment = {
  production: false,
  skyWayApiKey: '********************************'
};
```

`src/environments/environment.prod.ts`:

```
export const environment = {
  production: true,
  skyWayApiKey: '********************************'
};
```

### 4. サーバの起動

以下のようにコマンドを実行してください。

```
$ ng run dev
```

開発用サーバが起動しますので、Web ブラウザで https://localhost:4200/ を開いてください。
