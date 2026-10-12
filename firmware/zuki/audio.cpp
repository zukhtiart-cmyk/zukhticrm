#include "audio.h"
#include <ESP_I2S.h>
#include <Wire.h>
#include "board.h"

namespace audio {

static I2SClass i2s;
static TaskHandle_t task = nullptr;

// ---------- Codec registers ----------
static void w8311(uint8_t reg, uint8_t v) {
  Wire.beginTransmission(ES8311_ADDR);
  Wire.write(reg);
  Wire.write(v);
  Wire.endTransmission();
}
static void w7210(uint8_t reg, uint8_t v) {
  Wire.beginTransmission(ES7210_ADDR);
  Wire.write(reg);
  Wire.write(v);
  Wire.endTransmission();
}

/** ES8311 as I2S slave, MCLK = 256 × 16 kHz from the ESP32, 16-bit I2S, DAC to the speaker amp. */
static void initES8311() {
  w8311(0x45, 0x00);
  w8311(0x01, 0x30);
  w8311(0x02, 0x10);
  w8311(0x02, 0x00);
  w8311(0x03, 0x10);
  w8311(0x16, 0x24);
  w8311(0x04, 0x10);
  w8311(0x05, 0x00);
  w8311(0x0B, 0x00);
  w8311(0x0C, 0x00);
  w8311(0x10, 0x1F);
  w8311(0x11, 0x7F);
  w8311(0x00, 0x80);  // power on, slave mode
  w8311(0x01, 0x3F);  // MCLK from pin, all clocks on
  // Clock coefficients for MCLK 4.096 MHz, 16 kHz: pre_div 1, mult 1, adc/dac div 1, fs_mode 0, osr 0x10, lrck 0x00FF, bclk div 4
  w8311(0x02, 0x00);
  w8311(0x05, 0x00);
  w8311(0x03, 0x10);
  w8311(0x04, 0x10);
  w8311(0x07, 0x00);
  w8311(0x08, 0xFF);
  w8311(0x06, 0x03);
  w8311(0x13, 0x10);
  w8311(0x1B, 0x0A);
  w8311(0x1C, 0x6A);
  w8311(0x09, 0x0C);  // DAC in: I2S, 16-bit
  w8311(0x0A, 0x0C);  // ADC out: I2S, 16-bit
  w8311(0x17, 0xBF);
  w8311(0x0E, 0x02);
  w8311(0x12, 0x00);
  w8311(0x14, 0x1A);
  w8311(0x0D, 0x01);
  w8311(0x15, 0x40);
  w8311(0x37, 0x08);
  w8311(0x45, 0x00);
  w8311(0x32, 0xB0);  // DAC volume
}

/** ES7210 as I2S slave, MIC1 + MIC2, 16 kHz, 16-bit I2S (not TDM). */
static void initES7210() {
  w7210(0x00, 0xFF);  // reset
  delay(5);
  w7210(0x00, 0x41);
  w7210(0x01, 0x3F);
  w7210(0x09, 0x30);
  w7210(0x0A, 0x30);
  w7210(0x23, 0x2A);  // high-pass filters
  w7210(0x22, 0x0A);
  w7210(0x20, 0x0A);
  w7210(0x21, 0x2A);
  w7210(0x08, 0x10);  // slave mode
  w7210(0x40, 0xC3);  // analog: vmid, bias
  w7210(0x41, 0x70);  // mic 1/2 bias 2.87 V
  w7210(0x42, 0x70);
  w7210(0x07, 0x20);  // OSR
  // MCLK 4.096 MHz @ 16 kHz: adc_div 1, doubler, dll → 0xC1; LRCK divider 0x0100
  w7210(0x02, 0xC1);
  w7210(0x04, 0x01);
  w7210(0x05, 0x00);
  w7210(0x11, 0x60);  // 16-bit, I2S
  w7210(0x12, 0x00);  // no TDM
  // Power and enable MIC1 + MIC2 with ~30 dB gain.
  w7210(0x06, 0x00);
  w7210(0x47, 0x08);
  w7210(0x48, 0x08);
  w7210(0x49, 0x08);
  w7210(0x4A, 0x08);
  w7210(0x40, 0x43);
  w7210(0x4B, 0x00);
  w7210(0x4C, 0xFF);
  w7210(0x43, 0x1A);
  w7210(0x44, 0x1A);
  w7210(0x45, 0x00);
  w7210(0x46, 0x00);
  w7210(0x01, 0x34);  // clocks on for ADC1/2
}

// ---------- State shared with the audio task ----------
enum Job : uint8_t { NONE, RECORD, PLAY };
static volatile Job job = NONE;
static volatile bool stopFlag = false;
static volatile float micLvl = 0, voiceLvl = 0;

static uint8_t *recBuf = nullptr;  // WAV header + PCM
static size_t recCap = 0, recLen = 0;
static volatile bool recDone = false, recSpeech = false;
static bool recAuto = true;
static uint32_t recMaxMs = 20000, recNoSpeechMs = 7000;

static int16_t *playBuf = nullptr;
static size_t playCap = 0, playSamples = 0;

static void writeWavHeader(uint8_t *h, uint32_t dataLen) {
  auto u32 = [&](int o, uint32_t v) { h[o] = v; h[o + 1] = v >> 8; h[o + 2] = v >> 16; h[o + 3] = v >> 24; };
  auto u16 = [&](int o, uint16_t v) { h[o] = v; h[o + 1] = v >> 8; };
  memcpy(h, "RIFF", 4);
  u32(4, 36 + dataLen);
  memcpy(h + 8, "WAVEfmt ", 8);
  u32(16, 16);
  u16(20, 1);
  u16(22, 1);
  u32(24, SAMPLE_RATE);
  u32(28, SAMPLE_RATE * 2);
  u16(32, 2);
  u16(34, 16);
  memcpy(h + 36, "data", 4);
  u32(40, dataLen);
}

static void doRecord() {
  const int FRAME = 320;  // 20 ms
  int16_t stereo[FRAME * 2];
  recLen = 44;
  float noise = 0;
  int frames = 0, silentFrames = 0;
  bool speech = false;
  uint32_t start = millis();
  while (!stopFlag) {
    size_t got = i2s.readBytes((char *)stereo, sizeof(stereo));
    if (got == 0) continue;
    int n = got / 4;
    double sum = 0;
    for (int i = 0; i < n; i++) {
      // Average both microphones and add a little gain.
      // Both microphones summed = their average with 2× gain.
      int v = (int)stereo[2 * i] + (int)stereo[2 * i + 1];
      if (v > 32767) v = 32767;
      if (v < -32768) v = -32768;
      sum += (double)v * v;
      if (recLen + 2 <= recCap) {
        recBuf[recLen] = v & 0xFF;
        recBuf[recLen + 1] = (v >> 8) & 0xFF;
        recLen += 2;
      }
    }
    float rms = sqrtf(sum / (n ? n : 1));
    micLvl = fminf(1.0f, rms / 3000.0f);
    frames++;
    if (frames <= 15) noise = noise + (rms - noise) / frames;  // first 300 ms: learn the room noise
    float thresh = fmaxf(noise * 2.8f, 450.0f);
    if (rms > thresh) {
      speech = true;
      silentFrames = 0;
    } else if (speech)
      silentFrames++;
    uint32_t el = millis() - start;
    if (recAuto && speech && silentFrames * 20 > 1100) break;      // finished talking
    if (recAuto && !speech && el > recNoSpeechMs) break;             // nobody spoke
    if (el > recMaxMs || recLen + FRAME * 2 > recCap) break;         // too long
  }
  writeWavHeader(recBuf, recLen - 44);
  micLvl = 0;
  recSpeech = speech;
  recDone = true;
}

static void doPlay() {
  digitalWrite(PA_EN, HIGH);
  const int CH = 256;
  int16_t out[CH * 2];
  size_t pos = 0;
  while (!stopFlag && pos < playSamples) {
    int n = min((size_t)CH, playSamples - pos);
    double sum = 0;
    for (int i = 0; i < n; i++) {
      int16_t v = playBuf[pos + i];
      out[2 * i] = v;
      out[2 * i + 1] = v;
      sum += (double)v * v;
    }
    i2s.write((uint8_t *)out, n * 4);
    float rms = sqrtf(sum / n);
    voiceLvl = voiceLvl * 0.6f + 0.4f * fminf(1.0f, rms / 6000.0f);
    pos += n;
  }
  // Flush a little silence so the last word isn't cut off.
  memset(out, 0, sizeof(out));
  for (int i = 0; i < 8; i++) i2s.write((uint8_t *)out, sizeof(out));
  voiceLvl = 0;
  digitalWrite(PA_EN, LOW);
}

static void audioTask(void *) {
  for (;;) {
    Job j = job;
    if (j == RECORD) doRecord();
    else if (j == PLAY) doPlay();
    if (j != NONE) {
      job = NONE;
      stopFlag = false;
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

bool begin() {
  pinMode(PA_EN, OUTPUT);
  digitalWrite(PA_EN, LOW);
  i2s.setPins(I2S_BCLK, I2S_WS, I2S_DOUT, I2S_DIN, I2S_MCLK);
  if (!i2s.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    Serial.println("[audio] I2S start failed");
    return false;
  }
  delay(20);  // MCLK running before the codecs are configured
  initES8311();
  initES7210();
  recCap = 44 + SAMPLE_RATE * 2 * 25;  // up to 25 s
  recBuf = (uint8_t *)ps_malloc(recCap);
  playCap = SAMPLE_RATE * 60;  // up to 60 s of speech
  playBuf = (int16_t *)ps_malloc(playCap * 2);
  if (!recBuf || !playBuf) {
    Serial.println("[audio] PSRAM allocation failed");
    return false;
  }
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, nullptr, 5, &task, 0);
  Serial.println("[audio] ready");
  return true;
}

void setVolume(int v) {
  v = constrain(v, 0, 100);
  w8311(0x32, (uint8_t)(v * 0xC8 / 100));
}

bool startRecording(bool autoStop, uint32_t maxMs, uint32_t noSpeechMs) {
  if (job != NONE) return false;
  recAuto = autoStop;
  recMaxMs = maxMs;
  recNoSpeechMs = noSpeechMs;
  recDone = false;
  recSpeech = false;
  stopFlag = false;
  job = RECORD;
  return true;
}
void stopRecording() {
  if (job == RECORD) stopFlag = true;
}
bool isRecording() { return job == RECORD; }
bool recordingDone(bool *heard) {
  if (!recDone) return false;
  if (heard) *heard = recSpeech;
  return true;
}
const uint8_t *wavData() { return recBuf; }
size_t wavSize() { return recLen; }
float micLevel() { return micLvl; }

bool play(const uint8_t *wav, size_t len) {
  if (job != NONE || len < 44 || memcmp(wav, "RIFF", 4) != 0) return false;
  // Find "fmt " and "data".
  uint32_t rate = SAMPLE_RATE;
  uint16_t channels = 1, bits = 16;
  size_t p = 12, dataOff = 0, dataLen = 0;
  while (p + 8 <= len) {
    uint32_t sz = wav[p + 4] | (wav[p + 5] << 8) | (wav[p + 6] << 16) | ((uint32_t)wav[p + 7] << 24);
    if (!memcmp(wav + p, "fmt ", 4)) {
      channels = wav[p + 10] | (wav[p + 11] << 8);
      rate = wav[p + 12] | (wav[p + 13] << 8) | (wav[p + 14] << 16) | ((uint32_t)wav[p + 15] << 24);
      bits = wav[p + 22] | (wav[p + 23] << 8);
    } else if (!memcmp(wav + p, "data", 4)) {
      dataOff = p + 8;
      dataLen = min((size_t)sz, len - dataOff);
      break;
    }
    p += 8 + sz + (sz & 1);
  }
  if (!dataOff || bits != 16) return false;
  const int16_t *src = (const int16_t *)(wav + dataOff);
  size_t inSamples = dataLen / 2 / channels;
  // Resample to 16 kHz (linear) and mix to mono.
  size_t outN = (size_t)((uint64_t)inSamples * SAMPLE_RATE / rate);
  if (outN > playCap) outN = playCap;
  for (size_t i = 0; i < outN; i++) {
    float sp = (float)i * rate / SAMPLE_RATE;
    size_t a = (size_t)sp;
    float f = sp - a;
    size_t b = a + 1 < inSamples ? a + 1 : a;
    float va = src[a * channels], vb = src[b * channels];
    playBuf[i] = (int16_t)(va + (vb - va) * f);
  }
  playSamples = outN;
  stopFlag = false;
  job = PLAY;
  return true;
}

void chime(bool happy) {
  if (job != NONE) return;
  const float notes[2] = {happy ? 880.0f : 660.0f, happy ? 1320.0f : 520.0f};
  size_t n = 0;
  for (int k = 0; k < 2; k++)
    for (int i = 0; i < SAMPLE_RATE / 8 && n < playCap; i++, n++) {
      float env = sinf(3.14159f * i / (SAMPLE_RATE / 8));
      playBuf[n] = (int16_t)(sinf(2 * 3.14159f * notes[k] * i / SAMPLE_RATE) * 6000 * env);
    }
  playSamples = n;
  stopFlag = false;
  job = PLAY;
}

void stopPlayback() {
  if (job == PLAY) stopFlag = true;
}
bool isPlaying() { return job == PLAY; }
float voiceLevel() { return voiceLvl; }

}  // namespace audio
