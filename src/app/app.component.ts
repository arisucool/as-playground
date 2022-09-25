import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  theme: 'light' | 'dark' = 'light';
  title = 'as-playground';

  ngOnInit() {
    if (window.location.pathname.match(/^\/(viewer|v)\//)) {
      this.theme = 'dark';
    }
  }
}
