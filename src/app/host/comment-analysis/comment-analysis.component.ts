import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { CommentRecorderService } from '../comment-recorder.service';

@Component({
  selector: 'app-comment-analysis',
  templateUrl: './comment-analysis.component.html',
  styleUrls: ['./comment-analysis.component.scss'],
})
export class CommentAnalysisComponent implements OnInit, OnDestroy {
  // イベント名
  @Input()
  eventName: string;

  // グラフデータ
  chartData = undefined;

  // 定期的な再読み込み
  reloadTimer: Subscription;
  RELOAD_INTERVAL_SECONDS = 30;

  constructor(protected commentRecorder: CommentRecorderService) {}

  async ngOnInit() {
    this.load();

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
    let comments = await this.commentRecorder.getCommentsByEventName(
      this.eventName
    );

    console.log(
      `[CommentAnalysisComponent] load - ${comments.length} comments loaded`
    );

    const commentsSorted: any[] = comments
      .map((comment: any) => {
        if (comment.receivedTime === undefined) return comment;
        comment.receivedTimeMinutes =
          Math.floor(comment.receivedTime / 60) * 60;
        return comment;
      })
      .filter((comment: any) => comment.receivedTimeMinutes !== undefined)
      .sort((a: any, b: any) => {
        return a.receivedTimeMinutes - b.receivedTimeMinutes;
      });
    comments = [];

    const chartSeries = [];
    let tmpSeries = undefined;
    for (const comment of commentsSorted) {
      if (comment.receivedTimeMinutes === undefined) continue;

      const timeStr = `${this.secondToTimeString(comment.receivedTimeMinutes)}`;

      if (tmpSeries && tmpSeries.name != timeStr) {
        chartSeries.push(tmpSeries);
        tmpSeries = undefined;
      }

      if (tmpSeries === undefined) {
        tmpSeries = {
          name: timeStr,
          value: 1,
        };
      } else {
        tmpSeries.value++;
      }
    }

    if (tmpSeries !== undefined) {
      chartSeries.push(tmpSeries);
    }

    console.log(
      `[CommentAnalysisComponent] load - chartSeries = `,
      chartSeries
    );

    this.chartData = [
      {
        name: 'コメント数',
        series: chartSeries,
      },
    ];
  }

  onSelect(data: any): void {
    const time = data.name;
    console.log('Item clicked', data);
  }

  secondToTimeString(second: number) {
    const date = new Date(second * 1000);
    return `${this.padString(`${date.getUTCHours()}`, 2, '0')}:${this.padString(
      `${date.getUTCMinutes()}`,
      2,
      '0'
    )}`;
  }

  padString(str: string, length: number, padStr: string) {
    while (str.length < length) {
      str = padStr + str;
    }
    return str;
  }
}
