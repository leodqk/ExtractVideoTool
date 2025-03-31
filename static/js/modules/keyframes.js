// modules/keyframes.js - Hiển thị và quản lý khung hình

import { debugLog } from "../utils/debug.js";
import { showToast } from "./ui.js";
import { normalizeImagePath, formatTime } from "../utils/pathUtils.js";
import {
  downloadImage,
  downloadImagesAsZip,
} from "../services/downloadService.js";
import { addToImageQueue } from "./imageQueue.js";
import {
  deleteKeyframe,
  analyzeFrameDifferences,
  removeSimilarFrames,
  removeDuplicateFrames,
} from "../services/apiService.js";
import {
  getCurrentSessionId,
  getKeyframesData,
  setKeyframesData,
} from "./extraction.js";

// Các biến toàn cục
let resultsSection, keyframesGallery, videoInfo, methodInfo, scenesInfo;
let downloadAllBtn, extractScriptBtn, newVideoBtn, checkPathsBtn;
let similarityNotification, similarCount, removeSimilarBtn;
let duplicateNotification, duplicateCount, removeDuplicatesBtn;
let differenceThreshold = 0.32;

export function initKeyframes() {
  // Khởi tạo các DOM elements
  resultsSection = document.getElementById("results-section");
  keyframesGallery = document.getElementById("keyframes-gallery");
  videoInfo = document.getElementById("video-info");
  methodInfo = document.getElementById("method-info");
  scenesInfo = document.getElementById("scenes-info");
  downloadAllBtn = document.getElementById("download-all-btn");
  extractScriptBtn = document.getElementById("extract-script-btn");
  newVideoBtn = document.getElementById("new-video-btn");
  checkPathsBtn = document.getElementById("check-paths-btn");
  similarityNotification = document.getElementById("similarity-notification");
  similarCount = document.getElementById("similar-count");
  removeSimilarBtn = document.getElementById("remove-similar-btn");
  duplicateNotification = document.getElementById("duplicate-notification");
  duplicateCount = document.getElementById("duplicate-count");
  removeDuplicatesBtn = document.getElementById("remove-duplicates-btn");

  // Khởi tạo các sự kiện
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener("click", handleDownloadAll);
  }

  if (extractScriptBtn) {
    extractScriptBtn.addEventListener("click", handleExtractScript);
  }

  if (newVideoBtn) {
    newVideoBtn.addEventListener("click", handleNewVideo);
  }

  if (checkPathsBtn) {
    checkPathsBtn.addEventListener("click", checkAllImagePaths);
  }

  if (removeSimilarBtn) {
    removeSimilarBtn.addEventListener("click", function () {
      const similarFrames = getKeyframesData().filter(
        (frame) => frame.is_similar === true
      );
      if (similarFrames.length > 0) {
        removeSimilarFrames(getCurrentSessionId(), similarFrames);
      }
    });
  }

  if (removeDuplicatesBtn) {
    removeDuplicatesBtn.addEventListener("click", function () {
      const duplicateFrames = getKeyframesData().filter(
        (frame) => frame.is_duplicate === true
      );
      if (duplicateFrames.length > 0) {
        removeDuplicateFrames(getCurrentSessionId(), duplicateFrames);
      }
    });
  }

  // Khởi tạo nút áp dụng ngưỡng
  const applyThresholdBtn = document.getElementById("apply-threshold-btn");
  if (applyThresholdBtn) {
    applyThresholdBtn.addEventListener("click", applyDifferenceThreshold);
  }

  // Khởi tạo thanh trượt ngưỡng độ khác biệt
  const differenceThresholdSlider = document.getElementById(
    "difference-threshold"
  );
  if (differenceThresholdSlider) {
    differenceThresholdSlider.addEventListener("input", function () {
      differenceThreshold = parseFloat(this.value);
    });
    differenceThreshold = parseFloat(differenceThresholdSlider.value);
  }
}

