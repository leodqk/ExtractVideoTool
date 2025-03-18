import os
import cv2
import numpy as np
import uuid
import tempfile
import shutil
import base64
import google.generativeai as genai
import subprocess
from flask import Flask, request, render_template, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import logging
from pytube import YouTube
import re
import yt_dlp  # Thay thế youtube_dl bằng yt-dlp
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import urlparse
import time
import json
import imagehash

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Cấu hình
UPLOAD_FOLDER = os.path.join('static', 'uploads')
KEYFRAMES_FOLDER = os.path.join('static', 'uploads', 'keyframes')
GENERATED_IMAGES_FOLDER = os.path.join('static', 'uploads', 'generated')
AUDIO_FOLDER = os.path.join('static', 'uploads', 'audio')
TRANSCRIPTS_FOLDER = os.path.join('static', 'uploads', 'transcripts')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
API_KEY_FILE = 'api_key.txt'  # File chứa API key

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # Giới hạn 500MB

# Rate limiting cho Gemini API
GEMINI_API_CALLS = {}  # {timestamp: count}
GEMINI_RATE_LIMIT = 10  # Số lượng cuộc gọi tối đa trong 1 phút
GEMINI_RATE_WINDOW = 60  # Thời gian cửa sổ tính giới hạn (giây)
# Biến toàn cục để lưu trữ dữ liệu keyframes
keyframesData = []

def check_rate_limit():
    """Kiểm tra nếu đã vượt quá giới hạn tốc độ cho Gemini API"""
    current_time = time.time()
    
    # Xóa các timestamp cũ
    for timestamp in list(GEMINI_API_CALLS.keys()):
        if current_time - timestamp > GEMINI_RATE_WINDOW:
            del GEMINI_API_CALLS[timestamp]
    
    # Tính tổng số cuộc gọi trong cửa sổ hiện tại
    total_calls = sum(GEMINI_API_CALLS.values())
    
    # Kiểm tra nếu đã vượt quá giới hạn
    if total_calls >= GEMINI_RATE_LIMIT:
        return False
    
    # Thêm cuộc gọi mới
    GEMINI_API_CALLS[current_time] = GEMINI_API_CALLS.get(current_time, 0) + 1
    return True

# Đọc API key từ file
def get_api_key():
    try:
        if os.path.exists(API_KEY_FILE):
            with open(API_KEY_FILE, 'r') as f:
                api_key = f.read().strip()
                if api_key:
                    return api_key
    except Exception as e:
        logging.error(f"Lỗi khi đọc API key từ file: {str(e)}")
    
    # Sử dụng key mặc định nếu không đọc được từ file
    return "AIzaSyAiBnNrdbs7cj6P5vbMiecEz5csI9S99xQ"

# Cấu hình Gemini API
GEMINI_API_KEY = get_api_key()
genai.configure(api_key=GEMINI_API_KEY)

# Tạo thư mục nếu chưa tồn tại
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(KEYFRAMES_FOLDER, exist_ok=True)
os.makedirs(GENERATED_IMAGES_FOLDER, exist_ok=True)
os.makedirs(AUDIO_FOLDER, exist_ok=True)
os.makedirs(TRANSCRIPTS_FOLDER, exist_ok=True)

# Phương pháp dự phòng sử dụng perceptual hashing
def detect_duplicate_images_fallback(image_paths, threshold=0.85):
    """
    Phương pháp dự phòng để phát hiện ảnh trùng lặp khi Gemini API không khả dụng
    Sử dụng perceptual hashing
    """
    if not image_paths or len(image_paths) < 2:
        return {'unique_images': image_paths, 'duplicate_images': []}
    
    try:
        logging.info("Using fallback duplicate detection with perceptual hashing")
        # Tính toán hash cho tất cả các ảnh
        image_hashes = []
        for path in image_paths:
            try:
                full_path = os.path.join('static', path)
                img = Image.open(full_path)
                # Sử dụng perceptual hash
                p_hash = imagehash.phash(img)
                
                # Lấy ID của khung hình nếu có
                frame_id = None
                for frame in keyframesData:
                    if frame.get('path') == path and 'id' in frame:
                        frame_id = frame['id']
                        break
                
                if not frame_id:
                    frame_id = str(uuid.uuid4())[:8]
                
                image_hashes.append({
                    'path': path,
                    'hash': p_hash,
                    'id': frame_id
                })
            except Exception as e:
                logging.error(f"Error processing {path}: {str(e)}")
                continue
        
        # Tìm các ảnh trùng lặp
        duplicates = []
        # Điều chỉnh ngưỡng hash dựa trên ngưỡng tương đồng
        # Ngưỡng hash thấp = tương tự nhiều hơn (0-64 là khoảng giá trị của hash)
        # Chuyển đổi ngưỡng tương đồng (0.5-1.0) thành ngưỡng hash (12-0)
        hash_threshold = int(12 * (1 - threshold))
        
        for i in range(len(image_hashes)):
            for j in range(i+1, len(image_hashes)):
                # Tính khoảng cách giữa các hash
                hash_dist = image_hashes[i]['hash'] - image_hashes[j]['hash']
                
                if hash_dist <= hash_threshold:
                    # Chuyển đổi khoảng cách hash thành độ tương đồng (0-1)
                    similarity = 1 - (hash_dist / 64)
                    
                    # Chỉ thêm vào danh sách nếu vượt ngưỡng
                    if similarity >= threshold:
                        duplicates.append({
                            'path': image_hashes[j]['path'],
                            'duplicate_of': image_hashes[i]['path'],
                            'similarity': similarity,
                            'id': image_hashes[j]['id']
                        })
        
        # Tạo danh sách ảnh độc nhất (không trùng lặp)
        duplicate_paths = [d['path'] for d in duplicates]
        unique_images = [path for path in image_paths if path not in duplicate_paths]
        
        return {
            'unique_images': unique_images,
            'duplicate_images': duplicates
        }
    except Exception as e:
        logging.error(f"Error in fallback duplicate detection: {str(e)}")
        # Trả về danh sách gốc nếu có lỗi
        return {'unique_images': image_paths, 'duplicate_images': []}

