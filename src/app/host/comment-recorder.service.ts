import { Injectable } from '@angular/core';
import * as JsStore from 'jsstore';
import { DataStoreService } from './data-store/data-store.service';

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

  async getCommentsByEventName(eventName: string) {
    await this.connectDb();
    return await this.dbConnection.select<Comment[]>({
      from: 'Comments',
      where: { eventName: eventName },
    });
  }

  async registerComment(eventName: string, comment: Comment) {
    await this.connectDb();
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
