#!/usr/bin/env bash
# App icons are committed in app/src/main/res (drawn from web-icons-src/bhumika-icon.svg).
# This makes the Play Store icon and website icons from the same SVG.
set -euo pipefail
cd web-icons-src
mkdir -p ../store ../web-icons
mk(){ s=$1; c=$2; o=$3
  sz=$(python3 -c "print($c*512/320)"); x=$(python3 -c "print(($s-$c)/2-96*$c/320)"); y=$(python3 -c "print(($s-$c*316/320)/2-110*$c/320)")
  echo "<svg xmlns='http://www.w3.org/2000/svg' width='$s' height='$s'><rect width='$s' height='$s' fill='#FFFFFF'/><image href='bhumika-icon.svg' x='$x' y='$y' width='$sz' height='$sz'/></svg>" > w.svg
  rsvg-convert w.svg -o $o; }
mk 512 420 ../store/play-icon-512.png
mk 512 420 ../web-icons/icon-512.png
mk 192 158 ../web-icons/icon-192.png
mk 512 330 ../web-icons/icon-maskable-512.png
rm w.svg