# Phương pháp phát hiện ảnh trùng lặp với Gemini API
def detect_duplicate_images_with_gemini(image_paths, session_id, threshold=0.85):
    """
    Phát hiện ảnh trùng lặp sử dụng Gemini API với phương pháp dự phòng
    """
    if not image_paths or len(image_paths) < 2:
        return {'unique_images': image_paths, 'duplicate_images': []}
    
    # Kiểm tra rate limit
    if not check_rate_limit():
        logging.warning("Gemini API rate limit exceeded, switching to fallback method")
        return detect_duplicate_images_fallback(image_paths, threshold)
    
    try:
        # Thử sử dụng Gemini API
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Lưu trữ kết quả
        duplicates = []
        
        # Tạo một từ điển ánh xạ đường dẫn đến ID khung hình
        path_to_id_map = {}
        for frame in keyframesData:
            if 'path' in frame and 'id' in frame:
                path_to_id_map[frame['path']] = frame['id']
        
        # Giới hạn số lượng so sánh để tránh vượt quá quota
        max_comparisons = 5  # Giảm số lượng so sánh xuống
        comparison_count = 0
        
        # Xử lý từng cặp ảnh
        for i in range(len(image_paths)):
            if comparison_count >= max_comparisons:
                break
                
            # Bỏ qua nếu ảnh này đã được xác định là trùng lặp
            if any(d['path'] == image_paths[i] for d in duplicates):
                continue
                
            for j in range(i+1, len(image_paths)):
                if comparison_count >= max_comparisons:
                    break
                    
                comparison_count += 1
                
                # Bỏ qua nếu ảnh này đã được xác định là trùng lặp
                if any(d['path'] == image_paths[j] for d in duplicates):
                    continue
                    
                try:
                    # Đường dẫn đầy đủ đến các ảnh
                    path1 = os.path.join('static', image_paths[i])
                    path2 = os.path.join('static', image_paths[j])
                    
                    # Kiểm tra nếu cả hai file tồn tại
                    if not os.path.exists(path1) or not os.path.exists(path2):
                        continue
                    
                    # Đọc dữ liệu ảnh
                    with open(path1, "rb") as img_file1, open(path2, "rb") as img_file2:
                        image_data1 = img_file1.read()
                        image_data2 = img_file2.read()
                    
                    # Tạo prompt cho Gemini
                    prompt = """
                    Compare these two images and determine if they are duplicates or very similar.
                    Rate their similarity from 0 to 1 where:
                    - 0 means completely different
                    - 1 means identical or nearly identical
                    
                    Return ONLY a JSON with two fields:
                    {
                      "similarity_score": (number between 0 and 1),
                      "are_duplicates": (true/false)
                    }
                    """
                    
                    # Tạo nội dung cho request
                    contents = [
                        {
                            "role": "user",
                            "parts": [
                                {"text": prompt},
                                {
                                    "inline_data": {
                                        "mime_type": "image/jpeg",
                                        "data": base64.b64encode(image_data1).decode('utf-8')
                                    }
                                },
                                {
                                    "inline_data": {
                                        "mime_type": "image/jpeg",
                                        "data": base64.b64encode(image_data2).decode('utf-8')
                                    }
                                }
                            ]
                        }
                    ]
                    
                    # Gọi API Gemini
                    response = model.generate_content(contents)
                    
                    # Xử lý phản hồi để trích xuất JSON
                    response_text = response.text.strip()
                    
                    # Loại bỏ các ký tự không phải JSON nếu có
                    if response_text.startswith('```json'):
                        response_text = response_text.replace('```json', '', 1)
                    if response_text.endswith('```'):
                        response_text = response_text[:-3]
                    
                    response_text = response_text.strip()
                    
                    # Parse JSON
                    result = json.loads(response_text)
                    
                    # Kiểm tra nếu là ảnh trùng lặp dựa trên ngưỡng được cung cấp
                    if result.get('are_duplicates', False) and result.get('similarity_score', 0) >= threshold:
                        # Lấy ID của khung hình nếu có
                        frame_id = path_to_id_map.get(image_paths[j], str(uuid.uuid4())[:8])
                        
                        # Thêm vào danh sách trùng lặp
                        duplicates.append({
                            'path': image_paths[j],
                            'duplicate_of': image_paths[i],
                            'similarity': result.get('similarity_score', 0),
                            'id': frame_id
                        })
                except Exception as e:
                    logging.error(f"Error in Gemini API call: {str(e)}")
                    # Nếu gặp lỗi với Gemini API, chuyển sang phương pháp dự phòng
                    logging.info("Switching to fallback method for duplicate detection")
                    return detect_duplicate_images_fallback(image_paths, threshold)
        
        # Nếu chúng ta đã sử dụng hết số lần so sánh cho phép nhưng vẫn còn nhiều ảnh,
        # hãy sử dụng phương pháp dự phòng cho các ảnh còn lại
        if comparison_count >= max_comparisons and len(image_paths) > 2 * max_comparisons:
            logging.info("Reached comparison limit, using fallback method for remaining images")
            
            # Lấy danh sách các ảnh đã xử lý
            processed_paths = set()
            for dup in duplicates:
                processed_paths.add(dup['path'])
                processed_paths.add(dup['duplicate_of'])
            
            # Lọc các ảnh chưa xử lý
            remaining_paths = [p for p in image_paths if p not in processed_paths]
            
            # Xử lý các ảnh còn lại bằng phương pháp dự phòng
            if remaining_paths:
                fallback_results = detect_duplicate_images_fallback(remaining_paths, threshold)
                duplicates.extend(fallback_results['duplicate_images'])
        
        # Tạo danh sách ảnh độc nhất (không trùng lặp)
        duplicate_paths = [d['path'] for d in duplicates]
        unique_images = [path for path in image_paths if path not in duplicate_paths]
        
        return {
            'unique_images': unique_images,
            'duplicate_images': duplicates
        }
        
    except Exception as e:
        logging.error(f"Error in duplicate detection with Gemini: {str(e)}")
        # Chuyển sang phương pháp dự phòng
        return detect_duplicate_images_fallback(image_paths, threshold)

# Cập nhật các hàm trích xuất khung hình để sử dụng phát hiện trùng lặp

