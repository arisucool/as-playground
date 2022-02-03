import { Injectable } from '@angular/core';
import * as JsStore from 'jsstore';
import { DataStoreService } from './data-store/data-store.service';
import { Comment } from './model/comment.interface';

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
      limit: limit || null,
      order: {
        by: 'receivedDate',
        type: 'asc',
      },
    });
  }

  async getCommentsByEventNameAndReceivedDate(
    eventName: string,
    receivedDate: number
  ): Promise<Comment[]> {
    await this.connectDb();
    return await this.dbConnection.select<Comment>({
      from: 'Comments',
      where: {
        eventName: eventName,
        receivedDate: {
          '-': {
            low: new Date(receivedDate),
            high: new Date(receivedDate + 999),
          },
        },
      },
      order: {
        by: 'receivedDate',
        type: 'asc',
      },
    });
  }

  async registerComment(eventName: string, comment: any) {
    await this.connectDb();
    comment.eventName = eventName;
    await this.dbConnection.insert<Comment>({
      into: 'Comments',
      values: [comment],
      upsert: true,
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
}
