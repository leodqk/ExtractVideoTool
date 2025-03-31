// modules/batchProcessing.js - Xử lý batch ảnh

import { showToast } from "./ui.js";
import { processCompressedFile } from "../utils/fileUtils.js";
import {
  downloadBatchResults,
  downloadBatchResultsText,
} from "../services/downloadService.js";
import { processBatchImages } from "../services/geminiService.js";

// Các biến toàn cục
let selectedBatchFiles = [];
let batchSessionId = null;
let batchResults = [];

// DOM elements
let batchBrowseBtn, imageBatchInput, selectedFilesInfo, selectedFilesCount;
let clearSelectionBtn, geminiPromptInput, processImagesBtn;
let batchProgressContainer, batchProgress, batchProgressText;
let batchResultsSection, batchResultsGallery;
let totalProcessedCount, successCount, failedCount;
let downloadAllResultsBtn, importToKlingBtn, processNewBatchBtn;

export function initBatchProcessing() {
  // Khởi tạo các DOM elements
  batchBrowseBtn = document.getElementById("batch-browse-btn");
  imageBatchInput = document.getElementById("image-batch-input");
  selectedFilesInfo = document.getElementById("selected-files-info");
  selectedFilesCount = document.getElementById("selected-files-count");
  clearSelectionBtn = document.getElementById("clear-selection-btn");
  geminiPromptInput = document.getElementById("gemini-prompt");
  processImagesBtn = document.getElementById("process-images-btn");
  batchProgressContainer = document.getElementById("batch-progress-container");
  batchProgress = document.getElementById("batch-progress");
  batchProgressText = document.getElementById("batch-progress-text");
  batchResultsSection = document.getElementById("batch-results-section");
  batchResultsGallery = document.getElementById("batch-results-gallery");
  totalProcessedCount = document.getElementById("total-processed-count");
  successCount = document.getElementById("success-count");
  failedCount = document.getElementById("failed-count");
  downloadAllResultsBtn = document.getElementById("download-all-results-btn");
  importToKlingBtn = document.getElementById("import-to-kling-btn");
  processNewBatchBtn = document.getElementById("process-new-batch-btn");

  // Tải prompt từ localStorage nếu có
  const savedPrompt = localStorage.getItem("geminiPrompt");
  if (savedPrompt && geminiPromptInput) {
    geminiPromptInput.value = savedPrompt;
    // Kích hoạt validate để kích hoạt nút xử lý nếu đã chọn ảnh
    validateBatchForm();

    // Hiển thị thông báo nhỏ khi người dùng chuyển sang tab batch processing
    document.querySelectorAll(".upload-tab").forEach((tab) => {
      if (tab.getAttribute("data-tab") === "batch-images-upload") {
        tab.addEventListener(
          "click",
          function () {
            // Chỉ hiển thị thông báo khi có prompt đã lưu
            if (savedPrompt && savedPrompt.trim().length > 0) {
              setTimeout(() => {
                showToast("Đã tải prompt đã lưu trước đó");
              }, 500);
            }
          },
          { once: true }
        ); // Chỉ kích hoạt một lần
      }
    });
  }

  // Khởi tạo các sự kiện
  if (batchBrowseBtn) {
    batchBrowseBtn.addEventListener("click", function () {
      imageBatchInput.click();
    });
  }

  if (imageBatchInput) {
    imageBatchInput.addEventListener("change", function (e) {
      handleBatchFileSelection(e.target.files);
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", function () {
      clearBatchSelection();
    });
  }

  if (geminiPromptInput) {
    geminiPromptInput.addEventListener("input", function () {
      // Lưu prompt vào localStorage mỗi khi thay đổi
      localStorage.setItem("geminiPrompt", geminiPromptInput.value);
      validateBatchForm();
    });
  }

  if (processImagesBtn) {
    processImagesBtn.addEventListener("click", function () {
      processBatchImagesHandler();
    });
  }

  if (downloadAllResultsBtn) {
    downloadAllResultsBtn.addEventListener("click", function () {
      downloadAllBatchResultsHandler();
    });
  }

  // Handle Import to Kling button
  if (importToKlingBtn) {
    importToKlingBtn.addEventListener("click", function () {
      importToKlingAIHandler();
    });
  }

  // Handle download text only button
  const downloadTextOnlyBtn = document.getElementById("download-text-only-btn");
  if (downloadTextOnlyBtn) {
    downloadTextOnlyBtn.addEventListener("click", function () {
      downloadBatchResultsTextHandler();
    });
  }

  if (processNewBatchBtn) {
    processNewBatchBtn.addEventListener("click", function () {
      resetBatchProcessing();
    });
  }
}

