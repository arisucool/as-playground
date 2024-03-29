import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import { QRCodeModule } from 'angularx-qrcode';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { MaterialModule } from './material-module';

import { ViewerComponent } from './viewer/viewer.component';
import { HomeComponent } from './home/home.component';
import { HostComponent } from './host/host.component';
import { CommentBackupDialogComponent } from './host/comment-backup/comment-backup-dialog.component';
import { CommentAnalysisComponent } from './host/comment-analysis/comment-analysis.component';
import { ChapterComponent } from './host/chapter/chapter.component';
import { CommentOverlayComponent } from './host/comment-overlay/comment-overlay.component';

@NgModule({
  declarations: [
    AppComponent,
    ViewerComponent,
    HomeComponent,
    HostComponent,
    CommentBackupDialogComponent,
    CommentAnalysisComponent,
    ChapterComponent,
    CommentOverlayComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    QRCodeModule,
    NgxChartsModule,
    MaterialModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
