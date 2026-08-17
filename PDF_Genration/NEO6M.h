#ifndef NEO6M_H
#define NEO6M_H

#include <TinyGPS++.h>
#include <HardwareSerial.h>

// ── GPS UART Configuration ─────────────────────────────────
#define GPS_BAUD    9600
#define GPS_RX_PIN  26      // ESP32 GPIO connected to NEO-6M TX
#define GPS_TX_PIN  27      // ESP32 GPIO connected to NEO-6M RX (optional)

// ── Serial Monitor Baud Rate ───────────────────────────────
#define MONITOR_BAUD  115200

// ── Objects ───────────────────────────────────────────────
extern TinyGPSPlus   gps;                           // GPS parser object
extern HardwareSerial gpsSerial;                 

struct SIM800L;   // forward declaration — just says "this struct exists somewhere"

struct NEO6M {
  float Location_lat, Location_long ;  
  float Altitude;  
  int Satellites;

  int day ;
  int month ;
  int year ;
  int hour ;
  int minute ;
  int second ;

  bool loc_valid;
  bool alt_valid;
  bool date_valid;
  bool time_valid;
  bool sat_valid;
};

void neo6m_setup();
void neo6m_work(NEO6M &data);

void buildLocationSMS(SIM800L &SIM_data, NEO6M &data);

#endif