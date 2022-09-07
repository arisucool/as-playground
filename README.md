# as-playground

<img src="https://raw.githubusercontent.com/arisucool/as-playground/master/src/assets/icon.png" alt="as-playground" width="128px" height="128px">

アソビステージをちょっと便利にする遊び場 by arisu.cool 🍓

---

## できること

- ニコニコ風のコメント表示

  - ニコニ ○ 動画のようにコメントをオーバレイ表示できます。

- コメントのグラフ化

  - コメントの流速をグラフにすることで、盛り上がったポイントがわかります。
  - グラフの点をクリックすると、その付近にシークできます。

- 曲名コメントからのチャプタ生成

  - 曲名コメントを検出し、チャプタを自動生成して一覧表示します。
  - チャプタをクリックすると、楽曲付近にシークできます。

- コメントのスマートフォン連携

  - アソビステージのコメントを本人の別端末 (スマートフォンなど) から閲覧できます。
  - 使用例: テレビやプロジェクタなどの大画面でライブを鑑賞しながら、手元にあるスマートフォンで快適にコメントを閲覧...。

---

## 使い方

アソビステージを視聴する端末は、PC ですか？もしくは iPad などのタブレットですか？
端末に応じて、以下のどちらかのバージョンをご利用ください。

※ 尚、ご利用になられた時点で [ご承諾事項](#terms-of-agreements) に同意いただいたものといたします。

### ブックマークレット版　(iPad や Android タブレットの方)

https://arisucool.github.io/as-playground/

### Chrome 拡張機能版　(PC 向け)

→ [as-playground-chrome-extension](https://github.com/arisucool/as-playground-chrome-extension) (開発中)

---

## ご承諾事項 <a name="terms-of-agreements"></a>

- 本プロジェクト (as-playground) は、アソビステージの運営者様と全く関係のない一個人が利便性向上のために開発しています。<br>尚、アソビステージは、アソビストア (BANDAI NAMCO Entertainment Inc.) 様が運営されているサービスであり商標です。

- 本プロジェクトのソフトウェアは、開発時点において、アソビステージの規約に抵触しない範囲かつ、運営者様にご迷惑をおかけしないように配慮して開発しております。ただし、お使いになるまえに、ご自身で規約を確認されることをおすすめいたします。

- 本プロジェクトのソフトウェアは自己責任のもとでご使用ください。使用によって生じた損害等について、一切の責任を負いかねます。

- 本プロジェクトに関するご意見やお問い合わせは、GitHub または Twitter (＠[arisucool](https://twitter.com/arisucool)) にてお受けいたします。<br>くれぐれも、ご迷惑となりますので、アソビステージの運営者様に対しては絶対に送らないでください。もし万が一、運営者様にご迷惑をおかけする事態となった場合は、本プロジェクトを終了いたします。

---

## Q＆A

### WebRTC (SkyWay) の使用目的は？

「コメントのスマートフォン連携」で使用しています。

具体的には、本人の端末間でコメントを転送する際、なるべくサーバを介さずに、端末間で完結させるために WebRTC を使用しています。
また、SkyWay を利用しているのは開発工数を下げるためです。

※アソビステージの映像や音声は一切扱っていません。今後も扱いません！

### 荒らし対策・踏み台対策はありますか？

アソビステージを閲覧している各端末 (PC など) に対し、別端末 (スマートフォンなど) を 1 台までしか連携できません。
また他者から推測困難なランダムなトークンによって接続します。

### ブックマークレットにしている理由は？

メイン端末 (アソビステージを閲覧する端末) として、PC だけでなく、iPad や iOS なども使用できるようにするためです。

例えば、iPadOS の Google Chrome でライブ鑑賞しながら、iPhone でコメントを閲覧することができます。

---

## 開発について

[Wiki](https://github.com/arisucool/as-playground/wiki/dev-getstarted) をご覧ください。

※アソビステージの映像や音声は一切扱いません。またアソビステージの規約に抵触する行為は一切行いません。もし万が一、そのような Pull Request を提出いただいても、拒否をいたします。
