import { Comment } from '../host/model/comment.interface';
import { HostAvailableFunctions } from './host-available-functions.interface';

export type ViewerMessage =
  | ViewerGreetingMessage
  | ViewerCommentsReceivedMessage
  | ViewerErrorOccurredMessage;

export interface ViewerBaseMessage {
  type: 'GREETING' | 'COMMENTS_RECEIVED' | 'ERROR_OCCURRED';
}

export interface ViewerGreetingMessage extends ViewerBaseMessage {
  type: 'GREETING';
  comments: Comment[];
  availableFunctions: HostAvailableFunctions;
  hostLoader: 'chrome_ext' | 'bookmarklet';
}

export interface ViewerCommentsReceivedMessage extends ViewerBaseMessage {
  type: 'COMMENTS_RECEIVED';
  comments: Comment[];
}

export interface ViewerErrorOccurredMessage {
  type: 'ERROR_OCCURRED';
  errorMessage: string;
}
