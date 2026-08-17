#include "NEO6M.h"

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// ══════════════════════════════════════════════════════════
void neo6m_setup() {
  // Start GPS serial
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  // Splash screen
  Serial.println(F("============================================"));
  Serial.println(F("   ESP32 + NEO-6M GPS  |  Serial Monitor   "));
  Serial.println(F("============================================"));
}

// ══════════════════════════════════════════════════════════
void neo6m_work(NEO6M &data) {
  // Feed all available GPS bytes into the parser
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Check for no-data timeout (wiring problem warning)
  if (millis() > 5000 && gps.charsProcessed() < 10) {
    Serial.println(F("⚠  WARNING: No data from GPS module."));
    Serial.println(F("   Check wiring: NEO-6M TX → ESP32 GPIO 16"));
    delay(500);
    return;
  }
  data.loc_valid = gps.location.isValid();
  data.alt_valid = gps.altitude.isValid();
  data.date_valid = gps.date.isValid();
  data.time_valid = gps.time.isValid();
  data.sat_valid = gps.satellites.isValid();

  data.Location_lat = gps.location.lat();
  data.Location_long = gps.location.lng();
  data.Altitude = gps.altitude.meters();
  data.Satellites = gps.satellites.value();

  data.day = gps.date.day();
  data.month = gps.date.month();
  data.year = gps.date.year();
  data.hour = gps.time.hour();
  data.minute = gps.time.minute();
  data.second = gps.time.second();

  // Convert UTC to IST (+5:30)
  data.minute += 30;
  if (data.minute >= 60) {
    data.minute -= 60;
    data.hour += 1;
  }

  data.hour += 5;
  if (data.hour >= 24) {
    data.hour -= 24;
    data.day += 1;   // simple day rollover (see note below)
  }
}
