#ifndef AD8232_SENSOR_H
#define AD8232_SENSOR_H

#define ECG_JSON_BUF_SIZE 2048

struct AD8232 {
  char ecgJsonData[ECG_JSON_BUF_SIZE];
  bool valid;  //ECG validity flag
};

void setup_ad8232();

void update_ad8232(AD8232 *data);
#endif