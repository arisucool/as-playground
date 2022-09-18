import { ThrowStmt } from '@angular/compiler';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';

import { environment } from './../../environments/environment';
import { Comment } from './model/comment.interface';
import { CommentRecorderService } from './comment-recorder.service';
import { MatDialog } from '@angular/material/dialog';
import { CommentBackupDialogComponent } from './comment-backup/comment-backup-dialog.component';
import { HostService } from './host.service';
import { Subscription } from 'rxjs/internal/Subscription';
import { interval } from 'rxjs/internal/observable/interval';
import { ViewerMessage } from '../common/viewer-message.interface';
import { HostAvailableFunctions } from '../common/host-available-functions.interface';

@Component({
  selector: 'app-host',
  templateUrl: './host.component.html',
  styleUrls: ['./host.component.scss'],
})
export class HostComponent implements OnInit {
  // コメントのスマートフォン連携
  public peer: Peer;
  public peerId: string;
  public viewerUrl: string;
  protected dataConnection: DataConnection;
  protected viewerConnectionCheckTimer: Subscription;
  protected viewerHeartbeatReceivedAt: Date;
  protected readonly HEARTBEAT_DISCONTINUED_THRESHOLD_INTERVAL_MILISECONDS = 10000;

  // ページの種別
  public pageType: string;

  // アクティブなタブ
  public activeTabName: 'mobileLink' | 'commentAnalysis' | 'chapter' =
    'mobileLink';

  // ローダー
  public loader: 'chrome_ext' | 'bookmarklet';

  // イベント名
  public eventName: string = null;

  // 映像の再生位置 (例: 90 = '00:01:30')
  public playerCurrentTimeSeconds: number;

  // 受信したすべてのコメント
  // (ただし、映像をシークしたときは、リセットされる)
  public allComments: { [key: string]: Comment } = {};

  // 最後に受信したコメント
  public latestComments: any[] = [];

  // 汎用
  public objectKeys = Object.keys;

  // コメント投稿の可否
  public availableFunctions: HostAvailableFunctions = {
    postComment: false,
  };

  constructor(
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private commentRecorder: CommentRecorderService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private hostService: HostService
  ) {}

  /**
   * コンポーネントが初期化されるときに呼び出されるイベントリスナ
   */
  async ngOnInit() {
    this.loadConfig();

    // ホストスクリプト (アソビステージのページ) によって指定されたパラメータを取得
    const queryParams = this.route.snapshot.queryParams || {};

    // ホストスクリプト (アソビステージのページ) によって識別されたページの種別を取得
    switch (queryParams.pageType) {
      case 'ARCHIVE_PLAY_PAGE':
      //this.commentLoader.start();
      case 'REALTIME_PLAY_PAGE':
        this.pageType = queryParams.pageType;
        break;
      default:
        this.pageType = 'UNKNOWN';
    }

    // ローダーを識別
    this.loader = queryParams.loader;

    // 利用可能な機能を設定
    const availableFunctions = queryParams.availableFunctions
      ? queryParams.availableFunctions.split(/,/)
      : [];
    this.availableFunctions = {
      postComment: availableFunctions.includes('postComment'),
    };

    // 初期化
    if (this.pageType != 'UNKNOWN') {
      // コメントのスマートフォン連携を行うために SkyWay の Peer オブジェクトを初期化
      this.initPeer();
    }

    // IndexedDB のインスタンスを初期化
    await this.commentRecorder.connectDb();

    // ホストスクリプト (アソビステージのページ) とのメッセージ通信を開始
    this.startMessagingWithHostScript();

    // ビューア (連携中のスマートフォンなど) との接続状態を定期確認するためのタイマを開始
    this.viewerConnectionCheckTimer = interval(1000).subscribe(async () => {
      this.checkConnectionForViewer();
    });
  }

  /**
   * コンポーネントが破棄されるときに呼び出されるイベントリスナ
   */
  ngOnDestroy(): void {}

  /**
   * コメントのインポート/エクスポートダイアログの表示
   */
  openCommentBackupDialog() {
    const dialogRef = this.dialog.open(CommentBackupDialogComponent);
    dialogRef.afterClosed().subscribe(async (result) => {
      // TODO:
    });
  }

  /**
   * 設定の読み込み
   */
  protected loadConfig(): void {}

