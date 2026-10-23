import { describe, expect, it } from 'vitest';
import { cleanRemoteTrack, parseBackup } from '../src/library/backup';
const track = { id: 'abc123', title: 'Faixa', artists: 'Artista', coverUrl: 'https://example.com/a.jpg', durationMs: 2000 };
function backup(value: object = {}) { return JSON.stringify({ format: 'liner-mobile', version: 1, likedTracks: [track], playlists: [{ name: 'Mix', tracks: [track, track] }], ...value }); }
describe('portable library backup', () => {
 it('validates version and lists before returning any import', () => { expect(() => parseBackup(backup({ version: 99 }))).toThrow(); expect(() => parseBackup(backup({ playlists: [null] }))).toThrow(); });
 it('deduplicates tracks and strips stream URLs and unknown fields', () => { const data = parseBackup(backup({ likedTracks: [{ ...track, streamUrl: 'https://signed.example/expired', token: 'private' }] })); expect(data.playlists[0].tracks).toHaveLength(1); expect(data.likedTracks[0]).not.toHaveProperty('streamUrl'); expect(data.likedTracks[0]).not.toHaveProperty('token'); });
 it('does not import local file references from another device', () => { expect(cleanRemoteTrack({ ...track, source: 'local', streamUrl: 'file:///private/song.mp3' })).toBeNull(); expect(cleanRemoteTrack({ ...track, id: 'local:123' })).toBeNull(); });
 it('rejects excessive input and normalizes invalid duration and artwork', () => { expect(() => parseBackup(backup({ playlists: Array.from({length:501}, () => ({name:'x', tracks:[]})) }))).toThrow(); expect(cleanRemoteTrack({...track,durationMs:NaN,coverUrl:'javascript:alert(1)'})).toMatchObject({durationMs:0,coverUrl:''}); });
});
