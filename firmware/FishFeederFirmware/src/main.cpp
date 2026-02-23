#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ==========================================
//  1. YOUR SETTINGS (FILL THESE IN!)
// ==========================================
const char* WIFI_SSID = "Converge_2.4GHz_2dGd";
const char* WIFI_PASS = "5kYyNqxE";
const String SUPABASE_URL = "https://pcwmgpziyybcqmrdzvhe.supabase.co"; 
const String SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd21ncHppeXliY3FtcmR6dmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTg4OTQsImV4cCI6MjA4NDk5NDg5NH0.43I0rP6zAD4g2LQG2Tyj1JCESVp_6zgAnlcoE42qSpc";

// ==========================================
//  2. WIRING CONFIG (ESP32-CAM)
// ==========================================
// We use these pins because they don't interfere with the boot process
const int SERVO_PIN = 14;  // Connect Servo Orange Wire here
const int TRIG_PIN  = 12;  // Connect Sensor Trig here
const int ECHO_PIN  = 13;  // Connect Sensor Echo here
const int FLASH_LED = 4;   // Status Light

// ==========================================
//  3. VARIABLES
// ==========================================
Servo myservo;
const int CONTAINER_HEIGHT = 20; // Height of your bottle in cm

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector
  Serial.begin(115200);

  // Setup Components
  myservo.setPeriodHertz(50); 
  myservo.attach(SERVO_PIN, 1000, 2000);
  myservo.write(0); // Start Closed
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLASH_LED, OUTPUT);

  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nONLINE! IP: " + WiFi.localIP().toString());
  
  // Blink once to show success
  digitalWrite(FLASH_LED, HIGH); delay(200); digitalWrite(FLASH_LED, LOW);
}

// --- HELPER: Measure Distance ---
int getDistance() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  return duration * 0.034 / 2;
}

// --- HELPER: Dispense Food ---
void dispenseFood() {
  Serial.println(">>> FEEDING TIME! <<<");
  digitalWrite(FLASH_LED, HIGH); // Light on
  
  myservo.write(90); // Open
  delay(1000);       // Wait
  myservo.write(0);  // Close
  
  digitalWrite(FLASH_LED, LOW); // Light off
}

// --- HELPER: Check Supabase for Commands ---
void checkCommands() {
  if(WiFi.status() == WL_CONNECTED){
    HTTPClient http;
    // URL to find PENDING commands
    String url = SUPABASE_URL + "/rest/v1/command_queue?status=eq.PENDING&select=*";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
    
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      if (payload != "[]") { // If we got a command
        // Parse the ID
        int idStart = payload.indexOf("\"id\":") + 5;
        int idEnd = payload.indexOf(",", idStart);
        String id = payload.substring(idStart, idEnd);

        // Perform Action
        dispenseFood();
          
        // Mark as PROCESSED in Database
        http.end(); 
        HTTPClient updateHttp;
        updateHttp.begin(SUPABASE_URL + "/rest/v1/command_queue?id=eq." + id);
        updateHttp.addHeader("apikey", SUPABASE_KEY);
        updateHttp.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
        updateHttp.addHeader("Content-Type", "application/json");
        updateHttp.PATCH("{\"status\": \"PROCESSED\"}");
        updateHttp.end();
      }
    }
    http.end();
  }
}

// --- HELPER: Upload Sensor Data ---
void uploadData(int level) {
  if(WiFi.status() == WL_CONNECTED){
    HTTPClient http;
    http.begin(SUPABASE_URL + "/rest/v1/sensor_logs");
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal"); 

    String json = "{\"food_level\": " + String(level) + "}";
    http.POST(json);
    http.end();
    Serial.println("Data sent: " + String(level) + "%");
  }
}

void loop() {
  // 1. Check for commands constantly
  checkCommands();

  // 2. Read Sensor & Upload (Every 10 seconds)
  static unsigned long lastUpload = 0;
  if (millis() - lastUpload > 10000) {
    lastUpload = millis();
    
    int dist = getDistance();
    // Calculate percentage (Inverted: High distance = Empty)
    // If distance is 0 (sensor error), ignore it
    if (dist > 0 && dist < 100) {
      int level = map(dist, 0, CONTAINER_HEIGHT, 100, 0); 
      level = constrain(level, 0, 100); 
      uploadData(level);
    }
  }
  
  delay(1000);
}