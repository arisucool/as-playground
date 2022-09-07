import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { interval, Observable, Subscription } from 'rxjs';
import { CommentRecorderService } from '../comment-recorder.service';

@Component({
  selector: 'app-chapter',
  templateUrl: './chapter.component.html',
  styleUrls: ['./chapter.component.scss'],
})
export class ChapterComponent implements OnInit, OnDestroy {
  // イベント名
  @Input()
  eventName: string;

  // プレーヤーの再生位置 (例: 90 = '00:01:30')
  @Input()
  playerCurrentTimeSeconds: number;

  // チャプタ
  chapters: { name: string; timeSeconds: number }[];

  // 定期的な再読み込み
  reloadTimer: Subscription;
  RELOAD_INTERVAL_SECONDS = 30;

  constructor(protected commentRecorder: CommentRecorderService) {}

  async ngOnInit() {
    await this.load();

    // 定期的な再読み込みを設定
    this.reloadTimer = interval(this.RELOAD_INTERVAL_SECONDS * 1000).subscribe(
      async () => {
        await this.load();
      }
    );
  }

  ngOnDestroy() {
    if (this.reloadTimer) {
      this.reloadTimer.unsubscribe();
    }
  }

  async load() {
    if (!this.eventName) return;

    const comments = await this.commentRecorder.getCommentsByEventName(
      this.eventName
    );

    this.chapters = [];

    for (const comment of comments) {
      if (!comment.nickname.match(/^\s*♪\s*$/)) continue;

      let songName;

      const matchesA = comment.comment.match(
        /^\s*「.+」.*より\s*「(.+)」\s*作詞/
      );
      if (matchesA) {
        songName = matchesA[1];
      }

      const matchesB = comment.comment.match(/^\s*「(.+)」\s*作詞/);
      if (songName === undefined && matchesB) {
        songName = matchesB[1];
      }

      if (!songName || comment.comment.match(/収録曲/)) {
        continue;
      }

      console.log(
        `[ChapterComponent] load - Found chapter comment = `,
        comment
      );

      const exists = this.chapters.find((chapter) => {
        return chapter.name === songName;
      });
      if (exists) continue;

      this.chapters.push({
        name: songName,
        timeSeconds: comment.receivedTime,
      });
    }
  }
}
