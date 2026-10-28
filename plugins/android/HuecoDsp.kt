package expo.modules.audio

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*
import java.util.concurrent.ConcurrentHashMap

/** Immutable configuration crosses from the JS/main thread to the audio thread. */
object HuecoDsp {
  data class DeckTone(val bassDb: Double = 0.0, val lowpass: Double = 20000.0, val highpass: Double = 20.0, val reverb: Double = 0.0)
  private val decks = ConcurrentHashMap<String, HuecoAudioProcessor>()
  fun register(id: String, processor: HuecoAudioProcessor) { decks[id] = processor }
  fun unregister(id: String) { decks.remove(id) }
  fun updateDeck(id: String, data: Map<String, Any?>) { decks[id]?.mixTone = DeckTone(number(data, "bassDb", 0.0, -24.0, 12.0), number(data, "lowpass", 20000.0, 100.0, 20000.0), number(data, "highpass", 20.0, 20.0, 8000.0), number(data, "reverb", 0.0, 0.0, 1.0)) }
  data class Settings(val eq: List<Double> = List(5) { 0.0 }, val wet: Double = 0.0,
    val width: Double = 1.0, val compressor: Boolean = false, val threshold: Double = -16.0, val ratio: Double = 4.0)
  @Volatile var settings = Settings()
  @Volatile var speed = 1f
  @Volatile var pitch = 1f
  private fun number(data: Map<String, Any?>, key: String, fallback: Double, min: Double, max: Double): Double {
    val value = (data[key] as? Number)?.toDouble() ?: fallback
    return if (value.isFinite()) value.coerceIn(min, max) else fallback
  }
  fun update(data: Map<String, Any?>) {
    val enabled = data["enabled"] == true
    val bands = data["eq"] as? List<*> ?: emptyList<Any>()
    settings = Settings(List(5) { i -> if (enabled) (bands.getOrNull(i) as? Number)?.toDouble()?.takeIf { it.isFinite() }?.coerceIn(-12.0, 12.0) ?: 0.0 else 0.0 },
      number(data, "reverb", 0.0, 0.0, 1.0),
      if (enabled) number(data, "width", 1.0, 0.0, 2.0) else 1.0,
      enabled && data["compressor"] == true,
      number(data, "threshold", -16.0, -60.0, 0.0), number(data, "ratio", 4.0, 1.0, 20.0))
    speed = number(data, "speed", 1.0, 0.5, 2.0).toFloat()
    pitch = if (data["linked"] == true) speed else 2.0.pow(number(data, "pitch", 0.0, -12.0, 12.0) / 12.0).toFloat()
  }
}

@UnstableApi
class HuecoRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
  val processor = HuecoAudioProcessor()
  override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioOutputPlaybackParams: Boolean): AudioSink =
    DefaultAudioSink.Builder(context).setEnableFloatOutput(false)
      .setAudioProcessors(arrayOf(processor)).build()
}

