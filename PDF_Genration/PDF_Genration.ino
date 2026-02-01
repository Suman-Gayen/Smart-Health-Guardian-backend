#include <WiFi.h>
#include <HTTPClient.h>  // Sends HTTP requests (POST/GET) to Flask backend
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

const char* ssid = "suman";
const char* password = "12345678";
const char* serverURL = "https://smart-health-api-m32s.onrender.com/upload";  // cloud Flask API endpoint (Render URL), ESP32 sends sensor data to this URL using HTTP POST.

//===== Patient ID Generator Function =======
String generatePatientID() {
  uint32_t randNum = esp_random() % 100000;  // 0–99999
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
    HTTPClient http;        // Creates HTTP client object
    http.begin(serverURL);  // Connects to Flask backend

    http.addHeader("Content-Type", "application/json");  // Set request type as JSON

    String patient_id;
    patient_id = generatePatientID();  // Call the function and Creates a new patient ID per transmission

    // Create JSON Payload
    String json = "{";
    json += "\"patient_id\":\"" + patient_id + "\",";
    json += "\"temperature\":" + String(temp) + ",";
    json += "\"humidity\":" + String(hum);
    json += "}";

    http.POST(json);  // SendsHTTPPOSTrequest
    http.end();       // Flask receives data
  }
  delay(10000);
}
