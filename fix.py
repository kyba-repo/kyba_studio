content = open('renderer/custom_chat.js', 'r', encoding='utf-8').read()
content = content.replace('\\\'', '''')
open('renderer/custom_chat.js', 'w', encoding='utf-8').write(content)
