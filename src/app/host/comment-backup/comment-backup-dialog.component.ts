import { Component, OnInit, ViewChild } from '@angular/core';
import { CommentRecorderService } from '../comment-recorder.service';

@Component({
  selector: 'app-comment-backup-dialog',
  templateUrl: './comment-backup-dialog.component.html',
  styleUrls: ['./comment-backup-dialog.component.scss'],
})
export class CommentBackupDialogComponent implements OnInit {
  @ViewChild('importFileInput') importFileInput;
  public importedEventName: string;
  public numOfImportedComments: number;
  public importFileError: string;

  constructor(private commentRecorder: CommentRecorderService) {}

  ngOnInit(): void {
    this.importedEventName = null;
    this.numOfImportedComments = -1;
    this.importFileError = null;
  }

  onImportFileChanged() {
    const files: { [key: string]: File } =
      this.importFileInput.nativeElement.files;

    if (Object.keys(files).length <= 0) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = await this.importFromJSON(
          event.target.result.toString()
        );
        this.importedEventName = result.eventName;
        this.numOfImportedComments = result.numOfComments;
        this.importFileError = null;
      } catch (e) {
        this.importedEventName = null;
        this.numOfImportedComments = -1;
        this.importFileError = e.message;
      }
    };
    reader.readAsText(files[0]);
  }

  async importFromJSON(json: string) {
    const data = JSON.parse(json);

    if (!data.eventName || !data.comments)
      throw new Error('JSONデータが正しくありません');

    await this.commentRecorder.clearCommentsByEventName(data.eventName);

    let numOfItems = 0;
    for (const comment of data.comments) {
      if (typeof comment.receivedDate == 'number') {
        comment.receivedDate = new Date(comment.receivedDate);
      }
      await this.commentRecorder.registerComment(data.eventName, comment);
      numOfItems++;
    }

    return {
      numOfComments: numOfItems,
      eventName: data.eventName,
    };
  }

  openFileChooser() {
    this.importFileInput.nativeElement.click();
  }
}
