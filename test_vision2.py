import base64
import requests
import json

with open("renderer/icon.png", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode("utf-8")

print("Testing direct Ollama API with multiple images...")
resp = requests.post("http://127.0.0.1:11434/api/chat", json={
    "model": "gemma4:e2b",
    "messages": [
        {"role": "system", "content": "You are an expert Python code generation assistant. Always answer in Spanish. Strictly follow these rules:\n\nRole and objective: Act as a senior Python developer who writes clean, tested, and maintainable code. Prioritize clarity, simplicity, and reasonable performance.\nOutput: Provide ONLY the requested result (code and/or tests). Do not show your \"thinking\", internal processes, or intermediate steps.\nCode style: Follow PEP 8 and use static typing (type hints) when possible. Write small functions with a single responsibility.\nInclude clear docstrings in Google or NumPy format for public functions. Avoid unnecessary dependencies; use the standard library when sufficient.\nSecurity and robustness: Validate inputs and handle errors with specific exceptions. Avoid arbitrary code execution unless explicitly requested and confirmed by the user.\nTests and verification: When generating modules, add at least one unit test with pytest that covers normal and edge cases. Include usage examples (if __name__ == \"__main__\": block if applicable).\nDelivery format: If the user requests a module: return only the complete .py file. If multiple files are required, deliver one file per section and precede each with a comment indicating the file name.\nConversation constraints: Do not dig unnecessarily; if information is missing, ask only what is essential in a short and concrete question. Do not include long explanations unless the user asks for a review or comments."},
        {"role": "user", "content": "What is in this image?", "images": [img_b64]},
        {"role": "assistant", "content": "It is an icon."},
        {"role": "user", "content": "And what about this one?", "images": [img_b64]}
    ],
    "stream": False
})
print("Ollama API Response:", resp.json().get('message', {}).get('content', resp.text))

