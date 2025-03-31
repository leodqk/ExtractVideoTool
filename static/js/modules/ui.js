// modules/ui.js - Quản lý UI, hiệu ứng, toast

import { debugLog } from "../utils/debug.js";

// Các biến DOM elements chính
let uploadTabs, uploadContents, methodOptions, method2Settings, method3Settings;
let thresholdSlider,
  thresholdValue,
  differenceThresholdSlider,
  differenceThresholdValue;
let transitionThresholdSlider,
  transitionThresholdValue,
  scriptTemperatureSlider,
  temperatureValue;
let togglePasswordBtns;

let activeUploadMethod = "file-upload";

export function initUI() {
  // Khởi tạo các DOM elements
  uploadTabs = document.querySelectorAll(".upload-tab");
  uploadContents = document.querySelectorAll(".upload-content");
  methodOptions = document.querySelectorAll(".method-option");
  method2Settings = document.querySelectorAll(".method2-setting");
  method3Settings = document.querySelectorAll(".method3-setting");

  thresholdSlider = document.getElementById("threshold");
  thresholdValue = document.getElementById("threshold-value");
  differenceThresholdSlider = document.getElementById("difference-threshold");
  differenceThresholdValue = document.getElementById(
    "difference-threshold-value"
  );
  transitionThresholdSlider = document.getElementById("transition-threshold");
  transitionThresholdValue = document.getElementById(
    "transition-threshold-value"
  );
  scriptTemperatureSlider = document.getElementById("script-temperature");
  temperatureValue = document.getElementById("temperature-value");
  togglePasswordBtns = document.querySelectorAll(".toggle-password");

  // Khởi tạo các sự kiện UI
  initTabSwitching();
  initMethodSelection();
  initSliders();
  initPasswordToggle();
  addStyles();
}

function initTabSwitching() {
  uploadTabs.forEach((tab) => {
    tab.addEventListener("click", function () {
      uploadTabs.forEach((t) => t.classList.remove("active"));
      this.classList.add("active");

      const tabId = this.dataset.tab;
      activeUploadMethod = tabId;

      uploadContents.forEach((content) => {
        content.style.display = "none";
      });

      document.getElementById(tabId).style.display = "block";
      updateUIForSelectedTab(tabId);
    });
  });
}

function initMethodSelection() {
  methodOptions.forEach((option) => {
    option.addEventListener("click", function () {
      methodOptions.forEach((opt) => opt.classList.remove("active"));
      this.classList.add("active");
      const selectedMethod = this.dataset.method;

      // Hide all method-specific settings first
      method2Settings.forEach((setting) => {
        setting.style.display = "none";
      });
      method3Settings.forEach((setting) => {
        setting.style.display = "none";
      });

      // Hide Azure settings
      const azureSettings = document.querySelectorAll(".azure-setting");
      azureSettings.forEach((setting) => {
        setting.style.display = "none";
      });

      // Get the basic parameters section
      const basicParamsHeading = Array.from(
        document.querySelectorAll("h4")
      ).find((h4) => h4.textContent.trim() === "Tham số cơ bản");
      const basicParamsSection = basicParamsHeading
        ? basicParamsHeading.closest(".setting-group")
        : null;

      // Show appropriate settings based on selected method
      if (selectedMethod === "method2") {
        method2Settings.forEach((setting) => {
          setting.style.display = "block";
        });
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
      } else if (selectedMethod === "method3") {
        method3Settings.forEach((setting) => {
          setting.style.display = "block";
        });
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
      } else if (selectedMethod === "azure") {
        azureSettings.forEach((setting) => {
          setting.style.display = "block";
        });
        if (basicParamsSection) {
          basicParamsSection.style.display = "none";
        }

        // Load saved Azure credentials if available
        import("../services/azureService.js").then(
          ({ loadAzureCredentials }) => {
            loadAzureCredentials();
          }
        );
      } else {
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
      }
    });
  });
}

function initSliders() {
  // Update threshold value display
  if (thresholdSlider && thresholdValue) {
    thresholdSlider.addEventListener("input", function () {
      thresholdValue.textContent = this.value;
    });
    thresholdValue.textContent = thresholdSlider.value;
  }

  // Update difference threshold value display
  if (differenceThresholdSlider && differenceThresholdValue) {
    differenceThresholdSlider.addEventListener("input", function () {
      differenceThresholdValue.textContent = this.value;
    });
    differenceThresholdValue.textContent = differenceThresholdSlider.value;
  }

  // Update transition threshold value display
  if (transitionThresholdSlider && transitionThresholdValue) {
    transitionThresholdSlider.addEventListener("input", function () {
      transitionThresholdValue.textContent = this.value;
    });
    transitionThresholdValue.textContent = transitionThresholdSlider.value;
  }

  // Update temperature value display
  if (scriptTemperatureSlider && temperatureValue) {
    scriptTemperatureSlider.addEventListener("input", function () {
      temperatureValue.textContent = this.value;
    });
    temperatureValue.textContent = scriptTemperatureSlider.value;
  }
}

function initPasswordToggle() {
  if (togglePasswordBtns) {
    togglePasswordBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        const passwordField = this.previousElementSibling;
        if (passwordField.type === "password") {
          passwordField.type = "text";
          this.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
          passwordField.type = "password";
          this.innerHTML = '<i class="fas fa-eye"></i>';
        }
      });
    });
  }
}

