import { Component, OnInit, ViewChild } from '@angular/core';
import { CommentRecorderService } from '../comment-recorder.service';
import * as FileSaver from 'file-saver';
import { MatSnackBar } from '@angular/material/snack-bar';

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

  public eventNames: string[] = null;
  public selectedRecordedEventName: string;
  public isProcessing = false;

  constructor(
    private commentRecorder: CommentRecorderService,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    this.importedEventName = null;
    this.numOfImportedComments = -1;
    this.importFileError = null;

    this.eventNames = await this.commentRecorder.getEventNames();
  }

  onImportFileChanged() {
    const files: { [key: string]: File } =
      this.importFileInput.nativeElement.files;

    if (Object.keys(files).length <= 0) {
      return;
    }

    const snackBar = this.snackBar.open(
      'インポートしています...。コメント数が多い場合は、数十秒〜数分かかる場合があります。',
      null
    );
    this.isProcessing = true;

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
      this.isProcessing = false;
      snackBar.dismiss();
    };
    reader.readAsText(files[0]);
  }

  openFileChooser() {
    this.importFileInput.nativeElement.click();
  }

  onSelectedRecordedEventName(event) {
    this.selectedRecordedEventName = event.value;
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

  async exportComments() {
    if (!this.selectedRecordedEventName) return;

    const snackBar = this.snackBar.open(
      'エクスポートしています...。コメント数が多い場合は、数十秒〜数分かかる場合があります。',
      null
    );

    this.isProcessing = true;

    const eventName = this.selectedRecordedEventName;

    const exportData = {
      eventName: eventName,
      comments: [],
    };

    let comments = await this.commentRecorder.getCommentsByEventName(eventName);
    for (const comment of comments) {
      let c = comment as any;
      delete c.eventName;
      exportData.comments.push(c);
    }

    const blob = new Blob([JSON.stringify(exportData)], {
      type: 'application/json',
    });
    FileSaver.saveAs(blob, `comments-${eventName}.json`);
    this.isProcessing = false;
    snackBar.dismiss();
  }
}
