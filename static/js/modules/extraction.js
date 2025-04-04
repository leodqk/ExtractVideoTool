// modules/extraction.js - Xử lý trích xuất khung hình

import { debugLog } from "../utils/debug.js";
import { showToast, showError, getActiveUploadMethod } from "./ui.js";
import { getSelectedFile } from "./upload.js";
import { callApi } from "../services/apiService.js";
import { displayResults, displayAzureResults } from "./keyframes.js";

// Các biến toàn cục
let extractBtn, uploadContainer, progressContainer, progress, progressText;
let currentSessionId = null;
let keyframesData = [];

export function initExtraction() {
  // Khởi tạo các DOM elements
  extractBtn = document.getElementById("extract-btn");
  uploadContainer = document.getElementById("upload-container");
  progressContainer = document.getElementById("progress-container");
  progress = document.getElementById("progress");
  progressText = document.getElementById("progress-text");

  // Khởi tạo các sự kiện
  if (extractBtn) {
    extractBtn.addEventListener("click", startExtraction);
  }
}

async function startExtraction() {
  // Remove any existing error messages
  const errorMsg = document.querySelector(".error-message");
  if (errorMsg) {
    errorMsg.remove();
  }

  // Get active upload method and selected method
  const activeUploadMethod = getActiveUploadMethod();
  const selectedMethod = getSelectedMethod();

  // Validate inputs based on upload method
  if (!validateInputs(activeUploadMethod, selectedMethod)) {
    return;
  }

  // If using Azure method and save settings is checked, save the settings
  if (
    selectedMethod === "azure" &&
    document.getElementById("azure-save-settings").checked
  ) {
    import("../services/azureService.js").then(({ saveAzureSettings }) => {
      saveAzureSettings();
    });
  }

  // Show progress
  uploadContainer.style.display = "none";
  progressContainer.style.display = "block";

  // Create form data
  const formData = createFormData(activeUploadMethod, selectedMethod);

  // Start progress simulation
  const progressInterval = simulateProgress(activeUploadMethod, selectedMethod);

  // Determine endpoint based on method
  const endpoint = getEndpointForMethod(selectedMethod);

  try {
    // Send to server
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    clearInterval(progressInterval);

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Lỗi xử lý video");
    }

    const data = await response.json();

    // Complete progress
    progress.style.width = "100%";
    progressText.textContent = "Hoàn thành!";

    // Store session ID and keyframes data
    if (data.session_id) {
      currentSessionId = data.session_id;
    }
    if (data.keyframes) {
      keyframesData = data.keyframes;
    }

    // Show results after a short delay
    setTimeout(() => {
      if (selectedMethod === "azure") {
        displayAzureResults(data);
      } else {
        displayResults(data);
      }
    }, 500);
  } catch (error) {
    console.error("Error:", error);
    progressText.textContent = `Lỗi: ${error.message}`;
    progress.style.width = "100%";
    progress.style.backgroundColor = "var(--error-color)";

    // Allow retry after a short delay
    setTimeout(() => {
      uploadContainer.style.display = "flex";
      progressContainer.style.display = "none";
    }, 2000);
  }
}

function getSelectedMethod() {
  const activeMethod = document.querySelector(".method-option.active");
  return activeMethod ? activeMethod.dataset.method : "method1";
}

function validateInputs(activeUploadMethod, selectedMethod) {
  if (activeUploadMethod === "file-upload") {
    if (!getSelectedFile()) {
      showError("Vui lòng chọn file video để trích xuất");
      return false;
    }
  } else if (activeUploadMethod === "youtube-upload") {
    const youtubeUrl = document.getElementById("youtube-url").value.trim();
    if (!youtubeUrl) {
      showError("Vui lòng nhập URL video YouTube");
      return false;
    }
  } else if (activeUploadMethod === "tiktok-upload") {
    const tiktokUrl = document.getElementById("tiktok-url").value.trim();
    if (!tiktokUrl) {
      showError("Vui lòng nhập URL video TikTok");
      return false;
    }
  }

  // Additional validation for Azure method
  if (selectedMethod === "azure") {
    const apiKey = document.getElementById("azure-api-key").value;
    const accountId = document.getElementById("azure-account-id").value;
    const location = document.getElementById("azure-location").value;

    if (!apiKey || !accountId || !location) {
      showError(
        "Vui lòng nhập đầy đủ thông tin API Key, Account ID và Location cho Azure Video Indexer"
      );
      return false;
    }
  }

  return true;
}

