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
from azure_video_indexer import AzureVideoIndexer
from flask_cors import CORS
import collections
import openai


app = Flask(__name__)
CORS(app)

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

# Lấy Leonardo.ai API key từ biến môi trường
def get_leonardo_api_key():
    return os.getenv("LEONARDO_API_KEY", "")

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

def is_transition_frame(frame, gray=None, diff_history=None, threshold=0.4):
    """
    Phát hiện nếu một khung hình có khả năng là một phần của hiệu ứng fade transition
    
    Sử dụng nhiều chỉ số đánh giá:
    1. Phân tích độ tương phản và độ sáng
    2. Phát hiện cạnh
    3. Phân tích mẫu thời gian sử dụng lịch sử khác biệt
    
    Tham số:
    - threshold: Giá trị từ 0-1 kiểm soát độ nhạy (cao hơn = nghiêm ngặt hơn)
    
    Trả về:
    - Boolean cho biết khung hình có khả năng là transition hay không
    """
    # Chuyển sang ảnh xám nếu chưa có
    if gray is None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Tính toán thống kê ảnh
    mean_val = np.mean(gray)
    std_val = np.std(gray)
    
    # 1. Kiểm tra độ tương phản - transitions thường có độ tương phản thấp hơn
    contrast_score = std_val / 128.0  # Chuẩn hóa về khoảng 0-1
    low_contrast = contrast_score < (0.1 + threshold * 0.2)
    
    # 2. Phát hiện cạnh - transitions có ít cạnh mạnh hơn
    edges = cv2.Canny(gray, 100, 200)
    edge_density = np.count_nonzero(edges) / (gray.shape[0] * gray.shape[1])
    low_edge_density = edge_density < (0.01 + threshold * 0.05)
    
    # 3. Kiểm tra mẫu thời gian - fade transitions thể hiện một mẫu cụ thể trong diff_history
    temporal_pattern = False
    if diff_history and len(diff_history) >= 3:
        # Kiểm tra sự khác biệt tăng dần hoặc giảm dần (đặc trưng của fades)
        diffs = np.array(diff_history[-3:])
        is_increasing = np.all(np.diff(diffs) > 0)
        is_decreasing = np.all(np.diff(diffs) < 0)
        temporal_pattern = is_increasing or is_decreasing
    
    # Kết hợp các chỉ số - trọng số dựa trên ngưỡng
    confidence = 0
    
    if low_contrast:
        confidence += 0.4
    
    if low_edge_density:
        confidence += 0.4
    
    if temporal_pattern:
        confidence += 0.2
    
    # Trả về true nếu độ tin cậy kết hợp vượt quá ngưỡng
    return confidence > threshold

