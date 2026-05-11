from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF
import numpy as np

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_PATH = ROOT / "guide" / "TA-04_PENUGASAN DOSEN PEMBIMBING TUGAS AKHIR.pdf"

SCALE = 2.0

# Static regions measured in template points (same coordinate system as PyMuPDF).
PAGE1_HEADER_ROI = (70.0, 35.0, 543.0, 186.0)  # kop + double line + title
PAGE2_KOP_ROI = (70.0, 35.0, 543.0, 143.0)
PAGE2_BULLET3_ROI = (72.0, 157.0, 543.0, 192.0)
PAGE2_SECTION_C_ROI = (72.0, 213.0, 170.0, 229.0)
PAGE2_SIGNATURE_LABEL_ROI = (361.0, 270.0, 543.0, 285.0)
PAGE2_PADANG_PREFIX_ROI = (392.0, 249.0, 431.5, 264.8)
CONT_SECTION_A_ROI = (72.0, 293.0, 380.0, 309.0)
CONT_TABLE_HEADER_ROI = (72.0, 330.0, 540.2, 358.8)

GRID_X = [72.0, 103.2, 215.8, 292.2, 446.1, 539.6]
GRID_Y = [330.1, 358.2, 391.5, 424.6, 457.9, 491.1, 524.3, 557.5, 590.6]


def render_page(pdf_path: Path, page_index: int, scale: float = SCALE) -> np.ndarray:
    doc = fitz.open(pdf_path)
    page = doc[page_index]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 3:
        arr = arr.mean(axis=2)
    else:
        arr = arr[:, :, 0]
    return arr


def crop(arr: np.ndarray, rect: tuple[float, float, float, float], scale: float = SCALE) -> np.ndarray:
    x0, y0, x1, y1 = rect
    ix0 = max(0, int(math.floor(x0 * scale)))
    iy0 = max(0, int(math.floor(y0 * scale)))
    ix1 = max(ix0 + 1, int(math.ceil(x1 * scale)))
    iy1 = max(iy0 + 1, int(math.ceil(y1 * scale)))
    return arr[iy0:iy1, ix0:ix1]


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    h = min(a.shape[0], b.shape[0])
    w = min(a.shape[1], b.shape[1])
    a = a[:h, :w].astype(np.float32)
    b = b[:h, :w].astype(np.float32)
    return 100.0 * (1.0 - np.mean(np.abs(a - b)) / 255.0)


def build_grid_rois() -> list[tuple[float, float, float, float]]:
    rois = []
    # Use tiny boxes around grid intersections instead of full strips.
    # Full vertical/horizontal strips can pick up dynamic text inside cells,
    # while intersections stay static and still prove the table geometry matches.
    box_half = 1.0
    for x in GRID_X:
        for y in GRID_Y:
            rois.append((x - box_half, y - box_half, x + box_half, y + box_half))
    return rois


def save_image(arr: np.ndarray, out_path: Path) -> None:
    if Image is None:
        return
    img = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    img.save(out_path)


def evaluate_generated_pdf(pdf_path: Path, save_dir: Path | None = None) -> tuple[bool, dict[str, float]]:
    template_page1 = render_page(TEMPLATE_PATH, 0)
    template_page2 = render_page(TEMPLATE_PATH, 1)

    gen_doc = fitz.open(pdf_path)
    page_count = len(gen_doc)
    if page_count < 2:
        raise RuntimeError(f"{pdf_path} harus memiliki minimal 2 halaman, found={page_count}")

    results: dict[str, float] = {}

    gen_page1 = render_page(pdf_path, 0)
    gen_last = render_page(pdf_path, page_count - 1)

    page1_rois = {
        "page1_header": PAGE1_HEADER_ROI,
    }
    for name, rect in page1_rois.items():
        results[name] = similarity(crop(template_page1, rect), crop(gen_page1, rect))

    page2_rois = {
        "page2_kop": PAGE2_KOP_ROI,
        "page2_bullet3": PAGE2_BULLET3_ROI,
        "page2_section_c": PAGE2_SECTION_C_ROI,
        "page2_signature_label": PAGE2_SIGNATURE_LABEL_ROI,
        "page2_padang_prefix": PAGE2_PADANG_PREFIX_ROI,
    }
    for name, rect in page2_rois.items():
        results[name] = similarity(crop(template_page2, rect), crop(gen_last, rect))

    if page_count > 2:
        cont_template = template_page1
        grid_rois = build_grid_rois()
        for idx in range(1, page_count - 1):
            cont_page = render_page(pdf_path, idx)
            results[f"continuation_{idx}_kop"] = similarity(
                crop(cont_template, PAGE2_KOP_ROI),
                crop(cont_page, PAGE2_KOP_ROI),
            )
            results[f"continuation_{idx}_section_a"] = similarity(
                crop(cont_template, CONT_SECTION_A_ROI),
                crop(cont_page, CONT_SECTION_A_ROI),
            )
            results[f"continuation_{idx}_table_header"] = similarity(
                crop(cont_template, CONT_TABLE_HEADER_ROI),
                crop(cont_page, CONT_TABLE_HEADER_ROI),
            )
            grid_scores = [
                similarity(crop(cont_template, roi), crop(cont_page, roi))
                for roi in grid_rois
            ]
            results[f"continuation_{idx}_grid_min"] = min(grid_scores)

    # Informational only; dynamic text naturally lowers these values.
    results["info_page1_full"] = similarity(template_page1, gen_page1)
    results["info_last_page_full"] = similarity(template_page2, gen_last)

    pass_threshold = 99.99
    gate_keys = [
        key for key in results
        if not key.startswith("info_")
    ]
    passed = all(results[key] >= pass_threshold for key in gate_keys)

    if save_dir is not None:
        save_dir.mkdir(parents=True, exist_ok=True)
        save_image(template_page1, save_dir / "template_page1.png")
        save_image(template_page2, save_dir / "template_page2.png")
        save_image(gen_page1, save_dir / "generated_page1.png")
        save_image(gen_last, save_dir / "generated_last_page.png")
        diff_first = np.abs(template_page1[: gen_page1.shape[0], : gen_page1.shape[1]] - gen_page1)
        diff_last = np.abs(template_page2[: gen_last.shape[0], : gen_last.shape[1]] - gen_last)
        save_image(diff_first, save_dir / "diff_page1.png")
        save_image(diff_last, save_dir / "diff_last_page.png")

    return passed, results


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate generated TA-04 PDFs against the official template.")
    parser.add_argument("pdf", type=Path, help="Path to generated TA-04 PDF")
    parser.add_argument("--save-dir", type=Path, default=None, help="Optional directory to save render/diff PNGs")
    args = parser.parse_args()

    passed, results = evaluate_generated_pdf(args.pdf, args.save_dir)
    print(f"PDF: {args.pdf}")
    print(f"Template: {TEMPLATE_PATH}")
    print("Results:")
    for key in sorted(results.keys()):
        print(f"  {key}: {results[key]:.2f}%")
    print(f"PASS: {passed}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
