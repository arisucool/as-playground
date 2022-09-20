export interface CommentOverlayConfig {
  isEnableCommentOverlayOnRealtimeView: boolean;
  isEnableCommentOverlayOnArchiveView: boolean;
}

export interface HostConfig {
  commentOverlay: CommentOverlayConfig;
}
