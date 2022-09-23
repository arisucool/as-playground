export interface Comment {
  // ID
  id: string;
  // ニックネーム
  nickname: string;
  // ニックネームの色
  nicknameColor: string;
  // コメント本文
  comment: string;
  // イベント名
  eventName: string;
  // コメントの再生位置 (秒数)
  // (ただし、リアルタイム視聴時に保存したコメントは、正確な再生位置が不明なので、 -1 となる)
  timeSeconds: number;
  // コメントをデータストアに保存した日時
  registeredDate: Date;
}
