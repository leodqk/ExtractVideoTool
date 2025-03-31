// modules/upload.js - Xử lý tải lên file

import { debugLog } from "../utils/debug.js";
import { showToast, showError } from "./ui.js";
import { formatFileSize } from "../utils/fileUtils.js";

// Các biến toàn cục
let uploadArea, fileInput, selectedFile;

export function initUpload() {
  // Khởi tạo các DOM elements
  uploadArea = document.getElementById("upload-area");
  fileInput = document.getElementById("file-input");

  // Khởi tạo các sự kiện
  if (uploadArea) {
    uploadArea.addEventListener("click", function () {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  // Khởi tạo drag and drop
  initDragAndDrop();
}

function initDragAndDrop() {
  if (!uploadArea) return;

  uploadArea.addEventListener("dragover", function (e) {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", function () {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadArea.classList.remove("dragover");

    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });
}

function handleFileSelection(file) {
  // Check if file is a video
  const validTypes = [
    "video/mp4",
    "video/avi",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
  ];

  if (!validTypes.includes(file.type)) {
    showToast(
      "Lỗi: Vui lòng chọn file video hợp lệ (mp4, avi, mov, mkv, webm)"
    );
    return;
  }

  selectedFile = file;

  // Update UI
  const fileName =
    file.name.length > 30 ? file.name.substring(0, 30) + "..." : file.name;
  const fileSize = formatFileSize(file.size);

  uploadArea.innerHTML = `
    <div class="selected-file">
      <i class="fas fa-file-video"></i>
      <p>${fileName}</p>
      <span class="file-size">${fileSize}</span>
    </div>
  `;
}

export function getSelectedFile() {
  return selectedFile;
}

export function resetUpload() {
  selectedFile = null;
  if (uploadArea) {
    uploadArea.innerHTML = `
      <div class="upload-icon">
        <i class="fas fa-cloud-upload-alt fa-3x"></i>
      </div>
      <p>
        Kéo thả video vào đây hoặc
        <span class="browse-text">chọn file</span>
      </p>
      <p class="supported-formats">Hỗ trợ: MP4, AVI, MOV, MKV, WEBM</p>
    `;
  }
  if (fileInput) {
    fileInput.value = "";
  }
}