def extract_keyframes_method1(video_path, threshold=30, max_frames=20, detect_duplicates=True, duplicate_threshold=0.85):
    """
    Phương pháp 1: Trích xuất khung hình dựa trên sự thay đổi giữa các khung hình
    """
    cap = cv2.VideoCapture(video_path)
    
    # Kiểm tra nếu không mở được video
    if not cap.isOpened():
        raise Exception("Không thể mở file video")
    
    # Lấy thông tin video
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Lấy tên video để đặt tên folder
    video_name = get_video_name_without_extension(video_path)
    session_id = create_safe_session_id(video_name)
    
    # Tạo thư mục dựa trên tên video
    session_folder = os.path.join(KEYFRAMES_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Các biến theo dõi
    prev_frame = None
    keyframes = []
    frame_count = 0
    
    # Tính toán bước nhảy để tăng hiệu suất với video dài
    frame_skip = max(1, int(total_frames / (10 * fps)))  # Xử lý khoảng 10 khung hình mỗi giây
    
    logging.info(f"Bắt đầu xử lý video (Phương pháp 1): {video_path}")
    logging.info(f"Tổng số khung hình: {total_frames}, FPS: {fps}, Skip: {frame_skip}")
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Bỏ qua một số khung hình để tăng hiệu suất
        if frame_count % frame_skip != 0 and frame_count > 0:
            frame_count += 1
            continue
            
        # Xử lý khung hình đầu tiên
        if prev_frame is None:
            prev_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Lưu khung hình đầu tiên
            frame_filename = f"frame_0.jpg"
            frame_path = os.path.join(session_folder, frame_filename)
            cv2.imwrite(frame_path, frame)
            
            # Đường dẫn tương đối cho frontend
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'diff_value': 0,
                'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
            })
            frame_count += 1
            continue
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Tính toán sự khác biệt
        diff = cv2.absdiff(gray, prev_frame)
        mean_diff = np.mean(diff)
        
        # Nếu có sự thay đổi lớn, lưu khung hình
        if mean_diff > threshold:
            frame_filename = f"frame_{len(keyframes)}.jpg"
            frame_path = os.path.join(session_folder, frame_filename)
            cv2.imwrite(frame_path, frame)
            
            # Đường dẫn tương đối cho frontend
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'diff_value': float(mean_diff),
                'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
            })
            
        prev_frame = gray
        frame_count += 1
        
        # Giới hạn số lượng khung hình
        if len(keyframes) >= max_frames:
            break
        
    cap.release()
    
    # Phát hiện ảnh trùng lặp
    if detect_duplicates and len(keyframes) > 1:
        try:
            global keyframesData
            keyframesData = keyframes  # Lưu trữ dữ liệu khung hình
            
            image_paths = [frame['path'] for frame in keyframes]
            duplicate_result = detect_duplicate_images_with_gemini(image_paths, session_id, duplicate_threshold)
            
            # Đánh dấu các ảnh trùng lặp
            if duplicate_result and 'duplicate_images' in duplicate_result:
                duplicate_paths = [dup['path'] for dup in duplicate_result['duplicate_images']]
                for frame in keyframes:
                    if frame['path'] in duplicate_paths:
                        frame['is_duplicate'] = True
                        # Lưu thông tin độ tương đồng
                        for dup in duplicate_result['duplicate_images']:
                            if dup['path'] == frame['path']:
                                frame['similarity'] = dup['similarity']
                                frame['duplicate_of'] = dup['duplicate_of']
                                break
                    else:
                        frame['is_duplicate'] = False
        except Exception as e:
            logging.error(f"Error in duplicate detection: {str(e)}")
            # Đảm bảo không có lỗi nào ảnh hưởng đến kết quả
            for frame in keyframes:
                frame['is_duplicate'] = False
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': session_id,  # Sử dụng session_id an toàn
        'keyframes': keyframes,
        'total_frames': total_frames,
        'fps': fps,
        'duration': total_frames / fps,
        'width': width,
        'height': height,
        'method': 'frame_difference',
        'duplicate_threshold': duplicate_threshold
    }

def extract_keyframes_method2(video_path, threshold=30, min_scene_length=15, max_frames=20, detect_duplicates=True, duplicate_threshold=0.85):
    """
    Phương pháp 2: Trích xuất khung hình dựa trên phát hiện chuyển cảnh
    """
    cap = cv2.VideoCapture(video_path)
    
    # Kiểm tra nếu không mở được video
    if not cap.isOpened():
        raise Exception("Không thể mở file video")
    
    # Lấy thông tin video
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Lấy tên video để đặt tên folder
    video_name = get_video_name_without_extension(video_path)
    session_id = create_safe_session_id(video_name)
    
    # Tạo thư mục dựa trên tên video
    session_folder = os.path.join(KEYFRAMES_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Các biến theo dõi
    prev_frame = None
    scene_start = 0
    frame_count = 0
    scenes = []
    keyframes = []
    
    # Tính toán bước nhảy để tăng hiệu suất với video dài
    frame_skip = max(1, int(total_frames / (10 * fps)))  # Xử lý khoảng 10 khung hình mỗi giây
    
    logging.info(f"Bắt đầu xử lý video (Phương pháp 2): {video_path}")
    logging.info(f"Tổng số khung hình: {total_frames}, FPS: {fps}, Skip: {frame_skip}")
    
    while cap.isOpened() and len(keyframes) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Bỏ qua một số khung hình để tăng hiệu suất
        if frame_count % frame_skip != 0 and frame_count > 0:
            frame_count += 1
            continue
        
        # Xử lý khung hình đầu tiên
        if prev_frame is None:
            prev_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            scene_start = frame_count
            
            # Lưu khung hình đầu tiên
            frame_filename = f"scene_0.jpg"
            frame_path = os.path.join(session_folder, frame_filename)
            cv2.imwrite(frame_path, frame)
            
            # Đường dẫn tương đối cho frontend
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'scene_id': 0,
                'hist_diff': 0,
                'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
            })
            
            frame_count += 1
            continue
        
        # Chuyển sang ảnh xám
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Tính toán sự khác biệt bằng histogram
        hist1 = cv2.calcHist([prev_frame], [0], None, [64], [0, 256])
        hist2 = cv2.calcHist([gray], [0], None, [64], [0, 256])
        
        # Chuẩn hóa histogram
        cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
        cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
        
        # So sánh histogram
        hist_diff = cv2.compareHist(hist1, hist2, cv2.HISTCMP_BHATTACHARYYA)
        
        # Phát hiện chuyển cảnh
        if hist_diff > threshold / 100 and (frame_count - scene_start) >= min_scene_length:
            # Lưu thông tin cảnh
            scenes.append({
                'start': scene_start,
                'end': frame_count,
                'length': frame_count - scene_start
            })
            
            # Lấy khung hình đại diện (khung hình giữa cảnh)
            mid_frame_idx = scene_start + (frame_count - scene_start) // 2
            
            # Định vị lại đến khung hình giữa cảnh
            cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame_idx)
            ret, mid_frame = cap.read()
            
            if ret:
                # Lưu khung hình
                frame_filename = f"scene_{len(scenes)}.jpg"
                frame_path = os.path.join(session_folder, frame_filename)
                cv2.imwrite(frame_path, mid_frame)
                
                # Đường dẫn tương đối cho frontend
                relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
                keyframes.append({
                    'path': relative_path,
                    'frame_number': mid_frame_idx,
                    'timestamp': mid_frame_idx / fps,
                    'scene_id': len(scenes),
                    'hist_diff': float(hist_diff),
                    'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
                })
                
                # Đặt lại vị trí hiện tại
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)
                ret, frame = cap.read()
                if not ret:
                    break
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Bắt đầu cảnh mới
            scene_start = frame_count
        
        prev_frame = gray
        frame_count += 1
    
    # Xử lý cảnh cuối cùng nếu cần
    if scene_start < frame_count - min_scene_length and len(scenes) < max_frames:
        scenes.append({
            'start': scene_start,
            'end': frame_count,
            'length': frame_count - scene_start
        })
        
        # Lấy khung hình đại diện cho cảnh cuối
        mid_frame_idx = scene_start + (frame_count - scene_start) // 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame_idx)
        ret, mid_frame = cap.read()
        
        if ret:
            frame_filename = f"scene_{len(scenes)}.jpg"
            frame_path = os.path.join(session_folder, frame_filename)
            cv2.imwrite(frame_path, mid_frame)
            
            # Đường dẫn tương đối cho frontend
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': mid_frame_idx,
                'timestamp': mid_frame_idx / fps,
                'scene_id': len(scenes),
                'hist_diff': 0,
                'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
            })
    
    cap.release()
    
     # Phát hiện ảnh trùng lặp
    if detect_duplicates and len(keyframes) > 1:
        try:
            global keyframesData
            keyframesData = keyframes  # Lưu trữ dữ liệu khung hình
            
            image_paths = [frame['path'] for frame in keyframes]
            duplicate_result = detect_duplicate_images_with_gemini(image_paths, session_id, duplicate_threshold)
            
            # Đánh dấu các ảnh trùng lặp
            if duplicate_result and 'duplicate_images' in duplicate_result:
                duplicate_paths = [dup['path'] for dup in duplicate_result['duplicate_images']]
                for frame in keyframes:
                    if frame['path'] in duplicate_paths:
                        frame['is_duplicate'] = True
                        # Lưu thông tin độ tương đồng
                        for dup in duplicate_result['duplicate_images']:
                            if dup['path'] == frame['path']:
                                frame['similarity'] = dup['similarity']
                                frame['duplicate_of'] = dup['duplicate_of']
                                break
                    else:
                        frame['is_duplicate'] = False
        except Exception as e:
            logging.error(f"Error in duplicate detection: {str(e)}")
            # Đảm bảo không có lỗi nào ảnh hưởng đến kết quả
            for frame in keyframes:
                frame['is_duplicate'] = False
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': session_id,
        'keyframes': keyframes,
        'scenes': scenes,
        'total_frames': total_frames,
        'fps': fps,
        'duration': total_frames / fps,
        'width': width,
        'height': height,
        'method': 'scene_detection',
        'duplicate_threshold': duplicate_threshold
    }

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_video_name_without_extension(video_path):
    """Lấy tên video không có đuôi mở rộng"""
    base_name = os.path.basename(video_path)
    return os.path.splitext(base_name)[0]

