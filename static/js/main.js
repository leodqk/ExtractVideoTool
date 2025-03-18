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
  const tiktokUrlInput = document.getElementById("tiktok-url");
  const extractAudioCheckbox = document.getElementById("extract-audio");
  const detectDuplicatesCheckbox = document.getElementById("detect-duplicates");
  const differenceThresholdSlider = document.getElementById(
    "difference-threshold"
  );
  const differenceThresholdValue = document.getElementById(
    "difference-threshold-value"
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

  let selectedFile = null;
  let currentSessionId = null;
  let selectedMethod = "method1";
  let activeUploadMethod = "file-upload";
  let keyframesData = []; // Lưu trữ dữ liệu khung hình
  let differenceThreshold = 0.3; // Ngưỡng độ khác biệt mặc định

  // Update threshold value display
  thresholdSlider.addEventListener("input", function () {
    thresholdValue.textContent = this.value;
  });

  // Update difference threshold value display
  if (differenceThresholdSlider) {
    differenceThresholdSlider.addEventListener("input", function () {
      differenceThresholdValue.textContent = this.value;
      differenceThreshold = parseFloat(this.value);
    });
  }

  // Update temperature value display
  scriptTemperatureSlider.addEventListener("input", function () {
    temperatureValue.textContent = this.value;
  });

  // Thêm sự kiện cho nút áp dụng ngưỡng
  if (applyThresholdBtn) {
    applyThresholdBtn.addEventListener("click", function () {
      if (!currentSessionId) {
        alert("Vui lòng xử lý video trước khi áp dụng ngưỡng mới");
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

  // Hàm để áp dụng ngưỡng độ khác biệt
  function applyDifferenceThreshold() {
    // Hiển thị thông báo đang xử lý
    showToast("Đang phân tích độ khác biệt giữa các khung hình...");

    // Lấy giá trị ngưỡng từ thanh trượt
    const newThreshold = differenceThresholdSlider
      ? parseFloat(differenceThresholdSlider.value)
      : 0.3;

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
          alert("Lỗi: " + (data.error || "Không thể xóa khung hình tương tự"));
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Lỗi khi xóa khung hình tương tự: " + error.message);
      });
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
    } else if (activeUploadMethod === "tiktok-upload") {
      const tiktokUrl = tiktokUrlInput.value.trim();
      if (!tiktokUrl) {
        showError("Vui lòng nhập URL video TikTok");
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

    // Thêm ngưỡng độ khác biệt
    if (differenceThresholdSlider) {
      formData.append("difference_threshold", differenceThresholdSlider.value);
    } else {
      formData.append("difference_threshold", differenceThreshold);
    }

    if (selectedMethod === "method2") {
      formData.append("min_scene_length", minSceneLengthInput.value);
    }

    // Simulate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      if (progressValue < 90) {
        progressValue +=
          Math.random() * (activeUploadMethod !== "file-upload" ? 1 : 4);
        progress.style.width = `${progressValue}%`;
        progressText.textContent = `Đang ${
          activeUploadMethod !== "file-upload" ? "tải video và " : ""
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

        // Store session ID and keyframes data
        currentSessionId = data.session_id;
        keyframesData = data.keyframes || [];

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

    if (similarityNotification) {
      similarityNotification.style.display = "none";
    }

    // Store keyframes data globally
    keyframesData = data.keyframes || [];

    // Display video info
    const minutes = Math.floor(data.duration / 60);
    const seconds = Math.round(data.duration % 60);

    // Check if video is from an online source
    const isYouTube = data.video_source === "YouTube";
    const isTikTok = data.video_source === "TikTok";

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
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 8v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8a5 5 0 015-5h8a5 5 0 015 5z"></path>
                          <path d="M10 12a3 3 0 103 3V6c.333 1 1.6 3 4 3"></path>
                      </svg>
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

    // Display method info
    if (data.method === "frame_difference") {
      methodInfo.innerHTML = `
              <h4>Phương pháp trích xuất</h4>
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

    // Display transcript if available
    if (data.transcript && data.transcript.text) {
      transcriptSection.style.display = "block";

      // Format transcript with timestamps if available
      const transcriptHTML = `
        <div class="transcript-text">
          <p>${data.transcript.text}</p>
        </div>
        <div class="transcript-actions">
          <button id="download-transcript-btn">Tải xuống phiên âm</button>
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
          <p><strong>Lỗi khi xử lý âm thanh:</strong> ${data.audio_error}</p>
        </div>
      `;
    } else {
      transcriptSection.style.display = "none";
    }

    // Display keyframes
    keyframesGallery.innerHTML = "";

    if (data.keyframes && data.keyframes.length > 0) {
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

      data.keyframes.forEach((frame) => {
        const timeString = formatTime(frame.timestamp);

        const keyframeElement = document.createElement("div");
        keyframeElement.className = "keyframe";
        if (frame.is_similar) {
          keyframeElement.classList.add("similar-frame");
        }
        keyframeElement.dataset.frameId = frame.id;

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

        // Thêm nhãn độ tương đồng nếu cần
        if (frame.is_similar && frame.similarity !== undefined) {
          labelHTML += `<div class="similarity-label">Tương tự (${Math.round(
            frame.similarity * 100
          )}%)</div>`;
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
                          ${
                            frame.is_similar && frame.similarity !== undefined
                              ? `<span>Độ tương đồng: ${(
                                  frame.similarity * 100
                                ).toFixed(0)}%</span>`
                              : ""
                          }
                      </div>
                      <div class="keyframe-actions">
                        <button class="generate-image-btn" data-frame-path="${
                          frame.path
                        }">Tạo ảnh mới</button>
                        <button class="delete-frame-btn" data-frame-path="${
                          frame.path
                        }" data-frame-id="${frame.id}">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      </div>
                  </div>
              `;

        // Add click event to open full image
        keyframeElement
          .querySelector("img")
          .addEventListener("click", function () {
            window.open(imagePath, "_blank");
          });

        // Add click event for generate image button
        keyframeElement
          .querySelector(".generate-image-btn")
          .addEventListener("click", function () {
            const framePath = this.dataset.framePath;
            showImageGenerationModal(framePath);
          });

        // Add click event for delete button
        keyframeElement
          .querySelector(".delete-frame-btn")
          .addEventListener("click", function () {
            const framePath = this.dataset.framePath;
            const frameId = this.dataset.frameId;
            deleteKeyframe(framePath, frameId);
          });

        keyframesGallery.appendChild(keyframeElement);
      });
    } else {
      keyframesGallery.innerHTML =
        '<p class="no-frames">Không có khung hình nào được trích xuất.</p>';
    }
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

            // Hiển thị thông báo
            showToast("Đã xóa khung hình thành công");
          }
        } else {
          alert("Lỗi: " + (data.error || "Không thể xóa khung hình"));
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Lỗi khi xóa khung hình: " + error.message);
      });
  }

  // Show toast notification
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    // Show the toast
    setTimeout(() => {
      toast.classList.add("show");
    }, 100);

    // Hide and remove the toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
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
        alert("Lỗi khi tải phiên âm: " + error.message);
      });
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
      <h3>Tạo ảnh mới từ khung hình</h3>
      <button class="close-btn">&times;</button>
    </div>
    <div class="modal-body">
      <div class="image-preview">
        <img src="/static/${framePath}" alt="Khung hình gốc">
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
      <button id="generate-btn" data-frame-path="${framePath}">Tạo ảnh</button>
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
        alert("Vui lòng nhập mô tả cho ảnh mới");
        return;
      }

      // Close modal and show loading
      document.body.removeChild(modalOverlay);

      // Show generated images section with loading
      generatedImagesSection.style.display = "block";
      generatedImagesSection.innerHTML = `
      <h3>Ảnh được tạo ra</h3>
      <div class="loading-container">
        <p>Đang tạo ảnh mới, vui lòng đợi...</p>
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
      <h3>Ảnh được tạo ra</h3>
      <div class="error-message">
        <p><strong>Lỗi khi tạo ảnh mới:</strong> ${error.message}</p>
        <p>Vui lòng thử lại sau.</p>
      </div>
    `;
      });
  }

  // Display generated images
  function displayGeneratedImages(data) {
    generatedImagesSection.innerHTML = `
    <h3>Ảnh được tạo ra</h3>
    <div class="generation-info">
      <p><strong>Prompt:</strong> ${data.prompt}</p>
      <p><strong>Phong cách:</strong> ${data.style}</p>
    </div>
    <div class="generated-gallery" id="generated-gallery">
      <!-- Generated images will be displayed here -->
    </div>
  `;

    const generatedGallery = document.getElementById("generated-gallery");
    if (data.generated_images && data.generated_images.length > 0) {
      data.generated_images.forEach((image) => {
        const imageElement = document.createElement("div");
        imageElement.className = "generated-image";
        imageElement.dataset.imageId = image.id;

        // Đảm bảo đường dẫn ảnh đúng
        const imagePath = `/static/${image.path}`;

        imageElement.innerHTML = `
        <img src="${imagePath}" alt="Ảnh được tạo" loading="lazy">
        <div class="image-actions">
          <button class="download-image-btn" data-path="${imagePath}">Tải xuống</button>
          <button class="delete-image-btn" data-path="${image.path}" data-image-id="${image.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;

        // Add click event to open full image
        imageElement
          .querySelector("img")
          .addEventListener("click", function () {
            window.open(imagePath, "_blank");
          });

        // Add click event for download button
        imageElement
          .querySelector(".download-image-btn")
          .addEventListener("click", function () {
            const path = this.dataset.path;
            downloadImage(path);
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
    } else {
      generatedGallery.innerHTML =
        '<p class="no-images">Không có ảnh nào được tạo ra.</p>';
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
          alert("Lỗi: " + (data.error || "Không thể xóa ảnh"));
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Lỗi khi xóa ảnh: " + error.message);
      });
  }

  // Download a single image
  function downloadImage(imagePath) {
    const link = document.createElement("a");
    link.href = imagePath;
    link.download = "generated-image-" + Date.now() + ".jpg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    generatedImagesSection.style.display = "none";
    transcriptSection.style.display = "none";
    if (similarityNotification) {
      similarityNotification.style.display = "none";
    }
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
});
