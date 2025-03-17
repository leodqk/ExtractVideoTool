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

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Cấu hình
UPLOAD_FOLDER = os.path.join('static', 'uploads')
KEYFRAMES_FOLDER = os.path.join('static', 'uploads', 'keyframes')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # Giới hạn 500MB

# Cấu hình Gemini API
GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"  # Thay thế bằng API key thật
genai.configure(api_key=GEMINI_API_KEY)

# Tạo thư mục nếu chưa tồn tại
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(KEYFRAMES_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
    
    # Tạo ID duy nhất cho bộ khung hình
    session_id = str(uuid.uuid4())
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
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
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
        'session_id': session_id,
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
    
    # Tạo ID duy nhất cho bộ khung hình
    session_id = str(uuid.uuid4())
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
                relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
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
            relative_path = os.path.join('uploads', 'keyframes', session_id, frame_filename)
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



def download_youtube_video(youtube_url):
    """
    Tải video từ YouTube sử dụng yt-dlp với hỗ trợ cho YouTube Shorts
    """
    try:
        # Tạo thư mục tạm thời để lưu video
        temp_dir = tempfile.mkdtemp()
        
        # Xử lý đặc biệt cho YouTube Shorts
        if 'shorts' in youtube_url:
            # Nếu URL có dạng youtube.com/watch?v=shorts/ID, chuyển thành youtube.com/shorts/ID
            if 'watch?v=shorts' in youtube_url:
                video_id = youtube_url.split('watch?v=shorts/')[1].split('&')[0]
                youtube_url = f"https://www.youtube.com/shorts/{video_id}"
            
            # Nếu URL có dạng youtube.com/shorts/ID, sử dụng trực tiếp
            logging.info(f"Phát hiện YouTube Shorts URL: {youtube_url}")
        else:
            # Trích xuất ID và tạo URL tiêu chuẩn cho video thông thường
            video_id = extract_video_id(youtube_url)
            if not video_id:
                raise Exception("Không thể trích xuất ID video từ URL")
            youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        
        logging.info(f"Đang tải video từ URL: {youtube_url}")
        
        # Phương pháp 1: Sử dụng yt-dlp
        try:
            # Cấu hình yt-dlp
            ydl_opts = {
                'format': 'best[ext=mp4]/best',
                'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
                'noplaylist': True,
                'quiet': False,
                'no_warnings': False,
                'ignoreerrors': False,
            }
            
            # Tải video sử dụng yt-dlp
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(youtube_url, download=True)
                video_title = info_dict.get('title', 'youtube_video')
                video_path = ydl.prepare_filename(info_dict)
                
                # Kiểm tra nếu file không tồn tại sau khi tải
                if not os.path.exists(video_path):
                    # Thử tìm file trong thư mục
                    files = os.listdir(temp_dir)
                    if files:
                        video_path = os.path.join(temp_dir, files[0])
                    else:
                        raise Exception("Không tìm thấy file sau khi tải xuống")
                    
                logging.info(f"Tải thành công video với yt-dlp: {video_path}")
        except Exception as ydl_error:
            logging.error(f"Lỗi khi tải với yt-dlp: {str(ydl_error)}")
            
            # Phương pháp 2: Thử với pytube
            try:
                logging.info(f"Thử lại với pytube: {youtube_url}")
                yt = YouTube(youtube_url)
                video_title = yt.title
                
                # Lấy stream có độ phân giải cao nhất (nhưng không quá 720p để tiết kiệm thời gian)
                stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
                
                if not stream:
                    # Nếu không có stream progressive, lấy stream video có độ phân giải cao nhất
                    stream = yt.streams.filter(file_extension='mp4').order_by('resolution').desc().first()
                
                if not stream:
                    # Nếu vẫn không có, lấy bất kỳ stream nào
                    stream = yt.streams.first()
                
                if stream:
                    # Tải video về thư mục tạm thời
                    video_path = stream.download(output_path=temp_dir)
                    logging.info(f"Tải thành công video với pytube: {video_path}")
                else:
                    raise Exception("Không tìm thấy stream phù hợp với pytube")
            except Exception as pytube_error:
                logging.error(f"Lỗi khi tải với pytube: {str(pytube_error)}")
                
                # Phương pháp 3: Thử với subprocess gọi yt-dlp
                try:
                    logging.info(f"Thử lại với subprocess yt-dlp: {youtube_url}")
                    output_template = os.path.join(temp_dir, "video.mp4")
                    subprocess_command = [
                        "yt-dlp", 
                        "-f", "best[ext=mp4]/best",
                        "-o", output_template,
                        "--no-playlist",
                        youtube_url
                    ]
                    
                    process = subprocess.Popen(
                        subprocess_command,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        universal_newlines=True
                    )
                    
                    stdout, stderr = process.communicate()
                    
                    if process.returncode != 0:
                        raise Exception(f"yt-dlp process failed: {stderr}")
                    
                    video_path = output_template
                    video_title = "YouTube Video"
                    
                    if not os.path.exists(video_path):
                        # Thử tìm file trong thư mục
                        files = os.listdir(temp_dir)
                        if files:
                            video_path = os.path.join(temp_dir, files[0])
                            video_title = os.path.splitext(files[0])[0]
                        else:
                            raise Exception("Không tìm thấy file sau khi tải xuống")
                    
                    logging.info(f"Tải thành công video với subprocess yt-dlp: {video_path}")
                    
                except Exception as subprocess_error:
                    logging.error(f"Lỗi khi tải với subprocess yt-dlp: {str(subprocess_error)}")
                    raise Exception("Không thể tải video từ YouTube sau khi thử tất cả các phương pháp")
        
        # Tạo tên file an toàn
        safe_title = secure_filename(video_title)
        if not safe_title:
            safe_title = "youtube_video"
        
        # Đường dẫn đến file trong thư mục uploads
        dest_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{safe_title}.mp4")
        
        # Di chuyển file từ thư mục tạm thời đến thư mục uploads
        shutil.copy2(video_path, dest_path)
        
        # Xóa thư mục tạm thời
        shutil.rmtree(temp_dir)
        
        return {
            'path': dest_path,
            'title': video_title,
            'filename': f"{safe_title}.mp4"
        }
    except Exception as e:
        logging.error(f"Lỗi khi tải video YouTube: {str(e)}")
        # Xóa thư mục tạm nếu còn tồn tại
        if 'temp_dir' in locals() and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        raise Exception(f"Không thể tải video từ YouTube: {str(e)}")

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
    
    # Kiểm tra nếu có URL YouTube
    youtube_url = request.form.get('youtube_url', '')
    
    if youtube_url:
        try:
            # Tải video từ YouTube - không cần validate URL nghiêm ngặt
            video_info = download_youtube_video(youtube_url)
            file_path = video_info['path']
            filename = video_info['filename']
            
            # Ghi log
            logging.info(f"Đã tải video YouTube: {video_info['title']}")
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
    
    # Trích xuất khung hình theo phương pháp được chọn
    try:
        if method == 'method1':
            result = extract_keyframes_method1(file_path, threshold, max_frames)
        else:
            result = extract_keyframes_method2(file_path, threshold, min_scene_length, max_frames)
        
        # Thêm tên file vào kết quả
        result['filename'] = filename
        
        # Nếu là video YouTube, thêm thông tin
        if youtube_url:
            result['youtube_url'] = youtube_url
            if 'title' in locals().get('video_info', {}):
                result['youtube_title'] = video_info['title']
        
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
        temperature = data.get('temperature', 0.7)
        
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
        prompt = "Từ hình ảnh frame_0 đến frame cuối cùng, hãy phân tích và đưa tôi lại kịch bản câu truyện trên. Hãy mô tả chi tiết các yếu tố thị giác, bối cảnh, nhân vật và diễn biến câu chuyện."
        
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
