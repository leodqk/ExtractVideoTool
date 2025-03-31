// services/apiService.js - Gọi API

import { debugLog } from "../utils/debug.js";
import { showToast } from "../modules/ui.js";

// Hàm gọi API chung
export async function callApi(
  endpoint,
  method = "GET",
  data = null,
  isFormData = false
) {
  debugLog(`Calling API: ${endpoint} (${method})`);

  try {
    const options = {
      method: method,
    };

    if (data) {
      if (isFormData) {
        options.body = data;
      } else {
        options.headers = {
          "Content-Type": "application/json",
        };
        options.body = JSON.stringify(data);
      }
    }

    const response = await fetch(endpoint, options);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        throw new Error(
          `HTTP error: ${response.status} ${response.statusText}`
        );
      }
      throw new Error(errorData.error || `HTTP error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    debugLog("API Error:", error);
    throw error;
  }
}

// Hàm gọi API trích xuất khung hình
export async function extractKeyframes(formData, endpoint) {
  try {
    const data = await callApi(endpoint, "POST", formData, true);
    return data;
  } catch (error) {
    showToast(`Lỗi: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API xóa khung hình
export async function deleteKeyframe(framePath, sessionId, frameId) {
  try {
    const data = await callApi("/delete-keyframe", "POST", {
      frame_path: framePath,
      session_id: sessionId,
      frame_id: frameId,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi xóa khung hình: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API phân tích độ khác biệt
export async function analyzeFrameDifferences(sessionId, differenceThreshold) {
  try {
    const data = await callApi("/analyze-frame-differences", "POST", {
      session_id: sessionId,
      difference_threshold: differenceThreshold,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi phân tích độ khác biệt: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API xóa khung hình tương tự
export async function removeSimilarFrames(sessionId, similarFrames) {
  try {
    const data = await callApi("/remove-similar-frames", "POST", {
      session_id: sessionId,
      similar_frames: similarFrames,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi xóa khung hình tương tự: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API xóa khung hình trùng lặp
export async function removeDuplicateFrames(sessionId, duplicateFrames) {
  try {
    const data = await callApi("/remove-duplicates", "POST", {
      session_id: sessionId,
      duplicate_frames: duplicateFrames,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi xóa khung hình trùng lặp: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API tạo kịch bản
export async function generateScript(
  sessionId,
  temperature,
  keyframesData,
  transcriptText
) {
  const requestData = {
    temperature: temperature,
  };

  if (sessionId) {
    requestData.session_id = sessionId;
  } else if (keyframesData && keyframesData.length > 0) {
    requestData.keyframes_data = keyframesData;
    if (transcriptText) {
      requestData.transcript_text = transcriptText;
    }
  }

  try {
    const data = await callApi("/generate-script", "POST", requestData);
    return data;
  } catch (error) {
    showToast(`Lỗi khi tạo kịch bản: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API tải xuống khung hình
export async function downloadKeyframes(sessionId) {
  try {
    const data = await callApi(`/download/${sessionId}`, "GET");
    return data;
  } catch (error) {
    showToast(`Lỗi khi tải xuống khung hình: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API tạo ảnh mới
export async function generateImage(framePath, sessionId, prompt, style) {
  try {
    const data = await callApi("/generate-image", "POST", {
      keyframe_path: framePath,
      session_id: sessionId,
      prompt: prompt,
      style: style,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi tạo ảnh mới: ${error.message}`);
    throw error;
  }
}

// Hàm gọi API tạo prompt với Gemini
export async function generateGeminiPrompt(framePath) {
  try {
    const data = await callApi("/generate-gemini-prompt", "POST", {
      keyframe_path: framePath,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi tạo prompt với Gemini: ${error.message}`);
    throw error;
  }
}
