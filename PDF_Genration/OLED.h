#ifndef OLED_H
#define OLED_H

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ── OLED Configuration ─────────────────────────────────────
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1     // No dedicated reset pin
#define OLED_ADDR      0x3C   // Most common I2C address (some boards use 0x3D)

// ESP32 default I2C pins (change if you're using different ones)
#define OLED_SDA_PIN   21
#define OLED_SCL_PIN   22

#define PROJECT_NAME   "Smart Health Guardian"

extern Adafruit_SSD1306 display;
extern bool oled_ready;   // true only if display.begin() succeeded

struct NEO6M;   // forward declaration (avoids needing NEO6M.h here)

void oled_setup();
void oled_work(NEO6M &data);

#endif