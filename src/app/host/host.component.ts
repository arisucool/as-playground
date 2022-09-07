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

@Component({
  selector: 'app-host',
  templateUrl: './host.component.html',
  styleUrls: ['./host.component.scss'],
})
export class HostComponent implements OnInit {
  public peer: Peer;
  public peerId: string;
  public viewerUrl: string;
  public dataConnection: DataConnection;

  // ページの種別
  public pageType: string;

  // アクティブなタブ
  public activeTabName: 'mobileLink' | 'commentAnalysis' = 'mobileLink';

  // コメント記録用
  public eventName: string = null;
  public latestComments: any[] = [];
  public isCommentRecorderEnabled = false;

  // コメント再生用
  public allComments: { [key: string]: Comment } = {};
  public playerCurrentTimeSeconds: number;

  // 汎用
  public objectKeys = Object.keys;

  constructor(
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private commentRecorder: CommentRecorderService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

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

  ngOnDestroy(): void {}

  loadConfig(): void {
    let isCommentRecorderEnabled = window.localStorage.getItem(
      'host_isCommentRecorderEnabled'
    );
    this.isCommentRecorderEnabled =
      isCommentRecorderEnabled && isCommentRecorderEnabled === 'true';
  }

  initPeer(): void {
    if (this.peer) {
      this.peer = null;
    }

    console.log('Initializing Peer...');
    this.peer = new Peer({ key: environment.skyWayApiKey });

    this.peer.on('open', () => {
      this.peerId = this.peer.id;
      this.viewerUrl = this.generateViewerUrl(this.peerId);

      this.setIframeVisiblity(true);

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
        this.transferMessageToViewer({
          type: 'COMMENTS_RECEIVED',
          comments: this.latestComments,
        });

        this.setIframeVisiblity(false);
      });

      dataConnection.on('data', (data) => {
        this.onReceiveMessageFromViewer(data);
      });

      dataConnection.once('close', () => {
        console.log('Data connection closed.');
        this.dataConnection = null;
        this.setIframeVisiblity(true);
        this.changeDetectorRef.detectChanges();
      });

      this.dataConnection = dataConnection;
      this.changeDetectorRef.detectChanges();
    });
  }

  startMessagingWithHostScript() {
    window.addEventListener(
      'message',
      (message: MessageEvent) => {
        console.log(
          'startMessagingWithHostScript',
          'message received...',
          message
        );

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
        }
      },
      false
    );
  }

  setIframeVisiblity(value: boolean) {
    this.transferMessageToHostScript({
      type: 'SET_IFRAME_VISIBILITY',
      value: value,
    });
  }

  transferMessageToHostScript(message: any) {
    window.parent.postMessage(message, '*');
  }

  async onReceiveCommentsFromHostScript(
    comments: Comment[],
    eventName: string
  ) {
    console.log('onReceiveCommentsFromHostScript', eventName, comments);

    this.eventName = eventName;

    const newComments = [];

    for (let comment of comments) {
      if (comment.id in this.allComments) continue;
      this.allComments[comment.id] = comment;
      newComments.push(comment);
    }

    this.latestComments = newComments;

    // オーバレイでコメントを表示
    this.transferMessageToHostScript({
      type: 'SHOW_OVERLAY_COMMENTS',
      comments: newComments,
    });

    // コメントをビューアへ転送
    this.transferMessageToViewer({
      type: 'COMMENTS_RECEIVED',
      comments: comments,
    });
  }

  async onReceivePlayerCurrentTimeFromHostScript(currentTime: string) {
    console.log('onReceivePlayerCurrentTimeFromHostScript', currentTime);
    const playerCurrentTimeSeconds = this.timeStringToSeconds(currentTime);

    if (
      3 <= Math.abs(this.playerCurrentTimeSeconds - playerCurrentTimeSeconds)
    ) {
      // 3秒以上の差があれば、シークしたとみなし、既存のオーバレイ再生済みのコメントをクリア
      this.allComments = {};
    }

    this.playerCurrentTimeSeconds = playerCurrentTimeSeconds;
  }

  transferMessageToViewer(message: any) {
    if (!this.dataConnection) {
      console.log('transferMessageToViewer', 'Canceled');
      return;
    }
    console.log('transferMessageToViewer', message);
    this.dataConnection.send(encodeURIComponent(JSON.stringify(message)));
  }

  onReceiveMessageFromViewer(message: string) {}

  openCommentBackupDialog() {
    const dialogRef = this.dialog.open(CommentBackupDialogComponent);
    dialogRef.afterClosed().subscribe(async (result) => {
      // TODO:
    });
  }

  generateViewerUrl(hostPeerId: string) {
    if (
      0 < document.getElementsByTagName('base').length &&
      document.getElementsByTagName('base')[0].href
    ) {
      return `${
        document.getElementsByTagName('base')[0].href
      }viewer/${hostPeerId}`;
    }
    return `${window.location.protocol}//${window.location.host}/viewer/${hostPeerId}`;
  }

  setCommentRecorderEnabled(enable: boolean) {
    this.isCommentRecorderEnabled = enable;
    window.localStorage.setItem(
      'host_isCommentRecorderEnabled',
      enable ? 'true' : 'false'
    );
  }

  protected timeStringToSeconds(timeString: string): number {
    let arr = timeString.split(':');
    if (arr.length == 3) {
      return (
        parseInt(arr[0], 10) * 60 * 60 +
        parseInt(arr[1], 10) * 60 +
        parseInt(arr[2], 10)
      );
    } else if (arr.length == 2) {
      return parseInt(arr[0], 10) * 60 + parseInt(arr[1], 10);
    } else if (arr.length == 1) {
      return parseInt(arr[0], 10);
    }

    return null;
  }
}
