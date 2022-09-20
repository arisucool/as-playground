export interface HostConfig {
  general: GeneralConfig;
  commentOverlay: CommentOverlayConfig;
}

export type HostTabName =
  | 'mobileLink'
  | 'commentOverlay'
  | 'commentAnalysis'
  | 'chapter';

export interface GeneralConfig {
  activeTabName: HostTabName;
}

export interface CommentOverlayConfig {
  isEnableCommentOverlayOnRealtimeView: boolean;
  isEnableCommentOverlayOnArchiveView: boolean;
}
