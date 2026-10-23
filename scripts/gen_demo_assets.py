#!/usr/bin/env python3
"""Generate warm, minimal SVG placeholder art for the demo cafe menu."""
import os

OUT = "/home/z/my-project/public/assets/img"

ICON_CUP = '<g transform="translate(150,150)"><path d="M-55,-20 h80 v55 a28,28 0 0 1 -28,28 h-24 a28,28 0 0 1 -28,-28 z" fill="rgba(255,255,255,0.92)"/><path d="M25,-12 h14 a18,18 0 0 1 0,36 h-14" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="9"/><ellipse cx="-15" cy="-20" rx="40" ry="10" fill="#6f4e37"/><path d="M-38,-48 q6,-12 0,-24 M-12,-48 q6,-12 0,-24 M14,-48 q6,-12 0,-24" stroke="rgba(255,255,255,0.75)" stroke-width="6" fill="none" stroke-linecap="round"/></g>'
ICON_MUG = '<g transform="translate(150,150)"><rect x="-52" y="-24" width="92" height="82" rx="18" fill="rgba(255,255,255,0.92)"/><path d="M40,-10 h12 a17,17 0 0 1 0,34 h-12" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="9"/><path d="M-24,-52 q8,-14 0,-26 M6,-52 q8,-14 0,-26" stroke="rgba(255,255,255,0.7)" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="-6" cy="18" r="22" fill="{d}"/></g>'
ICON_ICE = '<g transform="translate(150,150)"><path d="M-40,-55 h80 l-12,110 a12,12 0 0 1 -12,11 h-32 a12,12 0 0 1 -12,-11 z" fill="rgba(255,255,255,0.92)"/><rect x="-28" y="-8" width="56" height="52" rx="8" fill="{d}"/><rect x="-30,-30" y="-30" width="20" height="20" rx="4" fill="rgba(255,255,255,0.65)" transform="rotate(12 -20 -20)"/><rect x="8" y="-34" width="18" height="18" rx="4" fill="rgba(255,255,255,0.65)" transform="rotate(-14 17 -25)"/><path d="M-14,-64 l8,10 M14,-64 l-8,10" stroke="rgba(255,255,255,0.7)" stroke-width="5" stroke-linecap="round"/></g>'
ICON_CAKE = '<g transform="translate(150,150)"><path d="M-58,42 v-38 l58,-30 58,30 v38 z" fill="rgba(255,255,255,0.92)"/><path d="M-58,4 l58,-30 58,30" fill="{d}"/><rect x="-58" y="26" width="116" height="16" rx="6" fill="{d}"/><circle cx="0" cy="-34" r="6" fill="#e11d48"/><path d="M0,-34 v-16" stroke="#e11d48" stroke-width="4"/><path d="M-58,4 q10,10 20,0 q10,-10 20,0 q10,10 20,0 q10,-10 20,0 q10,10 18,0" stroke="rgba(255,255,255,0.9)" stroke-width="6" fill="none"/></g>'
ICON_LEAF = '<g transform="translate(150,150)"><path d="M-46,10 q-8,-52 46,-56 q54,4 46,56 q-4,42 -46,46 q-42,-4 -46,-46 z" fill="rgba(255,255,255,0.92)"/><path d="M0,-42 q3,44 0,88 M0,-10 q-16,4 -26,20 M0,12 q16,2 26,16" stroke="{d}" stroke-width="7" fill="none" stroke-linecap="round"/></g>'
ICON_PLATE = '<g transform="translate(150,150)"><circle cx="0" cy="6" r="72" fill="rgba(255,255,255,0.92)"/><circle cx="0" cy="6" r="52" fill="{d}"/><ellipse cx="-14" cy="-2" rx="26" ry="14" fill="rgba(255,255,255,0.95)"/><ellipse cx="22" cy="14" rx="14" ry="8" fill="rgba(255,255,255,0.85)"/></g>'
ICON_GLASS = '<g transform="translate(150,150)"><path d="M-42,-58 h84 l-14,114 a10,10 0 0 1 -10,9 h-36 a10,10 0 0 1 -10,-9 z" fill="rgba(255,255,255,0.92)"/><path d="M-34,-14 h68 l-8,66 h-52 z" fill="{d}"/><circle cx="-12" cy="6" r="6" fill="rgba(255,255,255,0.8)"/><circle cx="10" cy="20" r="5" fill="rgba(255,255,255,0.8)"/><path d="M-8,-70 l10,14 M18,-70 l-10,14" stroke="rgba(255,255,255,0.75)" stroke-width="5" stroke-linecap="round"/></g>'

