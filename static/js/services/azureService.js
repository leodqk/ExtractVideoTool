// services/azureService.js - Xử lý Azure Video Indexer

import { callApi } from "./apiService.js";
import { showToast } from "../modules/ui.js";

// Load saved Azure credentials
export function loadAzureCredentials() {
  fetch("/azure-credentials")
    .then((response) => response.json())
    .then((data) => {
      if (data.has_credentials) {
        document.getElementById("azure-api-key").value = data.api_key;
        document.getElementById("azure-account-id").value = data.account_id;
        document.getElementById("azure-location").value = data.location;
      }
    })
    .catch((error) => console.error("Error loading Azure credentials:", error));

  // Load saved settings from localStorage
  const savedSettings = localStorage.getItem("azureSettings");
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      document.getElementById("azure-language").value = settings.language;
      document.getElementById("azure-force-upload").checked =
        settings.forceUpload;
      document.getElementById("azure-use-existing").checked =
        settings.useExisting;
      document.getElementById("azure-save-settings").checked = true;
    } catch (error) {
      console.error("Error loading saved Azure settings:", error);
    }
  }
}

// Save Azure settings to localStorage
export function saveAzureSettings() {
  const saveSettings = document.getElementById("azure-save-settings").checked;
  if (saveSettings) {
    const settings = {
      language: document.getElementById("azure-language").value,
      forceUpload: document.getElementById("azure-force-upload").checked,
      useExisting: document.getElementById("azure-use-existing").checked,
    };
    localStorage.setItem("azureSettings", JSON.stringify(settings));
    showToast("Đã lưu cài đặt Azure");
  } else {
    localStorage.removeItem("azureSettings");
    showToast("Đã xóa cài đặt Azure đã lưu");
  }
}

// Process video with Azure
export async function processVideoAzure(formData) {
  try {
    const data = await callApi("/process-video-azure", "POST", formData, true);
    return data;
  } catch (error) {
    showToast(`Lỗi khi xử lý video với Azure: ${error.message}`);
    throw error;
  }
}
