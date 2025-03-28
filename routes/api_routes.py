from flask import request, jsonify
import os
import logging
import uuid
from werkzeug.utils import secure_filename
from config import UPLOAD_FOLDER, ALLOWED_EXTENSIONS, keyframesData
from utils.file_utils import allowed_file
from utils.video_utils import extract_keyframes_method1, extract_keyframes_method2, extract_keyframes_with_transition_detection, download_video_from_url
from services.audio_service import extract_audio_from_video, transcribe_audio
from services.gemini_service import generate_image_from_keyframe, generate_script, generate_gemini_prompt, process_images_batch, detect_duplicate_images_with_gemini

def register_api_routes(app):
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
                
            if not allowed_file(file.filename, ALLOWED_EXTENSIONS):
                return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400
                
            # Lưu file tạm thời
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
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
                
            if not allowed_file(file.filename, ALLOWED_EXTENSIONS):
                return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400
                
            # Lưu file tạm thời
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)

        # Kiểm tra xem file_path và filename đã được thiết lập chưa
        if not file_path or not filename:
            return jsonify({'error': 'Không thể xử lý file hoặc URL'}), 400

        # Trích xuất khung hình theo phương pháp 1
        try:
            # Frame difference method
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
                
            if not allowed_file(file.filename, ALLOWED_EXTENSIONS):
                return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400
                
            # Lưu file tạm thời
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)

        # Kiểm tra xem file_path và filename đã được thiết lập chưa
        if not file_path or not filename:
            return jsonify({'error': 'Không thể xử lý file hoặc URL'}), 400

        # Trích xuất khung hình theo phương pháp 2
        try:
            # Transition detection method
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
    def generate_script_route():
        """API endpoint để trích xuất kịch bản từ các khung hình"""
        try:
            data = request.json
            session_id = data.get('session_id')
            keyframes_data = data.get('keyframes_data')
            transcript_text = data.get('transcript_text')
            
            # Lấy temperature từ request, mặc định là 0.9
            temperature = data.get('temperature', 0.9)
            
            # Gọi hàm từ service
            result = generate_script(session_id, keyframes_data, transcript_text, temperature)
            
            return jsonify(result)
        except Exception as e:
            logging.error(f"Lỗi khi trích xuất kịch bản: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/generate-image', methods=['POST'])
    def generate_image_route():
        """API endpoint để tạo ảnh mới từ khung hình đã trích xuất"""
        try:
            data = request.json
            keyframe_path = data.get('keyframe_path')
            session_id = data.get('session_id')
            prompt = data.get('prompt', 'Tạo một phiên bản mới của hình ảnh này')
            style = data.get('style', 'digital art')
            
            if not keyframe_path or not session_id:
                return jsonify({'error': 'Thiếu thông tin cần thiết'}), 400
            
            # Gọi hàm từ service
            result = generate_image_from_keyframe(keyframe_path, prompt, style, session_id)
            
            return jsonify(result)
        except Exception as e:
            logging.error(f"Lỗi khi tạo ảnh: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/analyze-frame-differences', methods=['POST'])
    def analyze_frame_differences():
        """API endpoint để phân tích độ khác biệt giữa các khung hình"""
        try:
            from config import KEYFRAMES_FOLDER
            import imagehash
            from PIL import Image
            
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
    def generate_gemini_prompt_route():
        """API endpoint để tạo prompt từ hình ảnh sử dụng Gemini 2.0 Flash"""
        try:
            data = request.json
            keyframe_path = data.get('keyframe_path')
            
            if not keyframe_path:
                return jsonify({'error': 'Thiếu đường dẫn hình ảnh'}), 400
            
            # Gọi hàm từ service
            result = generate_gemini_prompt(keyframe_path)
            
            return jsonify(result)
            
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
                import base64
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

    @app.route('/process-images-gemini', methods=['POST'])
    def process_images_gemini():
        """API endpoint để xử lý nhiều ảnh với Gemini và một prompt cụ thể"""
        try:
            from config import GENERATED_IMAGES_FOLDER
            
            # Kiểm tra xem có file ảnh được tải lên không
            if 'images' not in request.files:
                return jsonify({'error': 'Không có ảnh nào được tải lên'}), 400
            
            # Lấy file ảnh và prompt
            files = request.files.getlist('images')
            prompt = request.form.get('prompt', '')
            
            if not prompt:
                return jsonify({'error': 'Vui lòng nhập prompt'}), 400
            
            if not files or len(files) == 0:
                return jsonify({'error': 'Không có ảnh nào được tải lên'}), 400
            
            # Tạo session ID ngẫu nhiên cho lần xử lý này hoặc sử dụng session_id được cung cấp
            session_id = request.form.get('session_id', str(uuid.uuid4()))
            session_folder = os.path.join(GENERATED_IMAGES_FOLDER, session_id)
            os.makedirs(session_folder, exist_ok=True)
            
            results = []
            
            # Xử lý từng ảnh - chỉ xử lý ảnh đầu tiên trong danh sách
            # khi xử lý từng ảnh một trên client
            for index, file in enumerate(files):
                if file.filename == '':
                    continue
                    
                # Kiểm tra xem file có phải là ảnh không
                if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
                    continue
                    
                # Lưu ảnh tạm thời
                filename = secure_filename(file.filename)
                image_path = os.path.join(session_folder, f"input_{index}_{filename}")
                file.save(image_path)
                
                # Thêm kết quả vào danh sách
                results.append({
                    'original_image': image_path.replace('static/', ''),
                    'filename': filename,
                    'index': index
                })
            
            # Xử lý batch với Gemini
            try:
                # Lấy danh sách đường dẫn đầy đủ
                image_paths = [os.path.join(session_folder, f"input_{i}_{secure_filename(f.filename)}") 
                             for i, f in enumerate(files) if f.filename]
                
                # Gọi service batch processing
                batch_result = process_images_batch(image_paths, prompt, session_id)
                
                # Trả về kết quả
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'results': batch_result.get('results', []),
                    'result_folder': session_folder.replace('static/', '')
                })
            
            except Exception as batch_error:
                logging.error(f"Error in batch processing: {str(batch_error)}")
                return jsonify({
                    'success': False,
                    'error': str(batch_error),
                    'session_id': session_id,
                    'uploaded_images': results
                }), 500
            
        except Exception as e:
            logging.error(f"Error in process-images-gemini: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
