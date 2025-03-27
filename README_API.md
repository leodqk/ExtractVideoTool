# API Documentation with Swagger UI

This project includes comprehensive API documentation using the OpenAPI specification (formerly known as Swagger).

## Using the API Documentation

1. Start the Flask application:

   ```
   python app.py
   ```

2. Access the Swagger UI interface:

   ```
   http://localhost:5000/swagger
   ```

3. The Swagger UI provides:
   - A complete list of all API endpoints
   - Request and response schemas
   - Interactive "Try it out" functionality to test the APIs directly
   - Detailed descriptions of parameters and responses

## API Overview

The API is organized into several sections:

- **Video Processing**: Upload and process videos, extract audio, generate transcripts
- **Keyframes**: Extract, manage, and analyze keyframes from videos
- **Script Generation**: Generate narrative scripts based on keyframes
- **Image Generation**: Generate new images based on keyframes using AI
- **Azure Integration**: Process videos using the Azure Video Indexer

## Key Endpoints

- `/upload` - Legacy endpoint for uploading and processing a video file or URL
- `/upload-method1` - Upload and process a video using frame difference method
- `/upload-method2` - Upload and process a video using transition detection method
- `/extract-keyframes-advanced` - Extract keyframes with advanced configuration
- `/generate-script` - Generate a script from keyframes
- `/generate-image` - Generate new images from keyframes using AI
- `/process-video-azure` - Process video with Azure Video Indexer

## OpenAPI Specification

The complete API specification is available in the `swagger.yaml` file. This file follows the OpenAPI 3.0 standard and can be imported into other API tools like Postman.

## Making API Requests

You can make requests to the API endpoints using:

- The Swagger UI's "Try it out" functionality
- curl commands from the command line
- Any HTTP client like Postman, Insomnia, or code libraries

Example curl request for uploading a video with method 1:

```bash
curl -X POST http://localhost:5000/upload-method1 \
  -F "video=@/path/to/your/video.mp4" \
  -F "threshold=30" \
  -F "max_frames=20" \
  -F "extract_audio=true"
```

Example curl request for uploading a video with method 2:

```bash
curl -X POST http://localhost:5000/upload-method2 \
  -F "video=@/path/to/your/video.mp4" \
  -F "threshold=30" \
  -F "max_frames=20" \
  -F "min_scene_length=15" \
  -F "transition_threshold=0.4" \
  -F "extract_audio=true"
```
