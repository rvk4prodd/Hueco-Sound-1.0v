const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

function patchAudio(root) {
  const pkgPath = require.resolve('expo-audio/package.json', { paths: [root] });
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== '58.0.10') throw new Error('Hueco DSP requires review for this expo-audio version.');
  const dir = path.join(path.dirname(pkgPath), 'android/src/main/java/expo/modules/audio');
  fs.copyFileSync(path.join(__dirname, 'android/HuecoDsp.kt'), path.join(dir, 'HuecoDsp.kt'));
  fs.copyFileSync(path.join(__dirname, 'android/HuecoWaveform.kt'), path.join(dir, 'HuecoWaveform.kt'));
  const tests = path.join(path.dirname(pkgPath), 'android/src/test/java/expo/modules/audio');
  fs.mkdirSync(tests, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'android/tests/HuecoDspTest.kt'), path.join(tests, 'HuecoDspTest.kt'));
  for (const name of ['AudioPlayer.kt', 'AudioPlaylist.kt']) {
    const file = path.join(dir, name);
    let output = fs.readFileSync(file, 'utf8');
    if (!output.includes('private val huecoFactory:')) {
      const parameter = name === 'AudioPlayer.kt' ? '  bufferDurationMs: Long = 0' : '  dataSourceFactory: DataSource.Factory';
      if (!output.includes(parameter)) throw new Error(`Hueco DSP: constructor changed in ${name}`);
      output = output.replace(parameter, `${parameter},\n  private val huecoFactory: HuecoRenderersFactory = HuecoRenderersFactory(context)`);
    }
    output = output.replace(/ExoPlayer.Builder\(context(?:, HuecoRenderersFactory\(context\))?\)/, 'ExoPlayer.Builder(context, huecoFactory)');
    if (!output.includes('HuecoDsp.register(id,')) output = output.replace('  init {', '  init {\n    HuecoDsp.register(id, huecoFactory.processor)');
    if (!output.includes('HuecoDsp.unregister(id)')) output = output.replace('  override fun releasePlayer() {', '  override fun releasePlayer() {\n    HuecoDsp.unregister(id)');
    if (!output.includes('ExoPlayer.Builder(context, huecoFactory)') || !output.includes('HuecoDsp.register(id,')) throw new Error(`Hueco DSP: cannot patch ${name}`);
    fs.writeFileSync(file, output);
  }
  const file = path.join(dir, 'AudioModule.kt');
  let input = fs.readFileSync(file, 'utf8');
  if (!input.includes('Function("setHuecoDeckEffects")')) input = input.replace('    Class(AudioPlaylist::class)', '    Function("setHuecoDeckEffects") { id: String, config: Map<String, Any?> -> HuecoDsp.updateDeck(id, config) }\n\n    Class(AudioPlaylist::class)');
  if (!input.includes('AsyncFunction("analyzeHuecoWaveform")')) input = input.replace('    Class(AudioPlaylist::class)', '    AsyncFunction("analyzeHuecoWaveform") { uri: String -> HuecoWaveform.analyze(context, uri) }.runOnQueue(Queues.DEFAULT)\n\n    Class(AudioPlaylist::class)');
  input = input.replace('AsyncFunction("analyzeHuecoWaveform") { uri: String -> HuecoWaveform.analyze(context, uri) }', 'AsyncFunction("analyzeHuecoWaveform") { uri: String, job: String -> HuecoWaveform.analyze(context, uri, job) }');
  if (!input.includes('Function("cancelHuecoWaveform")')) input = input.replace('    Class(AudioPlaylist::class)', '    Function("cancelHuecoWaveform") { job: String -> HuecoWaveform.cancel(job) }\n\n    Class(AudioPlaylist::class)');
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
  fs.writeFileSync(file, input);
}
module.exports = config => withDangerousMod(config, ['android', async config => {
  patchAudio(config.modRequest.projectRoot);
  return config;
}]);
module.exports.patchAudio = patchAudio;
