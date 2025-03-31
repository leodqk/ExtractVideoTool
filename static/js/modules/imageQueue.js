// modules/imageQueue.js - Quản lý hàng đợi ảnh

import { showToast } from "./ui.js";
import {
  downloadImage,
  downloadImagesAsZip,
} from "../services/downloadService.js";

// Khai báo biến toàn cục để lưu trữ hàng đợi hình ảnh
let imageQueue = [];

export function initImageQueue() {
  // Khởi tạo nút xem hàng đợi
  const queueBtn = document.getElementById("view-image-queue");
  if (queueBtn) {
    queueBtn.addEventListener("click", function () {
      showImageQueueModal();
    });
  }
}

// Hàm để thêm ảnh vào hàng đợi
export function addToImageQueue(imageData) {
  // Kiểm tra xem ảnh đã tồn tại trong hàng đợi chưa
  const exists = imageQueue.some((img) => img.url === imageData.url);
  if (!exists) {
    // Thêm thuộc tính order dựa trên vị trí hiện tại trong hàng đợi
    imageData.order = imageQueue.length;
    // Ghi log thông tin keyframe nếu có
    if (imageData.keyframe) {
      console.log("Đã thêm ảnh vào hàng đợi với keyframe:", imageData.keyframe);
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
export function showImageQueueModal() {
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
          import("../services/leonardoService.js").then(
            ({ generateGeminiPromptAndImage }) => {
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
            }
          );
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

export function getImageQueue() {
  return imageQueue;
}

export function clearImageQueue() {
  imageQueue = [];
  updateQueueButton();
}
