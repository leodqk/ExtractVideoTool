import os
import logging
from flask import Flask
from flask_cors import CORS
import google.generativeai as genai
from config import GEMINI_API_KEY

# Initialize the Flask application
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)

# Register all routes
from routes import register_routes
register_routes(app)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
