import { Comment } from '../host/model/comment.interface';
import { HostAvailableFunctions } from './host-available-functions.interface';

export type ViewerMessage =
  | ViewerGreetingMessage
  | ViewerCommentsReceivedMessage;

export interface ViewerBaseMessage {
  type: 'GREETING' | 'COMMENTS_RECEIVED';
}

export interface ViewerGreetingMessage extends ViewerBaseMessage {
  type: 'GREETING';
  comments: Comment[];
  availableFunctions: HostAvailableFunctions;
}

export interface ViewerCommentsReceivedMessage extends ViewerBaseMessage {
  type: 'COMMENTS_RECEIVED';
  comments: Comment[];
}
