import { Injectable } from '@angular/core';
import { HostConfig } from './model/config.interface';

@Injectable({
  providedIn: 'root',
})
export class HostService {
  // 設定
  readonly DEFAULT_CONFIG: HostConfig = {
    general: {
      activeTabName: 'mobileLink',
    },
    commentOverlay: {
      isEnableCommentOverlayOnRealtimeView: false,
      isEnableCommentOverlayOnArchiveView: true,
    },
  };
  config: HostConfig;

  constructor() {
    this.loadConfig();
  }

  /**
   * 動画の再生位置の設定
   * @param seconds 再生位置 (秒数)
   */
  setPlayerCurrentTimeSeconds(seconds: number) {
    this.sendMessageToAsBridge({
      type: 'SET_PLAYER_CURRENT_TIME',
      seconds: seconds,
    });
  }

  /**
   * 動画へのオーバレイによるコメント表示
   * @param comments
   */
  showOverlayComments(comments: Comment[]) {
    this.sendMessageToAsBridge({
      type: 'SHOW_OVERLAY_COMMENTS',
      comments: comments,
    });
  }

  /**
   * フレームの表示/非表示の設定
   * @param value 表示する場合はtrue
   */
  setIframeVisiblity(value: boolean) {
    this.sendMessageToAsBridge({
      type: 'SET_IFRAME_VISIBILITY',
      value: value,
    });
  }

  /**
   * コメントの投稿
   * @param nickname ニックネーム
   * @param comment コメント本文
   */
  postComment(nickname: string, comment: string) {
    this.sendMessageToAsBridge({
      type: 'POST_COMMENT',
      nickname,
      comment,
    });
  }

  /**
   * 時刻または再生位置を秒数へ変換
   * @param timeString 時刻または再生位置の文字列 (例: '00:01:30' または '00:01)
   * @returns 秒数 (例: 90)
   */
  timeStringToSeconds(timeString: string): number {
    let arr = timeString.split(':');
    if (arr.length == 3) {
      return (
        parseInt(arr[0], 10) * 60 * 60 +
        parseInt(arr[1], 10) * 60 +
        parseInt(arr[2], 10)
      );
    } else if (arr.length == 2) {
      return parseInt(arr[0], 10) * 60 * 60 + parseInt(arr[1], 10) * 60;
    } else if (arr.length == 1) {
      return parseInt(arr[0], 10);
    }

    return null;
  }

  /**
   * 秒数を時刻へ変換
   * @param second (例: 90)
   * @returns 時刻の文字列 (例: '00:01:30')
   */
  secondToTimeString(second: number) {
    const date = new Date(second * 1000);
    return `${this.padString(date.getUTCHours(), 2)}:${this.padString(
      date.getUTCMinutes(),
      2
    )}`;
  }

  /**
   * ゼロ埋め
   * @param num 元の数字
   * @param length 桁数
   * @returns ゼロ埋めされた文字列
   */
  padString(num: number, length: number) {
    let str = `${num}`;
    while (str.length < length) {
      str = '0' + str;
    }
    return str;
  }

  /**
   * ビューアのURLの生成
   * @param hostPeerId Peer ID
   * @returns URL
   */
  generateViewerUrl(hostPeerId: string) {
    if (
      0 < document.getElementsByTagName('base').length &&
      document.getElementsByTagName('base')[0].href
    ) {
      return `${
        document.getElementsByTagName('base')[0].href
      }viewer/${hostPeerId}`;
    }
    return `${window.location.protocol}//${window.location.host}/viewer/${hostPeerId}`;
  }

  /**
   * 設定の取得
   * @returns 設定
   */
  getConfig(): HostConfig {
    if (this.config === undefined) this.loadConfig();

    return this.config;
  }

  /**
   * 設定の保存
   */
  saveConfig() {
    // 設定を保存
    window.localStorage.setItem('acaspHostConfig', JSON.stringify(this.config));
  }

  /**
   * 設定の読み込み
   */
  protected loadConfig() {
    let config: HostConfig = undefined;

    const configJson = window.localStorage.getItem('acaspHostConfig');

    if (configJson) {
      try {
        config = JSON.parse(configJson);
      } catch (e) {
        console.warn(`[HostService] Failed to parse config...`, config);
      }
    }

    // 不足している設定をマージ
    if (config == undefined) {
      config = this.DEFAULT_CONFIG;
    } else {
      for (const configCategory of Object.keys(this.DEFAULT_CONFIG)) {
        if (configCategory in config === false) {
          config[configCategory] = this.DEFAULT_CONFIG[configCategory];
          continue;
        }

        for (const configKey of Object.keys(
          this.DEFAULT_CONFIG[configCategory]
        )) {
          if (configKey in config[configCategory] === false) {
            config[configCategory][configKey] =
              this.DEFAULT_CONFIG[configCategory][configKey];
          }
        }
      }
    }

    this.config = config;
  }

  /**
   * ホストスクリプト (アソビステージのページ) に対するメッセージの送信
   * @param message 送信するメッセージ
   */
  protected sendMessageToAsBridge(message: any) {
    window.parent.postMessage(message, '*');
  }
}
