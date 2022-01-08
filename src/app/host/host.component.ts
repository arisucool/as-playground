import { ThrowStmt } from '@angular/compiler';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
  public clientUrl: string;
  public dataConnection: DataConnection;

  public latestComments: any[] = [];

  constructor(private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initPeer();
    this.startMessagingWithHostScript();
  }

  initPeer(): void {
    console.log('Initializing Peer...');
    this.peer = new Peer({ key: environment.skyWayApiKey });

    this.peer.on('open', () => {
      this.peerId = this.peer.id;
      this.clientUrl = `${window.location.protocol}//${window.location.host}/viewer/${this.peerId}`;
      this.changeDetectorRef.detectChanges();
    });

    this.peer.on('connection', (dataConnection) => {
      if (this.dataConnection) {
        console.log('Already connected with other client');
        return;
      }

      dataConnection.once('open', () => {
        this.transferMessageToClient({
          type: 'COMMENTS_RECEIVED',
          comments: this.latestComments,
        });
      });

      dataConnection.on('data', (data) => {
        this.onReceiveMessageByClient(data);
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
          this.transferMessageToClient(message.data);
        }
      },
      false
    );
  }

  transferMessageToClient(message: any) {
    if (!this.dataConnection) {
      console.log('transferMessageToClient', 'Canceled');
      return;
    }
    console.log('transferMessageToClient', message);
    this.dataConnection.send(message);
  }

  onReceiveMessageByClient(message: string) {}
}
