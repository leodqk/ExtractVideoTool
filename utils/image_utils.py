import os
import cv2
import numpy as np
import uuid
import base64
import logging
import imagehash
from PIL import Image
from config import KEYFRAMES_FOLDER, keyframesData

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
