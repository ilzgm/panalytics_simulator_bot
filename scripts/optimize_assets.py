from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / "images"

def max_width(path: Path) -> int:
    rel = path.relative_to(IMAGE_ROOT).as_posix()
    if rel.startswith("characters/"):
        return 700
    return 1600

converted = 0
for source in IMAGE_ROOT.rglob("*.png"):
    target = source.with_suffix(".webp")
    try:
        with Image.open(source) as image:
            image.load()
            image.thumbnail((max_width(source), 1600), Image.Resampling.LANCZOS)
            image.save(target, "WEBP", quality=82, method=6)
        converted += 1
        print(f"{source.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
    except Exception as exc:
        raise RuntimeError(f"Failed to convert {source}: {exc}") from exc

print(f"Generated {converted} WebP assets.")
