// Tiny software rasteriser that draws into an RGB565 framebuffer.
// Pure C++ (no Arduino), so the same drawing code runs on the device and on a PC preview tool.
#pragma once
#include <stdint.h>

namespace zk {

inline uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
inline uint16_t hex(uint32_t h) { return rgb((h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF); }

class Painter {
 public:
  Painter(uint16_t *fb, int w, int h) : fb_(fb), w_(w), h_(h) {}
  int width() const { return w_; }
  int height() const { return h_; }
  uint16_t *buffer() { return fb_; }

  void clear(uint16_t c);
  /** Vertical gradient between two colours. */
  void gradient(uint16_t top, uint16_t bottom);
  void hline(int x0, int x1, int y, uint16_t c, uint8_t alpha = 255);
  void fillRect(float x, float y, float w, float h, uint16_t c, uint8_t alpha = 255);
  void fillEllipse(float cx, float cy, float rx, float ry, uint16_t c, uint8_t alpha = 255);
  void fillCircle(float cx, float cy, float r, uint16_t c, uint8_t alpha = 255) { fillEllipse(cx, cy, r, r, c, alpha); }
  void fillRoundRect(float x, float y, float w, float h, float r, uint16_t c, uint8_t alpha = 255);
  /** Any simple polygon (even-odd fill). Up to 64 points. */
  void fillPolygon(const float *xs, const float *ys, int n, uint16_t c, uint8_t alpha = 255);
  void fillTriangle(float x0, float y0, float x1, float y1, float x2, float y2, uint16_t c, uint8_t alpha = 255);
  /** Line with thickness and round ends. */
  void thickLine(float x0, float y0, float x1, float y1, float w, uint16_t c, uint8_t alpha = 255);
  /** Arc of a circle, angles in radians (0 = right, clockwise because y points down). */
  void thickArc(float cx, float cy, float r, float w, float a0, float a1, uint16_t c, uint8_t alpha = 255);
  /** Quadratic Bezier stroke. */
  void thickQuad(float x0, float y0, float cx, float cy, float x1, float y1, float w, uint16_t c, uint8_t alpha = 255);

 private:
  uint16_t *fb_;
  int w_, h_;
};

}  // namespace zk
