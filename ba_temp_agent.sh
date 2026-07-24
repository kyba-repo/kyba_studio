#!/bin/bash
while true; do
  temp=$(curl -s "https://wttr.in/Buenos+Aires?format=%t")
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Temperatura en Buenos Aires: $temp"
  sleep 120
done
