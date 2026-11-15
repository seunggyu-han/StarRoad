"""Build the original StarRoad display font and its wordmark and launcher artwork.

Authoring dependencies: fontTools, uharfbuzz, skia-pathops, Pillow. The app uses the built assets.
"""
import calendar
from math import ceil
from pathlib import Path
import re
import string
from xml.etree import ElementTree

import pathops
import uharfbuzz as hb
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.transform import Identity, Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "ui/fonts/StarRoadDisplay.ttf"
RES = ROOT / "app/src/main/res"
WORDMARK = "StarRoad"

# Road centerlines. The capital rails sit at y=10 and y=41 in SVG coordinates.
# The S follows the original two-turn route from its starting ring to its four-point star.
ROADS = {
    "A": "M3 41 L16 13 Q19 6.4 22 13 L35 41 M9 30 H29",
    "B": "M5 41 V10 H22 C36 10 37 25 23 25 H5 M21 25 C39 25 39 41 23 41 H5",
    "C": "M34 13 Q30 10 23 10 H16 C-1 10 -1 41 16 41 H23 Q31 41 35 37",
    "D": "M5 10 H18 C31 10 38 15 38 25.5 S31 41 18 41 H5 Z",
    "E": "M32 10 H8 Q5 10 5 13 V38 Q5 41 8 41 H32 M5 25 H26",
    "F": "M5 41 V14 Q5 10 9 10 H32 M5 25 H26",
    "G": "M35 13 Q30 10 23 10 H17 C0 10 0 41 17 41 H23 Q32 41 35 37 V27 H24",
    "H": "M5 10 V41 M35 10 V41 M5 25 H35",
    "I": "M5 10 H21 M13 10 V41 M5 41 H21",
    "J": "M26 10 V29 Q26 41 14 41 Q6 41 3 36",
    "K": "M5 10 V41 M33 10 L16 24 Q14 26 10 26 H5 M16 24 L34 41",
    "L": "M5 10 V36 Q5 41 10 41 H31",
    "M": "M5 41 V12 Q5 8 8 12 L23 32 L38 12 Q41 8 41 12 V41",
    "N": "M5 41 V12 Q5 8 8 12 L32 39 Q35 43 35 39 V10",
    "O": "M18 10 H24 C41 10 41 41 24 41 H18 C1 41 1 10 18 10 Z",
    "P": "M5 41 V10 H23 C38 10 38 27 23 27 H5",
    "Q": "M18 10 H24 C41 10 41 41 24 41 H18 C1 41 1 10 18 10 Z M25 31 L38 44",
    "R": "M5 41 V10 H23 C38 10 38 26 23 26 H5 M18 26 Q22 26 25 30 L35 41",
    "S": "M7 41 H31 C45 41 45 25 32 25 H21 C8 25 8 10 21 10 H44",
    "T": "M2 10 H36 M19 41 V16 Q19 10 25 10",
    "U": "M5 10 V27 Q5 41 19 41 H21 Q35 41 35 27 V10",
    "V": "M3 10 L16 38 Q19 44.5 22 38 L35 10",
    "W": "M3 10 L11 38 Q12 44 15 38 L24 18 L33 38 Q36 44 37 38 L45 10",
    "X": "M4 10 L34 41 M34 10 L4 41",
    "Y": "M3 10 L17 25 Q19 27 20 27 L36 10 M20 27 V41",
    "Z": "M4 10 H31 Q35 10 32 13 L6 38 Q3 41 7 41 H34",
}
D_STAR_Y = 6
LOWERCASE = {
    "t": "M12 12 V32 Q12 41 20 41 H23 M3 23 H23",
    "a": "M29 30.5 C29 24 24 20 18 20 H15 C0 20 0 41 15 41 H18 C24 41 29 37 29 30.5 Z M29 20 V41",
    "r": "M5 41 V20 M5 31 C5 24 11 20 18 20 H20",
    "o": "M15 20 H19 C34 20 34 41 19 41 H15 C0 41 0 20 15 20 Z",
    "d": f"M29 {D_STAR_Y} V41 M29 30.5 C29 24 24 20 18 20 H15 C0 20 0 41 15 41 H18 C24 41 29 37 29 30.5 Z",
}
STAR = "M44 1.5 Q45.5 8.5 52.5 10 Q45.5 11.5 44 18.5 Q42.5 11.5 35.5 10 Q42.5 8.5 44 1.5 Z"
# Optical kerning in units per 1000 em. T tucks into the space beyond the S star.
KERN = {"ST": -54, "St": -50, "TA": -55, "AT": -40, "VA": -45, "AV": -45, "WA": -35, "YA": -50, "OA": -20, "TO": -20}


