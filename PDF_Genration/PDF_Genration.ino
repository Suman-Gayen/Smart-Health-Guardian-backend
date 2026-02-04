#include <WiFi.h>
#include <HTTPClient.h>  // Sends HTTP requests (POST/GET) to Flask backend

#include "max30102.h"

// Holds latest processed sensor data
MAX30102 sensorData;

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";  // cloud Flask API endpoint (Render URL), ESP32 sends sensor data to this URL using HTTP POST.

unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 3000;  // 3 seconds

//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
  return "P" + String(randNum);
}
//=========
void setup() {
  Serial.begin(115200);
  setupMAX30102();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.println("....");
  }
}

void loop() {

  if (updateMAX30102(sensorData) && sensorData.valid) {

    // -------- Finger detection --------
    if (sensorData.irData < 10000) {
      Serial.println("No finger detected");
      return;  // skip printing other values
    }

    String patient_id = generatePatientID();  // Call the function and Creates a new patient ID per transmission

    // -------- Heart rate correction --------
    int rawHR;
    if (sensorData.heartRate > 90) {
      rawHR = sensorData.heartRate - 90;
    } else {
      rawHR = sensorData.heartRate;
    }
    // -------- Serial output --------
    Serial.print("Patient_ID:");
    Serial.print(patient_id);
    Serial.print(" HR=");
    Serial.print(rawHR);
    Serial.print(" SpO2=");
    Serial.println(sensorData.spo2);

    HTTPClient http;                                     // Creates HTTP client object
    http.begin(serverURL);                               // Connects to Flask backend
    http.addHeader("Content-Type", "application/json");  // Set request type as JSON

    // Send to server only every 5 seconds
    if (millis() - lastPost > POST_INTERVAL) {
      lastPost = millis();

      // Create JSON Payload
      String json = "{";
      json += "\"patient_id\":\"" + patient_id + "\",";
      json += "\"heartrate\":" + String(rawHR) + ",";
      json += "\"spo2\":" + String(sensorData.spo2);
      json += "}";

      http.POST(json);  // SendsHTTPPOSTrequest
      http.end();       // Flask receives data
    }
  }
}
