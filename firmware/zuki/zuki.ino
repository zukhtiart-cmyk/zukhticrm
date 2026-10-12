// Zuki desk device — Waveshare ESP32-S3-Touch-AMOLED-2.16
// Talk to Zuki (the Zukhti Home CRM assistant) by tapping it or pressing the side button.
// Wi-Fi is set from the CRM's install page; the device is paired once with a 6-digit code from Team → Zuki desk devices.

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <U8g2lib.h>
#include <Preferences.h>
#include <WiFi.h>
#include <Wire.h>
#include <ImprovWiFiLibrary.h>
#include <TouchDrv.hpp>
#define XPOWERS_CHIP_AXP2101
#include <XPowersLib.h>
#include <time.h>

#include "board.h"
#include "config.h"
#include "painter.h"
#include "zuki_face.h"
#include "audio.h"
#include "net.h"

using zk::Mood;

// ---------- Hardware ----------
Arduino_DataBus *bus = new Arduino_ESP32QSPI(LCD_CS, LCD_SCLK, LCD_D0, LCD_D1, LCD_D2, LCD_D3);
Arduino_CO5300 *panel = new Arduino_CO5300(bus, LCD_RST, 0 /* rotation */, LCD_W, LCD_H, 0, 0, 0, 0);
Arduino_Canvas *gfx = new Arduino_Canvas(LCD_W, LCD_H, panel);
TouchDrvCST92xx touch;
XPowersPMU power;
bool havePower = false, haveTouch = false, haveAudio = false;
Preferences prefs;
ImprovWiFi improv(&Serial);

// ---------- Colours ----------
const uint16_t C_BG = zk::hex(0x1C1814), C_CREAM = zk::hex(0xF6EAD8), C_INK = zk::hex(0x1F1C18), C_BRASS = zk::hex(0xB0844F),
               C_MUTED = zk::hex(0x9C9184), C_OLIVE = zk::hex(0x8FAE7F), C_CLAY = zk::hex(0xC4664A);

// ---------- App state ----------
enum class App { SetupWifi, Connecting, Pairing, Ready, Listening, Thinking, Speaking, Reset };
App app = App::SetupWifi;
zk::Animator animator;
Mood mood = Mood::Idle;
String bubble = "";            // what Zuki says, on screen
String heardText = "";         // what it heard you say
String cardLines[4];
int cardCount = 0;
String hint = "";
String userName = "";
String serverUrl, wifiSsid, wifiPass, token;
String pairCode = "", pairError = "";
bool canListen = true, canSpeak = true, expectAnswer = false;
uint32_t lastActivity = 0, moodUntil = 0, speakUntil = 0, lastPing = 0;
Mood afterMood = Mood::Idle;
bool sleeping = false;
int tzMinutes = 330;

// ---------- Network worker (so Zuki keeps animating while the CRM thinks) ----------
enum class Job : uint8_t { None, Hello, Turn, Ping };
struct NetResult {
  volatile bool ready = false;
  net::Reply reply;
  uint8_t *wav = nullptr;
  size_t wavLen = 0;
} result;
volatile Job job = Job::None;
uint8_t *jobAudio = nullptr;
size_t jobAudioLen = 0;

int batteryPercent() {
  if (!havePower || !power.isBatteryConnect()) return -1;
  return power.getBatteryPercent();
}

void netTask(void *) {
  for (;;) {
    Job j = job;
    if (j == Job::None) {
      vTaskDelay(pdMS_TO_TICKS(20));
      continue;
    }
    int batt = batteryPercent();
    if (j == Job::Ping) {
      net::ping(batt);
      job = Job::None;
      continue;
    }
    net::Reply r = j == Job::Hello ? net::hello(batt) : net::turnAudio(jobAudio, jobAudioLen, batt);
    uint8_t *wav = nullptr;
    size_t len = 0;
    if (r.ok && r.say.length() && (j == Job::Turn || r.canSpeak)) len = net::speak(r.say, &wav);
    result.reply = r;
    result.wav = wav;
    result.wavLen = len;
    result.ready = true;
    job = Job::None;
  }
}

