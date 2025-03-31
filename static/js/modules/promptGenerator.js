// modules/promptGenerator.js - Tạo prompt từ khung hình

import { showToast } from "./ui.js";
import { normalizeImagePath, formatPromptText } from "../utils/pathUtils.js";
import { generateGeminiPrompt } from "../services/geminiService.js";
import {
  generateLeonardoImage,
  getLeonardoImage,
} from "../services/leonardoService.js";

// Generate prompt from a keyframe
export function generatePrompt(framePath) {
  // Create and show loading modal
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
  <div class="modal-header">
    <h3><i class="fas fa-magic"></i> Generating Prompt with Gemini AI</h3>
    <button class="close-btn"><i class="fas fa-times"></i></button>
  </div>
  <div class="modal-body">
    <div class="image-preview">
      <img src="${normalizeImagePath(framePath)}" alt="Selected image">
    </div>
    <div class="prompt-loading">
      <p><i class="fas fa-spinner fa-spin"></i> Đang tạo prompt từ hình ảnh với Gemini AI...</p>
      <div class="loading-spinner">
        <img src="/static/img/loading.gif" alt="Loading" width="50">
      </div>
    </div>
  </div>
`;

  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  // Close button event
  modal.querySelector(".close-btn").addEventListener("click", function () {
    document.body.removeChild(modalOverlay);
  });

  // Call API to generate prompt with Gemini
  generateGeminiPrompt(framePath)
    .then((data) => {
      // Update modal with generated prompt
      const promptLoadingDiv = modal.querySelector(".prompt-loading");

      if (data.success) {
        promptLoadingDiv.innerHTML = `
        <div class="generated-prompt">
          <h4>Generated Prompt with Gemini AI:</h4>
          <div class="prompt-content">${formatPromptText(data.prompt)}</div>
          <div class="prompt-actions">
            <button class="copy-prompt-btn">
              <i class="fas fa-copy"></i> Copy to Clipboard
            </button>
            <button class="create-leonardo-image-btn">
              <i class="fas fa-image"></i> Tạo ảnh mới
            </button>
          </div>
        </div>
      `;

        // Add copy button functionality
        modal
          .querySelector(".copy-prompt-btn")
          .addEventListener("click", function () {
            const promptText = data.prompt;
            navigator.clipboard
              .writeText(promptText)
              .then(() => {
                showToast("Prompt copied to clipboard!");
              })
              .catch((err) => {
                console.error("Could not copy text: ", err);
                showToast("Failed to copy prompt");
              });
          });

        // Add create image button functionality
        modal
          .querySelector(".create-leonardo-image-btn")
          .addEventListener("click", function () {
            const promptText = data.prompt;
            createLeonardoImage(promptText);
          });
      } else {
        promptLoadingDiv.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i> <strong>Error:</strong> ${
            data.error || "Unknown error occurred"
          }
        </div>
      `;
      }
    })
    .catch((error) => {
      console.error("Error:", error);

      const promptLoadingDiv = modal.querySelector(".prompt-loading");
      promptLoadingDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i> <strong>Error:</strong> ${error.message}
      </div>
    `;
    });
}

// Function to create an image using Leonardo.ai
export function createLeonardoImage(prompt) {
  showToast("Đang gửi yêu cầu tạo ảnh với Leonardo.ai...");

  // Show loading state
  const createBtn = document.querySelector(".create-leonardo-image-btn");
  const originalBtnText = createBtn.innerHTML;
  createBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý...`;
  createBtn.disabled = true;

  // Call the Leonardo.ai API endpoint
  generateLeonardoImage(prompt)
    .then((data) => {
      if (data.success) {
        // Show initial success message
        showToast(`Yêu cầu tạo ảnh đã được gửi! Đang tiến hành tạo ảnh...`);

        // Start polling for generation status
        const generationId = data.generation_id;
        let pollingCount = 0;

        // Create a modal to show progress and the image when ready
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
          <div class="modal leonardo-modal">
            <div class="modal-header">
              <h3><i class="fas fa-image"></i> Đang tạo ảnh với Leonardo.ai</h3>
              <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
              <div class="leonardo-loading">
                <p><i class="fas fa-spinner fa-spin"></i> Đang xử lý yêu cầu...</p>
                <div class="generation-progress">
                  <p>Leonardo.ai đang tạo hình ảnh của bạn. Quá trình này có thể mất từ 30 giây đến 1 phút.</p>
                  <p>ID tạo ảnh: <strong>${generationId}</strong></p>
                </div>
              </div>
              <div class="leonardo-result" style="display:none;">
                <div class="leonardo-image-container">
                  <!-- Image will be inserted here -->
                </div>
                <div class="leonardo-image-info">
                  <h4>Prompt:</h4>
                  <div class="leonardo-prompt"></div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="download-leonardo-btn" style="display:none;">
                <i class="fas fa-download"></i> Tải xuống
              </button>
              <button class="add-queue-leonardo-btn" style="display:none;">
                <i class="fas fa-layer-group"></i> Lưu vào hàng đợi
              </button>
              <button class="save-leonardo-folder-btn" style="display:none;">
                <i class="fas fa-folder"></i> Lưu vào thư mục
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        // Define polling interval variable in the outer scope
        let pollingInterval;

        // Add close button functionality
        const closeBtn = modal.querySelector(".close-btn");
        closeBtn.addEventListener("click", function () {
          document.body.removeChild(modal);
          // If we're still polling, stop it when the modal is closed
          if (pollingInterval) {
            clearInterval(pollingInterval);
          }
        });

        // Function to check generation status
        const checkGenerationStatus = () => {
          getLeonardoImage(generationId)
            .then((result) => {
              pollingCount++;

              // Update the loading message with status
              const loadingElement = modal.querySelector(".leonardo-loading p");

              if (result.success) {
                if (result.complete) {
                  // Generation is complete, display the image
                  clearInterval(pollingInterval);

                  // Hide loading message and show result
                  modal.querySelector(".leonardo-loading").style.display =
                    "none";
                  modal.querySelector(".leonardo-result").style.display =
                    "block";

                  // Display the image
                  const imageContainer = modal.querySelector(
                    ".leonardo-image-container"
                  );
                  const imageInfo = modal.querySelector(".leonardo-image-info");
                  const promptContainer =
                    modal.querySelector(".leonardo-prompt");

                  // Get the first image (we requested only one)
                  const image = result.images[0];

                  // Display the image
                  imageContainer.innerHTML = `
                    <img src="${image.url}" alt="Generated image" class="leonardo-generated-image">
                  `;

                  // Display the prompt
                  promptContainer.textContent = result.prompt;

                  // Show download button
                  const downloadBtn = modal.querySelector(
                    ".download-leonardo-btn"
                  );
                  downloadBtn.style.display = "flex";
                  downloadBtn.addEventListener("click", function () {
                    // Use our download function instead of opening in a new tab
                    import("../services/downloadService.js").then(
                      ({ downloadImage }) => {
                        downloadImage(image.url);
                      }
                    );
                  });

                  // Show add to queue button
                  const addQueueBtn = modal.querySelector(
                    ".add-queue-leonardo-btn"
                  );
                  addQueueBtn.style.display = "flex";
                  addQueueBtn.addEventListener("click", function () {
                    // Add the image to queue
                    import("./imageQueue.js").then(({ addToImageQueue }) => {
                      addToImageQueue({
                        url: image.url,
                        prompt: result.prompt,
                        timestamp: Date.now(),
                      });
                    });
                  });

                  // Show save to folder button
                  const saveFolderBtn = modal.querySelector(
                    ".save-leonardo-folder-btn"
                  );
                  saveFolderBtn.style.display = "flex";
                  saveFolderBtn.addEventListener("click", function () {
                    // Create a zip file with just this one image
                    import("../services/downloadService.js").then(
                      ({ downloadImagesAsZip }) => {
                        downloadImagesAsZip(
                          [image.url],
                          `leonardo-image-${Date.now()}.zip`
                        );
                      }
                    );
                  });

                  // Update the modal title
                  modal.querySelector(
                    ".modal-header h3"
                  ).innerHTML = `<i class="fas fa-image"></i> Ảnh đã được tạo thành công`;

                  // Restore the create button state
                  createBtn.innerHTML = originalBtnText;
                  createBtn.disabled = false;

                  // Show success message
                  showToast("Ảnh đã được tạo thành công!");
                } else {
                  // Still processing, update status
                  loadingElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh (Trạng thái: ${result.status})`;

                  // If we've been polling for too long (more than 2 minutes), stop polling
                  if (pollingCount > 24) {
                    // 24 polls at 5s interval = 2 minutes
                    clearInterval(pollingInterval);
                    loadingElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Quá thời gian chờ. Vui lòng kiểm tra trên trang Leonardo.ai`;

                    // Restore the create button state
                    createBtn.innerHTML = originalBtnText;
                    createBtn.disabled = false;
                  }
                }
              } else {
                // Error occurred while checking status
                clearInterval(pollingInterval);
                loadingElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi: ${
                  result.error || "Không thể kiểm tra trạng thái"
                }`;

                // Restore the create button state
                createBtn.innerHTML = originalBtnText;
                createBtn.disabled = false;
              }
            })
            .catch((error) => {
              console.error("Error checking generation status:", error);
              // Restore the create button state if error
              createBtn.innerHTML = originalBtnText;
              createBtn.disabled = false;
            });
        };

        // Start polling - check every 5 seconds
        pollingInterval = setInterval(checkGenerationStatus, 5000);
        // Also check immediately
        checkGenerationStatus();
      } else {
        // Error occurred during initial request
        showToast(`Lỗi: ${data.error}`);
        // Restore the create button state
        createBtn.innerHTML = originalBtnText;
        createBtn.disabled = false;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      createBtn.innerHTML = originalBtnText;
      createBtn.disabled = false;
      showToast(`Lỗi: ${error.message}`);
    });
}
