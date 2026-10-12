// Zuki, the brass-house character, drawn in 2D for the desk device.
// The Animator turns "mood + time + voice level" into a pose; drawZuki() paints that pose.
#pragma once
#include <stdint.h>
#include "painter.h"

namespace zk {

enum class Mood : uint8_t { Idle, Listening, Thinking, Speaking, Happy, Concerned, Sleeping };

struct Pose {
  float bob = 0;        // vertical offset (px)
  float tilt = 0;       // body lean (radians)
  float squash = 0;     // tap bounce (+ = squashed)
  float lookX = 0;      // -1..1
  float lookY = 0;      // -1..1
  float blink = 1;      // 1 open, 0 closed
  float mouth = 0;      // 0..1 talking openness
  float armL = 0.15f;   // radians, + raises
  float armR = 0.15f;
  float ringPhase = 0;  // listening rings 0..1
  float dots = 0;       // thinking dots time
  float lampGlow = 0.5f;
  Mood mood = Mood::Idle;
};

class Animator {
 public:
  /** Advance by dt seconds. `voice` is the current speaking level 0..1 (from the speaker audio). */
  Pose update(Mood mood, float dt, float voice);
  /** A tap: squash and bounce. */
  void poke() { squashV_ += 9.0f; }
  /** Point the eyes somewhere (-1..1), e.g. towards a touch. Returns to wandering after a while. */
  void lookAt(float x, float y) { tx_ = x; ty_ = y; hold_ = 2.5f; }

 private:
  float t_ = 0, squash_ = 0, squashV_ = 0;
  float lx_ = 0, ly_ = 0, tx_ = 0, ty_ = 0, hold_ = 0, wander_ = 0;
  float nextBlink_ = 1.5f, blinkLeft_ = 0;
  float armL_ = 0.15f, armR_ = 0.15f;
  float happyT_ = 0;
  Mood last_ = Mood::Idle;
  uint32_t seed_ = 12345;
  float rnd() { seed_ = seed_ * 1664525u + 1013904223u; return (seed_ >> 8) / 16777216.0f; }
};

/** Paint Zuki centred at (cx, cy) — cy is the middle of the body. `s` scales the 200-unit design. */
void drawZuki(Painter &p, const Pose &pose, float cx, float cy, float s, uint16_t background);

}  // namespace zk
