import { TestBed } from '@angular/core/testing';

import { CommentRecorderService } from './comment-recorder.service';

describe('CommentRecorderService', () => {
  let service: CommentRecorderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommentRecorderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
