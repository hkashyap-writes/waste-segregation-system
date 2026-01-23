import requests
import json
import time

# NOTE: This API Key is empty as Canvas will provide it at runtime. 
# Do not fill this in.
API_KEY = "" 
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/"
MODEL_NAME = "gemini-2.5-flash"

# Expose 'tools' as a placeholder for the import in app.py
tools = None

def generateContent(model, contents, system_instruction, config, tools=None):
    """
    Makes a POST request to the Gemini generateContent endpoint.
    Handles JSON structure, system instructions, and exponential backoff.
    """
    
    # Check if contents is a string and wrap it if necessary
    if isinstance(contents, str):
        contents = [{"parts": [{"text": contents}]}]

    payload = {
        "contents": contents,
        "config": config,
    }
    
    # Add system instruction if provided
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    
    # Add tools (for Google Search grounding) if provided
    if tools:
        payload["tools"] = tools

    url = f"{BASE_URL}{model}:generateContent?key={API_KEY}"
    
    max_retries = 5
    delay = 1  # Initial delay in seconds

    for attempt in range(max_retries):
        try:
            response = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload), timeout=15)
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            
            result = response.json()
            
            # The structure for a JSON output is result.candidates[0].content.parts[0].text
            if result.get('candidates') and result['candidates'][0].get('content') and result['candidates'][0]['content'].get('parts'):
                # Wrap the raw JSON string in a mock response object
                class MockResponse:
                    def __init__(self, text):
                        self.text = text
                
                # The response text will be the raw JSON output from the model
                return MockResponse(result['candidates'][0]['content']['parts'][0]['text'])

        except requests.exceptions.RequestException as e:
            print(f"API Request Failed (Attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2  # Exponential backoff
            else:
                raise

    # Should only be reached if all retries fail
    raise Exception("Gemini API request failed after multiple retries.")


# Export the necessary functions/classes
__all__ = ['generateContent', 'tools']
