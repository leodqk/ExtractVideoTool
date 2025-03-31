// modules/scriptGenerator.js - Tạo kịch bản từ khung hình

import { showToast } from "./ui.js";
import { formatScriptText } from "../utils/pathUtils.js";
import { generateScript } from "../services/geminiService.js";
import { getCurrentSessionId, getKeyframesData } from "./extraction.js";

export function generateScript() {
  if (!getCurrentSessionId() && !getKeyframesData().length) {
    showToast("Lỗi: Không có dữ liệu khung hình để phân tích");
    return;
  }

  // Hiển thị phần kịch bản và loading
  const scriptSection = document.getElementById("script-section");
  const scriptLoading = document.getElementById("script-loading");
  const scriptContent = document.getElementById("script-content");

  scriptSection.style.display = "block";
  scriptLoading.style.display = "block";
  scriptContent.style.display = "none";

  // Cuộn xuống phần kịch bản
  scriptSection.scrollIntoView({ behavior: "smooth" });

  // Lấy giá trị temperature
  const temperature = parseFloat(
    document.getElementById("script-temperature").value
  );

  // Chuẩn bị dữ liệu để gửi đến server
  let requestData = {
    temperature: temperature,
  };

  // Nếu có session_id, thêm vào request
  if (getCurrentSessionId()) {
    requestData.session_id = getCurrentSessionId();
  }
  // Nếu không có session_id nhưng có keyframesData (trường hợp đặc biệt), gửi dữ liệu keyframes trực tiếp
  else if (getKeyframesData().length > 0) {
    requestData.keyframes_data = getKeyframesData();

    // Kiểm tra nếu có dữ liệu transcript
    const transcriptContent = document.querySelector(".transcript-text");
    if (transcriptContent && transcriptContent.textContent) {
      requestData.transcript_text = transcriptContent.textContent;
    }
  }

  // Gửi request đến server
  generateScript(
    getCurrentSessionId(),
    temperature,
    getKeyframesData(),
    document.querySelector(".transcript-text")?.textContent
  )
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
}
