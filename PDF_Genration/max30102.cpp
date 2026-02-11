#include "max30102.h"
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// MAX30102 driver object (SparkFun library)
MAX30105 particleSensor;

/* ------------------------------------------------------------------
   STATIC BUFFERS
   These store historical samples required by the algorithm.
   Static = retained between function calls.
------------------------------------------------------------------ */
static uint32_t irBuffer[100];   // IR samples
static uint32_t redBuffer[100];  // RED samples
static uint8_t bufferIndex = 0;  // Circular buffer index

// Output variables for Maxim algorithm
static int32_t spo2;
static int8_t validSPO2;
static int32_t heartRate;
static int8_t validHeartRate;

// Used to control how often calculations occur
static unsigned long lastCalc = 0;


void setupMAX30102() {
  // Initialize I2C on ESP32 (custom pins)
  Wire.begin(21, 22);

  // Start MAX30102 at 400kHz I2C
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    // Fatal error – sensor not detected
    while (1)
      ;
  }

  // Configure sensor parameters
  particleSensor.setup(
    60,   // LED brightness (0–255)
    4,    // Sample averaging (reduces noise)
    2,    // Mode: Red + IR
    100,  // Sample rate (Hz)
    411,  // Pulse width (higher = better resolution)
    4096  // ADC range
  );
}


bool updateMAX30102(MAX30102 &data) {
  // If no new sample is available, exit immediately
  // This prevents blocking the loop()
  if (!particleSensor.available()) {
    particleSensor.check();
    return false;
  }

  // Read current FIFO sample
  redBuffer[bufferIndex] = particleSensor.getRed();
  irBuffer[bufferIndex] = particleSensor.getIR();

  // Tell the sensor we consumed this sample
  particleSensor.nextSample();

  // Save raw values for printing
  data.redData = redBuffer[bufferIndex];
  data.irData = irBuffer[bufferIndex];


  bufferIndex++;
  // Wrap index to keep buffer size fixed at 100
  if (bufferIndex >= 100) bufferIndex = 0;

  if (millis() - lastCalc >= 1000) {  // compute once per second and data will be pass when ir value is greater than 10000
    lastCalc = millis();
    if (data.irData > 10000) {
      // Compute HR and SpO2 from buffers
      maxim_heart_rate_and_oxygen_saturation(
        // Run algorithm once every 1 second
        irBuffer, 100, redBuffer,
        &spo2, &validSPO2,
        &heartRate, &validHeartRate);

      // -------- Heart rate correction --------
      int rawHR;
      if (heartRate > 90) {
        rawHR = heartRate - 90;
      } else {
        rawHR = heartRate;
      }

      // Only report valid measurements
      data.valid = validHeartRate && validSPO2;
      data.heartRate = data.valid ? rawHR : 0;
      data.spo2 = data.valid ? spo2 : 0;

      return data.valid;
    }  // New data ready for printing
  } 

  return false;  // No new computed data yet
}