ICONS = {
    "espresso": (ICON_CUP, "#4b2e22", "#7c4a2d"),
    "cappuccino": (ICON_MUG, "#8a5a3b", "#a9714b"),
    "latte": (ICON_MUG, "#a9714b", "#c08b5c"),
    "mocha": (ICON_MUG, "#5d3a29", "#8a5a3b"),
    "masala": (ICON_MUG, "#b45309", "#d97706"),
    "hot-chocolate": (ICON_MUG, "#6b3f23", "#8a5a3b"),
    "herbal": (ICON_LEAF, "#4d7c0f", "#65a30d"),
    "americano": (ICON_CUP, "#4b2e22", "#5f3b2a"),
    "ice-latte": (ICON_ICE, "#8a5a3b", "#a9714b"),
    "mojito": (ICON_GLASS, "#15803d", "#22c55e"),
    "lemonade": (ICON_GLASS, "#ca8a04", "#eab308"),
    "cheesecake": (ICON_CAKE, "#d9a441", "#f0c878"),
    "tiramisu": (ICON_CAKE, "#6b4a32", "#8a6a4b"),
    "brownie": (ICON_CAKE, "#4b2e22", "#6f4e37"),
    "eclair": (ICON_CAKE, "#8a5a3b", "#b07a4d"),
    "omelette": (ICON_PLATE, "#e8a020", "#f4b942"),
    "combo": (ICON_PLATE, "#7c4a2d", "#a9714b"),
}


def product_svg(icon_tpl, c1, c2):
    icon = icon_tpl.replace("{d}", c2)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{c1}"/>
<stop offset="1" stop-color="{c2}"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.32" r="0.75">
<stop offset="0" stop-color="rgba(255,255,255,0.28)"/>
<stop offset="1" stop-color="rgba(255,255,255,0)"/>
</radialGradient>
</defs>
<rect width="300" height="300" fill="url(#bg)"/>
<rect width="300" height="300" fill="url(#glow)"/>
<circle cx="46" cy="258" r="90" fill="rgba(255,255,255,0.08)"/>
<circle cx="262" cy="36" r="70" fill="rgba(255,255,255,0.09)"/>
{icon}
</svg>"""


LOGO_LAM = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#6f4e37"/><stop offset="1" stop-color="#8a5a3b"/>
</linearGradient></defs>
<rect width="200" height="200" rx="48" fill="url(#g)"/>
<path d="M62 78 h64 v46 a26 26 0 0 1 -26 26 h-12 a26 26 0 0 1 -26 -26 z" fill="#fff3e4"/>
<path d="M126 86 h10 a16 16 0 0 1 0 32 h-10" fill="none" stroke="#fff3e4" stroke-width="8"/>
<ellipse cx="94" cy="78" rx="32" ry="9" fill="#3d2817"/>
<path d="M76 52 q6 -12 0 -22 M94 52 q6 -12 0 -22 M112 52 q6 -12 0 -22" stroke="#fff3e4" stroke-width="6" fill="none" stroke-linecap="round"/>
<text x="100" y="182" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff3e4" text-anchor="middle">LAM</text>
</svg>"""

