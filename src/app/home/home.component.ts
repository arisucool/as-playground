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

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    let hostScriptUrl = `assets/as-playground-host.js`;
    if (
      0 < document.getElementsByTagName('base').length &&
      document.getElementsByTagName('base')[0].href
    ) {
      hostScriptUrl = `${
        document.getElementsByTagName('base')[0].href
      }${hostScriptUrl}`;
    } else {
      hostScriptUrl = `${window.location.protocol}//${window.location.host}/${hostScriptUrl}`;
    }

    this.bookmarkletRaw = `javascript:(function(d,u,s){s=d.createElement('script');s.type='text/javascript';s.src=u;d.body.appendChild(s)})(document, '${hostScriptUrl}');`;
    this.bookmarklet = this.sanitizer.bypassSecurityTrustUrl(
      this.bookmarkletRaw
    );
  }
}
