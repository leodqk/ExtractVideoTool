import os
import time
import logging
import cv2
import requests
import tempfile
import shutil
import base64
from utils.file_utils import get_video_name_without_extension, create_safe_session_id, time_to_seconds
from services.azure_video_indexer import AzureVideoIndexer

def process_azure_video(video_path, api_key, account_id, location, language,
                       force_upload=False, use_existing_analysis=True, 
                       extract_audio=True, save_images=True, save_path=""):
    """Process video with Azure Video Indexer"""
    
    try:
        # Create an instance of AzureVideoIndexer
        indexer = AzureVideoIndexer(api_key, account_id, location, language)
        
        # Process the video
        result = indexer.process_video(
            video_path,
            force_upload=force_upload,
            use_existing_analysis=use_existing_analysis,
            extract_audio=extract_audio,
            save_images=save_images,
            save_path=save_path
        )
        
        return result
        
    except Exception as e:
        logging.error(f"Error processing Azure video: {str(e)}")
        raise


def get_azure_access_token(api_key, account_id, location):
    """Get Azure Video Indexer access token"""
    url = f"https://api.videoindexer.ai/auth/{location}/Accounts/{account_id}/AccessToken"
    headers = {"Ocp-Apim-Subscription-Key": api_key}
    params = {"allowEdit": "true"}
    
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Error getting access token: {response.text}")

def check_azure_video_exists(access_token, filename, location, account_id):
    """Check if a video with this name already exists"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos"
    params = {"accessToken": access_token}
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        videos = response.json().get('results', [])
        for video in videos:
            if video.get('name') == filename:
                return video.get('id')
    
    return None

def delete_existing_azure_video(access_token, video_id, location, account_id):
    """Delete an existing video"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos/{video_id}"
    params = {"accessToken": access_token}
    
    response = requests.delete(url, params=params)
    if response.status_code == 200 or response.status_code == 204:
        logging.info(f"Deleted existing video with ID: {video_id}")
        return True
    else:
        logging.warning(f"Could not delete existing video: {response.text}")
        return False

def upload_video_to_azure(access_token, video_path, location, account_id, language, force_upload=False):
    """Upload video to Azure Video Indexer"""
    filename = os.path.basename(video_path)
    
    # Check if video exists if not forcing upload
    if not force_upload:
        video_id = check_azure_video_exists(access_token, filename, location, account_id)
        if video_id:
            logging.info(f"Video already exists. Using video ID: {video_id}")
            return video_id
    else:
        # If forcing upload, delete old video if it exists
        video_id = check_azure_video_exists(access_token, filename, location, account_id)
        if video_id:
            if delete_existing_azure_video(access_token, video_id, location, account_id):
                # Wait a bit to ensure video is fully deleted
                time.sleep(5)
            else:
                # If deletion fails, use existing video
                return video_id
    
    # Upload video with language parameter
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos"
    params = {
        "accessToken": access_token,
        "name": filename,
        "privacy": "private"
    }
    
    # Add language parameter if not auto-detect
    if language != "auto":
        params["language"] = language
        params["linguisticModelId"] = language
    
    with open(video_path, 'rb') as video_file:
        files = {'file': (filename, video_file)}
        response = requests.post(url, params=params, files=files)
    
    if response.status_code == 200:
        return response.json().get('id')
    else:
        # Handle ALREADY_EXISTS error
        if "ALREADY_EXISTS" in response.text:
            # Try to extract video ID from error message
            import re
            match = re.search(r'video id: "([^"]+)"', response.text)
            if match:
                video_id = match.group(1)
                logging.info(f"Video already exists. Using video ID: {video_id}")
                return video_id
        
        # Other errors
        raise Exception(f"Error uploading video: {response.text}")

def check_azure_processing_state(access_token, video_id, location, account_id):
    """Check video processing state"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos/{video_id}/Index"
    params = {"accessToken": access_token}
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get('state')
    return None

def wait_for_azure_processing(access_token, video_id, location, account_id):
    """Wait for video processing to complete"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos/{video_id}/Index"
    params = {"accessToken": access_token}
    
    while True:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            state = response.json().get('state')
            processing_progress = response.json().get('processingProgress', 0)
            
            # Handle processing_progress as integer or string
            if isinstance(processing_progress, str):
                progress_value = int(processing_progress.replace('%', ''))
            else:
                progress_value = int(processing_progress)
            
            logging.info(f"Processing progress: {progress_value}%")
            
            if state == "Processed":
                return
        
        time.sleep(10)  # Check every 10 seconds