def path(data):
    shape = pathops.Path()
    parse_path(data, shape.getPen())
    return shape


def disk(radius):
    return path(f"M{7-radius} 41 a{radius} {radius} 0 1 0 {2*radius} 0 a{radius} {radius} 0 1 0 {-2*radius} 0 Z")


def place(shape, anchor, target, scale):
    return shape.transform(scale, 0, 0, scale, target[0]-scale*anchor[0], target[1]-scale*anchor[1])


def make_glyph(letter, data):
    shape = path(data)
    shape.stroke(6.5, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    shape.convertConicsToQuads(.01)
    shape = pathops.simplify(shape)
    if letter == "S":
        for ornament in (disk(7.25), path(STAR)):
            shape = pathops.op(shape, ornament, pathops.PathOp.UNION)
        shape = pathops.op(shape, disk(3.75), pathops.PathOp.DIFFERENCE)
    elif letter == "R.road":
        for radius, op in [(7.25, pathops.PathOp.UNION), (3.75, pathops.PathOp.DIFFERENCE)]:
            shape = pathops.op(shape, place(disk(radius), (7, 41), (5, 41), .78), op)
    elif letter == "d":
        shape = pathops.op(shape, place(path(STAR), (44, 10), (29, D_STAR_Y), .76), pathops.PathOp.UNION)
    left, _, right, _ = shape.bounds
    bearing = 56
    pen = TTGlyphPen(None)
    fit = Transform(20, 0, 0, -20, bearing-left*20, 44.25*20)
    shape.draw(TransformPen(Cu2QuPen(pen, .5), fit))
    return pen.glyph(), (round((right-left)*20+2*bearing), bearing)


def build_font():
    alphabet = list(string.ascii_uppercase)
    assert list(ROADS) == alphabet
    roads = {**ROADS, **LOWERCASE, "R.road": ROADS["R"]}
    chars = {ord(c): c if c in LOWERCASE else c.upper() for c in string.ascii_letters}
    chars[ord(" ")] = "space"
    glyphs = {"space": TTGlyphPen(None).glyph()}
    metrics = {"space": (340, 0)}
    glyphs[".notdef"], metrics[".notdef"] = make_glyph(".notdef", "M5 10 H27 V41 H5 Z")
    for letter, road in roads.items():
        glyphs[letter], metrics[letter] = make_glyph(letter, road)

    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder([".notdef", "space", *roads])
    builder.setupCharacterMap(chars)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=900, descent=-120, lineGap=0)
    builder.setupNameTable({
        "familyName": "StarRoad Display", "styleName": "Regular",
        "fullName": "StarRoad Display Regular", "psName": "StarRoadDisplay-Regular",
        "uniqueFontIdentifier": "StarRoad Display Regular 1.101", "version": "Version 1.101",
        "description": "Original road lettering for the StarRoad wordmark.",
    })
    builder.setupOS2(fsType=0, sTypoAscender=900, sTypoDescender=-120, sTypoLineGap=0,
                     usWinAscent=900, usWinDescent=120, sCapHeight=750)
    builder.setupPost()
    builder.setupMaxp()
    kern = newTable("kern")
    kern.version = 0
    table = KernTable_format_0()
    table.version, table.coverage = 0, 1
    table.kernTable = {tuple(pair): value for pair, value in KERN.items()}
    kern.kernTables = [table]
    builder.font["kern"] = kern
    addOpenTypeFeaturesFromString(builder.font, "languagesystem DFLT dflt; languagesystem latn dflt; feature calt { sub [R r] R' by R.road; } calt;")
    stamp = calendar.timegm((2026, 11, 15, 0, 0, 0)) + 2082844800
    builder.font["head"].created = builder.font["head"].modified = stamp
    builder.font["head"].fontRevision = 1.101
    builder.font.recalcTimestamp = False
    FONT.parent.mkdir(exist_ok=True)
    builder.save(FONT)


def draw_letters(font, text, pen, transform=Identity):
    # Shape the exported paths just like WebView shapes the embedded font, including contextual R and pair kerning.
    face = hb.Font(hb.Face(FONT.read_bytes()))
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(face, buffer)
    glyphs = font.getGlyphSet()
    cursor = 0
    for glyph, position in zip(buffer.glyph_infos, buffer.glyph_positions):
        outline = glyphs[font.getGlyphName(glyph.codepoint)]
        outline.draw(TransformPen(pen, transform.translate(cursor + position.x_offset, position.y_offset)))
        cursor += position.x_advance


