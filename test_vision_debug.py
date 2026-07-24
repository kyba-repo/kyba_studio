import requests
import base64

# Read a real image file
with open("renderer/icon.png", "rb") as f:
    raw_bytes = f.read()

img_b64 = base64.b64encode(raw_bytes).decode("utf-8")
print(f"Image base64 length: {len(img_b64)}")
print(f"First 60 chars: {img_b64[:60]}")

# Test 1: Direct to Ollama (this worked before)
print("\n=== TEST 1: Direct Ollama API ===")
resp1 = requests.post("http://127.0.0.1:11434/api/chat", json={
    "model": "llava:latest",
    "messages": [
        {"role": "user", "content": "What do you see in this image? Describe it briefly.", "images": [img_b64]}
    ],
    "stream": False
}, timeout=120)
print(f"Status: {resp1.status_code}")
print(f"Answer: {resp1.json().get('message', {}).get('content', '')[:200]}")

# Test 2: Through Kyba backend /chat
print("\n=== TEST 2: Kyba /chat endpoint ===")
resp2 = requests.post("http://127.0.0.1:8000/chat", json={
    "question": "What do you see in this image? Describe it briefly.",
    "model": "llava:latest",
    "images": [f"data:image/png;base64,{img_b64}"]
}, timeout=120)
print(f"Status: {resp2.status_code}")
if resp2.status_code == 200:
    print(f"Answer: {resp2.json().get('answer', '')[:200]}")
else:
    print(f"Error: {resp2.text[:300]}")

# Test 3: Through Kyba /chat but sending raw base64 without data: prefix
print("\n=== TEST 3: Kyba /chat (raw base64) ===")
resp3 = requests.post("http://127.0.0.1:8000/chat", json={
    "question": "What do you see in this image? Describe it briefly.",
    "model": "llava:latest",
    "images": [img_b64]
}, timeout=120)
print(f"Status: {resp3.status_code}")
if resp3.status_code == 200:
    print(f"Answer: {resp3.json().get('answer', '')[:200]}")
else:
    print(f"Error: {resp3.text[:300]}")
