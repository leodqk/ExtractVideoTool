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