def create_safe_session_id(video_name):
    """Tạo session ID an toàn từ tên video"""
    # Rút gọn tên nếu quá dài để tránh lỗi đường dẫn
    if len(video_name) > 50:
        # Lấy 30 ký tự đầu + uuid ngắn để đảm bảo duy nhất
        short_uuid = str(uuid.uuid4())[:8]
        video_name = f"{video_name[:30]}_{short_uuid}"
    
    # Thay thế các ký tự không an toàn trong tên file
    safe_name = secure_filename(video_name)
    if not safe_name:
        safe_name = f"session_{str(uuid.uuid4())[:8]}"
    
    return safe_name

def extract_audio_from_video(video_path):
    """
    Trích xuất âm thanh từ video và lưu dưới dạng file WAV
    """
    try:
        # Lấy tên video để đặt tên file âm thanh
        video_name = get_video_name_without_extension(video_path)
        session_id = create_safe_session_id(video_name)
        
        # Tạo đường dẫn đến file âm thanh
        audio_folder = os.path.join(AUDIO_FOLDER, session_id)
        os.makedirs(audio_folder, exist_ok=True)
        audio_path = os.path.join(audio_folder, f"{session_id}.wav")
        
        # Sử dụng subprocess để gọi ffmpeg trực tiếp
        try:
            command = [
                'ffmpeg',
                '-i', video_path,
                '-q:a', '0',
                '-map', 'a',
                '-y',  # Ghi đè file nếu đã tồn tại
                audio_path
            ]
            
            subprocess.run(command, check=True, capture_output=True, text=True)
            logging.info(f"Trích xuất âm thanh thành công với FFmpeg: {audio_path}")
            
        except subprocess.CalledProcessError as e:
            logging.error(f"FFmpeg error: {e.stderr if hasattr(e, 'stderr') else str(e)}")
            # Thử phương pháp thay thế nếu ffmpeg không khả dụng
            logging.info("Trying alternative method for audio extraction...")
            
            # Sử dụng moviepy thay thế
            try:
                from moviepy.editor import VideoFileClip
                video = VideoFileClip(video_path)
                video.audio.write_audiofile(audio_path)
                video.close()
                logging.info(f"Trích xuất âm thanh thành công với MoviePy: {audio_path}")
            except Exception as moviepy_error:
                logging.error(f"MoviePy error: {str(moviepy_error)}")
                raise Exception(f"Không thể trích xuất âm thanh với cả FFmpeg và MoviePy: {str(e)}")
        
        # Trả về đường dẫn đến file âm thanh
        relative_path = os.path.join('uploads', 'audio', session_id, f"{session_id}.wav")
        return {
            'path': audio_path,
            'relative_path': relative_path,
            'session_id': session_id
        }
    except Exception as e:
        logging.error(f"Lỗi khi trích xuất âm thanh: {str(e)}")
        raise Exception(f"Không thể trích xuất âm thanh: {str(e)}")

def transcribe_audio(audio_path, session_id):
    """
    Phiên âm file âm thanh thành văn bản sử dụng OpenAI Whisper hoặc phương pháp thay thế
    """
    try:
        # Tạo thư mục cho file phiên âm
        transcript_folder = os.path.join(TRANSCRIPTS_FOLDER, session_id)
        os.makedirs(transcript_folder, exist_ok=True)
        
        # Đường dẫn đến file phiên âm
        transcript_path = os.path.join(transcript_folder, f"{session_id}_transcript.txt")
        
        # Kiểm tra nếu Whisper khả dụng
        try:
            import whisper
            WHISPER_AVAILABLE = True
            whisper_model = whisper.load_model("base")
        except ImportError:
            WHISPER_AVAILABLE = False
            whisper_model = None
        
        if WHISPER_AVAILABLE and whisper_model is not None:
            logging.info(f"Bắt đầu phiên âm file với Whisper: {audio_path}")
            
            try:
                # Thực hiện phiên âm với Whisper
                result = whisper_model.transcribe(audio_path)
                transcript = result["text"]
                
                # Lưu phiên âm vào file
                with open(transcript_path, "w", encoding="utf-8") as f:
                    f.write(transcript)
                
                # Trả về kết quả phiên âm
                relative_path = os.path.join('uploads', 'transcripts', session_id, f"{session_id}_transcript.txt")
                return {
                    'path': transcript_path,
                    'relative_path': relative_path,
                    'text': transcript
                }
            except Exception as whisper_error:
                logging.error(f"Lỗi khi phiên âm với Whisper: {str(whisper_error)}")
                # Nếu Whisper gặp lỗi, thử phương pháp thay thế
                return transcribe_with_speechrecognition(audio_path, transcript_path, session_id)
        else:
            # Sử dụng phương pháp thay thế nếu Whisper không khả dụng
            logging.info(f"Whisper không khả dụng, sử dụng SpeechRecognition thay thế")
            return transcribe_with_speechrecognition(audio_path, transcript_path, session_id)
            
    except Exception as e:
        logging.error(f"Lỗi khi phiên âm với Whisper: {str(e)}")
        try:
            return transcribe_with_speechrecognition(audio_path, transcript_path, session_id)
        except Exception as sr_error:
            logging.error(f"Lỗi khi phiên âm với SpeechRecognition: {str(sr_error)}")
            raise Exception(f"Không thể phiên âm: {str(e)}")

