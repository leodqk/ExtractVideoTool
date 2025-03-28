from flask import request, jsonify
import os
import logging
from werkzeug.utils import secure_filename
from config import UPLOAD_FOLDER, ALLOWED_EXTENSIONS, keyframesData
from utils.file_utils import allowed_file
from utils.video_utils import download_video_from_url
from services.audio_service import extract_audio_from_video, transcribe_audio
from services.azure_service import process_azure_video

def register_azure_routes(app):
    @app.route('/azure-credentials', methods=['GET'])
    def get_azure_credentials():
        try:
            # Get credentials from environment variables
            api_key = os.getenv("AZURE_VIDEO_INDEXER_API_KEY", "")
            account_id = os.getenv("AZURE_VIDEO_INDEXER_ACCOUNT_ID", "")
            location = os.getenv("AZURE_VIDEO_INDEXER_LOCATION", "trial")
            
            # Mask API key for security
            masked_api_key = "********" if api_key else ""
            
            return jsonify({
                'api_key': masked_api_key,
                'account_id': account_id,
                'location': location,
                'has_credentials': bool(api_key and account_id)
            })
        except Exception as e:
            logging.error(f"Error getting Azure credentials: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/test-azure-connection', methods=['POST'])
    def test_azure_connection():
        """Test connection to Azure Video Indexer by getting an access token"""
        try:
            from services.azure_service import get_azure_access_token
            import requests
            
            # Get credentials from request or environment variables
            data = request.json or {}
            api_key = data.get('api_key') or os.getenv("AZURE_VIDEO_INDEXER_API_KEY", "")
            account_id = data.get('account_id') or os.getenv("AZURE_VIDEO_INDEXER_ACCOUNT_ID", "")
            location = data.get('location') or os.getenv("AZURE_VIDEO_INDEXER_LOCATION", "trial")
            
            # Check if credentials are provided
            if not api_key or not account_id:
                return jsonify({
                    'success': False,
                    'error': 'Missing Azure Video Indexer credentials. Please provide api_key and account_id.'
                }), 400
            
            # Try to get an access token
            try:
                access_token = get_azure_access_token(api_key, account_id, location)
                
                # Check if we can list videos (optional)
                url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos"
                params = {"accessToken": access_token}
                
                response = requests.get(url, params=params)
                if response.status_code == 200:
                    videos_count = len(response.json().get('results', []))
                    
                    return jsonify({
                        'success': True,
                        'message': 'Successfully connected to Azure Video Indexer',
                        'videos_count': videos_count,
                        'location': location,
                        'account_id': account_id
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': f"Could not list videos: {response.text}"
                    }), 500
                    
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f"Error getting access token: {str(e)}"
                }), 500
                
        except Exception as e:
            logging.error(f"Error testing Azure connection: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/process-video-azure', methods=['POST'])
    def process_video_azure():
        try:
            # Get parameters from request
            api_key = request.form.get('api_key', '')
            account_id = request.form.get('account_id', '')
            location = request.form.get('location', 'trial')
            language = request.form.get('language', 'vi-VN')
            
            # Get options
            force_upload = request.form.get('force_upload', 'false') == 'true'
            use_existing_analysis = request.form.get('use_existing_analysis', 'true') == 'true'
            extract_audio = request.form.get('extract_audio', 'true') == 'true'
            save_images = request.form.get('save_images', 'true') == 'true'
            
            # Get video source (file upload or URL)
            video_path = None
            temp_video_path = None
            
            # Check if video is from URL
            video_url = request.form.get('video_url', '')
            if video_url:
                try:
                    # Download video from URL
                    video_info = download_video_from_url(video_url)
                    video_path = video_info['path']
                except Exception as e:
                    return jsonify({'error': str(e)}), 500
            else:
                # Process direct file upload
                if 'video' not in request.files:
                    return jsonify({'error': 'No video found'}), 400
                    
                file = request.files['video']
                
                if file.filename == '':
                    return jsonify({'error': 'No file selected'}), 400
                    
                if not allowed_file(file.filename, ALLOWED_EXTENSIONS):
                    return jsonify({'error': 'File format not supported'}), 400
                    
                # Save temporary file
                filename = secure_filename(file.filename)
                video_path = os.path.join(UPLOAD_FOLDER, filename)
                file.save(video_path)
            
            # Create save path for images - use the same KEYFRAMES_FOLDER as method 1
            from config import KEYFRAMES_FOLDER
            save_path = KEYFRAMES_FOLDER
            
            # Process video with Azure Video Indexer
            result = process_azure_video(
                video_path, 
                api_key, 
                account_id, 
                location, 
                language,
                force_upload, 
                use_existing_analysis, 
                False,  # Set extract_audio to False for Azure
                save_images, 
                save_path
            )
            
            # Add filename to the result
            result['filename'] = os.path.basename(video_path)
            
                        # Create a session ID for this video (for transcript access)
            from utils.file_utils import get_video_name_without_extension, create_safe_session_id
            video_name = get_video_name_without_extension(video_path)
            session_id = create_safe_session_id(video_name)
            
            # Update session_id based on the saved folder if available
            if 'saved_folder' in result:
                # Extract session ID from the saved folder path
                session_folder = result['saved_folder']
                if session_folder:
                    session_id = os.path.basename(session_folder)
            
            result['session_id'] = session_id
            
            # Use the regular audio extraction method if requested
            if extract_audio:
                try:
                    # Extract audio
                    audio_result = extract_audio_from_video(video_path)
                    result['audio'] = audio_result
                    
                    # Transcribe
                    transcript_result = transcribe_audio(audio_result['path'], session_id)
                    result['transcript'] = transcript_result
                except Exception as audio_error:
                    logging.error(f"Error processing audio: {str(audio_error)}")
                    result['audio_error'] = str(audio_error)
            
            return jsonify(result)
            
        except Exception as e:
            logging.error(f"Error in Azure video processing: {str(e)}")
            return jsonify({'error': str(e)}), 500