// ---------- Text helpers ----------
/** Our fonts are Latin only: swap the few special characters Zuki uses, drop the rest. */
String clean(const String &in) {
  String s = in;
  s.replace("\xE2\x82\xB9", "Rs ");  // ₹
  s.replace("\xE2\x86\x92", "->");   // →
  s.replace("\xE2\x80\x94", "-");    // —
  s.replace("\xE2\x80\x93", "-");    // –
  s.replace("\xE2\x80\x98", "'");
  s.replace("\xE2\x80\x99", "'");
  s.replace("\xE2\x80\x9C", "\"");
  s.replace("\xE2\x80\x9D", "\"");
  s.replace("\xE2\x80\xA6", "...");
  s.replace("\xE2\x80\xA2", "-");
  s.replace("\xE2\x9C\x93", "");  // ✓
  s.replace("\xE2\x9C\x97", "x");  // ✗
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    uint8_t c = s[i];
    if (c == '\n') out += ' ';
    else if (c >= 32 && c < 127) out += (char)c;
  }
  out.trim();
  return out;
}

/** Word-wraps text into the box; returns the height used. Adds "..." if it doesn't fit. */
int drawWrapped(const String &text, int x, int y, int w, int maxLines, int lineH, uint16_t color) {
  gfx->setTextColor(color);
  String words = clean(text);
  int lines = 0;
  String line = "";
  int i = 0;
  while (i <= (int)words.length() && lines < maxLines) {
    int sp = words.indexOf(' ', i);
    if (sp < 0) sp = words.length();
    String word = words.substring(i, sp);
    String trial = line.length() ? line + " " + word : word;
    int16_t bx, by;
    uint16_t bw, bh;
    gfx->getTextBounds(trial, 0, 0, &bx, &by, &bw, &bh);
    if (bw > w && line.length()) {
      bool last = lines == maxLines - 1;
      gfx->setCursor(x, y + lines * lineH);
      gfx->print(last ? line + "..." : line);
      lines++;
      line = word;
    } else
      line = trial;
    i = sp + 1;
    if (sp >= (int)words.length()) break;
  }
  if (lines < maxLines && line.length()) {
    gfx->setCursor(x, y + lines * lineH);
    gfx->print(line);
    lines++;
  }
  return lines * lineH;
}

void centerText(const String &t, int y, uint16_t color) {
  int16_t bx, by;
  uint16_t bw, bh;
  String c = clean(t);
  gfx->getTextBounds(c, 0, 0, &bx, &by, &bw, &bh);
  gfx->setTextColor(color);
  gfx->setCursor((LCD_W - bw) / 2, y);
  gfx->print(c);
}

// ---------- Screens ----------
void drawStatusBar() {
  gfx->setFont(u8g2_font_helvR12_tf);
  struct tm t;
  if (getLocalTime(&t, 0)) {
    char buf[8];
    strftime(buf, sizeof buf, "%H:%M", &t);
    gfx->setTextColor(C_MUTED);
    gfx->setCursor(150, 34);
    gfx->print(buf);
  }
  // Wi-Fi dot and battery.
  gfx->fillCircle(300, 29, 5, WiFi.status() == WL_CONNECTED ? C_OLIVE : C_CLAY);
  int b = batteryPercent();
  if (b >= 0) {
    gfx->drawRoundRect(312, 22, 28, 14, 3, C_MUTED);
    gfx->fillRect(340, 26, 3, 6, C_MUTED);
    gfx->fillRect(315, 25, 22 * b / 100, 8, b < 20 ? C_CLAY : C_MUTED);
  }
}

void drawBubble() {
  if (!bubble.length()) return;
  zk::Painter p(gfx->getFramebuffer(), LCD_W, LCD_H);
  p.fillRoundRect(28, 300, 424, 128, 22, C_CREAM);
  p.fillTriangle(225, 302, 255, 302, 240, 286, C_CREAM);
  gfx->setFont(u8g2_font_helvR18_tf);
  drawWrapped(bubble, 46, 334, 388, 4, 26, C_INK);
}

void drawHint() {
  gfx->setFont(u8g2_font_helvR14_tf);
  centerText(hint, 458, C_MUTED);
}