  /**
   * Skyway のための Peer の初期化
   * (コメントのスマートフォン連携のための待受を開始)
   */
  protected initPeer(): void {
    if (this.peer) {
      this.peer = null;
    }

    console.log('Initializing Peer...');
    this.peer = new Peer({ key: environment.skyWayApiKey });

    this.peer.on('open', () => {
      this.peerId = this.peer.id;
      this.viewerUrl = this.hostService.generateViewerUrl(this.peerId);

      this.hostService.setIframeVisiblity(true);

      this.changeDetectorRef.detectChanges();
    });

    this.peer.on('close', () => {
      window.setTimeout(() => {
        this.initPeer();
      }, 5000);
    });

    this.peer.on('connection', (dataConnection) => {
      this.onConnectFromViewer(dataConnection);
    });
  }

  /**
   * ホストスクリプト (アソビステージのページ) からのメッセージ受信の待受開始
   */
  protected startMessagingWithHostScript() {
    window.addEventListener(
      'message',
      (message: MessageEvent) => {
        switch (message.data.type) {
          case 'COMMENTS_RECEIVED':
            this.onReceiveCommentsFromHostScript(
              message.data.comments,
              message.data.eventName,
              message.data.currentTimeSeconds
            );
            break;
          case 'PLAYER_CURRENT_TIME_CHANGED':
            this.onReceivePlayerCurrentTimeFromHostScript(
              message.data.currentTimeSeconds
            );
            break;
          case 'ERROR_OCCURRED_ON_HOST_SCRIPT':
            this.onReceiveErrorFromHostScript(message.data.errorMessage);
          default:
            console.warn(
              'startMessagingWithHostScript',
              'Unknown message received...',
              message
            );
        }
      },
      false
    );
  }

  /**
   * ホストスクリプト (アソビステージのページ) からコメントを受信したときに呼ばれるイベントリスナ
   * @param comments 受信したコメント
   * @param eventName 受信したイベント名
   * @param currentTimeSeconds 受信した再生位置
   */
  protected async onReceiveCommentsFromHostScript(
    comments: Comment[],
    eventName: string,
    currentTimeSeconds: number
  ) {
    if (this.eventName !== eventName) {
      console.log('onReceiveCommentsFromHostScript - eventName = ', eventName);
      this.eventName = eventName;
    }

    currentTimeSeconds = Math.floor(currentTimeSeconds);

    // 新しいコメントのみを抽出
    // (コメントの取得は、コメントリストのDOM要素から行なっており、ユーザがコメントリストのスクロールを行うと、重複してコメントが取得される場合があるため。)
    const newComments = [];
    for (let comment of comments) {
      // コメントのIDを生成
      comment.id = this.commentRecorder.getId(
        eventName,
        comment.nickname,
        comment.comment
      );

      if (comment.id in this.allComments) {
        // すでに同じコメントを受信済みならばスキップ
        continue;
      }

      // コメントの再生位置 (秒数) を設定
      comment.timeSeconds = currentTimeSeconds;

      // コメントを配列へ追加
      this.allComments[comment.id] = comment;
      newComments.push(comment);
    }

    if (newComments.length <= 0) {
      return;
    }

    this.latestComments = newComments;

    console.log(
      `onReceiveCommentsFromHostScript - new comments (${newComments.length}) = `,
      newComments
    );

    // オーバレイでコメントを表示
    this.hostService.showOverlayComments(newComments);

    // コメントをビューアへ転送
    this.sendMessageToViewer({
      type: 'COMMENTS_RECEIVED',
      comments: comments,
    });

    // コメントをデータベースへ保存
    for (const comment of newComments) {
      await this.commentRecorder.registerComment(this.eventName, comment);
    }
  }

  /**
   * ホストスクリプト (アソビステージのページ) から映像の再生位置を受信したときに呼ばれるイベントリスナ
   * @param currentTime 受信した再生位置 (例: '00:01:30')
   */
  protected async onReceivePlayerCurrentTimeFromHostScript(
    currentTimeSeconds: number
  ) {
    currentTimeSeconds = Math.floor(currentTimeSeconds);
    console.log('onReceivePlayerCurrentTimeFromHostScript', currentTimeSeconds);

    if (3 <= Math.abs(this.playerCurrentTimeSeconds - currentTimeSeconds)) {
      // 3秒以上の差があれば、シークしたとみなし、既存のオーバレイ再生済みのコメントをクリア
      this.allComments = {};
      console.log(
        'onReceivePlayerCurrentTimeFromHostScript - Resetting allComments'
      );
    }

    this.playerCurrentTimeSeconds = currentTimeSeconds;
  }

