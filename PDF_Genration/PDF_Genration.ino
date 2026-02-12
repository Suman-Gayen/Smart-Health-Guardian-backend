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
// https://smart-health-api-m32s.onrender.com/download/P74842
//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
  return "P" + String(randNum);
}
unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 5000;

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
  updateMAX30102(max30102_RawData);
  update_ad8232(&ad8232_RawData);
  if (max30102_RawData.valid) {
    Serial.println("Finger DETECTED!");
    Serial.printf("HR=%d  SpO2=%d\n",
                  max30102_RawData.heartRate,
                  max30102_RawData.spo2);
  } else {
    Serial.println("Finger not detected");
  }

  if (ad8232_RawData.valid) {
    Serial.println(ad8232_RawData.ecgJsonData);
  } else {
    Serial.println("Electrode are not attached in your body");
  }
  // ----  Timed cloud upload ----
  if (WiFi.status() == WL_CONNECTED && millis() - lastPost > POST_INTERVAL) {
    //Check if at least one sensor has valid data
    if (!(max30102_RawData.valid || ad8232_RawData.valid)) {
      Serial.println("No valid sensor data. Skipping upload.");
      return;  //Do not send anything
    }

    lastPost = millis();

    String patient_id = generatePatientID();

    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    // Build JSON safely
    String json = "{";
    json += "\"patient_id\":\"" + patient_id + "\",";

    json += "\"heartrate\":";
    json += max30102_RawData.valid ? String(max30102_RawData.heartRate) : "null";
    json += ",";

    json += "\"spo2\":";
    json += max30102_RawData.valid ? String(max30102_RawData.spo2) : "null";
    json += ",";

    json += "\"ecg\":";
    json += ad8232_RawData.valid ? ad8232_RawData.ecgJsonData : "\"\"";

    json += "}";

    int responseCode = http.POST(json);
    Serial.printf("HTTP Response: %d\n", responseCode);

    http.end();
  }
}
