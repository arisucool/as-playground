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
import { HostConfig, HostTabName } from './model/config.interface';

@Component({
  selector: 'app-host',
  templateUrl: './host.component.html',
  styleUrls: ['./host.component.scss'],
})
export class HostComponent implements OnInit {
  // 設定情報
  config: HostConfig;

  // スマートフォン連携 (コメントをスマートフォンなどから閲覧する機能) に関する変数
  public peer: Peer;
  public peerId: string;
  public viewerUrl: string;
  protected dataConnection: DataConnection;
  protected viewerConnectionCheckTimer: Subscription;
  protected viewerHeartbeatReceivedAt: Date;
  protected readonly HEARTBEAT_DISCONTINUED_THRESHOLD_INTERVAL_MILISECONDS = 10000;

  // ページの種別
  public pageType: 'REALTIME_PLAY_PAGE' | 'ARCHIVE_PLAY_PAGE' | 'UNKNOWN';

  // アクティブなタブ
  public activeTabName: HostTabName;

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

  constructor(
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private commentRecorder: CommentRecorderService,
    private dialog: MatDialog,
    private hostService: HostService
  ) {}

  /**
   * コンポーネントが初期化されるときに呼び出されるイベントリスナ
   */
  async ngOnInit() {
    this.loadConfig();

    switch (this.route.snapshot.queryParams.pageType) {
      case 'ARCHIVE_PLAY_PAGE':
      //this.commentLoader.start();
      case 'REALTIME_PLAY_PAGE':
        this.pageType = this.route.snapshot.queryParams.pageType;
        break;
      default:
        this.pageType = 'UNKNOWN';
    }

    if (this.pageType != 'UNKNOWN') {
      this.initPeer();
    }

    this.startMessagingWithHostScript();

    await this.commentRecorder.connectDb();

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
   * 表示するタブの切り替え
   * @param tabName タブ名
   */
  setActiveTab(tabName: HostTabName) {
    this.activeTabName = tabName;
    this.config.general.activeTabName = tabName;
    this.hostService.saveConfig();
  }

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
  protected loadConfig(): void {
    this.config = this.hostService.getConfig();
    this.activeTabName = this.config.general.activeTabName;
  }

  /**
   * Skyway のための Peer の初期化
   * (スマートフォン連携のための待受を開始)
   */
  protected initPeer(): void {
    if (this.peer) {
      this.peer = null;
    }

    const previousPeerId = window.sessionStorage.getItem('skywayPeerId');
    if (previousPeerId) {
      console.log('Initializing Peer...', previousPeerId);
      this.peer = new Peer(previousPeerId, { key: environment.skyWayApiKey });
    } else {
      console.log('Initializing Peer...');
      this.peer = new Peer({ key: environment.skyWayApiKey });
    }

    this.peer.on('open', () => {
      this.peerId = this.peer.id;
      this.viewerUrl = this.hostService.generateViewerUrl(this.peerId);

      this.changeDetectorRef.detectChanges();

      // Peer ID を保存
      window.sessionStorage.setItem('skywayPeerId', this.peerId);
    });

    this.peer.on('close', () => {
      window.setTimeout(() => {
        this.initPeer();
      }, 5000);
    });

    this.peer.on('connection', (dataConnection) => {
      this.viewerHeartbeatReceivedAt = new Date();
      if (this.dataConnection) {
        console.log('Already connected with other viewer');
        return;
      }

      dataConnection.once('open', () => {
        console.log('Data connection opened.');
        this.viewerHeartbeatReceivedAt = new Date();

        this.sendMessageToViewer({
          type: 'COMMENTS_RECEIVED',
          comments: this.latestComments,
        });

        this.hostService.setIframeVisiblity(false);
      });

      dataConnection.on('data', (data) => {
        const parsedData = JSON.parse(decodeURIComponent(data));
        this.onReceiveMessageFromViewer(parsedData);
      });

      dataConnection.once('close', () => {
        console.log('Data connection closed.');
        this.dataConnection = null;
        this.hostService.setIframeVisiblity(true);
        this.changeDetectorRef.detectChanges();
      });

      this.dataConnection = dataConnection;
      this.changeDetectorRef.detectChanges();
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

    // コメントをビューアへ転送
    this.sendMessageToViewer({
      type: 'COMMENTS_RECEIVED',
      comments: comments,
    });

    // ページ種別に応じて処理
    if (this.pageType === 'REALTIME_PLAY_PAGE') {
      // コメントをオーバレイ表示
      if (this.config.commentOverlay.isEnableCommentOverlayOnRealtimeView) {
        this.hostService.showOverlayComments(newComments);
      }
    } else if (this.pageType === 'ARCHIVE_PLAY_PAGE') {
      // コメントをオーバレイ表示
      if (this.config.commentOverlay.isEnableCommentOverlayOnArchiveView) {
        this.hostService.showOverlayComments(newComments);
      }

      // コメントをデータベースへ保存
      for (const comment of newComments) {
        await this.commentRecorder.registerComment(this.eventName, comment);
      }
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
  protected sendMessageToViewer(message: any) {
    if (!this.dataConnection) {
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
