import requests
import base64
# pyrefly: ignore [missing-import]
from PIL import Image
import io

# pyrefly: ignore [missing-import]
from PIL import ImageDraw, ImageFont

# Create a 512x512 image
img = Image.new('RGB', (512, 512), color = 'red')
draw = ImageDraw.Draw(img)
draw.text((10, 10), "HELLO WORLD", fill="white")
buf = io.BytesIO()
img.save(buf, format='PNG')
img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

print(f"Generated large image, base64 length: {len(img_b64)}")

payload = {
    "question": "What color is this image?",
    "model": "gemma4:e2b",
    "images": [f"data:image/png;base64,{img_b64}"]
}

print("Testing /chat endpoint...")
resp = requests.post("http://127.0.0.1:8000/chat", json=payload)
print(resp.status_code)
try:
    print(resp.json())
except Exception as e:
    print(resp.text)
