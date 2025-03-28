from flask import request, jsonify
import os
import logging
from services.leonardo_service import generate_leonardo_image, get_leonardo_generation_status

def register_gemini_routes(app):
    @app.route('/generate-leonardo-image', methods=['POST'])
    def generate_leonardo_image_route():
        """API endpoint to generate an image using Leonardo.ai API"""
        try:
            data = request.json
            prompt = data.get('prompt')
            
            if not prompt:
                return jsonify({'error': 'Missing prompt'}), 400
            
            # Call the service
            result = generate_leonardo_image(prompt)
            
            return jsonify(result)
            
        except Exception as e:
            logging.error(f"Error generating image with Leonardo.ai: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/get-leonardo-image/<generation_id>', methods=['GET'])
    def get_leonardo_image_route(generation_id):
        """API endpoint to get a generated image from Leonardo.ai using the generation ID"""
        try:
            # Call the service
            result = get_leonardo_generation_status(generation_id)
            
            return jsonify(result)
            
        except Exception as e:
            logging.error(f"Error getting Leonardo.ai generation status: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
