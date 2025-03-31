// utils/fileUtils.js - Xử lý file

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  else return (bytes / 1073741824).toFixed(1) + " GB";
}

export function processCompressedFile(file) {
  return new Promise((resolve, reject) => {
    const zip = new JSZip();
    const reader = new FileReader();

    reader.onload = function (e) {
      // Load the archive content
      zip
        .loadAsync(e.target.result)
        .then(function (archive) {
          const extractedImages = [];
          const imageMimeTypes = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            bmp: "image/bmp",
            webp: "image/webp",
          };

          // Get all entries (files and folders)
          const entries = [];
          archive.forEach((relativePath, zipEntry) => {
            entries.push(zipEntry);
          });

          // Track the number of pending file extractions
          let pendingExtractions = 0;

          // Look for image files
          entries.forEach((zipEntry) => {
            if (!zipEntry.dir) {
              const extension = zipEntry.name.split(".").pop().toLowerCase();
              if (imageMimeTypes[extension]) {
                pendingExtractions++;

                // Extract the file content
                zipEntry
                  .async("blob")
                  .then((blob) => {
                    // Convert blob to File object with appropriate type
                    const imageFile = new File(
                      [blob],
                      zipEntry.name.split("/").pop(),
                      { type: imageMimeTypes[extension] }
                    );

                    extractedImages.push(imageFile);

                    pendingExtractions--;
                    if (pendingExtractions === 0) {
                      resolve(extractedImages);
                    }
                  })
                  .catch((error) => {
                    console.error(`Error extracting ${zipEntry.name}:`, error);
                    pendingExtractions--;
                    if (pendingExtractions === 0) {
                      resolve(extractedImages);
                    }
                  });
              }
            }
          });

          // If no image files found to extract
          if (pendingExtractions === 0) {
            resolve(extractedImages);
          }
        })
        .catch(function (error) {
          reject(error);
        });
    };

    reader.onerror = function (error) {
      reject(error);
    };

    // Read the file as an ArrayBuffer
    reader.readAsArrayBuffer(file);
  });
}