def fitted_path(font, text, width, height, decimals=2, vertical_bounds=None):
    bounds = BoundsPen(font.getGlyphSet())
    draw_letters(font, text, bounds)
    left, bottom, right, top = bounds.bounds
    if vertical_bounds is not None:
        bottom, top = vertical_bounds
    scale = min(width/(right-left), height/(top-bottom))
    pen = SVGPathPen(font.getGlyphSet(), ntos=lambda n: format(round(n, decimals), "g"))
    draw_letters(font, text, pen, Transform(scale, 0, 0, -scale, (width-(left+right)*scale)/2, (height+(top+bottom)*scale)/2))
    return pen.getCommands()


def write_vector(font, target, glyph_size, stamp=False):
    # A 1080-unit integer grid keeps the icon compact at one tenth of a design pixel.
    mark = fitted_path(font, "S", glyph_size, glyph_size, decimals=0)
    padding = (1080-glyph_size)/2
    background = ('    <path android:fillColor="@color/drive_stamp_background" '
                  'android:pathData="M240,0 H840 Q1080,0 1080,240 V840 Q1080,1080 840,1080 H240 Q0,1080 0,840 V240 Q0,0 240,0 Z"/>\n')
    dp = 384 if stamp else 108
    data = (f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="{dp}dp" '
            f'android:height="{dp}dp" android:viewportWidth="1080" android:viewportHeight="1080">\n'
            + (background if stamp else "") +
            f'    <group android:translateX="{padding:g}" android:translateY="{padding:g}">\n'
            f'        <path android:fillColor="@color/drive_star_ink" android:pathData="{mark}"/>\n'
            '    </group>\n</vector>\n')
    target.write_bytes(data.encode())


def write_bitmaps():
    palette = {n.get("name"): n.text for n in ElementTree.parse(RES/"values/drive_colors.xml").findall("color")}
    face = ImageFont.truetype(str(FONT), 1500)
    ink = face.getmask("S", mode="L")
    mark = Image.frombytes("L", ink.size, bytes(ink))
    mark = mark.crop(mark.getbbox())
    for dpi, size in [("mdpi",48), ("hdpi",72), ("xhdpi",96), ("xxhdpi",144), ("xxxhdpi",192)]:
        pixels = size*8
        im = Image.new("RGBA", (pixels,pixels))
        ImageDraw.Draw(im).rounded_rectangle((0,0,pixels-1,pixels-1), radius=pixels*24/108, fill=palette["drive_stamp_background"])
        w = round(pixels*78/108)
        h = round(w*mark.height/mark.width)
        mask = mark.resize((w,h),Image.Resampling.LANCZOS)
        im.paste(palette["drive_star_ink"], ((pixels-w)//2,(pixels-h)//2,(pixels-w)//2+w,(pixels-h)//2+h), mask)
        im.resize((size,size),Image.Resampling.LANCZOS).save(RES/f"mipmap-{dpi}/drive_route.png")


if __name__ == "__main__":
    build_font()
    with TTFont(FONT) as font:
        # The printable card uses the actual font contours and kerning, independent of font-load timing.
        ink = BoundsPen(font.getGlyphSet())
        draw_letters(font, WORDMARK, ink)
        left, bottom, right, top = ink.bounds
        # Keep the card's lettering at the S icon's scale and baseline as the d ascender changes.
        initial = font["glyf"]["S"]
        scale = 76 / (initial.yMax - initial.yMin)
        word_width = round((right-left)*scale)+2
        above = max(0, ceil((top-initial.yMax)*scale))
        below = max(0, ceil((initial.yMin-bottom)*scale))
        word = fitted_path(font, WORDMARK, word_width, 76, vertical_bounds=(initial.yMin, initial.yMax))
        symbols = ROOT / "ui/lettering.svg"
        data, count = re.subn(r'<symbol id="brand-wordmark"[^\n]+?</symbol>',
                              f'<symbol id="brand-wordmark" viewBox="0 {-above} {word_width} {76+above+below}"><path fill="currentColor" d="{word}"/></symbol>',
                              symbols.read_text(encoding="utf-8"))
        if count != 1:
            raise ValueError("Expected one printable wordmark")
        symbols.write_bytes(data.encode())
        write_vector(font, RES/"drawable/drive_mark.xml", 520)
        write_vector(font, RES/"mipmap-anydpi/drive_route.xml", 780, stamp=True)
    write_bitmaps()
