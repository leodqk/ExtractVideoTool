import os
import cv2
import requests
import json
import time
import tempfile
import shutil
import logging
from datetime import timedelta
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from .env file (if exists)
load_dotenv()

class AzureVideoIndexer:
    def __init__(self, api_key=None, account_id=None, location=None, language="vi-VN"):
        # Use provided values or try to get from environment variables
        self.api_key = api_key or os.getenv("AZURE_VIDEO_INDEXER_API_KEY", "")
        self.account_id = account_id or os.getenv("AZURE_VIDEO_INDEXER_ACCOUNT_ID", "")
        self.location = location or os.getenv("AZURE_VIDEO_INDEXER_LOCATION", "trial")
        self.language = language
        
    def get_access_token(self):
        url = f"https://api.videoindexer.ai/auth/{self.location}/Accounts/{self.account_id}/AccessToken"
        headers = {"Ocp-Apim-Subscription-Key": self.api_key}
        params = {"allowEdit": "true"}
        
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Error getting access token: {response.text}")
    
    def check_video_exists(self, access_token, filename):
        """Check if a video with this name already exists"""
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos"
        params = {"accessToken": access_token}
        
        response = requests.get(url, params=params)
        if response.status_code == 200:
            videos = response.json().get('results', [])
            for video in videos:
                if video.get('name') == filename:
                    return video.get('id')
        
        return None
    
    def delete_existing_video(self, access_token, video_id):
        """Delete an existing video"""
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos/{video_id}"
        params = {"accessToken": access_token}
        
        response = requests.delete(url, params=params)
        if response.status_code == 200 or response.status_code == 204:
            logging.info(f"Deleted existing video with ID: {video_id}")
            return True
        else:
            logging.warning(f"Could not delete existing video: {response.text}")
            return False
    
    def upload_video(self, access_token, video_path, force_upload=False):
        filename = os.path.basename(video_path)
        
        # Check if video exists if not forcing upload
        if not force_upload:
            video_id = self.check_video_exists(access_token, filename)
            if video_id:
                logging.info(f"Video already exists. Using video ID: {video_id}")
                return video_id
        else:
            # If forcing upload, delete old video if it exists
            video_id = self.check_video_exists(access_token, filename)
            if video_id:
                if self.delete_existing_video(access_token, video_id):
                    # Wait a bit to ensure video is fully deleted
                    time.sleep(5)
                else:
                    # If deletion fails, use existing video
                    return video_id
        
        # Upload video with language parameter
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos"
        params = {
            "accessToken": access_token,
            "name": filename,
            "privacy": "private"
        }
        
        # Add language parameter if not auto-detect
        if self.language != "auto":
            params["language"] = self.language
            params["linguisticModelId"] = self.language
        
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
    
    def check_processing_state(self, access_token, video_id):
        """Check video processing state"""
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos/{video_id}/Index"
        params = {"accessToken": access_token}
        
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json().get('state')
        return None
    
    def wait_for_processing(self, access_token, video_id, callback=None):
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos/{video_id}/Index"
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
                
                # Update progress through callback if provided
                if callback:
                    callback(progress_value, f"Processing video: {progress_value}%")
                
                if state == "Processed":
                    return
            
            time.sleep(10)  # Check every 10 seconds
    
    def get_scenes_info(self, access_token, video_id):
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos/{video_id}/Index"
        params = {"accessToken": access_token}
        
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            scenes = data.get('videos', [{}])[0].get('insights', {}).get('scenes', [])
            return {
                'video_id': video_id,
                'scenes': scenes,
                'duration': data.get('videos', [{}])[0].get('durationInSeconds', 0),
                'name': data.get('name', os.path.basename(video_id))
            }
        else:
            raise Exception(f"Error getting scene info: {response.text}")
    
    def time_to_seconds(self, time_str):
        """Convert time from 'HH:MM:SS' format or seconds to seconds"""
        try:
            # If time_str is a float or integer
            if isinstance(time_str, (int, float)):
                return float(time_str)
            
            # If time_str is a numeric string (e.g. "12.34")
            if time_str.replace('.', '', 1).isdigit():
                return float(time_str)
            
            # If time_str has "HH:MM:SS" or "MM:SS" format
            parts = time_str.split(':')
            if len(parts) == 3:  # HH:MM:SS
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            elif len(parts) == 2:  # MM:SS
                return int(parts[0]) * 60 + float(parts[1])
            else:
                # Other cases, return 0
                return 0
        except Exception:
            # If error, return 0
            return 0
    
    def get_transcript(self, access_token, video_id):
        """Get transcript from video audio with better error handling"""
        url = f"https://api.videoindexer.ai/{self.location}/Accounts/{self.account_id}/Videos/{video_id}/Index"
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
                
                # Method 3: Get from other structure if still no transcript
                if len(transcript_blocks) == 0 and videos and isinstance(videos, list) and len(videos) > 0:
                    insights = videos[0].get('insights', {})
                    if insights and isinstance(insights, dict):
                        blocks = insights.get('blocks', [])
                        if blocks and isinstance(blocks, list):
                            for block in blocks:
                                if not isinstance(block, dict):
                                    continue
                                    
                                instances = block.get('instances', [])
                                if not isinstance(instances, list) or len(instances) == 0:
                                    continue
                                    
                                # Get text from block or from ocr if available
                                text = block.get('text', '')
                                if not text and 'ocr' in block:
                                    ocr_text = []
                                    for ocr_item in block.get('ocr', []):
                                        if isinstance(ocr_item, dict):
                                            ocr_text.append(ocr_item.get('text', ''))
                                    text = ' '.join(ocr_text)
                                
                                start = instances[0].get('start', '0:00:00')
                                end = instances[0].get('end', '0:00:00')
                                
                                transcript_blocks.append({
                                    'text': text,
                                    'start': start,
                                    'end': end
                                })
                
                # Sort blocks by start time
                if transcript_blocks:
                    try:
                        transcript_blocks.sort(key=lambda x: self.time_to_seconds(x['start']))
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
    
    def extract_scene_images(self, video_path, scenes_info):
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        result = {'scenes': [], 'video_name': scenes_info['name']}
        
        for scene_index, scene in enumerate(scenes_info['scenes']):
            instances = scene.get('instances', [])
            if not instances:
                continue
                
            for instance_index, instance in enumerate(instances):
                start = instance.get('start')
                end = instance.get('end')
                
                # Convert time from "HH:MM:SS" format to seconds
                start_seconds = self.time_to_seconds(start)
                
                # If end is in seconds, use directly
                if isinstance(end, (int, float)):
                    end_seconds = float(end)
                else:
                    # If end is "HH:MM:SS" string, convert
                    end_seconds = self.time_to_seconds(end)
                
                # Get frame at the middle of the scene
                middle_seconds = start_seconds + (end_seconds - start_seconds) / 2
                cap.set(cv2.CAP_PROP_POS_MSEC, middle_seconds * 1000)
                
                ret, frame = cap.read()
                if ret:
                    # Save temporary image
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
                    cv2.imwrite(temp_file.name, frame)
                    
                    scene_info = {
                        'scene_index': scene_index + 1,
                        'instance_index': instance_index + 1,
                        'start': start,
                        'end': end,
                        'image_path': temp_file.name
                    }
                    result['scenes'].append(scene_info)
        
        cap.release()
        return result
    
    def format_srt_time(self, time_str):
        """Convert time to SRT format HH:MM:SS,mmm"""
        try:
            # Convert to seconds
            total_seconds = self.time_to_seconds(time_str)
            
            # Calculate hours, minutes, seconds and milliseconds
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            seconds = int(total_seconds % 60)
            milliseconds = int((total_seconds - int(total_seconds)) * 1000)
            
            # Format according to SRT standard
            return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"
        except Exception:
            # If error, return default value
            return "00:00:00,000"
    
    def save_extracted_images(self, result, save_path):
        """Save extracted images to specified directory"""
        try:
            # Create directory if it doesn't exist
            if not os.path.exists(save_path):
                os.makedirs(save_path)
            
            # Create subdirectory for current video
            video_name = result.get('video_name', 'video').replace('.', '_')
            video_folder = os.path.join(save_path, video_name)
            
            if not os.path.exists(video_folder):
                os.makedirs(video_folder)
            
            # Save each image
            for scene in result['scenes']:
                try:
                    # Create meaningful filename
                    scene_num = scene.get('scene_index', 0)
                    instance_num = scene.get('instance_index', 0)
                    start_time = str(scene.get('start', '00-00-00')).replace(':', '-')
                    
                    filename = f"scene_{scene_num}_instance_{instance_num}_{start_time}.jpg"
                    save_path = os.path.join(video_folder, filename)
                    
                    # Copy file from temporary location to destination
                    shutil.copy2(scene['image_path'], save_path)
                    
                    # Update path in result
                    scene['saved_image_path'] = save_path
                except Exception as e:
                    logging.error(f"Error saving image: {str(e)}")
            
            # Save transcript if available
            if 'transcript' in result and result['transcript']:
                try:
                    # Save as plain text
                    transcript_path = os.path.join(video_folder, "transcript.txt")
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        for block in result['transcript']:
                            start = block.get('start', '0:00:00')
                            end = block.get('end', '0:00:00')
                            text = block.get('text', '')
                            f.write(f"[{start} - {end}] {text}\n")
                    
                    result['transcript_path'] = transcript_path
                    
                    # Save as SRT (subtitle format)
                    try:
                        srt_path = os.path.join(video_folder, "transcript.srt")
                        with open(srt_path, 'w', encoding='utf-8') as f:
                            for i, block in enumerate(result['transcript']):
                                # SRT format
                                f.write(f"{i+1}\n")
                                start_time = self.format_srt_time(block.get('start', '0:00:00'))
                                end_time = self.format_srt_time(block.get('end', '0:00:00'))
                                text = block.get('text', '')
                                f.write(f"{start_time} --> {end_time}\n")
                                f.write(f"{text}\n\n")
                        
                        result['srt_path'] = srt_path
                    except Exception as e:
                        logging.error(f"Error saving SRT file: {str(e)}")
                except Exception as e:
                    logging.error(f"Error saving transcript: {str(e)}")
                    
            return video_folder
        except Exception as e:
            logging.error(f"Error saving results: {str(e)}")
            return None
    
    def process_video(self, video_path, force_upload=False, use_existing_analysis=True, 
                     extract_audio=True, save_images=True, save_path="", callback=None):
        """Process video from start to finish with optional callback for progress updates"""
        try:
            # Step 1: Get access token
            if callback:
                callback(10, "Getting access token...")
            access_token = self.get_access_token()
            
            # Step 2: Upload video
            if callback:
                callback(20, "Uploading video to Azure...")
            video_id = self.upload_video(access_token, video_path, force_upload)
            
            # Step 3: Check processing state
            if callback:
                callback(30, "Checking processing state...")
            processing_state = self.check_processing_state(access_token, video_id)
            
            # If video is not processed or not using existing analysis
            if processing_state != "Processed" or not use_existing_analysis:
                if callback:
                    callback(35, "Processing video...")
                self.wait_for_processing(access_token, video_id, callback)
            else:
                if callback:
                    callback(70, "Using existing analysis...")
            
            # Step 4: Get scene information
            if callback:
                callback(80, "Getting scene information...")
            scenes_info = self.get_scenes_info(access_token, video_id)
            
            # Step 5: Extract images from video
            if callback:
                callback(85, "Extracting scene images...")
            result = self.extract_scene_images(video_path, scenes_info)
            
            # Step 6: Extract audio to text (if requested)
            if extract_audio:
                if callback:
                    callback(90, "Extracting audio to text...")
                transcript = self.get_transcript(access_token, video_id)
                result['transcript'] = transcript
            
            # Step 7: Save images to directory (if requested)
            if save_images and save_path:
                if callback:
                    callback(95, "Saving images to directory...")
                saved_folder = self.save_extracted_images(result, save_path)
                result['saved_folder'] = saved_folder
            
            if callback:
                callback(100, "Completed!")
            return result
            
        except Exception as e:
            if callback:
                callback(-1, f"Error: {str(e)}")
            logging.error(f"Error processing video: {str(e)}")
            raise