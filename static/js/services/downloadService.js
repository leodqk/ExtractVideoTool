// services/downloadService.js - Tải xuống ảnh, file

import { showToast } from "../modules/ui.js";

// Download a single image
export function downloadImage(imagePath) {
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
export function downloadImagesAsZip(images, zipFilename = "images.zip") {
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
export function downloadTranscript(sessionId) {
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

// Download batch results
export function downloadBatchResults(batchSessionId) {
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

// Download batch results as text
export function downloadBatchResultsText(batchSessionId) {
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
