if (typeof acasp_HostScriptInstance !== "undefined") {
  acasp_HostScriptInstance.destroy();
}

(function () {
  class acasp_HostScript {
    constructor(options) {
      this.loader = options && options.loader ? options.loader : "bookmarklet";
      this.baseUrl = options && options.baseUrl ? options.baseUrl : null;
      this.NicoJS = options && options.nicoJS ? options.nicoJS : null;
    }

    async init() {
      // 変数を初期化
      this.iframeElem = null;
      this.commentWatchingTimerId = null;
      this.playerCurrentTimeWatchingTimerId = null;
      this.playerCurrentTimeSeconds = "";
      this.overlayCommentsElem = null;

      // イベントリスナを初期化
      this.listeners = {
        message: undefined,
        resize: undefined,
      };

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
      this.playerElem = document.body.querySelector("video.vjs-tech");
      this.playerContainerElem = document.body.querySelector(".video-js");

      // ページの種別を特定
      if (
        window.location.href.match(
          /archive/ && this.commentListElem && this.playerElem
        )
      ) {
        this.pageType = "ARCHIVE_PLAY_PAGE"; // アーカイブ再生画面
      } else if (this.commentListElem) {
        this.pageType = "REALTIME_PLAY_PAGE"; // リアルタイム再生画面
      } else {
        this.pageType = "UNKNOWN"; // 不明な画面
      }
      console.log(
        `[acasp_HostScript] init - pageType = ${this.pageType}`,
        this.commentViewerElem,
        this.commentListElem,
        this.playerElem
      );

      // window.postMessage を介したメッセージを取得するためのイベントリスナを設定
      this.listeners.message = (message) => {
        this.onReceiveMessageFromIframe(message);
      };
      window.addEventListener("message", this.listeners.message, false);

      // アプリケーションフレームを読み込み
      await this.loadIframe();

      // リアルタイム再生画面ならば
      if (this.pageType == "REALTIME_PLAY_PAGE") {
        // コメント一覧の新着コメントを監視
        this.startCommentWatching();
      }

      // アーカイブ再生画面ならば
      if (this.pageType == "ARCHIVE_PLAY_PAGE") {
        // 動画再生領域のタイムスタンプを監視
        this.startPlayerCurrentTimeWatching();

        // コメント表示のための領域を生成
        this.initOverlayCommentsElem();

        // NicoJS (コメント表示ライブラリ) を読み込み
        const nicoJS = await this.loadNicoJS();
        this.nicoJs = new nicoJS({
          app: this.overlayCommentsElem,
          width: window.innerWidth,
          height: window.innerHeight,
          font_size: 30,
          color: "#ffffff",
          speed: 7,
        });
        this.nicoJs.listen();

        // ウィンドウのリサイズを監視 (コメント表示領域をリサイズするため)
        this.listeners.resize = () => {
          this.onResizeWindow();
        };
        window.addEventListener("resize", this.onResizeWindow);

        // コメント一覧の新着コメントを監視
        this.startCommentWatching();
      }
    }

    destroy() {
      console.log(`[acasp_HostScript] destroy - Destroying instance...`);

      // イベントリスナの解除
      if (this.listeners.message) {
        window.removeEventListener("message", this.listeners.message, false);
      }
      if (this.listeners.resize) {
        window.removeEventListener("resize", this.listeners.resize);
      }

      // タイマの解除
      this.stopCommentWatching();
      this.stopPlayerCurrentTimeWatching();

      // 要素の削除
      if (this.iframeElem) {
        this.iframeElem.remove();
      }
      if (this.toggleBtnElem) {
        this.toggleBtnElem.remove();
      }
    }

    onReceiveMessageFromIframe(message) {
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
      } else if (message.data.type === "SET_PLAYER_CURRENT_TIME") {
        this.setPlayerCurrentTime(message.data.seconds);
      }
    }

    onResizeWindow() {
      if (!this.nicoJs) return;
      this.nicoJs.resize(window.innerWidth, window.innerHeight);
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
      if (this.baseUrl) return this.baseUrl;

      let scriptUrl = this.getOwnScriptUrl();
      if (!scriptUrl) {
        console.error("getOwnBaseUrl", "エラー: スクリプトのURLが不明です");
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

        this.toggleBtnElem = document.createElement("div");
        this.toggleBtnElem.addEventListener("click", () => {
          this.toggleIframeVisiblity();
        });
        this.toggleBtnElem.title = "as-playground を展開/折りたたむ";
        this.toggleBtnElem.innerHTML = "&nbsp;";
        this.toggleBtnElem.style.background = "rgba(200, 200, 200, 0.8)";
        this.toggleBtnElem.style.borderRadius = "20px";
        this.toggleBtnElem.style.cursor = "pointer";
        this.toggleBtnElem.style.textAlign = "center";
        this.toggleBtnElem.style.bottom = "317px";
        this.toggleBtnElem.style.right = "180px";
        this.toggleBtnElem.style.position = "fixed";
        this.toggleBtnElem.style.width = "120px";
        this.toggleBtnElem.style.height = "12px";
        this.toggleBtnElem.style.zIndex = "9999";

        document.body.appendChild(this.toggleBtnElem);
      });
    }

    async initOverlayCommentsElem() {
      if (!this.playerContainerElem) return;

      const overlayCommentsContainerElem = document.createElement("div");
      overlayCommentsContainerElem.className = "overlay-comments-container";
      overlayCommentsContainerElem.style.bottom = "0px";
      overlayCommentsContainerElem.style.right = "0px";
      overlayCommentsContainerElem.style.left = "0px";
      overlayCommentsContainerElem.style.position = "absolute";
      overlayCommentsContainerElem.style.top = "0px";
      overlayCommentsContainerElem.style.width = "100%";
      overlayCommentsContainerElem.style.height = "100%";
      overlayCommentsContainerElem.style.pointerEvents = "none";

      const overlayCommentsElem = document.createElement("div");
      this.overlayCommentsElem = overlayCommentsElem;

      overlayCommentsContainerElem.appendChild(this.overlayCommentsElem);
      this.playerContainerElem.appendChild(overlayCommentsContainerElem);
    }

    async loadNicoJS() {
      if (this.NicoJS) {
        return this.NicoJS;
      } else if (nicoJS) {
        return nicoJS;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.onload = () => {
          resolve(nicoJS);
        };
        script.type = "text/javascript";
        script.src = "https://mugiply.github.io/nicoJS/lib/nico.js";
        document.body.appendChild(script);
      });
    }

    toggleIframeVisiblity() {
      if (this.iframeElem.style.display == "none") {
        this.setIframeVisiblity(true);
      } else {
        this.setIframeVisiblity(false);
      }
    }

    setIframeVisiblity(value) {
      if (value) {
        this.iframeElem.style.display = "block";
        this.toggleBtnElem.style.bottom = "317px";
      } else {
        this.iframeElem.style.display = "none";
        this.toggleBtnElem.style.bottom = "-2px";
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
      for (const comment of comments) {
        this.nicoJs.send({ text: comment.comment });
      }
    }

    startCommentWatching() {
      console.log(`[acasp_HostScript] startCommentWatching`);

      this.stopCommentWatching();

      this.commentWatchingTimerId = window.setInterval(() => {
        let currentTimeSeconds = this.getPlayerCurrentTime();
        let comments = this.getComments();
        if (comments.length <= 0) return;

        const d = new Date();
        let eventName = document.title.replace(
          / \| ASOBISTAGE \| アソビストア/g,
          ""
        );

        let pathMatches = window.location.pathname.match(
          /\/([a-zA-Z0-9_]+)\/{0,1}$/
        );
        if (pathMatches) {
          eventName += " " + pathMatches[1];
        }

        this.iframeElem.contentWindow.postMessage(
          {
            type: "COMMENTS_RECEIVED",
            eventName: eventName,
            comments: comments,
            currentTimeSeconds: currentTimeSeconds,
          },
          "*"
        );
      }, 100);
    }

    startPlayerCurrentTimeWatching() {
      console.log("[acasp_HostScript] startPlayerCurrentTimeWatching");

      this.stopPlayerCurrentTimeWatching();

      this.playerCurrentTimeWatchingTimerId = window.setInterval(() => {
        const currentTimeSeconds = this.getPlayerCurrentTime();
        if (
          !currentTimeSeconds ||
          currentTimeSeconds == this.playerCurrentTimeSeconds
        ) {
          return;
        }

        this.playerCurrentTimeSeconds = currentTimeSeconds;
        this.iframeElem.contentWindow.postMessage(
          {
            type: "PLAYER_CURRENT_TIME_CHANGED",
            currentTimeSeconds: currentTimeSeconds,
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
      let comments = [];

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

        comments.push({
          nickname: nickname,
          nicknameColor: nicknameColor,
          comment: comment,
          registeredDate: new Date(),
        });
      }

      return comments.slice().reverse();
    }

    getPlayerCurrentTime() {
      if (!this.playerElem) return;
      return this.playerElem.currentTime;
    }

    setPlayerCurrentTime(seconds) {
      this.playerElem.currentTime = seconds;
    }
  }

  if (typeof module !== "undefined") {
    module.exports = acasp_HostScript;
  } else {
    acasp_HostScriptInstance = new acasp_HostScript();
    acasp_HostScriptInstance.init();
  }
})();
