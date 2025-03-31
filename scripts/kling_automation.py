#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Kling AI Automation Script
--------------------------
This script automates the process of importing images and prompts to Kling AI.
It downloads a ZIP file containing images and prompts, extracts them, and uses
Playwright to automate the browser interaction with Kling AI.
"""

import os
import sys
import time
import logging
import tempfile
import zipfile
import argparse
import shutil
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("kling_automation")

try:
    from playwright.sync_api import sync_playwright
    import base64
except ImportError:
    logger.error("Required packages not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright


def load_config():
    """Load configuration from config.json file."""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading config file: {str(e)}")
        return None


def extract_zip(zip_path: str) -> str:
    """Extract the ZIP file to a temporary directory and return the path."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"kling_import_{int(time.time())}")
    os.makedirs(temp_dir, exist_ok=True)
    
    logger.info(f"Extracting ZIP file to: {temp_dir}")
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)
    
    return temp_dir


def read_prompts(extract_dir: str) -> List[str]:
    """Read the prompts from the all_prompts.txt file."""
    prompts_file = os.path.join(extract_dir, "all_prompts.txt")
    
    if not os.path.exists(prompts_file):
        logger.error(f"Prompts file not found: {prompts_file}")
        return []
    
    with open(prompts_file, 'r', encoding='utf-8') as f:
        prompts = [line.strip() for line in f.readlines() if line.strip()]
    
    logger.info(f"Read {len(prompts)} prompts from file")
    return prompts


def get_images(extract_dir: str) -> List[Dict[str, Any]]:
    """Get all image files from the extracted directory."""
    image_files = []
    
    for file in os.listdir(extract_dir):
        if file.lower().endswith(('.jpg', '.jpeg', '.png')) and file.startswith('image_'):
            file_path = os.path.join(extract_dir, file)
            # Extract the number from filename (e.g., image_001.jpg -> 1)
            try:
                number = int(file.split('_')[1].split('.')[0])
            except (IndexError, ValueError):
                number = 999  # Default high number if parsing fails
            
            image_files.append({
                'path': file_path,
                'name': file,
                'number': number
            })
    
    # Sort images by their number
    image_files.sort(key=lambda x: x['number'])
    logger.info(f"Found {len(image_files)} image files")
    
    return image_files


def image_to_base64(image_path: str) -> str:
    """Convert an image file to a base64 data URL."""
    with open(image_path, 'rb') as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    
    # Determine MIME type based on file extension
    mime_type = "image/jpeg"
    if image_path.lower().endswith('.png'):
        mime_type = "image/png"
    
    return f"data:{mime_type};base64,{encoded_string}"


def prepare_import_data(images: List[Dict[str, Any]], prompts: List[str]) -> List[Dict[str, Any]]:
    """Prepare the import data structure with images and prompts."""
    import_data = []
    
    # Ensure we don't exceed the number of available prompts
    for i, image in enumerate(images):
        if i < len(prompts):
            prompt = prompts[i]
            
            # Extract negative prompt if present (format: "prompt || negative prompt")
            negative_prompt = ""
            if " || " in prompt:
                parts = prompt.split(" || ", 1)
                prompt = parts[0].strip()
                negative_prompt = parts[1].strip()
            
            import_data.append({
                'image': image_to_base64(image['path']),
                'description': prompt,
                'negativePrompt': negative_prompt,
                'index': i
            })
    
    logger.info(f"Prepared {len(import_data)} items for import")
    return import_data


