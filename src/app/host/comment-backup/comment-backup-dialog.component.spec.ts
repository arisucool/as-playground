import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommentBackupDialogComponent } from './comment-backup-dialog.component';

describe('CommentBackupDialogComponent', () => {
  let component: CommentBackupDialogComponent;
  let fixture: ComponentFixture<CommentBackupDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CommentBackupDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CommentBackupDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
