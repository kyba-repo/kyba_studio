import re, json, uuid
content = '"name": "hello",\n"arguments": {}'
cleaned_content = content.strip()
if cleaned_content.startswith('"name"'):
    cleaned_content = '{' + cleaned_content
match = re.search(r'"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*\})', cleaned_content.replace('\n', ' '))
print('match:', match)
