#ifndef MAX30102_SENSOR_H
#define MAX30102_SENSOR_H

// Structure to hold "packet" of processed sensor data
struct MAX30102 {
  float redData;     // Raw RED LED value
  float irData;      // Raw IR LED value
  int heartRate;        // Calculated heart rate (BPM)
  int spo2;             // Calculated SpO2 (%)
  bool valid;           // True if HR & SpO2 are valid
};

// Initializes I2C and configures MAX30102 registers
void setupMAX30102();

// Reads ONE sample, updates buffers,
// and periodically computes HR & SpO2
// Returns true only when new valid data is ready
bool updateMAX30102(MAX30102 &data);

#endif
