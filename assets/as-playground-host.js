(function () {
  class HostScript {
    init() {
      this.commentViewerElem = document.body.querySelector(
        '[class^="commentViewer_commentViewer__"]'
      );
      this.commentListElem = this.commentViewerElem.querySelector(
        '[class^="commentViewer_commentList__"]'
      );

      this.comments = {};
      this.iframeElem = null;
      this.commentWatchingTimerId = null;

      this.loadIframe();
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

    loadIframe() {
      let scriptUrl = this.getOwnScriptUrl();
      if (!scriptUrl) {
        window.alert("エラー: スクリプトのURLが不明です");
        return;
      }

      let hostUrl = scriptUrl.replace(
        /\/assets\/as-playground-host\.js\?t=\d+/g,
        ""
      );

      this.iframeElem = document.createElement("iframe");
      this.iframeElem.src = `${hostUrl}/host?t=${new Date().getTime()}`;
      this.iframeElem.style.bottom = "0px";
      this.iframeElem.style.right = "0px";
      this.iframeElem.style.position = "fixed";
      this.iframeElem.style.width = "480px";
      this.iframeElem.style.height = "320px";
      this.iframeElem.style.zIndex = "10000";
      document.body.appendChild(this.iframeElem);
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
        console.log(nickname, comment);

        let commentId =
          btoa(encodeURIComponent(nickname)) +
          btoa(encodeURIComponent(comment));
        if (this.comments[commentId]) continue;

        this.comments[commentId] = {
          nickname: nickname,
          comment: comment,
          receivedDate: new Date(),
        };

        newComments.push({
          id: commentId,
          nickname: nickname,
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
