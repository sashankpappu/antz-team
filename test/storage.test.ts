import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalBlobStore } from '@/lib/storage/local';
import { artifactKey, safeSegment } from '@/lib/storage';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'intake-storage-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('artifact keys', () => {
  it('scopes a key to its workspace so a purge can find everything', () => {
    const key = artifactKey('ws1', 'art1', 'board deck.pptx');
    expect(key).toBe('workspaces/ws1/artifacts/art1/board-deck.pptx');
  });

  it('neutralises a filename that tries to climb out', () => {
    // Upload filenames come from a browser and are not trusted.
    expect(safeSegment('../../etc/passwd')).toBe('etc-passwd');
    expect(safeSegment('..')).toBe('unnamed');
    expect(safeSegment('')).toBe('unnamed');
    expect(safeSegment('a/b/c')).toBe('a-b-c');
    expect(safeSegment('deck .pptx')).toBe('deck-.pptx');
  });

  it('keeps a key usable even from a hostile filename', () => {
    const key = artifactKey('ws/1', 'art/2', '../../../../secret.txt');
    expect(key.split('/').filter((segment) => segment === '..')).toEqual([]);
  });
});

describe('local blob storage', () => {
  it('round-trips bytes exactly', async () => {
    const store = new LocalBlobStore(root);
    const body = new Uint8Array([0, 1, 2, 250, 251, 255]);
    await store.put('workspaces/w/artifacts/a/file.bin', body);

    const read = await store.get('workspaces/w/artifacts/a/file.bin');
    expect(LocalBlobStore.digest(read)).toBe(LocalBlobStore.digest(body));
  });

  it('creates the directories it needs', async () => {
    const store = new LocalBlobStore(root);
    await store.put('deep/nested/path/file.txt', new TextEncoder().encode('hello'));
    expect(await readFile(path.join(root, 'deep/nested/path/file.txt'), 'utf-8')).toBe('hello');
  });

  it('deletes, and does not complain about deleting twice', async () => {
    const store = new LocalBlobStore(root);
    await store.put('gone.txt', new TextEncoder().encode('x'));
    await store.delete('gone.txt');
    await expect(store.delete('gone.txt')).resolves.toBeUndefined();
    await expect(store.get('gone.txt')).rejects.toThrow();
  });

  it('refuses to write outside the agreed storage root', async () => {
    const store = new LocalBlobStore(root);
    await expect(
      store.put('../escaped.txt', new TextEncoder().encode('x')),
    ).rejects.toThrow(/outside the storage root/);
    await expect(store.get('../../etc/passwd')).rejects.toThrow(/outside the storage root/);
  });

  it('reports its location so an operator can see where material is going', () => {
    expect(new LocalBlobStore(root).location).toBe(path.resolve(root));
  });
});