def transcribe_with_speechrecognition(audio_path, transcript_path, session_id):
    """
    Phương pháp thay thế sử dụng SpeechRecognition
    """
    try:
        import speech_recognition as sr
        from pydub import AudioSegment
        
        logging.info(f"Bắt đầu phiên âm file với SpeechRecognition: {audio_path}")
        
        # Đảm bảo thư mục tồn tại
        transcript_dir = os.path.dirname(transcript_path)
        os.makedirs(transcript_dir, exist_ok=True)
        
        # Chuyển đổi định dạng âm thanh nếu cần
        sound = AudioSegment.from_wav(audio_path)
        
        # Chia âm thanh thành các đoạn 30 giây để xử lý
        chunk_length_ms = 30000  # 30 giây
        chunks = [sound[i:i+chunk_length_ms] for i in range(0, len(sound), chunk_length_ms)]
        
        recognizer = sr.Recognizer()
        transcript = ""
        
        # Thư mục tạm cho chunks
        temp_chunk_dir = os.path.join(transcript_dir, "temp_chunks")
        os.makedirs(temp_chunk_dir, exist_ok=True)
        
        for i, chunk in enumerate(chunks):
            # Lưu đoạn âm thanh tạm thời
            chunk_path = os.path.join(temp_chunk_dir, f"chunk_{i}.wav")
            chunk.export(chunk_path, format="wav")
            
            # Phiên âm đoạn âm thanh
            with sr.AudioFile(chunk_path) as source:
                audio_data = recognizer.record(source)
                try:
                    text = recognizer.recognize_google(audio_data, language="vi-VN")
                    transcript += text + " "
                except sr.UnknownValueError:
                    transcript += "[Không nhận dạng được] "
                except sr.RequestError:
                    transcript += "[Lỗi kết nối] "
            
            # Xóa file tạm
            try:
                os.remove(chunk_path)
            except:
                pass
        
        # Xóa thư mục tạm
        try:
            shutil.rmtree(temp_chunk_dir)
        except:
            pass
        
        # Lưu phiên âm vào file
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(transcript)
        
        # Trả về kết quả phiên âm
        relative_path = os.path.join('uploads', 'transcripts', session_id, f"{session_id}_transcript.txt")
        return {
            'path': transcript_path,
            'relative_path': relative_path,
            'text': transcript
        }
    except Exception as e:
        logging.error(f"Lỗi trong transcribe_with_speechrecognition: {str(e)}")
        # Tạo transcript trống để tránh lỗi
        try:
            with open(transcript_path, "w", encoding="utf-8") as f:
                f.write("[Không thể phiên âm âm thanh]")
            
            relative_path = os.path.join('uploads', 'transcripts', session_id, f"{session_id}_transcript.txt")
            return {
                'path': transcript_path,
                'relative_path': relative_path,
                'text': "[Không thể phiên âm âm thanh]"
            }
        except:
            raise

def extract_video_id(url):
    """Trích xuất video ID từ URL YouTube với các dạng URL khác nhau, bao gồm Shorts"""
    # Xử lý URL Shorts đặc biệt
    if 'shorts' in url:
        # Trường hợp URL dạng youtube.com/shorts/ID
        shorts_regex = r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com)/shorts/([^/?&]+)'
        match = re.search(shorts_regex, url)
        if match:
            return match.group(5)
        
        # Trường hợp URL dạng youtube.com/watch?v=shorts/ID
        shorts_watch_regex = r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com)/watch\?v=shorts/([^/?&]+)'
        match = re.search(shorts_watch_regex, url)
        if match:
            return match.group(5)
    
    # URL thông thường
    youtube_regex = r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
    match = re.search(youtube_regex, url)
    if match:
        return match.group(6)
    
    return None

def extract_tiktok_id(url):
    """Extract TikTok video ID from various TikTok URL formats"""
    # Parse the URL
    parsed_url = urlparse(url)
    
    # Check if it's a TikTok domain
    if not ('tiktok.com' in parsed_url.netloc or 'vm.tiktok.com' in parsed_url.netloc):
        return None
    
    # Handle shortened URLs (vm.tiktok.com)
    if 'vm.tiktok.com' in parsed_url.netloc:
        # For shortened URLs, we need to follow the redirect
        try:
            response = requests.head(url, allow_redirects=True)
            redirect_url = response.url
            return extract_tiktok_id(redirect_url)
        except:
            return None
    
    # Regular TikTok URLs
    path_parts = parsed_url.path.strip('/').split('/')
    
    # Format: tiktok.com/@username/video/1234567890
    if len(path_parts) >= 3 and path_parts[1] == 'video':
        return path_parts[2]
    
    # Format: tiktok.com/t/1234567890
    if len(path_parts) >= 2 and path_parts[0] == 't':
        return path_parts[1]
    
    return None

