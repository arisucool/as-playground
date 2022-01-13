import { ThrowStmt } from '@angular/compiler';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';

import { environment } from './../../environments/environment';
import { CommentRecorderService } from './comment-recorder.service';

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

  // コメント記録用
  public latestComments: any[] = [];
  public isCommentRecorderEnabled = false;

  // コメント再生用
  public playerFramePageOpened = false;
  public playerCurrentTimeSeconds: number;
  public commentRecordedEvents: {
    [key: string]: {
      eventName: string;
      allBeginningComments: Comment[];
      beginningComments: Comment[];
      beginningCommentIndex: number;
    };
  };
  public selectedRecordedEventName: string;
  public commentBeginningOffsetTimeSeconds: number = -1;

  // 汎用
  public objectKeys = Object.keys;

  constructor(
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private commentRecorder: CommentRecorderService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadConfig();

    switch (this.route.snapshot.queryParams.pageType) {
      case 'REALTIME_PLAY_PAGE':
      case 'ARCHIVE_PLAY_PAGE':
      case 'PLAYER_FRAME_PAGE':
        this.pageType = this.route.snapshot.queryParams.pageType;
        break;
      default:
        this.pageType = 'UNKNOWN';
    }

    if (this.pageType == 'REALTIME_PLAY_PAGE') {
      this.initPeer();
    } else if (this.pageType == 'PLAYER_FRAME_PAGE') {
      this.loadCommentRecordedEvents();
    }

    this.startMessagingWithHostScript();
  }

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

  async loadCommentRecordedEvents() {
    const eventNames = await this.commentRecorder.getEventNames();
    this.commentRecordedEvents = {};
    for (const eventName of eventNames) {
      const beginningComments =
        await this.commentRecorder.getCommentsByEventName(eventName, 100);
      this.commentRecordedEvents[eventName] = {
        eventName: eventName,
        allBeginningComments: beginningComments,
        beginningComments: beginningComments.slice(0, 4),
        beginningCommentIndex: 0,
      };
    }
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
            this.onReceiveCommentsFromHostScript(message.data.comments);
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

  async onReceiveCommentsFromHostScript(comments: Comment[]) {
    console.log('onReceiveCommentsFromHostScript', comments);

    this.latestComments = comments;

    // コメントをビューアへ転送
    this.transferMessageToViewer({
      type: 'COMMENTS_RECEIVED',
      comments: comments,
    });

    // コメントの記録
    if (this.isCommentRecorderEnabled) {
      let eventName =
        window.parent && window.parent.document.title
          ? window.parent.document.title.replace(
              / \| ASOBISTAGE \| アソビストア/,
              ''
            )
          : '不明';
      for (let comment of comments) {
        await this.commentRecorder.registerComment(eventName, comment);
      }
    }
  }

  async onReceivePlayerCurrentTimeFromHostScript(currentTime: string) {
    console.log('onReceivePlayerCurrentTimeFromHostScript', currentTime);
    this.playerCurrentTimeSeconds = this.timeStringToSeconds(currentTime);

    // コメント再生が有効ならば、オーバレイコメントを表示
    if (
      this.selectedRecordedEventName &&
      this.commentBeginningOffsetTimeSeconds != -1
    ) {
      const comments = await this.getCommentsOfCurrentTime();
      if (0 < comments.length) {
        this.transferMessageToHostScript({
          type: 'SHOW_OVERLAY_COMMENTS',
          comments: comments,
        });
      }
    }
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

  onSelectedRecordedEventName(event) {
    this.selectedRecordedEventName = event.value;
  }

  cancelCommentPlayback() {
    const eventName = this.selectedRecordedEventName;
    this.commentRecordedEvents[eventName].beginningCommentIndex = 0;
    this.commentRecordedEvents[eventName].beginningComments =
      this.commentRecordedEvents[eventName].allBeginningComments.slice(0, 4);
    this.selectedRecordedEventName = null;
    this.commentBeginningOffsetTimeSeconds = -1;
  }

  skipBeginningComment() {
    const eventName = this.selectedRecordedEventName;
    this.commentRecordedEvents[eventName].beginningCommentIndex += 4;

    this.commentRecordedEvents[eventName].beginningComments =
      this.commentRecordedEvents[eventName].allBeginningComments.slice(
        this.commentRecordedEvents[eventName].beginningCommentIndex,
        this.commentRecordedEvents[eventName].beginningCommentIndex + 4
      );
  }

  async getCommentsOfCurrentTime(): Promise<Comment[]> {
    if (!this.selectedRecordedEventName) return [];

    const eventName = this.selectedRecordedEventName;
    const beginningComments =
      this.commentRecordedEvents[eventName].beginningComments;
    if (beginningComments.length <= 0) return [];

    const targetCommentDate =
      beginningComments[0].receivedDate.getTime() -
      this.commentBeginningOffsetTimeSeconds * 1000 +
      this.playerCurrentTimeSeconds * 1000;
    console.log('targetCommentDate', targetCommentDate);

    const targetComments =
      await this.commentRecorder.getCommentsByEventNameAndReceivedDate(
        this.selectedRecordedEventName,
        targetCommentDate
      );

    return targetComments;
  }

  setCommentBeginningOffsetTime() {
    if (!this.playerCurrentTimeSeconds) {
      this.commentBeginningOffsetTimeSeconds = 0;
    } else {
      this.commentBeginningOffsetTimeSeconds = this.playerCurrentTimeSeconds;
    }

    this.snackBar.open(
      `コメント再生の準備が整いました。映像の再生ボタンを押してください。`,
      null,
      { duration: 5000 }
    );
  }

  openPlayerFramePage() {
    this.transferMessageToHostScript({ type: 'OPEN_PLAYER_FRAME_PAGE' });
    this.playerFramePageOpened = true;
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
