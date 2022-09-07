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
import { CommentLoaderService } from './comment-loader.service';
import { HostService } from './host.service';

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
  public dataConnection: DataConnection;

  // ページの種別
  public pageType: string;

  // アクティブなタブ
  public activeTabName: 'mobileLink' | 'commentAnalysis' | 'chapter' =
    'mobileLink';

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
      if (this.dataConnection) {
        console.log('Already connected with other viewer');
        return;
      }

      dataConnection.once('open', () => {
        console.log('Data connection opened.');
        this.sendMessageToViewer({
          type: 'COMMENTS_RECEIVED',
          comments: this.latestComments,
        });

        this.hostService.setIframeVisiblity(false);
      });

      dataConnection.on('data', (data) => {
        this.onReceiveMessageFromViewer(data);
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
              message.data.eventName
            );
            break;
          case 'PLAYER_CURRENT_TIME_CHANGED':
            this.onReceivePlayerCurrentTimeFromHostScript(
              message.data.currentTime
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
   */
  protected async onReceiveCommentsFromHostScript(
    comments: Comment[],
    eventName: string
  ) {
    if (this.eventName !== eventName) {
      console.log('onReceiveCommentsFromHostScript - eventName = ', eventName);
      this.eventName = eventName;
    }

    // 新しいコメントのみを抽出
    // (コメントの取得は、コメントリストのDOM要素から行なっており、ユーザがコメントリストのスクロールを行うと、重複してコメントが取得される場合があるため。)
    const newComments = [];
    for (let comment of comments) {
      if (comment.id in this.allComments) {
        // すでに同じコメントを受信済みならばスキップ
        continue;
      }

      // コメントの時刻を設定
      comment.receivedTime = this.playerCurrentTimeSeconds;

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
    currentTime: string
  ) {
    console.log('onReceivePlayerCurrentTimeFromHostScript', currentTime);

    if (currentTime.match(/^\d+:\d+$/)) {
      currentTime = `00:${currentTime}`;
    }

    const playerCurrentTimeSeconds =
      this.hostService.timeStringToSeconds(currentTime);

    if (
      3 <= Math.abs(this.playerCurrentTimeSeconds - playerCurrentTimeSeconds)
    ) {
      // 3秒以上の差があれば、シークしたとみなし、既存のオーバレイ再生済みのコメントをクリア
      this.allComments = {};
      console.log(
        'onReceivePlayerCurrentTimeFromHostScript - Resetting allComments'
      );
    }

    this.playerCurrentTimeSeconds = playerCurrentTimeSeconds;
  }

  /**
   * ビューア (連携中のスマートフォンなど) からメッセージを受信したときに呼ばれるイベントリスナ
   * @param message 受信したメッセージ
   */
  protected onReceiveMessageFromViewer(message: string) {}

  /**
   * ビューア (連携中のスマートフォンなど) に対するメッセージの送信
   * @param message 送信するメッセージ
   */
  protected sendMessageToViewer(message: any) {
    if (!this.dataConnection) {
      console.log('transferMessageToViewer', 'Canceled');
      return;
    }
    console.log('transferMessageToViewer', message);
    this.dataConnection.send(encodeURIComponent(JSON.stringify(message)));
  }
}
