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

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Cấu hình
UPLOAD_FOLDER = os.path.join('static', 'uploads')
KEYFRAMES_FOLDER = os.path.join('static', 'uploads', 'keyframes')
GENERATED_IMAGES_FOLDER = os.path.join('static', 'uploads', 'generated')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
API_KEY_FILE = 'api_key.txt'  # File chứa API key

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # Giới hạn 500MB

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

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_video_name_without_extension(video_path):
    """Lấy tên video không có đuôi mở rộng"""
    base_name = os.path.basename(video_path)
    return os.path.splitext(base_name)[0]

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
    
    # Tạo thư mục dựa trên tên video
    session_folder = os.path.join(KEYFRAMES_FOLDER, video_name)
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
            relative_path = os.path.join('uploads', 'keyframes', video_name, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'diff_value': 0
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
            relative_path = os.path.join('uploads', 'keyframes', video_name, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'diff_value': float(mean_diff)
            })
            
        prev_frame = gray
        frame_count += 1
        
        # Giới hạn số lượng khung hình
        if len(keyframes) >= max_frames:
            break
        
    cap.release()
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': video_name,  # Sử dụng tên video làm session_id
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
    
    # Tạo thư mục dựa trên tên video
    session_folder = os.path.join(KEYFRAMES_FOLDER, video_name)
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
            relative_path = os.path.join('uploads', 'keyframes', video_name, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': frame_count,
                'timestamp': frame_count / fps,
                'scene_id': 0,
                'hist_diff': 0
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
                relative_path = os.path.join('uploads', 'keyframes', video_name, frame_filename)
                keyframes.append({
                    'path': relative_path,
                    'frame_number': mid_frame_idx,
                    'timestamp': mid_frame_idx / fps,
                    'scene_id': len(scenes),
                    'hist_diff': float(hist_diff)
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
            relative_path = os.path.join('uploads', 'keyframes', video_name, frame_filename)
            keyframes.append({
                'path': relative_path,
                'frame_number': mid_frame_idx,
                'timestamp': mid_frame_idx / fps,
                'scene_id': len(scenes),
                'hist_diff': 0
            })
    
    cap.release()
    
    # Trả về thông tin các khung hình và ID phiên
    return {
        'session_id': video_name,  # Sử dụng tên video làm session_id
        'keyframes': keyframes,
        'scenes': scenes,
        'total_frames': total_frames,
        'fps': fps,
        'duration': total_frames / fps,
        'width': width,
        'height': height,
        'method': 'scene_detection'
    }

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
                    'prompt': full_prompt
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
            result = extract_keyframes_method1(file_path, threshold, max_frames)
        else:
            result = extract_keyframes_method2(file_path, threshold, min_scene_length, max_frames)
        
        # Thêm tên file vào kết quả
        result['filename'] = filename
        
        # Nếu là video từ URL, thêm thông tin
        if video_url:
            result['video_url'] = video_url
            if 'video_info' in locals() and 'title' in video_info:
                result['video_title'] = video_info['title']
                result['video_source'] = video_info['source']
        
        return jsonify(result)
    except Exception as e:
        logging.error(f"Lỗi khi xử lý video: {str(e)}")
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
        for file in files[:8]:  # Giới hạn số lượng hình ảnh (Gemini có giới hạn)
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
        response = model.generate_content(contents)
        
        # Trả về kết quả
        return jsonify({
            'script': response.text,
            'prompt': prompt,
            'num_frames_analyzed': len(image_parts),
            'temperature': temperature
        })
        
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

if __name__ == '__main__':
    app.run(debug=True)