void drawKeypad() {
  zk::Painter p(gfx->getFramebuffer(), LCD_W, LCD_H);
  gfx->setFont(u8g2_font_helvB18_tf);
  centerText("Pair with the CRM", 70, C_CREAM);
  gfx->setFont(u8g2_font_helvR14_tf);
  centerText("Team page > Zuki desk devices > code", 98, C_MUTED);
  // Six code boxes.
  for (int i = 0; i < 6; i++) {
    int x = 75 + i * 57;
    p.fillRoundRect(x, 116, 46, 54, 10, i < (int)pairCode.length() ? C_BRASS : zk::hex(0x2E2822));
    if (i < (int)pairCode.length()) {
      gfx->setFont(u8g2_font_helvB24_tf);
      gfx->setTextColor(C_INK);
      gfx->setCursor(x + 14, 153);
      gfx->print(pairCode[i]);
    }
  }
  if (pairError.length()) {
    gfx->setFont(u8g2_font_helvR12_tf);
    gfx->setTextColor(C_CLAY);
    drawWrapped(pairError, 40, 192, 400, 2, 18, C_CLAY);
  }
  const char *keys = "123456789<0>";
  for (int k = 0; k < 12; k++) {
    int col = k % 3, row = k / 3;
    int x = 60 + col * 124, y = 228 + row * 62;
    bool ok = keys[k] == '>';
    p.fillRoundRect(x, y, 112, 52, 14, ok ? C_BRASS : zk::hex(0x2E2822));
    gfx->setFont(u8g2_font_helvB18_tf);
    String label = keys[k] == '<' ? "Del" : keys[k] == '>' ? "OK" : String(keys[k]);
    int16_t bx, by;
    uint16_t bw, bh;
    gfx->getTextBounds(label, 0, 0, &bx, &by, &bw, &bh);
    gfx->setTextColor(ok ? C_INK : C_CREAM);
    gfx->setCursor(x + (112 - bw) / 2, y + 34);
    gfx->print(label);
  }
}

void render(float dt) {
  zk::Painter p(gfx->getFramebuffer(), LCD_W, LCD_H);
  p.clear(C_BG);
  float voice = audio::voiceLevel();
  if (app == App::Speaking && !audio::isPlaying()) voice = 0.45f;  // text-only replies still "talk"
  zk::Pose pose = animator.update(mood, dt, voice);
  if (app == App::Listening) pose.ringPhase = fmodf(pose.ringPhase + audio::micLevel() * 0.3f, 1.0f);

  if (app == App::Pairing) {
    drawKeypad();
  } else {
    float cy = bubble.length() ? 178 : 220;
    float sc = bubble.length() ? 1.12f : 1.45f;
    zk::drawZuki(p, pose, 240, cy, sc, C_BG);
    drawBubble();
    drawStatusBar();
    if (heardText.length() && (app == App::Thinking)) {
      gfx->setFont(u8g2_font_helvR14_tf);
      drawWrapped("You: " + heardText, 40, 300 - 6, 400, 1, 20, C_BRASS);
    }
    drawHint();
  }
  gfx->flush();
}

// ---------- Behaviour ----------
void setMood(Mood m, uint32_t forMs = 0, Mood then = Mood::Idle) {
  mood = m;
  moodUntil = forMs ? millis() + forMs : 0;
  afterMood = then;
}

void wake() {
  lastActivity = millis();
  if (sleeping) {
    sleeping = false;
    panel->setBrightness(255);
    if (mood == Mood::Sleeping) setMood(Mood::Idle);
  }
}

void startListening(bool fromAnswer) {
  if (!haveAudio) {
    bubble = "My microphone isn't working - check the board and restart me.";
    setMood(Mood::Concerned, 3000);
    return;
  }
  if (!canListen) {
    bubble = "I can't hear voices yet - ask the owner to add the voice key in the CRM.";
    setMood(Mood::Concerned, 4000);
    return;
  }
  audio::stopPlayback();
  heardText = "";
  if (!fromAnswer) bubble = "";
  cardCount = 0;
  audio::startRecording(true, 20000, fromAnswer ? 6000 : 8000);
  app = App::Listening;
  setMood(Mood::Listening);
  hint = "Listening... tap when done";
  wake();
}

void sendRecording() {
  jobAudio = (uint8_t *)audio::wavData();
  jobAudioLen = audio::wavSize();
  app = App::Thinking;
  setMood(Mood::Thinking);
  hint = "Thinking...";
  job = Job::Turn;
}

