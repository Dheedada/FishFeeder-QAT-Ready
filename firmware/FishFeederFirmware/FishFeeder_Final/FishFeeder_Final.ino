#include <WiFi.h>
#include <WiFiMulti.h>
#include <WebServer.h>      
#include <ESPmDNS.h>
#include "esp_camera.h"
#include <ESP32Servo.h>
#include <time.h> 
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <HardwareSerial.h>
#include <Preferences.h> 

HardwareSerial sim800l(1); 
WebServer server(88);      
Servo feederServo;      
Preferences preferences; 

const int servoPin = 13; 
#define CAMERA_MODEL_AI_THINKER 
#include "camera_pins.h"
WiFiMulti wifiMulti; 

const String supabaseUrl = "https://pcwmgpziyybcqmrdzvhe.supabase.co/rest/v1/feeding_history";
const String supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd21ncHppeXliY3FtcmR6dmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTg4OTQsImV4cCI6MjA4NDk5NDg5NH0.43I0rP6zAD4g2LQG2Tyj1JCESVp_6zgAnlcoE42qSpc";

// --- CONTACT CONFIGURATION ---
const String adminPhoneNumber = "+639765842387"; 
const String testPhoneNumber  = "+639761203103"; 

String smsMessage = "";     
bool triggerSMS = false;    

int _timeout;
String _buffer;

int currentFoodLevel; 
bool maintenanceMode = false; 

// --- PRECISION 360 SERVO SETTINGS ---
const int stopCommand  = 90;      // The brake command
const int spinDownSlow = 100;     // ULTRA-SLOW spin forward
const int spinUpSlow   = 80;      // ULTRA-SLOW spin backward
const int spinTimeMs   = 1000;    // Start with 1.0 second for the slow spin

String schedule1 = "08:00"; 
String schedule2 = "18:00"; 
bool sched1Active = true;
bool sched2Active = true;
int lastFedMinute = -1; 

unsigned long lastTimePrint = 0;
void startCameraServer(); 

void saveFoodData() {
  preferences.begin("feeder", false);
  preferences.putInt("food", currentFoodLevel);
  preferences.end();
}

void smartDelay(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    server.handleClient(); 
    delay(10);
  }
}

String _readSerial() {
  _timeout = 0;
  while (!sim800l.available() && _timeout < 600 ) {
    delay(13);
    _timeout++;
    server.handleClient(); 
  }
  if (sim800l.available()) {
    return sim800l.readString();
  }
  return "NO RESPONSE"; 
}

void sendSmsAlert(String message) {
  while(sim800l.available()) { sim800l.read(); }
  
  // Send to Admin
  Serial.println(F("[GSM] Waking up SIM and Sending to Admin..."));
  sim800l.println("AT"); 
  smartDelay(500);
  sim800l.println("AT+CMGF=1"); 
  smartDelay(500);
  sim800l.print("AT+CMGS=\""); sim800l.print(adminPhoneNumber); sim800l.println("\"");
  smartDelay(500);
  sim800l.print(message); 
  smartDelay(500);
  sim800l.write(26); 
  smartDelay(5000); 
  _buffer = _readSerial();
  Serial.println("SIM Reply Admin: \n" + _buffer); 

  // Send to Test Number
  Serial.println(F("[GSM] Waking up SIM and Sending to Test Number..."));
  sim800l.println("AT"); 
  smartDelay(500);
  sim800l.println("AT+CMGF=1"); 
  smartDelay(500);
  sim800l.print("AT+CMGS=\""); sim800l.print(testPhoneNumber); sim800l.println("\"");
  smartDelay(500);
  sim800l.print(message); 
  smartDelay(500);
  sim800l.write(26); 
  smartDelay(5000);
  _buffer = _readSerial();
  Serial.println("SIM Reply Test: \n" + _buffer); 
}

// --- PERFECTED 360 SWEEP MOTION ---
void feedFish() {
  Serial.println(F("[ACTION] Initializing Slow 360 Sweep..."));
  
  // Power on the motor
  feederServo.attach(servoPin, 500, 2400); 
  
  // Step 1: Spin down slowly
  Serial.println(F("[SERVO] Spinning down..."));
  feederServo.write(spinDownSlow); 
  delay(spinTimeMs); 

  // Step 2: Pause briefly at the bottom
  feederServo.write(stopCommand);
  delay(300);

  // Step 3: Spin back up slowly
  Serial.println(F("[SERVO] Spinning back up..."));
  feederServo.write(spinUpSlow);
  delay(spinTimeMs);

  // Step 4: Hit the brakes, then cut the power!
  Serial.println(F("[SERVO] Locking and cutting power to prevent creeping..."));
  feederServo.write(stopCommand); 
  delay(200);            
  feederServo.detach(); 

  currentFoodLevel = max(0, currentFoodLevel - 2); 
  saveFoodData(); 

  if (currentFoodLevel <= 20) {
    smsMessage = "ALERT: Fish Food is LOW (" + String(currentFoodLevel) + "%). Please refill!";
    triggerSMS = true;
  }
  Serial.println(F("[SUCCESS] Feeding Sequence Complete."));
}