// Hàm để áp dụng ngưỡng độ khác biệt
export function applyDifferenceThreshold() {
  if (!getCurrentSessionId()) {
    showToast("Lỗi: Vui lòng xử lý video trước khi áp dụng ngưỡng mới");
    return;
  }

  // Hiển thị thông báo đang xử lý
  showToast("Đang phân tích độ khác biệt giữa các khung hình...");

  // Gửi request đến server để phân tích với ngưỡng mới
  analyzeFrameDifferences(getCurrentSessionId(), differenceThreshold)
    .then((data) => {
      // Cập nhật dữ liệu keyframes
      setKeyframesData(data.keyframes || []);

      // Cập nhật hiển thị
      updateSimilarityDisplay(data);

      // Hiển thị thông báo thành công
      showToast(`Đã áp dụng ngưỡng độ khác biệt: ${differenceThreshold}`);
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

// Hàm kiểm tra tất cả đường dẫn ảnh
export function checkAllImagePaths() {
  const keyframesData = getKeyframesData();
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
  resultsDiv.querySelector(".close-btn").addEventListener("click", function () {
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
        `/uploads/keyframes/${getCurrentSessionId()}/frame_${index}.jpg`,
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

// Display results
export function displayResults(data) {
  resultsSection.style.display = "block";
  document.getElementById("script-section").style.display = "none";
  document.getElementById("generated-images-section").style.display = "none";
  document.getElementById("transcript-section").style.display = "none";

  // Show the auto-process button after extraction
  const autoProcessBtn = document.getElementById("auto-process-keyframes-btn");
  if (autoProcessBtn) {
    autoProcessBtn.parentElement.style.display = "block";

    // Gỡ bỏ tất cả các event listener hiện tại
    const newBtn = autoProcessBtn.cloneNode(true);
    autoProcessBtn.parentNode.replaceChild(newBtn, autoProcessBtn);

    // Thêm event listener mới
    newBtn.addEventListener("click", function () {
      console.log("Auto process button clicked!");
      showToast("Starting auto processing...");
      import("./autoProcess.js").then(({ autoProcessVideo }) => {
        autoProcessVideo();
      });
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
  setKeyframesData(data.keyframes || []);

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
        } | <i class="fas fa-image"></i> Số khung hình: ${data.keyframes.length}
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
      if (frame.is_duplicate) keyframeElement.classList.add("duplicate-frame");

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
      let imagePath = normalizeImagePath(originalPath);

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
        import("./promptGenerator.js").then(({ generatePrompt }) => {
          generatePrompt(framePath);
        });
      });

      // Add click event to open full image
      const imgElement = keyframeElement.querySelector("img");
      imgElement.addEventListener("click", function () {
        // Instead of opening in a new tab, show in a modal with download options
        const imgSrc = this.src;
        const frameId = keyframeElement.dataset.frameId;
        const keyframeInfo = getKeyframesData().find(
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
              keyframe: keyframeInfo,
            });
          });
      });

      // Add click event for generate image button
      const generateBtn = keyframeElement.querySelector(".generate-image-btn");
      generateBtn.addEventListener("click", function () {
        const framePath = this.dataset.framePath;
        import("./imageGeneration.js").then(
          ({ directLeonardoImageGeneration }) => {
            directLeonardoImageGeneration(framePath);
          }
        );
      });

      // Add click event for delete button
      const deleteBtn = keyframeElement.querySelector(".delete-frame-btn");
      deleteBtn.addEventListener("click", function () {
        const framePath = this.dataset.framePath;
        const frameId = this.dataset.frameId;
        handleDeleteKeyframe(framePath, frameId);
      });

      keyframesGallery.appendChild(keyframeElement);
    });
  } else {
    console.warn("No keyframes found in data:", data);
    keyframesGallery.innerHTML =
      '<p class="no-frames"><i class="fas fa-exclamation-circle"></i> Không có khung hình nào được trích xuất.</p>';
  }
}

