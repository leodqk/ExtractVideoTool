import os
import base64
import time
import uuid
import logging
import google.generativeai as genai
from config import GENERATED_IMAGES_FOLDER, GEMINI_API_CALLS, GEMINI_RATE_LIMIT, GEMINI_RATE_WINDOW

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

def detect_duplicate_images_with_gemini(image_paths, session_id, threshold=0.85):
    """
    Phát hiện ảnh trùng lặp sử dụng Gemini API với phương pháp dự phòng
    """
    from utils.image_utils import detect_duplicate_images_fallback
    
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
        from config import keyframesData
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
                    import json
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

def generate_script(session_id, keyframes_data=None, transcript_text=None, temperature=0.9):
    """
    Trích xuất kịch bản từ các khung hình và phiên âm (nếu có)
    """
    try:
        # Xử lý dựa trên session ID
        if session_id:
            # Lấy đường dẫn đến thư mục chứa khung hình
            from config import KEYFRAMES_FOLDER, TRANSCRIPTS_FOLDER
            keyframes_path = os.path.join(KEYFRAMES_FOLDER, session_id)
            if not os.path.exists(keyframes_path):
                raise Exception('Không tìm thấy thư mục khung hình')
                
            # Lấy danh sách các file khung hình, sắp xếp theo thứ tự
            files = sorted([f for f in os.listdir(keyframes_path) if os.path.isfile(os.path.join(keyframes_path, f))],
                          key=lambda x: int(x.split('_')[1].split('.')[0]) if '_' in x else 0)
            
            if not files:
                raise Exception('Không có khung hình nào được tìm thấy')
                
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
        
        # Xử lý dựa trên dữ liệu khung hình trực tiếp
        elif keyframes_data:
            # Tạo prompt cho Gemini
            prompt = "Từ hình ảnh đầu tiên đến hình ảnh cuối cùng, hãy phân tích từng ảnh và đưa tôi lại kịch bản câu truyện trên."
            
            # Thêm transcript nếu có
            has_transcript = False
            if transcript_text:
                has_transcript = True
                prompt += f"\n\nĐây là phiên âm từ audio của video, hãy sử dụng để bổ sung cho phân tích của bạn: {transcript_text}"
                
            files = None
        else:
            raise Exception('Thiếu dữ liệu cần thiết')
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            raise Exception('Gemini API rate limit exceeded. Please try again later.')
        
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
        
        # Tạo nội dung cho request
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
        
        # Thêm hình ảnh vào request
        if session_id and files:
            # Thêm tối đa 10 hình ảnh từ thư mục
            image_count = min(10, len(files))
            for i in range(image_count):
                file_path = os.path.join(keyframes_path, files[i])
                
                # Đọc và mã hóa hình ảnh
                with open(file_path, "rb") as img_file:
                    image_data = img_file.read()
                
                # Thêm hình ảnh vào request
                contents[0]["parts"].append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(image_data).decode('utf-8')
                    }
                })
        elif keyframes_data:
            # Thêm tối đa 10 hình ảnh từ dữ liệu
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
        response = model.generate_content(contents)
        
        # Trả về kết quả
        return {
            'script': response.text,
            'prompt': prompt,
            'num_frames_analyzed': len(contents[0]["parts"]) - 1,  # Trừ đi phần text
            'temperature': temperature,
            'has_transcript': has_transcript
        }
        
    except Exception as e:
        logging.error(f"Lỗi khi trích xuất kịch bản: {str(e)}")
        raise Exception(f"Không thể trích xuất kịch bản: {str(e)}")

def generate_gemini_prompt(keyframe_path):
    """
    Tạo prompt cho ảnh sử dụng Gemini API
    """
    try:
        if not keyframe_path:
            raise Exception('Thiếu đường dẫn hình ảnh')
        
        # Kiểm tra rate limit
        if not check_rate_limit():
            raise Exception('Gemini API rate limit exceeded. Please try again later.')
        
        # Đọc hình ảnh
        full_path = os.path.join('static', keyframe_path)
        if not os.path.exists(full_path):
            raise Exception('Không tìm thấy hình ảnh')
            
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
        prompt = "Write an English prompt to create a similar image. Describe in detail the character's shape, features, color and background. Only return the best prompt, without any other words."
        
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
        
        return {
            'success': True,
            'prompt': response.text
        }
        
    except Exception as e:
        logging.error(f"Error generating prompt with Gemini: {str(e)}")
        raise Exception(f"Error generating prompt: {str(e)}")

def process_images_batch(images, prompt, session_id):
    """
    Xử lý một loạt các ảnh với Gemini API và một prompt cụ thể
    """
    try:
        # Tạo thư mục cho session
        session_folder = os.path.join(GENERATED_IMAGES_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        results = []
        
        # Xử lý từng ảnh
        for index, image_path in enumerate(images):
            # Kiểm tra rate limit
            if not check_rate_limit():
                results.append({
                    'original_image': image_path,
                    'success': False,
                    'error': 'Gemini API rate limit exceeded. Please try again later.'
                })
                continue
            
            try:
                # Đọc ảnh
                with open(image_path, "rb") as img_file:
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
                
                # Lưu kết quả
                result_filename = f"output_{index}_{os.path.basename(image_path)}.txt"
                result_path = os.path.join(session_folder, result_filename)
                with open(result_path, 'w', encoding='utf-8') as f:
                    f.write(response.text)
                
                results.append({
                    'original_image': image_path,
                    'result_text': response.text,
                    'result_path': result_path,
                    'success': True
                })
                
            except Exception as img_error:
                logging.error(f"Error processing image with Gemini: {str(img_error)}")
                results.append({
                    'original_image': image_path,
                    'success': False,
                    'error': str(img_error)
                })
        
        return {
            'success': True,
            'results': results,
            'session_id': session_id,
            'result_folder': session_folder
        }
        
    except Exception as e:
        logging.error(f"Error in batch processing: {str(e)}")
        raise Exception(f"Error in batch processing: {str(e)}")
