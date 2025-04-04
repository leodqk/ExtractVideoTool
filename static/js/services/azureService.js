// services/azureService.js - Xử lý Azure Video Indexer

import { callApi } from "./apiService.js";
import { showToast } from "../modules/ui.js";

// Load saved Azure credentials
export function loadAzureCredentials() {
  // Load saved settings from localStorage
  const savedSettings = localStorage.getItem("azureSettings");
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      // Load saved credentials if available
      if (settings.api_key)
        document.getElementById("azure-api-key").value = settings.api_key;
      if (settings.account_id)
        document.getElementById("azure-account-id").value = settings.account_id;
      if (settings.location)
        document.getElementById("azure-location").value = settings.location;

      // Load other settings
      document.getElementById("azure-language").value =
        settings.language || "vi-VN";
      document.getElementById("azure-force-upload").checked =
        settings.forceUpload || false;
      document.getElementById("azure-use-existing").checked =
        settings.useExisting !== undefined ? settings.useExisting : true;
      document.getElementById("azure-save-settings").checked = true;
    } catch (error) {
      console.error("Error loading saved Azure settings:", error);
    }
  } else {
    // If no saved settings, try to load from API as fallback
    fetch("/azure-credentials")
      .then((response) => response.json())
      .then((data) => {
        if (data.has_credentials) {
          document.getElementById("azure-api-key").value = data.api_key;
          document.getElementById("azure-account-id").value = data.account_id;
          document.getElementById("azure-location").value = data.location;
        }
      })
      .catch((error) =>
        console.error("Error loading Azure credentials:", error)
      );
  }

  // Add event listener for the save checkbox
  const saveCheckbox = document.getElementById("azure-save-settings");
  if (saveCheckbox) {
    saveCheckbox.addEventListener("change", saveAzureSettings);
  }
}

// Save Azure settings to localStorage
export function saveAzureSettings() {
  const saveSettings = document.getElementById("azure-save-settings").checked;
  if (saveSettings) {
    const settings = {
      // Save credentials
      api_key: document.getElementById("azure-api-key").value,
      account_id: document.getElementById("azure-account-id").value,
      location: document.getElementById("azure-location").value,

      // Save other settings
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

    // Save settings if checkbox is checked
    if (document.getElementById("azure-save-settings").checked) {
      saveAzureSettings();
    }

    return data;
  } catch (error) {
    showToast(`Lỗi khi xử lý video với Azure: ${error.message}`);
    throw error;
  }
}
