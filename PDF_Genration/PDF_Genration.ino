#include "HardwareSerial.h"
#include <WiFi.h>
#include <HTTPClient.h>  // Sends HTTP requests (POST/GET) to Flask backend

#include "max30102.h"
#include "ad8232.h"

// Holds latest processed sensor data
MAX30102 max30102_RawData;
AD8232 ad8232_RawData;

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";  // cloud Flask API endpoint (Render URL), ESP32 sends sensor data to this URL using HTTP POST.
// https://smart-health-api-m32s.onrender.com/download/P39335
//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
  return "P" + String(randNum);
}
unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 10000;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print("!");
  }
  setupMAX30102();
  setup_ad8232();
}

void loop() {

  // ---- 1. Always update both sensors independently ----
  bool newPPG = updateMAX30102(max30102_RawData);
  update_ad8232(&ad8232_RawData);

  // ---- 2. Serial monitoring (independent) ----
  if (max30102_RawData.irData < 10000) {
    Serial.println("Finger not detected");
  }

  if (newPPG && max30102_RawData.valid) {
    Serial.printf("HR=%d  SpO2=%d\n",
                  max30102_RawData.heartRate,
                  max30102_RawData.spo2);
  }

  Serial.println(ad8232_RawData.ecgJsonData);

  // ---- 3. Timed cloud upload ----
  if (WiFi.status() == WL_CONNECTED &&
      millis() - lastPost > POST_INTERVAL) {

    lastPost = millis();

    String patient_id = generatePatientID();

    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    // Build JSON safely
    String json = "{";
    json += "\"patient_id\":\"" + patient_id + "\",";

    if (max30102_RawData.valid) {
      json += "\"heartrate\":" + String(max30102_RawData.heartRate) + ",";
      json += "\"spo2\":" + String(max30102_RawData.spo2) + ",";
    } else {
      json += "\"heartrate\":null,";
      json += "\"spo2\":null,";
    }

    json += "\"ecg\":";
    json += ad8232_RawData.ecgJsonData;
    json += "}";

    int responseCode = http.POST(json);
    Serial.printf("HTTP Response: %d\n", responseCode);

    http.end();
  }
}

