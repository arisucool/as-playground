import { Component, Input, OnInit } from '@angular/core';
import { HostService } from '../host.service';
import { CommentOverlayConfig } from '../model/config.interface';

@Component({
  selector: 'app-comment-overlay',
  templateUrl: './comment-overlay.component.html',
  styleUrls: ['./comment-overlay.component.scss'],
})
export class CommentOverlayComponent {
  @Input()
  public config: CommentOverlayConfig;

  constructor(private hostService: HostService) {}

  onChangeConfig(changedValue: any) {
    this.hostService.saveConfig();
  }
}
