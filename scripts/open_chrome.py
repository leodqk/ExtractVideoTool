import asyncio
from playwright.async_api import async_playwright
import os
import sys
import logging
import glob
import json
import base64
import time
import traceback

# Cấu hình logging chi tiết
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Đảm bảo log hiển thị ngay lập tức
logger = logging.getLogger()
logger.setLevel(logging.INFO)

async def get_latest_batch_folder():
    """Tìm thư mục batch mới nhất trong uploads/generated/"""
    try:
        # Tìm đường dẫn thư mục gốc của ứng dụng
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        generated_dir = os.path.join(root_dir, 'uploads', 'generated')
        
        logging.info(f"Đang tìm thư mục batch trong: {generated_dir}")
        
        if not os.path.exists(generated_dir):
            logging.error(f"Thư mục không tồn tại: {generated_dir}")
            return None
            
        # Tìm tất cả các thư mục batch-*
        batch_folders = glob.glob(os.path.join(generated_dir, 'batch-*'))
        
        if not batch_folders:
            logging.error("Không tìm thấy thư mục batch nào")
            return None
            
        # Sắp xếp theo thời gian sửa đổi, mới nhất lên đầu
        latest_folder = max(batch_folders, key=os.path.getmtime)
        logging.info(f"Thư mục batch mới nhất: {latest_folder}")
        
        return latest_folder
    except Exception as e:
        logging.error(f"Lỗi khi tìm thư mục batch: {str(e)}")
        logging.error(traceback.format_exc())
        return None


async def get_batch_relative_path(batch_folder):
    """Lấy đường dẫn tương đối của batch folder theo định dạng static/uploads/generated/batch-xxxx"""
    try:
        if not batch_folder:
            return None
            
        # Lấy tên thư mục batch
        batch_name = os.path.basename(batch_folder)
        
        # Tạo đường dẫn tương đối
        relative_path = f"static/uploads/generated/{batch_name}"
        logging.info(f"Đường dẫn batch tương đối: {relative_path}")
        
        return relative_path
    except Exception as e:
        logging.error(f"Lỗi khi lấy đường dẫn tương đối của batch: {str(e)}")
        logging.error(traceback.format_exc())
        return None

async def get_image_and_prompt_data(batch_folder):
    """Lấy đường dẫn ảnh và nội dung prompt từ thư mục batch"""
    try:
        if not batch_folder or not os.path.exists(batch_folder):
            return []
            
        # Tìm tất cả các file ảnh đầu vào
        input_images = sorted(glob.glob(os.path.join(batch_folder, 'input_*.jpeg')))
        output_files = sorted(glob.glob(os.path.join(batch_folder, 'output_*.txt')))
        
        logging.info(f"Đã tìm thấy {len(input_images)} ảnh và {len(output_files)} file prompt")
        
        if len(input_images) == 0:
            logging.warning("Không có file ảnh nào trong thư mục batch")
            return []
        
        result_data = []
        
        for i, image_path in enumerate(input_images):
            try:
                image_filename = os.path.basename(image_path)
                
                # Tìm file prompt tương ứng
                output_pattern = os.path.join(batch_folder, f'output_*_{image_filename}.txt')
                matching_output_files = glob.glob(output_pattern)
                
                # Thử pattern thay thế nếu không tìm thấy kết quả
                if not matching_output_files:
                    # Pattern phổ biến khác: output_X_inp_[filename].txt
                    base_name = os.path.splitext(image_filename)[0]  # Lấy tên không có phần mở rộng
                    alt_patterns = [
                        os.path.join(batch_folder, f'output_*_inp_{base_name}*.txt'),
                        os.path.join(batch_folder, f'output_*_inp_*{base_name}.txt'),
                        os.path.join(batch_folder, f'output_*_inp_*.txt')
                    ]
                    
                    for pattern in alt_patterns:
                        matching_output_files = glob.glob(pattern)
                        if matching_output_files:
                            logging.info(f"Đã tìm thấy file prompt với pattern thay thế: {pattern}")
                            break
                
                prompt_content = ""
                prompt_path = ""
                
                if matching_output_files:
                    prompt_path = matching_output_files[0]
                    # Đọc nội dung prompt
                    try:
                        with open(prompt_path, 'r', encoding='utf-8') as f:
                            prompt_content = f.read().strip()
                        logging.info(f"Đã đọc nội dung prompt từ file: {os.path.basename(prompt_path)}")
                    except Exception as e:
                        logging.error(f"Lỗi khi đọc file prompt {prompt_path}: {str(e)}")
                        prompt_content = ""
                else:
                    logging.warning(f"Không tìm thấy file prompt cho ảnh: {image_filename}")
                    
                    # Tìm kiếm bất kỳ file output nào có sẵn nếu không tìm thấy file tương ứng
                    if output_files and i < len(output_files):
                        prompt_path = output_files[i]
                        try:
                            with open(prompt_path, 'r', encoding='utf-8') as f:
                                prompt_content = f.read().strip()
                            logging.info(f"Sử dụng file prompt thay thế: {os.path.basename(prompt_path)}")
                        except Exception as e:
                            logging.error(f"Lỗi khi đọc file prompt thay thế {prompt_path}: {str(e)}")
                            prompt_content = ""
                
                # Đọc nội dung ảnh và chuyển sang base64
                with open(image_path, 'rb') as img_file:
                    image_data = img_file.read()
                    image_base64 = base64.b64encode(image_data).decode('utf-8')
                    logging.info(f"Đã đọc và chuyển đổi ảnh thành base64: {image_filename}")
                    
                # Xác định định dạng ảnh
                image_format = "jpeg"
                
                # Tạo data URL
                data_url = f"data:image/{image_format};base64,{image_base64}"
                    
                # Thêm vào kết quả
                result_data.append({
                    'image_path': image_path,
                    'prompt_path': prompt_path,
                    'prompt_content': prompt_content,
                    'image_data_url': data_url
                })
            except Exception as e:
                logging.error(f"Lỗi khi xử lý ảnh {image_path}: {str(e)}")
                logging.error(traceback.format_exc())
                continue
        
        logging.info(f"Đã xử lý thành công {len(result_data)}/{len(input_images)} ảnh và prompt")
        return result_data
    except Exception as e:
        logging.error(f"Lỗi khi lấy dữ liệu ảnh và prompt: {str(e)}")
        logging.error(traceback.format_exc())
        return []

