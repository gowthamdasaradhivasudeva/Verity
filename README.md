# exam-malpractice-detection
# AI Exam Malpractice Detection

## OCR Module

The OCR module extracts text from uploaded handwritten or scanned
exam answer sheets.

## OCR Pipeline

Image
↓
Image Preprocessing
↓
Tesseract OCR
↓
Extracted Text
↓
TXT File

## Folder Structure

AI-Exam-Malpractice-Detection/

├── src/
│   └── ocr/
│       ├── __init__.py
│       └── ocr_extractor.py
│
├── uploads/
│   └── images/
│
├── outputs/
│   └── extracted_text/
│
├── notebooks/
│   └── 01_ocr.ipynb
│
├── requirements.txt
├── README.md
└── .gitignore

## Installation

Install the required Python packages:

pip install -r requirements.txt

## Tesseract Installation

Tesseract OCR must also be installed separately.

On Windows, the default installation path is:

C:\Program Files\Tesseract-OCR\tesseract.exe

If Tesseract is installed somewhere else, update the path in:

src/ocr/ocr_extractor.py

## How to Run

Place answer-sheet images inside:

uploads/images/

Example:

uploads/images/
├── student1.jpg
├── student2.jpg
└── student3.jpg

Then run:

python src/ocr/ocr_extractor.py

The extracted text will be saved inside:

outputs/extracted_text/

Example:

outputs/extracted_text/
├── student1.txt
├── student2.txt
└── student3.txt

## Supported Image Formats

- JPG
- JPEG
- PNG
- BMP
- TIFF

## Future Modules

After the OCR module is completed, the project will include:

1. Text preprocessing
2. Sentence-BERT embeddings
3. Similarity calculation
4. Similarity matrix
5. Decision engine
6. Report generation
7. Backend API
8. Frontend dashboard