function createFormData(activeUploadMethod, selectedMethod) {
  const formData = new FormData();

  if (activeUploadMethod === "file-upload") {
    formData.append("video", getSelectedFile());
  } else if (activeUploadMethod === "youtube-upload") {
    formData.append(
      "video_url",
      document.getElementById("youtube-url").value.trim()
    );
  } else if (activeUploadMethod === "tiktok-upload") {
    formData.append(
      "video_url",
      document.getElementById("tiktok-url").value.trim()
    );
  }

  formData.append("method", selectedMethod);

  // Add method-specific parameters
  if (selectedMethod === "azure") {
    // Add Azure-specific parameters
    formData.append("api_key", document.getElementById("azure-api-key").value);
    formData.append(
      "account_id",
      document.getElementById("azure-account-id").value
    );
    formData.append(
      "location",
      document.getElementById("azure-location").value
    );
    formData.append(
      "language",
      document.getElementById("azure-language").value
    );
    formData.append(
      "force_upload",
      document.getElementById("azure-force-upload").checked
    );
    formData.append(
      "use_existing_analysis",
      document.getElementById("azure-use-existing").checked
    );
    formData.append(
      "extract_audio",
      document.getElementById("extract-audio").checked ? "true" : "false"
    );
    formData.append("save_images", "true");
  } else {
    // Add parameters for other methods
    formData.append("threshold", document.getElementById("threshold").value);
    formData.append("max_frames", document.getElementById("max-frames").value);
    formData.append(
      "extract_audio",
      document.getElementById("extract-audio").checked ? "true" : "false"
    );
    formData.append(
      "detect_duplicates",
      document.getElementById("detect-duplicates").checked ? "true" : "false"
    );

    const differenceThresholdSlider = document.getElementById(
      "difference-threshold"
    );
    if (differenceThresholdSlider) {
      formData.append("difference_threshold", differenceThresholdSlider.value);
    } else {
      formData.append("difference_threshold", "0.32");
    }

    if (selectedMethod === "method2") {
      formData.append(
        "min_scene_length",
        document.getElementById("min-scene-length").value
      );
    } else if (selectedMethod === "method3") {
      formData.append(
        "transition_threshold",
        document.getElementById("transition-threshold").value
      );
    }
  }

  return formData;
}

function getEndpointForMethod(selectedMethod) {
  if (selectedMethod === "azure") {
    return "/process-video-azure";
  } else if (selectedMethod === "method3") {
    return "/extract-keyframes-advanced";
  } else if (selectedMethod === "method1") {
    return "/upload-method1";
  } else if (selectedMethod === "method2") {
    return "/upload-method2";
  } else {
    // Fallback to the original upload endpoint for compatibility
    return "/upload";
  }
}

function simulateProgress(activeUploadMethod, selectedMethod) {
  let progressValue = 0;
  return setInterval(() => {
    if (progressValue < 90) {
      progressValue +=
        Math.random() * (activeUploadMethod !== "file-upload" ? 1 : 4);
      progress.style.width = `${progressValue}%`;

      if (selectedMethod === "azure") {
        // Custom progress messages for Azure
        if (progressValue < 20) {
          progressText.textContent = `Đang ${
            activeUploadMethod !== "file-upload" ? "tải video và " : ""
          }tải lên Azure... ${Math.round(progressValue)}%`;
        } else if (progressValue < 40) {
          progressText.textContent = `Azure đang phân tích video... ${Math.round(
            progressValue
          )}%`;
        } else if (progressValue < 60) {
          progressText.textContent = `Đang phát hiện cảnh... ${Math.round(
            progressValue
          )}%`;
        } else if (progressValue < 80) {
          progressText.textContent = `Đang trích xuất văn bản... ${Math.round(
            progressValue
          )}%`;
        } else {
          progressText.textContent = `Đang hoàn thiện kết quả... ${Math.round(
            progressValue
          )}%`;
        }
      } else {
        // Original progress messages for other methods
        progressText.textContent = `Đang ${
          activeUploadMethod !== "file-upload" ? "tải video và " : ""
        }xử lý... ${Math.round(progressValue)}%`;
      }
    }
  }, 500);
}

export function getCurrentSessionId() {
  return currentSessionId;
}

export function getKeyframesData() {
  return keyframesData;
}

export function setKeyframesData(data) {
  keyframesData = data;
}
