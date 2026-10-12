// Talking to the CRM over HTTPS.
#pragma once
#include <Arduino.h>

namespace net {

struct Reply {
  bool ok = false;
  int status = 0;
  String heard, say, mood, kind, error;
  String lines[4];
  int lineCount = 0;
  bool expectAnswer = false;
  bool canListen = true, canSpeak = true;
  String user;
  int tzMinutes = 330;
};

void begin(const String &server, const String &token);
void setToken(const String &token);
/** Pair with the 6-digit code; returns the secret key or "" (and fills error). */
String pair(const String &code, String &error, String &userName);
Reply hello(int battery);
Reply turnAudio(const uint8_t *wav, size_t len, int battery);
Reply turnText(const String &text, int battery);
/** Zuki's voice as WAV into PSRAM (caller frees with free()). Returns length, 0 if no voice service. */
size_t speak(const String &text, uint8_t **out);
bool ping(int battery);

}  // namespace net
