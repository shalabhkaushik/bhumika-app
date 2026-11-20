#!/usr/bin/env bash
# Downloads the Bhumika logo from the live site and makes all launcher icons + splash.
set -euo pipefail
RES=app/src/main/res
curl -fsSL https://bhumikatechai.com/assets/logo-emblem.png -o /tmp/logo.png
declare -A D=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
for k in "${!D[@]}"; do
  s=${D[$k]}; fg=$((s*108/48)); inner=$((fg*60/100))
  mkdir -p $RES/mipmap-$k
  convert /tmp/logo.png -background white -alpha remove -resize ${s}x${s} -gravity center -extent ${s}x${s} $RES/mipmap-$k/ic_launcher.png
  convert /tmp/logo.png -background none -resize ${inner}x${inner} -gravity center -extent ${fg}x${fg} $RES/mipmap-$k/ic_launcher_foreground.png
done
mkdir -p $RES/drawable
convert /tmp/logo.png -background none -resize 384x384 -gravity center -extent 384x384 $RES/drawable/splash.png
# Play Store listing icon and web icons for the site
mkdir -p store web-icons
convert /tmp/logo.png -background white -alpha remove -resize 512x512 -gravity center -extent 512x512 store/play-icon-512.png
cp store/play-icon-512.png web-icons/icon-512.png
convert /tmp/logo.png -background white -alpha remove -resize 192x192 -gravity center -extent 192x192 web-icons/icon-192.png
convert /tmp/logo.png -background white -alpha remove -resize 400x400 -gravity center -extent 512x512 web-icons/icon-maskable-512.png
