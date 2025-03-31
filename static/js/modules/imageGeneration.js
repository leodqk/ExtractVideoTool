// modules/imageGeneration.js - Tạo ảnh từ khung hình

import { showToast } from "./ui.js";
import { normalizeImagePath } from "../utils/pathUtils.js";
import {
  downloadImage,
  downloadImagesAsZip,
} from "../services/downloadService.js";
import { addToImageQueue } from "./imageQueue.js";
import { generateImage } from "../services/apiService.js";
import { getCurrentSessionId, getKeyframesData } from "./extraction.js";
import { generateGeminiPrompt } from "../services/geminiService.js";
import {
  generateLeonardoImage,
  getLeonardoImage,
  generateGeminiPromptAndImage,
} from "../services/leonardoService.js";

// Các biến toàn cục
let generatedImagesSection, generatedImagesGallery;

export function initImageGeneration() {
  // Khởi tạo các DOM elements
  generatedImagesSection = document.getElementById("generated-images-section");
  generatedImagesGallery = document.getElementById("generated-images-gallery");
}

// Show image generation modal
export function showImageGenerationModal(framePath) {
  // Create modal
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
  <div class="modal-header">
    <h3><i class="fas fa-palette"></i> Tạo ảnh mới từ khung hình</h3>
    <button class="close-btn"><i class="fas fa-times"></i></button>
  </div>
  <div class="modal-body">
    <div class="image-preview">
      <img src="${normalizeImagePath(framePath)}" alt="Khung hình gốc">
    </div>
    <div class="generation-form">
      <div class="form-group">
        <label for="image-prompt">Mô tả ảnh mới:</label>
        <textarea id="image-prompt" rows="3" placeholder="Mô tả ảnh bạn muốn tạo từ khung hình này...">Tạo một phiên bản nghệ thuật của hình ảnh này</textarea>
      </div>
      <div class="form-group">
        <label for="image-style">Phong cách:</label>
        <select id="image-style">
          <option value="digital art">Digital Art</option>
          <option value="oil painting">Oil Painting</option>
          <option value="watercolor">Watercolor</option>
          <option value="sketch">Sketch</option>
          <option value="anime">Anime</option>
          <option value="photorealistic">Photorealistic</option>
          <option value="3D render">3D Render</option>
        </select>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button id="generate-btn" data-frame-path="${framePath}">
      <i class="fas fa-magic"></i> Tạo ảnh
    </button>
  </div>
  `;

  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  // Close button event
  modal.querySelector(".close-btn").addEventListener("click", function () {
    document.body.removeChild(modalOverlay);
  });

  // Generate button event
  modal.querySelector("#generate-btn").addEventListener("click", function () {
    const prompt = document.getElementById("image-prompt").value.trim();
    const style = document.getElementById("image-style").value;
    const framePath = this.dataset.framePath;

    if (!prompt) {
      showToast("Lỗi: Vui lòng nhập mô tả cho ảnh mới");
      return;
    }

    // Close modal and show loading
    document.body.removeChild(modalOverlay);

    // Show generated images section with loading
    generatedImagesSection.style.display = "block";
    generatedImagesSection.innerHTML = `
    <h3><i class="fas fa-palette"></i> Ảnh được tạo ra</h3>
    <div class="loading-container">
      <p><i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh mới, vui lòng đợi...</p>
      <div class="loading-spinner">
        <img src="/static/img/loading.gif" alt="Loading" width="50">
      </div>
    </div>
  `;

    // Scroll to generated images section
    generatedImagesSection.scrollIntoView({ behavior: "smooth" });

    // Send request to server
    handleGenerateImage(framePath, prompt, style);
  });
}

// Generate image
function handleGenerateImage(framePath, prompt, style) {
  generateImage(framePath, getCurrentSessionId(), prompt, style)
    .then((data) => {
      displayGeneratedImages(data);
    })
    .catch((error) => {
      console.error("Error:", error);
      generatedImagesSection.innerHTML = `
      <h3><i class="fas fa-palette"></i> Ảnh được tạo ra</h3>
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i> <strong>Lỗi khi tạo ảnh mới:</strong> ${error.message}
        <p>Vui lòng thử lại sau.</p>
      </div>
    `;
    });
}

// Function to display generated images
export function displayGeneratedImages(data) {
  generatedImagesSection.innerHTML = `
  <h3><i class="fas fa-palette"></i> Ảnh được tạo ra</h3>
  <div class="generation-info">
    <p><strong>Prompt:</strong> ${data.prompt}</p>
    <p><strong>Phong cách:</strong> ${data.style}</p>
  </div>
  <div class="download-all-container">
    <button id="download-all-generated-btn" class="download-all-btn">
      <i class="fas fa-download"></i> Tải xuống tất cả
    </button>
    <button id="add-all-to-queue-btn" class="add-to-queue-btn">
      <i class="fas fa-layer-group"></i> Thêm tất cả vào hàng đợi
    </button>
  </div>
  <div class="generated-gallery" id="generated-gallery">
    <!-- Generated images will be displayed here -->
  </div>
  `;

  const generatedGallery = document.getElementById("generated-gallery");

  // Store all image paths for downloading all at once
  let allGeneratedImagePaths = [];

  if (data.generated_images && data.generated_images.length > 0) {
    data.generated_images.forEach((image) => {
      const imageElement = document.createElement("div");
      imageElement.className = "generated-image";
      imageElement.dataset.imageId = image.id;

      // Đảm bảo đường dẫn ảnh đúng
      const imagePath = normalizeImagePath(image.path);
      allGeneratedImagePaths.push(imagePath);

      imageElement.innerHTML = `
      <img src="${imagePath}" alt="Ảnh được tạo" loading="lazy">
      <div class="image-actions">
        <button class="download-image-btn" data-path="${imagePath}">
          <i class="fas fa-download"></i> Tải xuống
        </button>
        <button class="add-to-queue-btn" data-path="${imagePath}">
          <i class="fas fa-layer-group"></i> Lưu vào hàng đợi
        </button>
        <button class="delete-image-btn" data-path="${image.path}" data-image-id="${image.id}">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;

      // Add click event to open full image
      imageElement.querySelector("img").addEventListener("click", function () {
        // Instead of opening in a new tab, show in a modal with download options
        const imgSrc = this.src;

        // Create a modal to show the full image with download options
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal">
              <div class="modal-header">
                <h3><i class="fas fa-image"></i> Xem ảnh đầy đủ</h3>
                <button class="close-btn">&times;</button>
              </div>
              <div class="modal-body">
                <div class="full-image-container">
                  <img src="${imgSrc}" alt="Ảnh đầy đủ" class="full-image">
                </div>
              </div>
              <div class="modal-footer">
                <button class="download-image-modal-btn">
                  <i class="fas fa-download"></i> Tải xuống
                </button>
                <button class="add-to-queue-modal-btn">
                  <i class="fas fa-layer-group"></i> Lưu vào hàng đợi
                </button>
                <button class="save-folder-modal-btn">
                  <i class="fas fa-folder"></i> Lưu vào thư mục
                </button>
              </div>
            </div>
          `;

        document.body.appendChild(modal);

        // Add close button functionality
        modal
          .querySelector(".close-btn")
          .addEventListener("click", function () {
            document.body.removeChild(modal);
          });

        // Add download button functionality
        modal
          .querySelector(".download-image-modal-btn")
          .addEventListener("click", function () {
            downloadImage(imgSrc);
          });

        // Add save to folder button functionality
        modal
          .querySelector(".save-folder-modal-btn")
          .addEventListener("click", function () {
            downloadImagesAsZip([imgSrc], `generated-image-${Date.now()}.zip`);
          });

        // Add save to queue button functionality
        modal
          .querySelector(".add-to-queue-modal-btn")
          .addEventListener("click", function () {
            addToImageQueue({
              url: imgSrc,
              prompt: data.prompt,
              timestamp: Date.now(),
            });
          });
      });

      // Add click event for download button
      imageElement
        .querySelector(".download-image-btn")
        .addEventListener("click", function () {
          const path = this.dataset.path;
          downloadImage(path);
        });

      // Add click event for add to queue button
      imageElement
        .querySelector(".add-to-queue-btn")
        .addEventListener("click", function () {
          const path = this.dataset.path;
          // Find the corresponding keyframe if this image was generated from a keyframe
          const correspondingKeyframe = image.keyframe || image.sourceKeyframe;

          addToImageQueue({
            url: path,
            prompt: data.prompt,
            timestamp: Date.now(),
            keyframe: correspondingKeyframe,
          });
        });

      // Add click event for delete button
      imageElement
        .querySelector(".delete-image-btn")
        .addEventListener("click", function () {
          const path = this.dataset.path;
          const imageId = this.dataset.imageId;
          deleteGeneratedImage(path, imageId);
        });

      generatedGallery.appendChild(imageElement);
    });

    // Add click event for download all button
    document
      .getElementById("download-all-generated-btn")
      .addEventListener("click", function () {
        if (allGeneratedImagePaths.length > 0) {
          downloadImagesAsZip(
            allGeneratedImagePaths,
            `generated-images-${Date.now()}.zip`
          );
        } else {
          showToast("Không có ảnh nào để tải xuống");
        }
      });

    // Add click event for add all to queue button
    document
      .getElementById("add-all-to-queue-btn")
      .addEventListener("click", function () {
        if (allGeneratedImagePaths.length > 0) {
          let addedCount = 0;
          const timestamp = Date.now();

          // Duyệt qua mảng theo thứ tự và thêm vào hàng đợi
          allGeneratedImagePaths.forEach((path, index) => {
            addToImageQueue({
              url: path,
              prompt: data.prompt,
              timestamp: timestamp,
              order: index, // Lưu thứ tự ban đầu
            });
            addedCount++;
          });

          if (addedCount > 0) {
            showToast(`Đã thêm ${addedCount} ảnh vào hàng đợi`);
          } else {
            showToast("Tất cả ảnh đã có trong hàng đợi");
          }
        } else {
          showToast("Không có ảnh nào để thêm vào hàng đợi");
        }
      });
  } else {
    generatedGallery.innerHTML =
      '<p class="no-images"><i class="fas fa-exclamation-circle"></i> Không có ảnh nào được tạo ra.</p>';

    // Hide download all button if no images
    document.querySelector(".download-all-container").style.display = "none";
  }
}

// Delete a generated image
function deleteGeneratedImage(imagePath, imageId) {
  if (!confirm("Bạn có chắc chắn muốn xóa ảnh này không?")) {
    return;
  }

  fetch("/delete-keyframe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      frame_path: imagePath,
      session_id: getCurrentSessionId(),
      frame_id: imageId,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        // Xóa ảnh khỏi giao diện
        const imageElement = document.querySelector(
          `.generated-image[data-image-id="${imageId}"]`
        );
        if (imageElement) {
          imageElement.remove();
          showToast("Đã xóa ảnh thành công");
        }
      } else {
        showToast("Lỗi: " + (data.error || "Không thể xóa ảnh"));
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      showToast("Lỗi khi xóa ảnh: " + error.message);
    });
}

// Function to create an image using Leonardo.ai directly from a keyframe
export function directLeonardoImageGeneration(framePath) {
  // Show loading toast
  showToast("Đang tạo ảnh mới, vui lòng đợi...");

  // Create a modal to show progress and the image when ready
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal leonardo-modal">
      <div class="modal-header">
        <h3><i class="fas fa-image"></i> Đang tạo ảnh mới</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="image-preview">
          <img src="${normalizeImagePath(framePath)}" alt="Selected image">
        </div>
        <div class="leonardo-loading">
          <p><i class="fas fa-spinner fa-spin"></i> Đang tạo prompt và phân tích hình ảnh...</p>
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

  // First call API to generate prompt with Gemini
  generateGeminiPrompt(framePath)
    .then((data) => {
      if (!data.success) {
        throw new Error(data.error || "Failed to generate prompt");
      }

      // Update loading message
      const loadingElement = modal.querySelector(".leonardo-loading p");
      loadingElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh với Leonardo.ai...`;

      // Now call the Leonardo API with the generated prompt
      return generateLeonardoImage(data.prompt);
    })
    .then((data) => {
      if (data.success) {
        // Start polling for generation status
        const generationId = data.generation_id;

        let pollingCount = 0;

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
                    // Use our new download function instead of opening in a new tab
                    downloadImage(image.url);
                  });

                  // Show add to queue button
                  const addQueueBtn = modal.querySelector(
                    ".add-queue-leonardo-btn"
                  );
                  addQueueBtn.style.display = "flex";
                  addQueueBtn.addEventListener("click", function () {
                    // Add the image to queue
                    addToImageQueue({
                      url: image.url,
                      prompt: result.prompt,
                      timestamp: Date.now(),
                      keyframe: framePath,
                    });
                  });

                  // Show save to folder button
                  const saveFolderBtn = modal.querySelector(
                    ".save-leonardo-folder-btn"
                  );
                  saveFolderBtn.style.display = "flex";
                  saveFolderBtn.addEventListener("click", function () {
                    // Create a zip file with just this one image
                    downloadImagesAsZip(
                      [image.url],
                      `leonardo-image-${Date.now()}.zip`
                    );
                  });

                  // Update the modal title
                  modal.querySelector(
                    ".modal-header h3"
                  ).innerHTML = `<i class="fas fa-image"></i> Ảnh đã được tạo thành công`;

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
                  }
                }
              } else {
                // Error occurred while checking status
                clearInterval(pollingInterval);
                loadingElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi: ${
                  result.error || "Không thể kiểm tra trạng thái"
                }`;
              }
            })
            .catch((error) => {
              console.error("Error checking generation status:", error);
              const loadingElement = modal.querySelector(".leonardo-loading p");
              loadingElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi: ${error.message}`;
            });
        };

        // Start polling - check every 5 seconds
        pollingInterval = setInterval(checkGenerationStatus, 5000);
        // Also check immediately
        checkGenerationStatus();
      } else {
        // Error occurred during initial request
        throw new Error(data.error || "Failed to start image generation");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      const loadingElement = modal.querySelector(".leonardo-loading p");
      loadingElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Lỗi:</strong> ${error.message}`;
    });
}
