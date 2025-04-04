// main.js - File chính, import các module và khởi tạo ứng dụng

document.addEventListener("DOMContentLoaded", function () {
  // Debug mode
  const DEBUG = true;

  // Khởi tạo debug
  import("./utils/debug.js").then((module) => {
    const { initDebug } = module;
    initDebug(DEBUG);
  });

  // Khởi tạo UI
  import("./modules/ui.js").then((module) => {
    const { initUI } = module;
    initUI();
  });

  // Khởi tạo upload
  import("./modules/upload.js").then((module) => {
    const { initUpload } = module;
    initUpload();
  });

  // Khởi tạo extraction
  import("./modules/extraction.js").then((module) => {
    const { initExtraction } = module;
    initExtraction();
  });

  // Khởi tạo keyframes
  import("./modules/keyframes.js").then((module) => {
    const { initKeyframes } = module;
    initKeyframes();
  });

  // Khởi tạo image generation
  import("./modules/imageGeneration.js").then((module) => {
    const { initImageGeneration } = module;
    initImageGeneration();
  });

  // Khởi tạo image queue
  import("./modules/imageQueue.js").then((module) => {
    const { initImageQueue } = module;
    initImageQueue();
  });

  // Khởi tạo batch processing
  import("./modules/batchProcessing.js").then((module) => {
    const { initBatchProcessing } = module;
    initBatchProcessing();
  });
});

// Add home button event listener
document.getElementById("home-btn").addEventListener("click", function () {
  window.location.reload();
});
