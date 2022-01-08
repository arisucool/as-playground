# asobi-stage-playground

## できること

- コメントのスマートフォン連携

  - アソビステージのコメントをスマートフォンなどの別端末・別画面から閲覧できます。

## Q＆A

### WebRTC (SkyWay) の使用目的は？

なるべくサーバを介さず、テキストチャットの送受信を行うためです。映像や音声は扱っていません。
また、SkyWay を利用しているのは開発工数を下げるためです。

### 荒らし対策・踏み台対策はありますか？

アソビステージを閲覧している各端末 (PC など) に対し、別端末 (スマートフォンなど) を 1 台までしか連携できません。
また他者から推測困難なランダムなトークンによって接続します。

### アソビステージについて

アソビステージは、アソビストア (BANDAI NAMCO Entertainment Inc.) 様が運営されているサービスであり商標です。
対して、本プロジェクトは関係のない個人が開発しています。

## 開発について

### Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

### Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

### Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

### Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

### Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

### Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
