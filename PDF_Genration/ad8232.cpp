#include "esp32-hal-gpio.h"
#include "HardwareSerial.h"
#include "ad8232.h"
// Define the pins connected to the AD8232 ECG sensor
#define ECG_OUTPUT_PIN 34  // VP pin on ESP32 (ADC1_CH0)
#define ECG_LO_PLUS_PIN 32
#define ECG_LO_MINUS_PIN 33

#define SAMPLE_COUNT 250
static uint16_t ecgData[SAMPLE_COUNT];

void setup_ad8232() {
  pinMode(ECG_LO_PLUS_PIN, INPUT);
  pinMode(ECG_LO_MINUS_PIN, INPUT);
  analogSetPinAttenuation(ECG_OUTPUT_PIN, ADC_11db);
}

void update_ad8232(AD8232 *data) {
  // Serial.print("LO+: ");
  // Serial.print(digitalRead(ECG_LO_PLUS_PIN));
  // Serial.print("  LO-: ");
  // Serial.println(digitalRead(ECG_LO_MINUS_PIN));
  if ((digitalRead(ECG_LO_PLUS_PIN)) || (digitalRead(ECG_LO_MINUS_PIN))) {
    strcpy(data->ecgJsonData, "!leads_off");
    data->valid = false;
    return;
  }

  // ---- Sample ECG ----
  for (int i = 0; i < SAMPLE_COUNT; i++) {  // filtered read
    ecgData[i] = analogRead(ECG_OUTPUT_PIN);
    delayMicroseconds(4000);
    yield();  // feeds watchdog
  }
  // ---- Flatline Check ----
  bool allSame = true;
  uint16_t firstValue = ecgData[0];

  for (int i = 1; i < SAMPLE_COUNT; i++) {
    if (ecgData[i] != firstValue) {
      allSame = false;
      break;
    }
  }

  if (allSame && (firstValue == 0 || firstValue == 4095)) {
    strcpy(data->ecgJsonData, "!flatline");
    data->valid = false;
    return;
  } else {
    data->valid = true;
  }


  char *p = data->ecgJsonData;
  *p++ = '[';

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    p += sprintf(p, "%d", ecgData[i]);
    if (i < SAMPLE_COUNT - 1) *p++ = ',';
  }

  *p++ = ']';
  *p = '\0';
  delay(4);  // ~250 samples per second (good for ECG)
}
