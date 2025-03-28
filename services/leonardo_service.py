import os
import logging
import requests
from config import get_leonardo_api_key

def generate_leonardo_image(prompt):
    """Generate an image using Leonardo.ai API"""
    try:
        # Get Leonardo.ai API key
        api_key = get_leonardo_api_key()
        if not api_key:
            raise Exception('Leonardo.ai API key not configured. Please set LEONARDO_API_KEY in your environment.')
        
        # Leonardo.ai Generation API endpoint
        url = "https://cloud.leonardo.ai/api/rest/v1/generations"
        
        # Set up headers
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}"
        }
        
        # Set up the request payload with parameters for the image generation
        payload = {
            "prompt": prompt,
            "modelId": "b2614463-296c-462a-9586-aafdb8f00e36",  # Leonardo Creative model
            "width": 832,
            "height": 1472,
            "styleUUID": "111dc692-d470-4eec-b791-3475abac4c46",
            "num_images": 1,
            "public": False
        }
        
        # Call the Leonardo.ai API
        response = requests.post(url, json=payload, headers=headers)
        response_data = response.json()
        
        if response.status_code != 200:
            logging.error(f"Leonardo.ai API error: {response_data}")
            raise Exception(f"Error calling Leonardo.ai API: {response_data.get('error', 'Unknown error')}")
        
        # The response contains a generation ID which we need to poll to get the generated images
        generation_id = response_data.get('sdGenerationJob', {}).get('generationId')
        
        if not generation_id:
            raise Exception('No generation ID returned from Leonardo.ai')
        
        return {
            'success': True,
            'message': 'Image generation started',
            'generation_id': generation_id
        }
        
    except Exception as e:
        logging.error(f"Error generating image with Leonardo.ai: {str(e)}")
        raise

def get_leonardo_generation_status(generation_id):
    """Get the status of a Leonardo.ai generation"""
    try:
        # Get Leonardo.ai API key
        api_key = get_leonardo_api_key()
        if not api_key:
            raise Exception('Leonardo.ai API key not configured. Please set LEONARDO_API_KEY in your environment.')
        
        # Leonardo.ai API endpoint for checking generation status
        url = f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}"
        
        # Set up headers
        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {api_key}"
        }
        
        # Call the Leonardo.ai API to check generation status
        response = requests.get(url, headers=headers)
        response_data = response.json()
        
        if response.status_code != 200:
            logging.error(f"Leonardo.ai API error when checking status: {response_data}")
            raise Exception(f"Error checking generation status: {response_data.get('error', 'Unknown error')}")
        
        # Extract generation data
        generation_data = response_data.get('generations_by_pk', {})
        status = generation_data.get('status', '')
        
        # If the generation is not complete yet
        if status != 'COMPLETE':
            return {
                'success': True,
                'status': status,
                'complete': False,
                'message': f'Generation is in progress: {status}'
            }
        
        # Get the generated images
        generated_images = generation_data.get('generated_images', [])
        
        if not generated_images:
            raise Exception('No images generated')
        
        # Extract image data
        image_data = []
        for img in generated_images:
            image_data.append({
                'id': img.get('id'),
                'url': img.get('url'),
                'nsfw': img.get('nsfw', False)
            })
        
        return {
            'success': True,
            'status': status,
            'complete': True,
            'images': image_data,
            'prompt': generation_data.get('prompt', ''),
            'width': generation_data.get('imageWidth'),
            'height': generation_data.get('imageHeight')
        }
        
    except Exception as e:
        logging.error(f"Error getting Leonardo.ai generation status: {str(e)}")
        raise
