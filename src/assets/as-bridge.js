if (typeof acasp_AsBridgeInstance !== "undefined") {
  acasp_AsBridgeInstance.destroy();
}

(function () {
  class AsBridge {
    constructor(options) {
      this.loader = options && options.loader ? options.loader : "bookmarklet";
      this.baseUrl = options && options.baseUrl ? options.baseUrl : null;
      this.NicoJS = options && options.nicoJS ? options.nicoJS : null;
    }

    async init() {
      // 変数を初期化
      this.iframeElem = undefined;
      this.playerElem = undefined;
      this.playerContainerElem = undefined;
      this.commentWatchingTimerId = undefined;
      this.playerCurrentTimeWatchingTimerId = undefined;
      this.playerCurrentTimeSeconds = "";
      this.overlayCommentsElem = undefined;
      this.pageType = undefined;
      this.commentViewerElem = undefined;
      this.commentListElem = undefined;

      this.mutationObserver = null;

      this.commentPostWsUrl = undefined;
      this.commentPostRandomBnid = undefined;

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
        `[AsBridge] init - pageType = ${this.pageType}`,
        this.commentViewerElem,
        this.commentListElem,
        this.playerElem
      );

      // window.postMessage を介したメッセージを取得するためのイベントリスナを設定
      this.listeners.message = (message) => {
        this.onReceiveMessageFromIframe(message);
      };
      window.addEventListener("message", this.listeners.message, false);

      // コメント投稿を行うための接続先URLを取得
      if (this.loader === "chrome_ext") {
        this.commentPostWsUrl = await this.getCommentPostWsUrl();
      }

      // アプリケーションフレームを読み込み
      await this.loadIframe();

      // リアルタイム再生画面ならば
      if (this.pageType == "REALTIME_PLAY_PAGE") {
        // コメント一覧の新着コメントを監視
        this.startCommentWatching();

        // アプリケーションフレームを表示
        this.setIframeVisiblity(true);
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

        // アプリケーションフレームを表示
        this.setIframeVisiblity(true);
      }

      // SPA のページ遷移の監視
      this.startSPAPagingWatching();
    }

    destroy() {
      console.log(`[AsBridge] destroy - Destroying instance...`);

      // イベントリスナの解除
      if (this.listeners.message) {
        window.removeEventListener("message", this.listeners.message, false);
      }
      if (this.listeners.resize) {
        window.removeEventListener("resize", this.listeners.resize);
      }

      // SPAのページ遷移の監視を解除
      this.stopSPAPagingWatching();

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

    async onChangeSPAPage() {
      console.log(
        "[AsBridge] onChangeSPAPage - SPA page changed",
        window.location.href
      );

      let iframeVisiblity = undefined;
      try {
        iframeVisiblity = this.getIframeVisiblity();
      } catch (e) {}

      this.destroy();
      await this.init();

      if (iframeVisiblity !== undefined) {
        console.log(
          "[AsBridge] onChangeSPAPage - Restoring Iframe visibility...",
          iframeVisiblity
        );
        this.setIframeVisiblity(iframeVisiblity);
      }
    }

    getOwnScriptUrl() {
      let scripts = document.getElementsByTagName("script");
      for (let script of scripts) {
        if (script.src && script.src.match(/as-bridge.js/)) {
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

      return scriptUrl.replace(/\/assets\/as-bridge\.js\?t=\d+/g, "");
    }

    async loadIframe() {
      return new Promise((resolve, reject) => {
        const hostUrl = this.getOwnBaseUrl();

        const availableFunctions = [];
        if (this.commentPostWsUrl !== undefined) {
          availableFunctions.push("postComment");
        }

        this.iframeElem = document.createElement("iframe");
        this.iframeElem.onload = () => {
          resolve();
        };
        this.iframeElem.src = `${hostUrl}/host?t=${new Date().getTime()}&pageType=${
          this.pageType
        }&availableFunctions=${availableFunctions.join(",")}&loader=${
          this.loader
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

        this.setIframeVisiblity(false);

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

    getIframeVisiblity() {
      if (this.iframeElem.style.display == "none") {
        return false;
      }
      return true;
    }

    toggleIframeVisiblity() {
      if (!this.getIframeVisiblity()) {
        this.setIframeVisiblity(true);
      } else {
        this.setIframeVisiblity(false);
      }
    }

    setIframeVisiblity(value) {
      console.log(`[AsBridge] setIframeVisiblity - ${value}`);
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

    startSPAPagingWatching() {
      console.log(`[AsBridge] startSPAPagingWatching`);

      let lastUrl = location.href;

      this.mutationObserver = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;

          setTimeout(() => {
            this.onChangeSPAPage();
          }, 500);
        }
      });
      this.mutationObserver.observe(document, {
        subtree: true,
        childList: true,
      });
    }

    stopSPAPagingWatching() {
      console.log(`[AsBridge] stopSPAPagingWatching`);

      if (!this.mutationObserver) return;

      this.mutationObserver.disconnect();
    }

    startCommentWatching() {
      console.log(`[AsBridge] startCommentWatching`);

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
      console.log("[AsBridge] startPlayerCurrentTimeWatching");

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

    postComment(comment) {
      new Promise((resolve, reject) => {
        if (comment === undefined || comment.length === 0) {
          return reject("コメントが入力されていません");
        } else if (!this.commentPostWsUrl) {
          return reject("コメント投稿先が取得できません");
        }

        const prevCommentUserName = window.localStorage.getItem(
          "acaspCommentUserName"
        );
        const prevCommentColor =
          window.localStorage.getItem("acaspCommentColor");
        const prevCommentBnid = window.localStorage.getItem("acaspCommentBnid");
        if (
          prevCommentUserName === null ||
          prevCommentColor === null ||
          prevCommentUserName.length === 0 ||
          prevCommentColor.length === 0
        ) {
          return reject(
            "一度、アソビステージ上でコメントを直接投稿してください"
          );
        }

        const commentPostMessage = {
          type: "user/send-comment",
          userName: nickname,
          comment: comment,
          bnid: prevCommentBnid || this.commentPostRandomBnid,
          color: prevCommentColor,
        };
        console.log(
          `[acasp_HostScript] postComment - Comment = `,
          commentPostMessage
        );

        this.sendWsMessageOnWebSocketHook(
          this.commentPostWsUrl,
          JSON.stringify(commentPostMessage)
        );

        resolve();
      }).catch((e) => {
        this.iframeElem.contentWindow.postMessage(
          {
            type: "ERROR_OCCURRED_ON_HOST_SCRIPT",
            errorMessage: e.toString(),
          },
          "*"
        );
      });
    }

    async getCommentPostWsUrl() {
      // 読み込まれているスクリプトのソースコードを取得
      const scripts = {};
      const scriptElems = Array.from(document.querySelectorAll("script"));
      for (const scriptElem of scriptElems) {
        if (scriptElem.innerHTML && scriptElem.getAttribute("src") == null) {
          continue;
        }

        const scriptSrc = scriptElem.getAttribute("src");
        let scriptCode = undefined;
        try {
          const response = await fetch(scriptSrc);
          scriptCode = await response.text();
        } catch (e) {
          console.warn(e);
          continue;
        }

        if (scriptCode === undefined) {
          continue;
        }

        scripts[scriptSrc] = scriptCode;
      }

      console.log(
        "[acasp_HostScript] getCommentPostWsUrl - Detected scripts = ",
        scripts
      );

      // コメント投稿に関係する部分のハッシュ値を算出・照合
      const EXPECTED_SCRIPT_CHUNK_HASHSUM = {
        app: "11f04cc55ea889863cb9196db6a135af948fc956a6e1e6e0f1afa84919b530ca",
        helper:
          "4a15dd064841cc0fc1ed3f21cf21cec33e1864f97c2a5db12a2c0898449ceeb2",
      };

      let scriptChunkHashSum = {};
      for (const key of Object.keys(EXPECTED_SCRIPT_CHUNK_HASHSUM)) {
        scriptChunkHashSum[key] = null;
      }

      for (const scriptSrc of Object.keys(scripts)) {
        const scriptCode = scripts[scriptSrc];

        if (scriptSrc.match(/as-playground-host\.js/)) continue;

        if (scriptSrc.match(/\/_app-[a-z0-9]+\.js$/)) {
          // app script
          const matches = scriptCode.match(/shortUUID:(\S+),/);
          if (!matches) continue;
          scriptChunkHashSum["app"] = await this.getSHA256Hashsum(matches[0]);
        } else {
          // helper script
          const matches = scriptCode.match(/nickname:t,comment:n,[\S\s]+user/);
          if (!matches) continue;
          scriptChunkHashSum["helper"] = await this.getSHA256Hashsum(
            matches[0]
          );
        }
      }

      for (const [key, hashSum] of Object.entries(scriptChunkHashSum)) {
        if (
          hashSum === null ||
          hashSum !== EXPECTED_SCRIPT_CHUNK_HASHSUM[key]
        ) {
          // Denied
          console.error(
            `[acasp_HostScript] getCommentPostWsUrl - DENIED!! because '${key}' script is unknown version or not found.`,
            {
              expected: EXPECTED_SCRIPT_CHUNK_HASHSUM[key],
              actually: hashSum,
            }
          );
          return false;
        }
      }

      // イベント情報を取得するための API キーを検索
      let eventInfoApiKey = undefined;
      for (const scriptSrc of Object.keys(scripts)) {
        const scriptCode = scripts[scriptSrc];
        const matches = scriptCode.match(
          /apiKey:\"\".concat\(\"([a-zA-Z0-9\-]+)\"/
        );
        if (!matches) continue;

        eventInfoApiKey = matches[1];
        break;
      }

      if (!eventInfoApiKey) {
        // Denied
        console.error(
          "[acasp_HostScript] getCommentPostWsUrl - DENIED!! because apiKey for event information is not found."
        );
        return false;
      }

      console.log(
        `[acasp_HostScript] getCommentPostWsUrl - apiKey for event information is found...`,
        eventInfoApiKey
      );

      const eventPageKey = ""; // TODO: イベントのURLを入力
      if (!eventPageKey) {
        console.error(
          `[acasp_HostScript] getCommentPostWsUrl - DENIED!! because could not get eventPageKey`
        );
        return false;
      }

      // コメントURLを取得
      const eventJsonResponse = await fetch(
        "https://asobistage.microcms.io/api/v1/" + eventPageKey,
        {
          headers: {
            "x-api-key": eventInfoApiKey,
          },
        }
      );
      const eventJson = await eventJsonResponse.json();
      const commentUrls = eventJson["comment_url"];
      if (!commentUrls || commentUrls.length === 0) {
        console.error(
          "[acasp_HostScript] getCommentPostWsUrl - DENIED!! because could not get comment_url"
        );
        return false;
      } else if (
        (commentUrls[0].fieldId !== undefined &&
          commentUrls[0].fieldId !== "url") ||
        commentUrls[0].url === undefined
      ) {
        console.error(
          "[acasp_HostScript] getCommentPostWsUrl - DENIED!! because comment_url is invalid"
        );
        return false;
      }
      let commentWsUrl = commentUrls[0].url;

      // コメント投稿のための bnid の設定
      this.commentPostRandomBnid = Math.random().toString(36).slice(-8);

      // コメントの送受信の監視を開始
      console.log(
        `[acasp_HostScript] getCommentPostWsUrl - Start watching WebSocket connection...`,
        commentWsUrl
      );
      this.startWebSocketHookForOrigin(commentWsUrl);

      // Allowed
      console.log(
        `[acasp_HostScript] getCommentPostWsUrl - Allowed :)`,
        commentWsUrl
      );
      return commentWsUrl;
    }

    async getSHA256Hashsum(message) {
      if (message.length === 0) return "";
      const messageUInt8 = new TextEncoder("utf-8").encode(message);
      const hashBuffer = await crypto.subtle.digest("SHA-256", messageUInt8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      console.log("[acasp_HostScript] getSHA256Hashsum", hashHex, message);
      return hashHex;
    }

    startWebSocketHookForOrigin(wsOrigin) {
      window.postMessage(
        {
          type: "SET_TARGET_WEBHOOK_ORIGIN",
          wsOrigin: wsOrigin,
        },
        "*"
      );
    }

    sendWsMessageOnWebSocketHook(wsOrigin, wsMessage) {
      window.postMessage(
        {
          type: "SEND_WS_MESSAGE",
          wsOrigin: wsOrigin,
          wsMessage: wsMessage,
        },
        "*"
      );
    }

    onWsMessageReceivedFromWebSocketHook(wsOrigin, wsMessage) {
      console.log(
        "[acasp_HostScript] onWsMessageReceivedFromWebSocketHook",
        wsOrigin,
        wsMessage
      );

      let message = undefined;
      try {
        message = JSON.parse(wsMessage);
      } catch (e) {
        console.warn(e);
      }
      if (!message) return;

      if (message.type === "user/send-comment") {
        window.localStorage.setItem("acaspCommentUserName", message.userName);
        window.localStorage.setItem("acaspCommentColor", message.color);
        window.localStorage.setItem("acaspCommentBnid", message.bnid);
      }
    }
  }

  if (typeof module !== "undefined") {
    module.exports = AsBridge;
  } else {
    acasp_AsBridgeInstance = new AsBridge();
    acasp_AsBridgeInstance.init().then(() => {
      acasp_AsBridgeInstance.setIframeVisiblity(true);
    });
  }
})();