// Handle batch file selection
function handleBatchFileSelection(files) {
  if (!files || files.length === 0) return;

  // Show loading message
  showToast("Đang xử lý các tệp đã chọn...");

  // Array to store all valid image files
  let allValidFiles = [];
  let pendingFiles = Array.from(files).length;

  // Process each file
  Array.from(files).forEach((file) => {
    // Check if file is a compressed archive
    if (file.name.match(/\.(zip|rar|7z)$/i)) {
      processCompressedFile(file)
        .then((extractedImages) => {
          if (extractedImages.length > 0) {
            allValidFiles = allValidFiles.concat(extractedImages);
            showToast(
              `Đã giải nén ${extractedImages.length} ảnh từ ${file.name}`
            );
          } else {
            showToast(`Không tìm thấy ảnh trong ${file.name}`);
          }

          // Check if all files have been processed
          pendingFiles--;
          if (pendingFiles === 0) {
            updateSelectedFiles(allValidFiles);
          }
        })
        .catch((error) => {
          console.error("Error extracting archive:", error);
          showToast(`Lỗi khi giải nén ${file.name}: ${error.message}`);

          pendingFiles--;
          if (pendingFiles === 0) {
            updateSelectedFiles(allValidFiles);
          }
        });
    } else if (file.type.startsWith("image/")) {
      // It's an image file, add directly
      allValidFiles.push(file);

      pendingFiles--;
      if (pendingFiles === 0) {
        updateSelectedFiles(allValidFiles);
      }
    } else {
      // Not a supported file, skip
      pendingFiles--;
      if (pendingFiles === 0) {
        updateSelectedFiles(allValidFiles);
      }
    }
  });
}

// Update selected files in the UI
function updateSelectedFiles(validFiles) {
  if (!validFiles || validFiles.length === 0) {
    showToast("Không có file ảnh hợp lệ nào được chọn");
    return;
  }

  // Update selected files
  selectedBatchFiles = validFiles;

  // Update UI
  selectedFilesCount.textContent = selectedBatchFiles.length;
  selectedFilesInfo.style.display = "flex";

  // Validate form
  validateBatchForm();
}

// Validate batch form
function validateBatchForm() {
  const isValid =
    selectedBatchFiles.length > 0 && geminiPromptInput.value.trim() !== "";
  processImagesBtn.disabled = !isValid;
}

// Clear batch selection
function clearBatchSelection() {
  selectedBatchFiles = [];
  selectedFilesInfo.style.display = "none";
  imageBatchInput.value = "";
  validateBatchForm();
}

// Process batch images handler
function processBatchImagesHandler() {
  if (
    selectedBatchFiles.length === 0 ||
    geminiPromptInput.value.trim() === ""
  ) {
    showToast("Vui lòng chọn ảnh và nhập prompt");
    return;
  }

  // Show progress container
  batchProgressContainer.style.display = "block";

  // Initialize variables
  const prompt = geminiPromptInput.value.trim();
  const totalImages = selectedBatchFiles.length;
  let processedCount = 0;
  const results = [];

  // Tạo sessionId chỉ một lần ở đây và dùng cho tất cả các ảnh
  batchSessionId =
    "batch-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  console.log("Đã tạo batch session ID:", batchSessionId);

  // Update progress text
  batchProgressText.textContent = `Đang xử lý ảnh 1/${totalImages}...`;
  batchProgress.style.width = "0%";

  // Process images one by one with delay
  processNextImage(0);

  // Function to process images sequentially
  function processNextImage(index) {
    if (index >= totalImages) {
      // All images processed
      displayBatchResults(results, batchSessionId);
      return;
    }

    // Update progress
    const progressPercent = (index / totalImages) * 100;
    batchProgress.style.width = progressPercent + "%";
    batchProgressText.textContent = `Đang xử lý ảnh ${
      index + 1
    }/${totalImages}...`;

    // Create form data for current image
    const formData = new FormData();
    formData.append("images", selectedBatchFiles[index]);
    formData.append("prompt", prompt);
    formData.append("session_id", batchSessionId); // Thêm session_id vào mỗi request

    // Send request for current image
    processBatchImages(formData)
      .then((data) => {
        if (data.success) {
          // Store the result
          results.push(...data.results);
          processedCount++;

          // Process next image after delay
          setTimeout(() => {
            processNextImage(index + 1);
          }, 5000); // 5 seconds delay
        } else {
          // Handle error but continue processing
          showToast(`Lỗi xử lý ảnh ${index + 1}: ${data.error}`);
          results.push({
            original_image: URL.createObjectURL(selectedBatchFiles[index]),
            success: false,
            error: data.error,
          });

          // Process next image after delay
          setTimeout(() => {
            processNextImage(index + 1);
          }, 5000); // 5 seconds delay
        }
      })
      .catch((error) => {
        console.error(`Error processing image ${index + 1}:`, error);
        results.push({
          original_image: URL.createObjectURL(selectedBatchFiles[index]),
          success: false,
          error: error.message,
        });

        // Process next image after delay
        setTimeout(() => {
          processNextImage(index + 1);
        }, 5000); // 5 seconds delay
      });
  }
}

