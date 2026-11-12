#!/usr/bin/env bash
# Makes test files (sine-tone "tracks" and simple score PDFs) in the folder given.
# Needs ffmpeg and python3 with reportlab. No real choir music is used.
set -euo pipefail
FX="${1:?usage: make-fixtures.sh <folder>}"
mkdir -p "$FX" && cd "$FX"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=60" -ac 1 River_Full.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=330:duration=60" River_Alto.mp3
cp River_Alto.mp3 River_Alto1.mp3; cp River_Alto.mp3 River_Alto2.mp3
python3 - <<'PY'
from reportlab.pdfgen import canvas
c = canvas.Canvas('score.pdf', pagesize=(595, 842))
for p in range(3):
    c.setFont('Helvetica-Bold', 28); c.drawString(60, 760, f'Let the River Run - page {p+1}')
    for i in range(10): c.line(60, 700-i*60, 535, 700-i*60)
    c.showPage()
c.save()
# A score laid out like the choir-track-timestamps skill output (margin time labels, bar numbers, letters).
c = canvas.Canvas('stamped.pdf', pagesize=(595, 842))
def label(x, y, t):
    c.setFillColorRGB(1, .95, .77); c.roundRect(x-2, y-3, c.stringWidth(t, 'Helvetica-Bold', 8)+4, 11, 2, fill=1, stroke=0)
    c.setFillColorRGB(.48, .18, 0); c.setFont('Helvetica-Bold', 8); c.drawString(x, y, t); c.setFillColorRGB(0, 0, 0)
def letter(x, y, L):
    c.rect(x-3, y-4, 18, 20); c.setFont('Times-Bold', 16); c.drawString(x, y, L)
c.setFont('Times-Roman', 20); c.drawString(150, 800, 'Let the River Run')
for i in range(5): c.line(80, 700-i*6, 560, 700-i*6)
label(8, 690, '0:00'); letter(330, 720, 'A'); label(352, 722, '0:09 / 0:12')
for i in range(5): c.line(80, 560-i*6, 560, 560-i*6)
c.setFont('Times-Roman', 7); c.drawString(62, 570, '9'); label(8, 568, '0:19')
for i in range(5): c.line(80, 420-i*6, 560, 420-i*6)
c.setFont('Times-Roman', 7); c.drawString(62, 430, '15'); letter(85, 445, 'B'); label(8, 428, '0:33')
c.showPage()
for i in range(5): c.line(80, 700-i*6, 560, 700-i*6)
c.setFont('Times-Roman', 7); c.drawString(62, 710, '22'); label(8, 708, '~0:52')
letter(300, 735, 'C'); label(322, 737, '1:05')
c.showPage(); c.save()
# Labels that also carry a part track's time: "0:01 | S2 0:03" (full mix | Soprano 2)
c = canvas.Canvas('stamped-parts.pdf', pagesize=(595, 842))
c.setFont('Times-Roman', 20); c.drawString(150, 800, "Don't Stop Me Now")
for i in range(5): c.line(80, 700-i*6, 560, 700-i*6)
label(8, 712, '0:01 | S2 0:03'); letter(120, 720, 'A')
for i in range(5): c.line(80, 560-i*6, 560, 560-i*6)
c.setFont('Times-Roman', 7); c.drawString(62, 570, '5'); label(8, 568, '0:12 | S2 0:15')
for i in range(5): c.line(80, 420-i*6, 560, 420-i*6)
c.setFont('Times-Roman', 7); c.drawString(70, 430, '9'); letter(85, 445, 'B'); label(8, 428, '0:22 | S2 0:26')
c.showPage(); c.save()
PY
echo "fixtures ready in $FX"
