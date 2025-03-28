from flask import render_template, send_from_directory, jsonify, send_file
import tempfile
import os
import logging

def register_main_routes(app):
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/swagger')
    def swagger_ui():
        return render_template('swagger_ui.html')

    @app.route('/swagger.yaml')
    def swagger_yaml():
        return send_from_directory('.', 'swagger.yaml')

    @app.route('/download/<session_id>', methods=['GET'])
    def download_keyframes(session_id):
        # Đường dẫn đến thư mục chứa khung hình
        from config import KEYFRAMES_FOLDER
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
        from config import TRANSCRIPTS_FOLDER
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

    @app.route('/download-gemini-results/<session_id>', methods=['GET'])
    def download_gemini_results(session_id):
        """API endpoint để tải xuống tất cả kết quả xử lý Gemini từ một session"""
        try:
            from config import GENERATED_IMAGES_FOLDER
            from utils.file_utils import create_zip_from_files
            
            # Kiểm tra session ID - cho phép định dạng batch-timestamp-random
            if not session_id:
                return jsonify({'error': 'Thiếu Session ID'}), 400
            
            # Kiểm tra đường dẫn tới thư mục session
            session_folder = os.path.join(GENERATED_IMAGES_FOLDER, session_id)
            if not os.path.exists(session_folder):
                # Thử tìm kiếm thư mục phù hợp với pattern
                if session_id.startswith('batch-'):
                    # Đây là ID mới được tạo từ client
                    for folder in os.listdir(GENERATED_IMAGES_FOLDER):
                        if folder.startswith('batch-'):
                            session_folder = os.path.join(GENERATED_IMAGES_FOLDER, folder)
                            logging.info(f"Tìm thấy thư mục thay thế: {session_folder}")
                            break
                
                # Nếu vẫn không tìm thấy, báo lỗi
                if not os.path.exists(session_folder):
                    return jsonify({'error': 'Không tìm thấy dữ liệu cho session này'}), 404
            
            logging.info(f"Tạo ZIP cho session: {session_id}, từ thư mục: {session_folder}")
            
            # Tìm tất cả các file input (ảnh) và output (txt) theo thứ tự
            input_files = []
            output_files = []
            
            for file in os.listdir(session_folder):
                if file.startswith('input_'):
                    input_files.append((os.path.join(session_folder, file), file))
                elif file.startswith('output_') and file.endswith('.txt'):
                    output_files.append((os.path.join(session_folder, file), file))
            
            # Sắp xếp theo số thứ tự trong tên file (input_0_..., output_0_...)
            def get_file_index(filename):
                try:
                    # Lấy phần index từ tên file (phần thứ 2 sau khi tách theo dấu '_')
                    return int(os.path.basename(filename).split('_')[1])
                except (IndexError, ValueError):
                    # Nếu không thể lấy được index, trả về giá trị lớn để đưa xuống cuối
                    return 999999
                    
            # Sắp xếp các file theo index tăng dần
            input_files.sort(key=lambda f: get_file_index(f[1]))
            output_files.sort(key=lambda f: get_file_index(f[1]))
            
            # Tạo file txt tạm thời chứa tất cả prompt
            all_prompts_path = os.path.join(tempfile.gettempdir(), f"all_prompts_{session_id}.txt")
            with open(all_prompts_path, 'w', encoding='utf-8') as outfile:
                for i, (file_path, _) in enumerate(output_files):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read().strip()
                            outfile.write(f"{content}\n")
                    except Exception as e:
                        logging.error(f"Lỗi khi đọc file {file_path}: {str(e)}")
                        outfile.write(f"[Lỗi đọc kết quả cho ảnh {i+1}]\n")
            
            # Tạo tệp ZIP tạm thời
            zip_filename = f"gemini_results_{session_id}.zip"
            
            # Chuẩn bị danh sách file để thêm vào ZIP
            files_to_zip = []
            
            # Thêm tất cả các ảnh vào ZIP
            for i, (file_path, file_name) in enumerate(input_files):
                # Sử dụng biến i (chỉ số vòng lặp) để đảm bảo tên file luôn duy nhất
                # Lấy phần mở rộng từ tên file gốc
                _, ext = os.path.splitext(file_name)
                # Tạo tên file mới theo định dạng image_001.jpg, image_002.jpg, etc.
                new_name = f"image_{i+1:03d}{ext}"
                files_to_zip.append((file_path, new_name))
            
            # Thêm file txt chứa tất cả prompt
            files_to_zip.append((all_prompts_path, "all_prompts.txt"))
            
            # Tạo file ZIP
            zip_path = create_zip_from_files(files_to_zip, zip_filename)
            
            # Gửi file ZIP cho client
            return send_file(
                zip_path,
                as_attachment=True,
                download_name=zip_filename
            )
            
        except Exception as e:
            logging.error(f"Error downloading Gemini results: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/download-gemini-results-text/<session_id>', methods=['GET'])
    def download_gemini_results_text(session_id):
        """API endpoint để tải xuống tất cả kết quả xử lý Gemini từ một session dưới dạng file txt duy nhất"""
        try:
            from config import GENERATED_IMAGES_FOLDER
            
            # Kiểm tra session ID
            if not session_id:
                return jsonify({'error': 'Thiếu Session ID'}), 400
            
            # Kiểm tra đường dẫn tới thư mục session
            session_folder = os.path.join(GENERATED_IMAGES_FOLDER, session_id)
            if not os.path.exists(session_folder):
                # Thử tìm kiếm thư mục phù hợp với pattern
                if session_id.startswith('batch-'):
                    # Đây là ID mới được tạo từ client
                    for folder in os.listdir(GENERATED_IMAGES_FOLDER):
                        if folder.startswith('batch-'):
                            session_folder = os.path.join(GENERATED_IMAGES_FOLDER, folder)
                            logging.info(f"Tìm thấy thư mục thay thế: {session_folder}")
                            break
                
                # Nếu vẫn không tìm thấy, báo lỗi
                if not os.path.exists(session_folder):
                    return jsonify({'error': 'Không tìm thấy dữ liệu cho session này'}), 404
            
            logging.info(f"Tạo file text cho session: {session_id}, từ thư mục: {session_folder}")
            
            # Tìm tất cả các file output txt theo thứ tự
            output_files = []
            for file in os.listdir(session_folder):
                if file.startswith('output_') and file.endswith('.txt'):
                    output_files.append((os.path.join(session_folder, file), file))
            
            # Sắp xếp theo số thứ tự trong tên file (output_0_..., output_1_...)
            def get_file_index(filename):
                try:
                    # Lấy phần index từ tên file (phần thứ 2 sau khi tách theo dấu '_')
                    return int(os.path.basename(filename).split('_')[1])
                except (IndexError, ValueError):
                    # Nếu không thể lấy được index, trả về giá trị lớn để đưa xuống cuối
                    return 999999
                    
            # Sắp xếp các file theo index tăng dần
            output_files.sort(key=lambda f: get_file_index(f[1]))
            
            # Tạo file txt tạm thời
            txt_filename = f"gemini_results_{session_id}.txt"
            txt_path = os.path.join(tempfile.gettempdir(), txt_filename)
            
            # Đọc nội dung từ mỗi file và ghi vào file txt tạm thời
            with open(txt_path, 'w', encoding='utf-8') as outfile:
                for i, (file_path, _) in enumerate(output_files):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read().strip()
                            outfile.write(f"{content}\n")
                    except Exception as e:
                        logging.error(f"Lỗi khi đọc file {file_path}: {str(e)}")
                        outfile.write(f"[Lỗi đọc kết quả cho ảnh {i+1}]\n")
            
            # Gửi file txt cho client
            return send_file(
                txt_path,
                as_attachment=True,
                download_name=txt_filename,
                mimetype='text/plain'
            )
            
        except Exception as e:
            logging.error(f"Error downloading Gemini results as text: {str(e)}")
            return jsonify({'error': str(e)}), 500
