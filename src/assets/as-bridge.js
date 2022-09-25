if (typeof acasp_AsBridgeInstance !== "undefined") {
  acasp_AsBridgeInstance.destroy();
}

(function () {
  class AsBridge {
    constructor(options) {
      this.loader = options && options.loader ? options.loader : "bookmarklet";
      this.baseUrl = options && options.baseUrl ? options.baseUrl : null;
      this.NicoJS = options && options.nicoJS ? options.nicoJS : null;
      this.asBridgeRevision = 1;
    }

    async init() {
      // 変数を初期化
      this.iframeElem = null;
      this.commentWatchingTimerId = null;
      this.playerCurrentTimeWatchingTimerId = null;
      this.playerCurrentTimeSeconds = "";
      this.overlayCommentsElem = null;
      this.mutationObserver = null;

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
        window.location.href.match(/archive/) &&
        this.commentListElem &&
        this.playerElem
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

      // アプリケーションフレームを読み込み
      await this.loadIframe();

      // リアルタイム視聴画面ならば
      if (this.pageType == "REALTIME_PLAY_PAGE") {
        // コメント一覧の新着コメントを監視
        this.startCommentWatching();

        // アプリケーションフレームを表示
        this.setIframeVisiblity(true);
      }

      // アーカイブ視聴画面ならば
      if (this.pageType == "ARCHIVE_PLAY_PAGE") {
        // 動画再生領域のタイムスタンプを監視
        this.startPlayerCurrentTimeWatching();
      }

      if (this.pageType !== "UNKNOWN") {
        // コメント一覧の新着コメントを監視
        this.startCommentWatching();

        // アプリケーションフレームを表示
        this.setIframeVisiblity(true);

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
      } else if (message.data.type == "SHOW_OVERLAY_COMMENTS") {
        this.showOverlayComments(message.data.comments);
      } else if (message.data.type === "SET_PLAYER_CURRENT_TIME") {
        this.setPlayerCurrentTime(message.data.seconds);
      } else if (message.data.type === "REQUEST_QR_CODE_OF_ASOBI_LIGHT") {
        this.requestQRCodeDataUrlOfAsobiLight();
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

        const params = new URLSearchParams();
        params.set("t", Date.now());
        params.set("pageType", this.pageType);
        params.set("asBridgeRevision", this.asBridgeRevision);

        this.iframeElem = document.createElement("iframe");
        this.iframeElem.onload = () => {
          resolve();
        };
        this.iframeElem.src = `${hostUrl}/host?${params.toString()}`;
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
        console.log(
          `[AsBridge] loadNicoJS - NicoJS loaded with using constructor...`
        );
        return this.NicoJS;
      } else if (typeof nicoJS !== "undefined") {
        console.log(`[AsBridge] loadNicoJS - NicoJS Already loaded...`);
        return nicoJS;
      }

      console.log(`[AsBridge] loadNicoJS - Loading NicoJS...`);

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

    async requestQRCodeDataUrlOfAsobiLight() {
      const dataUrl = await this.getQRCodeDataUrlOfAsobiLight();
      this.iframeElem.contentWindow.postMessage(
        {
          type: "QR_CODE_OF_ASOBI_LIGHT_RECEIVED",
          dataUrl: dataUrl,
        },
        "*"
      );
    }

    async getQRCodeDataUrlOfAsobiLight() {
      return new Promise((resolve, reject) => {
        const asobiLightPanelBtnElem = document.querySelector(
          ".style_asobilight__S-G3r"
        );
        if (!asobiLightPanelBtnElem)
          return reject("アソビライトを制御するための要素が見つかりません");

        // アソビライトの設定パネルを開く
        asobiLightPanelBtnElem.dataset.visible = "true";

        // "スマホで操作" をクリック
        const btn = document.querySelector(
          "button.asobilightSetting_setting_controller_btn__efnCU"
        );
        if (btn) btn.click();

        // 少し待つ
        setTimeout(() => {
          const qrCodeImgElem = document.querySelector(
            ".asobilightSetting_connect_image_qr__1qyzj img"
          );
          if (!qrCodeImgElem) throw new Error("");
          console.log(
            `[AsBridge] getQRCodeDataUrlOfAsobiLight -  Found QRCode element...`,
            qrCodeImgElem
          );

          const canvas = document.createElement("canvas");
          canvas.width = qrCodeImgElem.naturalWidth;
          canvas.height = qrCodeImgElem.naturalHeight;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(qrCodeImgElem, 0, 0);

          asobiLightPanelBtnElem.dataset.visible = "false";

          const dataUrl = canvas.toDataURL();
          console.log(
            `[AsBridge] getQRCodeDataUrlOfAsobiLight -  Got dataUrl...`,
            dataUrl
          );
          return resolve(dataUrl);
        }, 500);
      });
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
    module.exports = AsBridge;
  } else {
    acasp_AsBridgeInstance = new AsBridge();
    acasp_AsBridgeInstance.init().then(() => {
      acasp_AsBridgeInstance.setIframeVisiblity(true);
    });
  }
})();
