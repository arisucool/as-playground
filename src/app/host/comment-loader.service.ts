import { Injectable } from '@angular/core';
import { CommentRecorderService } from './comment-recorder.service';
import { Comment } from './model/comment.interface';

@Injectable({
  providedIn: 'root',
})
export class CommentLoaderService {
  private static BUFFER_MILLISECONDS: number = 10000;

  private enable: boolean = false;
  private timerId: any;

  constructor(private commentRecorder: CommentRecorderService) {}

  private events: {
    [key: string]: {
      currentCommentDate: number;
      comments: Comment[];
    };
  } = {};

  start() {
    if (this.enable || this.timerId) return;
    this.enable = true;
    this.onIntervalArrived();
  }

  stop() {
    this.enable = false;
    if (this.timerId) window.clearTimeout(this.timerId);
    this.timerId = null;
  }

  async getCommentsByEventNameAndReceivedDate(
    eventName: string,
    receivedDate: number
  ): Promise<Comment[]> {
    /*if (!this.events[eventName]) {
      this.events[eventName] = {
        currentCommentDate: receivedDate,
        comments: [],
      };
      await this.tick();
    }

    this.events[eventName].currentCommentDate = receivedDate;

    return this.events[eventName].comments.filter((comment) => {
      const t = comment.receivedDate.getTime();
      return receivedDate <= t && t <= receivedDate + 999;
    });*/
    return [];
  }

  private async onIntervalArrived() {
    if (!this.enable) {
      this.timerId = null;
      return;
    }

    const processingMilliseconds = await this.tick();
    const nextIntervalMilliseconds =
      CommentLoaderService.BUFFER_MILLISECONDS -
      CommentLoaderService.BUFFER_MILLISECONDS / 2 -
      processingMilliseconds;
    console.log(
      'onIntervalArrived',
      `Wait until next time... ${nextIntervalMilliseconds / 1000} sec.`
    );

    this.timerId = window.setTimeout(
      () => {
        this.onIntervalArrived();
      },
      100 < nextIntervalMilliseconds ? nextIntervalMilliseconds : 100
    );
  }

  private async tick(): Promise<number> {
    /*
    let startedAt = Date.now();

    for (const eventName of Object.keys(this.events)) {
      const event = this.events[eventName];

      console.log(
        'CommentLoader',
        `Finding for ${eventName} / ${event.currentCommentDate}`
      );
      let startedAtForEvent = Date.now();

      const comments =
        await this.commentRecorder.getCommentsByEventNameAndReceivedTimeRange(
          eventName,
          new Date(
            event.currentCommentDate - CommentLoaderService.BUFFER_MILLISECONDS
          ),
          new Date(
            event.currentCommentDate + CommentLoaderService.BUFFER_MILLISECONDS
          )
        );
      this.events[eventName].comments = comments;

      console.log(
        'CommentLoader',
        `Finding for ${eventName} / ${event.currentCommentDate} --> ${
          comments.length
        } items (${(Date.now() - startedAtForEvent) / 1000} sec.)`
      );
    }

    return Date.now() - startedAt;*/

    return 0;
  }
}
