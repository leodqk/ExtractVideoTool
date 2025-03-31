// modules/autoProcess.js - Tự động xử lý video

import { showToast } from "./ui.js";
import { normalizeImagePath } from "../utils/pathUtils.js";
import { addToImageQueue } from "./imageQueue.js";
import { generateGeminiPromptAndImage } from "../services/leonardoService.js";
import { getKeyframesData } from "./extraction.js";

// Hàm tự động xử lý video từ trích xuất đến tạo ảnh mới và lưu vào hàng đợi
export function autoProcessVideo() {
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
    stepEl.querySelector(".progress-step-bar-fill").style.width = `${percent}%`;

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
              import("./imageQueue.js").then(({ showImageQueueModal }) => {
                showImageQueueModal();
              });
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
      `<i class="fas fa-spinner fa-spin"></i> Đang tạo ảnh mới (${index + 1}/${
        selectedFrames.length
      })...`
    );

    // Tạo ảnh mới sử dụng hàm generateGeminiPromptAndImage
    generateGeminiPromptAndImage(framePath)
      .then((result) => {
        if (result && result.url) {
          generatedImages.push({
            ...result,
            keyframe: framePath,
            sourceKeyframe: getKeyframesData().find(
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
