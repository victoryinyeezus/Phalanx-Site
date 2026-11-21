#!/usr/bin/env python3
"""Render the 1200x630 Open Graph card from a small local SVG template."""
from pathlib import Path
import base64
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LOGO = "data:image/png;base64," + base64.b64encode((ROOT / "icon-512.png").read_bytes()).decode("ascii")
SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0a0c10"/><stop offset="1" stop-color="#171d29"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#17345b" stop-opacity=".75"/><stop offset="1" stop-color="#17345b" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="1000" cy="170" rx="420" ry="330" fill="url(#glow)"/>
  <rect x="92" y="82" width="94" height="94" rx="21" fill="#fff"/>
  <image href="{LOGO}" x="102" y="92" width="74" height="74"/>
  <text x="210" y="144" fill="#e8eaf0" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="700">Inbox OCD</text>
  <rect x="94" y="238" width="7" height="124" rx="3.5" fill="#4da3ff"/>
  <text x="132" y="294" fill="#f1f3f7" font-family="Arial,Helvetica,sans-serif" font-size="66" font-weight="700" letter-spacing="-2">Find the real mail</text>
  <text x="132" y="372" fill="#f1f3f7" font-family="Arial,Helvetica,sans-serif" font-size="66" font-weight="700" letter-spacing="-2">under the junk.</text>
  <text x="132" y="458" fill="#aab3c2" font-family="Arial,Helvetica,sans-serif" font-size="29">Outlook · Mac &amp; Windows · Pay once</text>
  <rect x="132" y="510" width="112" height="5" rx="2.5" fill="#4da3ff"/>
  <text x="132" y="558" fill="#788496" font-family="Arial,Helvetica,sans-serif" font-size="20" letter-spacing="2">YOUR INBOX. BACK IN VIEW.</text>
</svg>'''

with tempfile.NamedTemporaryFile("w", suffix=".svg", encoding="utf-8") as source:
    source.write(SVG)
    source.flush()
    subprocess.run(["rsvg-convert", "-w", "1200", "-h", "630", "-o", str(ROOT / "og-image.png"), source.name], check=True)
print(ROOT / "og-image.png")
