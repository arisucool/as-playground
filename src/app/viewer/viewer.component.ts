import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';
import NoSleep from '@uriopass/nosleep.js';

import { environment } from './../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss'],
})
export class ViewerComponent implements OnInit {
  public peer: Peer;
  protected peerId: string;
  protected hostPeerId: string;
  public dataConnection: DataConnection;
  public errorText: string;

  protected noSleep: NoSleep;
  public enableNoSleep: boolean = false;

  public comments: {
    id: string;
    nickname: string;
    nicknameColor: string;
    comment: string;
    receivedDate: Date;
  }[] = [];

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
        }
      });

      this.dataConnection.once('close', () => {
        console.log('DataConnection closed');
        this.dataConnection = null;
        this.changeDetectorRef.detectChanges();
      });
    });
  }

  onReceivedNewComment(comments: any) {
    this.comments = this.comments.concat(comments);
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
}