def automate_kling_import(import_data: List[Dict[str, Any]]):
    """Automate the Kling AI import process using Playwright."""
    if not import_data:
        logger.error("No data to import")
        return
    
    # Load configuration
    config = load_config()
    if not config:
        logger.error("Failed to load configuration")
        return
    
    logger.info("Starting browser automation for Kling AI import")
    
    with sync_playwright() as p:
        # Define profiles to try in order
        chrome_user_data_dir = r"C:\Users\Admin\AppData\Local\Google\Chrome\User Data"
        profiles_to_try = ["Default", "Profile 1", "Profile 2"]
        
        browser = None
        context = None
        page = None
        
        # Try each profile in order until one works
        for profile_directory in profiles_to_try:
            profile_path = os.path.join(chrome_user_data_dir, profile_directory)
            
            if not os.path.exists(profile_path):
                logger.warning(f"Chrome profile not found: {profile_path}")
                continue
                
            logger.info(f"Attempting to connect to Chrome with profile: {profile_directory}")
            
            try:
                # Try to connect to existing Chrome instance
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=chrome_user_data_dir,
                    channel="chrome",
                    args=[
                        f"--profile-directory={profile_directory}",
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-web-security",
                        "--disable-features=IsolateOrigins,site-per-process"
                    ],
                    headless=False,
                    ignore_default_args=["--enable-automation"]
                )
                
                # Create a new page in the existing context
                page = browser.new_page()
                
                # Maximize window
                page.set_viewport_size({"width": 1920, "height": 1080})
                page.evaluate("window.moveTo(0, 0); window.resizeTo(screen.width, screen.height);")
                
                # Add initialization scripts to hide automation
                page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });
                
                // Che giấu automation flags
                window.navigator.chrome = {
                    runtime: {}
                };
                
                // Overwrite permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                """)
                
                # If we get here, the profile is working
                logger.info(f"Successfully connected to Chrome with profile: {profile_directory}")
                break
                
            except Exception as e:
                logger.error(f"Error connecting to Chrome with profile {profile_directory}: {str(e)}")
                
                # Close this browser instance if it was created
                if browser:
                    try:
                        browser.close()
                    except:
                        pass
                
                browser = None
                page = None
        
        # If all profiles failed, try launching without a profile
        if not browser:
            logger.warning("All profiles failed. Launching new browser instance without profile...")
            try:
                browser = p.chromium.launch_persistent_context(
                    user_data_dir=chrome_user_data_dir,
                    channel="chrome",
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-web-security",
                        "--disable-features=IsolateOrigins,site-per-process"
                    ],
                    headless=False,
                    ignore_default_args=["--enable-automation"]
                )
                
                page = browser.new_page()
                
                # Maximize window
                page.set_viewport_size({"width": 1920, "height": 1080})
                page.evaluate("window.moveTo(0, 0); window.resizeTo(screen.width, screen.height);")
                
                # Add initialization scripts to hide automation
                page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });
                
                // Che giấu automation flags
                window.navigator.chrome = {
                    runtime: {}
                };
                
                // Overwrite permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                """)
                
            except Exception as e:
                logger.error(f"Failed to launch browser without profile: {str(e)}")
                return
        
        if not page:
            logger.error("Failed to connect to browser with any configuration")
            return
        
        try:
            # Navigate directly to Kling AI
            logger.info("Navigating to Kling AI website")
            page.goto("https://app.klingai.com/global/image-to-video/frame-mode/new")
            
            # Wait for the page to load completely and check for upload button
            logger.info("Waiting for upload button to appear...")
            upload_button = page.wait_for_selector('input[type="file"]', timeout=30000)
            if not upload_button:
                logger.error("Upload button not found after page load")
                return
            logger.info("Upload button found, page loaded successfully")
            
            # Wait a bit more to ensure all elements are loaded
            time.sleep(5)
            
            # Setup storage to hold queue
            total_images = len(import_data)
            
            # Process the first item immediately
            first_item = import_data[0]
            queue = import_data[1:] if len(import_data) > 1 else []
            
            logger.info(f"Processing first item (total: {total_images})")
            
            # Handle the first upload
            handle_single_upload(page, first_item, queue, total_images)
            
            # Wait for the import process to complete
            logger.info("Waiting for import process to complete (this may take several minutes)...")
            
            # Wait up to 30 minutes for the process to complete
            max_wait_time = 30 * 60  # 30 minutes in seconds
            start_time = time.time()
            
            while time.time() - start_time < max_wait_time:
                time.sleep(10)  # Check every 10 seconds
                
                # Check if the process seems complete (Assets button might be available)
                assets_button = page.query_selector('button:has-text("Assets")')
                if assets_button:
                    logger.info("Assets button found - process might be complete")
                    break
                
                # Check if any progress boxes are still present
                progress_boxes = page.query_selector_all(".progress-box")
                if not progress_boxes and time.time() - start_time > 60:  # Wait at least 1 minute
                    logger.info("No progress boxes found - process might be complete")
                    break
            
            # Additional wait to ensure everything is processed
            logger.info("Processing complete - waiting for final steps...")
            time.sleep(10)
            
            # Click Assets button if available
            assets_button = page.query_selector('button:has-text("Assets")')
            if assets_button:
                logger.info("Clicking Assets button")
                assets_button.click()
                time.sleep(5)  # Wait longer for the assets page to load
                
                # Click the header button
                header_button = page.query_selector('.header-bar button')
                if header_button:
                    logger.info("Clicking header button")
                    header_button.click()
                    time.sleep(3)
                    
                    # Click each item in sequence
                    logger.info(f"Clicking {total_images} items sequentially")
                    for i in range(1, total_images + 1):
                        item_selector = f'.container > div > div:nth-child({i}) > div'
                        item = page.query_selector(item_selector)
                        if item:
                            logger.info(f"Clicking item {i}")
                            item.click()
                            time.sleep(1)  # Wait longer between clicks
                    
                    # Click the download dropdown
                    download_dropdown = page.query_selector('.header-bar .el-dropdown')
                    if download_dropdown:
                        logger.info("Clicking download dropdown")
                        download_dropdown.click()
                        time.sleep(2)
                        
                        # Click the "Download without Watermark" option
                        download_option = page.query_selector('.el-dropdown-menu__item:has-text("Download without Watermark")')
                        if download_option:
                            logger.info("Clicking 'Download without Watermark' option")
                            download_option.click()
                            
                            # Wait for download to start
                            logger.info("Waiting for download to complete...")
                            time.sleep(10)
                            
                            logger.info("Kling AI automation completed successfully!")
                        else:
                            logger.error("Could not find 'Download without Watermark' option")
                    else:
                        logger.error("Could not find download dropdown")
                else:
                    logger.error("Could not find header button")
            else:
                logger.error("Could not find Assets button")
            
            # Keep the browser open for a while to let downloads complete
            logger.info("Keeping browser open for 20 seconds to complete downloads...")
            time.sleep(20)
            
        except Exception as e:
            logger.error(f"Error during automation: {str(e)}")
        finally:
            # Keep browser open for user interaction
            logger.info("Browser will remain open for user interaction")
            try:
                # Keep the script running indefinitely
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info("Script terminated by user")
                pass


