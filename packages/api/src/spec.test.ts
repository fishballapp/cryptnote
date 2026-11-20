import * as OpenApi from 'effect/http-api/OpenApi';
import { describe, expect, it } from 'vitest';
import { CryptNoteApi } from './index.ts';

describe('CryptNoteApi OpenAPI spec', () => {
  it('exposes the expected operations and paths', () => {
    const spec = OpenApi.fromApi(CryptNoteApi);
    expect(spec.info.title).toBe('CryptNote API');
    expect(Object.keys(spec.paths).toSorted()).toEqual([
      '/api/v1/challenge',
      '/api/v1/notes/{id}',
      '/api/v1/notes/{id}/status',
    ]);
    expect(spec.paths['/api/v1/notes/{id}']?.get?.operationId).toBe('notes.get');
    expect(spec.paths['/api/v1/notes/{id}/status']?.get?.operationId).toBe('notes.status');
    expect(spec.paths['/api/v1/notes/{id}']?.put?.operationId).toBe('writes.save');
    expect(spec.paths['/api/v1/challenge']?.post?.operationId).toBe('challenge.issue');
  });
});
