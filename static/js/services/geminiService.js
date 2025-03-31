// services/geminiService.js - Tương tác với Gemini AI

import { callApi } from "./apiService.js";
import { showToast } from "../modules/ui.js";

// Generate prompt with Gemini
export async function generateGeminiPrompt(keyframePath) {
  try {
    const data = await callApi("/generate-gemini-prompt", "POST", {
      keyframe_path: keyframePath,
    });
    return data;
  } catch (error) {
    showToast(`Lỗi khi tạo prompt với Gemini: ${error.message}`);
    throw error;
  }
}

// Generate script with Gemini
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

// Process batch images with Gemini
export async function processBatchImages(formData) {
  try {
    const data = await callApi(
      "/process-images-gemini",
      "POST",
      formData,
      true
    );
    return data;
  } catch (error) {
    showToast(`Lỗi khi xử lý batch ảnh: ${error.message}`);
    throw error;
  }
}