void handleReply() {
  net::Reply &r = result.reply;
  if (r.error == "unpaired") {
    token = "";
    prefs.putString("token", "");
    pairCode = "";
    pairError = "This device was unpaired. Enter a new code.";
    app = App::Pairing;
    result.ready = false;
    return;
  }
  if (!r.ok && !r.say.length()) {
    bubble = r.error.length() ? r.error : "Can't reach the CRM right now - check Wi-Fi and try again.";
    setMood(Mood::Concerned, 4000);
    app = App::Ready;
    hint = "Tap Zuki to try again";
    if (result.wav) free(result.wav);
    result.ready = false;
    return;
  }
  if (r.user.length()) userName = r.user;
  if (r.tzMinutes != tzMinutes) {
    tzMinutes = r.tzMinutes;
    configTime(tzMinutes * 60, 0, "pool.ntp.org", "time.google.com");
  }
  canListen = r.canListen;
  canSpeak = r.canSpeak;
  heardText = r.heard;
  bubble = r.say;
  cardCount = r.lineCount;
  for (int i = 0; i < r.lineCount; i++) cardLines[i] = r.lines[i];
  expectAnswer = r.expectAnswer || bubble.endsWith("?");
  afterMood = r.mood == "happy" ? Mood::Happy : r.mood == "concerned" ? Mood::Concerned : Mood::Idle;
  bool played = false;
  if (result.wav && result.wavLen) {
    played = audio::play(result.wav, result.wavLen);
    free(result.wav);
  } else if (afterMood == Mood::Happy)
    audio::chime(true);
  result.wav = nullptr;
  result.ready = false;
  app = App::Speaking;
  mood = afterMood == Mood::Idle ? Mood::Speaking : afterMood == Mood::Happy ? Mood::Happy : Mood::Speaking;
  if (afterMood == Mood::Happy) setMood(Mood::Happy, 2600);
  // Without a voice, give people time to read.
  speakUntil = played ? 0 : millis() + 1200 + clean(bubble).length() * 45;
  hint = "Tap Zuki to interrupt";
  wake();
}

void finishSpeaking() {
  app = App::Ready;
  if (mood == Mood::Speaking) setMood(afterMood, afterMood == Mood::Idle ? 0 : 2600);
  hint = "Tap Zuki to talk";
  // Conversation: if Zuki asked something, listen for the answer straight away.
  if (expectAnswer && canListen) startListening(true);
}

// ---------- Touch & button ----------
bool touchDown = false;
int16_t tx = 0, ty = 0;
uint32_t btnDownAt = 0;
bool btnWas = false;

void onTap(int x, int y) {
  wake();
  if (app == App::Pairing) {
    if (y < 228) return;
    int col = (x - 60) / 124, row = (y - 228) / 62;
    if (col < 0 || col > 2 || row < 0 || row > 3) return;
    char k = "123456789<0>"[row * 3 + col];
    pairError = "";
    if (k == '<') {
      if (pairCode.length()) pairCode.remove(pairCode.length() - 1);
    } else if (k == '>') {
      if (pairCode.length() == 6) {
        String err, name;
        hint = "Pairing...";
        render(0.02f);
        String t = net::pair(pairCode, err, name);
        if (t.length()) {
          token = t;
          prefs.putString("token", token);
          userName = name;
          app = App::Ready;
          bubble = "Paired! Hi " + name + ".";
          setMood(Mood::Happy, 2500);
          audio::chime(true);
          job = Job::Hello;
          app = App::Thinking;
        } else {
          pairError = err;
          pairCode = "";
        }
      }
    } else if (pairCode.length() < 6)
      pairCode += k;
    return;
  }
  // Point Zuki's eyes at the touch.
  animator.lookAt((x - 240) / 240.0f, (y - 200) / 240.0f);
  if (y < 300 || app == App::Listening) {
    animator.poke();
    if (app == App::Listening) audio::stopRecording();
    else if (app == App::Speaking) {
      audio::stopPlayback();
      expectAnswer = false;
      finishSpeaking();
      startListening(false);
    } else if (app == App::Ready)
      startListening(false);
  }
}

void readInputs() {
  if (haveTouch) {
    TouchPoints pts = touch.getTouchPoints();
    if (pts.hasPoints()) {
      const TouchPoint &pt = pts.getPoint(0);
      tx = pt.x;
      ty = pt.y;
      touchDown = true;
    } else if (touchDown) {
      touchDown = false;
      onTap(tx, ty);
    }
  }
  bool btn = digitalRead(BTN_USER) == LOW;
  if (btn && !btnWas) btnDownAt = millis();
  if (btn && millis() - btnDownAt > 8000 && app != App::Reset) {
    app = App::Reset;
    bubble = "Resetting - forgetting Wi-Fi and pairing...";
  }
  if (!btn && btnWas && millis() - btnDownAt < 1500) onTap(240, 200);  // short press = tap Zuki
  btnWas = btn;
}

// ---------- Wi-Fi (set from the install page using Improv) ----------
bool connectWifi(const char *ssid, const char *pass) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) delay(200);
  return WiFi.status() == WL_CONNECTED;
}

void onImprovConnected(const char *ssid, const char *pass) {
  wifiSsid = ssid;
  wifiPass = pass;
  prefs.putString("ssid", wifiSsid);
  prefs.putString("pass", wifiPass);
}

