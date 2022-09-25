import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';
import NoSleep from '@uriopass/nosleep.js';

import { environment } from './../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs/internal/Subscription';
import { interval } from 'rxjs/internal/observable/interval';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

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
  public isEnableNoSleep: boolean = false;

  public comments: Comment[] = [];
  protected readonly NUM_OF_MAX_COMMENTS = 500;

  // ホストに対してハートビートを定期送信するためのタイマ
  protected heartbeatTimer: Subscription;
  protected readonly HEARTBEAT_INTERVAL_MILISECONDS = 4000;

  // アソビライト
  public asobiLightUrl: SafeUrl;
  public asobiLightRawUrl: string;
  public isEnableAsobiLight = false;

  constructor(
    protected route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private domSanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.noSleep = new NoSleep();

    this.hostPeerId = this.route.snapshot.params.hostPeerId;
    if (!this.hostPeerId || this.hostPeerId === 'null') {
      this.errorText = '接続先が無効です。再度、QRコードを読み取ってください。';
      return;
    }

    window.setTimeout(() => {
      this.initPeer();
    }, 500);

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
        data = JSON.parse(decodeURIComponent(data));

        console.log('Message received on DataConnection', data);
        if (!data.type) return;
        if (data.type == 'COMMENTS_RECEIVED') {
          this.onReceivedNewComment(data.comments);
        } else if (data.type == 'URL_OF_ASOBI_LIGHT_RECEIVED') {
          this.onReceivedUrlOfAsobiLight(data.url);
        }
      });

      this.dataConnection.once('close', () => {
        console.log('DataConnection closed');
        this.dataConnection = null;
        this.changeDetectorRef.detectChanges();
      });
    });
  }

  toggleAsobiLight() {
    if (this.asobiLightUrl === undefined) {
      this.startAsobiLight();
      return;
    }
    this.isEnableAsobiLight = !this.isEnableAsobiLight;
  }

  startAsobiLight() {
    this.snackBar.open(
      'アソビライトのスマホ連携を有効にしています... お待ちください...',
      null,
      {
        duration: 3000,
      }
    );
    this.sendMessageToHost({
      type: 'GET_URL_OF_ASOBI_LIGHT',
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

  onReceivedUrlOfAsobiLight(url: string) {
    this.asobiLightRawUrl = url;
    this.asobiLightUrl = this.domSanitizer.bypassSecurityTrustResourceUrl(
      this.asobiLightRawUrl
    );
    this.isEnableAsobiLight = true;
    this.changeDetectorRef.detectChanges();
  }

  openAsobiLightOnNewTab() {
    if (this.asobiLightRawUrl === undefined) return;
    window.open(this.asobiLightRawUrl, 'asobilight', 'noreferrer');
    this.isEnableAsobiLight = false;
  }

  setNoSleep(enable: boolean) {
    if (enable) {
      this.noSleep.enable();
      this.isEnableNoSleep = true;
      this.snackBar.open('画面スリープを抑制中です', null, {
        duration: 1000,
      });
      return;
    }

    this.noSleep.disable();
    this.isEnableNoSleep = false;
    this.snackBar.open('画面スリープの抑制を解除しました', null, {
      duration: 1000,
    });
  }

  /**
   * ホストに対するメッセージの送信
   * @param message 送信するメッセージ
   */
  protected sendMessageToHost(message: any) {
    if (!this.dataConnection) {
      console.log('sendMessageToHost', 'Canceled');
      return;
    }
    console.log('sendMessageToHost', message);
    this.dataConnection.send(encodeURIComponent(JSON.stringify(message)));
  }
}
