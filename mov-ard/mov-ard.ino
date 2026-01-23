#include <Arduino.h>
#include <AccelStepper.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WebServer.h>
#include <EEPROM.h>

const char* ssid = "WASTE SEGREGATION SYSTEM";    
const char* password = "wss@1234"; 
WebServer server(80); 

#define SERVO_PIN 25       

#define STEPPER_PIN1 14
#define STEPPER_PIN2 27
#define STEPPER_PIN3 26
#define STEPPER_PIN4 33

#define EEPROM_ADDR_METAL_POS 0
#define EEPROM_ADDR_LAST_POS  4
#define EEPROM_SIZE 8 

Servo flapServo;
AccelStepper stepper(AccelStepper::FULL4WIRE, STEPPER_PIN1, STEPPER_PIN3, STEPPER_PIN2, STEPPER_PIN4);

long binPositions[3] = {0, 650, -650};
int currentBin = 0; 
const long STEPS_PER_REVOLUTION = 1950;

void handleSort(); 
void connectToWiFi();
void moveToBin(String wasteCode);
void openFlap(String binName);
void smoothMoveServo(int from, int to, int stepDelay);


void smoothMoveServo(int from, int to, int stepDelay) {
    if (from < to) {
        for (int pos = from; pos <= to; pos++) {
            flapServo.write(pos);
            delay(stepDelay);
        }
    } else {
        for (int pos = from; pos >= to; pos--) {
            flapServo.write(pos);
            delay(stepDelay);
        }
    }
}

void openFlap(String binName) {
    Serial.print("Opening flap slowly -> "); Serial.println(binName);
    smoothMoveServo(0, 90, 10);   
    delay(2000);      
    smoothMoveServo(90, 0, 10);   
    Serial.println("Flap closed.\n");
}


void moveToBin(String wasteCode) {
    long targetPos = 0;
    String binName = "";

    if (wasteCode == "M") { 
        targetPos = binPositions[0]; 
        binName = "Metal Bin"; 
    }
    else if (wasteCode == "N") {
        targetPos = binPositions[1]; 
        binName = "Non-Bio Bin (Dry)"; 
    } 
    else if (wasteCode == "B") {
        targetPos = binPositions[2]; 
        binName = "Biodegradable Bin";
    } else {
        Serial.println("Error: Invalid waste code.");
        return;
    }
    
    Serial.print("Rotating stepper to -> "); Serial.println(binName);

    stepper.setMaxSpeed(50);     
    stepper.setAcceleration(25); 
    long currentPos = stepper.currentPosition();
    long diff = targetPos - currentPos;

    long altDiff;
    if (diff > 0) {
        altDiff = diff - STEPS_PER_REVOLUTION; 
    } else {
        altDiff = diff + STEPS_PER_REVOLUTION; 
    }
    long stepsToMove;
    if (abs(diff) <= abs(altDiff)) {
        stepsToMove = diff;
    } else {
        stepsToMove = altDiff;
    }

    Serial.print("Current: "); Serial.print(currentPos);
    Serial.print(" Target: "); Serial.print(targetPos);
    Serial.print(" Steps: "); Serial.println(stepsToMove);

    stepper.move(stepsToMove); 
    while (stepper.distanceToGo() != 0) {
        stepper.run();
    }

    delay(300);

    currentPos = stepper.currentPosition();
    EEPROM.put(EEPROM_ADDR_LAST_POS, currentPos); 
    if (EEPROM.commit()) {     
        Serial.print("Saved LAST position to EEPROM: "); Serial.println(currentPos);
    } else {
        Serial.println("ERROR: Failed to save LAST position to EEPROM!");
    }
    
    Serial.println("Object confirmed. Opening flap...");
    delay(4000); 
    openFlap(binName);

    Serial.println("Cycle complete.\n");
}

void connectToWiFi() {
  Serial.println();
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA); 
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected Successfully!");
    Serial.print("Local IP address: ");
    Serial.println(WiFi.localIP()); 
  } else {
    Serial.println("\n!!! WiFi Connection FAILED !!!");
  }
}

void handleSort() {
  if (server.hasArg("type")) {
    String wasteCode = server.arg("type"); 
    wasteCode.toUpperCase();
    
    Serial.print("Network Command Received (AI Result): ");
    Serial.println(wasteCode);

    moveToBin(wasteCode); 

    server.send(200, "text/plain", "Sort command executed.");
  } else {
    server.send(400, "text/plain", "Error: Missing 'type' parameter.");
  }
}


void handleSensorData() {
  
  String jsonResponse = "{}"; 
  server.send(200, "application/json", jsonResponse);
}


