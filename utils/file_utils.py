import os
import uuid
import shutil
import tempfile
import logging
import zipfile
from werkzeug.utils import secure_filename
from config import KEYFRAMES_FOLDER, GENERATED_IMAGES_FOLDER

def allowed_file(filename, allowed_extensions):
    """Kiểm tra nếu file có đuôi mở rộng được cho phép"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

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

def create_zip_from_files(files, output_filename):
    """Tạo file ZIP từ danh sách các file"""
    temp_dir = tempfile.gettempdir()
    zip_path = os.path.join(temp_dir, output_filename)
    
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for file_path, arcname in files:
            zipf.write(file_path, arcname)
    
    return zip_path
