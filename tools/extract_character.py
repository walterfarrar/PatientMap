"""One-off: crop the patient character out of the reference screenshot and
key the smooth gradient background to transparency. Output: assets/patient.png"""
from collections import deque
from PIL import Image, ImageFilter
import os

SRC = os.path.expanduser(
    r"~/.cursor/projects/c-git-PatientMap/assets/"
    r"c__Users_walte_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"empty-window_images_image-8fcbe827-60ad-4e96-b188-4e254708b1bc.png"
)
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "patient.png")

CROP = (36, 44, 262, 580)      # left, top, right, bottom
STEP_TOL = 17                  # per-step neighbour colour distance to treat as bg

img = Image.open(SRC).convert("RGBA").crop(CROP)
w, h = img.size
px = img.load()

def dist(a, b):
    return abs(a[0]-b[0]) + abs(a[1]-b[1]) + abs(a[2]-b[2])

visited = bytearray(w * h)
q = deque()

def seed(x, y):
    i = y * w + x
    if not visited[i]:
        visited[i] = 1
        q.append((x, y))

for x in range(w):
    seed(x, 0); seed(x, h - 1)
for y in range(h):
    seed(0, y); seed(w - 1, y)

# region-grow background along smooth gradients; sharp edges (the figure) stop it
while q:
    x, y = q.popleft()
    c = px[x, y]
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            i = ny * w + nx
            if not visited[i] and dist(px[nx, ny], c) <= STEP_TOL:
                visited[i] = 1
                q.append((nx, ny))

# build alpha band: background -> 0  (edit a real 'L' band, then putalpha)
alpha_band = Image.new("L", (w, h), 255)
ap = alpha_band.load()
for y in range(h):
    for x in range(w):
        if visited[y * w + x]:
            ap[x, y] = 0

alpha_band = alpha_band.filter(ImageFilter.GaussianBlur(0.6))
img.putalpha(alpha_band)

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print("saved", OUT, img.size)

# preview composite on a dark panel so the cut is easy to judge
preview = Image.new("RGBA", img.size, (12, 20, 36, 255))
preview.alpha_composite(img)
prev_path = os.path.join(os.path.dirname(OUT), "patient_preview.png")
preview.convert("RGB").save(prev_path)
print("preview", prev_path)