void setup() {
  Serial.begin(115200);
  sim800l.begin(9600, SERIAL_8N1, 14, 15);   

  Serial.println(F("Syncing and Configuring SIM800L..."));
  
  Serial.println(F("Waiting 5 seconds for SIM800L to fully boot..."));
  delay(5000); 

  sim800l.println("AT"); smartDelay(300);
  sim800l.println("AT+IPR=9600"); smartDelay(300); 
  sim800l.println("AT+CMGF=1"); smartDelay(300);
  sim800l.println("AT+CNMI=2,2,0,0,0"); 
  smartDelay(300);

  preferences.begin("feeder", false);
  currentFoodLevel = preferences.getInt("food", 100); 
  preferences.end();

  // --- CAMERA FIX: USE TIMER 3 SO WE DO NOT BLIND THE CAMERA ---
  ESP32PWM::allocateTimer(3); 
  feederServo.setPeriodHertz(50); 
  // -------------------------------------------------------------

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM; config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM; config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM; config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM; config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.frame_size = FRAMESIZE_CIF;  
  config.jpeg_quality = 12;            
  config.fb_count = 1;                

  esp_camera_init(&config);

  // --- DUAL WI-FI REDUNDANCY (PLAN A & PLAN B) ---
  Serial.println(F("\nScanning for Backup or Primary Wi-Fi..."));
  
  // PLAN A: Your Pocket Wi-Fi
  wifiMulti.addAP("Smart_Bro_E81D7", "smartbro"); 
  
  // PLAN B: Your Phone Hotspot (Just in case the pocket Wi-Fi dies!)
  wifiMulti.addAP("Feeder_Hotspot", "12345678"); 
  
  while (wifiMulti.run() != WL_CONNECTED) { 
    delay(500); 
    Serial.print(".");
  }
  
  Serial.println(F("\n[NETWORK] Connected successfully!"));
  Serial.print(F("[NETWORK] Connected to: "));
  Serial.println(WiFi.SSID()); 
  // ------------------------------------------------

  MDNS.begin("feeder");
  configTime(8 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  startCameraServer();

  server.on("/feed", [&]() {
    if (!maintenanceMode) {
      server.send(200, "text/plain", "OK");
      feedFish();
      if (!triggerSMS) { 
        smsMessage = "Staff Action: Manual Feeding Triggered. Food: " + String(currentFoodLevel) + "%";
        triggerSMS = true;
      }
    } else {
      server.send(403, "text/plain", "LOCKED");
      Serial.println(F("[BLOCK] Manual feed attempt blocked (Maintenance ON)."));
    }
  });

  server.on("/maintenance", [&]() {
    if (server.hasArg("state")) { 
      maintenanceMode = (server.arg("state") == "1");
      server.send(200, "text/plain", maintenanceMode ? "LOCKED" : "UNLOCKED");
      Serial.println(maintenanceMode ? F("!!! MAINTENANCE ON !!!") : F("MAINTENANCE OFF"));
    }
  });

  server.on("/refill", [&]() {
    currentFoodLevel = 100;
    saveFoodData();
    server.send(200, "text/plain", "REFILLED");
    smsMessage = "Hopper Refilled. Food level is back to 100%.";
    triggerSMS = true;
  });

  server.on("/status", [&]() {
    String json = "{\"level\":" + String(currentFoodLevel) + ",\"maint\":" + (maintenanceMode ? "1" : "0") + "}";
    server.send(200, "application/json", json);
  });

  server.on("/update_schedule", [&]() {
    if(server.hasArg("s1")) schedule1 = server.arg("s1");
    if(server.hasArg("a1")) sched1Active = (server.arg("a1") == "1");
    if(server.hasArg("s2")) schedule2 = server.arg("s2");
    if(server.hasArg("a2")) sched2Active = (server.arg("a2") == "1");
    server.send(200, "text/plain", "UPDATED");
  });

  server.begin();
  Serial.println(F("\n--- SYSTEM OPERATIONAL ---"));
}

void loop() {
  server.handleClient(); 

  if (sim800l.available() > 0) {
    String incomingMsg = sim800l.readString();
    Serial.println(F("\n=== INCOMING SMS RECEIVED ==="));
    Serial.println(incomingMsg);
    Serial.println(F("=============================\n"));
  }

  if (triggerSMS) {
    Serial.println(F("[POWER] Waiting 2 seconds for voltage to stabilize..."));
    smartDelay(2000); 
    sendSmsAlert(smsMessage);
    triggerSMS = false; 
  }

  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeStringBuff[10];
    strftime(timeStringBuff, sizeof(timeStringBuff), "%H:%M", &timeinfo);
    String currentTime = String(timeStringBuff);

    if (millis() - lastTimePrint > 10000) {
      Serial.printf("[HEARTBEAT] Time: %s | IP: %s | Food: %d%% | Status: %s\n",
                     currentTime.c_str(),
                     WiFi.localIP().toString().c_str(),
                     currentFoodLevel,
                     maintenanceMode ? "LOCKED" : "READY");
      lastTimePrint = millis();
    }

    if ((sched1Active && currentTime == schedule1) || (sched2Active && currentTime == schedule2)) {
      if (timeinfo.tm_min != lastFedMinute) {
        if (!maintenanceMode) {
          feedFish();
          lastFedMinute = timeinfo.tm_min; 
        } else {
          Serial.println(F("[BLOCK] Scheduled feed skipped: Maintenance Mode is ON."));
          lastFedMinute = timeinfo.tm_min; 
        }
      }
    }
  }
}