def download_video_from_url(video_url):
    """
    Download video from YouTube or TikTok URL using yt-dlp
    """
    try:
        # Check if it's a TikTok URL
        is_tiktok = 'tiktok.com' in video_url or 'vm.tiktok.com' in video_url
        
        # Create a temporary directory to save the video
        temp_dir = tempfile.mkdtemp()
        
        logging.info(f"Downloading video from: {video_url} (TikTok: {is_tiktok})")
        
        # Configure yt-dlp options
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
            'noplaylist': True,
            'quiet': False,
            'no_warnings': False,
            'ignoreerrors': False,
        }
        
        # Download video using yt-dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(video_url, download=True)
            video_title = info_dict.get('title', 'downloaded_video')
            video_path = ydl.prepare_filename(info_dict)
            
            # Check if file exists after download
            if not os.path.exists(video_path):
                # Try to find file in directory
                files = os.listdir(temp_dir)
                if files:
                    video_path = os.path.join(temp_dir, files[0])
                else:
                    raise Exception("No file found after download")
                    
            logging.info(f"Successfully downloaded video with yt-dlp: {video_path}")
            
            # Create safe filename
            safe_title = secure_filename(video_title)
            if not safe_title:
                safe_title = "downloaded_video"
                
            # Đảm bảo tên file không quá dài
            if len(safe_title) > 50:
                short_uuid = str(uuid.uuid4())[:8]
                safe_title = f"{safe_title[:40]}_{short_uuid}"
            
            # Path to file in uploads folder
            dest_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{safe_title}.mp4")
            
            # Copy file from temp directory to uploads folder
            shutil.copy2(video_path, dest_path)
            
            # Clean up temp directory
            shutil.rmtree(temp_dir)
            
            # Determine video source
            source = "TikTok" if is_tiktok else "YouTube"
            
            return {
                'path': dest_path,
                'title': video_title,
                'filename': f"{safe_title}.mp4",
                'source': source
            }
    
    except Exception as e:
        logging.error(f"Error downloading video: {str(e)}")
        # Clean up temp directory if it exists
        if 'temp_dir' in locals() and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        raise Exception(f"Could not download video: {str(e)}")

# Legacy function for backward compatibility
def download_youtube_video(youtube_url):
    return download_video_from_url(youtube_url)

