import { Injectable } from '@angular/core';
import * as JsStore from 'jsstore';
import workerInjector from 'jsstore/dist/worker_injector';

@Injectable({
  providedIn: 'root',
})
export class DataStoreService {
  private dbConnection: JsStore.Connection;

  static DB_TABLE_COMMENTS: JsStore.ITable = {
    name: 'Comments',
    columns: {
      // ID
      id: { primaryKey: true, autoIncrement: false, unique: true },
      // イベント名
      eventName: { notNull: true, dataType: 'string' },
      // ニックネーム
      nickname: { notNull: true, dataType: 'string' },
      // ニックネームの色
      nicknameColor: { notNull: true, dataType: 'string' },
      // コメント本文
      comment: { notNull: true, dataType: 'string' },
      // コメントの再生位置 (秒数)
      // (ただし、リアルタイム視聴時に保存したコメントは、正確な再生位置が不明なので、 -1 となる)
      timeSeconds: { notNull: true, dataType: 'number' },
      // コメントをデータストアに保存した日時
      registeredDate: { notNull: true, dataType: 'date_time' },
    },
  };

  static DB_SCHEMA: JsStore.IDataBase = {
    name: 'AsPHostDataStore',
    tables: [DataStoreService.DB_TABLE_COMMENTS],
  };

  constructor() {}

  async getDatabaseConnection() {
    if (!this.dbConnection) {
      this.dbConnection = new JsStore.Connection();
      this.dbConnection.addPlugin(workerInjector);
      this.dbConnection.initDb(DataStoreService.DB_SCHEMA);
    }

    return this.dbConnection;
  }
}
