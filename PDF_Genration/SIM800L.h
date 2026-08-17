#ifndef SIM800L_H
#define SIM800L_H

#include "WString.h"

// #define ADMIN_NUMBER "+918535877458" 
#define ADMIN_NUMBER "+918293711966" 
// #define ADMIN_NUMBER "+918348594685" 


// SIM Card PIN (Leave empty if your SIM doesn't have a PIN)
#define GSM_PIN ""

// APN Settings (Check your mobile carrier's website)
const char apn[] = "airtelgprs.com";

// const char apn[] = "internet";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ==========================================
// PIN DEFINITIONS (ESP32 <-> SIM800L)
// ==========================================
#define MODEM_TX 17     // mandatory pin
#define MODEM_RX 16     // mandatory pin
#define MODEM_RST 14
#define MODEM_DTR 25
#define MODEM_RING 35

// Serial Debugger Settings
#define SerialMon Serial
#define SerialAT Serial1
#define TINY_GSM_DEBUG SerialMon

struct NEO6M;   // forward declaration

struct SIM800L {
  String sms;
  bool valid;
};
void sim800l_setup();
void sim800l_work(SIM800L &SIM_data, NEO6M &data);

#endif