"""
AMO 申請用 zip をビルドするスクリプト。

  src/ 配下のみを zip 化し、dist/tst-multi-function-exporter-<version>.zip を出力する。
  <version> は src/manifest.json の "version" を自動取得。

使い方:
  python scripts/build-zip.py        # 直接
  npm run build:zip                  # package.json 経由
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR  = ROOT_DIR / "src"
DIST_DIR = ROOT_DIR / "dist"
MANIFEST = SRC_DIR / "manifest.json"

# zip に含めないファイル名（大文字小文字無視）
EXCLUDE_NAMES = {".ds_store", "thumbs.db", ".gitkeep"}

def main() -> int:
    if not MANIFEST.is_file():
        print(f"ERROR: manifest.json not found at {MANIFEST}", file=sys.stderr)
        return 1

    with MANIFEST.open("r", encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest.get("version")
    if not version:
        print(f"ERROR: failed to read 'version' from {MANIFEST}", file=sys.stderr)
        return 1

    zip_name = f"tst-multi-function-exporter-{version}.zip"
    zip_path = DIST_DIR / zip_name

    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()

    print(f"[build-zip] version = {version}")
    print(f"[build-zip] zipping {SRC_DIR}/* -> {zip_path}")

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(SRC_DIR.rglob("*")):
            if p.is_dir():
                continue
            if p.name.lower() in EXCLUDE_NAMES:
                continue
            arcname = p.relative_to(SRC_DIR).as_posix()
            zf.write(p, arcname)
            file_count += 1

    # zip ルートに manifest.json が居るか検証
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
    if "manifest.json" not in names:
        print(f"ERROR: manifest.json is not at the root of {zip_name}", file=sys.stderr)
        return 1

    size_kb = zip_path.stat().st_size / 1024
    print(f"[build-zip] OK: {zip_path} ({file_count} files, {size_kb:.1f} KB)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
