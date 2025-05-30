document.addEventListener("DOMContentLoaded", function () {
  // Debug mode
  const DEBUG = true;

  // Enhanced console log for debugging
  function debugLog(...args) {
    if (DEBUG) {
      console.log("[DEBUG]", ...args);
    }
  }

  // Elements
  const uploadArea = document.getElementById("upload-area");
  const fileInput = document.getElementById("file-input");
  const extractBtn = document.getElementById("extract-btn");
  const uploadContainer = document.getElementById("upload-container");
  const progressContainer = document.getElementById("progress-container");
  const progress = document.getElementById("progress");
  const progressText = document.getElementById("progress-text");
  const resultsSection = document.getElementById("results-section");
  const keyframesGallery = document.getElementById("keyframes-gallery");
  const videoInfo = document.getElementById("video-info");
  const methodInfo = document.getElementById("method-info");
  const scenesInfo = document.getElementById("scenes-info");
  const downloadAllBtn = document.getElementById("download-all-btn");
  const extractScriptBtn = document.getElementById("extract-script-btn");
  const newVideoBtn = document.getElementById("new-video-btn");
  const checkPathsBtn = document.getElementById("check-paths-btn");
  const thresholdSlider = document.getElementById("threshold");
  const thresholdValue = document.getElementById("threshold-value");
  const maxFramesInput = document.getElementById("max-frames");
  const minSceneLengthInput = document.getElementById("min-scene-length");
  const methodOptions = document.querySelectorAll(".method-option");
  const method2Settings = document.querySelectorAll(".method2-setting");
  const method3Settings = document.querySelectorAll(".method3-setting");
  const uploadTabs = document.querySelectorAll(".upload-tab");
  const uploadContents = document.querySelectorAll(".upload-content");
  const youtubeUrlInput = document.getElementById("youtube-url");
  const tiktokUrlInput = document.getElementById("tiktok-url");
  const extractAudioCheckbox = document.getElementById("extract-audio");
  const detectDuplicatesCheckbox = document.getElementById("detect-duplicates");
  const differenceThresholdSlider = document.getElementById(
    "difference-threshold"
  );
  const differenceThresholdValue = document.getElementById(
    "difference-threshold-value"
  );
  const transitionThresholdSlider = document.getElementById(
    "transition-threshold"
  );
  const transitionThresholdValue = document.getElementById(
    "transition-threshold-value"
  );
  const applyThresholdBtn = document.getElementById("apply-threshold-btn");
  const scriptSection = document.getElementById("script-section");
  const scriptLoading = document.getElementById("script-loading");
  const scriptContent = document.getElementById("script-content");
  const scriptTemperatureSlider = document.getElementById("script-temperature");
  const temperatureValue = document.getElementById("temperature-value");
  const generatedImagesSection = document.getElementById(
    "generated-images-section"
  );
  const generatedImagesGallery = document.getElementById(
    "generated-images-gallery"
  );
  const transcriptSection = document.getElementById("transcript-section");
  const transcriptContent = document.getElementById("transcript-content");
  const similarityNotification = document.getElementById(
    "similarity-notification"
  );
  const similarCount = document.getElementById("similar-count");
  const removeSimilarBtn = document.getElementById("remove-similar-btn");
  const duplicateNotification = document.getElementById(
    "duplicate-notification"
  );
  const duplicateCount = document.getElementById("duplicate-count");
  const removeDuplicatesBtn = document.getElementById("remove-duplicates-btn");
  const togglePasswordBtns = document.querySelectorAll(".toggle-password");

  let selectedFile = null;
  let currentSessionId = null;
  let selectedMethod = "method1";
  let activeUploadMethod = "file-upload";
  let keyframesData = []; // Lưu trữ dữ liệu khung hình
  let differenceThreshold = 0.32; // Ngưỡng độ khác biệt mặc định

  // Khai báo biến toàn cục để lưu trữ hàng đợi hình ảnh
  let imageQueue = [];

  // Hàm để thêm ảnh vào hàng đợi
  function addToImageQueue(imageData) {
    // Kiểm tra xem ảnh đã tồn tại trong hàng đợi chưa
    const exists = imageQueue.some((img) => img.url === imageData.url);
    if (!exists) {
      // Thêm thuộc tính order dựa trên vị trí hiện tại trong hàng đợi
      imageData.order = imageQueue.length;
      imageQueue.push(imageData);
      showToast(`Đã thêm ảnh vào hàng đợi (${imageQueue.length} ảnh)`);
      updateQueueButton();
    } else {
      showToast("Ảnh này đã có trong hàng đợi");
    }
  }

  // Hàm để cập nhật nút hiển thị hàng đợi
  function updateQueueButton() {
    const queueBtn = document.getElementById("view-image-queue");
    if (queueBtn) {
      if (imageQueue.length > 0) {
        queueBtn.textContent = `Xem hàng đợi (${imageQueue.length})`;
        queueBtn.style.display = "flex";
      } else {
        queueBtn.style.display = "none";
      }
    }
  }

  // Hàm để hiển thị modal hàng đợi
  function showImageQueueModal(isAutoProcess = false) {
    // Tạo modal
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    // Tạo nội dung modal
    const modal = document.createElement("div");
    modal.className = "modal image-queue-modal";

    let modalContent = `
      <div class="modal-header">
        <h3><i class="fas fa-images"></i> Hàng đợi ảnh (${imageQueue.length} ảnh)</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
    `;

    if (imageQueue.length === 0) {
      modalContent += `
        <div class="empty-queue">
          <p><i class="fas fa-info-circle"></i> Hàng đợi trống</p>
          <p>Bạn chưa thêm ảnh nào vào hàng đợi</p>
        </div>
      `;
    } else {
      modalContent += `
        <div class="queue-actions">
          <button id="download-all-queue-btn" class="download-all-btn">
            <i class="fas fa-download"></i> Tải xuống tất cả
          </button>
          <button id="clear-queue-btn" class="danger-btn">
            <i class="fas fa-trash-alt"></i> Xóa tất cả
          </button>
        </div>
        <div class="image-queue-gallery">
      `;

      // Thêm các ảnh trong hàng đợi
      imageQueue.forEach((image, index) => {
        modalContent += `
          <div class="queue-image-item" data-index="${index}">
            <div class="queue-image-container">
              <img src="${image.url}" alt="Ảnh ${index + 1}" loading="lazy">
            </div>
            <div class="queue-image-actions">
              <button class="download-queue-image-btn" data-index="${index}">
                <i class="fas fa-download"></i> Tải xuống
              </button>
              <button class="regenerate-queue-image-btn" data-index="${index}">
                <i class="fas fa-sync-alt"></i> Tạo lại
              </button>
              <button class="remove-queue-image-btn" data-index="${index}">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        `;
      });

      modalContent += `
        </div>
      `;
    }

    modalContent += `
      </div>
    `;

    modal.innerHTML = modalContent;
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // Thêm sự kiện cho nút đóng
    const closeBtn = modal.querySelector(".close-btn");
    closeBtn.addEventListener("click", function () {
      // Nếu là từ quá trình tự động thao tác, đóng ngay không cần xác nhận
      if (isAutoProcess) {
        document.body.removeChild(modalOverlay);
      } else if (confirm("Bạn có chắc chắn muốn đóng hàng đợi?")) {
        document.body.removeChild(modalOverlay);
      }
    });

    // Thêm sự kiện cho các nút trong modal nếu có ảnh
    if (imageQueue.length > 0) {
      // Sự kiện tải xuống tất cả
      modal
        .querySelector("#download-all-queue-btn")
        .addEventListener("click", function () {
          // Lấy danh sách URL theo đúng thứ tự trong hàng đợi
          const urls = imageQueue.map((img) => img.url);
          downloadImagesAsZip(urls, `queue-images-${Date.now()}.zip`);
        });

      // Sự kiện xóa tất cả
      modal
        .querySelector("#clear-queue-btn")
        .addEventListener("click", function () {
          if (confirm("Bạn có chắc chắn muốn xóa tất cả ảnh trong hàng đợi?")) {
            imageQueue = [];
            updateQueueButton();
            showToast("Đã xóa tất cả ảnh trong hàng đợi");
            document.body.removeChild(modalOverlay);
          }
        });

      // Sự kiện tải xuống từng ảnh
      const downloadBtns = modal.querySelectorAll(".download-queue-image-btn");
      downloadBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.dataset.index);
          downloadImage(imageQueue[index].url);
        });
      });

      // Sự kiện tạo lại ảnh
      const regenerateBtns = modal.querySelectorAll(
        ".regenerate-queue-image-btn"
      );
      regenerateBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.dataset.index);
          // Không đóng modal mà gọi trực tiếp hàm tạo lại ảnh
          regenerateQueueImage(index);
        });
      });

      // Sự kiện xóa từng ảnh
      const removeBtns = modal.querySelectorAll(".remove-queue-image-btn");
      removeBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.dataset.index);
          imageQueue.splice(index, 1);
          updateQueueButton();
          showToast("Đã xóa ảnh khỏi hàng đợi");
          document.body.removeChild(modalOverlay);
          showImageQueueModal(isAutoProcess); // Hiển thị lại modal với cùng trạng thái
        });
      });
    }
  }

  // Hàm chuyển đổi đường dẫn Windows (backslash) sang đường dẫn web (forward slash)
  function normalizeImagePath(path) {
    if (!path) return null;

    // Chuyển đổi backslash sang forward slash
    let normalizedPath = path.replace(/\\/g, "/");

    // Kiểm tra xem đường dẫn đã có /static/ chưa
    if (
      !normalizedPath.startsWith("/static/") &&
      !normalizedPath.startsWith("http") &&
      !normalizedPath.startsWith("data:")
    ) {
      normalizedPath = `/static/${normalizedPath}`;
    }

    return normalizedPath;
  }

  // Toggle password visibility
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

  // Update threshold value display
  thresholdSlider.addEventListener("input", function () {
    thresholdValue.textContent = this.value;
  });

  // Initialize threshold value display to match slider
  thresholdValue.textContent = thresholdSlider.value;

  // Update difference threshold value display
  if (differenceThresholdSlider) {
    differenceThresholdSlider.addEventListener("input", function () {
      differenceThresholdValue.textContent = this.value;
      differenceThreshold = parseFloat(this.value);
    });

    // Initialize difference threshold value display
    if (differenceThresholdValue) {
      differenceThresholdValue.textContent = differenceThresholdSlider.value;
      differenceThreshold = parseFloat(differenceThresholdSlider.value);
    }
  }

  // Update transition threshold value display
  if (transitionThresholdSlider) {
    transitionThresholdSlider.addEventListener("input", function () {
      transitionThresholdValue.textContent = this.value;
    });

    // Initialize transition threshold value display
    if (transitionThresholdValue) {
      transitionThresholdValue.textContent = transitionThresholdSlider.value;
    }
  }

  // Update temperature value display
  scriptTemperatureSlider.addEventListener("input", function () {
    temperatureValue.textContent = this.value;
  });

  // Initialize temperature value display
  temperatureValue.textContent = scriptTemperatureSlider.value;

  // Thêm sự kiện cho nút áp dụng ngưỡng
  if (applyThresholdBtn) {
    applyThresholdBtn.addEventListener("click", function () {
      if (!currentSessionId) {
        showToast("Lỗi: Vui lòng xử lý video trước khi áp dụng ngưỡng mới");
        return;
      }

      applyDifferenceThreshold();
    });
  }

  // Tab switching
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
    });
  });

  // Method selection
  methodOptions.forEach((option) => {
    option.addEventListener("click", function () {
      methodOptions.forEach((opt) => opt.classList.remove("active"));
      this.classList.add("active");
      selectedMethod = this.dataset.method;

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

      // Hide all setting groups when Azure method is selected
      const settingGroups = document.querySelectorAll(".setting-group");
      if (selectedMethod === "azure") {
        settingGroups.forEach((group) => {
          group.style.display = "none";
        });
      } else {
        settingGroups.forEach((group) => {
          group.style.display = "block";
        });
      }

      // Show appropriate settings based on selected method
      if (selectedMethod === "method2") {
        method2Settings.forEach((setting) => {
          setting.style.display = "block";
        });
      } else if (selectedMethod === "method3") {
        method3Settings.forEach((setting) => {
          setting.style.display = "block";
        });
      } else if (selectedMethod === "azure") {
        azureSettings.forEach((setting) => {
          setting.style.display = "block";
        });

        // Load saved Azure credentials if available
        loadAzureCredentials();
      }
    });
  });

  // Add this function to handle the "Generate Prompt" button click
  // Add this function to handle the "Generate Prompt" button click
  function generatePrompt(framePath) {
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
    fetch("/generate-gemini-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyframe_path: framePath,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(
              data.error || "Error generating prompt with Gemini"
            );
          });
        }
        return response.json();
      })
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

  // Helper function to format the prompt text with proper line breaks and styling
  // Helper function to format the prompt text with proper line breaks and styling
  function formatPromptText(text) {
    // Replace line breaks with HTML line breaks
    let formatted = text.replace(/\n/g, "<br>");

    // Highlight keywords that might be parameters or special terms
    formatted = formatted.replace(
      /\b([A-Z]{2,}|--[a-z-]+)\b/g,
      '<span class="prompt-keyword">$1</span>'
    );

    // Highlight values in quotes
    formatted = formatted.replace(
      /"([^"]*)"/g,
      '"<span class="prompt-value">$1</span>"'
    );

    return formatted;
  }

  // Function to load saved Azure credentials
  function loadAzureCredentials() {
    fetch("/azure-credentials")
      .then((response) => response.json())
      .then((data) => {
        if (data.has_credentials) {
          document.getElementById("azure-api-key").value = data.api_key;
          document.getElementById("azure-account-id").value = data.account_id;
          document.getElementById("azure-location").value = data.location;
        }
      })
      .catch((error) =>
        console.error("Error loading Azure credentials:", error)
      );
  }

  // Handle file selection via browse button
  uploadArea.addEventListener("click", function () {
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener("change", function (e) {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Handle drag and drop
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

  // Format file size
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    else return (bytes / 1073741824).toFixed(1) + " GB";
  }

  // Process file selection
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

  // Hàm để áp dụng ngưỡng độ khác biệt
  function applyDifferenceThreshold() {
    // Hiển thị thông báo đang xử lý
    showToast("Đang phân tích độ khác biệt giữa các khung hình...");

    // Lấy giá trị ngưỡng từ thanh trượt
    const newThreshold = differenceThresholdSlider
      ? parseFloat(differenceThresholdSlider.value)
      : 0.32;

    // Gửi request đến server để phân tích với ngưỡng mới
    fetch("/analyze-frame-differences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        difference_threshold: newThreshold,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(
              data.error || "Lỗi khi áp dụng ngưỡng độ khác biệt"
            );
          });
        }
        return response.json();
      })
      .then((data) => {
        // Cập nhật dữ liệu keyframes
        keyframesData = data.keyframes || [];

        // Cập nhật hiển thị
        updateSimilarityDisplay(data);

        // Hiển thị thông báo thành công
        showToast(`Đã áp dụng ngưỡng độ khác biệt: ${newThreshold}`);
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("Lỗi khi áp dụng ngưỡng: " + error.message);
      });
  }

  // Hàm để cập nhật hiển thị sau khi thay đổi ngưỡng
  function updateSimilarityDisplay(data) {
    // Cập nhật thông tin về ngưỡng độ khác biệt trong phần method info
    if (data.difference_threshold) {
      const methodInfoEl = document.getElementById("method-info");
      if (methodInfoEl) {
        const thresholdInfo = methodInfoEl.querySelector(".threshold-info");
        if (thresholdInfo) {
          thresholdInfo.textContent = `Ngưỡng độ khác biệt: ${data.difference_threshold}`;
        } else {
          const thresholdP = document.createElement("p");
          thresholdP.className = "threshold-info";
          thresholdP.innerHTML = `<strong>Ngưỡng độ khác biệt:</strong> ${data.difference_threshold}`;
          methodInfoEl.appendChild(thresholdP);
        }
      }
    }

    // Kiểm tra nếu có ảnh tương tự (độ khác biệt thấp)
    const similarFrames = data.keyframes.filter(
      (frame) => frame.is_similar === true
    );

    if (similarFrames.length > 0 && similarityNotification) {
      similarityNotification.style.display = "block";
      similarCount.textContent = similarFrames.length;

      // Cập nhật sự kiện cho nút xóa ảnh tương tự
      removeSimilarBtn.onclick = function () {
        removeSimilarFrames(similarFrames);
      };
    } else if (similarityNotification) {
      similarityNotification.style.display = "none";
    }

    // Cập nhật class và thông tin cho từng khung hình
    data.keyframes.forEach((frame) => {
      const frameElement = document.querySelector(
        `.keyframe[data-frame-id="${frame.id}"]`
      );

      if (frameElement) {
        // Cập nhật class similar-frame
        if (frame.is_similar) {
          frameElement.classList.add("similar-frame");
        } else {
          frameElement.classList.remove("similar-frame");
        }

        // Cập nhật nhãn độ tương đồng
        const existingLabel = frameElement.querySelector(".similarity-label");
        if (existingLabel) {
          existingLabel.remove();
        }

        if (frame.is_similar && frame.similarity !== undefined) {
          const labelHTML = `<div class="similarity-label">Tương tự (${Math.round(
            frame.similarity * 100
          )}%)</div>`;

          // Thêm nhãn mới
          frameElement.insertAdjacentHTML("afterbegin", labelHTML);

          // Cập nhật thông tin độ tương đồng trong metadata
          const metaElement = frameElement.querySelector(".keyframe-meta");
          if (metaElement) {
            const similaritySpan = metaElement.querySelector("span:last-child");
            if (
              similaritySpan &&
              similaritySpan.textContent.includes("Độ tương đồng")
            ) {
              similaritySpan.textContent = `Độ tương đồng: ${(
                frame.similarity * 100
              ).toFixed(0)}%`;
            } else {
              metaElement.insertAdjacentHTML(
                "beforeend",
                `<span>Độ tương đồng: ${(frame.similarity * 100).toFixed(
                  0
                )}%</span>`
              );
            }
          }
        }
      }
    });
  }

  // Hàm để xóa tất cả các khung hình tương tự
  function removeSimilarFrames(similarFrames) {
    if (
      !confirm(
        "Bạn có chắc chắn muốn xóa tất cả khung hình có độ khác biệt thấp không?"
      )
    ) {
      return;
    }

    // Hiển thị thông báo đang xử lý
    showToast("Đang xóa khung hình tương tự...");

    fetch("/remove-similar-frames", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        similar_frames: similarFrames,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          // Xóa tất cả khung hình tương tự khỏi giao diện
          data.deleted_frames.forEach((frameId) => {
            const frameElement = document.querySelector(
              `.keyframe[data-frame-id="${frameId}"]`
            );
            if (frameElement) {
              frameElement.remove();
            }

            // Cập nhật keyframesData
            keyframesData = keyframesData.filter(
              (frame) => frame.id !== frameId
            );
          });

          // Ẩn thông báo tương tự
          if (similarityNotification) {
            similarityNotification.style.display = "none";
          }

          // Hiển thị thông báo
          showToast(`Đã xóa ${data.deleted_frames.length} khung hình tương tự`);
        } else {
          showToast(
            "Lỗi: " + (data.error || "Không thể xóa khung hình tương tự")
          );
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("Lỗi khi xóa khung hình tương tự: " + error.message);
      });
  }

  // Extract keyframes
  extractBtn.addEventListener("click", function () {
    // Remove any existing error messages
    const errorMsg = document.querySelector(".error-message");
    if (errorMsg) {
      errorMsg.remove();
    }

    // Validate inputs based on upload method
    if (activeUploadMethod === "file-upload") {
      if (!selectedFile) {
        showError("Vui lòng chọn file video để trích xuất");
        return;
      }
    } else if (activeUploadMethod === "youtube-upload") {
      const youtubeUrl = youtubeUrlInput.value.trim();
      if (!youtubeUrl) {
        showError("Vui lòng nhập URL video YouTube");
        return;
      }
    } else if (activeUploadMethod === "tiktok-upload") {
      const tiktokUrl = tiktokUrlInput.value.trim();
      if (!tiktokUrl) {
        showError("Vui lòng nhập URL video TikTok");
        return;
      }
    }

    // Additional validation for Azure method
    // Additional validation for Azure method
    if (selectedMethod === "azure") {
      const apiKey = document.getElementById("azure-api-key").value;
      const accountId = document.getElementById("azure-account-id").value;
      const location = document.getElementById("azure-location").value;

      if (!apiKey || !accountId || !location) {
        showError(
          "Vui lòng nhập đầy đủ thông tin API Key, Account ID và Location cho Azure"
        );
        return;
      }
    }

    // Show progress
    uploadContainer.style.display = "none";
    progressContainer.style.display = "block";

    // Create form data
    const formData = new FormData();

    if (activeUploadMethod === "file-upload") {
      formData.append("video", selectedFile);
    } else if (activeUploadMethod === "youtube-upload") {
      formData.append("video_url", youtubeUrlInput.value.trim());
    } else if (activeUploadMethod === "tiktok-upload") {
      formData.append("video_url", tiktokUrlInput.value.trim());
    }

    formData.append("method", selectedMethod);

    // Add method-specific parameters
    if (selectedMethod === "azure") {
      // Add Azure-specific parameters
      formData.append(
        "api_key",
        document.getElementById("azure-api-key").value
      );
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
        extractAudioCheckbox.checked ? "true" : "false"
      );
      formData.append("save_images", "true");
    } else {
      // Add parameters for other methods
      formData.append("threshold", thresholdSlider.value);
      formData.append("max_frames", maxFramesInput.value);
      formData.append(
        "extract_audio",
        extractAudioCheckbox.checked ? "true" : "false"
      );
      formData.append(
        "detect_duplicates",
        detectDuplicatesCheckbox.checked ? "true" : "false"
      );

      if (differenceThresholdSlider) {
        formData.append(
          "difference_threshold",
          differenceThresholdSlider.value
        );
      } else {
        formData.append("difference_threshold", differenceThreshold);
      }

      if (selectedMethod === "method2") {
        formData.append("min_scene_length", minSceneLengthInput.value);
      } else if (selectedMethod === "method3") {
        formData.append(
          "transition_threshold",
          transitionThresholdSlider.value
        );
      }
    }

    // Simulate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
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

    // Determine endpoint based on method
    let endpoint;
    if (selectedMethod === "azure") {
      endpoint = "/process-video-azure";
    } else if (selectedMethod === "method3") {
      endpoint = "/extract-keyframes-advanced";
    } else if (selectedMethod === "method1") {
      endpoint = "/upload-method1";
    } else if (selectedMethod === "method2") {
      endpoint = "/upload-method2";
    } else {
      // Fallback to the original upload endpoint for compatibility
      endpoint = "/upload";
    }

    debugLog("Sending request to endpoint:", endpoint);
    debugLog("Method selected:", selectedMethod);

    // Send to server
    fetch(endpoint, {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        clearInterval(progressInterval);

        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi xử lý video");
          });
        }
        return response.json();
      })
      .then((data) => {
        // Kiểm tra dữ liệu API trả về
        debugLog("API Response:", data);
        debugLog("API endpoint used:", endpoint);

        if (data.keyframes) {
          debugLog("Keyframes count:", data.keyframes.length);
          if (data.keyframes.length > 0) {
            debugLog("First keyframe sample:", data.keyframes[0]);
            debugLog(
              "Last keyframe sample:",
              data.keyframes[data.keyframes.length - 1]
            );
          }
        } else {
          console.warn("No keyframes in response!");
        }

        // Complete progress
        progress.style.width = "100%";
        progressText.textContent = "Hoàn thành!";

        // Store session ID and keyframes data if available
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
      })
      .catch((error) => {
        console.error("Error:", error);
        progressText.textContent = `Lỗi: ${error.message}`;
        progress.style.width = "100%";
        progress.style.backgroundColor = "var(--error-color)";

        // Allow retry after a short delay
        setTimeout(() => {
          uploadContainer.style.display = "flex";
          progressContainer.style.display = "none";
        }, 2000);
      });
  });

  // Show error message
  function showError(message) {
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
      uploadArea.parentNode.appendChild(errorDiv);
    } else if (activeUploadMethod === "youtube-upload") {
      document.querySelector(".youtube-form").appendChild(errorDiv);
    } else if (activeUploadMethod === "tiktok-upload") {
      document.querySelector(".tiktok-form").appendChild(errorDiv);
    }
  }

  // Display results
  function displayResults(data) {
    progressContainer.style.display = "none";
    resultsSection.style.display = "block";
    scriptSection.style.display = "none";
    generatedImagesSection.style.display = "none";
    transcriptSection.style.display = "none";

    // Show the auto-process button after extraction
    const autoProcessBtn = document.getElementById(
      "auto-process-keyframes-btn"
    );
    if (autoProcessBtn) {
      autoProcessBtn.parentElement.style.display = "block";

      // Gỡ bỏ tất cả các event listener hiện tại
      const newBtn = autoProcessBtn.cloneNode(true);
      autoProcessBtn.parentNode.replaceChild(newBtn, autoProcessBtn);

      // Thêm event listener mới
      newBtn.addEventListener("click", function () {
        console.log("Auto process button clicked!");
        showToast("Starting auto processing...");
        autoProcessVideo();
      });
    }

    if (similarityNotification) {
      similarityNotification.style.display = "none";
    }

    debugLog("Displaying results with data:", data);
    debugLog(
      "Sample path from API:",
      data.keyframes && data.keyframes.length > 0
        ? data.keyframes[0].path
        : "No keyframes"
    );

    // Store keyframes data globally
    keyframesData = data.keyframes || [];

    // Display video info
    const minutes = Math.floor(data.duration / 60);
    const seconds = Math.round(data.duration % 60);

    // Check if video is from an online source
    const isYouTube = data.video_source === "YouTube";
    const isTikTok = data.video_source === "TikTok";

    let videoInfoHTML = `
          <h4><i class="fas fa-info-circle"></i> Thông tin video</h4>
          <p><strong>Tên file:</strong> ${data.filename}</p>
          <p><strong>Thời lượng:</strong> ${minutes}:${
      seconds < 10 ? "0" + seconds : seconds
    }</p>
          <p><strong>Kích thước:</strong> ${data.width} x ${data.height}</p>
          <p><strong>Tổng số khung hình:</strong> ${data.total_frames}</p>
          <p><strong>FPS:</strong> ${data.fps.toFixed(2)}</p>
        `;

    if (isYouTube) {
      videoInfoHTML += `
            <div class="youtube-info">
              <div class="youtube-icon">
                <i class="fab fa-youtube"></i>
              </div>
              <div>
                <p><strong>Nguồn:</strong> YouTube</p>
                ${
                  data.video_title
                    ? `<p><strong>Tiêu đề:</strong> ${data.video_title}</p>`
                    : ""
                }
              </div>
            </div>
          `;
    } else if (isTikTok) {
      videoInfoHTML += `
            <div class="tiktok-info">
              <div class="tiktok-icon">
                <i class="fab fa-tiktok"></i>
              </div>
              <div>
                <p><strong>Nguồn:</strong> TikTok</p>
                ${
                  data.video_title
                    ? `<p><strong>Tiêu đề:</strong> ${data.video_title}</p>`
                    : ""
                }
              </div>
            </div>
          `;
    }

    videoInfo.innerHTML = videoInfoHTML;

    // Update method info with icons
    if (data.method === "frame_difference") {
      methodInfo.innerHTML = `
            <h4><i class="fas fa-chart-line"></i> Phương pháp trích xuất</h4>
            <p><strong>Phương pháp:</strong> Phân tích sự thay đổi giữa các khung hình</p>
            <p><strong>Ngưỡng phát hiện:</strong> ${thresholdSlider.value}</p>
            <p><strong>Số khung hình đã trích xuất:</strong> ${data.keyframes.length}</p>
          `;

      // Hiển thị thông tin về ngưỡng độ khác biệt
      if (data.difference_threshold) {
        methodInfo.innerHTML += `
              <p><strong>Ngưỡng độ khác biệt:</strong> ${data.difference_threshold}</p>
            `;
      }

      scenesInfo.style.display = "none";
    } else if (data.method === "scene_detection") {
      methodInfo.innerHTML = `
            <h4><i class="fas fa-film"></i> Phương pháp trích xuất</h4>
            <p><strong>Phương pháp:</strong> Phát hiện chuyển cảnh</p>
            <p><strong>Ngưỡng phát hiện:</strong> ${thresholdSlider.value}</p>
            <p><strong>Độ dài tối thiểu cảnh:</strong> ${
              minSceneLengthInput.value
            } frames</p>
            <p><strong>Số cảnh đã phát hiện:</strong> ${
              data.scenes ? data.scenes.length : 0
            }</p>
          `;

      // Hiển thị thông tin về ngưỡng độ khác biệt
      if (data.difference_threshold) {
        methodInfo.innerHTML += `
              <p><strong>Ngưỡng độ khác biệt:</strong> ${data.difference_threshold}</p>
            `;
      }

      // Display scenes info
      if (data.scenes && data.scenes.length > 0) {
        let sceneListHTML = "";
        data.scenes.forEach((scene, index) => {
          const startTime = formatTime(scene.start / data.fps);
          const endTime = formatTime(scene.end / data.fps);
          sceneListHTML += `
                <div class="scene-item">
                  <i class="fas fa-film"></i> <strong>Cảnh ${
                    index + 1
                  }:</strong> 
                  Từ ${startTime} đến ${endTime} 
                  (${scene.length} frames)
                </div>
              `;
        });

        scenesInfo.innerHTML = `
              <div class="scenes-summary"><i class="fas fa-list"></i> Danh sách cảnh đã phát hiện</div>
              <div class="scene-list">${sceneListHTML}</div>
            `;
        scenesInfo.style.display = "block";
      } else {
        scenesInfo.style.display = "none";
      }
    } else if (data.method === "transition_aware") {
      methodInfo.innerHTML = `
            <h4><i class="fas fa-magic"></i> Phương pháp trích xuất</h4>
            <p><strong>Phương pháp:</strong> Phát hiện và lọc Transition</p>
            <p><strong>Ngưỡng phát hiện:</strong> ${thresholdSlider.value}</p>
            <p><strong>Ngưỡng transition:</strong> ${
              data.transition_threshold || "0.4"
            }</p>
            <p><strong>Số khung hình đã trích xuất:</strong> ${
              data.keyframes.length
            }</p>
          `;

      // Hiển thị thông tin về ngưỡng độ khác biệt
      if (data.difference_threshold) {
        methodInfo.innerHTML += `
              <p><strong>Ngưỡng độ khác biệt:</strong> ${data.difference_threshold}</p>
            `;
      }

      scenesInfo.style.display = "none";
    }

    // Display transcript if available
    if (data.transcript && data.transcript.text) {
      transcriptSection.style.display = "block";

      // Format transcript with timestamps if available
      const transcriptHTML = `
            <div class="transcript-text">
              <p>${data.transcript.text}</p>
            </div>
            <div class="transcript-actions">
              <button id="download-transcript-btn">
                <i class="fas fa-download"></i> Tải xuống phiên âm
              </button>
            </div>
          `;

      transcriptContent.innerHTML = transcriptHTML;

      // Add event listener for download transcript button
      document
        .getElementById("download-transcript-btn")
        .addEventListener("click", function () {
          downloadTranscript(currentSessionId);
        });
    } else if (data.audio_error) {
      transcriptSection.style.display = "block";
      transcriptContent.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i> <strong>Lỗi khi xử lý âm thanh:</strong> ${data.audio_error}
            </div>
          `;
    } else {
      transcriptSection.style.display = "none";
    }

    // Display keyframes
    keyframesGallery.innerHTML = "";

    if (data.keyframes && data.keyframes.length > 0) {
      debugLog(`Rendering ${data.keyframes.length} keyframes`);

      // Kiểm tra nếu có ảnh tương tự (độ khác biệt thấp)
      const similarFrames = data.keyframes.filter(
        (frame) => frame.is_similar === true
      );
      if (similarFrames.length > 0 && similarityNotification) {
        similarityNotification.style.display = "block";
        similarCount.textContent = similarFrames.length;

        // Thêm sự kiện cho nút xóa ảnh tương tự
        removeSimilarBtn.onclick = function () {
          removeSimilarFrames(similarFrames);
        };
      } else if (similarityNotification) {
        similarityNotification.style.display = "none";
      }

      // Kiểm tra nếu có ảnh trùng lặp
      const duplicateFrames = data.keyframes.filter(
        (frame) => frame.is_duplicate === true
      );
      if (duplicateFrames.length > 0 && duplicateNotification) {
        duplicateNotification.style.display = "block";
        duplicateCount.textContent = duplicateFrames.length;

        // Thêm sự kiện cho nút xóa ảnh trùng lặp
        removeDuplicatesBtn.onclick = function () {
          removeDuplicateFrames(duplicateFrames);
        };
      } else if (duplicateNotification) {
        duplicateNotification.style.display = "none";
      }

      data.keyframes.forEach((frame, index) => {
        // Tạo một ID duy nhất cho frame nếu không có
        const frameId = frame.id || `frame-${index}`;

        // Xử lý thời gian hiển thị
        let timeString = "N/A";
        if (frame.timestamp !== undefined) {
          timeString = formatTime(frame.timestamp);
        } else if (frame.time !== undefined) {
          timeString = formatTime(frame.time);
        }

        // Tạo element cho keyframe
        const keyframeElement = document.createElement("div");
        keyframeElement.className = "keyframe";
        keyframeElement.dataset.frameId = frameId;
        keyframeElement.dataset.frameIndex = index;

        // Thêm các class đặc biệt nếu cần
        if (frame.is_similar) keyframeElement.classList.add("similar-frame");
        if (frame.is_duplicate)
          keyframeElement.classList.add("duplicate-frame");

        // Xử lý các label cần hiển thị
        let labelHTML = "";

        if (data.method === "scene_detection" && frame.scene_id !== undefined) {
          labelHTML += `<div class="scene-label">Cảnh ${frame.scene_id}</div>`;
        }

        if (
          (data.method === "frame_difference" ||
            data.method === "transition_aware") &&
          frame.diff_value !== undefined
        ) {
          labelHTML += `<div class="diff-label">${Math.round(
            frame.diff_value
          )}</div>`;
        }

        if (frame.is_similar && frame.similarity !== undefined) {
          labelHTML += `<div class="similarity-label">Tương tự (${Math.round(
            frame.similarity * 100
          )}%)</div>`;
        }

        if (frame.is_duplicate && frame.similarity !== undefined) {
          labelHTML += `<div class="duplicate-label">Trùng lặp (${Math.round(
            frame.similarity * 100
          )}%)</div>`;
        }

        if (frame.is_transition) {
          labelHTML += `<div class="transition-label">Transition</div>`;
        }

        // Xử lý đường dẫn ảnh với nhiều trường hợp khác nhau
        const originalPath = frame.path;

        // Chuẩn hóa đường dẫn từ kiểu Windows sang web
        let imagePath = originalPath.replace(/\\/g, "/");

        // Nếu đường dẫn không bắt đầu bằng /static/, thêm vào
        if (!imagePath.startsWith("/static/")) {
          imagePath = `/static/${imagePath}`;
        }

        debugLog(
          `Frame ${index}: Original=${originalPath}, Normalized=${imagePath}`
        );

        const frameNumber = frame.frame_number || index;

        // In the displayResults function, modify the keyframeElement.innerHTML to include the new button
        keyframeElement.innerHTML = `
  ${labelHTML}
  <div class="image-container">
    <img 
      src="${imagePath}" 
      alt="Khung hình ${frameNumber}" 
      loading="lazy" 
      onerror="
        if (!this.dataset.tried) {
          this.dataset.tried = 'true';
          console.error('Failed to load image:', this.src);
          this.src = '/static/${originalPath.replace(/\\/g, "/")}';
        } else {
          this.src = '/static/img/error.png';
        }
      "
    >
  </div>
  <div class="keyframe-info">
    <p><strong>Thời điểm:</strong> ${timeString}</p>
    <div class="keyframe-meta">
      <span>Frame #${frameNumber}</span>
      ${
        frame.is_similar && frame.similarity !== undefined
          ? `<span>Độ tương đồng: ${(frame.similarity * 100).toFixed(
              0
            )}%</span>`
          : ""
      }
      ${
        frame.is_duplicate && frame.similarity !== undefined
          ? `<span>Độ trùng lặp: ${(frame.similarity * 100).toFixed(0)}%</span>`
          : ""
      }
    </div>
    <div class="keyframe-actions">
      <button class="generate-image-btn" data-frame-path="${imagePath.replace(
        "/static/",
        ""
      )}">
        <i class="fas fa-palette"></i> Tạo ảnh mới
      </button>
      <button class="generate-prompt-btn" data-frame-path="${imagePath.replace(
        "/static/",
        ""
      )}">
        <i class="fas fa-magic"></i> Tạo prompt
      </button>
      <button class="delete-frame-btn" data-frame-path="${imagePath.replace(
        "/static/",
        ""
      )}" data-frame-id="${frameId}">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  </div>
