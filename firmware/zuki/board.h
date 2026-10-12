// Waveshare ESP32-S3-Touch-AMOLED-2.16 — pins from the Waveshare documentation.
#pragma once

// Display: CO5300 AMOLED, 480×480, QSPI
#define LCD_W 480
#define LCD_H 480
#define LCD_CS 12
#define LCD_SCLK 38
#define LCD_D0 4
#define LCD_D1 5
#define LCD_D2 6
#define LCD_D3 7
#define LCD_RST 39

// Shared I2C bus: touch, power chip, IMU, RTC, audio codecs
#define I2C_SDA 15
#define I2C_SCL 14

// Touch: CST9220
#define TP_INT 11
#define TP_RST 40
#define TP_ADDR 0x5A

// Audio: ES8311 (speaker) + ES7210 (microphones), one I2S bus
#define I2S_MCLK 42
#define I2S_BCLK 9
#define I2S_WS 45
#define I2S_DOUT 8   // ESP32 → ES8311
#define I2S_DIN 10   // ES7210 → ESP32
#define PA_EN 46     // speaker amplifier enable
#define ES8311_ADDR 0x18
#define ES7210_ADDR 0x40

// Buttons
#define BTN_USER 18  // active low

#define SAMPLE_RATE 16000
