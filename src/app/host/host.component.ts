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
import qrcodeParser from 'qrcode-parser';

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

  // 同イベントのリアルタイム視聴時に記録したコメント
  // (アーカイブ視聴時にコメントのマージを行うために使用)
  public realtimeRecordedComments: Comment[] = [];

  // リアルタイム視聴時のコメントに対する再生位置 (秒数) の補完
  isRunningMergeRealtimeRecordedComments = false;

  // 汎用
  public objectKeys = Object.keys;

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

    this.startMessagingWithAsBridge();

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
   * AsBridge (アソビステージのページに注入されたスクリプト) からのメッセージ受信の待受開始
   */
  protected startMessagingWithAsBridge() {
    window.addEventListener(
      'message',
      (message: MessageEvent) => {
        switch (message.data.type) {
          case 'COMMENTS_RECEIVED':
            this.onReceiveCommentsFromAsBridge(
              message.data.comments,
              message.data.eventName,
              message.data.currentTimeSeconds
            );
            break;
          case 'PLAYER_CURRENT_TIME_CHANGED':
            this.onReceivePlayerCurrentTimeFromAsBridge(
              message.data.currentTimeSeconds
            );
            break;
          case 'QR_CODE_OF_ASOBI_LIGHT_RECEIVED':
            this.onReceiveQrCodeOfAsobiLightFromAsBridge(message.data.dataUrl);
            break;
          default:
            console.warn(
              '[HostComponent] startMessagingWithAsBridge',
              'Unknown message received...',
              message
            );
        }
      },
      false
    );
  }

  /**
   * AsBridge (アソビステージのページに注入されたスクリプト) からコメントを受信したときに呼ばれるイベントリスナ
   * @param comments 受信したコメント
   * @param eventName 受信したイベント名
   * @param currentTimeSeconds 受信した再生位置 (アーカイブ視聴時のみ。リアルタイム視聴時は undefined。)
   */
  protected async onReceiveCommentsFromAsBridge(
    comments: Comment[],
    eventName: string,
    currentTimeSeconds?: number
  ) {
    if (eventName !== undefined && this.eventName !== eventName) {
      // イベント名が設定されたとき
      console.log('onReceiveCommentsFromAsBridge - eventName = ', eventName);
      this.eventName = eventName;

      if (this.pageType === 'ARCHIVE_PLAY_PAGE') {
        // アーカイブ視聴画面ならば、リアルタイム視聴時に記録したコメントがないか検索
        this.realtimeRecordedComments =
          await this.commentRecorder.getCommentsWithTimeSecondsEmptyByEventName(
            eventName
          );
        if (0 < this.realtimeRecordedComments.length) {
          this.snackBar.open(
            `リアルタイム視聴時に記録されたコメントが ${this.realtimeRecordedComments.length} 件あります。アーカイブ再生を行うと、一致したコメントをもとにタイムスタンプを補完できます。`,
            undefined,
            {
              duration: 5000,
            }
          );
        }
        console.log(
          'onReceiveCommentsFromAsBridge - realtimeRecordedComments = ',
          this.realtimeRecordedComments
        );
        return;
      } else {
        this.realtimeRecordedComments = undefined;
      }
    }

    if (currentTimeSeconds !== undefined) {
      currentTimeSeconds = Math.floor(currentTimeSeconds);
    }

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
      // (ただし、リアルタイム視聴時は -1 とする)
      comment.timeSeconds =
        this.pageType === 'ARCHIVE_PLAY_PAGE' &&
        currentTimeSeconds !== undefined
          ? currentTimeSeconds
          : -1;

      // コメントを配列へ追加
      this.allComments[comment.id] = comment;
      newComments.push(comment);
    }

    if (newComments.length <= 0) {
      return;
    }

    this.latestComments = newComments;

    console.log(
      `onReceiveCommentsFromAsBridge - new comments (${newComments.length}) = `,
      newComments
    );

    // コメントをオーバレイ表示
    const shouldShowOverlay =
      (this.pageType === 'REALTIME_PLAY_PAGE' &&
        this.config.commentOverlay.isEnableCommentOverlayOnRealtimeView) ||
      (this.pageType === 'ARCHIVE_PLAY_PAGE' &&
        this.config.commentOverlay.isEnableCommentOverlayOnArchiveView);
    if (shouldShowOverlay) {
      this.hostService.showOverlayComments(newComments);
    }

    // コメントをビューアへ転送
    this.sendMessageToViewer({
      type: 'COMMENTS_RECEIVED',
      comments: newComments,
    });

    // ページ種別に応じて処理
    if (this.pageType === 'REALTIME_PLAY_PAGE') {
      // リアルタイム視聴ページの場合・・・

      // コメントをデータベースへ保存
      for (const comment of newComments) {
        // データベースへ保存 (存在しない場合のみ)
        try {
          await this.commentRecorder.registerComment(
            this.eventName,
            comment,
            false
          );
        } catch (e: any) {
          console.warn(e);
        }
      }
    } else if (this.pageType === 'ARCHIVE_PLAY_PAGE') {
      // アーカイブ視聴ページの場合・・・

      // コメントをデータベースへ保存
      for (const comment of newComments) {
        // コメントをデータベースに登録済みか確認
        const registeredComment = await this.commentRecorder.getCommentById(
          comment.id
        );

        if (
          registeredComment !== undefined &&
          registeredComment.timeSeconds !== -1
        ) {
          // コメントがデータベースに登録済みであり、かつ、コメントの再生位置 (秒数) が設定済みならば

          const diffSeconds = Math.abs(
            registeredComment.timeSeconds - comment.timeSeconds
          );
          if (diffSeconds <= 5 || 60 * 5 <= diffSeconds) {
            // データベース上のコメントと当該コメントの再生位置 (秒数) が5秒未満なら、または5分以上あるなら、何もしない
            continue;
          }

          // データベース上のコメントと当該コメントの再生位置 (秒数) が異なる場合は、その平均値で修正
          comment.timeSeconds =
            (registeredComment.timeSeconds + comment.timeSeconds) / 2;
        }

        // データベースへ保存 (存在する場合は上書き保存)
        await this.commentRecorder.registerComment(
          this.eventName,
          comment,
          true
        );
      }

      // リアルタイム視聴で記録されたコメントがあれば、コメントをマージ
      if (
        !this.isRunningMergeRealtimeRecordedComments &&
        this.realtimeRecordedComments !== undefined &&
        0 < this.realtimeRecordedComments.length
      ) {
        this.isRunningMergeRealtimeRecordedComments = true;
        const merged = await this.mergeRealtimeRecordedComments(
          Object.values(this.allComments)
        );

        this.isRunningMergeRealtimeRecordedComments = false;
        if (merged) {
          // マージが行われた場合は、リアルタイム視聴時に記録したコメントをクリア
          this.realtimeRecordedComments = [];
        }
      }
    }
  }

  /**
   * アーカイブ視聴時のコメントを基にした、リアルタイム視聴時のコメントに対する再生位置 (秒数) の補完 (マージ)
   * @param comments アーカイブ視聴時のコメント
   * @returns 補完が行われたか否か
   */
  async mergeRealtimeRecordedComments(comments: Comment[]) {
    if (!this.realtimeRecordedComments) {
      return false;
    } else if (comments.length <= 1) {
      console.log(
        `[HostComponent] mergeRealtimeRecordedComments - Too few comments (${comments.length})`
      );
      return false;
    }

    // アーカイブ視聴時に記録したコメントがあれば、一致するものを抽出
    let matchedComments: { archive: Comment; realtimeRecorded: Comment }[] = [];
    for (const comment of comments) {
      for (const realtimeRecordedComment of this.realtimeRecordedComments) {
        console.log(comment.comment, realtimeRecordedComment.comment);
        if (
          comment.nickname === realtimeRecordedComment.nickname &&
          comment.comment === realtimeRecordedComment.comment
        ) {
          matchedComments.push({
            realtimeRecorded: realtimeRecordedComment,
            archive: comment,
          });
          break;
        }
      }
    }

    const rateOfMatchedCommentsWithRealtimeRecordedComments =
      matchedComments.length / comments.length;
    if (rateOfMatchedCommentsWithRealtimeRecordedComments < 0.7) {
      // 70%未満の一致ならば、何もしない
      console.log(
        `[HostComponent] mergeRealtimeRecordedComments - Not matched`,
        rateOfMatchedCommentsWithRealtimeRecordedComments,
        matchedComments
      );
      return false;
    }

    // 70%以上一致した場合は、アーカイブ視聴時に記録したコメントの再生位置 (秒数) を補完
    console.log(
      `[HostComponent] mergeRealtimeRecordedComments - filling up...`,
      rateOfMatchedCommentsWithRealtimeRecordedComments,
      matchedComments
    );

    const message = this.snackBar.open(
      `リアルタイム視聴時のコメントとマージしています... しばらくお待ちください...`
    );

    await this.hostService.asyncTimeout(200);

    try {
      await this.commentRecorder.fillUpTimeSecondsToCommentsBySampledComments(
        this.eventName,
        matchedComments,
        this.realtimeRecordedComments
      );
    } catch (e: any) {
      console.error(e);
      message.dismiss();
      this.snackBar.open(
        `コメントのマージに失敗しました... ${e.toString()}`,
        'OK'
      );
      return false;
    }

    message.dismiss();

    return true;
  }

  /**
   * AsBridge (アソビステージのページ) から映像の再生位置を受信したときに呼ばれるイベントリスナ
   * @param currentTime 受信した再生位置 (例: '00:01:30')
   */
  protected async onReceivePlayerCurrentTimeFromAsBridge(
    currentTimeSeconds: number
  ) {
    currentTimeSeconds = Math.floor(currentTimeSeconds);
    console.log('onReceivePlayerCurrentTimeFromAsBridge', currentTimeSeconds);

    if (3 <= Math.abs(this.playerCurrentTimeSeconds - currentTimeSeconds)) {
      // 3秒以上の差があれば、シークしたとみなし、既存のオーバレイ再生済みのコメントをクリア
      this.allComments = {};
      console.log(
        'onReceivePlayerCurrentTimeFromAsBridge - Resetting allComments'
      );
    }

    this.playerCurrentTimeSeconds = currentTimeSeconds;
  }

  protected async onReceiveQrCodeOfAsobiLightFromAsBridge(dataUrl: string) {
    if (!dataUrl) return;
    console.log(
      '[HostComponent] onReceiveQrCodeOfAsobiLightFromAsBridge - QR Code = ',
      dataUrl
    );

    let parsedString;
    try {
      parsedString = await qrcodeParser(dataUrl);
    } catch (e) {
      console.error(
        '[HostComponent] onReceiveQrCodeOfAsobiLightFromAsBridge - Failed to parse QR Code',
        e
      );
      return;
    }

    if (
      !parsedString.startsWith('http://') &&
      !parsedString.startsWith('https://')
    ) {
      console.error(
        '[HostComponent] onReceiveQrCodeOfAsobiLightFromAsBridge - Invalid url',
        parsedString
      );
      return;
    }

    console.log(
      '[HostComponent] onReceiveQrCodeOfAsobiLightFromAsBridge - Sending AsobiLight url to viewer...',
      parsedString
    );
    this.sendMessageToViewer({
      type: 'URL_OF_ASOBI_LIGHT_RECEIVED',
      url: parsedString,
    });
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
      case 'GET_URL_OF_ASOBI_LIGHT':
        console.log(
          'onReceiveMessageFromViewer - Requesting DataURL of QRCode for AsobiLight...',
          this.viewerHeartbeatReceivedAt
        );
        this.hostService.requestQrCodeDataUrlOfAsobiLight();
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
