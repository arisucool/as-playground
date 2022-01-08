import { ThrowStmt } from '@angular/compiler';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import Peer, { DataConnection } from 'skyway-js';

import { environment } from './../../environments/environment';

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

  public latestComments: any[] = [];

  constructor(
    private router: Router,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initPeer();
    this.startMessagingWithHostScript();
  }

  initPeer(): void {
    console.log('Initializing Peer...');
    this.peer = new Peer({ key: environment.skyWayApiKey });

    this.peer.on('open', () => {
      this.peerId = this.peer.id;

      this.viewerUrl = this.generateViewerUrl(this.peerId);

      this.changeDetectorRef.detectChanges();
    });

    this.peer.on('connection', (dataConnection) => {
      if (this.dataConnection) {
        console.log('Already connected with other viewer');
        return;
      }

      dataConnection.once('open', () => {
        this.transferMessageToViewer({
          type: 'COMMENTS_RECEIVED',
          comments: this.latestComments,
        });
      });

      dataConnection.on('data', (data) => {
        this.onReceiveMessageByViewer(data);
      });

      dataConnection.once('close', () => {
        this.dataConnection = null;
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
        if (message.data.type == 'COMMENTS_RECEIVED') {
          this.latestComments = message.data.comments;
          this.transferMessageToViewer(message.data);
        }
      },
      false
    );
  }

  transferMessageToViewer(message: any) {
    if (!this.dataConnection) {
      console.log('transferMessageToViewer', 'Canceled');
      return;
    }
    console.log('transferMessageToViewer', message);
    this.dataConnection.send(message);
  }

  onReceiveMessageByViewer(message: string) {}

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
}
