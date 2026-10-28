import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { patchAudio } = require('../plugins/withHuecoAudio.cjs');

describe('native audio build integration', () => {
  it('patches both players and the effects bridge idempotently', () => {
    const root = mkdtempSync(join(tmpdir(), 'hueco-audio-'));
    try {
      const module = join(root, 'node_modules/expo-audio');
      const sources = join(module, 'android/src/main/java/expo/modules/audio');
      mkdirSync(sources, { recursive: true });
      writeFileSync(join(module, 'package.json'), JSON.stringify({ name: 'expo-audio', version: '58.0.10' }));
      for (const name of ['AudioPlayer.kt', 'AudioPlaylist.kt']) writeFileSync(join(sources, name), 'player = ExoPlayer.Builder(context)');
      writeFileSync(join(sources, 'AudioModule.kt'), '    Class(AudioPlaylist::class)');
      patchAudio(root); patchAudio(root);
      for (const name of ['AudioPlayer.kt', 'AudioPlaylist.kt']) expect(readFileSync(join(sources, name), 'utf8')).toContain('HuecoRenderersFactory(context)');
      expect(readFileSync(join(sources, 'AudioModule.kt'), 'utf8').match(/Function\("setHuecoEffects"\)/g)).toHaveLength(1);
      expect(readFileSync(join(sources, 'HuecoDsp.kt'), 'utf8')).toContain('class HuecoAudioProcessor');
      writeFileSync(join(module, 'package.json'), JSON.stringify({ version: '59.0.0' }));
      expect(() => patchAudio(root)).toThrow('requires review');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
