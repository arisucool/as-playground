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

    const chapters = [];
    for (const comment of comments) {
      if (!comment.nickname.match(/^\s*♪\s*$/)) continue;
      if (!comment.timeSeconds === undefined) continue;

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
      const exists = chapters.find((chapter) => {
        return chapter.name === songName;
      });
      if (exists) {
        continue;
      }

      // チャプタを作成
      const chapter: Chapter = {
        name: songName,
        timeSeconds: comment.timeSeconds,
        seekTimeSeconds: comment.timeSeconds + 0,
      };

      // チャプタを追加
      chapters.push(chapter);
    }

    this.chapters = chapters.map((chapter, index) => {
      if (index == chapters.length - 1) {
        chapter.seekTimeSeconds = Math.floor(chapter.timeSeconds / 60) * 60;
      } else {
        // 次のチャプタとの時間差を計算
        const nextChapter = chapters[index + 1];
        const diffMinutes =
          (nextChapter.timeSeconds - chapter.timeSeconds) / 60;
        if (diffMinutes <= 2) {
          // 2分以下しか差がなければ、時間を前にずらす
          chapter.seekTimeSeconds = chapter.timeSeconds - this.OFFSET_SECONDS;
        }
      }
      return chapter;
    });
  }

  seekToChapter(chapter: Chapter) {
    this.hostService.setPlayerCurrentTimeSeconds(chapter.seekTimeSeconds - 20);
    this.snackBar.open(`"${chapter.name}" の前後へシークします...`, null, {
      duration: 2000,
    });
  }
}
