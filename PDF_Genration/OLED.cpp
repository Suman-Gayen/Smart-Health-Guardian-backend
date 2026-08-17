#include "OLED.h"
#include "NEO6M.h"

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
// ══════════════════════════════════════════════════════════
void oled_setup() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println(F("⚠ OLED init failed! Check wiring/address (tried 0x3C)."));
    while (true);
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Splash screen
  display.setTextSize(1);
  display.setCursor(0, 20);
  display.println(F(PROJECT_NAME));
  display.setCursor(0, 35);
  display.println(F("Initializing..."));
  display.display();
  delay(500);
}

// ══════════════════════════════════════════════════════════
void oled_work(NEO6M &data) {
  display.clearDisplay();

  // ── Project name (top, bold-ish via size 1 + underline) ──
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F(PROJECT_NAME));
  display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SSD1306_WHITE);

  // ── Date ──────────────────────────────────────────────────
  display.setTextSize(1);
  display.setCursor(0, 20);
  display.print(F("Date: "));
  if (data.date_valid) {
    char dateBuf[12];
    sprintf(dateBuf, "%02d/%02d/%04d", data.day, data.month, data.year);
    display.println(dateBuf);
  } else {
    display.println(F("--/--/----"));
  }

  // ── Time ──────────────────────────────────────────────────
  display.setCursor(0, 32);
  display.print(F("Time: "));
  if (data.time_valid) {
    char timeBuf[10];
    sprintf(timeBuf, "%02d:%02d:%02d", data.hour, data.minute);
    display.println(timeBuf);
    display.setCursor(90, 32);
    display.print(F("IST"));
  } else {
    display.println(F("--:--:--"));
  }

  // ── GPS fix status (handy at a glance) ───────────────────
  display.setCursor(0, 50);
  display.print(F("GPS Fix: "));
  display.println(data.loc_valid ? F("YES") : F("NO"));

  display.display();
}