void setup() {
    Serial.begin(115200);
    EEPROM.begin(EEPROM_SIZE);

    flapServo.attach(SERVO_PIN);
    flapServo.write(0); 

    connectToWiFi();
    server.on("/sort", HTTP_GET, handleSort); 
    server.on("/data", HTTP_GET, handleSensorData); 
    server.begin();

    stepper.setMaxSpeed(50); 
    stepper.setAcceleration(25); 

    long metalBinSavedPos;
    long lastKnownPos;
    EEPROM.get(EEPROM_ADDR_METAL_POS, metalBinSavedPos);
EEPROM.get(EEPROM_ADDR_LAST_POS, lastKnownPos);  

    Serial.print("DEBUG: Value read from EEPROM address ");
    Serial.print(EEPROM_ADDR_METAL_POS);
    Serial.print(" = ");
    Serial.println(metalBinSavedPos);

    bool metalPosIsValid = (abs(metalBinSavedPos) < 5000); 
    bool lastPosIsValid = (abs(lastKnownPos) < 5000); 

    if (metalPosIsValid) {
        binPositions[0] = metalBinSavedPos; 

        if (lastPosIsValid) {
            stepper.setCurrentPosition(lastKnownPos);
            Serial.print("Restored position from EEPROM: "); Serial.println(lastKnownPos);
        } else {
            stepper.setCurrentPosition(metalBinSavedPos);
             Serial.println("Last position invalid, assuming start at Metal pos.");
        }

        Serial.println("Moving to Metal bin position...");
        stepper.moveTo(binPositions[0]);
        while (stepper.distanceToGo() != 0) stepper.run();
        stepper.setCurrentPosition(binPositions[0]); 
        Serial.println("Stepper positioned at Metal bin.");

    } else {
      Serial.println("No valid Metal bin position found in EEPROM.");
      Serial.println("Starting Manual Alignment...");
      Serial.println("Use 'a' to move left, 'd' to move right, 's' to save Metal bin position");

      stepper.setCurrentPosition(0); 

      while (true) { 
          if (Serial.available()) { 
              char cmd = Serial.read(); 

              if (cmd == 'a') stepper.move(-10);
              if (cmd == 'd') stepper.move(10);
              
              if (cmd == 's') { 
                  binPositions[0] = stepper.currentPosition(); 
                  
                  EEPROM.put(EEPROM_ADDR_METAL_POS, binPositions[0]); 
                  if (EEPROM.commit()) {
                       Serial.print("Metal bin position SAVED to EEPROM: ");
                       Serial.println(binPositions[0]);
                  } else {
                       Serial.println("ERROR: Failed to save Metal position to EEPROM!");
                  }

                  EEPROM.put(EEPROM_ADDR_LAST_POS, binPositions[0]); 
                  if (EEPROM.commit()) {
                       Serial.print("Also saved as LAST position to EEPROM: ");
                       Serial.println(binPositions[0]);
                  } else {
                       Serial.println("ERROR: Failed to save LAST position to EEPROM!");
                  }
                  
                  break; 
              } 
              while (Serial.available() > 0) { Serial.read(); } 
          } 
          
          stepper.run(); 

          static unsigned long lastPrintTime = 0;
          if (millis() - lastPrintTime > 200) {
              Serial.print("Current Position for Alignment: ");
              Serial.println(stepper.currentPosition());
              lastPrintTime = millis();
          }
      } 

      Serial.println("Moving to confirmed Metal bin position...");
      stepper.moveTo(binPositions[0]); 
      while (stepper.distanceToGo() != 0) stepper.run();
      stepper.setCurrentPosition(binPositions[0]); 
      Serial.println("Stepper positioned at Metal bin after alignment.");
  } 

    binPositions[1] = binPositions[0] + 650;
    binPositions[2] = binPositions[0] - 650;

    Serial.println("Bin positions calculated.");
    Serial.println("Stepper and Server Ready!\n");
}



void loop() {
    server.handleClient(); 
    stepper.run();  

    if (Serial.available() > 0) {
        char receivedChar = Serial.read(); 
        String command = String(receivedChar); 
        command.toUpperCase(); 
        if (command == "M" || command == "B" || command == "N") {
            Serial.print("Manual Command Received: ");
            Serial.println(command);
            moveToBin(command); 
        } else if (command == "S") { 
        long currentPos = stepper.currentPosition();
        binPositions[0] = currentPos; 

        EEPROM.put(EEPROM_ADDR_METAL_POS, currentPos); 
        if (EEPROM.commit()) {
            Serial.print("Manually SAVED Metal bin position to EEPROM: ");
            Serial.println(currentPos);
            binPositions[1] = binPositions[0] + 650; 
            binPositions[2] = binPositions[0] - 650; 
            Serial.println("Relative bin positions recalculated.");
        } else {
            Serial.println("ERROR: Failed to save position to EEPROM!");
        }
    }
        else {
            Serial.println("Invalid manual command. Use M, B, or N.");
        }
        while (Serial.available() > 0) {
          Serial.read();
        }
    }    
}