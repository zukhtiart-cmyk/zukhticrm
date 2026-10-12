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
  if (mood == Mood::Listening) tr = 2.3f;  // hand to the ear
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

// Zuki's colours: a young designer in a denim shirt and an olive apron.
static const uint32_t SKIN = 0xCF9468, SKIN_SHADE = 0xB97C52, HAIR = 0x2A1C15, SHIRT = 0x58779A, APRON = 0x56704F,
                      APRON_DARK = 0x475E41, PANTS = 0x3A2C24, SHOE = 0x6B4A2F, PENCIL = 0xD9A441, ERASER = 0xE59A9A,
                      WOOD = 0xF1D8B0, TAPE = 0xE2B84A, SCLERA = 0xFFFAF2, IRIS = 0x5A3622, PUPIL = 0x1F1712, MOUTH = 0x5A2620,
                      CHEEK = 0xE58F7A, BRASS = 0xB0844F, CLAY = 0xC4664A, OLIVE = 0x8FAE7F, GOLD = 0xF0C868, CREAM = 0xF6EAD8;

void drawZuki(Painter &p, const Pose &pose, float cx, float cy, float s, uint16_t bg) {
  (void)bg;
  float sx = s * (1 + pose.squash * 0.12f), sy = s * (1 - pose.squash * 0.12f);
  float ox = cx, oy = cy + pose.bob;
  float ct = cosf(pose.tilt), st = sinf(pose.tilt);
  // Design units (the same 200×200 drawing as the app, centre 100,118) → screen, with lean.
  auto X = [&](float x, float y) { float dx = (x - 100) * sx, dy = (y - 118) * sy; return ox + dx * ct - dy * st; };
  auto Y = [&](float x, float y) { float dx = (x - 100) * sx, dy = (y - 118) * sy; return oy + dx * st + dy * ct; };
  float S = (sx + sy) / 2;
  auto ellipse = [&](float x, float y, float rx, float ry, uint32_t c, uint8_t a = 255) { p.fillEllipse(X(x, y), Y(x, y), rx * S, ry * S, hex(c), a); };
  auto circle = [&](float x, float y, float r, uint32_t c, uint8_t a = 255) { ellipse(x, y, r, r, c, a); };
  auto rrect = [&](float x, float y, float w, float h, float r, uint32_t c) { p.fillRoundRect(X(x, y), Y(x, y), w * S, h * S, r * S, hex(c)); };
  auto line = [&](float x0, float y0, float x1, float y1, float w, uint32_t c) { p.thickLine(X(x0, y0), Y(x0, y0), X(x1, y1), Y(x1, y1), w * S, hex(c)); };
  auto quad = [&](float x0, float y0, float qx, float qy, float x1, float y1, float w, uint32_t c) {
    p.thickQuad(X(x0, y0), Y(x0, y0), X(qx, qy), Y(qx, qy), X(x1, y1), Y(x1, y1), w * S, hex(c));
  };
  // A closed shape made of cubic curves: pts = start, then (c1, c2, end) triples.
  auto cubicShape = [&](const float *pts, int segs, uint32_t c) {
    float xs[64], ys[64];
    int n = 0;
    float px = pts[0], py = pts[1];
    for (int k = 0; k < segs; k++) {
      const float *q = pts + 2 + k * 6;
      for (int i = 1; i <= 10 && n < 64; i++) {
        float t = i / 10.0f, u = 1 - t;
        float x = u * u * u * px + 3 * u * u * t * q[0] + 3 * u * t * t * q[2] + t * t * t * q[4];
        float y = u * u * u * py + 3 * u * u * t * q[1] + 3 * u * t * t * q[3] + t * t * t * q[5];
        xs[n] = X(x, y);
        ys[n] = Y(x, y);
        n++;
      }
      px = q[4];
      py = q[5];
    }
    p.fillPolygon(xs, ys, n, hex(c));
  };
  // An arm: sleeve, forearm and hand, swung up from the shoulder by `ang` (0 = hanging).
  auto arm = [&](float side, float ang) {
    float shx = 100 + side * 23, shy = 134;
    float th = -(ang - 0.15f) * side;  // raise outwards
    float c = cosf(th), sn = sinf(th);
    auto rx = [&](float x, float y) { return shx + (x - shx) * c - (y - shy) * sn; };
    auto ry = [&](float x, float y) { return shy + (x - shx) * sn + (y - shy) * c; };
    float ex = 100 + side * 34, ey = 152, wx = 100 + side * 37, wy = 163, hx = 100 + side * 37.5f, hy = 165;
    line(shx, shy, rx(ex, ey), ry(ex, ey), 13, SHIRT);
    line(rx(ex, ey), ry(ex, ey), rx(wx, wy), ry(wx, wy), 9, SKIN);
    circle(rx(hx, hy), ry(hx, hy), 6, SKIN);
  };

  // Floor shadow (doesn't bob).
  p.fillEllipse(cx, cy + 74 * s, 34 * s * (1 - pose.bob * 0.01f), 5 * s, hex(0x000000), 90);

  // Listening rings around the head.
  if (pose.mood == Mood::Listening)
    for (int i = 0; i < 3; i++) {
      float ph = fmodf(pose.ringPhase + i / 3.0f, 1.0f);
      p.thickArc(X(100, 86), Y(100, 86), (56 + ph * 34) * S, 3 * S, 0, 2 * PI_F, hex(OLIVE), (uint8_t)(170 * (1 - ph)));
    }

  // Legs and shoes.
  rrect(86, 168, 11, 17, 4, PANTS);
  rrect(103, 168, 11, 17, 4, PANTS);
  ellipse(90, 186, 10, 5, SHOE);
  ellipse(110, 186, 10, 5, SHOE);

  // Arms behind the body.
  arm(-1, pose.armL);
  arm(1, pose.armR);

  // Neck, shirt, apron with straps, pocket and measuring tape.
  rrect(93, 118, 14, 10, 3, SKIN_SHADE);
  rrect(72, 124, 56, 50, 20, SHIRT);
  line(86, 125, 81, 138, 4, APRON);
  line(114, 125, 119, 138, 4, APRON);
  rrect(79, 138, 42, 36, 6, APRON);
  rrect(91, 152, 18, 13, 3, APRON_DARK);
  circle(104, 153, 5.5f, TAPE);
  circle(104, 153, 1.8f, 0x7A5A1E);

  // Ears.
  circle(55, 90, 9, SKIN);
  ellipse(55, 90, 4, 5, SKIN_SHADE);
  circle(145, 90, 9, SKIN);
  ellipse(145, 90, 4, 5, SKIN_SHADE);

  // Pencil behind the right ear (rotated −28° about 148,70).
  {
    float a = -28 * PI_F / 180, c = cosf(a), sn = sinf(a);
    auto rx = [&](float x, float y) { return 148 + (x - 148) * c - (y - 70) * sn; };
    auto ry = [&](float x, float y) { return 70 + (x - 148) * sn + (y - 70) * c; };
    auto quadPoly = [&](float x0, float y0, float x1, float y1, uint32_t col) {
      float xs[4] = {X(rx(x0, y0), ry(x0, y0)), X(rx(x1, y0), ry(x1, y0)), X(rx(x1, y1), ry(x1, y1)), X(rx(x0, y1), ry(x0, y1))};
      float ys[4] = {Y(rx(x0, y0), ry(x0, y0)), Y(rx(x1, y0), ry(x1, y0)), Y(rx(x1, y1), ry(x1, y1)), Y(rx(x0, y1), ry(x0, y1))};
      p.fillPolygon(xs, ys, 4, hex(col));
    };
    quadPoly(144, 46, 151, 78, PENCIL);
    quadPoly(144, 46, 151, 51, ERASER);
    float tx[3] = {X(rx(144, 78), ry(144, 78)), X(rx(151, 78), ry(151, 78)), X(rx(147.5f, 86), ry(147.5f, 86))};
    float ty[3] = {Y(rx(144, 78), ry(144, 78)), Y(rx(151, 78), ry(151, 78)), Y(rx(147.5f, 86), ry(147.5f, 86))};
    p.fillPolygon(tx, ty, 3, hex(WOOD));
  }

  // Face.
  ellipse(100, 86, 45, 43, SKIN);

  // Hair: top-knot, a brass tie that glows with the mood, wavy fringe and side locks.
  circle(103, 31, 13, HAIR);
  uint32_t tieC = pose.mood == Mood::Listening || pose.mood == Mood::Concerned ? CLAY : pose.mood == Mood::Thinking ? OLIVE : pose.mood == Mood::Happy ? GOLD : BRASS;
  rrect(95, 40, 16, 6, 3, tieC);
  static const float HAIR_CAP[] = {54, 90, 48, 54, 70, 40, 100, 40, 132, 40, 154, 56, 146, 90, 143, 78, 137, 70, 128, 66,
                                   122, 74, 108, 78, 96, 72, 88, 78, 76, 80, 66, 76, 60, 80, 56, 84, 54, 90};
  cubicShape(HAIR_CAP, 6, HAIR);
  static const float LOCK_L[] = {56, 88, 52, 96, 54, 104, 58, 108, 58, 100, 59, 94, 62, 88};
  static const float LOCK_R[] = {144, 88, 148, 96, 146, 104, 142, 108, 142, 100, 141, 94, 138, 88};
  cubicShape(LOCK_L, 2, HAIR);
  cubicShape(LOCK_R, 2, HAIR);

  // Brows: relaxed, or raised in the middle when worried.
  if (pose.mood == Mood::Concerned) {
    line(74, 76, 89, 70, 3.6f, HAIR);
    line(126, 76, 111, 70, 3.6f, HAIR);
  } else {
    float lift = pose.mood == Mood::Listening ? -2 : 0;
    quad(73, 73 + lift, 82, 67 + lift, 90, 72 + lift, 3.6f, HAIR);
    quad(110, 72 + lift, 118, 67 + lift, 127, 73 + lift, 3.6f, HAIR);
  }

  // Eyes.
  if (pose.mood == Mood::Happy) {
    quad(73, 91, 82, 81, 91, 91, 3.8f, PUPIL);
    quad(109, 91, 118, 81, 127, 91, 3.8f, PUPIL);
  } else if (pose.mood == Mood::Sleeping || pose.blink < 0.3f) {
    quad(74, 90, 82, 94, 90, 90, 3.2f, PUPIL);
    quad(110, 90, 118, 94, 126, 90, 3.2f, PUPIL);
  } else {
    float wide = pose.mood == Mood::Listening ? 1.08f : 1.0f;
    float lx = pose.lookX * 3.5f, ly = pose.lookY * 3.0f;
    for (int side = -1; side <= 1; side += 2) {
      float ex = 100 + side * 18;
      ellipse(ex, 89, 9.5f * wide, 11 * wide * pose.blink, SCLERA);
      circle(ex + 1 + lx, 91 + ly, 6.6f, IRIS);
      circle(ex + 1 + lx, 91 + ly, 3.6f, PUPIL);
      circle(ex + 3.5f + lx, 87.5f + ly, 2.2f, 0xFFFFFF);
    }
  }

  // Nose and cheeks.
  quad(98, 97, 102, 101, 98, 104, 2.6f, SKIN_SHADE);
  ellipse(71, 104, 7, 4.5f, CHEEK, pose.mood == Mood::Happy ? 190 : 128);
  ellipse(129, 104, 7, 4.5f, CHEEK, pose.mood == Mood::Happy ? 190 : 128);

  // Mouth.
  if (pose.mood == Mood::Speaking) {
    ellipse(100, 115, 7 + pose.mouth * 3, 2 + pose.mouth * 7, MOUTH);
  } else if (pose.mood == Mood::Listening) {
    ellipse(100, 115, 4, 3.5f, MOUTH);
  } else if (pose.mood == Mood::Concerned) {
    quad(90, 117, 100, 111, 110, 117, 3.6f, MOUTH);
  } else if (pose.mood == Mood::Sleeping) {
    line(94, 114, 106, 114, 3.2f, MOUTH);
  } else {
    float big = pose.mood == Mood::Happy ? 1.3f : 1.0f;
    quad(100 - 12 * big, 111, 100, 111 + 10 * big, 100 + 12 * big, 111, 3.6f, MOUTH);
  }

  // Thinking dots circling the top-knot.
  if (pose.mood == Mood::Thinking)
    for (int i = 0; i < 3; i++) {
      float a = pose.dots * 3 + i * 2.094f;
      float dx = cosf(a) * 28, dy = sinf(a) * 7;
      circle(103 + dx, 14 + dy, 4.5f, OLIVE, sinf(a) > 0 ? 255 : 150);
    }
  // Dozing: little dots drifting up.
  if (pose.mood == Mood::Sleeping)
    for (int i = 0; i < 3; i++) {
      float ph = fmodf(pose.dots * 0.3f + i / 3.0f, 1.0f);
      circle(150 + ph * 20, 50 - ph * 40, 2 + ph * 3, CREAM, (uint8_t)(200 * (1 - ph)));
    }
}

}  // namespace zk
