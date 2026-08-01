import requests
import json
import base64

doc_content = b"This is a secret document. The password is: kyba2026."
doc_b64 = base64.b64encode(doc_content).decode('utf-8')

payload = {
    "model": "gemma4:e2b",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is the password in the document?"}
    ],
    "documents": [
        {"filename": "secret.txt", "content": doc_b64}
    ]
}

print("Testing /agent_chat...")
resp = requests.post("http://127.0.0.1:8000/agent_chat", json=payload)
if resp.status_code == 200:
    data = resp.json()
    print("RESPONSE:", json.dumps(data, indent=2))
else:
    print("ERROR:", resp.status_code, resp.text)