def get_azure_scenes_info(access_token, video_id, location, account_id):
    """Get scenes and shots information from Azure Video Indexer"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos/{video_id}/Index"
    params = {"accessToken": access_token}
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        scenes = data.get('videos', [{}])[0].get('insights', {}).get('scenes', [])
        shots = data.get('videos', [{}])[0].get('insights', {}).get('shots', [])
        
        return {
            'video_id': video_id,
            'scenes': scenes,
            'shots': shots,
            'duration': data.get('videos', [{}])[0].get('durationInSeconds', 0),
            'name': data.get('name', os.path.basename(video_id))
        }
    else:
        raise Exception(f"Error getting scene info: {response.text}")

def get_azure_transcript(access_token, video_id, location, account_id):
    """Get transcript from video audio"""
    url = f"https://api.videoindexer.ai/{location}/Accounts/{account_id}/Videos/{video_id}/Index"
    params = {"accessToken": access_token}
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        transcript_blocks = []
        
        try:
            # Get language information
            videos = data.get('videos', [{}])
            if videos and isinstance(videos, list) and len(videos) > 0:
                insights = videos[0].get('insights', {})
                if insights and isinstance(insights, dict):
                    source_language = insights.get('sourceLanguage', {})
                    if source_language and isinstance(source_language, dict):
                        actual_language = source_language.get('language', 'unknown')
                        logging.info(f"Detected language: {actual_language}")
            
            # Method 1: Get from transcript
            if videos and isinstance(videos, list) and len(videos) > 0:
                insights = videos[0].get('insights', {})
                if insights and isinstance(insights, dict):
                    transcripts = insights.get('transcript', [])
                    if transcripts and isinstance(transcripts, list):
                        for item in transcripts:
                            if not isinstance(item, dict):
                                continue
                                
                            text = item.get('text', '')
                            instances = item.get('instances', [])
                            
                            if not isinstance(instances, list):
                                continue
                                
                            for instance in instances:
                                if not isinstance(instance, dict):
                                    continue
                                    
                                start = instance.get('start', '0:00:00')
                                end = instance.get('end', '0:00:00')
                                
                                transcript_blocks.append({
                                    'text': text,
                                    'start': start,
                                    'end': end
                                })
            
            # Method 2: Get from segments if no transcript
            if len(transcript_blocks) == 0 and videos and isinstance(videos, list) and len(videos) > 0:
                insights = videos[0].get('insights', {})
                if insights and isinstance(insights, dict):
                    speech = insights.get('speech', {})
                    if speech and isinstance(speech, dict):
                        segments = speech.get('segments', [])
                        if segments and isinstance(segments, list):
                            for segment in segments:
                                if not isinstance(segment, dict):
                                    continue
                                    
                                text = segment.get('text', '')
                                start = segment.get('start', '0:00:00')
                                end = segment.get('end', '0:00:00')
                                
                                transcript_blocks.append({
                                    'text': text,
                                    'start': start,
                                    'end': end
                                })
            
            # Sort blocks by start time
            if transcript_blocks:
                try:
                    transcript_blocks.sort(key=lambda x: time_to_seconds(x['start']))
                except Exception as sort_error:
                    logging.error(f"Error sorting transcript: {str(sort_error)}")
            
            # If no transcript found, add a message
            if len(transcript_blocks) == 0:
                transcript_blocks.append({
                    'text': 'No text found in video or language not supported.',
                    'start': '0:00:00',
                    'end': '0:00:10'
                })
            else:
                logging.info(f"Found {len(transcript_blocks)} transcript blocks.")
                
            return transcript_blocks
            
        except Exception as e:
            logging.error(f"Error processing transcript: {str(e)}")
            # Return a fake transcript to not interrupt the flow
            return [{
                'text': f'Error extracting transcript: {str(e)}',
                'start': '0:00:00',
                'end': '0:00:10'
            }]
    else:
        error_msg = f"Error getting transcript: {response.text}"
        logging.error(error_msg)
        return [{
            'text': error_msg,
            'start': '0:00:00',
            'end': '0:00:10'
        }]

def extract_azure_scene_images(video_path, scenes_info):
    """Extract images from video for each scene and shot"""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    result = {'scenes': [], 'shots': [], 'video_name': scenes_info['name']}
    
    # Skip scenes processing - we only want shots
    # Keep result['scenes'] as an empty array for compatibility
    
    # Process shots
    for shot_index, shot in enumerate(scenes_info['shots']):
        instances = shot.get('instances', [])
        if not instances:
            continue
            
        for instance_index, instance in enumerate(instances):
            start = instance.get('start')
            end = instance.get('end')
            
            # Convert time from "HH:MM:SS" format to seconds
            start_seconds = time_to_seconds(start)
            
            # Add 0.5 seconds to the start time as requested
            frame_time = start_seconds + 0.5
            
            # No need to find which scene this shot belongs to since we're not using scenes
            scene_id = None
            
            # Get frame at start + 0.5 seconds
            cap.set(cv2.CAP_PROP_POS_MSEC, frame_time * 1000)
            
            ret, frame = cap.read()
            if ret:
                # Save temporary image
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
                cv2.imwrite(temp_file.name, frame)
                
                # Convert image to base64 for frontend
                with open(temp_file.name, "rb") as img_file:
                    img_data = base64.b64encode(img_file.read()).decode('utf-8')
                
                shot_info = {
                    'shot_index': shot_index + 1,
                    'instance_index': instance_index + 1,
                    'scene_id': scene_id,
                    'start': start,
                    'end': end,
                    'image_path': temp_file.name,
                    'image_data': img_data,
                    'type': 'shot'
                }
                result['shots'].append(shot_info)
    
    cap.release()
    return result

def save_azure_extracted_images(result, save_path):
    """Save extracted images to specified directory"""
    try:
        from config import KEYFRAMES_FOLDER
        
        # Get the video name for creating session ID
        video_name = result.get('video_name', 'video').replace('.', '_')
        session_id = create_safe_session_id(video_name)
        
        # Create directory in the KEYFRAMES_FOLDER (same as method 1)
        session_folder = os.path.join(KEYFRAMES_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        # Save each shot image
        for shot in result.get('shots', []):
            try:
                # Create meaningful filename
                shot_num = shot.get('shot_index', 0)
                instance_num = shot.get('instance_index', 0)
                start_time = str(shot.get('start', '00-00-00')).replace(':', '-')
                
                filename = f"shot_{shot_num}_instance_{instance_num}_{start_time}.jpg"
                save_path = os.path.join(session_folder, filename)
                
                # Copy file from temporary location to destination
                shutil.copy2(shot['image_path'], save_path)
                
                # Update path in result - use relative path for frontend
                relative_path = os.path.join('uploads', 'keyframes', session_id, filename)
                shot['saved_image_path'] = save_path
                shot['path'] = relative_path
            except Exception as e:
                logging.error(f"Error saving shot image: {str(e)}")
        
        return session_folder
    except Exception as e:
        logging.error(f"Error saving images: {str(e)}")
        return None

def process_azure_video(video_path, api_key, account_id, location, language,
                       force_upload=False, use_existing_analysis=True, 
                       extract_audio=True, save_images=True, save_path=""):
    """Process video with Azure Video Indexer"""
    
    try:
        # Step 1: Get access token
        logging.info("Getting Azure Video Indexer access token...")
        access_token = get_azure_access_token(api_key, account_id, location)
        
        # Step 2: Upload video
        logging.info("Uploading video to Azure...")
        video_id = upload_video_to_azure(
            access_token, 
            video_path, 
            location, 
            account_id, 
            language, 
            force_upload
        )
        
        # Step 3: Check processing state
        logging.info("Checking processing state...")
        processing_state = check_azure_processing_state(access_token, video_id, location, account_id)
        
        # If video is not processed or not using existing analysis
        if processing_state != "Processed" or not use_existing_analysis:
            logging.info("Waiting for video processing...")
            wait_for_azure_processing(access_token, video_id, location, account_id)
        else:
            logging.info("Using existing analysis...")
        
        # Step 4: Get scene information
        logging.info("Getting scene information...")
        scenes_info = get_azure_scenes_info(access_token, video_id, location, account_id)
        
        # Step 5: Extract images from video
        logging.info("Extracting scene images...")
        result = extract_azure_scene_images(video_path, scenes_info)
        
        # Step 6: Extract audio to text (if requested)
        if extract_audio:
            logging.info("Extracting audio to text...")
            transcript = get_azure_transcript(access_token, video_id, location, account_id)
            result['transcript'] = transcript
        
        # Step 7: Save images to directory (if requested)
        if save_images and save_path:
            logging.info("Saving images to directory...")
            saved_folder = save_azure_extracted_images(result, save_path)
            result['saved_folder'] = saved_folder
        
        logging.info("Azure Video Indexer processing completed!")
        return result
        
    except Exception as e:
        logging.error(f"Error processing Azure video: {str(e)}")
        raise
