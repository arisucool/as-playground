import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { interval, Observable, Subscription } from 'rxjs';
import { CommentRecorderService } from '../comment-recorder.service';
import { HostService } from '../host.service';

interface Chapter {
  name: string;
  timeSeconds: number;
  seekTimeSeconds: number;
}

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
  chapters: Chapter[];

  // 曲名コメントから何秒前にずらすか
  readonly OFFSET_SECONDS = 60 * 4;

  // 定期的な再読み込み
  reloadTimer: Subscription;
  RELOAD_INTERVAL_SECONDS = 30;

  constructor(
    protected commentRecorderService: CommentRecorderService,
    protected hostService: HostService,
    protected snackBar: MatSnackBar
  ) {}

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

    const comments = await this.commentRecorderService.getCommentsByEventName(
      this.eventName
    );

    this.chapters = [];

    for (const comment of comments) {
      if (!comment.nickname.match(/^\s*♪\s*$/)) continue;

      // 曲名コメントから曲名を抽出
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

      // すでに挿入済みの曲かどうかをチェック
      const exists = this.chapters.find((chapter) => {
        return chapter.name === songName;
      });
      if (exists) {
        continue;
      }

      // チャプタを作成
      const chapter: Chapter = {
        name: songName,
        timeSeconds: comment.receivedTime,
        seekTimeSeconds: comment.receivedTime,
      };

      // 前のチャプタとの時間差を計算
      if (1 <= this.chapters.length) {
        const previousChapter = this.chapters[this.chapters.length - 1];
        const diffMinutes =
          (chapter.timeSeconds - previousChapter.timeSeconds) / 60;
        if (5 <= diffMinutes) {
          // 5分以上の差があれば、時間を前にずらす
          chapter.seekTimeSeconds = chapter.timeSeconds - this.OFFSET_SECONDS;
        }
      } else {
        chapter.seekTimeSeconds = Math.floor(chapter.timeSeconds / 60) * 60;
      }

      // チャプタを追加
      this.chapters.push(chapter);
    }
  }

  seekToChapter(chapter: Chapter) {
    this.hostService.setPlayerCurrentTimeSeconds(chapter.seekTimeSeconds);
    this.snackBar.open(`"${chapter.name}" の前後へシークします...`, null, {
      duration: 2000,
    });
  }
}
