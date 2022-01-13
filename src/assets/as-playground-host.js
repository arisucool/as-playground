(function () {
  class HostScript {
    async init() {
      // 変数を初期化
      this.comments = {};
      this.iframeElem = null;
      this.commentWatchingTimerId = null;
      this.playerCurrentTimeWatchingTimerId = null;
      this.playerCurrentTime = "";

      // コメント一覧の要素を取得
      this.commentViewerElem = document.body.querySelector(
        '[class^="commentViewer_commentViewer__"]'
      );
      this.commentListElem = this.commentViewerElem
        ? this.commentViewerElem.querySelector(
            '[class^="commentViewer_commentList__"]'
          )
        : null;

      // 動画再生領域の要素を取得 (動画にあわせてコメントを重ねて表示するために使用)
      this.playerFrameElem = null;
      for (const frameElem of document.body.querySelectorAll("iframe")) {
        if (frameElem.src.match(/playervspf.channel.or.jp/)) {
          this.playerFrameElem = frameElem;
          break;
        }
      }
      this.playerElem = document.body.querySelector(".vjs-tech");

      // ページの種別を特定
      if (this.commentListElem) {
        this.pageType = "REALTIME_PLAY_PAGE"; // リアルタイム再生画面
      } else if (this.playerFrameElem) {
        this.pageType = "ARCHIVE_PLAY_PAGE"; // アーカイブ再生画面
      } else if (this.playerElem) {
        this.pageType = "PLAYER_FRAME_PAGE"; // プレーヤーフレーム内画面
      } else {
        this.pageType = "UNKNOWN"; // 不明な画面
      }

      // window.postMessage を介したメッセージを取得するためのイベントリスナを設定
      window.addEventListener(
        "message",
        (message) => {
          if (!message.data || !message.data.type) return;

          if (message.origin.indexOf(this.getOwnBaseUrl()) == -1) {
            console.log("Message received from other frame", message);
          }

          console.log("Message received from iframe", message);

          if (message.data.type == "SET_IFRAME_VISIBILITY") {
            this.setIframeVisiblity(message.data.value);
          } else if (message.data.type == "OPEN_PLAYER_FRAME_PAGE") {
            this.openPlayerFramePage();
          } else if (message.data.type == "SHOW_OVERLAY_COMMENTS") {
            this.showOverlayComments(message.data.comments);
          }
        },
        false
      );

      // アプリケーションフレームを読み込み
      await this.loadIframe();

      // コメント一覧の新着コメントを監視
      if (this.pageType == "REALTIME_PLAY_PAGE") {
        this.startCommentWatching();
      }

      // 動画再生領域のタイムスタンプを監視
      if (this.pageType == "PLAYER_FRAME_PAGE") {
        this.startPlayerCurrentTimeWatching();
      }
    }

    getOwnScriptUrl() {
      let scripts = document.getElementsByTagName("script");
      for (let script of scripts) {
        if (script.src && script.src.match(/as-playground-host.js/)) {
          return script.src;
        }
      }
      return null;
    }

    getOwnBaseUrl() {
      let scriptUrl = this.getOwnScriptUrl();
      if (!scriptUrl) {
        window.alert("エラー: スクリプトのURLが不明です");
        return;
      }

      return scriptUrl.replace(/\/assets\/as-playground-host\.js\?t=\d+/g, "");
    }

    async loadIframe() {
      return new Promise((resolve, reject) => {
        const hostUrl = this.getOwnBaseUrl();

        this.iframeElem = document.createElement("iframe");
        this.iframeElem.onload = () => {
          resolve();
        };
        this.iframeElem.src = `${hostUrl}/host?t=${new Date().getTime()}&pageType=${
          this.pageType
        }`;
        this.iframeElem.style.bottom = "0px";
        this.iframeElem.style.right = "0px";
        this.iframeElem.style.position = "fixed";
        this.iframeElem.style.width = "480px";
        this.iframeElem.style.height = "320px";
        this.iframeElem.style.zIndex = "10000";

        document.body.appendChild(this.iframeElem);
      });
    }

    setIframeVisiblity(value) {
      if (value) {
        this.iframeElem.style.display = "block";
      } else {
        this.iframeElem.style.display = "none";
      }
    }

    openPlayerFramePage() {
      if (!this.playerFrameElem) {
        window.alert("エラー: プレーヤーのURLを特定できません");
        return;
      }

      const playerFrameUrl = this.playerFrameElem.src;
      const openedWindow = window.open(playerFrameUrl);
      openedWindow.blur();
      window.focus();
    }

    showOverlayComments(comments) {
      console.log("showOverlayComments", comments);
    }

    startCommentWatching() {
      this.stopCommentWatching();

      this.commentWatchingTimerId = window.setInterval(() => {
        let newComments = this.getNewComments();
        if (newComments.length <= 0) return;

        this.iframeElem.contentWindow.postMessage(
          {
            type: "COMMENTS_RECEIVED",
            comments: newComments,
          },
          "*"
        );
      }, 500);
    }

    startPlayerCurrentTimeWatching() {
      this.stopPlayerCurrentTimeWatching();

      this.playerCurrentTimeWatchingTimerId = window.setInterval(() => {
        const currentTime = this.getPlayerCurrentTime();
        if (currentTime == this.playerCurrentTime) {
          return;
        }

        this.playerCurrentTime = currentTime;
        this.iframeElem.contentWindow.postMessage(
          {
            type: "PLAYER_CURRENT_TIME_CHANGED",
            currentTime: currentTime,
          },
          "*"
        );
      }, 500);
    }

    stopCommentWatching() {
      if (!this.commentWatchingTimerId) {
        return;
      }

      window.clearInterval(this.commentWatchingTimerId);
    }

    stopPlayerCurrentTimeWatching() {
      if (!this.playerCurrentTimeWatchingTimerId) {
        return;
      }

      window.clearInterval(this.playerCurrentTimeWatchingTimerId);
    }

    getComments() {
      return this.comments;
    }

    getNewComments() {
      let newComments = [];

      let itemElems = this.commentListElem.querySelectorAll(
        '[class^="commentViewer_item__"]'
      );
      for (let itemElem of itemElems) {
        let nicknameElem = itemElem.querySelector(
          '[class^="commentViewer_item_nickName__"]'
        );
        let commentElem = itemElem.querySelector(
          '[class^="commentViewer_item_comment__"]'
        );

        let nickname = nicknameElem.innerText;
        let comment = commentElem.innerText;
        if (!nickname || !comment) continue;

        let nicknameColor = nicknameElem.style.color
          ? nicknameElem.style.color
          : "#000000";

        let commentId =
          btoa(encodeURIComponent(nickname)) +
          btoa(encodeURIComponent(comment));
        if (this.comments[commentId]) continue;

        this.comments[commentId] = {
          nickname: nickname,
          nicknameColor: nicknameColor,
          comment: comment,
          receivedDate: new Date(),
        };

        newComments.push({
          id: commentId,
          nickname: nickname,
          nicknameColor: nicknameColor,
          comment: comment,
          receivedDate: new Date(),
        });
      }

      return newComments.slice().reverse();
    }

    getPlayerCurrentTime() {
      if (!this.playerElem) return;

      const elem = document.querySelector(".vjs-current-time-display");

      return elem.innerText.replace(/\s/g, "");
    }
  }

  const hostScript = new HostScript();
  hostScript.init();
})();
