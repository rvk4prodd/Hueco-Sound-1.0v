const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

function patchAudio(root) {
  const pkgPath = require.resolve('expo-audio/package.json', { paths: [root] });
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== '58.0.10') throw new Error('Hueco DSP requires review for this expo-audio version.');
  const dir = path.join(path.dirname(pkgPath), 'android/src/main/java/expo/modules/audio');
  fs.copyFileSync(path.join(__dirname, 'android/HuecoDsp.kt'), path.join(dir, 'HuecoDsp.kt'));
  const tests = path.join(path.dirname(pkgPath), 'android/src/test/java/expo/modules/audio');
  fs.mkdirSync(tests, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'android/tests/HuecoDspTest.kt'), path.join(tests, 'HuecoDspTest.kt'));
  for (const name of ['AudioPlayer.kt', 'AudioPlaylist.kt']) {
    const file = path.join(dir, name);
    const input = fs.readFileSync(file, 'utf8');
    const output = input.replace('ExoPlayer.Builder(context)', 'ExoPlayer.Builder(context, HuecoRenderersFactory(context))');
    if (!output.includes('HuecoRenderersFactory(context)')) throw new Error(`Hueco DSP: cannot patch ${name}`);
    fs.writeFileSync(file, output);
  }
  const file = path.join(dir, 'AudioModule.kt');
  let input = fs.readFileSync(file, 'utf8');
  if (!input.includes('Function("setHuecoEffects")')) {
    const anchor = '    Class(AudioPlaylist::class)';
    if (!input.includes(anchor)) throw new Error('Hueco DSP: AudioModule anchor changed.');
    input = input.replace(anchor, `    Function("setHuecoEffects") { config: Map<String, Any?> ->
      runOnMain {
        HuecoDsp.update(config)
        val parameters = androidx.media3.common.PlaybackParameters(HuecoDsp.speed, HuecoDsp.pitch)
        players.values.forEach { it.ref.playbackParameters = parameters }
        playlists.values.forEach { it.ref.playbackParameters = parameters }
      }
    }

${anchor}`);
    fs.writeFileSync(file, input);
  }
}
module.exports = config => withDangerousMod(config, ['android', async config => {
  patchAudio(config.modRequest.projectRoot);
  return config;
}]);
module.exports.patchAudio = patchAudio;