LOGO_SHAHR = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#57534e"/><stop offset="1" stop-color="#78716c"/>
</linearGradient></defs>
<rect width="200" height="200" rx="40" fill="url(#g)"/>
<path d="M55 90 h58 v42 a24 24 0 0 1 -24 24 h-10 a24 24 0 0 1 -24 -24 z" fill="#fafaf9"/>
<path d="M113 96 h10 a15 15 0 0 1 0 30 h-10" fill="none" stroke="#fafaf9" stroke-width="8"/>
<ellipse cx="84" cy="90" rx="29" ry="8" fill="#292524"/>
<text x="100" y="180" font-family="sans-serif" font-size="19" font-weight="700" fill="#fafaf9" text-anchor="middle">SHAHR</text>
</svg>"""

COVER_LAM = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#3d2817"/><stop offset="0.55" stop-color="#6f4e37"/><stop offset="1" stop-color="#a9714b"/>
</linearGradient>
<radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="rgba(255,214,150,0.85)"/><stop offset="1" stop-color="rgba(255,214,150,0)"/>
</radialGradient>
</defs>
<rect width="1200" height="480" fill="url(#sky)"/>
<g fill="rgba(255,220,170,0.16)">
<circle cx="180" cy="90" r="60"/><circle cx="420" cy="60" r="80"/><circle cx="760" cy="80" r="70"/><circle cx="1040" cy="70" r="90"/>
</g>
<g stroke="rgba(255,225,180,0.5)" stroke-width="5" fill="none">
<path d="M140 0 v70 M420 0 v40 M760 0 v60 M1040 0 v50"/>
</g>
<g fill="#ffd896">
<circle cx="140" cy="82" r="26" fill="url(#lamp)"/><circle cx="140" cy="82" r="12"/>
<circle cx="420" cy="52" r="30" fill="url(#lamp)"/><circle cx="420" cy="52" r="13"/>
<circle cx="760" cy="72" r="28" fill="url(#lamp)"/><circle cx="760" cy="72" r="12"/>
<circle cx="1040" cy="62" r="32" fill="url(#lamp)"/><circle cx="1040" cy="62" r="14"/>
</g>
<rect y="330" width="1200" height="150" fill="rgba(30,20,12,0.55)"/>
<g fill="rgba(255,243,228,0.9)">
<path d="M330 330 v-90 h22 v90 z"/><path d="M330 250 q-40 8 -40 46 h22 z"/>
<circle cx="500" cy="300" r="30" fill="rgba(255,243,228,0.25)"/>
<path d="M760 330 v-96 h24 v96 z"/><path d="M784 240 h18 a24 24 0 0 1 0 48 h-18"/>
<circle cx="960" cy="296" r="34" fill="rgba(255,243,228,0.25)"/>
</g>
</svg>"""

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="16" fill="#7c4a2d"/>
<path d="M20 26 h20 v14 a9 9 0 0 1 -9 9 h-2 a9 9 0 0 1 -9 -9 z" fill="#fff3e4"/>
<path d="M40 28 h3 a6 6 0 0 1 0 12 h-3" fill="none" stroke="#fff3e4" stroke-width="3"/>
<ellipse cx="30" cy="26" rx="10" ry="3" fill="#3d2817"/>
</svg>"""

os.makedirs(f"{OUT}/products", exist_ok=True)
with open(f"{OUT}/favicon.svg", "w") as f:
    f.write(FAVICON)
with open(f"{OUT}/logo-lam.svg", "w") as f:
    f.write(LOGO_LAM)
with open(f"{OUT}/logo-shahr.svg", "w") as f:
    f.write(LOGO_SHAHR)
with open(f"{OUT}/cover-lam.svg", "w") as f:
    f.write(COVER_LAM)
for name, (tpl, c1, c2) in ICONS.items():
    with open(f"{OUT}/products/{name}.svg", "w") as f:
        f.write(product_svg(tpl, c1, c2))

print("generated:", len(ICONS) + 4, "files under", OUT)
