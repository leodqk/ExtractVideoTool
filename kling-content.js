// This script runs when the Kling AI website is loaded
(function () {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initImport);
  } else {
    initImport();
  }

  // Global variables to track processing
  let totalImagesProcessed = 0;
  let totalImagesExpected = 0;
  let lastImportTime = null;
  let completionTimer = null;
  let isLastItem = false;

  function initImport() {
    console.log("Kling AI Import: Content script initialized");

    // Check if we have data to import
    chrome.storage.local.get(
      [
        "klingImportImage",
        "klingImportDescription",
        "klingImportNegativePrompt", // Add negative prompt
        "klingImportQueue",
        "totalImagesToProcess",
      ],
      function (data) {
        if (data.klingImportImage && data.klingImportDescription) {
          console.log("Kling AI Import: Found data to import");
          console.log(
            "Description (first 50 chars):",
            data.klingImportDescription.substring(0, 50)
          );

          // Log negative prompt if available
          if (data.klingImportNegativePrompt) {
            console.log(
              "Negative Prompt (first 50 chars):",
              data.klingImportNegativePrompt.substring(0, 50)
            );
          }

          // Log queue information
          const queueSize = data.klingImportQueue
            ? data.klingImportQueue.length
            : 0;
          console.log(`Kling AI Import: Queue size: ${queueSize}`);

          // Use the total number of images from extraction
          totalImagesExpected = data.totalImagesToProcess || queueSize + 1;
          console.log(
            `Kling AI Import: Expected to process ${totalImagesExpected} images in total`
          );

          // Mark if this is the last item
          isLastItem = queueSize === 0;

          if (data.klingImportQueue && data.klingImportQueue.length > 0) {
            console.log(
              "Next in queue (first 50 chars):",
              data.klingImportQueue[0].description.substring(0, 50)
            );
          }

          // Queue remaining images for batch processing
          let queue = data.klingImportQueue || [];

          // Store the current data and any remaining queue in local variables
          const currentProcessing = {
            image: data.klingImportImage,
            description: data.klingImportDescription,
            negativePrompt: data.klingImportNegativePrompt || "", // Include negative prompt
            queue: queue,
          };

          // Wait longer for the page to fully load and be interactive
          setTimeout(() => {
            // Process current image and text
            processItem(currentProcessing);
          }, 3000); // Increased wait time
        }
      }
    );
  }

  // Function to process a single item from the queue
  function processItem(processingData) {
    console.log("Kling AI Import: Processing item");
    console.log(
      "Description being processed (first 50 chars):",
      processingData.description.substring(0, 50)
    );

    if (processingData.negativePrompt) {
      console.log(
        "Negative prompt being processed (first 50 chars):",
        processingData.negativePrompt.substring(0, 50)
      );
    }

    // Track the time of this import
    lastImportTime = new Date();

    // Import current item
    importToKlingAI(
      processingData.image,
      processingData.description,
      processingData.negativePrompt
    );

    // Clear current data from storage but keep queue for next iterations
    chrome.storage.local.remove([
      "klingImportImage",
      "klingImportDescription",
      "klingImportNegativePrompt",
    ]);
  }

  function importToKlingAI(imageDataUrl, description, negativePrompt) {
    try {
      // Extract MIME type from the data URL to check format
      const mimeType = imageDataUrl.split(";")[0].split(":")[1];
      if (
        !mimeType ||
        !(mimeType === "image/jpeg" || mimeType === "image/png")
      ) {
        console.error(
          "Kling AI Import: Unsupported image format. Only JPG and PNG are supported."
        );
        alert(
          "Unsupported image format. Only JPG and PNG are supported by Kling AI."
        );
        processNextItemIfAvailable();
        return;
      }

      // Start finding and filling the description field immediately in parallel
      // Don't wait for image upload to complete
      fillDescriptionField(description);

      // Find the image upload input in the new interface
      const uploadInput = document.querySelector(
        '.el-upload__input[type="file"]'
      );
      if (!uploadInput) {
        console.error("Kling AI Import: Could not find upload input");
        processNextItemIfAvailable();
        return;
      }

      // Convert Data URL to Blob
      const imageBlob = dataURLToBlob(imageDataUrl);

      // Create a File object from the blob with the correct extension
      const extension = mimeType === "image/jpeg" ? "jpg" : "png";
      const file = new File([imageBlob], `imported-image.${extension}`, {
        type: mimeType,
      });

      // Create a DataTransfer object to simulate file upload
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      uploadInput.files = dataTransfer.files;

      // Dispatch change event to trigger file upload handlers
      uploadInput.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("Kling AI Import: Image upload initiated");

      // Wait exactly 4 seconds before handling negative prompt and clicking Generate button
      setTimeout(() => {
        // Handle negative prompt if available
        if (negativePrompt && negativePrompt.trim() !== "") {
          handleNegativePrompt(negativePrompt, () => {
            // After handling negative prompt, click Generate button
            clickGenerateButton(() => {
              // After generating, wait for the generation to start and then set up listener for next item
              totalImagesProcessed++;
              console.log(
                `Kling AI Import: Processed ${totalImagesProcessed}/${totalImagesExpected} images`
              );

              setTimeout(() => {
                if (isLastItem) {
                  setupCompletionTimer();
                } else {
                  setupNextItemProcessing();
                }
              }, 2000);
            });
          });
        } else {
          // No negative prompt, just click Generate button
          clickGenerateButton(() => {
            // After generating, wait for the generation to start and then set up listener for next item
            totalImagesProcessed++;
            console.log(
              `Kling AI Import: Processed ${totalImagesProcessed}/${totalImagesExpected} images`
            );

            setTimeout(() => {
              if (isLastItem) {
                setupCompletionTimer();
              } else {
                setupNextItemProcessing();
              }
            }, 2000);
          });
        }
      }, 4000);
    } catch (error) {
      console.error("Kling AI Import: Error during import", error);
      processNextItemIfAvailable();
    }
  }

  // Function to handle negative prompt
  function handleNegativePrompt(negativePrompt, callback) {
    console.log("Kling AI Import: Handling negative prompt");

    // First click the negative prompt button
    const negativePromptButton = document.querySelector(
      "#main-container > div > div:nth-child(1) > div.designer-container.theme-video > div.designer-component.property-panel > div.property-content > div.panel-box > div > div:nth-child(5) > div > div > a"
    );

    if (!negativePromptButton) {
      console.error("Kling AI Import: Could not find negative prompt button");
      // Continue with callback even if we couldn't find the button
      if (callback) callback();
      return;
    }

    // Click the negative prompt button
    negativePromptButton.click();
    console.log("Kling AI Import: Clicked negative prompt button");

    // Wait 1 second for the negative prompt field to appear
    setTimeout(() => {
      // Find the negative prompt input field
      const negativePromptInput = document.querySelector(
        "#main-container > div > div:nth-child(1) > div.designer-container.theme-video > div.designer-component.property-panel > div.property-content > div.panel-box > div > div:nth-child(5) > div.content > div > div.prompt-wrap > div > div.prompt-input"
      );

      if (!negativePromptInput) {
        console.error(
          "Kling AI Import: Could not find negative prompt input field"
        );
        // Continue with callback even if we couldn't find the input field
        if (callback) callback();
        return;
      }

      // Fill the negative prompt field
      fillContentEditableDiv(negativePromptInput, negativePrompt);
      console.log("Kling AI Import: Filled negative prompt field");

      // Continue with callback
      if (callback) callback();
    }, 1000);
  }

  // Function to setup the completion timer to click Assets button
  function setupCompletionTimer() {
    console.log(
      "Kling AI Import: All images submitted, setting up progress box check"
    );

    // Function to check for progress boxes and click Assets button if none found
    function checkProgressBoxes() {
      const progressBoxes = document.querySelectorAll(
        ".progress-box.vertical-center"
      );
      if (progressBoxes.length === 0) {
        console.log(
          "Kling AI Import: No progress boxes found, clicking Assets button"
        );
        clickAssetsButton();
      } else {
        console.log(
          "Kling AI Import: Progress boxes still present, checking again in 5 seconds"
        );
        setTimeout(checkProgressBoxes, 5000);
      }
    }

    // Start checking for progress boxes
    checkProgressBoxes();
  }

  // Function to click the Assets button
  function clickAssetsButton() {
    console.log(
      "Kling AI Import: Wait time completed, attempting to click Assets button"
    );

    // Try multiple approaches to find the Assets button
    const assetsButtons = [
      // By exact selector
      document.querySelector(
        "button.generic-button.secondary.medium[data-v-10b25476][data-v-b4600797]"
      ),

      // By innerText
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent && button.textContent.includes("Assets")
      ),

      // By SVG icon and inner span
      Array.from(document.querySelectorAll("button")).find((button) => {
        const svg = button.querySelector(
          'svg use[xlink\\:href="#icon-folder"]'
        );
        const span = button.querySelector("span");
        return svg && span && span.textContent === "Assets";
      }),
    ].filter(Boolean);

    if (assetsButtons.length > 0) {
      const assetsButton = assetsButtons[0];
      console.log("Kling AI Import: Found Assets button, clicking it");
      assetsButton.click();
      console.log("Kling AI Import: Clicked Assets button");

      // Wait 2 seconds then click the header button
      setTimeout(() => {
        const headerButton = document.querySelector(
          "#main-material-container > div.header-bar > div:nth-child(2) > button:nth-child(1)"
        );
        if (headerButton) {
          console.log("Kling AI Import: Clicking header button");
          headerButton.click();
          console.log("Kling AI Import: Clicked header button");

          // Wait 2 seconds then start clicking items in sequence
          setTimeout(() => {
            // Get the total number of images from the zip file
            chrome.storage.local.get(["totalImagesToProcess"], function (data) {
              const totalImages = data.totalImagesToProcess || 0;
              console.log(
                `Kling AI Import: Will click ${totalImages} images from zip file`
              );

              let currentIndex = 1;
              const clickNextItem = () => {
                if (currentIndex > totalImages) {
                  console.log("Kling AI Import: Finished clicking all items");

                  // Wait 1 second then click the first button
                  setTimeout(() => {
                    const firstButton = document.querySelector(
                      "#main-material-container > div.header-bar > div:nth-child(2) > div.el-dropdown"
                    );
                    if (firstButton) {
                      console.log("Kling AI Import: Clicking first button");
                      firstButton.click();
                      console.log("Kling AI Import: Clicked first button");

                      // Wait 1 second then click the second button
                      setTimeout(() => {
                        const secondButton = Array.from(
                          document.querySelectorAll("li.el-dropdown-menu__item")
                        ).find((item) =>
                          item.textContent.includes(
                            "Download without Watermark"
                          )
                        );
                        if (secondButton) {
                          console.log(
                            "Kling AI Import: Clicking second button"
                          );
                          secondButton.click();
                          console.log("Kling AI Import: Clicked second button");
                        } else {
                          console.error(
                            "Kling AI Import: Could not find second button"
                          );
                        }
                      }, 1000);
                    } else {
                      console.error(
                        "Kling AI Import: Could not find first button"
                      );
                    }
                  }, 1000);

                  return;
                }

                const itemSelector = `#main-material-container > div.container > div > div:nth-child(${currentIndex}) > div`;
                const item = document.querySelector(itemSelector);

                if (item) {
                  console.log(`Kling AI Import: Clicking item ${currentIndex}`);
                  item.click();
                  console.log(`Kling AI Import: Clicked item ${currentIndex}`);
                  currentIndex++;

                  // Click next item after a short delay
                  setTimeout(clickNextItem, 500);
                } else {
                  console.log(
                    `Kling AI Import: Could not find item ${currentIndex}`
                  );
                  currentIndex++;
                  setTimeout(clickNextItem, 500);
                }
              };

              // Start the sequence
              clickNextItem();
            });
          }, 2000);
        } else {
          console.error("Kling AI Import: Could not find header button");
        }
      }, 2000);
    } else {
      console.error("Kling AI Import: Could not find Assets button");

      // Try more generic approach as fallback
      const allButtons = document.querySelectorAll("button");
      for (const button of allButtons) {
        if (button.textContent && button.textContent.includes("Assets")) {
          console.log(
            "Kling AI Import: Found button with Assets text using fallback method"
          );
          button.click();
          console.log(
            "Kling AI Import: Clicked Assets button using fallback method"
          );
          return;
        }
      }

      console.error(
        "Kling AI Import: All attempts to find Assets button failed"
      );
    }
  }

  // Function to setup processing for the next item
  function setupNextItemProcessing() {
    console.log(
      "Kling AI Import: Setting up listener for completion to process next item"
    );

    // Check if there are more items to process
    chrome.storage.local.get(["klingImportQueue"], function (data) {
      if (data.klingImportQueue && data.klingImportQueue.length > 0) {
        console.log(
          `Kling AI Import: ${data.klingImportQueue.length} items remaining in queue`
        );

        // Update isLastItem flag based on queue size
        isLastItem = data.klingImportQueue.length === 1; // Last item if only one remains

        // Log the next item's description for debugging
        if (data.klingImportQueue.length > 0) {
          console.log(
            "Next description to process (first 50 chars):",
            data.klingImportQueue[0].description.substring(0, 50)
          );

          if (data.klingImportQueue[0].negativePrompt) {
            console.log(
              "Next negative prompt (first 50 chars):",
              data.klingImportQueue[0].negativePrompt.substring(0, 50)
            );
          }
        }

        // Wait a moment and then click the upload new image button
        setTimeout(() => {
          clickUploadNewImageButton(() => {
            processNextItemIfAvailable();
          });
        }, 2000);
      } else {
        console.log("Kling AI Import: All items processed");
        setupCompletionTimer();
      }
    });
  }

  // Function to click the upload new image button
  function clickUploadNewImageButton(callback) {
    console.log("Kling AI Import: Attempting to click upload new image button");

    // Try to find the upload icon button
    const uploadButton = document
      .querySelector(
        'a.el-tooltip__trigger svg[data-v-65769b80][xlink\\:href="#icon-upload"]'
      )
      ?.closest("a");

    if (uploadButton) {
      console.log("Kling AI Import: Found upload button");
      uploadButton.click();
      console.log("Kling AI Import: Clicked upload button");

      if (callback) {
        callback();
      }
    } else {
      console.log(
        "Kling AI Import: Could not find upload button, trying alternatives"
      );

      // Try alternative selectors
      const altButtons = [
        document.querySelector("a[data-v-053dc2b0].el-tooltip__trigger"),
        // Look for SVG icons with upload in the name
        ...Array.from(document.querySelectorAll("svg"))
          .filter(
            (svg) =>
              svg.outerHTML.includes("upload") ||
              (svg.querySelector("use") &&
                svg
                  .querySelector("use")
                  .getAttribute("xlink:href")
                  ?.includes("upload"))
          )
          .map((svg) => svg.closest("a") || svg.closest("button")),
      ].filter(Boolean);

      if (altButtons.length > 0) {
        console.log("Kling AI Import: Found alternative upload button");
        altButtons[0].click();
        console.log("Kling AI Import: Clicked alternative upload button");

        if (callback) {
          callback();
        }
      } else {
        console.log("Kling AI Import: Failed to find upload button");

        // Try to continue anyway
        if (callback) {
          callback();
        }
      }
    }
  }

  // Function to process the next item in the queue
  function processNextItemIfAvailable() {
    chrome.storage.local.get(["klingImportQueue"], function (data) {
      if (data.klingImportQueue && data.klingImportQueue.length > 0) {
        // Get the next item
        const nextItem = data.klingImportQueue.shift();
        const remainingQueue = data.klingImportQueue;

        console.log(
          `Kling AI Import: Processing next item, ${remainingQueue.length} items remaining`
        );
        console.log(
          "Next description (first 50 chars):",
          nextItem.description.substring(0, 50)
        );

        if (nextItem.negativePrompt) {
          console.log(
            "Next negative prompt (first 50 chars):",
            nextItem.negativePrompt.substring(0, 50)
          );
        }

        // Store the next item as the current one to process
        chrome.storage.local.set(
          {
            klingImportImage: nextItem.image,
            klingImportDescription: nextItem.description,
            klingImportNegativePrompt: nextItem.negativePrompt || "", // Include negative prompt
            klingImportQueue: remainingQueue,
          },
          function () {
            // Reload the page to restart the process with the new data
            window.location.reload();
          }
        );
      } else {
        console.log("Kling AI Import: No more items to process");
        setupCompletionTimer();
      }
    });
  }

  // Function to click the Generate button
  function clickGenerateButton(callback) {
    console.log("Kling AI Import: Attempting to click Generate button");

    // First try the exact selector from the HTML
    const exactButton = document.querySelector(
      "button.generic-button.green.big[data-v-10b25476][data-v-502bcbfb]"
    );

    if (exactButton) {
      console.log("Kling AI Import: Found Generate button with exact selector");
      exactButton.click();
      console.log("Kling AI Import: Clicked Generate button");

      if (callback) {
        callback();
      }
      return;
    }

    // Try other approaches to find the button
    const generateButtons = [
      // By class and inner text
      Array.from(document.querySelectorAll(".generic-button.green.big")).find(
        (button) =>
          button.textContent && button.textContent.includes("Generate")
      ),
      // Find by inner div with text
      Array.from(document.querySelectorAll(".inner"))
        .find((div) => div.textContent && div.textContent.includes("Generate"))
        ?.closest("button"),
      // By any button with Generate text
      Array.from(document.querySelectorAll("button")).find(
        (button) =>
          button.textContent && button.textContent.includes("Generate")
      ),
    ].filter(Boolean);

    if (generateButtons.length > 0) {
      const generateButton = generateButtons[0];
      console.log("Kling AI Import: Found Generate button", generateButton);

      // Check if button is enabled before clicking
      const isDisabled =
        generateButton.disabled ||
        generateButton.classList.contains("is-disabled") ||
        generateButton.getAttribute("aria-disabled") === "true";

      if (!isDisabled) {
        // Click the button
        generateButton.click();
        console.log("Kling AI Import: Clicked Generate button");
      } else {
        console.log(
          "Kling AI Import: Generate button is disabled, trying anyway"
        );
        // Try clicking even if it appears disabled
        generateButton.click();
      }

      if (callback) {
        callback();
      }
    } else {
      console.log(
        "Kling AI Import: No Generate button found, trying alternative approach"
      );

      // Last resort - try to find by partial class name or by text content
      const allButtons = document.querySelectorAll("button");
      for (const button of allButtons) {
        if (button.textContent && button.textContent.includes("Generate")) {
          console.log("Kling AI Import: Found button with Generate text");
          button.click();
          console.log("Kling AI Import: Clicked button with Generate text");

          if (callback) {
            callback();
          }
          return;
        }
      }

      console.log("Kling AI Import: Failed to find Generate button");

      // Still call the callback even if we failed to find the button
      if (callback) {
        callback();
      }
    }
  }

  // Helper function to convert a data URL to a Blob
  function dataURLToBlob(dataURL) {
    const parts = dataURL.split(";base64,");
    const contentType = parts[0].split(":")[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  // Helper function to try multiple approaches to fill the description field
  function fillDescriptionField(description) {
    console.log("Kling AI Import: Attempting to fill description");

    // Try to find the element immediately
    tryFindAndFillElement(description);

    // If not found immediately, try again after a delay
    setTimeout(() => tryFindAndFillElement(description), 1000);
    setTimeout(() => tryFindAndFillElement(description), 2000);
    setTimeout(() => tryFindAndFillElement(description), 4000);
  }

  // Try to find and fill the description element
  function tryFindAndFillElement(description) {
    // Approach 1: Find by selector with contenteditable attribute
    const promptInput = document.querySelector(
      '.prompt-input[contenteditable="true"]'
    );

    if (promptInput) {
      console.log(
        "Kling AI Import: Found prompt input by class and contenteditable"
      );
      fillContentEditableDiv(promptInput, description);
      return true;
    }

    // Approach 2: Find by class name only
    const promptByClass = document.querySelector(".prompt-input");

    if (promptByClass) {
      console.log("Kling AI Import: Found prompt input by class name only");
      fillContentEditableDiv(promptByClass, description);
      return true;
    }

    // Approach 3: Find the parent prompt div and then find the input within
    const promptDiv = document.querySelector(".prompt");

    if (promptDiv) {
      const inputInPrompt = promptDiv.querySelector('[contenteditable="true"]');
      if (inputInPrompt) {
        console.log("Kling AI Import: Found prompt input through parent div");
        fillContentEditableDiv(inputInPrompt, description);
        return true;
      }
    }

    // Approach 4: Try all contenteditable elements
    const allContentEditables = document.querySelectorAll(
      '[contenteditable="true"]'
    );
    if (allContentEditables.length > 0) {
      console.log("Kling AI Import: Found contenteditable element as fallback");
      fillContentEditableDiv(allContentEditables[0], description);
      return true;
    }

    console.log("Kling AI Import: No suitable input field found at this time");
    return false;
  }

  // Helper function to fill a contenteditable div with proper events
  function fillContentEditableDiv(element, text) {
    try {
      // Focus the element first
      element.focus();

      // Clear any existing content
      element.innerHTML = "";

      // Method 1: Set innerHTML
      element.innerHTML = text;

      // Method 2: Use document.execCommand
      document.execCommand("insertText", false, text);

      // Method 3: Set textContent and trigger input event
      element.textContent = text;

      // Dispatch multiple events to ensure the framework detects the change
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));

      console.log("Kling AI Import: Description filled using multiple methods");

      // Keep focus on the element
      element.focus();
    } catch (error) {
      console.error(
        "Kling AI Import: Error filling contenteditable div",
        error
      );
    }
  }
})();