`;

        // And then add the event listener for the new button
        const generatePromptBtn = keyframeElement.querySelector(
          ".generate-prompt-btn"
        );
        generatePromptBtn.addEventListener("click", function () {
          const framePath = this.dataset.framePath;
          generatePrompt(framePath);
        });

        // Add click event to open full image
        const imgElement = keyframeElement.querySelector("img");
        imgElement.addEventListener("click", function () {
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
              downloadImagesAsZip(
                [imgSrc],
                `generated-image-${Date.now()}.zip`
              );
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

        // Add click event for generate image button
        const generateBtn = keyframeElement.querySelector(
          ".generate-image-btn"
        );
        generateBtn.addEventListener("click", function () {
          const framePath = this.dataset.framePath;
          directLeonardoImageGeneration(framePath);
        });

        // Add click event for delete button
        const deleteBtn = keyframeElement.querySelector(".delete-frame-btn");
        deleteBtn.addEventListener("click", function () {
          const framePath = this.dataset.framePath;
          const frameId = this.dataset.frameId;
          deleteKeyframe(framePath, frameId);
        });

        keyframesGallery.appendChild(keyframeElement);
      });
    } else {
      console.warn("No keyframes found in data:", data);
      keyframesGallery.innerHTML =
        '<p class="no-frames"><i class="fas fa-exclamation-circle"></i> Không có khung hình nào được trích xuất.</p>';
    }

    // Add check paths button event
    if (checkPathsBtn) {
      checkPathsBtn.addEventListener("click", checkAllImagePaths);
    }
  }

  // Hàm kiểm tra tất cả đường dẫn ảnh
  function checkAllImagePaths() {
    if (!keyframesData || keyframesData.length === 0) {
      showToast("Không có dữ liệu khung hình để kiểm tra");
      return;
    }

    showToast("Đang kiểm tra đường dẫn ảnh...");

    // Tạo một div để hiển thị kết quả
    const resultsDiv = document.createElement("div");
    resultsDiv.className = "path-check-results";
    resultsDiv.innerHTML = `
          <h3><i class="fas fa-search"></i> Kết quả kiểm tra đường dẫn ảnh</h3>
          <p>Đang kiểm tra ${keyframesData.length} đường dẫn...</p>
          <div class="path-results"></div>
          <button class="close-btn"><i class="fas fa-times"></i> Đóng</button>
        `;

    document.body.appendChild(resultsDiv);

    // Thêm sự kiện cho nút đóng
    resultsDiv
      .querySelector(".close-btn")
      .addEventListener("click", function () {
        document.body.removeChild(resultsDiv);
      });

    const pathResultsDiv = resultsDiv.querySelector(".path-results");

    // Kiểm tra từng đường dẫn
    const samplePaths = keyframesData.slice(0, 5); // Chỉ kiểm tra 5 đường dẫn đầu tiên

    samplePaths.forEach((frame, index) => {
      if (!frame.path) return;

      const originalPath = frame.path;
      const normalizedPath = normalizeImagePath(originalPath);

      const pathItem = document.createElement("div");
      pathItem.className = "path-item";
      pathItem.innerHTML = `
            <p><strong>Frame ${index}:</strong></p>
            <p>Original: <code>${originalPath}</code></p>
            <p>Normalized: <code>${normalizedPath}</code></p>
            <div class="path-status">Đang kiểm tra...</div>
          `;

      pathResultsDiv.appendChild(pathItem);

      // Tạo một ảnh để kiểm tra
      const testImg = new Image();
      testImg.onload = function () {
        pathItem.querySelector(".path-status").innerHTML = `
              <span class="success"><i class="fas fa-check-circle"></i> Đường dẫn hợp lệ</span>
              <img src="${normalizedPath}" alt="Preview" class="path-preview">
            `;
      };

      testImg.onerror = function () {
        pathItem.querySelector(".path-status").innerHTML = `
              <span class="error"><i class="fas fa-times-circle"></i> Đường dẫn không hợp lệ</span>
            `;

        // Thử các đường dẫn khác
        const alternativePaths = [
          `/static/${originalPath}`,
          originalPath.replace(/\\/g, "/"),
          `/uploads/keyframes/${currentSessionId}/frame_${index}.jpg`,
        ];

        const altPathsHtml = alternativePaths
          .map(
            (path) =>
              `<p>Thử: <code>${path}</code> <img src="${path}" alt="" class="path-test-img" onload="this.parentNode.classList.add('valid-path')" onerror="this.parentNode.classList.add('invalid-path')"></p>`
          )
          .join("");

        pathItem.innerHTML += `
              <div class="alternative-paths">
                <p><strong>Đang thử các đường dẫn thay thế:</strong></p>
                ${altPathsHtml}
              </div>
            `;
      };

      testImg.src = normalizedPath;
    });
  }

  // Display Azure results
  function displayAzureResults(data) {
    progressContainer.style.display = "none";
    resultsSection.style.display = "block";
    scriptSection.style.display = "none";
    generatedImagesSection.style.display = "none";
    transcriptSection.style.display = "none";

    // Show the auto-process button after extraction
    const autoProcessBtn = document.getElementById(
      "auto-process-keyframes-btn"
    );
    if (autoProcessBtn) {
      autoProcessBtn.parentElement.style.display = "block";

      // Gỡ bỏ tất cả các event listener hiện tại
      const newBtn = autoProcessBtn.cloneNode(true);
      autoProcessBtn.parentNode.replaceChild(newBtn, autoProcessBtn);

      // Thêm event listener mới
      newBtn.addEventListener("click", function () {
        console.log("Auto process button clicked (Azure)!");
        showToast("Starting auto processing...");
        autoProcessVideo();
      });
    }

    // Reset current session ID since we're using a different approach for Azure
    // But keep the session ID if it exists for transcript access
    if (data.session_id) {
      currentSessionId = data.session_id;
    }

    // Create keyframes data array from Azure scenes and shots
    keyframesData = [];

    // Add shots to keyframesData
    if (data.shots && data.shots.length > 0) {
      data.shots.forEach((shot, index) => {
        // Use saved path if available, otherwise use base64 data
        const imgPath = shot.path
          ? shot.path
          : `data:image/jpeg;base64,${shot.image_data}`;

        keyframesData.push({
          id: `azure-shot-${index}`,
          path: imgPath,
          shot_index: shot.shot_index,
          scene_id: shot.scene_id,
          timestamp: shot.start,
          frame_number: index, // No offset needed since we don't have scenes
          azure_data: true,
          start: shot.start,
          end: shot.end,
          type: "shot",
        });
      });
    }

    // Display transcript if available (from regular audio extraction)
    if (data.transcript && data.transcript.text) {
      transcriptSection.style.display = "block";

      // Format transcript with timestamps if available
      const transcriptHTML = `
            <div class="transcript-text">
              <p>${data.transcript.text}</p>
            </div>
            <div class="transcript-actions">
              <button id="download-transcript-btn">
                <i class="fas fa-download"></i> Tải xuống phiên âm
              </button>
            </div>
          `;

      transcriptContent.innerHTML = transcriptHTML;

      // Add event listener for download transcript button
      document
        .getElementById("download-transcript-btn")
        .addEventListener("click", function () {
          downloadTranscript(currentSessionId);
        });
    } else if (data.audio_error) {
      transcriptSection.style.display = "block";
      transcriptContent.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i> <strong>Lỗi khi xử lý âm thanh:</strong> ${data.audio_error}
            </div>
          `;
    } else {
      transcriptSection.style.display = "none";
    }

    // Display video info
    let videoInfoHTML = `
          <h4><i class="fas fa-info-circle"></i> Thông tin video</h4>
          <p><strong>Tên file:</strong> ${
            data.video_name || data.filename || "Unknown"
          }</p>
        `;

    if (data.saved_folder) {
      videoInfoHTML += `<p><strong>Thư mục lưu trữ:</strong> ${data.saved_folder}</p>`;
    }

    if (data.duration) {
      const minutes = Math.floor(data.duration / 60);
      const seconds = Math.round(data.duration % 60);
      videoInfoHTML += `<p><strong>Thời lượng:</strong> ${minutes}:${
        seconds < 10 ? "0" + seconds : seconds
      }</p>`;
    }

    videoInfo.innerHTML = videoInfoHTML;

    // Display method info
    // Display method info
    methodInfo.innerHTML = `
    <h4><i class="fab fa-microsoft"></i> Phương pháp trích xuất</h4>
    <p><strong>Phương pháp:</strong> Azure Video Indexer AI</p>
    <p><strong>Số shots đã phát hiện:</strong> ${
      data.shots ? data.shots.length : 0
    }</p>
  `;

    // Display scenes info if available
    scenesInfo.style.display = "none";

    // Display keyframes/scenes gallery
    keyframesGallery.innerHTML = "";

    // Only display shots
    if (data.shots && data.shots.length > 0) {
      const shotsHeader = document.createElement("h4");
      shotsHeader.className = "gallery-section-header";
      shotsHeader.innerHTML = '<i class="fas fa-film"></i> Shots';
      keyframesGallery.appendChild(shotsHeader);

      data.shots.forEach((shot, index) => {
        const keyframeElement = document.createElement("div");
        keyframeElement.className = "keyframe azure-shot";

        // Create a unique ID for the shot
        const shotId = `azure-shot-${index}`;
        keyframeElement.dataset.frameId = shotId;
        keyframeElement.dataset.shotId = shotId;

        // Format time string
        const startTime = shot.start;
        const endTime = shot.end;

        // Use saved path if available, otherwise use base64 data
        const imgSrc = shot.path
          ? normalizeImagePath(shot.path)
          : `data:image/jpeg;base64,${shot.image_data}`;

        // In the displayAzureResults function, modify the keyframeElement.innerHTML
        keyframeElement.innerHTML = `
<div class="scene-label">Shot ${shot.shot_index}</div>
<div class="image-container">
  <img src="${imgSrc}" alt="Shot ${shot.shot_index}" loading="lazy">
</div>
<div class="keyframe-info">
  <p><strong>Thời điểm:</strong> ${startTime} - ${endTime}</p>
  <div class="keyframe-meta">
    <span>Shot #${shot.shot_index}</span>
  </div>
  <div class="keyframe-actions">
    <button class="generate-image-btn" data-frame-path="${shot.path || ""}">
      <i class="fas fa-palette"></i> Tạo ảnh mới
    </button>
    <button class="generate-prompt-btn" data-frame-path="${shot.path || ""}">
      <i class="fas fa-magic"></i> Tạo prompt
    </button>
  </div>
</div>
`;

        // Add event listener for generate prompt button if path exists
        if (shot.path) {
          keyframeElement
            .querySelector(".generate-prompt-btn")
            .addEventListener("click", function () {
              const framePath = this.dataset.framePath;
              generatePrompt(framePath);
            });
        } else {
          // Hide the buttons if no path is available
          const genButton = keyframeElement.querySelector(
            ".generate-image-btn"
          );
          const promptButton = keyframeElement.querySelector(
            ".generate-prompt-btn"
          );
          if (genButton) genButton.style.display = "none";
          if (promptButton) promptButton.style.display = "none";
        }

        // Add click event to open full image
        keyframeElement
          .querySelector("img")
          .addEventListener("click", function () {
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
                downloadImagesAsZip(
                  [imgSrc],
                  `generated-image-${Date.now()}.zip`
                );
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

        // Add click event to open full image
        keyframeElement
          .querySelector(".generate-image-btn")
          .addEventListener("click", function () {
            const framePath = this.dataset.framePath;
            directLeonardoImageGeneration(framePath);
          });

        keyframesGallery.appendChild(keyframeElement);
      });
    } else {
      keyframesGallery.innerHTML =
        '<p class="no-frames"><i class="fas fa-exclamation-circle"></i> Không có shots nào được trích xuất.</p>';
    }

    // Add check paths button event
    if (checkPathsBtn) {
      checkPathsBtn.addEventListener("click", checkAllImagePaths);
    }
  }

  // Function to remove duplicate frames
  function removeDuplicateFrames(duplicateFrames) {
    if (
      !confirm(
        "Bạn có chắc chắn muốn xóa tất cả các khung hình trùng lặp không?"
      )
    ) {
      return;
    }

    // Hiển thị thông báo đang xử lý
    showToast("Đang xóa khung hình trùng lặp...");

    fetch("/remove-duplicates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        duplicate_frames: duplicateFrames,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          // Xóa tất cả khung hình trùng lặp khỏi giao diện
          data.deleted_frames.forEach((frameId) => {
            const frameElement = document.querySelector(
              `.keyframe[data-frame-id="${frameId}"]`
            );
            if (frameElement) {
              frameElement.remove();
            }

            // Cập nhật keyframesData
            keyframesData = keyframesData.filter(
              (frame) => frame.id !== frameId
            );
          });

          // Ẩn thông báo trùng lặp
          if (duplicateNotification) {
            duplicateNotification.style.display = "none";
          }

          // Hiển thị thông báo
          showToast(
            `Đã xóa ${data.deleted_frames.length} khung hình trùng lặp`
          );
        } else {
          showToast(
            "Lỗi: " + (data.error || "Không thể xóa khung hình trùng lặp")
          );
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("Lỗi khi xóa khung hình trùng lặp: " + error.message);
      });
  }

  // Delete a keyframe
  function deleteKeyframe(framePath, frameId) {
    if (!confirm("Bạn có chắc chắn muốn xóa khung hình này không?")) {
      return;
    }

    fetch("/delete-keyframe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        frame_path: framePath,
        session_id: currentSessionId,
        frame_id: frameId,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          // Xóa khung hình khỏi giao diện
          const frameElement = document.querySelector(
            `.keyframe[data-frame-id="${frameId}"]`
          );
          if (frameElement) {
            frameElement.remove();

            // Cập nhật keyframesData
            keyframesData = keyframesData.filter(
              (frame) => frame.id !== frameId
            );

            // Cập nhật số lượng ảnh tương tự nếu cần
            if (similarityNotification) {
              const remainingSimilar = document.querySelectorAll(
                ".keyframe.similar-frame"
              ).length;
              if (remainingSimilar === 0) {
                similarityNotification.style.display = "none";
              } else {
                similarCount.textContent = remainingSimilar;
              }
            }

            // Cập nhật số lượng ảnh trùng lặp nếu cần
            if (duplicateNotification) {
              const remainingDuplicates = document.querySelectorAll(
                ".keyframe.duplicate-frame"
              ).length;
              if (remainingDuplicates === 0) {
                duplicateNotification.style.display = "none";
              } else {
                duplicateCount.textContent = remainingDuplicates;
              }
            }

            // Hiển thị thông báo
            showToast("Đã xóa khung hình thành công");
          }
        } else {
          showToast("Lỗi: " + (data.error || "Không thể xóa khung hình"));
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showToast("Lỗi khi xóa khung hình: " + error.message);
      });
  }

  // Show toast notification
  function showToast(message) {
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

  // Show image generation modal
  function showImageGenerationModal(framePath) {
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
      generateImage(framePath, prompt, style);
    });
  }

  // Generate image
  function generateImage(framePath, prompt, style) {
    fetch("/generate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyframe_path: framePath,
        session_id: currentSessionId,
        prompt: prompt,
        style: style,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi khi tạo ảnh mới");
          });
        }
        return response.json();
      })
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
  function displayGeneratedImages(data) {
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
        imageElement
          .querySelector("img")
          .addEventListener("click", function () {
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
                downloadImagesAsZip(
                  [imgSrc],
                  `generated-image-${Date.now()}.zip`
                );
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
            addToImageQueue({
              url: path,
              prompt: data.prompt,
              timestamp: Date.now(),
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
              const exists = imageQueue.some((img) => img.url === path);
              if (!exists) {
                imageQueue.push({
                  url: path,
                  prompt: data.prompt,
                  timestamp: timestamp,
                  order: index, // Lưu thứ tự ban đầu
                });
                addedCount++;
              }
            });

            if (addedCount > 0) {
              showToast(`Đã thêm ${addedCount} ảnh vào hàng đợi`);
              updateQueueButton();
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
        session_id: currentSessionId,
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

  // Download a single image
  function downloadImage(imagePath) {
    // Create a loading indicator
    showToast("Đang tải xuống ảnh...");

    // Fetch the image as a blob
    fetch(imagePath)
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải xuống ảnh");
        return response.blob();
      })
      .then((blob) => {
        // Extract a meaningful filename from the path
        let filename =
          imagePath.split("/").pop() || `generated-image-${Date.now()}.jpg`;

        // Use FileSaver.js to save the file
        saveAs(blob, filename);

        showToast("Đã tải xuống ảnh thành công!");
      })
      .catch((error) => {
        console.error("Error downloading image:", error);
        showToast("Lỗi khi tải xuống ảnh: " + error.message);
      });
  }

  // Download multiple images as a ZIP file
  function downloadImagesAsZip(images, zipFilename = "images.zip") {
    showToast("Đang chuẩn bị tệp ZIP...");

    // Create a new ZIP file
    const zip = new JSZip();
    const imgFolder = zip.folder("images");

    // Counter for tracking download progress
    let downloadCount = 0;
    const totalImages = images.length;

    // Create promises for downloading all images
    const downloadPromises = images.map((imagePath, index) => {
      return fetch(imagePath)
        .then((response) => {
          if (!response.ok) throw new Error(`Không thể tải ${imagePath}`);
          return response.blob();
        })
        .then((blob) => {
          // Extract filename from path or generate one
          let filename = imagePath.split("/").pop() || `image-${index + 1}.jpg`;

          // Add leading zeros to ensure proper sorting
          // Format: 001_image.jpg, 002_image.jpg, etc.
          const paddedIndex = String(index + 1).padStart(3, "0");
          filename = `${paddedIndex}_${filename}`;

          // Add to ZIP file with sequential number to maintain order
          imgFolder.file(filename, blob);

          // Update counter and toast message
          downloadCount++;
          if (downloadCount % 5 === 0 || downloadCount === totalImages) {
            showToast(`Đã tải ${downloadCount}/${totalImages} ảnh...`);
          }

          return true;
        })
        .catch((error) => {
          console.error(`Error downloading image ${imagePath}:`, error);
          return false;
        });
    });

    // Wait for all downloads to complete
    Promise.all(downloadPromises)
      .then((results) => {
        // Count successful downloads
        const successCount = results.filter((result) => result === true).length;

        if (successCount === 0) {
          showToast("Không thể tải xuống bất kỳ ảnh nào!");
          return;
        }

        showToast(`Đang nén ${successCount} ảnh...`);

        // Generate ZIP file
        return zip.generateAsync({ type: "blob" });
      })
      .then((zipBlob) => {
        if (!zipBlob) return;

        // Add timestamp to filename to avoid duplicates
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const finalFilename = zipFilename.replace(".zip", `-${timestamp}.zip`);

        // Save ZIP file using FileSaver.js
        saveAs(zipBlob, finalFilename);

        showToast("Đã tải xuống tệp ZIP thành công!");
      })
      .catch((error) => {
        console.error("Error creating ZIP file:", error);
        showToast("Lỗi khi tạo tệp ZIP: " + error.message);
      });
  }

  // Download transcript
  function downloadTranscript(sessionId) {
    fetch(`/download-transcript/${sessionId}`)
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi khi tải phiên âm");
          });
        }
        return response.json();
      })
      .then((data) => {
        // Create a temporary link to download the transcript
        const link = document.createElement("a");
        const blob = new Blob([data.transcript], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `transcript-${sessionId}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading transcript:", error);
        showToast("Lỗi khi tải phiên âm: " + error.message);
      });
  }

  // Format time (seconds to MM:SS)
  function formatTime(seconds) {
    if (seconds === undefined || seconds === null) return "N/A";

    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs < 10 ? "0" + secs : secs}`;
  }

  // Format script text
  function formatScriptText(text) {
    // Thay thế xuống dòng bằng thẻ <p>
    let formatted = text.replace(/\n\n/g, "</p><p>");

    // Làm nổi bật các phần quan trọng
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

    return `<p>${formatted}</p>`;
  }

  // Extract script from keyframes
  extractScriptBtn.addEventListener("click", function () {
    if (!currentSessionId && !keyframesData.length) {
      showToast("Lỗi: Không có dữ liệu khung hình để phân tích");
      return;
    }

    // Hiển thị phần kịch bản và loading
    scriptSection.style.display = "block";
    scriptLoading.style.display = "block";
    scriptContent.style.display = "none";

    // Cuộn xuống phần kịch bản
    scriptSection.scrollIntoView({ behavior: "smooth" });

    // Lấy giá trị temperature
    const temperature = parseFloat(scriptTemperatureSlider.value);

    // Chuẩn bị dữ liệu để gửi đến server
    let requestData = {
      temperature: temperature,
    };

    // Nếu có session_id, thêm vào request
    if (currentSessionId) {
      requestData.session_id = currentSessionId;
    }
    // Nếu không có session_id nhưng có keyframesData (trường hợp đặc biệt), gửi dữ liệu keyframes trực tiếp
    else if (keyframesData.length > 0) {
      requestData.keyframes_data = keyframesData;

      // Kiểm tra nếu có dữ liệu transcript
      const transcriptContent = document.querySelector(".transcript-text");
      if (transcriptContent && transcriptContent.textContent) {
        requestData.transcript_text = transcriptContent.textContent;
      }
    }

    // Gửi request đến server
    fetch("/generate-script", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi khi trích xuất kịch bản");
          });
        }
        return response.json();
      })
      .then((data) => {
        // Hiển thị kịch bản
        scriptLoading.style.display = "none";
        scriptContent.style.display = "block";

        // Format và hiển thị nội dung
        let scriptHTML = `
        <p><strong>Phân tích ${data.num_frames_analyzed} khung hình</strong> (Temperature: ${data.temperature})</p>
        <div class="script-prompt">
          <em>Prompt: "${data.prompt}"</em>
        </div>
      `;

        // Thêm thông tin về phiên âm nếu có
        if (data.has_transcript) {
          scriptHTML += `
          <div class="script-info">
            <p><em>Kịch bản này được tạo ra với sự hỗ trợ của phiên âm từ video.</em></p>
          </div>
        `;
        }

        scriptHTML += `
        <div class="script-text">
          ${formatScriptText(data.script)}
        </div>
      `;

        scriptContent.innerHTML = scriptHTML;
      })
      .catch((error) => {
        console.error("Error:", error);
        scriptLoading.style.display = "none";
        scriptContent.style.display = "block";
        scriptContent.innerHTML = `
        <div class="error-message">
          <p><i class="fas fa-exclamation-triangle"></i> <strong>Lỗi khi trích xuất kịch bản:</strong> ${error.message}</p>
          <p>Vui lòng thử lại sau.</p>
        </div>
      `;
      });
  });

  // Download all keyframes
  downloadAllBtn.addEventListener("click", function () {
    if (!currentSessionId) {
      showToast("Lỗi: Không có phiên làm việc hiện tại");
      return;
    }

    fetch(`/download/${currentSessionId}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.files && data.files.length > 0) {
          const imageUrls = data.files.map((file) => `/static/${file}`);
          downloadImagesAsZip(imageUrls, `keyframes-${currentSessionId}.zip`);
        } else {
          showToast("Không có khung hình nào để tải xuống");
        }
      })
      .catch((error) => {
        console.error("Error downloading files:", error);
        showToast("Lỗi khi tải xuống các khung hình");
      });
  });

  // Process new video
  newVideoBtn.addEventListener("click", function () {
    // Reset UI
    resultsSection.style.display = "none";
    scriptSection.style.display = "none";
    generatedImagesSection.style.display = "none";
    transcriptSection.style.display = "none";
    if (similarityNotification) {
      similarityNotification.style.display = "none";
    }
    if (duplicateNotification) {
      duplicateNotification.style.display = "none";
    }
    uploadContainer.style.display = "flex";

    // Reset file upload area
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

    // Reset YouTube input
    youtubeUrlInput.value = "";

    // Reset TikTok input
    if (tiktokUrlInput) {
      tiktokUrlInput.value = "";
    }

    // Reset variables
    selectedFile = null;
    currentSessionId = null;
    keyframesData = [];

    // Remove any error messages
    const errorMessages = document.querySelectorAll(".error-message");
    errorMessages.forEach((msg) => msg.remove());
  });

  // Function to create an image using Leonardo.ai directly from a keyframe
  function directLeonardoImageGeneration(framePath) {
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
    fetch("/generate-gemini-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyframe_path: framePath,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(
              data.error || "Error generating prompt with Gemini"
            );
          });
        }
        return response.json();
      })
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Failed to generate prompt");
        }

        // Update loading message
        const loadingElement = modal.querySelector(".leonardo-loading p");
        loadingElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh với Leonardo.ai...`;

        // Now call the Leonardo API with the generated prompt
        return fetch("/generate-leonardo-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: data.prompt,
          }),
        });
      })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi khi tạo ảnh với Leonardo.ai");
          });
        }
        return response.json();
      })
      .then((data) => {
        if (data.success) {
          // Start polling for generation status
          const generationId = data.generation_id;
          let pollingCount = 0;

          // Function to check generation status
          const checkGenerationStatus = () => {
            fetch(`/get-leonardo-image/${generationId}`)
              .then((response) => {
                // Kiểm tra nếu response không OK (như 404, 500, v.v.)
                if (!response.ok) {
                  throw new Error(
                    `Lỗi HTTP: ${response.status} - ${response.statusText}`
                  );
                }
                // Kiểm tra content-type để đảm bảo là JSON
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                  throw new Error(
                    `Phản hồi không hợp lệ: content-type ${contentType}`
                  );
                }
                return response.json();
              })
              .then((result) => {
                pollingCount++;

                // Update the loading message with status
                const loadingElement = modal.querySelector(
                  ".leonardo-loading p"
                );

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
                const loadingElement = modal.querySelector(
                  ".leonardo-loading p"
                );
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

  // Function to create an image using Leonardo.ai
  function createLeonardoImage(prompt) {
    showToast("Đang gửi yêu cầu tạo ảnh với Leonardo.ai...");

    // Show loading state
    const createBtn = document.querySelector(".create-leonardo-image-btn");
    const originalBtnText = createBtn.innerHTML;
    createBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý...`;
    createBtn.disabled = true;

    // Call the Leonardo.ai API endpoint
    fetch("/generate-leonardo-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || "Lỗi khi tạo ảnh với Leonardo.ai");
          });
        }
        return response.json();
      })
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
            fetch(`/get-leonardo-image/${generationId}`)
              .then((response) => {
                // Kiểm tra nếu response không OK (như 404, 500, v.v.)
                if (!response.ok) {
                  throw new Error(
                    `Lỗi HTTP: ${response.status} - ${response.statusText}`
                  );
                }
                // Kiểm tra content-type để đảm bảo là JSON
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                  throw new Error(
                    `Phản hồi không hợp lệ: content-type ${contentType}`
                  );
                }
                return response.json();
              })
              .then((result) => {
                pollingCount++;

                // Update the loading message with status
                const loadingElement = modal.querySelector(
                  ".leonardo-loading p"
                );

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
                    const imageInfo = modal.querySelector(
                      ".leonardo-image-info"
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
          const pollingInterval = setInterval(checkGenerationStatus, 5000);
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

  // Add event listener for the queue button
  const queueBtn = document.getElementById("view-image-queue");
  if (queueBtn) {
    queueBtn.addEventListener("click", function () {
      showImageQueueModal();
    });
  }

  // Hàm tự động xử lý video từ trích xuất đến tạo ảnh mới và lưu vào hàng đợi
  function autoProcessVideo() {
    console.log("autoProcessVideo function called");

    // Kiểm tra xem đã có khung hình được trích xuất chưa
    const keyframesGallery = document.getElementById("keyframes-gallery");
    if (!keyframesGallery || keyframesGallery.children.length === 0) {
      showToast(
        "Không có khung hình nào để xử lý. Vui lòng trích xuất khung hình trước."
      );
      return;
    }

    // Tạo modal theo dõi tiến trình
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-header">
        <h3><i class="fas fa-magic"></i> Tự động thao tác</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="auto-process-progress">
          <div class="progress-step" id="step-generate">
            <div class="progress-step-icon">1</div>
            <div class="progress-step-text">Tạo ảnh mới từ khung hình</div>
            <div class="progress-step-bar">
              <div class="progress-step-bar-fill" style="width: 0%"></div>
            </div>
          </div>
          <div class="progress-step" id="step-queue">
            <div class="progress-step-icon">2</div>
            <div class="progress-step-text">Lưu ảnh vào hàng đợi</div>
            <div class="progress-step-bar">
              <div class="progress-step-bar-fill" style="width: 0%"></div>
            </div>
          </div>
        </div>
        <div class="auto-process-status">
          <p id="auto-status-text"><i class="fas fa-spinner fa-spin"></i> Đang chuẩn bị...</p>
        </div>
      </div>
    `;

    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // Thêm sự kiện cho nút đóng
    const closeBtn = modal.querySelector(".close-btn");
    closeBtn.addEventListener("click", function () {
      if (confirm("Bạn có chắc chắn muốn hủy quá trình tự động thao tác?")) {
        document.body.removeChild(modalOverlay);
      }
    });

    // Đối tượng để theo dõi tiến trình
    const progress = {
      generate: 0,
      queue: 0,
    };

    // Hàm cập nhật trạng thái
    function updateStatus(step, percent, text) {
      const stepEl = document.getElementById(`step-${step}`);
      const statusText = document.getElementById("auto-status-text");

      // Cập nhật phần trăm tiến độ
      progress[step] = percent;
      stepEl.querySelector(
        ".progress-step-bar-fill"
      ).style.width = `${percent}%`;

      // Cập nhật trạng thái active/completed
      if (percent === 0) {
        stepEl.classList.remove("active", "completed");
      } else if (percent < 100) {
        stepEl.classList.add("active");
        stepEl.classList.remove("completed");
      } else {
        stepEl.classList.remove("active");
        stepEl.classList.add("completed");
      }

      // Cập nhật text trạng thái
      if (text) {
        statusText.innerHTML = text;
      }
    }

    // Lấy danh sách đường dẫn khung hình
    const framesPaths = [];
    const keyframes = keyframesGallery.querySelectorAll(".keyframe");

    keyframes.forEach((keyframe) => {
      const imgElement = keyframe.querySelector("img");
      if (imgElement && imgElement.src) {
        // Extract the path relative to /static from the full URL
        const fullSrc = imgElement.src;
        // Find the index of "/static/" in the URL
        const staticIndex = fullSrc.indexOf("/static/");
        if (staticIndex !== -1) {
          // Extract the path after "/static/"
          const relativePath = fullSrc.substring(staticIndex + 8); // +8 to skip "/static/"
          framesPaths.push(relativePath);
        } else {
          console.error("Could not find /static/ in image path:", fullSrc);
        }
      }
    });

    // Nếu không có khung hình nào, hiển thị thông báo và dừng
    if (framesPaths.length === 0) {
      updateStatus(
        "generate",
        100,
        `<i class="fas fa-exclamation-triangle"></i> Không có khung hình nào để tạo ảnh mới!`
      );
      updateStatus(
        "queue",
        100,
        `<i class="fas fa-exclamation-triangle"></i> Không có ảnh nào để thêm vào hàng đợi!`
      );
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 3000);
      return;
    }

    // Bước 1: Tự động tạo ảnh mới cho mỗi khung hình
    updateStatus(
      "generate",
      5,
      `<i class="fas fa-spinner fa-spin"></i> Chuẩn bị tạo ảnh mới từ ${framesPaths.length} khung hình...`
    );

    // Xử lý tất cả các khung hình đã trích xuất
    const selectedFrames = framesPaths;

    updateStatus(
      "generate",
      10,
      `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh mới từ ${selectedFrames.length} khung hình...`
    );

    // Tạo ảnh mới từ mỗi khung hình và lưu vào hàng đợi
    const generatedImages = [];
    let processedCount = 0;

    // Xử lý tuần tự các khung hình để tránh quá tải server
    function processNextFrame(index) {
      if (index >= selectedFrames.length) {
        // Tất cả khung hình đã được xử lý
        updateStatus(
          "generate",
          100,
          `<i class="fas fa-check-circle"></i> Đã tạo ${generatedImages.length} ảnh mới thành công!`
        );

        // Bước 2: Thêm ảnh vào hàng đợi
        updateStatus(
          "queue",
          10,
          `<i class="fas fa-spinner fa-spin"></i> Đang thêm ${generatedImages.length} ảnh vào hàng đợi...`
        );

        // Thêm từng ảnh vào hàng đợi
        let queuedCount = 0;
        generatedImages.forEach((image, idx) => {
          setTimeout(() => {
            addToImageQueue({
              url: image.url,
              prompt: image.prompt,
              timestamp: Date.now(),
              order: idx,
            });

            queuedCount++;
            const queueProgress = Math.floor(
              (queuedCount / generatedImages.length) * 100
            );
            updateStatus(
              "queue",
              queueProgress,
              `<i class="fas fa-spinner fa-spin"></i> Đã thêm ${queuedCount}/${generatedImages.length} ảnh vào hàng đợi...`
            );

            if (queuedCount === generatedImages.length) {
              // Hoàn thành tất cả các bước
              updateStatus(
                "queue",
                100,
                `<i class="fas fa-check-circle"></i> Đã thêm ${queuedCount} ảnh vào hàng đợi thành công!`
              );

              // Đóng modal và hiển thị hàng đợi
              setTimeout(() => {
                document.body.removeChild(modalOverlay);
                // Tự động ngắt quá trình và hiển thị hàng đợi
                showImageQueueModal(true);
              }, 1000);
            }
          }, idx * 100); // Thêm vào hàng đợi cách nhau 100ms
        });

        return;
      }

      const framePath = selectedFrames[index];

      // Cập nhật trạng thái
      const generateProgress =
        Math.floor((index / selectedFrames.length) * 90) + 10;
      updateStatus(
        "generate",
        generateProgress,
        `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh mới (${
          index + 1
        }/${selectedFrames.length})...`
      );

      // Tạo ảnh mới sử dụng hàm generateGeminiPromptAndImage
      generateGeminiPromptAndImage(framePath)
        .then((result) => {
          if (result && result.url) {
            generatedImages.push(result);
          }

          // Xử lý khung hình tiếp theo
          processedCount++;
          processNextFrame(index + 1);
        })
        .catch((error) => {
          console.error(`Lỗi khi tạo ảnh từ khung hình ${index + 1}:`, error);

          // Hiển thị thông báo lỗi trong modal nhưng tiếp tục xử lý
          updateStatus(
            "generate",
            generateProgress,
            `<i class="fas fa-exclamation-triangle"></i> Khung hình ${
              index + 1
            }: ${error.message}. Đang tiếp tục...`
          );

          // Đặt timeout để hiển thị lỗi trong thời gian ngắn rồi tiếp tục
          setTimeout(() => {
            // Mặc dù có lỗi, vẫn tiếp tục xử lý khung hình tiếp theo
            processedCount++;
            processNextFrame(index + 1);
          }, 2000);
        });
    }

    // Bắt đầu xử lý khung hình từ đầu tiên
    processNextFrame(0);
  }

  // Hàm tạo ảnh mới từ khung hình sử dụng Gemini và Leonardo
  function generateGeminiPromptAndImage(framePath) {
    return new Promise((resolve, reject) => {
      console.log("Processing frame:", framePath);

      // Đầu tiên gọi API tạo prompt từ Gemini
      fetch("/generate-gemini-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyframe_path: framePath,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Lỗi HTTP: ${response.status} - ${response.statusText}`
            );
          }
          // Kiểm tra content-type để đảm bảo là JSON
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error(
              `Phản hồi không hợp lệ: content-type ${contentType}`
            );
          }
          return response.json().then((data) => {
            if (!data.success) {
              throw new Error(data.error || "Lỗi khi tạo prompt với Gemini");
            }
            console.log(
              "Successfully generated prompt:",
              data.prompt.substring(0, 50) + "..."
            );
            return data;
          });
        })
        .then((data) => {
          const prompt = data.prompt;

          // Tiếp theo gọi API tạo ảnh với Leonardo
          return fetch("/generate-leonardo-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: prompt,
            }),
          });
        })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Lỗi HTTP: ${response.status} - ${response.statusText}`
            );
          }
          // Kiểm tra content-type để đảm bảo là JSON
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error(
              `Phản hồi không hợp lệ: content-type ${contentType}`
            );
          }
          return response.json().then((data) => {
            if (!data.success) {
              throw new Error(data.error || "Lỗi khi tạo ảnh với Leonardo");
            }
            return data;
          });
        })
        .then((data) => {
          const generationId = data.generation_id;

          // Hàm kiểm tra trạng thái tạo ảnh
          function checkImageStatus() {
            return fetch(`/get-leonardo-image/${generationId}`)
              .then((response) => {
                // Kiểm tra nếu response không OK (như 404, 500, v.v.)
                if (!response.ok) {
                  throw new Error(
                    `Lỗi HTTP: ${response.status} - ${response.statusText}`
                  );
                }
                // Kiểm tra content-type để đảm bảo là JSON
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                  throw new Error(
                    `Phản hồi không hợp lệ: content-type ${contentType}`
                  );
                }
                return response.json();
              })
              .then((result) => {
                if (result.success) {
                  if (result.complete) {
                    // Ảnh đã được tạo thành công
                    return {
                      url: result.images[0].url,
                      prompt: result.prompt,
                    };
                  } else {
                    // Ảnh đang được tạo, đợi và kiểm tra lại
                    return new Promise((resolve) => {
                      setTimeout(() => {
                        resolve(checkImageStatus());
                      }, 3000); // Kiểm tra lại sau 3 giây
                    });
                  }
                } else {
                  throw new Error(
                    result.error || "Không thể kiểm tra trạng thái tạo ảnh"
                  );
                }
              });
          }

          // Bắt đầu kiểm tra trạng thái
          return checkImageStatus();
        })
        .then((imageData) => {
          resolve(imageData);
        })
        .catch((error) => {
          console.error("Lỗi trong quá trình tạo ảnh:", error);
          // Ghi log chi tiết hơn để giúp gỡ lỗi
          if (error.stack) {
            console.debug("Stack trace:", error.stack);
          }

          // Chuẩn bị thông báo lỗi cho người dùng
          let errorMessage = error.message || "Lỗi không xác định";

          // Một số lỗi có thể cần xử lý đặc biệt
          if (errorMessage.includes("404")) {
            errorMessage =
              "Không tìm thấy API endpoint. Vui lòng kiểm tra cài đặt server.";
          } else if (errorMessage.includes("content-type")) {
            errorMessage =
              "Server trả về định dạng không hợp lệ. Vui lòng kiểm tra API.";
          }

          reject(new Error(errorMessage));
        });
    });
  }

  // Add event listener for the auto process button
  const autoProcessBtn = document.getElementById("auto-process-btn");
  if (autoProcessBtn) {
    // Hide the button initially
    autoProcessBtn.parentElement.style.display = "none";

    // KHÔNG thêm event listener ở đây vì đã được thêm trong displayResults và displayAzureResults
  }

  // Hàm tạo lại ảnh trong hàng đợi
  function regenerateQueueImage(index) {
    if (index < 0 || index >= imageQueue.length) {
      showToast("Không tìm thấy ảnh trong hàng đợi");
      return;
    }

    const imageData = imageQueue[index];
    showToast("Đang tạo lại ảnh...");

    // Lấy phần tử ảnh cần tạo lại trong giao diện
    const queueImageItem = document.querySelector(
      `.queue-image-item[data-index="${index}"]`
    );
    if (!queueImageItem) {
      showToast("Không tìm thấy phần tử ảnh trong giao diện");
      return;
    }

    // Lấy thẻ img để thay đổi
    const imgElement = queueImageItem.querySelector("img");
    if (!imgElement) {
      showToast("Không tìm thấy ảnh để tạo lại");
      return;
    }

    // Lưu URL ảnh gốc để phục hồi nếu có lỗi
    const originalImageUrl = imgElement.src;

    // Hiển thị hiệu ứng loading trên ảnh
    const imageContainer = queueImageItem.querySelector(
      ".queue-image-container"
    );
    imageContainer.innerHTML = `
      <div class="loading-image-overlay">
        <i class="fas fa-sync-alt fa-spin"></i>
        <p>Đang tạo lại ảnh...</p>
      </div>
      <img src="${originalImageUrl}" alt="Đang tạo lại ảnh" style="opacity: 0.3;">
    `;

    // Vô hiệu hóa nút tạo lại
    const regenerateBtn = queueImageItem.querySelector(
      ".regenerate-queue-image-btn"
    );
    if (regenerateBtn) {
      regenerateBtn.disabled = true;
      regenerateBtn.innerHTML =
        '<i class="fas fa-sync-alt fa-spin"></i> Đang tạo lại';
    }

    // Sử dụng Gemini để tạo prompt mới
    fetch("/generate-new-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        original_prompt: imageData.prompt,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Không thể tạo prompt mới");
        }

        // Cập nhật loading message
        const loadingOverlay = imageContainer.querySelector(
          ".loading-image-overlay"
        );
        if (loadingOverlay) {
          loadingOverlay.innerHTML = `
          <i class="fas fa-sync-alt fa-spin"></i>
          <p>Đã tạo prompt mới, đang tạo ảnh...</p>
        `;
        }

        // Tạo ảnh mới với prompt đã cập nhật
        return fetch("/generate-leonardo-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: data.prompt,
          }),
        });
      })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Không thể tạo ảnh mới");
        }

        const generationId = data.generation_id;

        // Hàm kiểm tra trạng thái tạo ảnh
        function checkImageStatus() {
          return fetch(`/get-leonardo-image/${generationId}`)
            .then((response) => response.json())
            .then((result) => {
              if (result.success) {
                if (result.complete) {
                  // Cập nhật ảnh trong hàng đợi
                  imageQueue[index].url = result.images[0].url;
                  imageQueue[index].prompt = result.prompt;
                  imageQueue[index].timestamp = Date.now();

                  // Cập nhật giao diện với ảnh mới
                  imageContainer.innerHTML = `<img src="${
                    result.images[0].url
                  }" alt="Ảnh ${index + 1}" loading="lazy">`;

                  // Khôi phục lại nút tạo lại
                  if (regenerateBtn) {
                    regenerateBtn.disabled = false;
                    regenerateBtn.innerHTML =
                      '<i class="fas fa-sync-alt"></i> Tạo lại';
                  }

                  // Hiển thị thông báo thành công
                  showToast("Đã tạo lại ảnh thành công!");

                  return result;
                } else {
                  // Cập nhật tiến trình
                  const progress = Math.round(result.progress || 0);
                  const loadingOverlay = imageContainer.querySelector(
                    ".loading-image-overlay"
                  );
                  if (loadingOverlay) {
                    loadingOverlay.innerHTML = `
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <p>Đang tạo ảnh... ${progress}%</p>
                    <div class="progress-bar-small">
                      <div class="progress-fill" style="width:${progress}%"></div>
                    </div>
                  `;
                  }

                  // Ảnh đang được tạo, đợi và kiểm tra lại
                  return new Promise((resolve) => {
                    setTimeout(() => {
                      resolve(checkImageStatus());
                    }, 3000); // Kiểm tra lại sau 3 giây
                  });
                }
              } else {
                throw new Error(
                  result.error || "Không thể kiểm tra trạng thái tạo ảnh"
                );
              }
            });
        }

        // Bắt đầu kiểm tra trạng thái
        return checkImageStatus();
      })
      .catch((error) => {
        console.error("Lỗi khi tạo lại ảnh:", error);

        // Khôi phục lại ảnh gốc trong trường hợp lỗi
        imageContainer.innerHTML = `<img src="${originalImageUrl}" alt="Ảnh ${
          index + 1
        }" loading="lazy">`;

        // Khôi phục lại nút tạo lại
        if (regenerateBtn) {
          regenerateBtn.disabled = false;
          regenerateBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Tạo lại';
        }

        // Hiển thị thông báo lỗi
        showToast(`Lỗi: ${error.message}`);
      });
  }
});
