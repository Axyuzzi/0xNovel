from __future__ import annotations

from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
BRAND_DIR = REPO_ROOT / "images" / "brand"
WORDMARK_PAIR = BRAND_DIR / "source" / "0xnovelagent-wordmark-pair.png"
MASTER_ICON = BRAND_DIR / "0xnovelagent-app-icon.png"
BUILDER_DIR = REPO_ROOT / "desktop" / "builder"
PNG_SIZES = [32, 64, 128, 256, 512]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def fit_within(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    ratio = min(max_width / image.width, max_height / image.height)
    target = (max(1, round(image.width * ratio)), max(1, round(image.height * ratio)))
    return image.resize(target, Image.Resampling.LANCZOS)


def extract_wordmark(image: Image.Image, light: bool) -> Image.Image:
    gray = image.convert("L")
    background = 20 if light else 255
    foreground_mask = gray.point(lambda value: 255 if (value > 100 if light else value < 160) else 0)
    bbox = foreground_mask.getbbox()
    if bbox is None:
        raise RuntimeError("No wordmark pixels were detected in the supplied source image.")

    padding = 24
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    cropped_gray = gray.crop((left, top, right, bottom))

    if light:
        alpha = cropped_gray.point(
            lambda value: 0 if value <= background + 3 else min(255, round((value - background) * 255 / (255 - background)))
        )
        color = (255, 255, 255, 0)
    else:
        # The supplied dark artwork contains a baked white/light-gray checkerboard.
        # Treat those light cells as background while retaining soft dark edge pixels.
        alpha = cropped_gray.point(
            lambda value: 0 if value >= 210 else 255 if value <= 50 else round((210 - value) * 255 / 160)
        )
        color = (0, 0, 0, 0)

    wordmark = Image.new("RGBA", cropped_gray.size, color)
    wordmark.putalpha(alpha)
    return wordmark


def save_wordmark_assets() -> None:
    pair = Image.open(WORDMARK_PAIR).convert("RGB")
    midpoint = pair.width // 2
    dark_wordmark = extract_wordmark(pair.crop((0, 0, midpoint, pair.height)), light=False)
    light_wordmark = extract_wordmark(pair.crop((midpoint, 0, pair.width, pair.height)), light=True)

    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    dark_wordmark.save(BRAND_DIR / "0xnovelagent-wordmark-dark.png")
    light_wordmark.save(BRAND_DIR / "0xnovelagent-wordmark-light.png")

    for wordmark, background, output_name in (
        (dark_wordmark, (255, 255, 255, 255), "0xnovelagent-logo-dark-on-light.png"),
        (light_wordmark, (20, 20, 20, 255), "0xnovelagent-logo-light-on-dark.png"),
    ):
        preview = Image.new("RGBA", (1024, 1024), background)
        fitted = fit_within(wordmark, 820, 360)
        preview.alpha_composite(fitted, ((preview.width - fitted.width) // 2, (preview.height - fitted.height) // 2))
        preview.convert("RGB").save(BRAND_DIR / output_name)


def resized_icon(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.Resampling.LANCZOS)


def save_icon_assets() -> None:
    master = Image.open(MASTER_ICON).convert("RGBA")
    if master.size != (1024, 1024):
        raise RuntimeError(f"Expected a 1024x1024 master icon, received {master.size}.")

    BUILDER_DIR.mkdir(parents=True, exist_ok=True)
    for size in PNG_SIZES:
        resized_icon(master, size).save(BUILDER_DIR / f"app-icon-{size}.png")
    resized_icon(master, 512).save(BUILDER_DIR / "app-icon.png")
    master.save(BUILDER_DIR / "app-icon.ico", sizes=ICO_SIZES)

    client_public = REPO_ROOT / "client" / "public"
    resized_icon(master, 256).save(REPO_ROOT / "client" / "src" / "assets" / "app-icon.png")
    resized_icon(master, 512).save(client_public / "web-app-icon.png")
    resized_icon(master, 128).save(client_public / "apple-touch-icon.png")
    resized_icon(master, 32).save(client_public / "favicon-32x32.png")
    master.save(client_public / "favicon.ico", sizes=ICO_SIZES)

    site_public = REPO_ROOT / "site" / "public"
    resized_icon(master, 256).save(REPO_ROOT / "site" / "src" / "assets" / "app-icon.png")
    resized_icon(master, 32).save(site_public / "favicon-32.png")
    master.save(site_public / "favicon.ico", sizes=ICO_SIZES)


def main() -> None:
    save_wordmark_assets()
    save_icon_assets()
    print(f"Generated 0xNovelAgent brand and application icons from {BRAND_DIR}")


if __name__ == "__main__":
    main()
