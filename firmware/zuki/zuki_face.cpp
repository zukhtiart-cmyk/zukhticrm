#include "zuki_face.h"
#include <math.h>

namespace zk {

static const float PI_F = 3.14159265f;
static inline float lerp(float a, float b, float k) { return a + (b - a) * k; }
static inline float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

Pose Animator::update(Mood mood, float dt, float voice) {
  if (dt > 0.1f) dt = 0.1f;
  t_ += dt;
  if (mood == Mood::Happy && last_ != Mood::Happy) happyT_ = 1.2f;
  last_ = mood;
  happyT_ = happyT_ > 0 ? happyT_ - dt : 0;

  Pose p;
  p.mood = mood;

  // Where to look: a held target, or wandering around now and then.
  if (hold_ > 0) hold_ -= dt;
  else {
    wander_ -= dt;
    if (wander_ <= 0) {
      tx_ = (rnd() - 0.5f) * 1.2f;
      ty_ = (rnd() - 0.5f) * 0.5f;
      wander_ = 2.0f + rnd() * 3.0f;
    }
  }
  float gx = tx_, gy = ty_;
  if (mood == Mood::Thinking) { gx = 0.5f; gy = -0.9f; }
  if (mood == Mood::Listening) { gx *= 0.3f; gy = 0; }
  if (mood == Mood::Sleeping) { gx = 0; gy = 0.4f; }
  float k = 1 - powf(0.004f, dt);
  lx_ = lerp(lx_, gx, k);
  ly_ = lerp(ly_, gy, k);
  p.lookX = lx_;
  p.lookY = ly_;

  // Blink every few seconds.
  nextBlink_ -= dt;
  if (nextBlink_ <= 0) { blinkLeft_ = 0.14f; nextBlink_ = 2.2f + rnd() * 3.0f; }
  if (blinkLeft_ > 0) { blinkLeft_ -= dt; p.blink = 0.1f; }
  if (mood == Mood::Sleeping) p.blink = 0.08f;

  // Tap bounce spring.
  squashV_ += (-140 * squash_ - 9 * squashV_) * dt;
  squash_ += squashV_ * dt;
  p.squash = squash_;

  // Body motion per mood.
  float speed = mood == Mood::Speaking ? 6 : mood == Mood::Thinking ? 4 : mood == Mood::Sleeping ? 0.8f : 2;
  p.bob = sinf(t_ * speed) * (mood == Mood::Speaking ? 2.5f : 4.0f);
  if (happyT_ > 0) p.bob -= fabsf(sinf((1.2f - happyT_) * PI_F * 2.5f)) * 22 * (happyT_ / 1.2f);
  p.tilt = mood == Mood::Listening ? sinf(t_ * 2.2f) * 0.05f : mood == Mood::Concerned ? -0.06f + sinf(t_ * 1.5f) * 0.015f : 0;

  // Mouth follows the voice; a little syllable wobble keeps it alive.
  if (mood == Mood::Speaking) p.mouth = clamp01(0.15f + voice * 0.9f + 0.12f * sinf(t_ * 17) * sinf(t_ * 5.3f));

  // Arms.
  float tl = 0.15f + sinf(t_ * 1.6f) * 0.05f, tr = 0.15f;
  if (mood == Mood::Speaking) tr = 0.35f + sinf(t_ * 7) * 0.3f;
  if (mood == Mood::Listening) tr = 1.9f;
  if (mood == Mood::Concerned) { tl = -0.25f; tr = -0.25f; }
  if (mood == Mood::Happy) { tl = 2.2f + sinf(t_ * 12) * 0.25f; tr = 2.2f + sinf(t_ * 12 + 1) * 0.25f; }
  armL_ = lerp(armL_, tl, 1 - powf(0.001f, dt));
  armR_ = lerp(armR_, tr, 1 - powf(0.001f, dt));
  p.armL = armL_;
  p.armR = armR_;

  p.ringPhase = fmodf(t_ * 0.8f, 1.0f);
  p.dots = t_;
  p.lampGlow = mood == Mood::Listening || mood == Mood::Thinking ? 0.6f + 0.4f * sinf(t_ * 6) : mood == Mood::Happy ? 1.0f : 0.5f;
  return p;
}

// Brand colours.
static const uint32_t BRASS = 0xB0844F, BRASS_DARK = 0x8A6436, CREAM = 0xF6EAD8, INK = 0x1F1C18, ROOF = 0x0F0D0B,
                      CHEEK = 0xE9A58F, CLAY = 0xC4664A, OLIVE = 0x8FAE7F, GOLD = 0xF0C868, MOUTH = 0x5A2620;

void drawZuki(Painter &p, const Pose &pose, float cx, float cy, float s, uint16_t bg) {
  (void)bg;
  // Squash and stretch around the feet.
  float sx = s * (1 + pose.squash * 0.12f), sy = s * (1 - pose.squash * 0.12f);
  float ox = cx, oy = cy + pose.bob;
  float ct = cosf(pose.tilt), st = sinf(pose.tilt);
  // Design units (0..200 box, centre 100,118) → screen, with lean.
  auto X = [&](float x, float y) { float dx = (x - 100) * sx, dy = (y - 118) * sy; return ox + dx * ct - dy * st; };
  auto Y = [&](float x, float y) { float dx = (x - 100) * sx, dy = (y - 118) * sy; return oy + dx * st + dy * ct; };
  float S = (sx + sy) / 2;

  // Floor shadow (doesn't bob).
  float shadowK = 1 - pose.bob * 0.01f;
  p.fillEllipse(cx, cy + 82 * s, 46 * s * shadowK, 7 * s, hex(0x000000), 90);

  // Listening rings.
  if (pose.mood == Mood::Listening) {
    for (int i = 0; i < 3; i++) {
      float ph = fmodf(pose.ringPhase + i / 3.0f, 1.0f);
      p.thickArc(ox, oy, (70 + ph * 40) * s, 3 * s, 0, 2 * PI_F, hex(OLIVE), (uint8_t)(170 * (1 - ph)));
    }
  }

  // Arms (behind the body): from the shoulders, swinging up with the angle.
  auto arm = [&](float side, float ang) {
    float sx0 = 100 + side * 50, sy0 = 128;
    float len = 30;
    float ex = sx0 + side * cosf(-ang + PI_F * 0.35f) * len;
    float ey = sy0 + sinf(-ang + PI_F * 0.35f) * len * 1.0f;
    // ang 0 → hanging down-out; ang ~2 → raised.
    ex = sx0 + side * (sinf(ang * 0.9f + 0.6f) * len);
    ey = sy0 + cosf(ang * 0.9f + 0.6f) * len;
    p.thickLine(X(sx0, sy0), Y(sx0, sy0), X(ex, ey), Y(ex, ey), 9 * S, hex(BRASS));
  };
  arm(-1, pose.armL);
  arm(1, pose.armR);

  // Feet.
  p.fillRoundRect(X(70, 166) - 13 * S, Y(70, 166), 26 * S, 12 * S, 5 * S, hex(INK));
  p.fillRoundRect(X(130, 166) - 13 * S, Y(130, 166), 26 * S, 12 * S, 5 * S, hex(INK));

  // Body (house) and face plate — drawn as rounded rects (lean is small, so they stay upright).
  p.fillRoundRect(X(48, 66) - 1, Y(48, 66), 104 * S, 104 * S, 30 * S, hex(BRASS));
  p.fillRoundRect(X(48, 66) + 2 * S, Y(48, 66) + 70 * S, 100 * S, 32 * S, 26 * S, hex(BRASS_DARK), 60);  // a little shade at the bottom
  p.fillRoundRect(X(58, 76), Y(58, 76), 84 * S, 84 * S, 24 * S, hex(CREAM));

  // Roof with a brass rim so it reads on a dark screen.
  float rx[3] = {X(40, 80), X(100, 30), X(160, 80)}, ry[3] = {Y(40, 80), Y(100, 30), Y(160, 80)};
  p.fillPolygon(rx, ry, 3, hex(BRASS_DARK));
  float rx2[3] = {X(47, 76), X(100, 36), X(153, 76)}, ry2[3] = {Y(47, 76), Y(100, 36), Y(153, 76)};
  p.fillPolygon(rx2, ry2, 3, hex(ROOF));

  // Antenna and lamp (glows with the mood).
  p.thickLine(X(100, 36), Y(100, 36), X(100, 20), Y(100, 20), 4 * S, hex(BRASS_DARK));
  uint32_t lampC = pose.mood == Mood::Listening || pose.mood == Mood::Concerned ? CLAY : pose.mood == Mood::Thinking ? OLIVE : GOLD;
  p.fillCircle(X(100, 15), Y(100, 15), 15 * S, hex(lampC), (uint8_t)(60 * pose.lampGlow));
  p.fillCircle(X(100, 15), Y(100, 15), 8 * S, hex(lampC));

  // Cheeks.
  p.fillCircle(X(70, 132), Y(70, 132), 7 * S, hex(CHEEK), pose.mood == Mood::Happy ? 230 : 170);
  p.fillCircle(X(130, 132), Y(130, 132), 7 * S, hex(CHEEK), pose.mood == Mood::Happy ? 230 : 170);

  // Eyes.
  float ex = pose.lookX * 5, ey = pose.lookY * 4;
  if (pose.mood == Mood::Happy) {
    p.thickArc(X(82, 116), Y(82, 116), 7 * S, 4.5f * S, PI_F * 1.1f, PI_F * 1.9f, hex(INK));
    p.thickArc(X(118, 116), Y(118, 116), 7 * S, 4.5f * S, PI_F * 1.1f, PI_F * 1.9f, hex(INK));
  } else {
    float wide = pose.mood == Mood::Listening ? 1.15f : pose.mood == Mood::Concerned ? 0.92f : 1.0f;
    float ry = 9 * S * wide * pose.blink;
    for (int side = -1; side <= 1; side += 2) {
      float x = 100 + side * 18 + ex, y = 112 + ey;
      p.fillEllipse(X(x, y), Y(x, y), 7.5f * S * wide, ry < 1.5f ? 1.5f : ry, hex(INK));
      if (pose.blink > 0.5f) p.fillCircle(X(x + 2.5f, y - 3.5f), Y(x + 2.5f, y - 3.5f), 2.4f * S, hex(0xFFFFFF));
    }
  }

  // Worried brows.
  if (pose.mood == Mood::Concerned) {
    p.thickLine(X(74, 96), Y(74, 96), X(89, 92), Y(89, 92), 3.5f * S, hex(INK));
    p.thickLine(X(126, 96), Y(126, 96), X(111, 92), Y(111, 92), 3.5f * S, hex(INK));
  }

  // Mouth.
  if (pose.mood == Mood::Speaking) {
    float open = pose.mouth;
    p.fillEllipse(X(100, 139), Y(100, 139), (8 + open * 3) * S, (2 + open * 8) * S, hex(MOUTH));
  } else if (pose.mood == Mood::Listening) {
    p.fillEllipse(X(100, 139), Y(100, 139), 5 * S, 4 * S, hex(MOUTH));
  } else if (pose.mood == Mood::Concerned) {
    p.thickQuad(X(90, 143), Y(90, 143), X(100, 134), Y(100, 134), X(110, 143), Y(110, 143), 4 * S, hex(INK));
  } else if (pose.mood == Mood::Sleeping) {
    p.thickLine(X(93, 138), Y(93, 138), X(107, 138), Y(107, 138), 3.5f * S, hex(INK));
  } else {
    float big = pose.mood == Mood::Happy ? 1.35f : 1.0f;
    p.thickQuad(X(100 - 12 * big, 135), Y(100 - 12 * big, 135), X(100, 135 + 11 * big), Y(100, 135 + 11 * big), X(100 + 12 * big, 135),
                Y(100 + 12 * big, 135), 4 * S, hex(INK));
  }

  // Thinking dots circling the lamp.
  if (pose.mood == Mood::Thinking) {
    for (int i = 0; i < 3; i++) {
      float a = pose.dots * 3 + i * 2.094f;
      float dx = cosf(a) * 26, dy = sinf(a) * 7;
      p.fillCircle(X(100 + dx, 4 + dy), Y(100 + dx, 4 + dy), 4.5f * S, hex(OLIVE), sinf(a) > 0 ? 255 : 150);
    }
  }
  // Sleeping: little z's as dots drifting up.
  if (pose.mood == Mood::Sleeping) {
    for (int i = 0; i < 3; i++) {
      float ph = fmodf(pose.dots * 0.3f + i / 3.0f, 1.0f);
      p.fillCircle(X(150 + ph * 20, 60 - ph * 40), Y(150 + ph * 20, 60 - ph * 40), (2 + ph * 3) * S, hex(CREAM), (uint8_t)(200 * (1 - ph)));
    }
  }
}

}  // namespace zk
