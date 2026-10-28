package expo.modules.audio

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import java.nio.ByteOrder
import kotlin.math.*
import java.util.concurrent.ConcurrentHashMap

/** Decodes locally prepared media off the UI thread; never requests microphone access. */
object HuecoWaveform {
  private val cancelled = ConcurrentHashMap<String, Boolean>()
  fun cancel(job: String) { cancelled[job] = true }
  fun analyze(context: Context, uri: String, job: String): Map<String, Any> {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      require(Uri.parse(uri).scheme in listOf("file", "content")) { "Baixe esta música para analisar a forma de onda." }
      extractor.setDataSource(context, Uri.parse(uri), null)
      val track = (0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true } ?: error("Arquivo sem áudio")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val durationUs = format.getLong(MediaFormat.KEY_DURATION).coerceAtLeast(1L)
      require(durationUs <= 1200_000_000L) { "Análise limitada a faixas de até 20 minutos" }
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, 2)
      decoder.configure(format, null, null, 0); decoder.start()
      val peaks = DoubleArray(384)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var inputDone = false
      val info = MediaCodec.BufferInfo()
      val deadline = SystemClock.elapsedRealtime() + 30000
      while (SystemClock.elapsedRealtime() < deadline) {
        check(cancelled[job] != true) { "Análise cancelada" }
        if (!inputDone) {
          val input = decoder.dequeueInputBuffer(1000)
          if (input >= 0) {
            val buffer = decoder.getInputBuffer(input)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) { decoder.queueInputBuffer(input, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true }
            else { decoder.queueInputBuffer(input, 0, size, extractor.sampleTime, 0); extractor.advance() }
          }
        }
        val output = decoder.dequeueOutputBuffer(info, 1000)
        if (output == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          channels = decoder.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT); rate = decoder.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        } else if (output >= 0) {
          val buffer = decoder.getOutputBuffer(output)!!.order(ByteOrder.LITTLE_ENDIAN)
          buffer.position(info.offset); buffer.limit(info.offset + info.size)
          var sample = 0
          while (buffer.remaining() >= 2) {
            val value = abs(buffer.short.toInt() / 32768.0)
            val time = info.presentationTimeUs + sample.toLong() * 1_000_000L / (rate * channels)
            val bin = (time * peaks.size / durationUs).toInt().coerceIn(0, peaks.size - 1)
            peaks[bin] = max(peaks[bin], value); sample++
          }
          decoder.releaseOutputBuffer(output, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return mapOf("peaks" to peaks.toList(), "duration" to durationUs / 1_000_000.0)
        }
      }
      error("A análise do áudio demorou demais")
    } finally {
      try { codec?.stop() } catch (_: Exception) { }
      codec?.release(); extractor.release(); cancelled.remove(job)
    }
  }
}
