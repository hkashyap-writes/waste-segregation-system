import os
from google.cloud import vision

# --- CONFIGURATION ---
# 1. Image File Name (Must match the name of your test image in the same folder)
IMAGE_FILE_NAME = 'test_waste.jpg' 

# 2. Key File Name (Must match the name of the JSON key you downloaded and moved)
KEY_FILE_NAME = 'quantum-vista-476115-u0-ac5b5ede5720.json' 
# ---------------------

def detect_labels(image_path, key_path):
    """Sends a local image to the Google Cloud Vision API for label and web detection."""
    
    # 1. Authenticate the client using the JSON key file directly.
    try:
        client = vision.ImageAnnotatorClient.from_service_account_json(key_path)
    except Exception as e:
        print(f"FATAL ERROR: Could not initialize Vision client. Check the KEY_FILE_NAME.")
        print(f"Details: {e}")
        return

    # 2. Read the image file content
    try:
        with open(image_path, 'rb') as image_file:
            content = image_file.read()
    except FileNotFoundError:
        print(f"FATAL ERROR: Image file '{image_path}' not found.")
        print("Please ensure the image file is in the same folder and named correctly.")
        return

    image = vision.Image(content=content)
    
    print("Authentication successful. Sending image to Google Cloud Vision API...")

    # 3. Define the features for object recognition
    features = [
        vision.Feature(type=vision.Feature.Type.LABEL_DETECTION),
        vision.Feature(type=vision.Feature.Type.WEB_DETECTION)
    ]
    
    # 4. Call the Vision API
    try:
        response = client.annotate_image(
            request={'image': image, 'features': features}
        )
    except Exception as e:
        print(f"ERROR: API call failed. Check your network connection or billing status.")
        print(f"Details: {e}")
        return

    # 5. Process the response and print results
    print('\n--- Labels Detected (General Waste Tags) ---')
    labels = [label.description for label in response.label_annotations]
    for label in response.label_annotations:
        print(f'- {label.description} (Score: {label.score:.2f})')

    if response.web_detection and response.web_detection.best_guess_labels:
        print('\n--- Best Guess Label (Specific Object) ---')
        # This is the "Google Lens" style guess
        print(f'-> {response.web_detection.best_guess_labels[0].label}')
    
    print("\nAPI Test Complete. SUCCESS!")

if __name__ == '__main__':
    # Ensure both config files are in the local folder
    if not os.path.exists(KEY_FILE_NAME):
        print(f"CRITICAL ERROR: The key file '{KEY_FILE_NAME}' was not found in the current directory.")
        print("Please move the JSON key file into the project folder.")
    else:
        detect_labels(IMAGE_FILE_NAME, KEY_FILE_NAME)