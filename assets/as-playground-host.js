class acasp_HostScript {
  constructor(options) {
    this.loader = options && options.loader ? options.loader : "bookmarklet";
    this.baseUrl = options && options.baseUrl ? options.baseUrl : null;
    this.NicoJS = options && options.nicoJS ? options.nicoJS : null;
  }

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

    // Chrome 拡張機能環境、かつ、アーカイブ再生画面ならば
    if (this.loader === "chrome_ext" && this.pageType == "ARCHIVE_PLAY_PAGE") {
      // ブックマークレット環境ならば、プレーヤーフレームを単体表示するための案内が必要であるのに対し、
      // Chrome 拡張機能環境ならば、プレーヤーフレーム内に別インスタンスでホストスクリプトを読み込めているので、
      // 自身は仕事しなくて良い
      return;
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

    // リアルタイム再生画面ならば
    if (this.pageType == "REALTIME_PLAY_PAGE") {
      // コメント一覧の新着コメントを監視
      this.startCommentWatching();
    }

    // プレーヤーフレーム内画面ならば
    if (this.pageType == "PLAYER_FRAME_PAGE") {
      // 動画再生領域のタイムスタンプを監視
      this.startPlayerCurrentTimeWatching();

      // NicoJS (コメント表示ライブラリ) を読み込み
      const nicoJS = await this.loadNicoJS();
      this.nicoJs = new nicoJS({
        app: document.getElementById("embed"),
        width: window.innerWidth,
        height: window.innerHeight,
        font_size: 30,
        color: "#ffffff",
        speed: 4,
      });
      this.nicoJs.listen();

      // ウィンドウのリサイズを監視 (コメント表示領域をリサイズするため)
      window.addEventListener("resize", () => {
        this.nicoJs.resize(window.innerWidth, window.innerHeight);
      });
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
      this.toggleBtnElem.innerHTML = "&nbsp;";
      this.toggleBtnElem.style.background = "rgba(150, 150, 150, 0.4)";
      this.toggleBtnElem.style.borderRadius = "20px";
      this.toggleBtnElem.style.cursor = "pointer";
      this.toggleBtnElem.style.textAlign = "center";
      this.toggleBtnElem.style.bottom = "320px";
      this.toggleBtnElem.style.right = "190px";
      this.toggleBtnElem.style.position = "fixed";
      this.toggleBtnElem.style.width = "100px";
      this.toggleBtnElem.style.height = "12px";
      this.toggleBtnElem.style.zIndex = "9999";

      document.body.appendChild(this.toggleBtnElem);
    });
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
      this.toggleBtnElem.style.bottom = "320px";
    } else {
      this.iframeElem.style.display = "none";
      this.toggleBtnElem.style.bottom = "-5px";
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
    this.stopCommentWatching();

    this.commentWatchingTimerId = window.setInterval(() => {
      let newComments = this.getNewComments();
      if (newComments.length <= 0) return;

      const d = new Date();
      let eventName =
        document.title.replace(/ \| ASOBISTAGE \| アソビストア/g, "") +
        ` (${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()})`;

      this.iframeElem.contentWindow.postMessage(
        {
          type: "COMMENTS_RECEIVED",
          eventName: eventName,
          comments: newComments,
        },
        "*"
      );
    }, 500);
  }

  startPlayerCurrentTimeWatching() {
    console.log("startPlayerCurrentTimeWatching");
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
        btoa(encodeURIComponent(nickname)) + btoa(encodeURIComponent(comment));
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

(function () {
  if (typeof module !== "undefined") {
    module.exports = acasp_HostScript;
  } else {
    const hostScript = new acasp_HostScript();
    hostScript.init();
  }
})();
