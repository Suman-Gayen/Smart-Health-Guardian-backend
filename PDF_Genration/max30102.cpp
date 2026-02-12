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

int32_t bufferLength;  //data length
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
    Serial.println(F("MAX30105 was not found. Please check wiring/power."));
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
  data.valid = false;  // Reset every call
  bufferLength = 100;  //buffer length of 100 stores 4 seconds of samples running at 25sps

  for (byte i = 0; i < bufferLength; i++) {
    while (particleSensor.available() == false)  //do we have new data?
      particleSensor.check();                    //Check the sensor for new data
    // Read current FIFO sample
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();

    // Tell the sensor we consumed this sample
    particleSensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(
    // Run algorithm once every 1 second
    irBuffer, 100, redBuffer,
    &spo2, &validSPO2,
    &heartRate, &validHeartRate);

  while (1) {
    //dumping the first 25 sets of samples in the memory and shift the last 75 sets of samples to the top
    for (byte i = 25; i < 100; i++) {
      redBuffer[i - 25] = redBuffer[i];
      irBuffer[i - 25] = irBuffer[i];
    }

    //take 25 sets of samples before calculating the heart rate.
    for (byte i = 75; i < 100; i++) {
      while (particleSensor.available() == false)  //do we have new data?
        particleSensor.check();                    //Check the sensor for new data
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i] = particleSensor.getIR();
      particleSensor.nextSample();  //We're finished with this sample so move to next sample

      //send samples and calculation result to terminal program through UART
      int rawHR = (heartRate > 90) ? (heartRate - 90) : heartRate;

      // Only report valid measurements
      data.redData = redBuffer[i];
      data.irData = irBuffer[i];
      data.valid = validHeartRate && validSPO2;
      data.heartRate = data.valid ? rawHR : 0;
      data.spo2 = data.valid ? spo2 : 0;
      return data.valid;
      //
    }

    //After gathering 25 new samples recalculate HR and SP02
    maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);
  }

}
