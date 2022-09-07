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
    this.playerCurrentTime = "";
    this.overlayCommentsElem = null;

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
    this.playerElem = document.body.querySelector(".vjs-tech");
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
      window.addEventListener("resize", () => {
        this.nicoJs.resize(window.innerWidth, window.innerHeight);
      });

      // コメント一覧の新着コメントを監視
      this.startCommentWatching();
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
      let comments = this.getComments();
      if (comments.length <= 0) return;

      const d = new Date();
      let eventName =
        document.title.replace(/ \| ASOBISTAGE \| アソビストア/g, "") +
        ` (${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()})`;

      this.iframeElem.contentWindow.postMessage(
        {
          type: "COMMENTS_RECEIVED",
          eventName: eventName,
          comments: comments,
        },
        "*"
      );
    }, 100);
  }

  startPlayerCurrentTimeWatching() {
    console.log("[acasp_HostScript] startPlayerCurrentTimeWatching");

    this.stopPlayerCurrentTimeWatching();

    this.playerCurrentTimeWatchingTimerId = window.setInterval(() => {
      const currentTime = this.getPlayerCurrentTime();
      if (!currentTime || currentTime == this.playerCurrentTime) {
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

      let commentId =
        btoa(encodeURIComponent(nickname)) + btoa(encodeURIComponent(comment));

      comments.push({
        id: commentId,
        nickname: nickname,
        nicknameColor: nicknameColor,
        comment: comment,
        receivedDate: new Date(),
      });
    }

    return comments.slice().reverse();
  }

  getPlayerCurrentTime() {
    if (!this.playerElem) return;

    const elem = document.querySelector(".vjs-current-time-display");

    return elem.innerText.replace(/\s/g, "");
  }
}

(function () {
  if (typeof module !== "undefined") {
    module.exports = acasp_HostScript;
  } else {
    const hostScript = new acasp_HostScript();
    hostScript.init();
  }
})();