  protected onReceiveErrorFromHostScript(errorMessage: string) {
    this.snackBar.open(`エラー: ${errorMessage}`, undefined, {
      duration: 5000,
    });

    this.sendMessageToViewer({
      type: 'ERROR_OCCURRED',
      errorMessage: errorMessage,
    });
  }

  /**
   * ビューア (連携中のスマートフォンなど) から接続されたときに呼ばれるイベントリスナ
   * @param dataConnection メッセージを送受信するためのデータコネクション
   */
  protected onConnectFromViewer(dataConnection: DataConnection) {
    if (this.dataConnection) {
      console.warn(
        'onConnectFromViewer - Closing DataConnection immediately, because already connected with other viewer'
      );
      dataConnection.close();
      return;
    }

    this.viewerHeartbeatReceivedAt = new Date();

    dataConnection.once('open', () => {
      // ビューアとのデータコネクションが確立されたとき
      console.log('onConnectFromViewer - DataConnection opened');
      this.viewerHeartbeatReceivedAt = new Date();

      // 接続時のメッセージを送信
      this.sendMessageToViewer({
        type: 'GREETING',
        comments: this.latestComments,
        availableFunctions: this.availableFunctions,
        hostLoader: this.loader,
      });

      // as-playground を折りたたむ
      this.hostService.setIframeVisiblity(false);
    });

    dataConnection.on('data', (data) => {
      // ビューアとのデータコネクションでメッセージを受信したとき
      const parsedData = JSON.parse(decodeURIComponent(data));
      this.onReceiveMessageFromViewer(parsedData);
    });

    dataConnection.once('close', () => {
      // ビューアとのデータコネクションが切断されたとき
      console.log('onConnectFromViewer - DataConnection closed');
      this.dataConnection = null;

      // as-playground を展開
      this.hostService.setIframeVisiblity(true);

      // 状態変更を明示的に反映
      this.changeDetectorRef.detectChanges();
    });

    this.dataConnection = dataConnection;

    // 状態変更を明示的に反映
    this.changeDetectorRef.detectChanges();
  }

  /**
   * ビューア (連携中のスマートフォンなど) からメッセージを受信したときに呼ばれるイベントリスナ
   * @param message 受信したメッセージ
   */
  protected onReceiveMessageFromViewer(message: any) {
    if (!message.type) return;

    switch (message.type) {
      case 'HEARTBEAT':
        this.viewerHeartbeatReceivedAt = new Date();
        console.log(
          'onReceiveMessageFromViewer - Received heartbeat from viewer',
          this.viewerHeartbeatReceivedAt
        );
        break;
      case 'POST_COMMENT':
        console.log(
          'onReceiveMessageFromViewer - Received post comment request from viewer',
          message
        );
        this.hostService.postComment(message.nickname, message.comment);
        break;
      default:
        console.warn(
          'onReceiveMessageFromViewer - Unknown message received...',
          message
        );
    }
  }

  /**
   * ビューア (連携中のスマートフォンなど) に対するメッセージの送信
   * @param message 送信するメッセージ
   */
  protected sendMessageToViewer(message: ViewerMessage) {
    if (!this.dataConnection) {
      console.log('transferMessageToViewer', 'Canceled');
      return;
    }
    console.log('transferMessageToViewer', message);
    this.dataConnection.send(encodeURIComponent(JSON.stringify(message)));
  }

  /**
   * ビューア (連携中のスマートフォンなど) との接続状態の確認
   */
  protected checkConnectionForViewer() {
    const viewerHeartbeatReceivedAt = this.viewerHeartbeatReceivedAt
      ? this.viewerHeartbeatReceivedAt.getTime()
      : undefined;

    if (
      !this.dataConnection ||
      !this.dataConnection.open ||
      viewerHeartbeatReceivedAt === undefined
    ) {
      this.viewerHeartbeatReceivedAt = undefined;
      return false;
    }

    if (
      this.HEARTBEAT_DISCONTINUED_THRESHOLD_INTERVAL_MILISECONDS <=
      Date.now() - viewerHeartbeatReceivedAt
    ) {
      console.log('checkConnectionForViewer - Detected connection lost');
      this.dataConnection.close(true);
      this.dataConnection = undefined;
    }
  }
}
