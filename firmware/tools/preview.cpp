// PC preview: renders Zuki's moods with the same code as the device, to PPM images.
#include <stdio.h>
#include <vector>
#include "../zuki/painter.h"
#include "../zuki/zuki_face.h"
using namespace zk;
int main() {
  const int W = 480, H = 480;
  Mood moods[] = {Mood::Idle, Mood::Listening, Mood::Thinking, Mood::Speaking, Mood::Happy, Mood::Concerned, Mood::Sleeping};
  const char *names[] = {"idle", "listening", "thinking", "speaking", "happy", "concerned", "sleeping"};
  for (int m = 0; m < 7; m++) {
    std::vector<uint16_t> fb(W * H);
    Painter p(fb.data(), W, H);
    Animator a;
    Pose pose;
    for (int i = 0; i < 60; i++) pose = a.update(moods[m], 1.0f / 30, 0.6f);
    p.gradient(hex(0x2A231D), hex(0x15120F));
    drawZuki(p, pose, 240, 190, 1.35f, hex(0x1F1C18));
    char fn[64];
    snprintf(fn, sizeof fn, "/tmp/zk_%s.ppm", names[m]);
    FILE *f = fopen(fn, "wb");
    fprintf(f, "P6 %d %d 255\n", W, H);
    for (uint16_t c : fb) {
      unsigned char px[3] = {(unsigned char)(((c >> 11) & 31) * 255 / 31), (unsigned char)(((c >> 5) & 63) * 255 / 63), (unsigned char)((c & 31) * 255 / 31)};
      fwrite(px, 1, 3, f);
    }
    fclose(f);
  }
  return 0;
}
