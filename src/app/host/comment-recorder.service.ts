import { Injectable } from '@angular/core';
import * as JsStore from 'jsstore';
import { DataStoreService } from './data-store/data-store.service';
import { Comment } from './model/comment.interface';
import sha256 from 'crypto-js/sha256';

@Injectable({
  providedIn: 'root',
})
export class CommentRecorderService {
  protected dbConnection: JsStore.Connection;

  constructor(protected dataStore: DataStoreService) {}

  async ngOnDestroy() {}

  async connectDb() {
    if (this.dbConnection) return;
    this.dbConnection = await this.dataStore.getDatabaseConnection();
  }

  async getEventNames(): Promise<string[]> {
    await this.connectDb();
    const items = await this.dbConnection.select({
      from: 'Comments',
      groupBy: 'eventName',
    });
    return items.map((item: any) => {
      return item.eventName;
    });
  }

  async getCommentById(id: string): Promise<Comment> {
    await this.connectDb();
    return await this.dbConnection.get(id);
  }

  async getComments(skip = 0, limit?: number): Promise<Comment[]> {
    await this.connectDb();
    return await this.dbConnection.select<Comment>({
      from: 'Comments',
      skip: skip || null,
      limit: limit || null,
    });
  }

  async getCommentsByEventName(
    eventName: string,
    limit?: number
  ): Promise<Comment[]> {
    await this.connectDb();
    return await this.dbConnection.select<Comment>({
      from: 'Comments',
      where: { eventName: eventName },
      order: {
        by: 'timeSeconds',
        type: 'asc',
      },
    });
  }

  async getCommentsByEventNameAndTimeSecondsRange(
    eventName: string,
    timeSecondsStart: number,
    timeSecondsEnd: number
  ): Promise<Comment[]> {
    await this.connectDb();
    return await this.dbConnection.select<Comment>({
      from: 'Comments',
      where: {
        eventName: eventName,
        timeSeconds: {
          '-': {
            low: timeSecondsStart,
            high: timeSecondsEnd,
          },
        },
      },
      order: {
        by: 'timeSeconds',
        type: 'asc',
      },
    });
  }

  async getCommentsWithTimeSecondsEmptyByEventName(
    eventName: string
  ): Promise<Comment[]> {
    await this.connectDb();
    return await this.dbConnection.select<Comment>({
      from: 'Comments',
      where: {
        eventName: eventName,
        timeSeconds: -1,
      },
      order: {
        by: 'registeredDate',
        type: 'asc',
      },
    });
  }

  async registerComment(
    eventName: string,
    comment: any,
    upsert: boolean = false
  ) {
    await this.connectDb();
    comment.eventName = eventName;
    await this.dbConnection.insert<Comment>({
      into: 'Comments',
      values: [comment],
      upsert: upsert,
    });
  }

  async registerComments(
    eventName: string,
    comments: any[],
    upsert: boolean = false
  ) {
    await this.connectDb();
    for (const comment of comments) {
      comment.eventName = eventName;
    }
    await this.dbConnection.insert<Comment>({
      into: 'Comments',
      values: comments,
      upsert: upsert,
    });
  }

  async clearComments() {
    await this.connectDb();
    await this.dbConnection.remove({
      from: 'Comments',
    });
  }

  async clearCommentsByEventName(eventName: string) {
    await this.connectDb();
    await this.dbConnection.remove({
      from: 'Comments',
      where: { eventName: eventName },
    });
  }

  getId(eventName: string, nickName: string, commentText: string): string {
    return sha256(`${eventName}___${nickName}___${commentText}`).toString();
  }

  async fillUpTimeSecondsToCommentsBySampledComments(
    eventName: string,
    sampledComments: { archive: Comment; realtimeRecorded: Comment }[],
    comments: Comment[]
  ) {
    if (sampledComments.length == 0) {
      console.log(
        '[CommentRecorder]',
        `commentsWithTimeSeconds - Canceled, because sampledComments is empty`
      );
      return false;
    } else if (comments.length === 0) {
      console.log(
        '[CommentRecorder]',
        `commentsWithTimeSeconds - Canceled because there is not target comment`
      );
      return false;
    }

    await this.connectDb();

    const firstMatchedComment = sampledComments[0];

    console.log(
      '[CommentRecorder]',
      `commentsWithTimeSeconds - Filling up timeSeconds to comments (${comments.length})...`,
      {
        sampledComments: sampledComments,
        firstMatched: `${firstMatchedComment.archive.timeSeconds}s, ${firstMatchedComment.archive.registeredDate}`,
      }
    );

    const fixedComments = comments.map((comment, index) => {
      const diffSeconds = Math.floor(
        (new Date(comment.registeredDate).getTime() -
          new Date(
            firstMatchedComment.realtimeRecorded.registeredDate
          ).getTime()) /
          1000
      );
      if (60 * 60 * 12 <= diffSeconds) {
        // 異常な差があれば、何もしない
        console.log(
          '[CommentRecorder]',
          `commentsWithTimeSeconds - Skipped stranger comment (ID: ${comment.id})...`,
          comment,
          `diff = ${diffSeconds}s`
        );
        return comment;
      }

      const timeSeconds = firstMatchedComment.archive.timeSeconds + diffSeconds;
      if (timeSeconds < 0) {
        // 開幕前コメントだと推定されるならば
        comment.timeSeconds = -2;
        console.log(
          '[CommentRecorder]',
          `commentsWithTimeSeconds - Ignored comment (ID: ${comment.id})...`,
          comment,
          `diff = ${diffSeconds}s`
        );
        return comment;
      }

      comment.timeSeconds = timeSeconds;
      console.log(
        '[CommentRecorder]',
        `commentsWithTimeSeconds - Filling up timeSeconds (${comment.timeSeconds}s) to comment (ID: ${comment.id})...`,
        comment,
        `diff = ${diffSeconds}s`
      );
      return comment;
    });

    await this.registerComments(eventName, fixedComments, true);

    return true;
  }
}