// Display batch results
function displayBatchResults(results, sessionId) {
  // Hide progress container
  batchProgressContainer.style.display = "none";

  // Show results container
  const batchResultsContainer = document.getElementById(
    "batch-results-container"
  );
  if (batchResultsContainer) {
    batchResultsContainer.style.display = "block";
  }

  // Update summary
  const totalCount = results.length;
  const successfulResults = results.filter((r) => r.success).length;
  const failedResults = totalCount - successfulResults;

  totalProcessedCount.textContent = totalCount;
  successCount.textContent = successfulResults;
  failedCount.textContent = failedResults;

  // Store session ID for download
  batchSessionId = sessionId;
  batchResults = results;

  // Clear previous results
  batchResultsGallery.innerHTML = "";

  // Add results to gallery
  results.forEach((result, index) => {
    const resultItem = document.createElement("div");
    resultItem.className = "result-item";

    let itemContent = "";

    // Check if original_image is a blob URL or a server path
    const imageSrc = result.original_image.startsWith("blob:")
      ? result.original_image
      : "/" + result.original_image;

    itemContent += `
      <img src="${imageSrc}" alt="Image ${index + 1}" class="result-image">
      <div class="result-content">
        <h4>Kết quả #${index + 1}</h4>
    `;

    if (result.success) {
      itemContent += `
        <div class="result-text">${result.result_text}</div>
      `;
    } else {
      itemContent += `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i> Lỗi: ${
            result.error || "Không thể xử lý ảnh"
          }
        </div>
      `;
    }

    itemContent += `</div>`;
    resultItem.innerHTML = itemContent;
    batchResultsGallery.appendChild(resultItem);
  });

  // Show summary toast
  showToast(
    `Đã xử lý ${totalCount} ảnh: ${successfulResults} thành công, ${failedResults} thất bại`
  );
}

// Download all batch results handler
function downloadAllBatchResultsHandler() {
  downloadBatchResults(batchSessionId);
}

// Import to Kling AI handler
function importToKlingAIHandler() {
  // First download the results, then send to Kling AI automation server
  if (!batchSessionId) {
    showToast("Không có kết quả để nhập vào Kling AI");
    return;
  }

  // Hiển thị thông báo đang xử lý
  showToast("Đang chuẩn bị dữ liệu nhập vào Kling AI...");

  // Call the server endpoint to download and process with Kling AI
  fetch(`/import-to-kling/${batchSessionId}`)
    .then((response) => {
      if (!response.ok) {
        if (response.status === 400) {
          throw new Error("Session ID không hợp lệ");
        } else if (response.status === 404) {
          throw new Error("Không tìm thấy dữ liệu cho session này");
        } else {
          throw new Error(
            `Lỗi server: ${response.status} ${response.statusText}`
          );
        }
      }
      return response.json();
    })
    .then((data) => {
      if (data.success) {
        showToast(
          "Đã gửi dữ liệu đến Kling AI thành công. Tiến trình sẽ chạy trong nền."
        );
      } else {
        showToast(`Lỗi: ${data.error}`);
      }
    })
    .catch((error) => {
      console.error("Lỗi khi nhập vào Kling AI:", error);
      showToast(`Lỗi khi nhập vào Kling AI: ${error.message}`);
    });
}

// Download batch results text handler
function downloadBatchResultsTextHandler() {
  downloadBatchResultsText(batchSessionId);
}

// Reset batch processing
function resetBatchProcessing() {
  clearBatchSelection();
  // Không xóa giá trị prompt để giữ nguyên cho lần sau
  // geminiPromptInput.value = '';
  const batchResultsContainer = document.getElementById(
    "batch-results-container"
  );
  if (batchResultsContainer) {
    batchResultsContainer.style.display = "none";
  }
  validateBatchForm();
  batchSessionId = null;
  batchResults = [];
}
