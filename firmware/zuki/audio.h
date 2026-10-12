// Microphones (ES7210) and speaker (ES8311) on one I2S bus, 16 kHz mono.
#pragma once
#include <Arduino.h>

namespace audio {

bool begin();
/** 0..100 */
void setVolume(int v);

/** Recording into PSRAM. Ends by itself after you stop talking (when `autoStop`), or when stop() is called. */
bool startRecording(bool autoStop, uint32_t maxMs = 20000, uint32_t noSpeechMs = 7000);
void stopRecording();
bool isRecording();
/** True once a recording has finished. `heardSpeech` says whether anyone actually spoke. */
bool recordingDone(bool *heardSpeech);
/** The finished recording as a complete WAV file (header + PCM). */
const uint8_t *wavData();
size_t wavSize();
/** Live microphone level 0..1 for the listening animation. */
float micLevel();

/** Plays a WAV file from memory (copies it). Resamples to 16 kHz if needed. */
bool play(const uint8_t *wav, size_t len);
/** A short two-note chime (no server needed). */
void chime(bool happy);
void stopPlayback();
bool isPlaying();
/** Live speaker level 0..1 — Zuki's mouth follows it. */
float voiceLevel();

}  // namespace audio
