#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>
#include <NewPing.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// Firebase credentials
#define FIREBASE_API_KEY "fill it up"
#define DATABASE_URL "fill it up"

// Wi-Fi credentials
const char* SSID = "fill it up";
const char* WIFIPASS = "fill it up";

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// DHT11 setup
#define DHTPIN 15
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// Ultrasonic setup
#define TRIG_PIN 4
#define ECHO_PIN 2
#define MAX_DISTANCE 200
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);

// Water flow sensor setup
#define FLOW_PIN 5
volatile unsigned long flowCount = 0;
unsigned long oldTime = 0;
const float calibrationFactor = 7.5; // Pulses per liter

// LED indicators
#define WIFI_LED_PIN 13
#define FIREBASE_LED_PIN 12

// Constants 
const unsigned long SENSOR_INTERVAL = 5000;  // Read sensors every 5 seconds
const unsigned long RECONNECT_TIMEOUT = 20000; // 20 seconds timeout for connections
const int MAX_RETRIES = 3;  // Maximum number of retries for sensor readings

// Last successful time for different operations
unsigned long lastSensorReadTime = 0;

// ISR for flow sensor
void IRAM_ATTR countPulse() {
  flowCount = flowCount + 1; // Using direct assignment instead of ++ to avoid volatile warning
}

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(FLOW_PIN, INPUT_PULLUP);
  pinMode(WIFI_LED_PIN, OUTPUT);
  pinMode(FIREBASE_LED_PIN, OUTPUT);
  digitalWrite(WIFI_LED_PIN, LOW);
  digitalWrite(FIREBASE_LED_PIN, LOW);
  
  Serial.println("\nFlood Detection System Starting...");
  
  // Start sensors
  dht.begin();
  
  // Attach interrupt for flow sensor
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), countPulse, RISING);
  
  // Connect to Wi-Fi
  connectWiFi();
  
  // Initialize Firebase
  initFirebase();
  
  // Store startup time
  oldTime = millis();
  lastSensorReadTime = millis();
}

void loop() {
  // Handle WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Reconnecting...");
    digitalWrite(WIFI_LED_PIN, LOW);
    connectWiFi();
  }
  
  // Reconnect Firebase if needed
  if (!Firebase.ready() && WiFi.status() == WL_CONNECTED) {
    Serial.println("Firebase not connected. Attempting to reconnect...");
    digitalWrite(FIREBASE_LED_PIN, LOW);
    initFirebase();
  }
  
  // Read and send sensor data at regular intervals
  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = currentMillis;
    
    // Read sensor data and upload if successful
    float humidity, temperature, distance, flowRate;
    if (readSensorData(&humidity, &temperature, &distance, &flowRate)) {
      uploadToFirebase(humidity, temperature, distance, flowRate);
    }
  }
  
  // Yield to avoid watchdog timer resets
  yield();
}

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.print(SSID);
  
  WiFi.begin(SSID, WIFIPASS);
  
  unsigned long startAttemptTime = millis();
  
  // Try connecting with timeout
  while (WiFi.status() != WL_CONNECTED && 
         millis() - startAttemptTime < RECONNECT_TIMEOUT) {
    digitalWrite(WIFI_LED_PIN, !digitalRead(WIFI_LED_PIN)); // Toggle LED
    Serial.print(".");
    delay(500);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(WIFI_LED_PIN, HIGH); // LED on when connected
    Serial.println("\nConnected to Wi-Fi!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    digitalWrite(WIFI_LED_PIN, LOW);
    Serial.println("\nWi-Fi connection failed! Will retry later.");
    // Power cycle WiFi to try to fix connection issues
    WiFi.disconnect();
    delay(1000);
  }
}

void initFirebase() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot initialize Firebase: WiFi not connected");
    return;
  }
  
  Serial.println("Initializing Firebase...");
  config.api_key = FIREBASE_API_KEY;
  config.database_url = DATABASE_URL;
  
  // Assign the callback function for token generation
  config.token_status_callback = tokenStatusCallback;
  
  // Firebase authentication
  auth.user.email = "fill it up";
  auth.user.password = "fill it up";
  
  // Initialize Firebase
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  // Wait for authentication with timeout
  Serial.println("Waiting for Firebase authentication...");
  unsigned long authStartTime = millis();
  
  while (!Firebase.ready() && millis() - authStartTime < RECONNECT_TIMEOUT) {
    Serial.print(".");
    delay(500);
  }
  
  if (Firebase.ready()) {
    Serial.println("\nFirebase authenticated!");
    digitalWrite(FIREBASE_LED_PIN, HIGH);
  } else {
    Serial.println("\nFirebase authentication failed. Will retry later.");
    digitalWrite(FIREBASE_LED_PIN, LOW);
  }
}

bool readSensorData(float *humidity, float *temperature, float *distance, float *flowRate) {
  bool success = true;
  
  // Read DHT11 sensor
  *humidity = dht.readHumidity();
  *temperature = dht.readTemperature();
  
  if (isnan(*humidity) || isnan(*temperature)) {
    Serial.println("Error reading from DHT sensor!");
    success = false;
  } else {
    Serial.printf("Temperature: %.2f°C, Humidity: %.2f%%\n", *temperature, *humidity);
  }
  
  // Read ultrasonic sensor with retries
  *distance = 0;
  for (int i = 0; i < MAX_RETRIES; i++) {
    float reading = sonar.ping_cm();
    if (reading > 0) {
      *distance = reading;
      Serial.printf("Distance: %.2f cm\n", *distance);
      break;
    }
    delay(50);
  }
  
  if (*distance == 0) {
    Serial.println("Error reading distance sensor after multiple attempts!");
    success = false;
  }
  
  // Calculate flow rate
  unsigned long currentTime = millis();
  float elapsedTime = (currentTime - oldTime) / 1000.0; // Convert to seconds
  
  // Calculate flow rate (L/min)
  if (elapsedTime > 0) {
    *flowRate = (flowCount / calibrationFactor) * (60 / elapsedTime); // L/min
    Serial.printf("Flow Rate: %.2f L/min\n", *flowRate);
  } else {
    *flowRate = 0;
    success = false;
  }
  
  // Reset counters
  flowCount = 0;
  oldTime = currentTime;
  
  return success;
}

void uploadToFirebase(float humidity, float temperature, float distance, float flowRate) {
  if (!Firebase.ready() || WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot upload: Firebase or WiFi not ready");
    return;
  }
  
  Serial.println("Uploading data to Firebase...");
  
  // Create a JSON object for all data at once (more efficient)
  FirebaseJson json;
  
  if (!isnan(temperature)) {
    json.set("temperature", temperature);
  }
  
  if (!isnan(humidity)) {
    json.set("humidity", humidity);
  }
  
  if (distance > 0) {
    json.set("distance_cm", distance);
  }
  
  json.set("flow_rate_lpm", flowRate);
  
  // Upload the entire JSON object in one request
  if (Firebase.RTDB.updateNode(&fbdo, "/sensors", &json)) {
    Serial.println("Data uploaded successfully!");
    digitalWrite(FIREBASE_LED_PIN, HIGH);
  } else {
    Serial.printf("Upload failed: %s\n", fbdo.errorReason().c_str());
    digitalWrite(FIREBASE_LED_PIN, LOW);
  }
}
