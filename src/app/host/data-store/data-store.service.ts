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
      id: { primaryKey: true, autoIncrement: false, unique: true },
      eventName: { notNull: true, dataType: 'string' },
      nickname: { notNull: true, dataType: 'string' },
      nicknameColor: { notNull: true, dataType: 'string' },
      comment: { notNull: true, dataType: 'string' },
      receivedTime: { notNull: true, dataType: 'number' },
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
