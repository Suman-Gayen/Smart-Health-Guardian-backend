#include <WiFi.h>
#include <HTTPClient.h>  // Sends HTTP requests (POST/GET) to Flask backend

#include "max30102.h"

// Holds latest processed sensor data
MAX30102 sensorData;

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";  // cloud Flask API endpoint (Render URL), ESP32 sends sensor data to this URL using HTTP POST.
// https://smart-health-api-m32s.onrender.com/download/P4326
//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
  return "P" + String(randNum);
}
unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 10000;

void setup() {
  Serial.begin(115200);
  setupMAX30102();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
}

void loop() {
  if (updateMAX30102(sensorData) && sensorData.valid) {

    String patient_id;
    patient_id = generatePatientID();
    // -------- Serial output --------
    Serial.printf(patient_id);
    Serial.printf("Patient:%s HR=%d SpO2=%d\n",
                  patient_id.c_str(),
                  sensorData.heartRate,
                  sensorData.spo2);

    if (WiFi.status() == WL_CONNECTED && millis() - lastPost > POST_INTERVAL) {

      lastPost = millis();

      HTTPClient http;
      http.begin(serverURL);
      http.addHeader("Content-Type", "application/json");

      String json = "{";
      json += "\"patient_id\":\"" + patient_id + "\",";
      json += "\"heartrate\":" + String(sensorData.heartRate) + ",";
      json += "\"spo2\":" + String(sensorData.spo2);
      json += "}";

      http.POST(json);
      http.end();
    }
  }else{
    Serial.printf("Finger has not detected!");
  }
}