# Thêm hàm mới để tạo ảnh từ ảnh đã trích xuất
def generate_image_from_keyframe(keyframe_path, prompt, style, session_id):
    """
    Tạo ảnh mới từ khung hình đã trích xuất sử dụng Gemini 2.0 Flash Experimental
    """
    try:
        # Kiểm tra rate limit
        if not check_rate_limit():
            raise Exception("Gemini API rate limit exceeded. Please try again later.")
            
        # Tạo thư mục cho ảnh được tạo ra nếu chưa tồn tại
        gen_session_folder = os.path.join(GENERATED_IMAGES_FOLDER, session_id)
        os.makedirs(gen_session_folder, exist_ok=True)
        
        # Đọc ảnh gốc
        with open(os.path.join('static', keyframe_path), "rb") as img_file:
            image_data = img_file.read()
        
        # Chuẩn bị tham số cho Gemini
        generation_config = {
            "temperature": 0.9,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 2048,
        }
        
        safety_settings = [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
        
        # Tạo mô hình Gemini
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            generation_config=generation_config,
            safety_settings=safety_settings
        )
        
        # Thêm style vào prompt
        full_prompt = f"{prompt}. Style: {style}."
        
        # Tạo nội dung cho request
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": full_prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_data).decode('utf-8')
                        }
                    }
                ]
            }
        ]
        
        # Gọi API Gemini để tạo ảnh
        response = model.generate_content(contents, stream=False)
        
        # Xử lý phản hồi để lấy ảnh
        generated_images = []
        
        for part in response.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                # Lưu ảnh được tạo ra
                image_index = len(generated_images)
                image_filename = f"generated_{image_index}.jpg"
                image_path = os.path.join(gen_session_folder, image_filename)
                
                # Giải mã dữ liệu ảnh
                image_bytes = base64.b64decode(part.inline_data.data)
                
                # Lưu ảnh
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                
                # Đường dẫn tương đối cho frontend
                relative_path = os.path.join('uploads', 'generated', session_id, image_filename)
                generated_images.append({
                    'path': relative_path,
                    'prompt': full_prompt,
                    'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi ảnh
                })
        
        return {
            'generated_images': generated_images,
            'prompt': full_prompt,
            'style': style
        }
        
    except Exception as e:
        logging.error(f"Lỗi khi tạo ảnh mới: {str(e)}")
        raise Exception(f"Không thể tạo ảnh mới: {str(e)}")

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    # Lấy phương pháp từ form
    method = request.form.get('method', 'method1')
    
    # Trích xuất các thông số
    threshold = request.form.get('threshold', 30, type=int)
    max_frames = request.form.get('max_frames', 20, type=int)
    min_scene_length = request.form.get('min_scene_length', 15, type=int)
    
    # Lấy lựa chọn trích xuất âm thanh và phát hiện trùng lặp
    extract_audio = request.form.get('extract_audio', 'false') == 'true'
    detect_duplicates = request.form.get('detect_duplicates', 'true') == 'true'
    
    # Lấy ngưỡng trùng lặp
    duplicate_threshold = request.form.get('duplicate_threshold', 0.85, type=float)
    
    # Khởi tạo biến filename và file_path
    filename = None
    file_path = None
    
    # Kiểm tra nếu có URL video (YouTube hoặc TikTok)
    video_url = request.form.get('video_url', '')
    if not video_url:
        # Compatibility with old code - check for youtube_url
        video_url = request.form.get('youtube_url', '')
    
    if video_url:
        try:
            # Tải video từ URL - không cần validate URL nghiêm ngặt
            video_info = download_video_from_url(video_url)
            file_path = video_info['path']
            filename = video_info['filename']
            
            # Ghi log
            logging.info(f"Đã tải video {video_info['source']}: {video_info['title']}")
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        # Xử lý upload file trực tiếp
        if 'video' not in request.files:
            return jsonify({'error': 'Không tìm thấy video'}), 400
            
        file = request.files['video']
        
        if file.filename == '':
            return jsonify({'error': 'Không có file nào được chọn'}), 400
            
        if not allowed_file(file.filename):
            return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400
            
        # Lưu file tạm thời
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

    # Kiểm tra xem file_path và filename đã được thiết lập chưa
    if not file_path or not filename:
        return jsonify({'error': 'Không thể xử lý file hoặc URL'}), 400

    # Trích xuất khung hình theo phương pháp được chọn
    try:
        if method == 'method1':
            result = extract_keyframes_method1(file_path, threshold, max_frames, detect_duplicates, duplicate_threshold)
        else:
            result = extract_keyframes_method2(file_path, threshold, min_scene_length, max_frames, detect_duplicates, duplicate_threshold)
        
        # Thêm tên file vào kết quả
        result['filename'] = filename
        
        # Nếu là video từ URL, thêm thông tin
        if video_url:
            result['video_url'] = video_url
            if 'video_info' in locals() and 'title' in video_info:
                result['video_title'] = video_info['title']
                result['video_source'] = video_info['source']
        
        # Lưu dữ liệu keyframes vào biến toàn cục
        global keyframesData
        keyframesData = result.get('keyframes', [])
        
        # Trích xuất và phiên âm nếu được yêu cầu
        if extract_audio:
            try:
                # Trích xuất âm thanh
                audio_result = extract_audio_from_video(file_path)
                result['audio'] = audio_result
                
                # Phiên âm
                transcript_result = transcribe_audio(audio_result['path'], result['session_id'])
                result['transcript'] = transcript_result
            except Exception as audio_error:
                logging.error(f"Lỗi khi xử lý âm thanh: {str(audio_error)}")
                result['audio_error'] = str(audio_error)
        
        return jsonify(result)
    except Exception as e:
        logging.error(f"Lỗi khi xử lý video: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/delete-keyframe', methods=['POST'])
def delete_keyframe():
    """API endpoint để xóa một khung hình"""
    try:
        data = request.json
        frame_path = data.get('frame_path')
        session_id = data.get('session_id')
        frame_id = data.get('frame_id')
        
        if not frame_path or not session_id:
            return jsonify({'error': 'Thiếu thông tin cần thiết'}), 400
        
        # Đường dẫn đầy đủ đến file ảnh
        full_path = os.path.join('static', frame_path)
        
        # Kiểm tra nếu file tồn tại
        if not os.path.exists(full_path):
            return jsonify({'error': 'Không tìm thấy file ảnh'}), 404
        
        # Xóa file
        os.remove(full_path)
        logging.info(f"Đã xóa khung hình: {frame_path}")
        
        # Cập nhật keyframesData
        global keyframesData
        keyframesData = [frame for frame in keyframesData if frame.get('id') != frame_id]
        
        return jsonify({
            'success': True,
            'message': 'Đã xóa khung hình thành công',
            'deleted_frame_id': frame_id
        })
    except Exception as e:
        logging.error(f"Lỗi khi xóa khung hình: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/remove-duplicates', methods=['POST'])
def remove_duplicates():
    """API endpoint để xóa tất cả các khung hình trùng lặp"""
    try:
        data = request.json
        session_id = data.get('session_id')
        duplicate_frames = data.get('duplicate_frames', [])
        
        if not session_id:
            return jsonify({'error': 'Thiếu thông tin session ID'}), 400
        
        if not duplicate_frames:
            return jsonify({'message': 'Không có khung hình trùng lặp để xóa'}), 200
        
        deleted_frames = []

        # Xóa từng khung hình trùng lặp
        for frame in duplicate_frames:
            frame_path = frame.get('path')
            frame_id = frame.get('id')
            
            if not frame_path:
                continue
                
            # Đường dẫn đầy đủ đến file ảnh
            full_path = os.path.join('static', frame_path)
            
            # Kiểm tra nếu file tồn tại
            if os.path.exists(full_path):
                # Xóa file
                os.remove(full_path)
                deleted_frames.append(frame_id)
                logging.info(f"Đã xóa khung hình trùng lặp: {frame_path}")
                
                # Cập nhật keyframesData
                global keyframesData
                keyframesData = [f for f in keyframesData if f.get('id') != frame_id]
        
        return jsonify({
            'success': True,
            'message': f'Đã xóa {len(deleted_frames)} khung hình trùng lặp',
            'deleted_frames': deleted_frames
        })
    except Exception as e:
        logging.error(f"Lỗi khi xóa khung hình trùng lặp: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/generate-script', methods=['POST'])
def generate_script():
    """API endpoint để trích xuất kịch bản từ các khung hình"""
    try:
        data = request.json
        session_id = data.get('session_id')
        if not session_id:
            return jsonify({'error': 'Không có session ID'}), 400
            
        # Lấy temperature từ request, mặc định là 0.7
        temperature = data.get('temperature', 0.9)
        
        # Đảm bảo temperature nằm trong khoảng hợp lệ (0.0 - 1.0)
        temperature = max(0.0, min(1.0, float(temperature)))
        
        # Lấy đường dẫn đến thư mục chứa khung hình
        keyframes_path = os.path.join(KEYFRAMES_FOLDER, session_id)
        if not os.path.exists(keyframes_path):
            return jsonify({'error': 'Không tìm thấy thư mục khung hình'}), 404
            
        # Lấy danh sách các file khung hình, sắp xếp theo thứ tự
        files = sorted([f for f in os.listdir(keyframes_path) if os.path.isfile(os.path.join(keyframes_path, f))],
                      key=lambda x: int(x.split('_')[1].split('.')[0]) if '_' in x else 0)
        
        if not files:
            return jsonify({'error': 'Không có khung hình nào được tìm thấy'}), 404
            
        # Tạo prompt cho Gemini
        prompt = "Từ hình ảnh frame_0 đến frame cuối cùng, hãy phân tích và đưa tôi lại kịch bản câu truyện trên."
        
        # Kiểm tra nếu có transcript để bổ sung vào prompt
        transcript_path = os.path.join(TRANSCRIPTS_FOLDER, session_id, f"{session_id}_transcript.txt")
        has_transcript = False
        
        if os.path.exists(transcript_path):
            has_transcript = True
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcript = f.read()
            
            prompt += f"\n\nĐây là phiên âm từ audio của video, hãy sử dụng để bổ sung cho phân tích của bạn: {transcript}"
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            return jsonify({'error': 'Gemini API rate limit exceeded. Please try again later.'}), 429
        
        # Cấu hình model Gemini - Sử dụng mô hình gemini-1.5-flash với temperature tùy chỉnh
        generation_config = {
            "temperature": temperature,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 2048,
        }
        
        safety_settings = [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
        
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            generation_config=generation_config,
            safety_settings=safety_settings
        )
        
        # Chuẩn bị danh sách hình ảnh để gửi đến Gemini
        image_parts = []
        for file in files[:6]:  # Giới hạn số lượng hình ảnh để tránh vượt quá quota
            file_path = os.path.join(keyframes_path, file)
            
            # Đọc và mã hóa hình ảnh
            with open(file_path, "rb") as img_file:
                image_data = img_file.read()
            
            # Thêm hình ảnh vào danh sách
            image_parts.append({
                "mime_type": "image/jpeg",
                "data": base64.b64encode(image_data).decode('utf-8')
            })
        
        # Tạo nội dung cho request
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
        
        # Thêm hình ảnh vào parts của message đầu tiên
        for img in image_parts:
            contents[0]["parts"].append({"inline_data": img})
        
        # Gọi API Gemini với cấu trúc mới
        try:
            response = model.generate_content(contents)
            
            # Trả về kết quả
            return jsonify({
                'script': response.text,
                'prompt': prompt,
                'num_frames_analyzed': len(image_parts),
                'temperature': temperature,
                'has_transcript': has_transcript
            })
        except Exception as gemini_error:
            logging.error(f"Gemini API error: {str(gemini_error)}")
            return jsonify({
                'error': "Lỗi khi gọi Gemini API. Có thể đã vượt quá giới hạn API. Vui lòng thử lại sau.",
                'details': str(gemini_error)
            }), 429
        
    except Exception as e:
        logging.error(f"Lỗi khi trích xuất kịch bản: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/generate-image', methods=['POST'])
def generate_image():
    """API endpoint để tạo ảnh mới từ khung hình đã trích xuất"""
    try:
        data = request.json
        keyframe_path = data.get('keyframe_path')
        session_id = data.get('session_id')
        prompt = data.get('prompt', 'Tạo một phiên bản mới của hình ảnh này')
        style = data.get('style', 'digital art')
        
        if not keyframe_path or not session_id:
            return jsonify({'error': 'Thiếu thông tin cần thiết'}), 400
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            return jsonify({'error': 'Gemini API rate limit exceeded. Please try again later.'}), 429
        
        # Gọi hàm tạo ảnh
        result = generate_image_from_keyframe(keyframe_path, prompt, style, session_id)
        
        return jsonify(result)
    except Exception as e:
        logging.error(f"Lỗi khi tạo ảnh: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/download/<session_id>', methods=['GET'])
def download_keyframes(session_id):
    # Đường dẫn đến thư mục chứa khung hình
    keyframes_path = os.path.join(KEYFRAMES_FOLDER, session_id)
    
    # Kiểm tra nếu thư mục tồn tại
    if not os.path.exists(keyframes_path):
        return jsonify({'error': 'Không tìm thấy phiên trích xuất'}), 404
        
    # Tạo danh sách các tệp trong thư mục
    files = [f for f in os.listdir(keyframes_path) if os.path.isfile(os.path.join(keyframes_path, f))]
    
    # Trả về danh sách các đường dẫn đến các tệp
    file_paths = [os.path.join('uploads', 'keyframes', session_id, f) for f in files]
    
    return jsonify({'files': file_paths})

@app.route('/download-transcript/<session_id>', methods=['GET'])
def download_transcript(session_id):
    """API endpoint để tải xuống phiên âm"""
    transcript_path = os.path.join(TRANSCRIPTS_FOLDER, session_id, f"{session_id}_transcript.txt")
    
    # Kiểm tra nếu file tồn tại
    if not os.path.exists(transcript_path):
        return jsonify({'error': 'Không tìm thấy phiên âm'}), 404
    
    # Đọc nội dung phiên âm
    with open(transcript_path, 'r', encoding='utf-8') as f:
        transcript = f.read()
    
    # Trả về phiên âm
    return jsonify({
        'transcript': transcript,
        'file_path': os.path.join('uploads', 'transcripts', session_id, f"{session_id}_transcript.txt")
    })


@app.route('/analyze-frame-differences', methods=['POST'])
def analyze_frame_differences():
    """API endpoint để phân tích độ khác biệt giữa các khung hình"""
    try:
        data = request.json
        session_id = data.get('session_id')
        difference_threshold = data.get('difference_threshold', 0.3)
        
        if not session_id:
            return jsonify({'error': 'Thiếu thông tin session ID'}), 400
            
        # Lấy đường dẫn đến thư mục chứa khung hình
        keyframes_path = os.path.join(KEYFRAMES_FOLDER, session_id)
        if not os.path.exists(keyframes_path):
            return jsonify({'error': 'Không tìm thấy thư mục khung hình'}), 404
            
        # Lấy dữ liệu keyframes hiện tại
        global keyframesData
        current_keyframes = keyframesData.copy()
        
        # Chuẩn bị danh sách khung hình cho phân tích
        frames_to_analyze = []
        for frame in current_keyframes:
            full_path = os.path.join('static', frame['path'])
            if os.path.exists(full_path):
                frames_to_analyze.append({
                    'id': frame['id'],
                    'path': frame['path'],
                    'full_path': full_path
                })
        
        # Phân tích độ khác biệt giữa các khung hình
        similar_frames = []
        
        # Sử dụng perceptual hashing để so sánh các khung hình
        frame_hashes = []
        for frame in frames_to_analyze:
            try:
                img = Image.open(frame['full_path'])
                hash_value = imagehash.phash(img)
                frame_hashes.append({
                    'id': frame['id'],
                    'path': frame['path'],
                    'hash': hash_value
                })
            except Exception as e:
                logging.error(f"Error processing {frame['path']}: {str(e)}")
        
        # So sánh từng cặp khung hình
        for i in range(len(frame_hashes)):
            for j in range(i+1, len(frame_hashes)):
                # Tính khoảng cách giữa các hash
                hash_dist = frame_hashes[i]['hash'] - frame_hashes[j]['hash']
                
                # Chuyển đổi khoảng cách hash thành độ tương đồng (0-1)
                similarity = 1 - (hash_dist / 64)
                
                # Nếu độ tương đồng cao (độ khác biệt thấp), đánh dấu khung hình j là tương tự khung hình i
                if similarity > (1 - difference_threshold):
                    similar_frames.append({
                        'id': frame_hashes[j]['id'],
                        'path': frame_hashes[j]['path'],
                        'similarity': similarity,
                        'similar_to': frame_hashes[i]['path']
                    })
        
        # Cập nhật trạng thái của các khung hình
        for frame in current_keyframes:
            frame['is_similar'] = False
            for similar in similar_frames:
                if frame['id'] == similar['id']:
                    frame['is_similar'] = True
                    frame['similarity'] = similar['similarity']
                    frame['similar_to'] = similar['similar_to']
                    break
        
        # Cập nhật keyframesData toàn cục
        keyframesData = current_keyframes
        
        # Trả về kết quả
        return jsonify({
            'keyframes': current_keyframes,
            'difference_threshold': difference_threshold
        })
        
    except Exception as e:
        logging.error(f"Lỗi khi phân tích độ khác biệt: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/remove-similar-frames', methods=['POST'])
def remove_similar_frames():
    """API endpoint để xóa tất cả các khung hình có độ khác biệt thấp"""
    try:
        data = request.json
        session_id = data.get('session_id')
        similar_frames = data.get('similar_frames', [])
        
        if not session_id:
            return jsonify({'error': 'Thiếu thông tin session ID'}), 400
        
        if not similar_frames:
            return jsonify({'message': 'Không có khung hình tương tự để xóa'}), 200
        
        deleted_frames = []
        
        # Xóa từng khung hình tương tự
        for frame in similar_frames:
            frame_path = frame.get('path')
            frame_id = frame.get('id')
            
            if not frame_path:
                continue
                
            # Đường dẫn đầy đủ đến file ảnh
            full_path = os.path.join('static', frame_path)
            
            # Kiểm tra nếu file tồn tại
            if os.path.exists(full_path):
                # Xóa file
                os.remove(full_path)
                deleted_frames.append(frame_id)
                logging.info(f"Đã xóa khung hình tương tự: {frame_path}")
                
                # Cập nhật keyframesData
                global keyframesData
                keyframesData = [f for f in keyframesData if f.get('id') != frame_id]
        
        return jsonify({
            'success': True,
            'message': f'Đã xóa {len(deleted_frames)} khung hình tương tự',
            'deleted_frames': deleted_frames
        })
        
    except Exception as e:
        logging.error(f"Lỗi khi xóa khung hình tương tự: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)