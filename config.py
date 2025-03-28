import os
import logging

# Cấu hình logging
logging.basicConfig(level=logging.INFO)

# Cấu hình thư mục
UPLOAD_FOLDER = os.path.join('static', 'uploads')
KEYFRAMES_FOLDER = os.path.join('static', 'uploads', 'keyframes')
GENERATED_IMAGES_FOLDER = os.path.join('static', 'uploads', 'generated')
AUDIO_FOLDER = os.path.join('static', 'uploads', 'audio')
TRANSCRIPTS_FOLDER = os.path.join('static', 'uploads', 'transcripts')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
API_KEY_FILE = 'api_key.txt'  # File chứa API key

# Rate limiting cho Gemini API
GEMINI_API_CALLS = {}  # {timestamp: count}
GEMINI_RATE_LIMIT = 10  # Số lượng cuộc gọi tối đa trong 1 phút
GEMINI_RATE_WINDOW = 60  # Thời gian cửa sổ tính giới hạn (giây)

# Tạo thư mục nếu chưa tồn tại
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(KEYFRAMES_FOLDER, exist_ok=True)
os.makedirs(GENERATED_IMAGES_FOLDER, exist_ok=True)
os.makedirs(AUDIO_FOLDER, exist_ok=True)
os.makedirs(TRANSCRIPTS_FOLDER, exist_ok=True)

# Biến toàn cục để lưu trữ dữ liệu keyframes
keyframesData = []

# Hàm đọc API key từ file
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