void afterWifi() {
  configTime(tzMinutes * 60, 0, "pool.ntp.org", "time.google.com");
  net::begin(serverUrl, token);
  if (!token.length()) {
    app = App::Pairing;
    pairCode = "";
    return;
  }
  app = App::Thinking;
  setMood(Mood::Thinking);
  hint = "Waking up...";
  job = Job::Hello;
}

// ---------- Setup & loop ----------
void setup() {
  Serial.begin(115200);
  pinMode(BTN_USER, INPUT_PULLUP);
  Wire.begin(I2C_SDA, I2C_SCL, 400000);

  havePower = power.begin(Wire, AXP2101_SLAVE_ADDRESS, I2C_SDA, I2C_SCL);
  if (havePower) {
    power.enableBattDetection();
    power.enableBattVoltageMeasure();
    power.setChargerConstantCurr(XPOWERS_AXP2101_CHG_CUR_500MA);
  }

  if (!gfx->begin()) Serial.println("[display] start failed");
  panel->setBrightness(255);
  gfx->fillScreen(C_BG);
  gfx->flush();

  touch.setPins(TP_RST, TP_INT);
  haveTouch = touch.begin(Wire, TP_ADDR, I2C_SDA, I2C_SCL);
  if (!haveTouch) Serial.println("[touch] not found");
  haveAudio = audio::begin();
  audio::setVolume(80);

  prefs.begin("zuki", false);
  serverUrl = prefs.getString("server", ZUKI_DEFAULT_SERVER);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  token = prefs.getString("token", "");

  improv.setDeviceInfo(ImprovTypes::ChipFamily::CF_ESP32_S3, "Zuki", ZUKI_FW_VERSION, "Zuki desk", serverUrl.c_str());
  improv.onImprovConnected(onImprovConnected);
  improv.setCustomConnectWiFi(connectWifi);

  xTaskCreatePinnedToCore(netTask, "net", 16384, nullptr, 3, nullptr, 0);

  lastActivity = millis();
  if (wifiSsid.length()) {
    app = App::Connecting;
    bubble = "Connecting to Wi-Fi...";
    setMood(Mood::Thinking);
    render(0.02f);
    if (connectWifi(wifiSsid.c_str(), wifiPass.c_str())) {
      bubble = "";
      afterWifi();
    } else {
      app = App::SetupWifi;
      bubble = "I can't join \"" + wifiSsid + "\". Check the Wi-Fi, or set it again from the CRM install page.";
      setMood(Mood::Concerned);
    }
  } else {
    app = App::SetupWifi;
    bubble = "Hi! Set me up: open the CRM on a computer, Team > Zuki desk devices > Install, and plug me in.";
    setMood(Mood::Idle);
  }
  hint = "";
}

uint32_t lastFrame = 0;

void loop() {
  improv.handleSerial();
  readInputs();
  uint32_t now = millis();

  if (app == App::Reset) {
    render(0.02f);
    prefs.clear();
    delay(1500);
    ESP.restart();
  }
  // Wi-Fi arrived from the install page.
  if (app == App::SetupWifi && WiFi.status() == WL_CONNECTED && wifiSsid.length()) {
    bubble = "";
    afterWifi();
  }
  // A reply from the CRM.
  if (result.ready) handleReply();
  // Recording finished.
  bool heard;
  if (app == App::Listening && audio::recordingDone(&heard)) {
    if (heard) sendRecording();
    else {
      app = App::Ready;
      setMood(Mood::Idle);
      hint = "Tap Zuki to talk";
    }
  }
  // Speech finished.
  if (app == App::Speaking && !audio::isPlaying() && (!speakUntil || now > speakUntil)) finishSpeaking();
  // Timed moods (happy, concerned) settle back.
  if (moodUntil && now > moodUntil) {
    moodUntil = 0;
    if (app != App::Listening && app != App::Thinking && app != App::Speaking) mood = Mood::Idle;
  }
  // Doze after 3 quiet minutes; check in with the CRM every 5.
  if (app == App::Ready && !sleeping && now - lastActivity > 180000) {
    sleeping = true;
    setMood(Mood::Sleeping);
    panel->setBrightness(50);
    bubble = "";
    hint = "Tap to wake me";
  }
  if (app == App::Ready && job == Job::None && now - lastPing > 300000 && WiFi.status() == WL_CONNECTED && token.length()) {
    lastPing = now;
    job = Job::Ping;
  }

  if (now - lastFrame >= 40) {  // ~25 fps
    render((now - lastFrame) / 1000.0f);
    lastFrame = now;
  }
  delay(2);
}