// Display Azure results
export function displayAzureResults(data) {
  resultsSection.style.display = "block";
  document.getElementById("script-section").style.display = "none";
  document.getElementById("generated-images-section").style.display = "none";
  document.getElementById("transcript-section").style.display = "none";

  // Show the auto-process button after extraction
  const autoProcessBtn = document.getElementById("auto-process-keyframes-btn");
  if (autoProcessBtn) {
    autoProcessBtn.parentElement.style.display = "block";
    // Gỡ bỏ tất cả các event listener hiện tại
    const newBtn = autoProcessBtn.cloneNode(true);
    autoProcessBtn.parentNode.replaceChild(newBtn, autoProcessBtn);

    // Thêm event listener mới
    newBtn.addEventListener("click", function () {
      console.log("Auto process button clicked (Azure)!");
      showToast("Starting auto processing...");
      import("./autoProcess.js").then(({ autoProcessVideo }) => {
        autoProcessVideo();
      });
    });
  }

  // Create keyframes data array from Azure scenes and shots
  const keyframesData = [];

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

  // Store keyframes data globally
  setKeyframesData(keyframesData);

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
          <button class="generate-image-btn" data-frame-path="${
            shot.path || ""
          }">
            <i class="fas fa-palette"></i> Tạo ảnh mới
          </button>
          <button class="generate-prompt-btn" data-frame-path="${
            shot.path || ""
          }">
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
            import("./promptGenerator.js").then(({ generatePrompt }) => {
              generatePrompt(framePath);
            });
          });
      } else {
        // Hide the buttons if no path is available
        const genButton = keyframeElement.querySelector(".generate-image-btn");
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
        });

      // Add click event to open full image
      keyframeElement
        .querySelector(".generate-image-btn")
        .addEventListener("click", function () {
          const framePath = this.dataset.framePath;
          import("./imageGeneration.js").then(
            ({ directLeonardoImageGeneration }) => {
              directLeonardoImageGeneration(framePath);
            }
          );
        });

      keyframesGallery.appendChild(keyframeElement);
    });
  } else {
    keyframesGallery.innerHTML =
      '<p class="no-frames"><i class="fas fa-exclamation-circle"></i> Không có shots nào được trích xuất.</p>';
  }
}

// Handle download all
function handleDownloadAll() {
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    showToast("Lỗi: Không có phiên làm việc hiện tại");
    return;
  }

  fetch(`/download/${sessionId}`)
    .then((response) => response.json())
    .then((data) => {
      if (data.files && data.files.length > 0) {
        const imageUrls = data.files.map((file) => `/static/${file}`);
        downloadImagesAsZip(imageUrls, `keyframes-${sessionId}.zip`);
      } else {
        showToast("Không có khung hình nào để tải xuống");
      }
    })
    .catch((error) => {
      console.error("Error downloading files:", error);
      showToast("Lỗi khi tải xuống các khung hình");
    });
}

// Handle extract script
function handleExtractScript() {
  import("./scriptGenerator.js").then(({ generateScript }) => {
    generateScript();
  });
}

// Handle new video
function handleNewVideo() {
  // Reset UI
  resultsSection.style.display = "none";
  document.getElementById("script-section").style.display = "none";
  document.getElementById("generated-images-section").style.display = "none";
  document.getElementById("transcript-section").style.display = "none";
  if (similarityNotification) {
    similarityNotification.style.display = "none";
  }
  if (duplicateNotification) {
    duplicateNotification.style.display = "none";
  }
  document.getElementById("upload-container").style.display = "flex";

  // Reset file upload area
  import("./upload.js").then(({ resetUpload }) => {
    resetUpload();
  });

  // Reset YouTube input
  document.getElementById("youtube-url").value = "";

  // Reset TikTok input
  const tiktokUrlInput = document.getElementById("tiktok-url");
  if (tiktokUrlInput) {
    tiktokUrlInput.value = "";
  }
}

// Handle delete keyframe
function handleDeleteKeyframe(framePath, frameId) {
  if (!confirm("Bạn có chắc chắn muốn xóa khung hình này không?")) {
    return;
  }

  deleteKeyframe(framePath, getCurrentSessionId(), frameId)
    .then((data) => {
      if (data.success) {
        // Xóa khung hình khỏi giao diện
        const frameElement = document.querySelector(
          `.keyframe[data-frame-id="${frameId}"]`
        );
        if (frameElement) {
          frameElement.remove();

          // Cập nhật keyframesData
          const updatedKeyframes = getKeyframesData().filter(
            (frame) => frame.id !== frameId
          );
          setKeyframesData(updatedKeyframes);

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
