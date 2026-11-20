#!/usr/bin/env bash
# Builds the app icon, splash and website icons from the ORIGINAL Bhumika logo on the live site.
set -euo pipefail
RES=app/src/main/res
curl -fsSL https://bhumikatechai.com/assets/logo-emblem.png -o /tmp/emblem.png
curl -fsSL https://bhumikatechai.com/assets/logo-full.png   -o /tmp/full.png
fit(){ # src  canvas  logo-width-fraction  background  out
  w=$(python3 -c "print(int($2*$3))")
  convert "$1" -filter Lanczos -resize ${w}x${w} -background "$4" -gravity center -extent ${2}x${2} "$5"; }
declare -A D=([mdpi]=1 [hdpi]=1.5 [xhdpi]=2 [xxhdpi]=3 [xxxhdpi]=4)
for k in "${!D[@]}"; do
  L=$(python3 -c "print(int(48*${D[$k]}))"); F=$(python3 -c "print(int(108*${D[$k]}))")
  mkdir -p $RES/mipmap-$k
  fit /tmp/emblem.png $L 0.94 white $RES/mipmap-$k/ic_launcher.png
  fit /tmp/emblem.png $F 0.64 none  $RES/mipmap-$k/ic_launcher_foreground.png
done
mkdir -p $RES/drawable store web-icons
fit /tmp/full.png 420 0.95 none $RES/drawable/splash.png
fit /tmp/emblem.png 512 0.94 white store/play-icon-512.png
cp store/play-icon-512.png web-icons/icon-512.png
fit /tmp/emblem.png 192 0.94 white web-icons/icon-192.png
fit /tmp/emblem.png 512 0.76 white web-icons/icon-maskable-512.png
