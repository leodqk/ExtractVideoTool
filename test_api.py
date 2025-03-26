import requests
import json

# Test different threshold values
thresholds = [30, 20, 15, 10, 5]

for threshold in thresholds:
    # Create request to upload-method1 endpoint with different thresholds
    response = requests.post(
        "http://localhost:5000/upload-method1",
        files={"video": open("static/uploads/Im_ill_today_and_I_need_to_keep_warm.mp4", "rb")},
        data={"threshold": str(threshold), "max_frames": "20"}
    )
    
    result = response.json()
    keyframe_count = len(result['keyframes'])
    
    print(f"Threshold: {threshold}, Keyframe count: {keyframe_count}")
    
    # Show detailed frames only for the 15 threshold
    if threshold == 15:
        print(json.dumps(result, indent=2)) 