/** PCM DSP runs on Media3's audio thread for BOTH decks, without JS sample copies. */
@UnstableApi
class HuecoAudioProcessor : BaseAudioProcessor() {
  @Volatile var mixTone = HuecoDsp.DeckTone()
  private var lastBass = Double.NaN
  private var lowState = DoubleArray(2)
  private var highState = DoubleArray(2)
  private var sampleRate = 48000
  private var channels = 2
  private var settings: HuecoDsp.Settings? = null
  private var filters = Array(2) { Array(5) { Biquad() } }
  private var delays = Array(2) { Array(4) { DoubleArray(1) } }
  private var positions = IntArray(4)
  private var envelope = 0.0
  private var wet = 0.0
  private var width = 1.0
  private var idle = true
  override fun onConfigure(format: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (format.encoding != C.ENCODING_PCM_16BIT || format.channelCount !in 1..2) return AudioProcessor.AudioFormat.NOT_SET
    sampleRate = format.sampleRate; channels = format.channelCount
    return format
  }
  override fun onFlush() {
    lastBass = Double.NaN; lowState.fill(0.0); highState.fill(0.0)
    filters = Array(2) { Array(5) { Biquad() } }
    delays = Array(2) { ch -> Array(4) { i -> DoubleArray((sampleRate * (doubleArrayOf(.031, .043, .059, .071)[i] + ch * .002)).toInt().coerceAtLeast(1)) } }
    positions = IntArray(4); settings = null; envelope = 0.0; wet = 0.0; width = 1.0; idle = true
  }
  override fun queueInput(input: ByteBuffer) {
    val config = HuecoDsp.settings
    val tone = mixTone
    if (settings != config || lastBass != tone.bassDb) {
      val frequencies = doubleArrayOf(60.0, 250.0, 1000.0, 4000.0, 12000.0)
      for (ch in 0..1) for (i in 0..4) filters[ch][i].configure(frequencies[i].coerceAtMost(sampleRate * .45), (config.eq[i] + if (i == 0) tone.bassDb else if (i == 1) tone.bassDb * .5 else 0.0).coerceIn(-36.0, 12.0), sampleRate)
      settings = config
      lastBass = tone.bassDb
    }
    input.order(ByteOrder.LITTLE_ENDIAN)
    val output = replaceOutputBuffer(input.remaining()).order(ByteOrder.LITTLE_ENDIAN)
    // Default playback is bit-perfect and avoids DSP work when no effect is active.
    if (tone == HuecoDsp.DeckTone() && config.eq.all { it == 0.0 } && config.wet == 0.0 && wet < .0001 && config.width == 1.0 && abs(width - 1.0) < .0001 && !config.compressor) {
      if (!idle) for (channel in delays) for (delay in channel) delay.fill(0.0)
      idle = true; wet = 0.0; width = 1.0
      output.put(input); output.flip(); return
    }
    idle = false
    val threshold = 10.0.pow(config.threshold / 20.0)
    val attack = exp(-1.0 / (.005 * sampleRate)); val release = exp(-1.0 / (.120 * sampleRate))
    val lowAlpha = 1 - exp(-2 * Math.PI * tone.lowpass.coerceAtMost(sampleRate * .45) / sampleRate)
    val highAlpha = 1 - exp(-2 * Math.PI * tone.highpass / sampleRate)
    fun toneSample(x: Double, ch: Int): Double {
      var y = x
      if (tone.highpass > 20.01) { highState[ch] += highAlpha * (y - highState[ch]); y -= highState[ch] }
      if (tone.lowpass < 19999.0) { lowState[ch] += lowAlpha * (y - lowState[ch]); y = lowState[ch] }
      return y
    }
    while (input.remaining() >= channels * 2) {
      var l = input.short / 32768.0
      var r = if (channels == 2) input.short / 32768.0 else l
      for (i in 0..4) { l = filters[0][i].process(l); r = filters[1][i].process(r) }
      l = toneSample(l, 0); r = toneSample(r, 1)
      wet += ((config.wet + tone.reverb).coerceIn(0.0, 1.0) - wet) * .001; width += (config.width - width) * .001
      val middle = (l + r) * .5; val side = (l - r) * .5 * width
      l = middle + side; r = middle - side
      var echoL = 0.0; var echoR = 0.0
      for (i in 0..3) {
        val dl = delays[0][i]; val dr = delays[1][i]
        val pl = positions[i] % dl.size; val pr = positions[i] % dr.size
        val vl = dl[pl]; val vr = dr[pr]
        dl[pl] = (l * .18 + vl * .68).coerceIn(-4.0, 4.0)
        dr[pr] = (r * .18 + vr * .68).coerceIn(-4.0, 4.0)
        echoL += vl; echoR += vr
        positions[i] = (positions[i] + 1) % (dl.size * dr.size)
      }
      l += echoL * wet * .55; r += echoR * wet * .55
      val peak = max(abs(l), abs(r)); val smoothing = if (peak > envelope) attack else release
      envelope = smoothing * envelope + (1 - smoothing) * peak
      val gain = if (config.compressor && envelope > threshold) (threshold / envelope).pow(1 - 1 / config.ratio) else 1.0
      output.putShort((l * gain * 32767).coerceIn(-32768.0, 32767.0).toInt().toShort())
      if (channels == 2) output.putShort((r * gain * 32767).coerceIn(-32768.0, 32767.0).toInt().toShort())
    }
    output.flip()
  }
  private class Biquad {
    var b0 = 1.0; var b1 = 0.0; var b2 = 0.0; var a1 = 0.0; var a2 = 0.0
    var z1 = 0.0; var z2 = 0.0
    fun configure(hz: Double, db: Double, rate: Int) {
      val a = 10.0.pow(db / 40); val omega = 2 * Math.PI * hz / rate
      val alpha = sin(omega) / 1.414; val denominator = 1 + alpha / a
      b0 = (1 + alpha * a) / denominator; b1 = -2 * cos(omega) / denominator
      b2 = (1 - alpha * a) / denominator; a1 = b1; a2 = (1 - alpha / a) / denominator
    }
    fun process(x: Double): Double {
      val y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y
      return y
    }
  }
}
