import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { CommentRecorderService } from '../comment-recorder.service';
import { HostService } from '../host.service';

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

  constructor(
    protected commentRecorderService: CommentRecorderService,
    protected hostService: HostService
  ) {}

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
    let comments = await this.commentRecorderService.getCommentsByEventName(
      this.eventName
    );

    console.log(
      `[CommentAnalysisComponent] load - ${comments.length} comments loaded`
    );

    const commentsSorted: any[] = comments
      .map((comment: any) => {
        if (comment.timeSeconds === undefined) return comment;
        comment.timeMinutes = Math.floor(comment.timeSeconds / 60) * 60;
        return comment;
      })
      .filter((comment: any) => comment.timeMinutes !== undefined)
      .sort((a: any, b: any) => {
        return a.timeMinutes - b.timeMinutes;
      });
    comments = [];

    const chartSeries = [];
    let tmpSeries = undefined;
    for (const comment of commentsSorted) {
      if (comment.timeMinutes === undefined) continue;

      const timeStr = `${this.hostService.secondToTimeString(
        comment.timeMinutes
      )}`;

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

  onChartSelect(data: { name: string; value: string }): void {
    const time: string = data.name;
    this.hostService.setPlayerCurrentTimeSeconds(
      this.hostService.timeStringToSeconds(time)
    );
  }
}
