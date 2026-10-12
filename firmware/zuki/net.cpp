#include "net.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include "certs.h"
#include "config.h"

namespace net {

static String base, key;

void begin(const String &server, const String &token) {
  base = server;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  key = token;
}
void setToken(const String &token) { key = token; }

static bool open(HTTPClient &http, NetworkClientSecure &client, const String &path, int battery) {
  client.setCACert(ROOT_CAS);
  client.setTimeout(30);
  http.setTimeout(45000);
  http.setReuse(false);
  if (!http.begin(client, base + path)) return false;
  if (key.length()) http.addHeader("Authorization", "Bearer " + key);
  if (battery >= 0) http.addHeader("X-Battery", String(battery));
  http.addHeader("X-Firmware", ZUKI_FW_VERSION);
  return true;
}

static Reply parse(int status, const String &body) {
  Reply r;
  r.status = status;
  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    r.error = status > 0 ? "Bad reply from the CRM (" + String(status) + ")" : "Can't reach the CRM — check Wi-Fi";
    return r;
  }
  if (status == 401) {
    r.error = "unpaired";
    return r;
  }
  r.ok = status == 200;
  r.heard = doc["heard"] | "";
  r.say = doc["say"] | "";
  r.mood = doc["mood"] | "idle";
  r.kind = doc["kind"] | "";
  r.error = doc["error"] | "";
  r.expectAnswer = doc["expectAnswer"] | false;
  r.canListen = doc["canListen"] | true;
  r.canSpeak = doc["canSpeak"] | true;
  r.user = doc["user"] | "";
  r.tzMinutes = doc["tzMinutes"] | 330;
  JsonArray lines = doc["lines"].as<JsonArray>();
  for (JsonVariant v : lines) {
    if (r.lineCount >= 4) break;
    r.lines[r.lineCount++] = v.as<String>();
  }
  return r;
}

String pair(const String &code, String &error, String &userName) {
  NetworkClientSecure client;
  HTTPClient http;
  String saved = key;
  key = "";
  if (!open(http, client, "/api/device/pair", -1)) {
    error = "Can't reach the CRM";
    key = saved;
    return "";
  }
  http.addHeader("Content-Type", "application/json");
  int st = http.POST("{\"code\":\"" + code + "\",\"firmware\":\"" ZUKI_FW_VERSION "\"}");
  String body = http.getString();
  http.end();
  JsonDocument doc;
  deserializeJson(doc, body);
  if (st != 200) {
    error = doc["error"] | "Pairing failed";
    key = saved;
    return "";
  }
  userName = doc["user"]["name"] | "";
  String token = doc["token"] | "";
  key = token;
  return token;
}

Reply hello(int battery) {
  NetworkClientSecure client;
  HTTPClient http;
  if (!open(http, client, "/api/device/hello", battery)) return parse(-1, "");
  int st = http.GET();
  String body = http.getString();
  http.end();
  return parse(st, body);
}

Reply turnAudio(const uint8_t *wav, size_t len, int battery) {
  NetworkClientSecure client;
  HTTPClient http;
  if (!open(http, client, "/api/device/turn", battery)) return parse(-1, "");
  http.addHeader("Content-Type", "audio/wav");
  int st = http.POST((uint8_t *)wav, len);
  String body = http.getString();
  http.end();
  return parse(st, body);
}

Reply turnText(const String &text, int battery) {
  NetworkClientSecure client;
  HTTPClient http;
  if (!open(http, client, "/api/device/turn", battery)) return parse(-1, "");
  http.addHeader("Content-Type", "application/json");
  JsonDocument doc;
  doc["text"] = text;
  String payload;
  serializeJson(doc, payload);
  int st = http.POST(payload);
  String body = http.getString();
  http.end();
  return parse(st, body);
}

size_t speak(const String &text, uint8_t **out) {
  *out = nullptr;
  NetworkClientSecure client;
  HTTPClient http;
  if (!open(http, client, "/api/device/speak", -1)) return 0;
  http.addHeader("Content-Type", "application/json");
  JsonDocument doc;
  doc["text"] = text;
  String payload;
  serializeJson(doc, payload);
  int st = http.POST(payload);
  if (st != 200) {
    http.end();
    return 0;
  }
  int total = http.getSize();
  size_t cap = total > 0 ? (size_t)total : 2 * 1024 * 1024;
  uint8_t *buf = (uint8_t *)ps_malloc(cap);
  if (!buf) {
    http.end();
    return 0;
  }
  NetworkClient *s = http.getStreamPtr();
  size_t got = 0;
  uint32_t last = millis();
  while (http.connected() && (total < 0 || got < (size_t)total) && got < cap && millis() - last < 8000) {
    size_t avail = s->available();
    if (avail) {
      got += s->readBytes(buf + got, min(avail, cap - got));
      last = millis();
    } else
      delay(2);
  }
  http.end();
  *out = buf;
  return got;
}

bool ping(int battery) {
  NetworkClientSecure client;
  HTTPClient http;
  if (!open(http, client, "/api/device/ping", battery)) return false;
  int st = http.GET();
  http.end();
  return st == 200;
}

}  // namespace net
