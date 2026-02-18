import os
import csv
import pandas as pd

from .dataset_processor import FileType, ProcessingError


CSV_DELIMITER_ERROR_MESSAGE = (
    "We couldn't understand how the uploaded file separates its columns. "
    "If you're uploading a CSV, make sure it has a header row and uses a "
    "consistent delimiter such as a comma, tab, or semicolon. If the file "
    "is another format, please convert it to CSV or Parquet before trying "
    "again."
)

UNSUPPORTED_FILE_TYPE_MESSAGE = (
    "We couldn't determine the file type. Supported formats are CSV, "
    "Parquet, PDF, XML, common image formats, MP3 audio, and MP4 video."
)


def _is_csv_file(file_path: str, sample_bytes: int = 2048) -> bool:
    """
    Tries to determine if a file is CSV by sampling a portion of it
    and using the CSV Sniffer.
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(sample_bytes)

        if not sample.strip():
            return False

        try:
            csv.Sniffer().sniff(sample)
            return True
        except csv.Error:
            pass

        # Fallback: try reading a small number of rows from the file directly
        try:
            pd.read_csv(file_path, nrows=1, engine="python")
            return True
        except Exception as exc:
            # If pandas struggles, fall back to lightweight heuristics so we
            # still recognise obvious CSV structures (e.g. large HTML blobs inside
            # cells that confuse the parser when sampled).
            header_line = ""
            for line in sample.splitlines():
                if line.strip():
                    header_line = line
                    break

            likely_delimiters = [",", "\t", ";", "|"]
            if header_line and any(header_line.count(d) >= 1 for d in likely_delimiters):
                return True

            if file_path.lower().endswith(".csv"):
                return True

            raise ProcessingError(CSV_DELIMITER_ERROR_MESSAGE) from exc

    except (UnicodeDecodeError, OSError):
        return False


def _detect_file_type(file_path: str) -> FileType:
    """
    Detects the file type based on magic bytes / simple checks:
      - Parquet: starts with b'PAR1'
      - PDF: starts with b'%PDF-'
      - PNG: starts with b'\x89PNG\r\n\x1a\n'
      - JPEG: starts with b'\xff\xd8'
      - MP3: starts with b'ID3' or typical frame sync (0xFF, next nibble high)
      - MP4: bytes 4:8 == b'ftyp'
      - Otherwise, attempt CSV sniff
      - If none match, return UNKNOWN
    """
    with open(file_path, "rb") as f:
        header = f.read(16)  # read enough bytes to test multiple formats

    # 1. Check Parquet ('PAR1')
    if header.startswith(b"PAR1"):
        return FileType.PARQUET

    # 2. Check PDF ('%PDF-')
    if header.startswith(b"%PDF-"):
        return FileType.PDF

    # 3. Check XML ('<?xml')
    if header.startswith(b"<?xml"):
        return FileType.XML

    # 4. Check PNG (89 50 4E 47 0D 0A 1A 0A)
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return FileType.IMAGE

    # 5. Check JPEG (FF D8 FF ...)
    if header[:2] == b"\xff\xd8":
        return FileType.IMAGE

    # 6. Check MP3
    #    - ID3 tag (49 44 33) or typical MPEG frame sync (0xFF, next nibble high)
    if header.startswith(b"ID3"):
        return FileType.AUDIO
    if header[0] == 0xFF and (header[1] & 0b1110_0000) == 0b1110_0000:
        return FileType.AUDIO

    # 7. Check MP4
    #    - Typically: first 4 bytes = size, next 4 bytes = b'ftyp'
    if len(header) >= 8 and header[4:8] == b"ftyp":
        return FileType.VIDEO

    # 8. Attempt CSV sniffing
    if _is_csv_file(file_path):
        return FileType.CSV

    # 9. Fallback to extension-based detection for CSV files
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return FileType.CSV

    raise ProcessingError(UNSUPPORTED_FILE_TYPE_MESSAGE)