def handle_single_upload(page, item, queue, total_images):
    """Handle a single image upload to Kling AI."""
    try:
        # Convert base64 image to a file
        image_data = item['image']
        description = item['description']
        negative_prompt = item['negativePrompt']
        
        # Log what we're uploading (truncate for readability)
        logger.info(f"Uploading image with description: {description[:50]}..." +
                   (f" and negative prompt: {negative_prompt[:50]}..." if negative_prompt else ""))
        
        # Find the image upload input in the new interface
        upload_input = page.query_selector('.el-upload__input[type="file"]')
        if not upload_input:
            logger.error("Could not find upload input")
            return False
        
        # Determine file type from the data URL
        file_type = "jpeg"
        if "image/png" in image_data:
            file_type = "png"
        
        # Remove the data URL prefix to get the base64 content
        base64_content = image_data.split(',')[1]
        
        # Create a temporary file to upload
        temp_dir = tempfile.gettempdir()
        temp_file = os.path.join(temp_dir, f"temp_upload.{file_type}")
        
        with open(temp_file, 'wb') as f:
            f.write(base64.b64decode(base64_content))
        
        # Upload the file
        logger.info("Uploading image file")
        upload_input.set_input_files(temp_file)
        
        # Wait for the image to be processed
        time.sleep(4)
        
        # Fill in the description
        logger.info("Filling description")
        prompt_input = page.query_selector('.prompt-input[contenteditable="true"]')
        if prompt_input:
            # Clear existing text and type new text
            prompt_input.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Delete")
            prompt_input.type(description)
            time.sleep(1)
        else:
            # Try alternative selector
            prompt_input = page.query_selector('.prompt-input')
            if prompt_input:
                prompt_input.click()
                page.keyboard.press("Control+A")
                page.keyboard.press("Delete")
                prompt_input.type(description)
                time.sleep(1)
            else:
                logger.error("Could not find prompt input field")
                return False
        
        # Handle negative prompt if provided
        if negative_prompt:
            logger.info("Filling negative prompt")
            
            # Click the negative prompt button
            neg_prompt_button = page.query_selector('#main-container > div > div:nth-child(1) > div.designer-container.theme-video > div.designer-component.property-panel > div.property-content > div.panel-box > div > div:nth-child(5) > div > div > a')
            if neg_prompt_button:
                neg_prompt_button.click()
                time.sleep(1)
                
                # Fill the negative prompt field
                neg_prompt_input = page.query_selector('#main-container > div > div:nth-child(1) > div.designer-container.theme-video > div.designer-component.property-panel > div.property-content > div.panel-box > div > div:nth-child(5) > div.content > div > div.prompt-wrap > div > div.prompt-input')
                if neg_prompt_input:
                    neg_prompt_input.click()
                    page.keyboard.press("Control+A")
                    page.keyboard.press("Delete")
                    neg_prompt_input.type(negative_prompt)
                    time.sleep(1)
                else:
                    logger.error("Could not find negative prompt input field")
                    return False
            else:
                logger.error("Could not find negative prompt button")
                return False
        
        # Click Generate button
        logger.info("Clicking Generate button")
        generate_button = page.query_selector('button.generic-button.green.big[data-v-10b25476][data-v-502bcbfb]')
        if generate_button:
            generate_button.click()
            time.sleep(2)
        else:
            # Try alternative selectors
            generate_button = page.query_selector('.generic-button.green.big')
            if generate_button:
                generate_button.click()
                time.sleep(2)
            else:
                logger.error("Could not find Generate button")
                return False
        
        # Set up storage for next items
        if queue:
            logger.info(f"Setting up queue with {len(queue)} remaining items")
            
            # Inject JavaScript to set the queue in local storage
            page.evaluate(f"""
            (() => {{
                // Simulate chrome.storage for Playwright
                if (!window.chrome) {{
                    window.chrome = {{}};
                }}
                if (!window.chrome.storage) {{
                    window.chrome.storage = {{}};
                }}
                if (!window.chrome.storage.local) {{
                    window.chrome.storage.local = {{
                        get: () => {{}},
                        set: (data) => {{
                            console.log('Setting storage data:', data);
                            window.klingImportQueue = data.klingImportQueue || [];
                            window.totalImagesToProcess = data.totalImagesToProcess || 0;
                        }}
                    }};
                }}
                
                // Now set the data
                chrome.storage.local.set({{
                    klingImportQueue: {str(queue).replace("'", '"')},
                    totalImagesToProcess: {total_images}
                }});
            }})();
            """)
        
        return True
    
    except Exception as e:
        logger.error(f"Error during upload: {str(e)}")
        return False


