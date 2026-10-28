package expo.modules.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*
import org.junit.Assert.*
import org.junit.Test

@UnstableApi
class HuecoDspTest {
  private fun render(config: Map<String, Any?>, frames: Int = 24000, signal: (Int, Int) -> Int): IntArray {
    HuecoDsp.update(config)
    val processor = HuecoAudioProcessor()
    processor.configure(AudioProcessor.AudioFormat(48000, 2, C.ENCODING_PCM_16BIT)); processor.flush()
    val input = ByteBuffer.allocateDirect(frames * 4).order(ByteOrder.LITTLE_ENDIAN)
    repeat(frames) { frame -> repeat(2) { ch -> input.putShort(signal(frame, ch).toShort()) } }; input.flip()
    processor.queueInput(input)
    val output = processor.output.order(ByteOrder.LITTLE_ENDIAN)
    return IntArray(output.remaining() / 2) { output.short.toInt() }
  }
  @Test fun flatPlaybackIsBitPerfect() {
    val output = render(emptyMap(), 128) { frame, ch -> frame * 101 - ch * 23 - 4000 }
    for (frame in 0 until 128) for (ch in 0..1) assertEquals(frame * 101 - ch * 23 - 4000, output[frame * 2 + ch])
  }
  @Test fun reverbProducesAnAudibleTail() {
    val output = render(mapOf("reverb" to 1.0)) { frame, _ -> if (frame == 0) 20000 else 0 }
    assertTrue(output.drop(2000).any { abs(it) > 20 })
  }
  @Test fun zeroWidthCentersTheStereoSignal() {
    val output = render(mapOf("enabled" to true, "width" to 0.0)) { frame, ch -> if (ch == 0) (8000 * sin(frame * .02)).toInt() else 0 }
    for (frame in 12000 until 24000) assertTrue(abs(output[frame * 2] - output[frame * 2 + 1]) <= 1)
  }
  @Test fun equalizerChangesTheSignalRatherThanJustSavingSliders() {
    val sine: (Int, Int) -> Int = { frame, _ -> (2000 * sin(2 * PI * 60 * frame / 48000)).toInt() }
    val plain = render(emptyMap(), signal = sine)
    val boosted = render(mapOf("enabled" to true, "eq" to listOf(6.0, 0.0, 0.0, 0.0, 0.0)), signal = sine)
    fun power(samples: IntArray) = samples.drop(12000).sumOf { it.toDouble() * it }
    assertTrue(power(boosted) > power(plain) * 2.8)
  }
  @Test fun compressorReducesSustainedPeaks() {
    val output = render(mapOf("enabled" to true, "compressor" to true, "threshold" to -20.0, "ratio" to 8.0)) { frame, _ -> (24000 * sin(frame * .05)).toInt() }
    assertTrue(output.drop(24000).maxOf { abs(it) } < 8000)
  }
  @Test fun validatesSpeedPitchAndUntrustedNumbers() {
    HuecoDsp.update(mapOf("enabled" to true, "eq" to listOf(Double.NaN), "width" to Double.POSITIVE_INFINITY, "speed" to .8, "linked" to true))
    assertEquals(.8f, HuecoDsp.speed, .0001f); assertEquals(.8f, HuecoDsp.pitch, .0001f)
    assertEquals(0.0, HuecoDsp.settings.eq[0], 0.0); assertEquals(1.0, HuecoDsp.settings.width, 0.0)
    HuecoDsp.update(mapOf("speed" to 1.0, "pitch" to 12.0, "linked" to false))
    assertEquals(2f, HuecoDsp.pitch, .0001f)
  }
}
