(function () {
  class HostScript {
    async init() {
      this.commentViewerElem = document.body.querySelector(
        '[class^="commentViewer_commentViewer__"]'
      );
      this.commentListElem = this.commentViewerElem.querySelector(
        '[class^="commentViewer_commentList__"]'
      );

      this.comments = {};
      this.iframeElem = null;
      this.commentWatchingTimerId = null;

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
          }
        },
        false
      );

      await this.loadIframe();
      this.startCommentWatching();
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
        this.iframeElem.src = `${hostUrl}/host?t=${new Date().getTime()}`;
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

    stopCommentWatching() {
      if (!this.commentWatchingTimerId) {
        return;
      }

      window.clearInterval(this.commentWatchingTimerId);
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
  }

  const hostScript = new HostScript();
  hostScript.init();
})();
