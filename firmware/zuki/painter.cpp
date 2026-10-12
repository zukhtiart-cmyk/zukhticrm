#include "painter.h"
#include <math.h>

namespace zk {

static inline uint16_t blend(uint16_t dst, uint16_t src, uint8_t a) {
  if (a == 255) return src;
  // Spread RGB565 into 0x07E0F81F so all three channels blend in one multiply (alpha 0..32).
  uint32_t a5 = ((uint32_t)a + 4) >> 3;
  uint32_t s = (src | ((uint32_t)src << 16)) & 0x07E0F81Fu;
  uint32_t d = (dst | ((uint32_t)dst << 16)) & 0x07E0F81Fu;
  uint32_t r = ((s * a5 + d * (32 - a5)) >> 5) & 0x07E0F81Fu;
  return (uint16_t)(r | (r >> 16));
}

void Painter::clear(uint16_t c) {
  for (int i = 0; i < w_ * h_; i++) fb_[i] = c;
}

void Painter::gradient(uint16_t top, uint16_t bottom) {
  for (int y = 0; y < h_; y++) {
    uint8_t a = (uint8_t)(255 * y / (h_ - 1));
    uint16_t c = blend(top, bottom, a);
    uint16_t *row = fb_ + y * w_;
    for (int x = 0; x < w_; x++) row[x] = c;
  }
}

void Painter::hline(int x0, int x1, int y, uint16_t c, uint8_t alpha) {
  if (y < 0 || y >= h_) return;
  if (x0 > x1) { int t = x0; x0 = x1; x1 = t; }
  if (x0 < 0) x0 = 0;
  if (x1 >= w_) x1 = w_ - 1;
  uint16_t *row = fb_ + y * w_;
  if (alpha == 255)
    for (int x = x0; x <= x1; x++) row[x] = c;
  else
    for (int x = x0; x <= x1; x++) row[x] = blend(row[x], c, alpha);
}

void Painter::fillRect(float x, float y, float w, float h, uint16_t c, uint8_t a) {
  for (int yy = (int)lroundf(y); yy < (int)lroundf(y + h); yy++) hline((int)lroundf(x), (int)lroundf(x + w) - 1, yy, c, a);
}

void Painter::fillEllipse(float cx, float cy, float rx, float ry, uint16_t c, uint8_t a) {
  if (rx <= 0 || ry <= 0) return;
  int y0 = (int)floorf(cy - ry), y1 = (int)ceilf(cy + ry);
  for (int y = y0; y <= y1; y++) {
    float dy = (y + 0.5f - cy) / ry;
    if (dy < -1 || dy > 1) continue;
    float dx = rx * sqrtf(1 - dy * dy);
    hline((int)lroundf(cx - dx), (int)lroundf(cx + dx) - 1, y, c, a);
  }
}

void Painter::fillRoundRect(float x, float y, float w, float h, float r, uint16_t c, uint8_t a) {
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;
  int y0 = (int)lroundf(y), y1 = (int)lroundf(y + h);
  for (int yy = y0; yy < y1; yy++) {
    float py = yy + 0.5f;
    float inset = 0;
    if (py < y + r) {
      float d = (y + r - py) / r;
      inset = r - r * sqrtf(fmaxf(0, 1 - d * d));
    } else if (py > y + h - r) {
      float d = (py - (y + h - r)) / r;
      inset = r - r * sqrtf(fmaxf(0, 1 - d * d));
    }
    hline((int)lroundf(x + inset), (int)lroundf(x + w - inset) - 1, yy, c, a);
  }
}

void Painter::fillPolygon(const float *xs, const float *ys, int n, uint16_t c, uint8_t a) {
  if (n < 3 || n > 64) return;
  float minY = ys[0], maxY = ys[0];
  for (int i = 1; i < n; i++) {
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  float nodes[64];
  for (int y = (int)floorf(minY); y <= (int)ceilf(maxY); y++) {
    float py = y + 0.5f;
    int k = 0;
    for (int i = 0, j = n - 1; i < n; j = i++) {
      if ((ys[i] < py && ys[j] >= py) || (ys[j] < py && ys[i] >= py))
        nodes[k++] = xs[i] + (py - ys[i]) / (ys[j] - ys[i]) * (xs[j] - xs[i]);
    }
    // sort crossings
    for (int i = 1; i < k; i++) {
      float v = nodes[i];
      int j = i - 1;
      while (j >= 0 && nodes[j] > v) { nodes[j + 1] = nodes[j]; j--; }
      nodes[j + 1] = v;
    }
    for (int i = 0; i + 1 < k; i += 2) hline((int)lroundf(nodes[i]), (int)lroundf(nodes[i + 1]) - 1, y, c, a);
  }
}

void Painter::fillTriangle(float x0, float y0, float x1, float y1, float x2, float y2, uint16_t c, uint8_t a) {
  float xs[3] = {x0, x1, x2}, ys[3] = {y0, y1, y2};
  fillPolygon(xs, ys, 3, c, a);
}

void Painter::thickLine(float x0, float y0, float x1, float y1, float w, uint16_t c, uint8_t a) {
  float dx = x1 - x0, dy = y1 - y0;
  float len = sqrtf(dx * dx + dy * dy);
  float r = w / 2;
  if (len > 0.01f) {
    float nx = -dy / len * r, ny = dx / len * r;
    float xs[4] = {x0 + nx, x1 + nx, x1 - nx, x0 - nx};
    float ys[4] = {y0 + ny, y1 + ny, y1 - ny, y0 - ny};
    fillPolygon(xs, ys, 4, c, a);
  }
  if (a == 255) {
    fillCircle(x0, y0, r, c);
    fillCircle(x1, y1, r, c);
  }
}

void Painter::thickArc(float cx, float cy, float r, float w, float a0, float a1, uint16_t c, uint8_t a) {
  // Filled ring segment as one polygon (outer edge, then inner edge back), so alpha blends evenly.
  const int N = 30;
  float xs[2 * N + 2], ys[2 * N + 2];
  float ro = r + w / 2, ri = r - w / 2;
  for (int i = 0; i <= N; i++) {
    float t = a0 + (a1 - a0) * i / N;
    xs[i] = cx + cosf(t) * ro;
    ys[i] = cy + sinf(t) * ro;
    xs[2 * N + 1 - i] = cx + cosf(t) * ri;
    ys[2 * N + 1 - i] = cy + sinf(t) * ri;
  }
  fillPolygon(xs, ys, 2 * N + 2, c, a);
  if (a == 255) {
    fillCircle(cx + cosf(a0) * r, cy + sinf(a0) * r, w / 2, c);
    fillCircle(cx + cosf(a1) * r, cy + sinf(a1) * r, w / 2, c);
  }
}

void Painter::thickQuad(float x0, float y0, float cx, float cy, float x1, float y1, float w, uint16_t c, uint8_t a) {
  const int N = 14;
  float px = x0, py = y0;
  for (int i = 1; i <= N; i++) {
    float t = (float)i / N, u = 1 - t;
    float x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    float y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    thickLine(px, py, x, y, w, c, a);
    px = x;
    py = y;
  }
}

}  // namespace zk
