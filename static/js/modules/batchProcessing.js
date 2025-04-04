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
let importToHailouBtn;

// Khởi tạo batchSessionId từ localStorage nếu có
function initBatchSessionFromLocalStorage() {
  const storedBatchSessionId = localStorage.getItem("batchSessionId");
  const storedBatchResults = localStorage.getItem("batchResults");

  if (storedBatchSessionId) {
    batchSessionId = storedBatchSessionId;
    console.log("Đã khôi phục batchSessionId từ localStorage:", batchSessionId);
  }

  if (storedBatchResults) {
    try {
      batchResults = JSON.parse(storedBatchResults);
      console.log(
        "Đã khôi phục batchResults từ localStorage:",
        batchResults.length,
        "kết quả"
      );
    } catch (e) {
      console.error("Lỗi khi parse batchResults từ localStorage:", e);
    }
  }
}

// Lưu thông tin batch vào localStorage
function saveBatchToLocalStorage() {
  if (batchSessionId) {
    localStorage.setItem("batchSessionId", batchSessionId);
    console.log("Đã lưu batchSessionId vào localStorage:", batchSessionId);
  }

  if (batchResults && batchResults.length > 0) {
    localStorage.setItem("batchResults", JSON.stringify(batchResults));
    console.log(
      "Đã lưu batchResults vào localStorage:",
      batchResults.length,
      "kết quả"
    );
  }
}

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
  importToHailouBtn = document.getElementById("import-to-hailou-btn");

  // Khôi phục thông tin batch từ localStorage
  initBatchSessionFromLocalStorage();

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

  // Handle Import to Hailou button
  if (importToHailouBtn) {
    importToHailouBtn.addEventListener("click", function () {
      importToHailouHandler();
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

  // Lưu thông tin batch vào localStorage
  saveBatchToLocalStorage();

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

// Download batch results text handler
function downloadBatchResultsTextHandler() {
  downloadBatchResultsText(batchSessionId);
}

// Import to Kling AI handler
function importToKlingAIHandler() {
  // Kiểm tra xem có dữ liệu batch không
  if (!batchSessionId || batchResults.length === 0) {
    console.warn("Không có dữ liệu batch để gửi đến Kling AI");
    showToast(
      "Không có dữ liệu batch để gửi đến Kling AI. Vui lòng xử lý ảnh trước."
    );
    return;
  }

  // Trước khi gọi API, hiển thị thông tin batch hiện tại trong console của trang web
  logBatchInformation();

  // Show loading message
  showToast("Đang mở Kling AI Frame Mode...");

  // Chuẩn bị dữ liệu để gửi đi
  const batchData = {
    batchSessionId: batchSessionId,
    batchResultsCount: batchResults.length,
  };

  console.log("Gửi thông tin batch đến Kling AI:", batchData);

  // Call the API endpoint to open Chrome with Kling AI
  fetch("/open-kling-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batchData), // Truyền dữ liệu batch vào request
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showToast(data.message || "Đã mở Kling AI Frame Mode thành công");
      } else {
        showToast(`Lỗi khi mở Kling AI: ${data.error || "Không xác định"}`);
      }
    })
    .catch((error) => {
      console.error("Error opening Kling AI:", error);
      showToast(`Lỗi khi mở Kling AI: ${error.message}`);
    });
}

// Import to Hailou handler
function importToHailouHandler() {
  // Kiểm tra xem có dữ liệu batch không
  if (!batchSessionId || batchResults.length === 0) {
    console.warn("Không có dữ liệu batch để gửi đến Hailou");
    showToast(
      "Không có dữ liệu batch để gửi đến Hailou. Vui lòng xử lý ảnh trước."
    );
    return;
  }

  // Trước khi gọi API, hiển thị thông tin batch hiện tại trong console của trang web
  logBatchInformation();

  // Show loading message
  showToast("Đang mở Hailou...");

  // Chuẩn bị dữ liệu để gửi đi
  const batchData = {
    batchSessionId: batchSessionId,
    batchResultsCount: batchResults.length,
  };

  console.log("Gửi thông tin batch đến Hailou:", batchData);

  // Call the API endpoint to open Chrome with Hailou
  fetch("/open-hailou", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batchData),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showToast(data.message || "Đã mở Hailou thành công");
      } else {
        showToast(`Lỗi khi mở Hailou: ${data.error || "Không xác định"}`);
      }
    })
    .catch((error) => {
      console.error("Error opening Hailou:", error);
      showToast(`Lỗi khi mở Hailou: ${error.message}`);
    });
}

// Hiển thị thông tin batch trong console của trang web
function logBatchInformation() {
  if (!batchSessionId || batchResults.length === 0) {
    console.log(
      "%c===== KHÔNG CÓ DỮ LIỆU BATCH HIỆN TẠI =====",
      "color: red; font-weight: bold;"
    );
    return;
  }

  console.log(
    "%c===== THÔNG TIN BATCH IMAGES VÀ PROMPTS =====",
    "color: green; font-weight: bold; font-size: 14px;"
  );
  console.log("Session ID:", batchSessionId);
  console.log("Số lượng ảnh:", batchResults.length);

  // Lấy thông tin về thư mục lưu trữ
  const folderPath = `uploads/generated/${batchSessionId}`;
  console.log("Thư mục batch:", folderPath);

  // Hiển thị thông tin chi tiết về từng ảnh và prompt
  batchResults.forEach((result, index) => {
    // Đường dẫn ảnh từ server
    const imagePath = result.original_image.startsWith("blob:")
      ? `${folderPath}/input_${index}_${
          result.original_filename || `image_${index + 1}.jpeg`
        }`
      : result.original_image;

    // Đường dẫn file prompt
    const promptPath = `${folderPath}/output_${index}_input_${index}_${
      result.original_filename || `image_${index + 1}.jpeg`
    }.txt`;

    console.log(`%c[ẢNH ${index + 1}]`, "color: blue; font-weight: bold;");
    console.log("Đường dẫn ảnh:", imagePath);
    console.log("Đường dẫn prompt:", promptPath);
    console.log(
      "Nội dung prompt:",
      result.result_text || "[Không có nội dung]"
    );
    console.log("-".repeat(40));
  });

  console.log(
    "%c============================================",
    "color: green; font-weight: bold; font-size: 14px;"
  );
}

// Reset batch processing
function resetBatchProcessing() {
  // Clear selected files
  clearBatchSelection();

  // Hide results container
  const batchResultsContainer = document.getElementById(
    "batch-results-container"
  );
  if (batchResultsContainer) {
    batchResultsContainer.style.display = "none";
  }

  // Clear results
  batchResults = [];
  batchSessionId = null;

  // Xóa dữ liệu batch khỏi localStorage
  localStorage.removeItem("batchSessionId");
  localStorage.removeItem("batchResults");
  console.log("Đã xóa thông tin batch khỏi localStorage");

  // Show upload form
  const batchUploadContainer = document.getElementById(
    "batch-upload-container"
  );
  if (batchUploadContainer) {
    batchUploadContainer.style.display = "block";
  }
}
