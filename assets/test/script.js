class TestPage {
  constructor(opt_commentStartOffsetSeconds) {
    this.commentStartOffsetSeconds = opt_commentStartOffsetSeconds
      ? opt_commentStartOffsetSeconds
      : undefined;

    this.previousSeconds = -1;

    this.init();
  }

  init() {
    window.addEventListener("load", () => {
      let previousCurrentTime = -1;
      document.querySelector("video").addEventListener("timeupdate", (elem) => {
        this.onTimeUpdateOfDummyVideo(Math.floor(elem.target.currentTime));
      });
    });
  }

  onTimeUpdateOfDummyVideo(seconds) {
    if (seconds == this.previousSeconds) return;
    if (
      this.commentStartOffsetSeconds !== undefined &&
      seconds < this.commentStartOffsetSeconds
    )
      return;

    this.previousSeconds = seconds;

    const comments = DUMMY_COMMENTS.filter((comment) => {
      return comment.seconds == seconds;
    });
    comments.forEach((comment) => {
      this.addDummyComment(comment.nickname, comment.comment);
    });
  }

  addDummyComment(nickname_, comment_, color_) {
    if (nickname_ === undefined) {
      const nickNames = Object.keys(DUMMY_NICKNAMES);
      nickname_ = nickNames[Math.floor(Math.random() * nickNames.length)];
    }
    if (comment_ === undefined) comment_ = new Date().toString();
    if (color_ === undefined) color_ = DUMMY_NICKNAMES[nickname_] || "#fafafa";

    const commentListElem = document.querySelector(
      ".commentViewer_commentList__aa"
    );

    const commentItemElem = document.createElement("li");
    commentItemElem.classList.add("commentViewer_item__aa");

    const nickNameElem = document.createElement("p");
    nickNameElem.style.color = color_;
    nickNameElem.classList.add("commentViewer_item_nickName__aa");
    nickNameElem.innerText = nickname_;
    commentItemElem.appendChild(nickNameElem);

    const commentElem = document.createElement("p");
    commentElem.classList.add("commentViewer_item_comment__aa");
    commentElem.innerText = comment_;
    commentItemElem.appendChild(commentElem);

    commentListElem.appendChild(commentItemElem);
  }
}
