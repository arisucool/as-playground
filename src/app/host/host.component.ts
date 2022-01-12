import { ThrowStmt } from '@angular/compiler';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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

  public latestComments: any[] = [];
  public isCommentRecorderEnabled = false;

  constructor(
    private router: Router,
    private changeDetectorRef: ChangeDetectorRef,
    private commentRecorder: CommentRecorderService
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.initPeer();
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
          this.onReceiveCommentsFromHostScript(message.data.comments);
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
          : null;
      for (let comment of comments) {
        await this.commentRecorder.registerComment(eventName, comment);
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
}
