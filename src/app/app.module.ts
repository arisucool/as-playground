import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { QRCodeModule } from 'angularx-qrcode';
import { MaterialModule } from './material-module';

import { ViewerComponent } from './viewer/viewer.component';
import { HomeComponent } from './home/home.component';
import { HostComponent } from './host/host.component';

@NgModule({
  declarations: [AppComponent, ViewerComponent, HomeComponent, HostComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    QRCodeModule,
    MaterialModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
