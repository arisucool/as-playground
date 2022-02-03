import { TestBed } from '@angular/core/testing';

import { CommentLoaderService } from './comment-loader.service';

describe('CommentLoaderService', () => {
  let service: CommentLoaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommentLoaderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
