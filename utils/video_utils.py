import os
import cv2
import numpy as np
import uuid
import logging
import re
import yt_dlp
import requests
import tempfile
import shutil
import collections
from urllib.parse import urlparse
from werkzeug.utils import secure_filename
from config import KEYFRAMES_FOLDER, UPLOAD_FOLDER, keyframesData
from utils.file_utils import get_video_name_without_extension, create_safe_session_id
from utils.image_utils import is_transition_frame

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
            dest_path = os.path.join(UPLOAD_FOLDER, f"{safe_title}.mp4")
            
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
