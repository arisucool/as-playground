import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommentAnalysisComponent } from './comment-analysis.component';

describe('CommentAnalysisComponent', () => {
  let component: CommentAnalysisComponent;
  let fixture: ComponentFixture<CommentAnalysisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CommentAnalysisComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CommentAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
