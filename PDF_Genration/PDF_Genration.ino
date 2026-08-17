#include "HardwareSerial.h"
#include <WiFi.h>
#include <HTTPClient.h>  // Sends HTTP requests (POST/GET) to Flask backend
#include <Wire.h>

#include "NEO6M.h"
#include <TinyGPS++.h>
#include "SIM800L.h"

#include "max30102.h"
#include "ad8232.h"
#include "OLED.h"

#define LED_PIN 13

// Holds latest processed sensor data
MAX30102 max30102_RawData;
AD8232 ad8232_RawData;
// NEO6M and SIM800L inter
NEO6M loc_data;
SIM800L value;

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";  // cloud Flask API endpoint (Render URL), ESP32 sends sensor data to this URL using HTTP POST.
// https://smart-health-api-m32s.onrender.com/download/P35515
//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
  return "P" + String(randNum);
}
unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 2000;

void setup() {
  pinMode(LED_PIN, OUTPUT);

  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print("!");
  }
  Wire.begin(21, 22);   // SDA, SCL — match your OLED wiring
  Serial.println("Scanning I2C bus...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      Serial.println(addr, HEX);
    }
  }

  setupMAX30102();
  delay(100);
  setup_ad8232();
  delay(100);
  neo6m_setup();
  delay(100);
  sim800l_setup();
  delay(100);
  oled_setup();
}

void loop() {
  // ---- 1. Always update both sensors independently ----
  updateMAX30102(max30102_RawData);
  update_ad8232(&ad8232_RawData);

  neo6m_work(loc_data);
  delay(200);
  oled_work(loc_data);


  if (max30102_RawData.valid) {
    Serial.println("Finger DETECTED!");
    Serial.printf("HR=%d  SpO2=%d temp=%.2f\n",
                  max30102_RawData.heartRate,
                  max30102_RawData.spo2, max30102_RawData.temperature);
  } else {
    Serial.println("Finger not detected");
  }

  if (ad8232_RawData.valid) {
    Serial.println(ad8232_RawData.ecgJsonData);
  } else {
    Serial.println("Electrode are not attached in your body");
  }



  // ----  Timed cloud upload ----
  if ( millis() - lastPost > POST_INTERVAL) {
    lastPost = millis();
    
    // NEO6M and SIM800L WORKING------------------
        // printGPSData();
    if (loc_data.loc_valid) {           // only try sending if GPS fix is valid
      sim800l_work(value, loc_data);

      SerialMon.print("Sending SMS to ");
      SerialMon.println(ADMIN_NUMBER);
      SerialMon.println(value.valid);
      SerialMon.println(value.sms);
      if (value.valid) {
        SerialMon.println("SMS sent successfully!");
        digitalWrite(LED_PIN, HIGH);
        delay(500);
        digitalWrite(LED_PIN, LOW);
        delay(500);
      } else {
        SerialMon.println("SMS failed to send.");
      }
    } else {
      SerialMon.println("Skipping SMS: no valid GPS fix yet.");
    }
    // -------------------------------------------

    // Helth data will upload on server ------------------
    if(WiFi.status() == WL_CONNECTED){

    
      //Check if at least one sensor has valid data
      if (!(max30102_RawData.valid || ad8232_RawData.valid)) {
        Serial.println("No valid sensor data. Skipping upload.");
        return;  //Do not send anything
      }


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
      
      json += "\"temperature\":";
      json += max30102_RawData.valid ? String(max30102_RawData.temperature) : "null";
      json += ",";

      json += "\"ecg\":";
      json += ad8232_RawData.valid ? ad8232_RawData.ecgJsonData : "\"\"";

      json += "}";

      int responseCode = http.POST(json);
      Serial.printf("HTTP Response: %d\n", responseCode);

      http.end();
    }
   // -------------------------------------------

  }
}
