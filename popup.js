document.addEventListener("DOMContentLoaded", function () {
  // DOM elements
  const zipFileInput = document.getElementById("zipFileInput");
  const content = document.getElementById("content");
  const currentImage = document.getElementById("currentImage");
  const imageDescription = document.getElementById("imageDescription");
  const negativePromptInput = document.getElementById("negativePrompt");
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");
  const imageCounter = document.getElementById("imageCounter");
  const importToKlingButton = document.getElementById("importToKlingButton");

  // State variables
  let images = [];
  let descriptions = [];
  let currentIndex = 0;
  let currentImageBlob = null;

  // Event listeners
  zipFileInput.addEventListener("change", handleZipFile);
  prevButton.addEventListener("click", showPreviousImage);
  nextButton.addEventListener("click", showNextImage);
  importToKlingButton.addEventListener("click", importToKlingAI);

  // Function to handle zip file upload
  function handleZipFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
      const data = e.target.result;
      processZipFile(data);
    };

    reader.readAsArrayBuffer(file);
  }

  // Function to process the zip file
  function processZipFile(data) {
    images = [];
    descriptions = [];
    currentIndex = 0;

    JSZip.loadAsync(data)
      .then(function (zip) {
        // Get all file entries
        const imageFiles = [];
        const textFiles = [];

        zip.forEach(function (relativePath, zipEntry) {
          // Skip directories
          if (zipEntry.dir) return;

          // Check if it's an image file
          if (isImageFile(relativePath)) {
            imageFiles.push({
              name: relativePath,
              entry: zipEntry,
            });
          }
          // Check if it's a text file (assuming descriptions are in a text file)
          else if (isTextFile(relativePath)) {
            textFiles.push({
              name: relativePath,
              entry: zipEntry,
            });
          }
        });

        // Log total counts
        console.log(
          `Found ${imageFiles.length} images and ${textFiles.length} text files`
        );

        // First process text files to get descriptions
        const textPromises = textFiles.map((file) => {
          return file.entry.async("string").then(function (content) {
            console.log(`Processing text file: ${file.name}`);
            // Split text file content by lines
            const lines = content.split(/\r?\n/);
            descriptions = lines.filter((line) => line.trim() !== "");
            console.log(`Extracted ${descriptions.length} descriptions`);
            return descriptions;
          });
        });

        return Promise.all(textPromises).then((descriptionsArray) => {
          // If we have multiple text files, flatten the arrays
          if (descriptionsArray.length > 0) {
            descriptions = descriptionsArray.flat();
          }

          console.log(
            `Total descriptions after processing: ${descriptions.length}`
          );

          // Now process and sort image files
          // Sort image files numerically based on numbers in the filename
          imageFiles.sort((a, b) => {
            const numA = extractNumber(a.name);
            const numB = extractNumber(b.name);

            if (numA !== null && numB !== null) {
              return numA - numB;
            }

            return a.name.localeCompare(b.name);
          });

          console.log(
            "Sorted image files:",
            imageFiles.map((f) => `${f.name} (${extractNumber(f.name)})`)
          );

          // Process image files in correct order
          const imagePromises = imageFiles.map((file, index) => {
            return file.entry.async("blob").then(function (blob) {
              const imageUrl = URL.createObjectURL(blob);
              images.push({
                name: file.name,
                url: imageUrl,
                blob: blob,
                index: index, // Store the original sorted index
                number: extractNumber(file.name), // Store the number for verification
              });
              return {
                name: file.name,
                index: index,
                number: extractNumber(file.name),
              };
            });
          });

          return Promise.all(imagePromises);
        });
      })
      .then(function (processedImages) {
        // Ensure images array is sorted the same way as we processed them
        images.sort((a, b) => a.index - b.index);

        // For verification, log both arrays to check alignment
        console.log(
          "Images order:",
          images.map((img) => `${img.name} (${img.number})`)
        );
        console.log(
          "Descriptions preview:",
          descriptions
            .slice(0, Math.min(5, descriptions.length))
            .map((d) => d.substring(0, 30) + "...")
        );

        if (images.length !== descriptions.length) {
          console.warn(
            `WARNING: Number of images (${images.length}) does not match number of descriptions (${descriptions.length})`
          );
        }

        // Show the content
        if (images.length > 0) {
          content.style.display = "block";
          showImage(0);
          updateButtons();
        } else {
          alert("No images found in the zip file.");
        }
      })
      .catch(function (error) {
        console.error("Error processing zip file:", error);
        alert("Error processing zip file: " + error.message);
      });
  }

  // Function to show image at specified index
  function showImage(index) {
    if (index < 0 || index >= images.length) return;

    currentIndex = index;
    currentImage.src = images[index].url;
    currentImageBlob = images[index].blob;

    // Display description if available
    if (index < descriptions.length) {
      imageDescription.textContent = descriptions[index];
    } else {
      imageDescription.textContent = "No description available";
    }

    // Update image counter
    imageCounter.textContent = `Image ${index + 1} of ${images.length}`;

    // Update button states
    updateButtons();
  }

  // Function to show previous image
  function showPreviousImage() {
    if (currentIndex > 0) {
      showImage(currentIndex - 1);
    }
  }

  // Function to show next image
  function showNextImage() {
    if (currentIndex < images.length - 1) {
      showImage(currentIndex + 1);
    }
  }

  // Function to update button states
  function updateButtons() {
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === images.length - 1;
  }

  // Function to import to Kling AI
  function importToKlingAI() {
    if (!currentImageBlob || currentIndex >= descriptions.length) {
      alert("No image or description available to import.");
      return;
    }

    // Get negative prompt text
    const negativePromptText = negativePromptInput.value.trim();

    // Check if the current image is JPG or PNG
    const filename = images[currentIndex].name.toLowerCase();
    if (
      !filename.endsWith(".jpg") &&
      !filename.endsWith(".jpeg") &&
      !filename.endsWith(".png")
    ) {
      alert(
        "Kling AI only supports JPG and PNG formats. Please convert the image before importing."
      );
      return;
    }

    // Always batch import all remaining images without confirmation
    batchImportRemainingImages(negativePromptText);
  }

  // Function to extract number from filename (for better sorting)
  function extractNumber(filename) {
    // Remove path and extension
    const baseName = filename.split("/").pop().split("\\").pop().split(".")[0];
    // Find all numbers in the string
    const matches = baseName.match(/\d+/g);

    if (matches && matches.length > 0) {
      // Return the first number found
      return parseInt(matches[0], 10);
    }
    return null;
  }

  // Function to batch import all remaining images from current index to end
  function batchImportRemainingImages(negativePromptText) {
    if (currentIndex >= images.length || currentIndex >= descriptions.length) {
      alert("No images available to import.");
      return;
    }

    // Log current state
    console.log("Current index:", currentIndex);
    console.log("Current image:", images[currentIndex].name);
    console.log("Current description:", descriptions[currentIndex]);
    console.log("Negative prompt:", negativePromptText);
    console.log("Total images:", images.length);
    console.log("Total descriptions:", descriptions.length);

    // Prepare the queue of items to process
    const queue = [];

    // First, create an array of items with both image and text data
    const itemsToProcess = [];
    for (
      let i = currentIndex;
      i < Math.min(images.length, descriptions.length);
      i++
    ) {
      // Check if the image is JPG or PNG
      const filename = images[i].name.toLowerCase();
      if (
        !filename.endsWith(".jpg") &&
        !filename.endsWith(".jpeg") &&
        !filename.endsWith(".png")
      ) {
        console.log(
          `Skipping image ${i + 1} (${images[i].name}) - not a JPG/PNG format`
        );
        continue;
      }

      itemsToProcess.push({
        index: i,
        image: images[i],
        description: descriptions[i],
        negativePrompt: negativePromptText, // Include negative prompt
      });
    }

    // Log the items we're about to process
    console.log(
      "Items to process:",
      itemsToProcess.map((item) => ({
        index: item.index,
        image: item.image.name,
        description:
          item.description.substring(0, 50) +
          (item.description.length > 50 ? "..." : ""),
        negativePrompt: item.negativePrompt,
      }))
    );

    // Process each item one by one, waiting for each to complete
    processItemsSequentially(itemsToProcess, 0, [], function (processedQueue) {
      if (processedQueue.length === 0) {
        alert("No compatible images (JPG/PNG) found to import.");
        return;
      }

      // Take the first item for immediate processing
      const firstItem = processedQueue.shift();

      // Store the rest in the queue for sequential processing
      chrome.storage.local.set(
        {
          klingImportImage: firstItem.image,
          klingImportDescription: firstItem.description,
          klingImportNegativePrompt: firstItem.negativePrompt, // Store negative prompt
          klingImportQueue: processedQueue,
          totalImagesToProcess: itemsToProcess.length, // Store actual number of images from zip
        },
        function () {
          // No alert dialog, just open the tab
          console.log(
            `Starting batch import of ${itemsToProcess.length} images.`
          );
          console.log("First item:", {
            description: firstItem.description.substring(0, 50) + "...",
            negativePrompt: firstItem.negativePrompt,
            queueSize: processedQueue.length,
            totalImages: itemsToProcess.length,
          });

          // Create a new tab with Kling AI URL
          chrome.tabs.create({
            url: "https://app.klingai.com/global/image-to-video/frame-mode/new",
          });
        }
      );
    });
  }

  // Process items one by one to maintain order
  function processItemsSequentially(
    items,
    currentItemIndex,
    processedQueue,
    callback
  ) {
    if (currentItemIndex >= items.length) {
      // All items processed
      callback(processedQueue);
      return;
    }

    const item = items[currentItemIndex];
    const filename = item.image.name;
    const mimeType = filename.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    // Convert to proper format
    const canvas = document.createElement("canvas");
    const img = new Image();

    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Get as proper format data URL
      canvas.toBlob(
        function (blob) {
          // Create data URL from blob
          const reader = new FileReader();
          reader.onloadend = function () {
            // Add to processed queue
            processedQueue.push({
              image: reader.result,
              description: item.description,
              negativePrompt: item.negativePrompt, // Include negative prompt
            });

            console.log(
              `Processed item ${currentItemIndex + 1}/${
                items.length
              }: ${filename}`
            );

            // Process next item
            processItemsSequentially(
              items,
              currentItemIndex + 1,
              processedQueue,
              callback
            );
          };
          reader.readAsDataURL(blob);
        },
        mimeType,
        0.95
      );
    };

    // Handle image loading errors
    img.onerror = function () {
      console.error(`Error loading image: ${filename}`);
      // Skip this item and move to next
      processItemsSequentially(
        items,
        currentItemIndex + 1,
        processedQueue,
        callback
      );
    };

    // Load the image
    img.src = item.image.url;
  }

  // Helper function to check if a file is an image
  function isImageFile(filename) {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    const lowerFilename = filename.toLowerCase();
    return imageExtensions.some((ext) => lowerFilename.endsWith(ext));
  }

  // Helper function to check if a file is a text file
  function isTextFile(filename) {
    const textExtensions = [".txt", ".text"];
    const lowerFilename = filename.toLowerCase();
    return textExtensions.some((ext) => lowerFilename.endsWith(ext));
  }
});
