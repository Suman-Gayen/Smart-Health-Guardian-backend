#include "esp32-hal-gpio.h"
#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include "SIM800L.h"
#include "NEO6M.h"

// Set up the modem and debug streams
#ifdef DUMP_AT_COMMANDS
  #include <StreamDebugger.h>
  StreamDebugger debugger(SerialAT, SerialMon);
  TinyGsm modem(debugger);
#else
  TinyGsm modem(SerialAT);
#endif

TinyGsmClient client(modem);

void sim800l_setup() {
  // Initialize Modem Pins
  pinMode(MODEM_RST, OUTPUT);
  digitalWrite(MODEM_RST, LOW);
  delay(100);
  digitalWrite(MODEM_RST, HIGH);
  delay(100);

  pinMode(MODEM_DTR, OUTPUT);
  digitalWrite(MODEM_DTR, HIGH);
  pinMode(MODEM_RING, INPUT);

  SerialMon.println("Wait ...");

  // Initialize Serial communication with SIM800L
  SerialAT.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(300);

  // Restart and Initialize Modem
  SerialMon.println("Initializing modem ...");
  modem.restart();
  delay(500);
  modem.init();

  // Unlock SIM if needed
  if (strlen(GSM_PIN) > 0 && modem.getSimStatus() != 3) {
    modem.simUnlock(GSM_PIN);
  }

  // Print Modem Info
  String modemInfo = modem.getModemInfo();
  SerialMon.print("Modem Info: ");
  SerialMon.println(modemInfo);
  delay(100);
  SerialMon.println(modem.getSignalQuality()); // should be >5 ideally, 99 = unknown/no signal

  // Connect to Network
  SerialMon.print("Waiting for network...");
  if (!modem.waitForNetwork()) {
    SerialMon.println(" fail");
    delay(300);
    return;
  }
  SerialMon.println(" success");

  if (modem.isNetworkConnected()) {
    SerialMon.println("Network connected");
  }

  // Print Network Details
  String imei = modem.getIMEI();
  SerialMon.print("IMEI: ");
  SerialMon.println(imei);

  String operatorName = modem.getOperator();
  SerialMon.print("Operator: ");
  SerialMon.println(operatorName);

  int signalQuality = modem.getSignalQuality();
  SerialMon.print("Signal Quality (0-31): ");
  SerialMon.println(signalQuality);

  // Set SMS mode to Text Mode
  modem.sendAT("+CMGF=1");
  delay(100);

  SerialMon.println("Setup complete. Will send SMS every 2 minute...");
}

void buildLocationSMS(SIM800L &SIM_data, NEO6M &data) {
  SIM_data.sms = "Location Alert!\n";
  SIM_data.sms += "Time: " + String(data.hour) + ":" + String(data.minute) + ":" + String(data.second) + " IST\n";
  SIM_data.sms += "Date: " + String(data.day) + "/" + String(data.month) + "/" + String(data.year) + "\n";
  SIM_data.sms += "Location: https://maps.google.com/?q=" + String(data.Location_lat, 6) + "," + String(data.Location_long, 6);  
}

void sim800l_work(SIM800L &SIM_data, NEO6M &data) {
  buildLocationSMS(SIM_data, data);
  SIM_data.valid = modem.sendSMS(ADMIN_NUMBER, SIM_data.sms);
}


