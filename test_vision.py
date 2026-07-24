import base64
import requests
import json
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

# Small transparent 1x1 GIF base64 for testing
img_b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
img_data_url = f"data:image/gif;base64,{img_b64}"

print("Testing direct Ollama API...")
resp = requests.post("http://127.0.0.1:11434/api/chat", json={
    "model": "gemma4:e2b",
    "messages": [
        {"role": "user", "content": "Describe exactly what you see in this image. Keep it short.", "images": [img_b64]}
    ],
    "stream": False
})
print("Ollama API Response:", resp.json().get('message', {}).get('content', resp.text))

print("\nTesting LangChain ChatOllama...")
llm = ChatOllama(model="gemma4:e2b", base_url="http://127.0.0.1:11434")
msg = {"role": "user", "content": "Describe exactly what you see in this image. Keep it short.", "images": [img_b64]}
try:
    resp2 = llm.invoke([msg])
    print("LangChain Response:", resp2.content)
except Exception as e:
    print("Langchain error:", str(e))
