import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  public bookmarkletRaw: string;
  public bookmarklet: SafeUrl;

  public isOfficialVersion: boolean;

  public static BOOKMARKLET = `
  javascript:(function (d,u,s) {
      s=d.createElement('script');
      s.type='text/javascript';
      s.src=u+'?t='+Date.now();
      d.body.appendChild(s);
  })(document, '%HOST_SCRIPT_URL%');
  `;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.isOfficialVersion = window.location.host.match(
      /^(localhost:4200|arisucool\.github\.io)$/
    )
      ? true
      : false;

    let asBridgeUrl = `assets/as-bridge.js`;
    if (
      0 < document.getElementsByTagName('base').length &&
      document.getElementsByTagName('base')[0].href
    ) {
      asBridgeUrl = `${
        document.getElementsByTagName('base')[0].href
      }${asBridgeUrl}`;
    } else {
      asBridgeUrl = `${window.location.protocol}//${window.location.host}/${asBridgeUrl}`;
    }

    this.bookmarkletRaw = HomeComponent.BOOKMARKLET.replace(
      /%HOST_SCRIPT_URL%/g,
      asBridgeUrl
    ).replace(/(\t|\s{2,}|\n)/g, '');
    this.bookmarklet = this.sanitizer.bypassSecurityTrustUrl(
      this.bookmarkletRaw
    );
  }
}
