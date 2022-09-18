import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';
import NoSleep from '@uriopass/nosleep.js';

import { environment } from './../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs/internal/Subscription';
import { interval } from 'rxjs/internal/observable/interval';
import { ViewerMessage } from '../common/viewer-message.interface';
import { Comment } from '../host/model/comment.interface';
import { HostAvailableFunctions } from '../common/host-available-functions.interface';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss'],
})
export class ViewerComponent implements OnInit, OnDestroy {
  public peer: Peer;
  protected peerId: string;
  protected hostPeerId: string;
  public dataConnection: DataConnection;
  public errorText: string;

  protected noSleep: NoSleep;
  public enableNoSleep: boolean = false;

  public comments: Comment[] = [];
  protected readonly NUM_OF_MAX_COMMENTS = 500;

  // ホストに対してハートビートを定期送信するためのタイマ
  protected heartbeatTimer: Subscription;
  protected readonly HEARTBEAT_INTERVAL_MILISECONDS = 4000;

  // 利用機能な機能
  public availableFunctions: HostAvailableFunctions = {
    postComment: false,
  };

  // コメント投稿のための変数
  public commentNickname: string = undefined;
  public isCommentSending = false;

  constructor(
    protected route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.noSleep = new NoSleep();

    this.hostPeerId = this.route.snapshot.params.hostPeerId;
    if (!this.hostPeerId || this.hostPeerId === 'null') {
      this.errorText = '接続先が無効です。再度、QRコードを読み取ってください。';
      return;
    }

    this.initPeer();

    // ハートビートの定期送信を行うためのタイマを開始
    this.heartbeatTimer = interval(
      this.HEARTBEAT_INTERVAL_MILISECONDS
    ).subscribe(async () => {
      this.sendMessageToHost({
        type: 'HEARTBEAT',
      });
    });
  }

  ngOnDestroy(): void {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.unsubscribe();
    }
  }

  initPeer(): void {
    console.log('Initializing Peer...');
    this.peer = new Peer({ key: environment.skyWayApiKey });

    this.peer.on('error', (error) => {
      if (error.message.match(/Please make sure the peerId is correct/)) {
        this.errorText =
          '接続先が無効です。再度、QRコードを読み取ってください。';
      } else {
        this.errorText = error.message;
      }
      console.warn(error);
      this.changeDetectorRef.detectChanges();
    });

    this.peer.on('open', () => {
      this.peerId = this.peer.id;

      console.log('Connecting to host peer...', this.hostPeerId);
      this.dataConnection = this.peer.connect(this.hostPeerId);
      this.changeDetectorRef.detectChanges();

      this.dataConnection.once('open', () => {
        console.log('DataConnection opened');
      });

      this.dataConnection.on('data', (data) => {
        const message = JSON.parse(decodeURIComponent(data)) as ViewerMessage;

        console.log('Message received on DataConnection', message);
        if (!message.type) return;
        switch (message.type) {
          case 'GREETING':
            this.availableFunctions = message.availableFunctions;
          case 'COMMENTS_RECEIVED':
            this.onReceivedNewComment(message.comments);
            break;
          default:
            break;
        }
      });

      this.dataConnection.once('close', () => {
        console.log('DataConnection closed');
        this.dataConnection = null;
        this.changeDetectorRef.detectChanges();
      });
    });
  }

  onReceivedNewComment(receivedComments: Comment[]) {
    let comments = this.comments.concat(receivedComments.reverse());
    while (this.NUM_OF_MAX_COMMENTS < comments.length) {
      comments.shift();
    }
    this.comments = comments;

    this.changeDetectorRef.detectChanges();
  }

  setNoSleep(enable: boolean) {
    if (enable) {
      this.noSleep.enable();
      this.enableNoSleep = true;
      this.snackBar.open('画面スリープを抑制中です', null, {
        duration: 1000,
      });
      return;
    }

    this.noSleep.disable();
    this.enableNoSleep = false;
    this.snackBar.open('画面スリープの抑制を解除しました', null, {
      duration: 1000,
    });
  }

  showCommentPostUnavailableDetailMessage() {
    this.snackBar.open(
      'アソビステージでコメント投稿できない画面が開かれているか、またはアソビステージの仕様変更が行われました。このため、as-playground からのコメント投稿は利用できません。',
      'OK'
    );
    return false;
  }

  postComment(nickname: string, comment: string) {
    if (this.isCommentSending) return;

    this.isCommentSending = true;

    const message = this.snackBar.open(
      `コメントを送信しています... ${comment}`
    );
    const result = this.sendMessageToHost({
      type: 'POST_COMMENT',
      nickname: nickname,
      comment: comment,
    });

    if (!result) {
      message.dismiss();
      this.isCommentSending = false;
      this.snackBar.open('コメントの送信に失敗しました', 'OK');
      return;
    }

    // コメント送信できたか否かのチェック
    const NUM_OF_MAX_CHECK_COUNT = 100;
    let checkCount = 0;
    const timer = window.setInterval(() => {
      if (this.comments.length === 0) return;

      if (
        this.comments.find((c) => {
          return c.nickname === nickname && c.comment === comment;
        })
      ) {
        // 送信成功を確認できたならば
        clearInterval(timer);
        message.dismiss();
        this.isCommentSending = false;
        this.snackBar.open('コメントを送信しました', undefined, {
          duration: 1000,
        });
        return;
      } else if (NUM_OF_MAX_CHECK_COUNT <= checkCount) {
        // 送信成功を確認できなかったならば
        clearInterval(timer);
        message.dismiss();
        this.isCommentSending = false;
        this.snackBar.open(
          'エラー: コメントの送信成功を確認できませんでした。何らかの理由で送信に失敗した可能性があります。',
          'OK'
        );
        return;
      }

      checkCount++;
    }, 100);
  }

  /**
   * ホストに対するメッセージの送信
   * @param message 送信するメッセージ
   */
  protected sendMessageToHost(message: any) {
    if (!this.dataConnection) {
      console.log('sendMessageToHost', 'Canceled');
      return false;
    }
    console.log('sendMessageToHost', message);
    this.dataConnection.send(encodeURIComponent(JSON.stringify(message)));
    return true;
  }
}