function updateUIForSelectedTab(tabId) {
  // Hiển thị/ẩn các phần UI dựa trên tab
  const videoMethodSelection = document.querySelector(".method-selection");
  const videoSettings = document.getElementById("video-processing-settings");
  const extractBtn = document.getElementById("extract-btn");

  if (tabId === "batch-images-upload") {
    // Nếu là tab xử lý batch ảnh, ẩn các phần liên quan đến video
    if (videoMethodSelection) videoMethodSelection.style.display = "none";
    if (videoSettings) videoSettings.style.display = "none";
    if (extractBtn) extractBtn.style.display = "none";
  } else {
    // Nếu là các tab video, hiển thị các phần liên quan
    if (videoMethodSelection) videoMethodSelection.style.display = "block";
    if (videoSettings) videoSettings.style.display = "block";
    if (extractBtn) extractBtn.style.display = "block";
  }
}

export function showToast(message) {
  // Remove any existing toast
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast";

  // Check if message is an error (starts with "Lỗi")
  if (message.startsWith("Lỗi")) {
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    toast.style.backgroundColor = "rgba(239, 68, 68, 0.9)"; // Error color
  } else {
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
  }

  document.body.appendChild(toast);

  // Show the toast
  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  // Hide and remove the toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

export function showError(message) {
  // Remove any existing error message
  const existingError = document.querySelector(".error-message");
  if (existingError) {
    existingError.remove();
  }

  // Create error message element
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;

  // Add to DOM
  if (activeUploadMethod === "file-upload") {
    const uploadArea = document.getElementById("upload-area");
    if (uploadArea) uploadArea.parentNode.appendChild(errorDiv);
  } else if (activeUploadMethod === "youtube-upload") {
    document.querySelector(".youtube-form").appendChild(errorDiv);
  } else if (activeUploadMethod === "tiktok-upload") {
    document.querySelector(".tiktok-form").appendChild(errorDiv);
  }
}

function addStyles() {
  // Add CSS for the new sections
  const style = document.createElement("style");
  style.textContent = `
    /* CSS styles for image queue, batch processing, etc. */
    .image-batch-section {
      margin-top: 40px;
      border-top: 1px dashed #ccc;
      padding-top: 30px;
    }
    
    .batch-processing-container {
      width: 100%;
    }
    
    .image-batch-container,
    .batch-processing-container {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .batch-upload-area {
      border: 2px dashed #6c7ae0;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      margin-bottom: 20px;
      background-color: #f0f2ff;
      transition: all 0.3s ease;
    }
    
    .batch-upload-area:hover {
      background-color: #e8ecff;
      border-color: #5468e7;
    }
    
    .prompt-section {
      margin-bottom: 20px;
    }
    
    .prompt-section textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ced4da;
      border-radius: 8px;
      font-size: 14px;
      resize: vertical;
    }
    
    .prompt-tips {
      background-color: #e8f4ff;
      padding: 10px 15px;
      border-radius: 8px;
      margin-top: 10px;
      font-size: 13px;
    }
    
    .prompt-tips ul {
      margin: 5px 0 0 20px;
      padding: 0;
    }
    
    .prompt-tips li {
      margin-bottom: 5px;
    }
    
    .autosave-note {
      margin-top: 10px;
      padding: 5px 10px;
      background-color: #f2fff2;
      border-left: 3px solid #28a745;
      color: #155724;
      font-size: 13px;
      border-radius: 3px;
    }
    
    .autosave-note i {
      margin-right: 5px;
    }
    
    .batch-actions {
      text-align: center;
      margin-top: 20px;
    }
    
    .batch-progress-container {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    
    .batch-results-container {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
    }
    
    .batch-results-section {
      margin-top: 40px;
    }
    
    .batch-results-summary {
      display: flex;
      justify-content: space-around;
      margin: 20px 0;
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
    }
    
    .summary-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .batch-results-actions {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .batch-results-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    
    .result-item {
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .result-image {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    
    .result-content {
      padding: 15px;
    }
    
    .result-text {
      max-height: 200px;
      overflow-y: auto;
      margin-top: 10px;
      padding: 10px;
      background-color: #f8f9fa;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    
    .selected-files-info {
      margin-top: 15px;
      padding: 8px 15px;
      background-color: #e9ecef;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .error-message {
      color: #dc3545;
      margin-top: 5px;
      font-size: 13px;
    }
    
    @media (max-width: 768px) {
      .batch-results-summary {
        flex-direction: column;
        gap: 10px;
      }
      
      .batch-results-actions {
        flex-direction: column;
      }
    }

    /* Add fixed queue button styles */
    #view-image-queue {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1000;
      background-color: #4361ee;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
    }

    #view-image-queue:hover {
      background-color: #5468e7;
      transform: translateY(-50%) scale(1.05);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    #view-image-queue i {
      font-size: 18px;
    }

    #view-image-queue .queue-count {
      background-color: #ff4757;
      color: white;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: bold;
      min-width: 20px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

export function getActiveUploadMethod() {
  return activeUploadMethod;
}
