import os
import time
import re
from pathlib import Path
from dotenv import load_dotenv

from google import genai
from PIL import Image

load_dotenv(Path(__file__).resolve().parents[2] / ".env")



MODELS = [
    "gemini-flash-latest",
    "gemini-3.1-flash-lite"
]

PROMPT = (
    "Transcribe all handwritten text from this answer sheet exactly as written. "
    "Read from top to bottom. Preserve original spelling and punctuation. "
    "Do not correct, summarize, or explain. "
    "Identify every question and its corresponding answer. "
    "Put each question on its own line using Q1: format. "
    "Put each answer on its own line using Ans: format. "
    "IMPORTANT: Preserve visible paragraph boundaries. "
    "When a clear blank paragraph gap exists in the image, "
    "insert one blank line in the transcription at the same position. "
    "Do not merge separate paragraphs into one paragraph. "
    "Preserve the original order of all content. "
    "Output only the transcribed text."
)


def extract_text(path, clean=True):

    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

    client = genai.Client(api_key=api_key)

    with Image.open(path) as original:
        img = original.copy()
        img.thumbnail((1800, 1800))

    last_error = None

    for model in MODELS:
        try:
            print(f"Starting OCR with: {model}", flush=True)

            response = client.models.generate_content(
                model=model,
                contents=[img, PROMPT]
            )

            text = (response.text or "").strip()

            if not text:
                raise RuntimeError("Gemini returned empty OCR text.")

            print(f"Gemini OCR successful: {model}", flush=True)

            if clean:
                text = text.replace("\r\n", "\n").replace("\r", "\n")

                lines = [
                    re.sub(r"[ \t]+", " ", line).strip()
                    for line in text.split("\n")
                ]

                text = "\n".join(lines)
                text = re.sub(r"\n{3,}", "\n\n", text)

            return text.strip()

        except Exception as error:
            last_error = error
            print(
                f"{model} failed: {str(error)[:200]}",
                flush=True
            )

    raise RuntimeError(
        f"All OCR models failed. Last error: {last_error}"
    )
