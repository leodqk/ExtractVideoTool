// services/leonardoService.js - Tương tác với Leonardo AI

import { callApi } from "./apiService.js";
import { showToast } from "../modules/ui.js";

// Generate image with Leonardo
export async function generateLeonardoImage(prompt) {
  try {
    const data = await callApi("/generate-leonardo-image", "POST", {
      prompt: prompt,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi tạo ảnh với Leonardo: ${error.message}`);
    throw error;
  }
}

// Get Leonardo image status
export async function getLeonardoImage(generationId) {
  try {
    const data = await callApi(`/get-leonardo-image/${generationId}`, "GET");
    return data;
  } catch (error) {
    showToast(`Lỗi khi lấy thông tin ảnh từ Leonardo: ${error.message}`);
    throw error;
  }
}

// Generate image from keyframe
export async function generateGeminiPromptAndImage(framePath) {
  return new Promise((resolve, reject) => {
    console.log("Processing frame:", framePath);

    // Đầu tiên gọi API tạo prompt từ Gemini
    callApi("/generate-gemini-prompt", "POST", {
      keyframe_path: framePath,
    })
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Lỗi khi tạo prompt với Gemini");
        }
        console.log(
          "Successfully generated prompt:",
          data.prompt.substring(0, 50) + "..."
        );

        // Tiếp theo gọi API tạo ảnh với Leonardo
        return callApi("/generate-leonardo-image", "POST", {
          prompt: data.prompt,
        });
      })
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Lỗi khi tạo ảnh với Leonardo");
        }

        const generationId = data.generation_id;

        // Hàm kiểm tra trạng thái tạo ảnh
        function checkImageStatus() {
          return callApi(`/get-leonardo-image/${generationId}`, "GET").then(
            (result) => {
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
            }
          );
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
