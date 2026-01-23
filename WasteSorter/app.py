from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import vision
import base64
import requests
import os
import random 
import json 
import time
import datetime

app = Flask(__name__)
CORS(app) 

KEY_FILE_NAME = 'quantum-vista-476115-u0-ac5b5ede5720.json' 
ESP32_IP = "192.168.137.16" 
NODE_SERVER_URL = "http://localhost:3001"

try:
    client = vision.ImageAnnotatorClient.from_service_account_json(KEY_FILE_NAME)
except Exception as e:
    print(f"CRITICAL AUTH ERROR: Check your KEY_FILE_NAME. Details: {e}")
    client = None


def send_log_to_node_server(log_data):
    """Sends the detailed log entry to the Node.js server."""
    if not NODE_SERVER_URL:
        print("ERROR: NODE_SERVER_URL is not set.")
        return
    try:
        url = f"{NODE_SERVER_URL}/api/log-entry" 
        response = requests.post(url, json=log_data, timeout=45)
        response.raise_for_status()
        print(f"SUCCESS: Sent log entry to Node.js server: {log_data}")
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Could not send log to Node.js server. Details: {e}")

def send_to_esp32(code):
    """Sends the sorting command (M, B, N) to the ESP32's HTTP server."""
    if not ESP32_IP:
        print("ERROR: ESP32_IP is not set.")
        return False
        
    try:
        url = f"http://{ESP32_IP}/sort?type={code}"
        response = requests.get(url, timeout=45)
        response.raise_for_status()
        print(f"SUCCESS: Sent command '{code}' to ESP32 at {ESP32_IP}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Could not communicate with ESP32 (network/timeout). Details: {e}")
        return False


def classify_waste(labels):
    """Translates generic API labels into M, B, or N categories based on priority."""
    labels_string = ' '.join(labels).lower()
    
    metal_keywords = ['metal', 'can', 'aluminum', 'steel', 'tin', 'utensil']
    if any(keyword in labels_string for keyword in metal_keywords):
        return 'M' 

    biodegradable_keywords = ['food', 'fruit', 'vegetable', 'peel', 'scrap', 'compost', 'paper', 'cardboard']
    if any(keyword in labels_string for keyword in biodegradable_keywords):
        return 'B' 

    return 'N' 

MOCK_FILL_LEVELS = {'fill_m': 5, 'fill_b': 10, 'fill_n': 8} 

def get_simulated_sensor_data(waste_type_code, object_name):
    """Generates realistic, dynamically fluctuating sensor data based on classification."""
    
    if waste_type_code == 'M':
        data = {
            "moisture": random.randint(950, 1150), "gas": random.randint(100, 200), "metal": "Y", 
            "object_name": object_name
        }
    elif waste_type_code == 'B':
        data = {
            "moisture": random.randint(3700, 3950), "gas": random.randint(700, 850), "metal": "N", 
            "object_name": object_name
        }
    else: # 'N'
        data = {
            "moisture": random.randint(1400, 1700), "gas": random.randint(250, 400), "metal": "N", 
            "object_name": object_name
        }

    data.update(MOCK_FILL_LEVELS) 
    
    return data


@app.route('/reset-bins', methods=['POST'])
def reset_bins_endpoint():
    """MOCK: Resets the bin levels display to zero."""
    # Since we are not tracking volume anymore, we just return a status.
    global MOCK_FILL_LEVELS
    MOCK_FILL_LEVELS = {'fill_m': 0, 'fill_b': 0, 'fill_n': 0}
    
    # Force the simulated sensor reading to update with the reset status
    setattr(sensor_simulation_endpoint, 'last_classification_result', {'code': 'N', 'name': 'System Reset'})
    return jsonify({'status': 'Bins successfully reset to 0% fill.'})


@app.route('/sensor-simulation', methods=['GET'])
def sensor_simulation_endpoint():
    """Returns simulated sensor data based on the last classified object."""
    
    last_result = getattr(sensor_simulation_endpoint, 'last_classification_result', {'code': 'N', 'name': 'Plastic Bottle'})
    
    response_data = get_simulated_sensor_data(last_result['code'], last_result['name'])
    
    return jsonify(response_data)



@app.route('/process-image', methods=['POST'])
def process_image():
    if not client:
        return jsonify({'error': 'Vision client failed to initialize'}), 500
    if not request.json or 'image' not in request.json:
        return jsonify({'error': 'No image data provided'}), 400

    try:
        base64_img = request.json['image'].split(',')[1] 
        image_bytes = base64.b64decode(base64_img)
    except Exception as e:
        return jsonify({'error': f'Image decoding failed: {e}'}), 400

    image = vision.Image(content=image_bytes)
    response = client.annotate_image(
        request={
            'image': image, 
            "features": [
                vision.Feature(type=vision.Feature.Type.LABEL_DETECTION),
                vision.Feature(type=vision.Feature.Type.WEB_DETECTION)
            ]
        }
    )
    
    best_guess = "Unknown Waste"
    if response.web_detection and response.web_detection.best_guess_labels:
        best_guess = response.web_detection.best_guess_labels[0].label
        
    all_labels = [label.description for label in response.label_annotations]
    all_labels.append(best_guess)
    
    waste_type_code = classify_waste(all_labels) 

    setattr(sensor_simulation_endpoint, 'last_classification_result', {'code': waste_type_code, 'name': best_guess})
    
    send_to_esp32(waste_type_code)

    simulated_data = get_simulated_sensor_data(waste_type_code, best_guess)

    category_to_binId_node = {'M': 'metal', 'B': 'bio', 'N': 'nonbio'}
    bin_id_for_node = category_to_binId_node.get(waste_type_code, 'nonbio')

    log_entry_for_node = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "binId": bin_id_for_node,
        "metal": simulated_data['metal'] == "Y",
        "moisture": simulated_data['moisture'],
        "gas": simulated_data['gas'],
        "detectedObject": simulated_data['object_name']
    }
    send_log_to_node_server(log_entry_for_node) 

    return jsonify({
        'waste_type': waste_type_code, 
        'raw_labels': all_labels,
        'simulated_moisture': simulated_data['moisture'], 
        'simulated_gas': simulated_data['gas'],
        'simulated_metal': simulated_data['metal'] == "Y",
        'detected_object': simulated_data['object_name']
    })


if __name__ == '__main__':
    setattr(sensor_simulation_endpoint, 'last_classification_result', {'code': 'N', 'name': 'Plastic Bottle'})
    
    print(f"Starting Flask server. Listening for website requests on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
