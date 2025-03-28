import os
import shutil
import logging
import subprocess
import uuid
import speech_recognition as sr
from pydub import AudioSegment
from utils.file_utils import get_video_name_without_extension, create_safe_session_id
from config import AUDIO_FOLDER, TRANSCRIPTS_FOLDER

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
