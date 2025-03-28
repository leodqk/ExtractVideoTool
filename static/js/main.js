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
      // Ghi log thông tin keyframe nếu có
      if (imageData.keyframe) {
        console.log(
          "Đã thêm ảnh vào hàng đợi với keyframe:",
          imageData.keyframe
        );
      }
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
  function showImageQueueModal() {
    // Tạo modal
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

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
              ${
                image.keyframe
                  ? `
              <button class="recreate-queue-image-btn" data-index="${index}">
                <i class="fas fa-sync-alt"></i> Tạo lại ảnh
              </button>
              `
                  : ""
              }
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
      if (confirm("Bạn có chắc chắn muốn hủy quá trình tự động thao tác?")) {
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
      const recreateBtns = modal.querySelectorAll(".recreate-queue-image-btn");
      recreateBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.dataset.index);
          const image = imageQueue[index];

          if (image.keyframe) {
            // Hiển thị loading overlay trên ảnh
            const imageItem = btn.closest(".queue-image-item");
            const imgContainer = imageItem.querySelector(
              ".queue-image-container"
            );

            // Thêm lớp loading và loading spinner
            imgContainer.classList.add("loading");
            const loadingOverlay = document.createElement("div");
            loadingOverlay.className = "image-loading-overlay";
            loadingOverlay.innerHTML =
              '<i class="fas fa-spinner fa-spin"></i><p>Đang tạo lại ảnh...</p>';
            imgContainer.appendChild(loadingOverlay);

            // Disable button khi đang xử lý
            btn.disabled = true;
            btn.innerHTML =
              '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

            // Lấy đường dẫn keyframe
            const keyframePath =
              typeof image.keyframe === "string"
                ? image.keyframe
                : image.keyframe.path;

            // Tạo ảnh mới từ keyframe này
            generateGeminiPromptAndImage(keyframePath)
              .then((result) => {
                if (result && result.url) {
                  // Cập nhật ảnh trong hàng đợi
                  image.url = result.url;
                  image.prompt = result.prompt;
                  image.timestamp = Date.now();

                  // Cập nhật ảnh hiển thị
                  const imgElement = imgContainer.querySelector("img");
                  imgElement.src = result.url;

                  // Hiển thị toast thành công
                  showToast("Đã tạo lại ảnh thành công!");
                }
              })
              .catch((error) => {
                console.error("Lỗi khi tạo lại ảnh:", error);
                showToast("Lỗi khi tạo lại ảnh: " + error.message);
              })
              .finally(() => {
                // Xóa loading overlay
                imgContainer.classList.remove("loading");
                if (loadingOverlay && loadingOverlay.parentNode) {
                  loadingOverlay.parentNode.removeChild(loadingOverlay);
                }

                // Khôi phục nút
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Tạo lại ảnh';
              });
          } else {
            showToast(
              "Không thể tạo lại ảnh này vì không có thông tin khung hình gốc"
            );
          }
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
          showImageQueueModal(); // Hiển thị lại modal
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

      // Get the basic parameters section by finding the h4 with "Tham số cơ bản" text
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
        // Show basic params for method2
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
      } else if (selectedMethod === "method3") {
        method3Settings.forEach((setting) => {
          setting.style.display = "block";
        });
        // Show basic params for method3
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
      } else if (selectedMethod === "azure") {
        azureSettings.forEach((setting) => {
          setting.style.display = "block";
        });
        // Hide basic params for azure
        if (basicParamsSection) {
          basicParamsSection.style.display = "none";
        }

        // Load saved Azure credentials if available
        loadAzureCredentials();
      } else {
        // For method1 or any other method, show basic params
        if (basicParamsSection) {
          basicParamsSection.style.display = "block";
        }
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

    // Display video info
    videoInfo.innerHTML = `
      <div class="video-details">
        <h3>${data.filename || "Video"}</h3>
        <p>
          <i class="fas fa-clock"></i> Thời lượng: ${minutes}:${seconds
      .toString()
      .padStart(2, "0")} | <i class="fas fa-film"></i> ${
      data.total_frames
    } khung hình | <i class="fas fa-video"></i> ${data.width}x${
      data.height
    } | <i class="fas fa-tachometer-alt"></i> ${data.fps.toFixed(2)} FPS
        </p>
        ${
          isYouTube || isTikTok
            ? `<p><i class="fas fa-link"></i> Nguồn: <a href="${
                data.video_url
              }" target="_blank">${data.video_title || data.video_url}</a></p>`
            : ""
        }
      </div>
    `;

    // Display method info
    methodInfo.innerHTML = `
      <div class="method-details">
        <h3>Phương pháp trích xuất</h3>
        <p>
          <i class="fas fa-cog"></i> Phương pháp: ${
            data.method === "frame_difference"
              ? "Dựa trên độ khác biệt"
              : data.method === "scene_detection"
              ? "Dựa trên phát hiện cảnh"
              : "Dựa trên phát hiện transition"
          }
        </p>
        <p>
          <i class="fas fa-sliders-h"></i> Ngưỡng: ${
            data.threshold || 30
          } | <i class="fas fa-image"></i> Số khung hình: ${
      data.keyframes.length
    }
        </p>
      </div>
    `;

    // Clear previous results
    keyframesGallery.innerHTML = "";

    // Display keyframes
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
          const frameId = keyframeElement.dataset.frameId;
          const keyframeInfo = keyframesData.find(
            (frame) => frame.id === frameId
          );

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
                keyframe: keyframeInfo,
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

    // Display video info
    videoInfo.innerHTML = `
      <div class="video-details">
        <h3>${data.video_name || "Video"}</h3>
        <p>
          <i class="fas fa-film"></i> Số shots: ${data.shots.length}
        </p>
      </div>
    `;

    // Clear previous results
    keyframesGallery.innerHTML = "";

    // Display shots
    if (data.shots && data.shots.length > 0) {
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
            const frameId = keyframeElement.dataset.frameId;
            const keyframeInfo = keyframesData.find(
              (frame) => frame.id === frameId
            );

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
                // Find the keyframe info if this image was generated from a keyframe
                let keyframeInfo = null;
                if (image.keyframe) {
                  keyframeInfo = image.keyframe;
                } else if (image.source_keyframe) {
                  keyframeInfo = image.source_keyframe;
                }

                addToImageQueue({
                  url: imgSrc,
                  prompt: data.prompt,
                  timestamp: Date.now(),
                  keyframe: keyframeInfo,
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
            // Find the corresponding keyframe if this image was generated from a keyframe
            const correspondingKeyframe =
              image.keyframe || image.sourceKeyframe;

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
            // Ensure we have a reference to the original keyframe
            const keyframeInfo = image.sourceKeyframe || image.keyframe;

            addToImageQueue({
              url: image.url,
              prompt: image.prompt,
              timestamp: Date.now(),
              order: idx,
              keyframe: keyframeInfo,
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
                showImageQueueModal();
              }, 1500);
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
            generatedImages.push({
              ...result,
              keyframe: framePath,
              sourceKeyframe: keyframesData.find(
                (frame) =>
                  frame.path === framePath ||
                  normalizeImagePath(frame.path) === framePath
              ),
            });
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

  // Kiểm tra phương pháp được chọn khi tải trang
  const activeMethod = document.querySelector(".method-option.active");
  if (activeMethod && activeMethod.dataset.method === "azure") {
    // Get the basic parameters section by finding the h4 with "Tham số cơ bản" text
    const basicParamsHeading = Array.from(document.querySelectorAll("h4")).find(
      (h4) => h4.textContent.trim() === "Tham số cơ bản"
    );
    const basicParamsSection = basicParamsHeading
      ? basicParamsHeading.closest(".setting-group")
      : null;

    if (basicParamsSection) {
      basicParamsSection.style.display = "none";
    }
  }

  // Add CSS for the new section
  const style = document.createElement("style");
  style.textContent = `
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
  `;
  document.head.appendChild(style);

  // Batch image processing elements
  const batchBrowseBtn = document.getElementById("batch-browse-btn");
  const imageBatchInput = document.getElementById("image-batch-input");
  const selectedFilesInfo = document.getElementById("selected-files-info");
  const selectedFilesCount = document.getElementById("selected-files-count");
  const clearSelectionBtn = document.getElementById("clear-selection-btn");
  const geminiPromptInput = document.getElementById("gemini-prompt");
  const processImagesBtn = document.getElementById("process-images-btn");
  const batchProgressContainer = document.getElementById(
    "batch-progress-container"
  );
  const batchProgress = document.getElementById("batch-progress");
  const batchProgressText = document.getElementById("batch-progress-text");
  const batchResultsSection = document.getElementById("batch-results-section");
  const batchResultsGallery = document.getElementById("batch-results-gallery");
  const totalProcessedCount = document.getElementById("total-processed-count");
  const successCount = document.getElementById("success-count");
  const failedCount = document.getElementById("failed-count");
  const downloadAllResultsBtn = document.getElementById(
    "download-all-results-btn"
  );
  const processNewBatchBtn = document.getElementById("process-new-batch-btn");

  let selectedBatchFiles = [];
  let batchSessionId = null;
  let batchResults = [];

  // Initialize batch image processing functionality
  function initBatchImageProcessing() {
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

    // Handle browse button click
    if (batchBrowseBtn) {
      batchBrowseBtn.addEventListener("click", function () {
        imageBatchInput.click();
      });
    }

    // Handle file selection
    if (imageBatchInput) {
      imageBatchInput.addEventListener("change", function (e) {
        handleBatchFileSelection(e.target.files);
      });
    }

    // Handle clear selection button
    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener("click", function () {
        clearBatchSelection();
      });
    }

    // Handle prompt input change - lưu prompt vào localStorage
    if (geminiPromptInput) {
      geminiPromptInput.addEventListener("input", function () {
        // Lưu prompt vào localStorage mỗi khi thay đổi
        localStorage.setItem("geminiPrompt", geminiPromptInput.value);
        validateBatchForm();
      });
    }

    // Handle process button click
    if (processImagesBtn) {
      processImagesBtn.addEventListener("click", function () {
        processBatchImages();
      });
    }

    // Handle download all results button
    if (downloadAllResultsBtn) {
      downloadAllResultsBtn.addEventListener("click", function () {
        downloadAllBatchResults();
      });
    }

    // Handle download text only button
    const downloadTextOnlyBtn = document.getElementById(
      "download-text-only-btn"
    );
    if (downloadTextOnlyBtn) {
      downloadTextOnlyBtn.addEventListener("click", function () {
        downloadBatchResultsText();
      });
    }

    // Handle process new batch button
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

  // Function to process a compressed file and extract images
  function processCompressedFile(file) {
    return new Promise((resolve, reject) => {
      const zip = new JSZip();
      const reader = new FileReader();

      reader.onload = function (e) {
        // Load the archive content
        zip
          .loadAsync(e.target.result)
          .then(function (archive) {
            const extractedImages = [];
            const imageMimeTypes = {
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              bmp: "image/bmp",
              webp: "image/webp",
            };

            // Get all entries (files and folders)
            const entries = [];
            archive.forEach((relativePath, zipEntry) => {
              entries.push(zipEntry);
            });

            // Track the number of pending file extractions
            let pendingExtractions = 0;

            // Look for image files
            entries.forEach((zipEntry) => {
              if (!zipEntry.dir) {
                const extension = zipEntry.name.split(".").pop().toLowerCase();
                if (imageMimeTypes[extension]) {
                  pendingExtractions++;

                  // Extract the file content
                  zipEntry
                    .async("blob")
                    .then((blob) => {
                      // Convert blob to File object with appropriate type
                      const imageFile = new File(
                        [blob],
                        zipEntry.name.split("/").pop(),
                        { type: imageMimeTypes[extension] }
                      );

                      extractedImages.push(imageFile);

                      pendingExtractions--;
                      if (pendingExtractions === 0) {
                        resolve(extractedImages);
                      }
                    })
                    .catch((error) => {
                      console.error(
                        `Error extracting ${zipEntry.name}:`,
                        error
                      );
                      pendingExtractions--;
                      if (pendingExtractions === 0) {
                        resolve(extractedImages);
                      }
                    });
                }
              }
            });

            // If no image files found to extract
            if (pendingExtractions === 0) {
              resolve(extractedImages);
            }
          })
          .catch(function (error) {
            reject(error);
          });
      };

      reader.onerror = function (error) {
        reject(error);
      };

      // Read the file as an ArrayBuffer
      reader.readAsArrayBuffer(file);
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

  // Process batch images
  function processBatchImages() {
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
      fetch("/process-images-gemini", {
        method: "POST",
        body: formData,
      })
        .then((response) => response.json())
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
    const successCount = results.filter((r) => r.success).length;
    const failedCount = totalCount - successCount;

    totalProcessedCount.textContent = totalCount;
    successCount.textContent = successCount;
    failedCount.textContent = failedCount;

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
      `Đã xử lý ${totalCount} ảnh: ${successCount} thành công, ${failedCount} thất bại`
    );
  }

  // Download all batch results
  function downloadAllBatchResults() {
    if (!batchSessionId) {
      showToast("Không có kết quả để tải xuống");
      return;
    }

    console.log("Tải xuống kết quả với session ID:", batchSessionId);

    // Hiển thị thông báo đang tải
    showToast("Đang chuẩn bị tập tin tải xuống...");

    // Thực hiện yêu cầu tải xuống
    fetch(`/download-gemini-results/${batchSessionId}`)
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
        return response.blob();
      })
      .then((blob) => {
        // Tạo URL và tải xuống
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `gemini_results_${batchSessionId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast(
          "Đã tải xuống tập tin chứa tất cả ảnh và file prompt thành công"
        );
      })
      .catch((error) => {
        console.error("Lỗi khi tải xuống:", error);
        showToast(`Lỗi khi tải xuống: ${error.message}`);
      });
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

  // Initialize batch image processing
  initBatchImageProcessing();

  // Download batch results as a single text file
  function downloadBatchResultsText() {
    if (!batchSessionId) {
      showToast("Không có kết quả để tải xuống");
      return;
    }

    console.log("Tải xuống kết quả dạng text với session ID:", batchSessionId);

    // Hiển thị thông báo đang tải
    showToast("Đang chuẩn bị file prompt...");

    // Thực hiện yêu cầu tải xuống
    fetch(`/download-gemini-results-text/${batchSessionId}`)
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
        return response.blob();
      })
      .then((blob) => {
        // Tạo URL và tải xuống
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `prompts_${batchSessionId}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast("Đã tải xuống file prompt thành công");
      })
      .catch((error) => {
        console.error("Lỗi khi tải xuống file text:", error);
        showToast(`Lỗi khi tải xuống: ${error.message}`);
      });
  }

  // Lắng nghe sự kiện cho các tab tải lên
  uploadTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      // Loại bỏ class active từ tất cả tab
      uploadTabs.forEach(function (t) {
        t.classList.remove("active");
      });

      // Thêm class active cho tab được chọn
      this.classList.add("active");

      // Lấy data-tab để xác định nội dung nào hiển thị
      const tabId = this.getAttribute("data-tab");

      // Ẩn tất cả nội dung tải lên
      uploadContents.forEach(function (content) {
        content.style.display = "none";
      });

      // Hiển thị nội dung tương ứng
      document.getElementById(tabId).style.display = "block";

      // Cập nhật biến theo dõi phương pháp tải lên đang được chọn
      activeUploadMethod = tabId;

      // Cập nhật UI dựa trên tab được chọn
      updateUIForSelectedTab(tabId);
    });
  });

  // Cập nhật UI dựa trên tab được chọn
  function updateUIForSelectedTab(tabId) {
    // Hiển thị/ẩn các phần UI dựa trên tab
    const videoMethodSelection = document.querySelector(".method-selection");
    const videoSettings = document.getElementById("video-processing-settings");
    const extractBtn = document.getElementById("extract-btn");

    if (tabId === "batch-images-upload") {
      // Nếu là tab xử lý batch ảnh, ẩn các phần liên quan đến video
      videoMethodSelection.style.display = "none";
      videoSettings.style.display = "none";
      extractBtn.style.display = "none";
    } else {
      // Nếu là các tab video, hiển thị các phần liên quan
      videoMethodSelection.style.display = "block";
      videoSettings.style.display = "block";
      extractBtn.style.display = "block";
    }
  }

  // Gọi hàm updateUIForSelectedTab ban đầu cho tab đang active
  updateUIForSelectedTab(activeUploadMethod);
});