def extract_keyframes_with_transition_detection(video_path, threshold=30, max_frames=20, transition_threshold=0.4):
    """
    Trích xuất keyframes với phát hiện transition
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
    diff_history = collections.deque(maxlen=5)  # Lưu trữ lịch sử khác biệt
    
    # Tính toán bước nhảy để tăng hiệu suất với video dài
    frame_skip = max(1, int(total_frames / (10 * fps)))  # Xử lý khoảng 10 khung hình mỗi giây
    
    logging.info(f"Bắt đầu xử lý video (Transition Aware): {video_path}")
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
                'is_transition': False,
                'id': str(uuid.uuid4())[:8]  # Thêm ID duy nhất cho mỗi khung hình
            })
            frame_count += 1
            continue
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Tính toán sự khác biệt
        diff = cv2.absdiff(gray, prev_frame)
        mean_diff = np.mean(diff)
        diff_history.append(mean_diff)
        
        # Nếu có sự thay đổi lớn, lưu khung hình
        if mean_diff > threshold:
            # Kiểm tra xem đây có phải là khung hình transition không
            is_trans = is_transition_frame(frame, gray, diff_history, transition_threshold)
            
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
                'is_transition': is_trans,
                'id': str(uuid.uuid4())[:8]
            })
            
        prev_frame = gray
        frame_count += 1
        
        # Giới hạn số lượng khung hình
        if max_frames is not None and len(keyframes) >= max_frames:
            break
        
    cap.release()
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': session_id,
        'keyframes': keyframes,
        'total_frames': total_frames,
        'fps': fps,
        'duration': total_frames / fps,
        'width': width,
        'height': height,
        'method': 'transition_aware',
        'transition_threshold': transition_threshold
    }

# Cập nhật các hàm trích xuất khung hình để sử dụng phát hiện trùng lặp

def extract_keyframes_method1(video_path, threshold=30, max_frames=20):
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
        if max_frames is not None and len(keyframes) >= max_frames:
            break
        
    cap.release()
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': session_id,  # Sử dụng session_id an toàn
        'keyframes': keyframes,
        'total_frames': total_frames,
        'fps': fps,
        'duration': total_frames / fps,
        'width': width,
        'height': height,
        'method': 'frame_difference'
    }

def extract_keyframes_method2(video_path, threshold=30, min_scene_length=15, max_frames=20):
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
    
    while cap.isOpened() and (max_frames is None or len(keyframes) < max_frames):
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
    if scene_start < frame_count - min_scene_length and (max_frames is None or len(scenes) < max_frames):
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
        'method': 'scene_detection'
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
    
    # Lấy lựa chọn trích xuất âm thanh
    extract_audio = request.form.get('extract_audio', 'false') == 'true'
    
    # Lấy ngưỡng transition
    transition_threshold = request.form.get('transition_threshold', 0.4, type=float)
    
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
            # Frame difference method
            result = extract_keyframes_method1(file_path, threshold, max_frames)
        elif method == 'method2':
            # Transition detection method
            result = extract_keyframes_with_transition_detection(file_path, threshold, max_frames, transition_threshold)
        else:
            # Default to method1 if invalid method is specified
            result = extract_keyframes_method1(file_path, threshold, max_frames)
        
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

@app.route('/upload-method1', methods=['POST'])
def upload_file_method1():
    # Trích xuất các thông số
    threshold = request.form.get('threshold', 30, type=int)
    max_frames = request.form.get('max_frames', 20, type=int)
    
    # Lấy lựa chọn trích xuất âm thanh
    extract_audio = request.form.get('extract_audio', 'false') == 'true'
    
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

    # Trích xuất khung hình theo phương pháp 1
    try:
        # Frame difference method - removed detect_duplicates and duplicate_threshold
        result = extract_keyframes_method1(file_path, threshold, max_frames)
        
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

@app.route('/upload-method2', methods=['POST'])
def upload_file_method2():
    # Trích xuất các thông số
    threshold = request.form.get('threshold', 30, type=int)
    max_frames = request.form.get('max_frames', 20, type=int)
    min_scene_length = request.form.get('min_scene_length', 15, type=int)
    
    # Lấy lựa chọn trích xuất âm thanh
    extract_audio = request.form.get('extract_audio', 'false') == 'true'
    
    # Lấy ngưỡng transition
    transition_threshold = request.form.get('transition_threshold', 0.4, type=float)
    
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

    # Trích xuất khung hình theo phương pháp 2
    try:
        # Transition detection method - removed detect_duplicates and duplicate_threshold
        result = extract_keyframes_with_transition_detection(file_path, threshold, max_frames, transition_threshold=transition_threshold)
        
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

@app.route('/extract-keyframes-advanced', methods=['POST'])
def extract_keyframes_advanced():
    """API endpoint cho phương pháp trích xuất khung hình nâng cao với phát hiện transition"""
    # Lấy các tham số phương pháp
    threshold = request.form.get('threshold', 30, type=int)
    max_frames = request.form.get('max_frames', 20, type=int)
    
    # Lấy các tùy chọn trích xuất
    extract_audio = request.form.get('extract_audio', 'false') == 'true'
    detect_duplicates = request.form.get('detect_duplicates', 'true') == 'true'
    
    # Lấy các ngưỡng
    duplicate_threshold = request.form.get('duplicate_threshold', 0.85, type=float)
    transition_threshold = request.form.get('transition_threshold', 0.4, type=float)
    
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
            # Tải video từ URL
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

    # Trích xuất khung hình với phát hiện transition
    try:
        result = extract_keyframes_with_transition_detection(
            file_path, 
            threshold, 
            max_frames, 
            detect_duplicates, 
            duplicate_threshold,
            transition_threshold
        )
        
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
        keyframes_data = data.get('keyframes_data')
        transcript_text = data.get('transcript_text')
        
        # Kiểm tra nếu không có dữ liệu nào
        if not session_id and not keyframes_data:
            return jsonify({'error': 'Không có dữ liệu khung hình'}), 400
            
        # Lấy temperature từ request, mặc định là 0.7
        temperature = data.get('temperature', 0.9)
        
        # Đảm bảo temperature nằm trong khoảng hợp lệ (0.0 - 1.0)
        temperature = max(0.0, min(1.0, float(temperature)))
        
        # Xử lý dựa trên session ID
        if session_id:
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
            
            # Cấu hình model Gemini
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
            for file in files[:10]:  # Giới hạn số lượng hình ảnh
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
            
            # Gọi API Gemini
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
        
        # Xử lý dựa trên dữ liệu khung hình trực tiếp (cho Azure)
        elif keyframes_data:
            # Tạo prompt cho Gemini
            prompt = "Từ hình ảnh đầu tiên đến hình ảnh cuối cùng, hãy phân tích từng ảnh và đưa tôi lại kịch bản câu truyện trên."
            
            # Thêm transcript nếu có
            has_transcript = False
            if transcript_text:
                has_transcript = True
                prompt += f"\n\nĐây là phiên âm từ audio của video, hãy sử dụng để bổ sung cho phân tích của bạn: {transcript_text}"
            
            # Kiểm tra rate limit
            if not check_rate_limit():
                return jsonify({'error': 'Gemini API rate limit exceeded. Please try again later.'}), 429
            
            # Cấu hình model Gemini
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
            contents = [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
            
            # Thêm tối đa 6 hình ảnh từ dữ liệu khung hình
            image_count = min(10, len(keyframes_data))
            for i in range(image_count):
                frame = keyframes_data[i]
                
                # Kiểm tra loại đường dẫn để xử lý phù hợp
                if 'path' in frame:
                    # Trường hợp 1: Đường dẫn base64 trực tiếp
                    if frame['path'].startswith('data:image/jpeg;base64,'):
                        # Trích xuất phần base64 từ data URL
                        base64_data = frame['path'].split(',')[1]
                        
                        # Thêm hình ảnh vào request
                        contents[0]["parts"].append({
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64_data
                            }
                        })
                    # Trường hợp 2: Đường dẫn file trong thư mục keyframes
                    else:
                        # Đường dẫn đến file hình ảnh
                        file_path = os.path.join('static', frame['path'])
                        
                        if os.path.exists(file_path):
                            # Đọc và mã hóa hình ảnh
                            try:
                                with open(file_path, "rb") as img_file:
                                    image_data = img_file.read()
                                
                                # Thêm hình ảnh vào request
                                contents[0]["parts"].append({
                                    "inline_data": {
                                        "mime_type": "image/jpeg",
                                        "data": base64.b64encode(image_data).decode('utf-8')
                                    }
                                })
                            except Exception as img_error:
                                logging.error(f"Error processing image {file_path}: {str(img_error)}")
                        else:
                            logging.warning(f"Image file not found: {file_path}")
            
            # Gọi API Gemini
            try:
                response = model.generate_content(contents)
                
                # Trả về kết quả
                return jsonify({
                    'script': response.text,
                    'prompt': prompt,
                    'num_frames_analyzed': image_count,
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


@app.route('/generate-gemini-prompt', methods=['POST'])
def generate_gemini_prompt():
    """API endpoint để tạo prompt từ hình ảnh sử dụng Gemini 2.0 Flash"""
    try:
        data = request.json
        keyframe_path = data.get('keyframe_path')
        
        if not keyframe_path:
            return jsonify({'error': 'Thiếu đường dẫn hình ảnh'}), 400
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            return jsonify({'error': 'Gemini API rate limit exceeded. Please try again later.'}), 429
        
        # Đọc hình ảnh
        full_path = os.path.join('static', keyframe_path)
        if not os.path.exists(full_path):
            return jsonify({'error': 'Không tìm thấy hình ảnh'}), 404
            
        with open(full_path, "rb") as img_file:
            image_data = img_file.read()
        
        # Cấu hình Gemini model
        generation_config = {
            "temperature": 0.9,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 4096,
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
        
        # Prompt cho Gemini
        prompt = "Write an English prompt to create a similar image. Describe in detail the character's shape, features, color and background. Only return the best prompt, without any other words.."
        
        # Tạo nội dung cho request
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_data).decode('utf-8')
                        }
                    }
                ]
            }
        ]
        
        # Gọi API Gemini
        response = model.generate_content(contents)
        
        return jsonify({
            'success': True,
            'prompt': response.text
        })
        
    except Exception as e:
        logging.error(f"Error generating prompt with Gemini: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/generate-prompt', methods=['POST'])
def generate_prompt():
    """API endpoint to generate a prompt for an image using ChatGPT"""
    try:
        data = request.json
        keyframe_path = data.get('keyframe_path')
        
        if not keyframe_path:
            return jsonify({'error': 'Missing keyframe path'}), 400
        
        # Check if path exists
        full_path = os.path.join('static', keyframe_path)
        if not os.path.exists(full_path):
            return jsonify({'error': 'Image not found'}), 404
        
        # Read image and convert to base64
        with open(full_path, "rb") as img_file:
            image_data = img_file.read()
            base64_image = base64.b64encode(image_data).decode('utf-8')
        
        # Call OpenAI API with the custom GPT
        try:
            import openai
            
            # Set your OpenAI API key
            openai_api_key = os.getenv("OPENAI_API_KEY", "")
            if not openai_api_key:
                return jsonify({'error': 'OpenAI API key not configured'}), 500
                
            # Create OpenAI client
            client = openai.OpenAI(api_key=openai_api_key)
            
            # Call the API with the current vision model (gpt-4o)
            response = client.chat.completions.create(
                model="gpt-4o",  # Updated to use gpt-4o which supports vision
                messages=[
                    {"role": "system", "content": "You are RoMidJourneyRo MJ Prompt Generator v6, a specialized prompt generator. Your task is to create detailed, creative prompts for images that could be used with Midjourney or similar AI image generators."},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Hãy viết cho tôi 1 prompt hoàn chỉnh cho hình ảnh này. Prompt nên bao gồm chi tiết về chủ thể, phong cách, màu sắc, ánh sáng và các thông số kỹ thuật phù hợp."},
                        {"type": "image_url", "image_url": f"data:image/jpeg;base64,{base64_image}"}
                    ]}
                ],
                max_tokens=1000
            )
            
            # Extract the generated prompt
            generated_prompt = response.choices[0].message.content
            
            return jsonify({
                'success': True,
                'prompt': generated_prompt
            })
            
        except ImportError:
            # Fallback if OpenAI package is not installed
            return jsonify({
                'success': False,
                'error': 'OpenAI package not installed. Please install it with: pip install openai>=1.0.0'
            }), 500
        except Exception as api_error:
            logging.error(f"OpenAI API error: {str(api_error)}")
            return jsonify({
                'success': False,
                'error': f"Error calling OpenAI API: {str(api_error)}"
            }), 500
            
    except Exception as e:
        logging.error(f"Error generating prompt: {str(e)}")
        return jsonify({'error': str(e)}), 500


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
                
            if not allowed_file(file.filename):
                return jsonify({'error': 'File format not supported'}), 400
                
            # Save temporary file
            filename = secure_filename(file.filename)
            video_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(video_path)
        
        # Create save path for images - use the same KEYFRAMES_FOLDER as method 1
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


# Helper functions for Azure Video Indexer
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




def time_to_seconds(time_str):
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




def format_srt_time(time_str):
    """Convert time to SRT format HH:MM:SS,mmm"""
    try:
        # Convert to seconds
        total_seconds = time_to_seconds(time_str)
        
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

# Thêm route để phục vụ tài liệu Swagger
@app.route('/swagger')
def swagger_ui():
    return render_template('swagger_ui.html')

@app.route('/swagger.yaml')
def swagger_yaml():
    return send_from_directory('.', 'swagger.yaml')

@app.route('/generate-leonardo-image', methods=['POST'])
def generate_leonardo_image():
    """API endpoint to generate an image using Leonardo.ai API"""
    try:
        data = request.json
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify({'error': 'Missing prompt'}), 400
        
        # Get Leonardo.ai API key
        api_key = get_leonardo_api_key()
        if not api_key:
            return jsonify({'error': 'Leonardo.ai API key not configured. Please set LEONARDO_API_KEY in your environment.'}), 500
        
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
            "modelId": "b2614463-296c-462a-9586-aafdb8f00e36" , # Leonardo Creative model
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
            return jsonify({
                'success': False,
                'error': f"Error calling Leonardo.ai API: {response_data.get('error', 'Unknown error')}"
            }), response.status_code
        
        # The response contains a generation ID which we need to poll to get the generated images
        generation_id = response_data.get('sdGenerationJob', {}).get('generationId')
        
        if not generation_id:
            return jsonify({
                'success': False,
                'error': 'No generation ID returned from Leonardo.ai'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Image generation started',
            'generation_id': generation_id
        })
        
    except Exception as e:
        logging.error(f"Error generating image with Leonardo.ai: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/get-leonardo-image/<generation_id>', methods=['GET'])
def get_leonardo_image(generation_id):
    """API endpoint to get a generated image from Leonardo.ai using the generation ID"""
    try:
        # Get Leonardo.ai API key
        api_key = get_leonardo_api_key()
        if not api_key:
            return jsonify({'error': 'Leonardo.ai API key not configured. Please set LEONARDO_API_KEY in your environment.'}), 500
        
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
            return jsonify({
                'success': False,
                'error': f"Error checking generation status: {response_data.get('error', 'Unknown error')}"
            }), response.status_code
        
        # Extract generation data
        generation_data = response_data.get('generations_by_pk', {})
        status = generation_data.get('status', '')
        
        # If the generation is not complete yet
        if status != 'COMPLETE':
            return jsonify({
                'success': True,
                'status': status,
                'complete': False,
                'message': f'Generation is in progress: {status}'
            })
        
        # Get the generated images
        generated_images = generation_data.get('generated_images', [])
        
        if not generated_images:
            return jsonify({
                'success': False,
                'error': 'No images generated'
            }), 500
        
        # Extract image data
        image_data = []
        for img in generated_images:
            image_data.append({
                'id': img.get('id'),
                'url': img.get('url'),
                'nsfw': img.get('nsfw', False)
            })
        
        return jsonify({
            'success': True,
            'status': status,
            'complete': True,
            'images': image_data,
            'prompt': generation_data.get('prompt', ''),
            'width': generation_data.get('imageWidth'),
            'height': generation_data.get('imageHeight')
        })
        
    except Exception as e:
        logging.error(f"Error getting Leonardo.ai generation status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/generate-new-prompt', methods=['POST'])
def generate_new_prompt():
    """
    Tạo prompt mới từ prompt cũ sử dụng Gemini API
    """
    try:
        # Lấy prompt gốc từ request
        data = request.json
        original_prompt = data.get('original_prompt', '')
        
        if not original_prompt:
            return jsonify({
                'success': False,
                'error': 'Không có prompt gốc được cung cấp'
            }), 400
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            return jsonify({
                'success': False,
                'error': 'Đã vượt quá giới hạn tốc độ API. Vui lòng thử lại sau.'
            }), 429
        
        # Sử dụng Gemini để tạo prompt mới
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            # Xây dựng hướng dẫn cho Gemini
            instruction = f"""
            Viết một prompt mới cho AI tạo hình ảnh, dựa trên prompt sau đây:
            "{original_prompt}"
            
            Prompt mới cần:
            1. Giữ lại chủ đề và ý tưởng chính
            2. Thay đổi cách mô tả, phong cách hoặc bối cảnh
            3. Thêm các chi tiết mới sáng tạo
            4. Viết hoàn toàn bằng tiếng Anh
            5. Chỉ trả về prompt mới, không giải thích hay bình luận
            """
            
            # Gửi yêu cầu đến Gemini
            response = model.generate_content(instruction)
            
            # Xử lý kết quả
            new_prompt = response.text.strip()
            
            # Đảm bảo prompt mới không quá dài
            if len(new_prompt) > 1000:
                new_prompt = new_prompt[:1000]
            
            return jsonify({
                'success': True,
                'prompt': new_prompt,
                'original_prompt': original_prompt
            })
        
        except Exception as e:
            logging.error(f"Lỗi khi sử dụng Gemini API: {str(e)}")
            return jsonify({
                'success': False,
                'error': f"Lỗi khi tạo prompt mới: {str(e)}"
            }), 500
    
    except Exception as e:
        logging.error(f"Lỗi trong quá trình xử lý yêu cầu: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Lỗi server: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)