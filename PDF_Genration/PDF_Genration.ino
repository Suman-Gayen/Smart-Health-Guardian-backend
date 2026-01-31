#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";
// const char* serverURL = "http://10.117.60.64:5000/upload";
// https://smart-health-api-m32s.onrender.com/download/P11874
// =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000; // 0–99999
  return "P" + String(randNum);
}
//=========
void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.println(".");
  }
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  Serial.println(temp);
  Serial.println(hum);

  if (!isnan(temp) && !isnan(hum)) {
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    
    String patient_id;
    patient_id = generatePatientID();
    String json = "{";
    json += "\"patient_id\":\"" + patient_id + "\",";
    json += "\"temperature\":" + String(temp) + ",";
    json += "\"humidity\":" + String(hum);
    json += "}";

    http.POST(json);
    http.end();
  }
  delay(10000);
}