def click_assets_button(page):
    """Click the Assets button using the same selectors as kling-content.js."""
    logger.info("Attempting to click Assets button")
    
    # Try multiple approaches to find the Assets button
    assets_button = page.query_selector('button.generic-button.secondary.medium[data-v-10b25476][data-v-b4600797]')
    if not assets_button:
        # Try by innerText
        assets_button = page.query_selector('button:has-text("Assets")')
    if not assets_button:
        # Try by SVG icon and inner span
        assets_button = page.query_selector('button:has(svg use[xlink\\:href="#icon-folder"]) span:text("Assets")')
    
    if assets_button:
        logger.info("Found Assets button, clicking it")
        assets_button.click()
        time.sleep(2)
        
        # Click the header button
        header_button = page.query_selector('#main-material-container > div.header-bar > div:nth-child(2) > button:nth-child(1)')
        if header_button:
            logger.info("Clicking header button")
            header_button.click()
            time.sleep(2)
            return True
    else:
        logger.error("Could not find Assets button")
        return False


def click_items_and_download(page, total_images):
    """Click items and download using the same selectors as kling-content.js."""
    logger.info(f"Clicking {total_images} items sequentially")
    
    for i in range(1, total_images + 1):
        item_selector = f'#main-material-container > div.container > div > div:nth-child({i}) > div'
        item = page.query_selector(item_selector)
        if item:
            logger.info(f"Clicking item {i}")
            item.click()
            time.sleep(0.5)
    
    # Click the download dropdown
    download_dropdown = page.query_selector('#main-material-container > div.header-bar > div:nth-child(2) > div.el-dropdown')
    if download_dropdown:
        logger.info("Clicking download dropdown")
        download_dropdown.click()
        time.sleep(1)
        
        # Click the "Download without Watermark" option
        download_option = page.query_selector('li.el-dropdown-menu__item:has-text("Download without Watermark")')
        if download_option:
            logger.info("Clicking 'Download without Watermark' option")
            download_option.click()
            return True
    return False


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description='Automate Kling AI import process')
    parser.add_argument('zip_file', type=str, help='Path to the ZIP file containing images and prompts')
    args = parser.parse_args()
    
    # Validate the ZIP file path
    if not os.path.exists(args.zip_file):
        logger.error(f"ZIP file not found: {args.zip_file}")
        sys.exit(1)
    
    try:
        # Extract the ZIP file
        extract_dir = extract_zip(args.zip_file)
        
        # Read the prompts from the text file
        prompts = read_prompts(extract_dir)
        if not prompts:
            logger.error("No prompts found in the ZIP file")
            sys.exit(1)
        
        # Get all image files
        images = get_images(extract_dir)
        if not images:
            logger.error("No image files found in the ZIP file")
            sys.exit(1)
        
        # Prepare the import data
        import_data = prepare_import_data(images, prompts)
        if not import_data:
            logger.error("Failed to prepare import data")
            sys.exit(1)
        
        # Start the Kling AI import automation
        automate_kling_import(import_data)
        
        # Clean up the temporary directory
        logger.info(f"Cleaning up temporary directory: {extract_dir}")
        shutil.rmtree(extract_dir, ignore_errors=True)
        
        logger.info("Kling AI import process completed successfully")
        
    except Exception as e:
        logger.error(f"Error in main process: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main() 