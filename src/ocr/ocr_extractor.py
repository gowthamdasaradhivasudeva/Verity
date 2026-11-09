from src.ocr.ocr_gemini import extract_text


def process_image(image_path):
    return extract_text(str(image_path))