async def import_to_kling_ai(page, image_data_url, description):
    """Nhập ảnh và prompt vào Kling AI"""
    logging.info("Bắt đầu nhập ảnh và prompt vào Kling AI")
    
    # Thêm console log trong trình duyệt
    await page.evaluate(f"""
        console.group('%c➡️ Nhập ảnh và prompt vào Kling AI', 'color: #4CAF50; font-weight: bold;');
        console.log('%cĐộ dài prompt:', 'font-weight: bold;', {len(description)});
        console.log('%cPrompt:', 'font-weight: bold;', `{description.replace("'", "\\'")}`.substring(0, 100) + '...');
    """)
    
    # Số lần thử lại tối đa
    max_retries = 3
    current_retry = 0
    
    while current_retry < max_retries:
        try:
            # 1. Điền vào trường mô tả (prompt) ngay lập tức, không đợi tải ảnh lên
            logging.info("Đang điền prompt vào trường mô tả...")
            await page.evaluate("""
                console.log('%c1. Đang tìm trường mô tả...', 'color: #2196F3;');
            """)
            
            # Tìm và điền vào trường contenteditable theo các phương pháp từ kling-content.js
            try:
                # Approach 1: Find by selector with contenteditable attribute
                prompt_input = None
                
                try:
                    prompt_input = await page.query_selector('.prompt-input[contenteditable="true"]')
                    if prompt_input:
                        await page.evaluate("""
                            console.log('%c✅ Đã tìm thấy trường mô tả bằng class và contenteditable', 'color: #4CAF50;');
                        """)
                except:
                    pass
                    
                # Approach 2: Find by class name only
                if not prompt_input:
                    try:
                        prompt_input = await page.query_selector(".prompt-input")
                        if prompt_input:
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy trường mô tả bằng class name', 'color: #4CAF50;');
                            """)
                    except:
                        pass
                
                # Approach 3: Find the parent prompt div and then find the input within
                if not prompt_input:
                    try:
                        prompt_div = await page.query_selector(".prompt")
                        if prompt_div:
                            prompt_input = await prompt_div.query_selector('[contenteditable="true"]')
                            if prompt_input:
                                await page.evaluate("""
                                    console.log('%c✅ Đã tìm thấy trường mô tả thông qua parent div', 'color: #4CAF50;');
                                """)
                    except:
                        pass
                
                # Approach 4: Try all contenteditable elements
                if not prompt_input:
                    try:
                        all_contenteditable = await page.query_selector_all('[contenteditable="true"]')
                        if len(all_contenteditable) > 0:
                            prompt_input = all_contenteditable[0]
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy trường contenteditable làm phương án dự phòng', 'color: #4CAF50;');
                            """)
                    except:
                        pass
                
                if prompt_input:
                    # Focus vào phần tử
                    await prompt_input.focus()
                    
                    # Xóa nội dung hiện có
                    await prompt_input.evaluate('(element) => { element.innerHTML = ""; }')
                    await page.evaluate("""
                        console.log('%c✅ Đã xóa nội dung cũ', 'color: #4CAF50;');
                    """)
                    
                    # Điền nội dung mới
                    await prompt_input.type(description, delay=10)
                    
                    # Dispatch multiple events to ensure the framework detects the change
                    await prompt_input.evaluate("""(element) => {
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
                        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
                    }""")
                    
                    logging.info("Đã điền prompt thành công")
                    await page.evaluate("""
                        console.log('%c✅ Đã điền prompt thành công', 'color: #4CAF50;');
                    """)
                else:
                    logging.error("Không tìm thấy trường mô tả")
                    await page.evaluate("""
                        console.log('%c❌ Không tìm thấy trường mô tả', 'color: #F44336; font-weight: bold;');
                    """)
            except Exception as e:
                logging.error(f"Lỗi khi điền prompt: {str(e)}")
                await page.evaluate(f"""
                    console.log('%c❌ Lỗi khi điền prompt:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
                """)
                
            # 2. Tìm input tải lên ảnh
            logging.info("Đang chuẩn bị tải lên ảnh...")
            await page.evaluate("""
                console.log('%c2. Đang tìm input tải lên ảnh...', 'color: #2196F3;');
            """)
            
            upload_input = None
            
            try:
                upload_input = await page.query_selector('.el-upload__input[type="file"]')
            except Exception as e:
                logging.error(f"Lỗi khi tìm input tải lên ảnh: {str(e)}")
                await page.evaluate(f"""
                    console.log('%c❌ Lỗi khi tìm input tải lên ảnh:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
                """)
            
            if not upload_input:
                logging.error("Không tìm thấy input tải lên ảnh")
                await page.evaluate("""
                    console.log('%c❌ Không tìm thấy input tải lên ảnh', 'color: #F44336; font-weight: bold;');
                """)
                current_retry += 1
                if current_retry < max_retries:
                    logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                    await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                    continue
                return False
            else:
                await page.evaluate("""
                    console.log('%c✅ Đã tìm thấy input tải lên ảnh', 'color: #4CAF50;');
                """)
                
            # 3. Tải ảnh lên bằng cách sử dụng JavaScript để tạo File từ data URL
            await page.evaluate("""
                console.log('%c3. Đang chuẩn bị tải ảnh lên...', 'color: #2196F3;');
            """)
            
            # Kiểm tra MIME type từ data URL
            mime_type = "image/jpeg"
            if "data:image/png;base64" in image_data_url:
                mime_type = "image/png"
                
            script = f"""
            (async () => {{
                try {{
                    console.log('%c3.1 Bắt đầu chuyển đổi Data URL thành File...', 'color: #2196F3;');
                    
                    // Chuyển đổi Data URL thành Blob
                    const fetchResponse = await fetch("{image_data_url}");
                    const blob = await fetchResponse.blob();
                    
                    console.log('%c✅ Đã chuyển đổi thành Blob:', 'color: #4CAF50;', {{ 
                        size: blob.size + ' bytes',  
                        type: blob.type 
                    }});
                    
                    // Xác định phần mở rộng file
                    const extension = "{mime_type}" === "image/jpeg" ? "jpg" : "png";
                    
                    // Tạo File từ Blob
                    const file = new File([blob], `imported-image.${{extension}}`, {{ type: "{mime_type}" }});
                    
                    console.log('%c✅ Đã tạo File từ Blob', 'color: #4CAF50;');
                    
                    // Tạo DataTransfer để mô phỏng quá trình tải lên file
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    // Áp dụng cho input file
                    const fileInput = document.querySelector('.el-upload__input[type="file"]');
                    if (!fileInput) {{
                        console.error("Không tìm thấy input file");
                        console.log('%c❌ Không tìm thấy input file', 'color: #F44336; font-weight: bold;');
                        return false;
                    }}
                    
                    console.log('%c3.2 Đang gán file vào input...', 'color: #2196F3;');
                    
                    fileInput.files = dataTransfer.files;
                    
                    // Kích hoạt sự kiện change
                    fileInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    
                    console.log('%c✅ Đã tải lên ảnh thành công', 'color: #4CAF50; font-weight: bold;');
                    
                    return true;
                }} catch (error) {{
                    console.error("Lỗi khi tải lên ảnh:", error);
                    console.log('%c❌ Lỗi khi tải lên ảnh:', 'color: #F44336; font-weight: bold;', error);
                    return false;
                }}
            }})();
            """
            
            try:
                success = await page.evaluate(script)
                if success:
                    logging.info("Đã tải lên ảnh thành công")
                else:
                    logging.error("Không thể tải lên ảnh")
                    await page.evaluate("""
                        console.log('%c❌ Không thể tải lên ảnh', 'color: #F44336; font-weight: bold;');
                    """)
                    current_retry += 1
                    if current_retry < max_retries:
                        logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                        await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                        continue
                    return False
            except Exception as e:
                logging.error(f"Lỗi khi thực thi script tải lên ảnh: {str(e)}")
                await page.evaluate(f"""
                    console.log('%c❌ Lỗi khi thực thi script tải lên ảnh:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
                """)
                current_retry += 1
                if current_retry < max_retries:
                    logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                    await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                    continue
                return False
            
            # 4. Đợi chính xác 4 giây rồi nhấn nút Generate
            await page.evaluate("""
                console.log('%c4. Đang đợi 4 giây trước khi nhấn nút Generate...', 'color: #2196F3;');
            """)
            
            await asyncio.sleep(4)
            logging.info("Đang nhấn nút Generate...")
            
            await page.evaluate("""
                console.log('%c4.1 Đang tìm nút Generate...', 'color: #2196F3;');
            """)
            
            # Tìm và nhấn nút Generate theo nhiều cách như trong kling-content.js
            try:
                # First try the exact selector
                generate_button = await page.query_selector("button.generic-button.green.big[data-v-10b25476][data-v-502bcbfb]")
                
                if not generate_button:
                    # Try by class and inner text
                    buttons = await page.query_selector_all(".generic-button.green.big")
                    for button in buttons:
                        text = await button.text_content()
                        if "Generate" in text:
                            generate_button = button
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy nút Generate bằng class và text', 'color: #4CAF50;');
                            """)
                            break
                
                if not generate_button:
                    # Try finding by inner div with text
                    inner_divs = await page.query_selector_all(".inner")
                    for div in inner_divs:
                        text = await div.text_content()
                        if "Generate" in text:
                            generate_button = await div.evaluate("(element) => element.closest('button')")
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy nút Generate thông qua div con', 'color: #4CAF50;');
                            """)
                            break
                
                if not generate_button:
                    # Try any button with Generate text
                    all_buttons = await page.query_selector_all("button")
                    for button in all_buttons:
                        text = await button.text_content()
                        if "Generate" in text:
                            generate_button = button
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy nút Generate bằng text', 'color: #4CAF50;');
                            """)
                            break
                
                if generate_button:
                    # Kiểm tra xem nút có bị vô hiệu hóa không
                    is_disabled = await generate_button.evaluate("""(element) => {
                        return element.disabled || 
                               element.classList.contains('is-disabled') || 
                               element.getAttribute('aria-disabled') === 'true';
                    }""")
                    
                    if is_disabled:
                        logging.warning("Nút Generate bị vô hiệu hóa, thử nhấn dù sao")
                        await page.evaluate("""
                            console.log('%c⚠️ Nút Generate bị vô hiệu hóa, thử nhấn dù sao', 'color: #FF9800;');
                        """)
                    
                    # Nhấn nút
                    await generate_button.click()
                    logging.info("Đã nhấn nút Generate")
                    
                    await page.evaluate("""
                        console.log('%c✅ Đã nhấn nút Generate thành công', 'color: #4CAF50; font-weight: bold;');
                    """)
                    
                    return True
                else:
                    logging.error("Không tìm thấy nút Generate")
                    
                    await page.evaluate("""
                        console.log('%c❌ Không tìm thấy nút Generate', 'color: #F44336; font-weight: bold;');
                    """)
                    
                    current_retry += 1
                    if current_retry < max_retries:
                        logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                        await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                        continue
                    return False
            except Exception as e:
                logging.error(f"Lỗi khi nhấn nút Generate: {str(e)}")
                
                await page.evaluate(f"""
                    console.log('%c❌ Lỗi khi nhấn nút Generate:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
                """)
                
                current_retry += 1
                if current_retry < max_retries:
                    logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                    await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                    continue
                return False
                
        except Exception as e:
            logging.error(f"Lỗi khi nhập vào Kling AI: {str(e)}")
            logging.error(traceback.format_exc())
            
            await page.evaluate(f"""
                console.log('%c❌ Lỗi khi nhập vào Kling AI:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            """)
            
            current_retry += 1
            if current_retry < max_retries:
                logging.info(f"Thử lại lần {current_retry + 1}/{max_retries}...")
                await asyncio.sleep(2)  # Đợi 2 giây trước khi thử lại
                continue
            return False
        
        finally:
            await page.evaluate("""
                console.groupEnd();
            """)
    
    # Nếu đã thử hết số lần tối đa mà vẫn không thành công
    logging.error(f"Đã thử {max_retries} lần nhưng vẫn không thành công")
    return False

async def click_upload_new_image(page):
    """Nhấn nút tải lên ảnh mới"""
    try:
        logging.info("Đang tìm nút tải lên ảnh mới...")
        
        await page.evaluate("""
            console.group('%c➡️ Tìm và nhấn nút tải lên ảnh mới', 'color: #4CAF50; font-weight: bold;');
            console.log('%cBắt đầu tìm nút tải lên ảnh mới...', 'color: #2196F3;');
        """)
        
        # Tìm nút upload bằng các cách như trong kling-content.js
        try:
            await page.evaluate("""
                console.log('%cPhương pháp 1: Tìm theo selector chính xác', 'color: #2196F3;');
            """)
            
            # Try to find the upload icon button
            upload_button_el = await page.query_selector('a.el-tooltip__trigger svg[data-v-65769b80][xlink\\:href="#icon-upload"]')
            
            if upload_button_el:
                parent_a = await upload_button_el.evaluate('(element) => element.closest("a")')
                if parent_a:
                    await page.evaluate('(element) => element.click()', parent_a)
                    logging.info("Đã nhấn nút tải lên ảnh mới")
                    
                    await page.evaluate("""
                        console.log('%c✅ Phương pháp 1 thành công: Đã nhấn nút tải lên ảnh mới', 'color: #4CAF50; font-weight: bold;');
                        console.groupEnd();
                    """)
                    
                    return True
        except Exception as e:
            logging.warning(f"Phương pháp 1 không thành công: {str(e)}")
            
            await page.evaluate(f"""
                console.log('%c❌ Phương pháp 1 không thành công:', 'color: #F44336;', "{str(e).replace('"', '\\"')}");
            """)
                
        # Thử cách khác nếu cách trên không thành công
        try:
            await page.evaluate("""
                console.log('%cPhương pháp 2: Tìm theo selector a[data-v-053dc2b0].el-tooltip__trigger', 'color: #2196F3;');
            """)
            
            upload_button = await page.query_selector("a[data-v-053dc2b0].el-tooltip__trigger")
            if upload_button:
                await upload_button.click()
                logging.info("Đã nhấn nút tải lên ảnh mới (cách 2)")
                
                await page.evaluate("""
                    console.log('%c✅ Phương pháp 2 thành công: Đã nhấn nút tải lên ảnh mới', 'color: #4CAF50; font-weight: bold;');
                    console.groupEnd();
                """)
                
                return True
        except Exception as e:
            logging.warning(f"Phương pháp 2 không thành công: {str(e)}")
            
            await page.evaluate(f"""
                console.log('%c❌ Phương pháp 2 không thành công:', 'color: #F44336;', "{str(e).replace('"', '\\"')}");
            """)
                
        # Thử tìm bất kỳ nút nào có icon upload
        try:
            await page.evaluate("""
                console.log('%cPhương pháp 3: Tìm tất cả svg và kiểm tra nếu có chứa từ "upload"', 'color: #2196F3;');
            """)
            
            all_svgs = await page.query_selector_all('svg')
            for svg in all_svgs:
                html = await svg.evaluate('(element) => element.outerHTML')
                if 'upload' in html.lower():
                    parent = await svg.evaluate("""(element) => {
                        return element.closest("a") || element.closest("button");
                    }""")
                    
                    if parent:
                        await page.evaluate('(element) => element.click()', parent)
                        logging.info("Đã nhấn nút tải lên ảnh mới (cách 3)")
                        
                        await page.evaluate("""
                            console.log('%c✅ Phương pháp 3 thành công: Đã nhấn nút tải lên ảnh mới', 'color: #4CAF50; font-weight: bold;');
                            console.groupEnd();
                        """)
                        
                        return True
        except Exception as e:
            logging.warning(f"Phương pháp 3 không thành công: {str(e)}")
            
            await page.evaluate(f"""
                console.log('%c❌ Phương pháp 3 không thành công:', 'color: #F44336;', "{str(e).replace('"', '\\"')}");
            """)
                    
        logging.error("Không tìm thấy nút tải lên ảnh mới")
        
        await page.evaluate("""
            console.log('%c❌ Tất cả các phương pháp đều thất bại: Không tìm thấy nút tải lên ảnh mới', 'color: #F44336; font-weight: bold;');
            console.groupEnd();
        """)
        
        return False
    except Exception as e:
        logging.error(f"Lỗi khi nhấn nút tải lên ảnh mới: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi nhấn nút tải lên ảnh mới:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)

async def process_batch_to_kling(page, data_items):
    """Xử lý lần lượt các ảnh và prompt vào Kling AI"""
    if not data_items or len(data_items) == 0:
        logging.error("Không có dữ liệu để nhập vào Kling AI")
        
        await page.evaluate("""
            console.log('%c❌ Không có dữ liệu để nhập vào Kling AI', 'color: #F44336; font-weight: bold;');
        """)
        
        return
        
    logging.info(f"Bắt đầu xử lý {len(data_items)} ảnh vào Kling AI")
    
    # Lưu số lượng ảnh cần xử lý vào localStorage
    await page.evaluate(f"""
        // Lưu tổng số ảnh cần xử lý vào localStorage
        localStorage.setItem('totalImagesExpected', {len(data_items)});
        localStorage.setItem('totalImagesProcessed', 0);
        
        console.group('%c🔄 Xử lý batch ảnh vào Kling AI', 'color: #9C27B0; font-weight: bold; font-size: 14px;');
        console.log('%cTổng số ảnh cần xử lý:', 'font-weight: bold;', {len(data_items)});
    """)
    
    # Biến đếm số ảnh đã xử lý thành công
    successful_imports = 0
    
    # Xử lý ảnh đầu tiên
    try:
        first_item = data_items[0]
        
        await page.evaluate(f"""
            console.group('%c🖼️ Xử lý ảnh 1/{len(data_items)}', 'color: #FF9800; font-weight: bold;');
            console.log('%cFile ảnh:', 'font-weight: bold;', "{os.path.basename(first_item['image_path'])}");
            console.log('%cĐộ dài prompt:', 'font-weight: bold;', {len(first_item['prompt_content'])});
        """)
        
        success = await import_to_kling_ai(page, first_item['image_data_url'], first_item['prompt_content'])
        
        if not success:
            logging.error("Không thể nhập ảnh đầu tiên vào Kling AI, sẽ tiếp tục với các ảnh khác")
            
            await page.evaluate("""
                console.log('%c❌ Không thể nhập ảnh đầu tiên vào Kling AI, sẽ tiếp tục với các ảnh khác', 'color: #F44336;');
                console.groupEnd();
            """)
        else:
            logging.info(f"Đã nhập thành công ảnh 1/{len(data_items)}")
            successful_imports += 1
            
            # Cập nhật số lượng ảnh đã xử lý thành công
            await page.evaluate(f"""
                localStorage.setItem('totalImagesProcessed', {successful_imports});
                console.log('%c✅ Đã nhập thành công ảnh 1/{len(data_items)}', 'color: #4CAF50; font-weight: bold;');
                console.groupEnd();
            """)
        
        # Đợi 8 giây cho quá trình tạo ảnh đầu tiên
        await page.evaluate("""
            console.log('%c⏳ Đang đợi 8 giây cho quá trình tạo ảnh...', 'color: #2196F3;');
        """)
        
        await asyncio.sleep(8)
    except Exception as e:
        logging.error(f"Lỗi khi xử lý ảnh đầu tiên: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi xử lý ảnh đầu tiên:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)
    
    # Xử lý các ảnh còn lại
    for i, item in enumerate(data_items[1:], start=2):
        try:
            logging.info(f"Đang nhập ảnh {i}/{len(data_items)}")
            
            await page.evaluate(f"""
                console.group('%c🖼️ Xử lý ảnh {i}/{len(data_items)}', 'color: #FF9800; font-weight: bold;');
                console.log('%cFile ảnh:', 'font-weight: bold;', "{os.path.basename(item['image_path'])}");
                console.log('%cĐộ dài prompt:', 'font-weight: bold;', {len(item['prompt_content'])});
            """)
            
            # Click nút tải lên ảnh mới
            success = await click_upload_new_image(page)
            if not success:
                logging.error(f"Không thể nhấn nút tải lên ảnh mới cho ảnh {i}, sẽ thử ảnh tiếp theo")
                
                await page.evaluate(f"""
                    console.log('%c❌ Không thể nhấn nút tải lên ảnh mới cho ảnh {i}, sẽ thử ảnh tiếp theo', 'color: #F44336;');
                    console.groupEnd();
                """)
                
                continue
                
            # Đợi giao diện chuẩn bị
            await page.evaluate("""
                console.log('%c⏳ Đang đợi 2 giây cho giao diện chuẩn bị...', 'color: #2196F3;');
            """)
            
            await asyncio.sleep(2)
            
            # Nhập ảnh và prompt mới
            success = await import_to_kling_ai(page, item['image_data_url'], item['prompt_content'])
            if not success:
                logging.error(f"Không thể nhập ảnh {i} vào Kling AI, sẽ tiếp tục với ảnh tiếp theo")
                
                await page.evaluate(f"""
                    console.log('%c❌ Không thể nhập ảnh {i} vào Kling AI, sẽ tiếp tục với ảnh tiếp theo', 'color: #F44336;');
                    console.groupEnd();
                """)
                
                continue
                
            logging.info(f"Đã nhập thành công ảnh {i}/{len(data_items)}")
            successful_imports += 1
            
            # Cập nhật số lượng ảnh đã xử lý thành công
            await page.evaluate(f"""
                localStorage.setItem('totalImagesProcessed', {successful_imports});
                console.log('%c✅ Đã nhập thành công ảnh {i}/{len(data_items)}', 'color: #4CAF50; font-weight: bold;');
                console.groupEnd();
            """)
            
            # Đợi 8 giây cho quá trình tạo ảnh
            await page.evaluate("""
                console.log('%c⏳ Đang đợi 8 giây cho quá trình tạo ảnh...', 'color: #2196F3;');
            """)
            
            await asyncio.sleep(8)
        except Exception as e:
            logging.error(f"Lỗi khi xử lý ảnh {i}: {str(e)}")
            logging.error(traceback.format_exc())
            
            await page.evaluate(f"""
                console.log('%c❌ Lỗi khi xử lý ảnh {i}:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
                console.groupEnd();
            """)
            
            continue
    
    logging.info(f"Hoàn thành nhập {successful_imports}/{len(data_items)} ảnh và prompt vào Kling AI")
    
    # Lưu số lượng cuối cùng của ảnh đã xử lý thành công
    await page.evaluate(f"""
        console.log('%c✅ Hoàn thành nhập {successful_imports}/{len(data_items)} ảnh và prompt vào Kling AI', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
        console.log('%c⏳ Bắt đầu kiểm tra hoàn thành và tải xuống các ảnh đã tạo...', 'color: #2196F3; font-weight: bold;');
        console.groupEnd();
    """)
    
    # Thiết lập timer để kiểm tra hoàn thành và tải xuống
    await setup_completion_timer(page, successful_imports)

async def get_batch_data_from_browser(page):
    """Lấy dữ liệu batch từ trình duyệt"""
    try:
        logging.info("Đang kiểm tra dữ liệu batch từ trình duyệt...")
        
        # Script để lấy dữ liệu batch từ localStorage
        script = """
        (async () => {
            try {
                // Lấy batchSessionId
                const batchSessionId = localStorage.getItem('batchSessionId');
                
                // Lấy batchResults
                const batchResultsStr = localStorage.getItem('batchResults');
                let batchResults = null;
                
                if (batchResultsStr) {
                    try {
                        batchResults = JSON.parse(batchResultsStr);
                    } catch (e) {
                        console.error('Lỗi khi parse batchResults:', e);
                    }
                }
                
                // Kiểm tra dữ liệu
                if (!batchSessionId || !batchResults || batchResults.length === 0) {
                    return null;
                }
                
                // Chuẩn bị dữ liệu trả về
                const batchData = {
                    batchSessionId: batchSessionId,
                    results: batchResults.map((item, index) => {
                        return {
                            original_image: item.original_image,
                            result_text: item.result_text || '',
                            success: item.success || false,
                            error: item.error || null,
                            original_filename: item.original_filename || `image_${index + 1}.jpeg`
                        };
                    })
                };
                
                return batchData;
            } catch (error) {
                console.error('Lỗi khi lấy dữ liệu batch từ trình duyệt:', error);
                return null;
            }
        })();
        """
        
        # Thực thi script để lấy dữ liệu
        batch_data = await page.evaluate(script)
        
        if not batch_data:
            logging.warning("Không tìm thấy dữ liệu batch từ trình duyệt")
            return None
            
        # Log thông tin batch đã lấy được
        logging.info(f"Đã lấy được dữ liệu batch từ trình duyệt: ID={batch_data['batchSessionId']}, {len(batch_data['results'])} ảnh")
        
        # Xử lý các đường dẫn ảnh blob (nếu có)
        for i, item in enumerate(batch_data['results']):
            # Chuẩn bị đường dẫn tương đối của ảnh
            relative_path = f"static/uploads/generated/{batch_data['batchSessionId']}"
            
            # Nếu ảnh là blob URL, cần cập nhật lại thành đường dẫn tương đối
            if item['original_image'].startswith('blob:'):
                image_filename = item.get('original_filename', f"image_{i+1}.jpeg")
                item['image_path'] = f"{relative_path}/input_{i}_{image_filename}"
                logging.info(f"Đã chuyển blob URL thành đường dẫn tương đối: {item['image_path']}")
            else:
                # Đường dẫn đã là đường dẫn server
                item['image_path'] = item['original_image']
                
            # Lưu đường dẫn tương đối cho prompt
            image_filename = item.get('original_filename', f"image_{i+1}.jpeg")
            item['prompt_path'] = f"{relative_path}/output_{i}_input_{i}_{image_filename}.txt"
        
        return batch_data
    except Exception as e:
        logging.error(f"Lỗi khi lấy dữ liệu batch từ trình duyệt: {str(e)}")
        logging.error(traceback.format_exc())
        return None



async def get_batch_data_from_batch_id(batch_id):
    """Lấy dữ liệu batch từ batch_id lấy ra từ server"""
    try:
        if not batch_id:
            logging.error("Không có batch_id để lấy dữ liệu")
            return None
            
        logging.info(f"Đang lấy dữ liệu batch từ batch_id: {batch_id}")
        
        # Tìm đường dẫn thư mục gốc của ứng dụng
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Kiểm tra cả hai đường dẫn có thể có
        batch_folder = os.path.join(root_dir, 'uploads', 'generated', batch_id)
        static_batch_folder = os.path.join(root_dir, 'static', 'uploads', 'generated', batch_id)
        
        # Chọn đường dẫn thư mục tồn tại
        if os.path.exists(batch_folder):
            logging.info(f"Sử dụng đường dẫn thư mục batch: {batch_folder}")
        elif os.path.exists(static_batch_folder):
            batch_folder = static_batch_folder
            logging.info(f"Sử dụng đường dẫn thư mục batch static: {batch_folder}")
        else:
            logging.error(f"Thư mục batch không tồn tại ở cả hai đường dẫn")
            return None
            
        # Tìm tất cả các file ảnh đầu vào
        input_images = sorted(glob.glob(os.path.join(batch_folder, 'input_*.jpeg')))
        output_files = sorted(glob.glob(os.path.join(batch_folder, 'output_*.txt')))
        
        logging.info(f"Đã tìm thấy {len(input_images)} ảnh và {len(output_files)} file prompt")
        
        if len(input_images) == 0:
            logging.error(f"Không tìm thấy ảnh trong thư mục batch: {batch_folder}")
            return None
            
        # Tạo cấu trúc dữ liệu batch
        batch_data = {
            'batchSessionId': batch_id,
            'batch_folder': batch_folder,
            'results': []
        }
        
        # Tạo đường dẫn tương đối của batch
        batch_relative_path = f"static/uploads/generated/{batch_id}"
        
        # Đọc từng file ảnh và tìm prompt tương ứng
        for i, image_path in enumerate(input_images):
            try:
                image_filename = os.path.basename(image_path)
                image_index = i  # Lưu index của ảnh
                
                # Tìm file prompt tương ứng với nhiều pattern khác nhau
                prompt_found = False
                prompt_content = ""
                prompt_path = ""
                
                # Pattern 1: Tên file như cũ output_*_input_*_filename.txt
                pattern1 = os.path.join(batch_folder, f'output_*_{image_filename}.txt')
                pattern1_results = glob.glob(pattern1)
                
                # Pattern 2: Tên file theo index output_index_*.txt
                pattern2 = os.path.join(batch_folder, f'output_{image_index}_*.txt')
                pattern2_results = glob.glob(pattern2)
                
                # Pattern 3: Pattern thấy trong lỗi, có chứa "inp_" 
                base_name = os.path.splitext(image_filename)[0]  # Tên không có phần mở rộng
                pattern3 = os.path.join(batch_folder, f'output_{image_index}_inp_*.txt')
                pattern3_results = glob.glob(pattern3)
                
                # Thử từng pattern
                for pattern_name, pattern_results in [
                    ("Pattern 1", pattern1_results),
                    ("Pattern 2", pattern2_results),
                    ("Pattern 3", pattern3_results)
                ]:
                    if pattern_results:
                        prompt_path = pattern_results[0]
                        try:
                            with open(prompt_path, 'r', encoding='utf-8') as f:
                                prompt_content = f.read().strip()
                            logging.info(f"Đã đọc nội dung prompt từ file ({pattern_name}): {os.path.basename(prompt_path)}")
                            prompt_found = True
                            break
                        except Exception as e:
                            logging.error(f"Lỗi khi đọc file prompt {prompt_path}: {str(e)}")
                
                # Nếu không tìm thấy với các pattern cụ thể, thử với bất kỳ file output nào
                if not prompt_found and output_files and i < len(output_files):
                    prompt_path = output_files[i]
                    try:
                        with open(prompt_path, 'r', encoding='utf-8') as f:
                            prompt_content = f.read().strip()
                        logging.info(f"Sử dụng file prompt theo index: {os.path.basename(prompt_path)}")
                        prompt_found = True
                    except Exception as e:
                        logging.error(f"Lỗi khi đọc file prompt thay thế {prompt_path}: {str(e)}")
                
                if not prompt_found:
                    logging.warning(f"Không tìm thấy file prompt cho ảnh: {image_filename}")
                    
                # Đọc nội dung ảnh và chuyển sang base64
                with open(image_path, 'rb') as img_file:
                    image_data = img_file.read()
                    image_base64 = base64.b64encode(image_data).decode('utf-8')
                    logging.info(f"Đã đọc và chuyển đổi ảnh thành base64: {image_filename}")
                    
                # Tạo data URL
                data_url = f"data:image/jpeg;base64,{image_base64}"
                
                # Tạo đường dẫn tương đối cho ảnh và prompt
                image_rel_path = f"{batch_relative_path}/{image_filename}"
                prompt_rel_path = f"{batch_relative_path}/{os.path.basename(prompt_path)}" if prompt_path else ""
                
                # Thêm vào kết quả batch
                batch_data['results'].append({
                    'original_image': data_url,
                    'result_text': prompt_content,
                    'success': True,
                    'error': None,
                    'original_filename': image_filename,
                    'image_path': image_rel_path,
                    'prompt_path': prompt_rel_path
                })
                
                logging.info(f"Đã thêm ảnh {i+1}/{len(input_images)}: {image_filename}")
                
            except Exception as e:
                logging.error(f"Lỗi khi xử lý ảnh {image_path}: {str(e)}")
                logging.error(traceback.format_exc())
                continue
        
        logging.info(f"Đã lấy dữ liệu batch từ batch_id thành công: {len(batch_data['results'])}/{len(input_images)} ảnh")
        return batch_data
    except Exception as e:
        logging.error(f"Lỗi khi lấy dữ liệu batch từ batch_id: {str(e)}")
        logging.error(traceback.format_exc())
        return None



async def get_batch_id_from_server(page, batch_id):
    """Hiển thị thông tin batch_id và đường dẫn lên console"""
    if not batch_id:
        logging.warning("Không có batch_id để hiển thị")
        return False
        
    logging.info(f"Hiển thị thông tin batch_id {batch_id} lên console của trình duyệt...")
    
    # Tạo đường dẫn tương đối của batch
    batch_relative_path = f"static/uploads/generated/{batch_id}"
    
    # Lấy dữ liệu ảnh và prompt từ thư mục batch
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    batch_folder = os.path.join(root_dir, 'static', 'uploads', 'generated', batch_id)
    
    # Tìm tất cả các file ảnh đầu vào
    input_images = []
    output_files = []
    
    if os.path.exists(batch_folder):
        input_images = sorted(glob.glob(os.path.join(batch_folder, 'input_*.jpeg')))
        output_files = sorted(glob.glob(os.path.join(batch_folder, 'output_*.txt')))
    
    script = f"""
    (async () => {{
        try {{
            console.group('%c📂 Thông tin batch từ server', 'color: #9C27B0; font-weight: bold;');
            
            console.log('%cBatch ID:', 'font-weight: bold;', '{batch_id}');
            console.log('%cĐường dẫn batch:', 'font-weight: bold;', '{batch_relative_path}');
            
            // Hiển thị thông tin ảnh và prompt
            console.log('%cSố lượng ảnh tìm thấy:', 'font-weight: bold;', {len(input_images)});
            console.log('%cSố lượng file prompt tìm thấy:', 'font-weight: bold;', {len(output_files)});
            
            // Hiển thị danh sách các file ảnh
            if ({len(input_images)} > 0) {{
                console.group('%c📸 Danh sách ảnh', 'color: #FF9800; font-weight: bold;');
                {'; '.join([f"console.log('{i+1}. {os.path.basename(img)}')" for i, img in enumerate(input_images)])}
                console.groupEnd();
            }}
            
            // Hiển thị danh sách các file prompt
            if ({len(output_files)} > 0) {{
                console.group('%c📝 Danh sách prompt', 'color: #2196F3; font-weight: bold;');
                {'; '.join([f"console.log('{i+1}. {os.path.basename(txt)}')" for i, txt in enumerate(output_files)])}
                console.groupEnd();
            }}
            
            // Đọc và hiển thị nội dung của các file prompt
            if ({len(output_files)} > 0) {{
                console.group('%c📄 Nội dung prompt', 'color: #4CAF50; font-weight: bold;');
                
                {'; '.join([f"""
                console.group('%c{i+1}. {os.path.basename(txt)}', 'color: #9C27B0;');
                try {{
                    fetch('/{txt.replace(root_dir, "").replace(os.sep, "/")}')
                        .then(response => response.text())
                        .then(content => {{
                            console.log(content);
                            console.groupEnd();
                        }})
                        .catch(error => {{
                            console.error('Không thể đọc file:', error);
                            console.groupEnd();
                        }});
                }} catch (e) {{
                    console.error('Lỗi khi đọc file:', e);
                    console.groupEnd();
                }}
                """ for i, txt in enumerate(output_files[:5])])}  // Chỉ hiển thị 5 prompt đầu tiên để tránh quá tải
                
                if ({len(output_files)} > 5) {{
                    console.log('%c... và {len(output_files) - 5} file prompt khác', 'font-style: italic;');
                }}
                
                console.groupEnd();
            }}
            
            console.groupEnd();
            return true;
        }} catch (error) {{
            console.error('Lỗi khi hiển thị thông tin batch:', error);
            console.log('%c❌ Lỗi khi hiển thị thông tin batch:', 'color: #F44336; font-weight: bold;', error);
            console.groupEnd();
            return false;
        }}
    }})();
    """
    
    try:
        success = await page.evaluate(script)
        if success:
            logging.info(f"Đã hiển thị thông tin batch_id {batch_id} lên console thành công")
        else:
            logging.error("Không thể hiển thị thông tin batch lên console")
        return success
    except Exception as e:
        logging.error(f"Lỗi khi hiển thị thông tin batch lên console: {str(e)}")
        logging.error(traceback.format_exc())
        return False


async def open_chrome_with_url(url, batch_session_id=None):
    """Open Chrome browser with the default profile and navigate to the specified URL"""
    logging.info("Bắt đầu quy trình mở Chrome và nhập dữ liệu vào Kling AI")
    
    # Biến để lưu trữ dữ liệu batch
    batch_folder = None
    data_items = []
    batch_id = batch_session_id  # Sử dụng batch_session_id được truyền vào nếu có
    batch_relative_path = None
    
    try:
        # Nếu có batch_session_id được truyền vào, sử dụng nó
        if batch_id:
            logging.info(f"Sử dụng Batch ID được truyền vào: {batch_id}")
            # Tạo đường dẫn tương đối từ batch_id
            batch_relative_path = f"static/uploads/generated/{batch_id}"
            logging.info(f"Đường dẫn tương đối được tạo: {batch_relative_path}")
            
            # Lấy dữ liệu batch từ batch ID
            batch_data = await get_batch_data_from_batch_id(batch_id)
            if batch_data and batch_data['results'] and len(batch_data['results']) > 0:
                # Chuyển đổi dữ liệu sang định dạng cần thiết
                data_items = []
                for item in batch_data['results']:
                    data_items.append({
                        'image_path': item['image_path'],
                        'prompt_path': item['prompt_path'],
                        'prompt_content': item['result_text'],
                        'image_data_url': item['original_image']
                    })
                logging.info(f"Đã lấy {len(data_items)} mục dữ liệu từ batch ID: {batch_id}")
            else:
                logging.warning(f"Không thể lấy dữ liệu từ batch ID: {batch_id}")
        else:
            # Không có batch_id, tìm thư mục batch mới nhất và lấy dữ liệu
            logging.info("Không có Batch ID được truyền vào, đang tìm thư mục batch mới nhất...")
            batch_folder = await get_latest_batch_folder()
            
            if batch_folder:
                # Lấy ID batch và đường dẫn tương đối
                batch_id = os.path.basename(batch_folder)
                batch_relative_path = await get_batch_relative_path(batch_folder)
                logging.info(f"ID Batch: {batch_id}, Đường dẫn tương đối: {batch_relative_path}")
                
                logging.info("Đang lấy dữ liệu ảnh và prompt...")
                data_items = await get_image_and_prompt_data(batch_folder)
                
                if data_items and len(data_items) > 0:
                    logging.info(f"Đã tìm thấy {len(data_items)} ảnh và prompt để nhập vào Kling AI")
                else:
                    logging.warning("Không tìm thấy dữ liệu ảnh và prompt, sẽ chỉ mở Chrome")
            else:
                logging.warning("Không tìm thấy thư mục batch, sẽ chỉ mở Chrome")
    except Exception as e:
        logging.error(f"Lỗi khi tìm và đọc dữ liệu batch: {str(e)}")
        logging.error(traceback.format_exc())
        logging.warning("Sẽ tiếp tục mở Chrome mà không có dữ liệu batch")
    
    try:
        logging.info(f"Đang mở Chrome với URL: {url}")
        
        async with async_playwright() as p:
            # Use specific Chrome user data directory for Windows
            user_data_dir = r"C:\Users\Admin\AppData\Local\Google\Chrome\User Data"
            
            logging.info(f"Sử dụng thư mục Chrome user data: {user_data_dir}")
            
            # Launch Chrome with default profile
            browser = await p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                channel="chrome",
                args=[
                    "--profile-directory=Default", 
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-blink-features=AutomationControlled"
                ],
                ignore_default_args=["--enable-automation"],
                accept_downloads=True,
                viewport={"width": 1280, "height": 800}
            )
            
            # Console log thông báo Chrome đã mở thành công
            logging.info("Đã mở Chrome thành công")
            
            # Create a new page and navigate to the URL
            logging.info("Đang mở trang mới và đi đến URL")
            page = await browser.new_page()
            
            # Console log trước khi đi đến URL
            await page.evaluate(f"""
                console.group('%c🚀 BẮT ĐẦU QUY TRÌNH KLING AI', 'color: #4CAF50; font-weight: bold; font-size: 18px;');
                console.log('%c🌐 Đang chuẩn bị tải trang Kling AI: {url}', 'color: #2196F3; font-weight: bold;');
                console.log('%c⏳ Vui lòng đợi trong khi trang đang tải...', 'color: #FF9800;');
            """)
            
            await page.goto(url)
            
            # Lấy thông tin trang đã tải
            page_title = await page.title()
            page_url = page.url
            
            # Console log thông tin trang đã tải
            await page.evaluate(f"""
                console.log('%c✅ Đã tải trang thành công', 'color: #4CAF50; font-weight: bold;');
                console.log('%c📄 Tiêu đề trang:', 'font-weight: bold;', '{page_title}');
                console.log('%c🔗 URL hiện tại:', 'font-weight: bold;', '{page_url}');
                console.log('%c⏳ Đang đợi trang tải hoàn toàn...', 'color: #FF9800;');
            """)
            
            # Đợi trang tải xong
            logging.info("Đang đợi trang tải xong...")
            await page.wait_for_load_state("networkidle")
            
            # Kiểm tra xem các phần tử quan trọng đã xuất hiện chưa
            await page.evaluate("""
                console.log('%c🔍 Kiểm tra trạng thái trang...', 'color: #2196F3;');
                const promptInput = document.querySelector('.prompt-input[contenteditable="true"]');
                const uploadInput = document.querySelector('.el-upload__input[type="file"]');
                const generateButton = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Generate'));
                
                console.log('%cTrường nhập prompt:', 'font-weight: bold;', promptInput ? '✅ Đã tìm thấy' : '❌ Không tìm thấy');
                console.log('%cNút tải lên ảnh:', 'font-weight: bold;', uploadInput ? '✅ Đã tìm thấy' : '❌ Không tìm thấy');
                console.log('%cNút Generate:', 'font-weight: bold;', generateButton ? '✅ Đã tìm thấy' : '❌ Không tìm thấy');
                
                if (promptInput && uploadInput && generateButton) {
                    console.log('%c✅ Trang đã sẵn sàng để sử dụng', 'color: #4CAF50; font-weight: bold;');
                } else {
                    console.log('%c⚠️ Trang có thể chưa tải hoàn toàn, một số phần tử chưa sẵn sàng', 'color: #FF9800; font-weight: bold;');
                }
                
                console.log('%c🔄 Chuẩn bị xử lý dữ liệu batch...', 'color: #2196F3; font-weight: bold;');
            """)
            
            # Đợi thêm 3 giây để đảm bảo giao diện đã tải hoàn toàn
            await asyncio.sleep(3)
            
            # Nếu có batch_id, hiển thị thông tin lên console
            if batch_id:
                logging.info(f"Hiển thị thông tin batch_id {batch_id} lên console")
                await get_batch_id_from_server(page, batch_id)
                # Hiển thị thông báo trong console
                await page.evaluate(f"""
                    console.log('%c🔄 Đã nhận batch_id từ server: {batch_id}', 'color: #9C27B0; font-weight: bold; font-size: 14px;');
                """)
            
            # Nếu không có dữ liệu batch từ batch_id hoặc thư mục, thử lấy từ localStorage
            if not data_items or len(data_items) == 0:
                logging.info("Không tìm thấy dữ liệu batch từ server, thử lấy từ trình duyệt...")
                
                # Thử lấy dữ liệu batch từ localStorage
                browser_batch_data = await get_batch_data_from_browser(page)
                
                if browser_batch_data:
                    logging.info(f"Đã tìm thấy dữ liệu batch từ trình duyệt")
                    
                    # Thiết lập ID batch và đường dẫn tương đối
                    batch_id = browser_batch_data['batchSessionId']
                    batch_relative_path = f"static/uploads/generated/{batch_id}"
                    
                    # Chuyển đổi dữ liệu để phù hợp với format cần thiết
                    data_items = []
                    for i, item in enumerate(browser_batch_data['results']):
                        # Chỉ xử lý các kết quả thành công
                        if item.get('success', False):
                            data_items.append({
                                'image_path': item.get('image_path', ''),
                                'prompt_path': item.get('prompt_path', ''),
                                'prompt_content': item.get('result_text', ''),
                                'image_data_url': item.get('original_image', '')
                            })
                    
                    logging.info(f"Đã chuyển đổi {len(data_items)} mục dữ liệu từ trình duyệt")
            
            # Console.log thông tin batch ảnh
            if batch_id and data_items and len(data_items) > 0:
                # Chuẩn bị dữ liệu để JavaScript hiển thị
                console_data = []
                
                for i, item in enumerate(data_items):
                    # Chuẩn bị tên file và nội dung an toàn cho JavaScript
                    image_filename = os.path.basename(item['image_path']) if item['image_path'] else f"image_{i+1}.jpeg"
                    prompt_filename = os.path.basename(item['prompt_path']) if item['prompt_path'] else ""
                    
                    # Loại bỏ các ký tự không hợp lệ trong JSON
                    safe_prompt = item['prompt_content']
                    if safe_prompt:
                        # Thay thế các ký tự không hợp lệ với escape sequence
                        safe_prompt = safe_prompt.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                        # Loại bỏ các ký tự điều khiển khác
                        safe_prompt = ''.join(ch for ch in safe_prompt if ord(ch) >= 32 or ch in '\n\r\t')
                    
                    console_data.append({
                        "index": i + 1,
                        "image_path": item['image_path'] or "",
                        "image_file": image_filename,
                        "prompt_path": item['prompt_path'] or "",
                        "prompt_file": prompt_filename,
                        "prompt_content": safe_prompt
                    })
                
                # Log thông tin batch đơn giản, không phân tích prompt
                await page.evaluate(f"""
                    console.log('%c=============== THÔNG TIN BATCH ẢNH ===============', 'color: #4CAF50; font-weight: bold; font-size: 16px;');
                    console.log('%cThư mục batch:', 'font-weight: bold;', '{batch_relative_path}');
                    console.log('%cID Batch:', 'font-weight: bold;', '{batch_id}');
                    console.log('%cSố lượng ảnh:', 'font-weight: bold;', {len(data_items)});
                    console.log('%c=============== ĐÃ TÌM THẤY {len(data_items)} ẢNH ===============', 'color: #4CAF50; font-weight: bold;');
                """)
                
                # Log từng ảnh riêng biệt để tránh lỗi JSON
                for i, item in enumerate(console_data):
                    await page.evaluate(f"""
                        console.group('%cẢNH #{i+1}', 'color: #FF9800; font-weight: bold;');
                        console.log('%cTên file ảnh:', 'font-weight: bold;', "{item['image_file']}");
                        console.log('%cĐường dẫn ảnh:', 'font-weight: bold;', "{item['image_path']}");
                        console.log('%cTên file prompt:', 'font-weight: bold;', "{item['prompt_file']}");
                        console.log('%cĐường dẫn prompt:', 'font-weight: bold;', "{item['prompt_path']}");
                        console.log('%cĐộ dài prompt:', 'font-weight: bold;', {len(item['prompt_content'])});
                        console.groupEnd();
                    """)
                
                # Thông báo về việc bắt đầu xử lý ảnh
                await page.evaluate(f"""
                    console.log('%c🔄 Chuẩn bị nhập {len(data_items)} ảnh và prompt vào Kling AI...', 'color: #2196F3; font-weight: bold; font-size: 14px;');
                    console.log('%c💡 TIP: Để xem tiến trình chi tiết, hãy mở tab "Console" trong Developer Tools (F12)', 'color: #9C27B0; font-style: italic;');
                """)
            else:
                # Log thông báo không có dữ liệu trong console
                await page.evaluate("""
                    console.log('%c=============== KHÔNG CÓ DỮ LIỆU BATCH ẢNH ===============', 'color: #F44336; font-weight: bold; font-size: 16px;');
                    console.log('Không tìm thấy thư mục batch hoặc không có ảnh/prompt trong thư mục.');
                    console.log('Bạn cần xử lý một batch ảnh trước khi sử dụng tính năng này.');
                """)
                logging.warning("Không có dữ liệu batch ảnh để hiển thị trong console")
            
            # Bắt đầu nhập dữ liệu vào Kling AI nếu có dữ liệu
            if data_items and len(data_items) > 0:
                logging.info("Bắt đầu nhập dữ liệu vào Kling AI")
                await process_batch_to_kling(page, data_items)
            else:
                logging.info("Không có dữ liệu để nhập, chỉ mở trình duyệt")
                
                await page.evaluate("""
                    console.log('%c⚠️ Không có dữ liệu batch để nhập vào Kling AI', 'color: #FF9800; font-weight: bold;');
                    console.log('%c✅ Quá trình mở Chrome đã hoàn tất', 'color: #4CAF50; font-weight: bold;');
                    console.groupEnd();
                """)
            
            # Keep the browser open
            logging.info("Giữ trình duyệt mở (1 giờ)")
            
            await page.evaluate("""
                console.log('%c⏳ Giữ trình duyệt mở trong 1 giờ...', 'color: #2196F3;');
                console.log('%c✅ QUY TRÌNH HOÀN TẤT, CÓ THỂ SỬ DỤNG KLING AI', 'color: #4CAF50; font-weight: bold; font-size: 16px;');
                console.groupEnd();
            """)
            
            await asyncio.sleep(3600)  # Keep open for 1 hour
    except Exception as e:
        logging.error(f"Lỗi khi mở Chrome: {str(e)}")
        logging.error(traceback.format_exc())
        raise

def open_kling_ai(batch_session_id=None):
    """Open Kling AI Frame Mode in Chrome browser"""
    url = "https://app.klingai.com/global/image-to-video/frame-mode/new"
    asyncio.run(open_chrome_with_url(url, batch_session_id))

async def check_progress_boxes(page, total_processed_images):
    """Kiểm tra các progress box và nhấn nút Assets nếu không tìm thấy"""
    logging.info(f"Đang kiểm tra progress boxes cho {total_processed_images} ảnh...")
    
    await page.evaluate(f"""
        console.group('%c🔍 Kiểm tra trạng thái hoàn thành', 'color: #4CAF50; font-weight: bold;');
        console.log('%c⏳ Đang kiểm tra tiến trình xử lý {total_processed_images} ảnh...', 'color: #2196F3;');
    """)
    
    # Kiểm tra xem còn progress box nào không
    progress_boxes = await page.query_selector_all(".progress-box.vertical-center")
    
    if not progress_boxes or len(progress_boxes) == 0:
        logging.info("Không còn progress box nào, tiến hành nhấn nút Assets")
        
        await page.evaluate("""
            console.log('%c✅ Không còn progress box, tiến hành nhấn nút Assets', 'color: #4CAF50;');
        """)
        
        # Nhấn nút Assets
        await click_assets_button(page, total_processed_images)
    else:
        logging.info(f"Còn {len(progress_boxes)} progress box, đợi thêm 5 giây")
        
        await page.evaluate(f"""
            console.log('%c⏳ Còn {len(progress_boxes)} progress box, đợi thêm 5 giây...', 'color: #FF9800;');
            console.groupEnd();
        """)
        
        # Đợi 5 giây rồi kiểm tra lại
        await asyncio.sleep(5)
        await check_progress_boxes(page, total_processed_images)


async def click_assets_button(page, total_processed_images):
    """Nhấn nút Assets sau khi hoàn tất xử lý"""
    logging.info(f"Đang tìm và nhấn nút Assets cho {total_processed_images} ảnh...")
    
    await page.evaluate(f"""
        console.log('%c🔍 Đang tìm nút Assets cho {total_processed_images} ảnh...', 'color: #2196F3;');
    """)
    
    # Thử nhiều cách khác nhau để tìm nút Assets như trong kling-content.js
    try:
        # By exact selector
        assets_button = await page.query_selector(
            "button.generic-button.secondary.medium[data-v-10b25476][data-v-b4600797]"
        )
        
        if assets_button:
            logging.info("Đã tìm thấy nút Assets với selector chính xác")
            await page.evaluate("""
                console.log('%c✅ Đã tìm thấy nút Assets với selector chính xác', 'color: #4CAF50;');
            """)
        else:
            # By innerText
            all_buttons = await page.query_selector_all("button")
            for button in all_buttons:
                text = await button.text_content()
                if text and "Assets" in text:
                    assets_button = button
                    logging.info("Đã tìm thấy nút Assets dựa vào text")
                    await page.evaluate("""
                        console.log('%c✅ Đã tìm thấy nút Assets dựa vào text', 'color: #4CAF50;');
                    """)
                    break
                    
            if not assets_button:
                # By SVG icon and inner span
                all_buttons = await page.query_selector_all("button")
                for button in all_buttons:
                    svg = await button.query_selector('svg use[xlink\\:href="#icon-folder"]')
                    span = await button.query_selector("span")
                    
                    if svg and span:
                        span_text = await span.text_content()
                        if span_text == "Assets":
                            assets_button = button
                            logging.info("Đã tìm thấy nút Assets qua icon và span")
                            await page.evaluate("""
                                console.log('%c✅ Đã tìm thấy nút Assets qua icon và span', 'color: #4CAF50;');
                            """)
                            break
        
        if assets_button:
            # Nhấn nút Assets
            await assets_button.click()
            logging.info("Đã nhấn nút Assets")
            
            await page.evaluate("""
                console.log('%c✅ Đã nhấn nút Assets thành công', 'color: #4CAF50;');
            """)
            
            # Đợi 2 giây rồi nhấn header button
            await asyncio.sleep(2)
            await click_header_button(page, total_processed_images)
        else:
            logging.error("Không tìm thấy nút Assets")
            
            await page.evaluate("""
                console.log('%c❌ Không tìm thấy nút Assets', 'color: #F44336; font-weight: bold;');
                console.groupEnd();
            """)
            
            # Thử phương pháp dự phòng
            all_buttons = await page.query_selector_all("button")
            for button in all_buttons:
                text = await button.text_content()
                if text and "Asset" in text:
                    logging.info("Thử nhấn nút có chứa từ 'Asset'")
                    
                    await page.evaluate("""
                        console.log('%c🔍 Thử nhấn nút có chứa từ "Asset"', 'color: #FF9800;');
                    """)
                    
                    await button.click()
                    logging.info("Đã nhấn nút chứa từ 'Asset'")
                    
                    await page.evaluate("""
                        console.log('%c✅ Đã nhấn nút chứa từ "Asset"', 'color: #4CAF50;');
                    """)
                    
                    # Đợi 2 giây rồi nhấn header button
                    await asyncio.sleep(2)
                    await click_header_button(page, total_processed_images)
                    return
            
            logging.error("Thất bại khi tìm và nhấn nút Assets")
            
            await page.evaluate("""
                console.log('%c❌ Thất bại khi tìm và nhấn nút Assets', 'color: #F44336; font-weight: bold;');
                console.groupEnd();
            """)
    except Exception as e:
        logging.error(f"Lỗi khi nhấn nút Assets: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi nhấn nút Assets:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)


async def click_header_button(page, total_processed_images):
    """Nhấn nút trên header sau khi nhấn Assets"""
    logging.info(f"Đang tìm và nhấn nút trên header cho {total_processed_images} ảnh...")
    
    await page.evaluate(f"""
        console.log('%c🔍 Đang tìm nút trên header cho {total_processed_images} ảnh...', 'color: #2196F3;');
    """)
    
    try:
        header_button = await page.query_selector(
            "#main-material-container > div.header-bar > div:nth-child(2) > button:nth-child(1)"
        )
        
        if header_button:
            await header_button.click()
            logging.info("Đã nhấn nút trên header")
            
            await page.evaluate("""
                console.log('%c✅ Đã nhấn nút trên header thành công', 'color: #4CAF50;');
            """)
            
            # Đợi 2 giây rồi bắt đầu nhấn vào các mục
            await asyncio.sleep(2)
            await click_items_in_sequence(page, total_processed_images)
        else:
            logging.error("Không tìm thấy nút trên header")
            
            await page.evaluate("""
                console.log('%c❌ Không tìm thấy nút trên header', 'color: #F44336; font-weight: bold;');
                console.groupEnd();
            """)
    except Exception as e:
        logging.error(f"Lỗi khi nhấn nút trên header: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi nhấn nút trên header:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)


async def click_items_in_sequence(page, total_items_to_click=None):
    """Nhấn vào từng mục theo thứ tự"""
    logging.info("Đang nhấn vào các mục theo thứ tự...")
    
    await page.evaluate("""
        console.log('%c🔍 Bắt đầu nhấn vào các mục theo thứ tự...', 'color: #2196F3;');
    """)
    
    try:
        # Nếu không có số lượng ảnh được truyền vào, thì đếm các mục trên trang
        if total_items_to_click is None or total_items_to_click <= 0:
            total_items = await page.evaluate("""
                () => {
                    // Tìm tất cả các mục trong container
                    const items = document.querySelectorAll('#main-material-container > div.container > div > div');
                    return items.length;
                }
            """)
        else:
            total_items = total_items_to_click
        
        logging.info(f"Sẽ nhấn {total_items} mục")
        
        await page.evaluate(f"""
            console.log('%c🔍 Sẽ nhấn {total_items} mục', 'color: #2196F3;');
        """)
        
        # Nhấn từng mục theo thứ tự
        for i in range(1, total_items + 1):
            item_selector = f"#main-material-container > div.container > div > div:nth-child({i}) > div"
            item = await page.query_selector(item_selector)
            
            if item:
                await item.click()
                logging.info(f"Đã nhấn mục #{i}")
                
                await page.evaluate(f"""
                    console.log('%c✅ Đã nhấn mục #{i}', 'color: #4CAF50;');
                """)
                
                # Đợi 500ms trước khi nhấn mục tiếp theo
                await asyncio.sleep(0.5)
            else:
                logging.warning(f"Không tìm thấy mục #{i}")
                
                await page.evaluate(f"""
                    console.log('%c⚠️ Không tìm thấy mục #{i}', 'color: #FF9800;');
                """)
        
        logging.info("Đã nhấn tất cả các mục")
        
        await page.evaluate("""
            console.log('%c✅ Đã nhấn tất cả các mục thành công', 'color: #4CAF50;');
        """)
        
        # Đợi 1 giây trước khi tải xuống
        await asyncio.sleep(1)
        
        # Tự động tải xuống không watermark sau khi đã nhấn tất cả các mục
        await click_dropdown_and_download(page)
    except Exception as e:
        logging.error(f"Lỗi khi nhấn các mục theo thứ tự: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi nhấn các mục theo thứ tự:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)


async def click_dropdown_and_download(page):
    """Nhấn dropdown và chọn tải xuống không watermark"""
    logging.info("Đang tìm và nhấn nút dropdown download...")
    
    await page.evaluate("""
        console.group('%c🔍 Đang tìm nút dropdown download...', 'color: #2196F3; font-weight: bold;');
    """)
    
    try:
        # Tìm nút dropdown
        dropdown_button = None
        
        # Thử phương pháp 1: Tìm chính xác theo selector
        dropdown_button = await page.query_selector(
            "#main-material-container > div.header-bar > div:nth-child(2) > div.el-dropdown"
        )
        
        if dropdown_button:
            await page.evaluate("""
                console.log('%c✅ Tìm thấy nút dropdown theo selector chính xác', 'color: #4CAF50;');
            """)
        else:
            # Thử phương pháp 2: Tìm theo class
            dropdown_button = await page.query_selector(".el-dropdown")
            if dropdown_button:
                await page.evaluate("""
                    console.log('%c✅ Tìm thấy nút dropdown theo class', 'color: #4CAF50;');
                """)
            else:
                # Thử phương pháp 3: Tìm nút có chứa icon download
                buttons = await page.query_selector_all("button, div.el-dropdown")
                for btn in buttons:
                    html = await btn.evaluate('(element) => element.outerHTML')
                    if 'download' in html.lower() or 'arrow-down' in html.lower():
                        dropdown_button = btn
                        await page.evaluate("""
                            console.log('%c✅ Tìm thấy nút dropdown thông qua icon', 'color: #4CAF50;');
                        """)
                        break
        
        if not dropdown_button:
            logging.error("Không tìm thấy nút dropdown")
            await page.evaluate("""
                console.log('%c❌ Không tìm thấy nút dropdown', 'color: #F44336; font-weight: bold;');
                console.groupEnd();
            """)
            return False
        
        # Nhấn nút dropdown
        await dropdown_button.click()
        logging.info("Đã nhấn nút dropdown")
        
        await page.evaluate("""
            console.log('%c✅ Đã nhấn nút dropdown thành công', 'color: #4CAF50;');
            console.log('%c⏳ Đang đợi menu dropdown hiện ra...', 'color: #FF9800;');
        """)
        
        # Đợi 1 giây để menu hiện ra
        await asyncio.sleep(1)
        
        # Tìm tùy chọn "Download without Watermark"
        download_option = None
        
        # Tìm theo class và text
        all_options = await page.query_selector_all("li.el-dropdown-menu__item")
        
        for option in all_options:
            text = await option.text_content()
            if "Download without Watermark" in text:
                download_option = option
                await page.evaluate("""
                    console.log('%c✅ Tìm thấy tùy chọn "Download without Watermark"', 'color: #4CAF50;');
                """)
                break
        
        if not download_option:
            # Thử tìm kiếm chính xác hơn với tất cả các phần tử li
            all_li_elements = await page.query_selector_all("li")
            for li in all_li_elements:
                text = await li.text_content()
                if "Download without Watermark" in text:
                    download_option = li
                    await page.evaluate("""
                        console.log('%c✅ Tìm thấy tùy chọn "Download without Watermark" trong các phần tử li', 'color: #4CAF50;');
                    """)
                    break
        
        if not download_option:
            logging.error("Không tìm thấy tùy chọn 'Download without Watermark'")
            await page.evaluate("""
                console.log('%c❌ Không tìm thấy tùy chọn "Download without Watermark"', 'color: #F44336; font-weight: bold;');
                console.log('%c⚠️ Đang hiển thị tất cả các tùy chọn có sẵn để debug...', 'color: #FF9800;');
            """)
            
            # Debug: Hiển thị tất cả các tùy chọn có sẵn
            all_items = await page.query_selector_all("li")
            for i, item in enumerate(all_items):
                text = await item.text_content()
                await page.evaluate(f"""
                    console.log('Tùy chọn {i+1}: "{text}"');
                """)
            
            await page.evaluate("""
                console.groupEnd();
            """)
            return False
        
        # Thiết lập download handler trước khi nhấn nút download
        async with page.expect_download() as download_info:
            # Nhấn vào tùy chọn download
            await download_option.click()
            logging.info("Đã nhấn tùy chọn 'Download without Watermark'")
            
            await page.evaluate("""
                console.log('%c✅ Đã nhấn tùy chọn "Download without Watermark"', 'color: #4CAF50; font-weight: bold;');
                console.log('%c⏳ Đang đợi quá trình tải xuống bắt đầu...', 'color: #FF9800;');
            """)
        
        # Lấy thông tin tải xuống
        download = await download_info.value
        
        # Tạo thư mục lưu file
        download_path = os.path.join(os.path.expanduser("~"), "Downloads", "KlingAI")
        os.makedirs(download_path, exist_ok=True)
        
        # Đặt tên cho file tải xuống
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        download_filename = f"klingai_download_{timestamp}.zip"
        download_path_with_file = os.path.join(download_path, download_filename)
        
        # Lưu file tải xuống
        await download.save_as(download_path_with_file)
        
        logging.info(f"Đã tải xuống file thành công: {download_path_with_file}")
        
        await page.evaluate(f"""
            console.log('%c✅ ĐÃ TẢI XUỐNG FILE THÀNH CÔNG:', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
            console.log('%c📂 Đường dẫn file:', 'font-weight: bold;', "{download_path_with_file.replace('\\', '\\\\')}");
            console.log('%c✅ QUÁ TRÌNH TẢI XUỐNG HOÀN TẤT', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
            console.groupEnd();
        """)
        
        # Mở thư mục chứa file tải xuống
        try:
            if os.name == 'nt':  # Windows
                os.startfile(os.path.dirname(download_path_with_file))
            elif os.name == 'posix':  # macOS, Linux
                import subprocess
                subprocess.Popen(['xdg-open', os.path.dirname(download_path_with_file)])
            
            logging.info(f"Đã mở thư mục chứa file tải xuống: {download_path}")
            
            await page.evaluate(f"""
                console.log('%c📂 Đã mở thư mục chứa file tải xuống', 'color: #4CAF50;');
            """)
        except Exception as e:
            logging.warning(f"Không thể mở thư mục tải xuống: {str(e)}")
            
            await page.evaluate(f"""
                console.log('%c⚠️ Không thể mở thư mục tải xuống: {str(e)}', 'color: #FF9800;');
            """)
        
        return True
    except Exception as e:
        logging.error(f"Lỗi khi nhấn dropdown và tải xuống: {str(e)}")
        logging.error(traceback.format_exc())
        
        await page.evaluate(f"""
            console.log('%c❌ Lỗi khi nhấn dropdown và tải xuống:', 'color: #F44336; font-weight: bold;', "{str(e).replace('"', '\\"')}");
            console.groupEnd();
        """)
        return False


async def setup_completion_timer(page, successful_imports):
    """Thiết lập timer để kiểm tra hoàn thành và nhấn nút Assets"""
    logging.info(f"Thiết lập timer kiểm tra hoàn thành cho {successful_imports} ảnh...")
    
    await page.evaluate(f"""
        console.log('%c⏳ Thiết lập timer kiểm tra hoàn thành xử lý {successful_imports} ảnh...', 'color: #2196F3; font-weight: bold;');
    """)
    
    # Đợi 5 giây trước khi bắt đầu kiểm tra
    await asyncio.sleep(5)
    
    # Bắt đầu quy trình kiểm tra progress box và click Assets
    await check_progress_boxes(page, successful_imports)

if __name__ == "__main__":
    logging.info("=== SCRIPT MỞ CHROME VÀ NHẬP DỮ LIỆU VÀO KLING AI ===")
    url = sys.argv[1] if len(sys.argv) > 1 else "https://app.klingai.com/global/image-to-video/frame-mode/new"
    batch_id = sys.argv[2] if len(sys.argv) > 2 else None
    logging.info(f"URL mục tiêu: {url}")
    logging.info(f"Batch ID: {batch_id}")
    
    try:
        asyncio.run(open_chrome_with_url(url, batch_id))
    except Exception as e:
        logging.error(f"Lỗi không mong đợi: {str(e)}")
        logging.error(traceback.format_exc())
        
        # Cố gắng mở Chrome một cách đơn giản nhất nếu có lỗi
        logging.info("Đang thử mở Chrome theo cách đơn giản...")
        try:
            import subprocess
            subprocess.Popen(['start', 'chrome', url], shell=True)
            logging.info("Đã mở Chrome bằng phương pháp dự phòng")
        except Exception as e2:
            logging.error(f"Không thể mở Chrome ngay cả với phương pháp dự phòng: {str(e2)}")
            logging.error(traceback.format_exc())
