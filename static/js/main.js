document.addEventListener("DOMContentLoaded", function () {
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
  const thresholdSlider = document.getElementById("threshold");
  const thresholdValue = document.getElementById("threshold-value");
  const maxFramesInput = document.getElementById("max-frames");
  const minSceneLengthInput = document.getElementById("min-scene-length");
  const methodOptions = document.querySelectorAll(".method-option");
  const method2Settings = document.querySelectorAll(".method2-setting");
  const uploadTabs = document.querySelectorAll(".upload-tab");
  const uploadContents = document.querySelectorAll(".upload-content");
  const youtubeUrlInput = document.getElementById("youtube-url");
  const scriptSection = document.getElementById("script-section");
  const scriptLoading = document.getElementById("script-loading");
  const scriptContent = document.getElementById("script-content");
  const scriptTemperatureSlider = document.getElementById("script-temperature");
  const temperatureValue = document.getElementById("temperature-value");

  let selectedFile = null;
  let currentSessionId = null;
  let selectedMethod = "method1";
  let activeUploadMethod = "file-upload";

  // Update threshold value display
  thresholdSlider.addEventListener("input", function () {
    thresholdValue.textContent = this.value;
  });

  // Update temperature value display
  scriptTemperatureSlider.addEventListener("input", function () {
    temperatureValue.textContent = this.value;
  });

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

      // Show/hide method-specific settings
      if (selectedMethod === "method2") {
        method2Settings.forEach((setting) => {
          setting.style.display = "flex";
        });
      } else {
        method2Settings.forEach((setting) => {
          setting.style.display = "none";
        });
      }
    });
  });

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
      alert("Vui lòng chọn file video hợp lệ (mp4, avi, mov, mkv, webm)");
      return;
    }

    selectedFile = file;

    // Update UI
    const fileName =
      file.name.length > 30 ? file.name.substring(0, 30) + "..." : file.name;
    uploadArea.innerHTML = `
          <div class="selected-file">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
              <p>${fileName}</p>
          </div>
      `;
  }

  // Extract keyframes
  extractBtn.addEventListener("click", function () {
    // Remove any existing error messages
    const errorMsg = document.querySelector(".error-message");
    if (errorMsg) {
      errorMsg.remove();
    }

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
    }

    // Show progress
    uploadContainer.style.display = "none";
    progressContainer.style.display = "block";

    // Create form data
    const formData = new FormData();

    if (activeUploadMethod === "file-upload") {
      formData.append("video", selectedFile);
    } else {
      formData.append("youtube_url", youtubeUrlInput.value.trim());
    }

    formData.append("method", selectedMethod);
    formData.append("threshold", thresholdSlider.value);
    formData.append("max_frames", maxFramesInput.value);

    if (selectedMethod === "method2") {
      formData.append("min_scene_length", minSceneLengthInput.value);
    }

    // Simulate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      if (progressValue < 90) {
        progressValue +=
          Math.random() * (activeUploadMethod === "youtube-upload" ? 1 : 4);
        progress.style.width = `${progressValue}%`;
        progressText.textContent = `Đang ${
          activeUploadMethod === "youtube-upload" ? "tải video YouTube và " : ""
        }xử lý... ${Math.round(progressValue)}%`;
      }
    }, 500);

    // Send to server
    fetch("/upload", {
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
        // Complete progress
        progress.style.width = "100%";
        progressText.textContent = "Hoàn thành!";

        // Store session ID
        currentSessionId = data.session_id;

        // Show results after a short delay
        setTimeout(() => {
          displayResults(data);
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
    errorDiv.textContent = message;

    // Add to DOM
    if (activeUploadMethod === "file-upload") {
      uploadArea.parentNode.appendChild(errorDiv);
    } else {
      document.querySelector(".youtube-form").appendChild(errorDiv);
    }
  }

  // Display results
  function displayResults(data) {
    progressContainer.style.display = "none";
    resultsSection.style.display = "block";
    scriptSection.style.display = "none";

    // Display video info
    const minutes = Math.floor(data.duration / 60);
    const seconds = Math.round(data.duration % 60);

    // Check if video is from YouTube
    const isYouTube = data.youtube_url !== undefined;

    let videoInfoHTML = `
          <h4>Thông tin video</h4>
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                      </svg>
                  </div>
                  <div>
                      <p><strong>Nguồn:</strong> YouTube</p>
                      ${
                        data.youtube_title
                          ? `<p><strong>Tiêu đề:</strong> ${data.youtube_title}</p>`
                          : ""
                      }
                  </div>
              </div>
          `;
    }

    videoInfo.innerHTML = videoInfoHTML;

    // Display method info
    if (data.method === "frame_difference") {
      methodInfo.innerHTML = `
              <h4>Phương pháp trích xuất</h4>
              <p><strong>Phương pháp:</strong> Phân tích sự thay đổi giữa các khung hình</p>
              <p><strong>Ngưỡng phát hiện:</strong> ${thresholdSlider.value}</p>
              <p><strong>Số khung hình đã trích xuất:</strong> ${data.keyframes.length}</p>
          `;
      scenesInfo.style.display = "none";
    } else {
      methodInfo.innerHTML = `
              <h4>Phương pháp trích xuất</h4>
              <p><strong>Phương pháp:</strong> Phát hiện chuyển cảnh</p>
              <p><strong>Ngưỡng phát hiện:</strong> ${thresholdSlider.value}</p>
              <p><strong>Độ dài tối thiểu cảnh:</strong> ${
                minSceneLengthInput.value
              } frames</p>
              <p><strong>Số cảnh đã phát hiện:</strong> ${
                data.scenes ? data.scenes.length : 0
              }</p>
          `;

      // Display scenes info
      if (data.scenes && data.scenes.length > 0) {
        let sceneListHTML = "";
        data.scenes.forEach((scene, index) => {
          const startTime = formatTime(scene.start / data.fps);
          const endTime = formatTime(scene.end / data.fps);
          sceneListHTML += `
                      <div class="scene-item">
                          <strong>Cảnh ${index + 1}:</strong> 
                          Từ ${startTime} đến ${endTime} 
                          (${scene.length} frames)
                      </div>
                  `;
        });

        scenesInfo.innerHTML = `
                  <div class="scenes-summary">Đã phát hiện ${data.scenes.length} cảnh trong video</div>
                  <div class="scene-list">${sceneListHTML}</div>
              `;
        scenesInfo.style.display = "block";
      } else {
        scenesInfo.style.display = "none";
      }
    }

    // Display keyframes
    keyframesGallery.innerHTML = "";

    if (data.keyframes && data.keyframes.length > 0) {
      data.keyframes.forEach((frame) => {
        const timeString = formatTime(frame.timestamp);

        const keyframeElement = document.createElement("div");
        keyframeElement.className = "keyframe";

        let labelHTML = "";
        if (data.method === "scene_detection" && frame.scene_id !== undefined) {
          labelHTML = `<div class="scene-label">Cảnh ${frame.scene_id}</div>`;
        } else if (
          data.method === "frame_difference" &&
          frame.diff_value !== undefined
        ) {
          labelHTML = `<div class="diff-label">${Math.round(
            frame.diff_value
          )}</div>`;
        }

        // Đảm bảo đường dẫn ảnh đúng
        const imagePath = `/static/${frame.path}`;

        keyframeElement.innerHTML = `
                  ${labelHTML}
                  <img src="${imagePath}" alt="Khung hình ${
          frame.frame_number
        }" loading="lazy">
                  <div class="keyframe-info">
                      <p><strong>Thời điểm:</strong> ${timeString}</p>
                      <div class="keyframe-meta">
                          <span>Frame #${frame.frame_number}</span>
                          ${
                            data.method === "scene_detection"
                              ? `<span>Cảnh #${frame.scene_id}</span>`
                              : `<span>Độ khác biệt: ${
                                  frame.diff_value
                                    ? frame.diff_value.toFixed(2)
                                    : "N/A"
                                }</span>`
                          }
                      </div>
                  </div>
              `;

        // Add click event to open full image
        keyframeElement.addEventListener("click", function () {
          window.open(imagePath, "_blank");
        });

        keyframesGallery.appendChild(keyframeElement);
      });
    } else {
      keyframesGallery.innerHTML =
        '<p class="no-frames">Không có khung hình nào được trích xuất.</p>';
    }
  }

  // Format time (seconds to MM:SS)
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs < 10 ? "0" + secs : secs}`;
  }

  // Extract script from keyframes
  extractScriptBtn.addEventListener("click", function () {
    if (!currentSessionId) {
      alert("Không có dữ liệu khung hình để phân tích");
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

    // Gửi request đến server
    fetch("/generate-script", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        temperature: temperature,
      }),
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
        const scriptHTML = `
              <p><strong>Phân tích ${
                data.num_frames_analyzed
              } khung hình</strong> (Temperature: ${data.temperature})</p>
              <div class="script-prompt">
                  <em>Prompt: "${data.prompt}"</em>
              </div>
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
                  <p><strong>Lỗi khi trích xuất kịch bản:</strong> ${error.message}</p>
                  <p>Vui lòng thử lại sau.</p>
              </div>
          `;
      });
  });

  // Hàm format kịch bản để hiển thị đẹp hơn
  function formatScriptText(text) {
    // Thay thế xuống dòng bằng thẻ <p>
    let formatted = text.replace(/\n\n/g, "</p><p>");

    // Làm nổi bật các phần quan trọng
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

    return `<p>${formatted}</p>`;
  }

  // Download all keyframes
  downloadAllBtn.addEventListener("click", function () {
    if (!currentSessionId) return;

    fetch(`/download/${currentSessionId}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.files && data.files.length > 0) {
          // Create a zip file using JSZip (would need to include the library)
          // For simplicity, we'll just open all images in new tabs
          data.files.forEach((file, index) => {
            setTimeout(() => {
              window.open(`/static/${file}`, "_blank");
            }, index * 100);
          });
        } else {
          alert("Không có khung hình nào để tải xuống");
        }
      })
      .catch((error) => {
        console.error("Error downloading files:", error);
        alert("Lỗi khi tải xuống các khung hình");
      });
  });

  // Process new video
  newVideoBtn.addEventListener("click", function () {
    // Reset UI
    resultsSection.style.display = "none";
    scriptSection.style.display = "none";
    uploadContainer.style.display = "flex";

    // Reset file upload area
    uploadArea.innerHTML = `
          <div class="upload-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
          </div>
          <p>Kéo thả video vào đây hoặc <span class="browse-text">chọn file</span></p>
      `;

    // Reset YouTube input
    youtubeUrlInput.value = "";

    // Reset variables
    selectedFile = null;
    currentSessionId = null;

    // Remove any error messages
    const errorMessages = document.querySelectorAll(".error-message");
    errorMessages.forEach((msg) => msg.remove());
  });
});
