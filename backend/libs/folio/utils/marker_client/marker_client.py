import json
import os
import time
import requests
import logging

logger = logging.getLogger(__name__)

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


class MarkerError(Exception):
    """Raised when the Marker API fails or returns an error."""


def is_retryable_status(status_code: int) -> bool:
    """
    Helper to decide which status codes we want to treat as retryable.
    Commonly includes 429, 500, 502, 503, 504, etc.
    """
    return status_code == 429 or status_code >= 500


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
)
def marker_post(
    url: str, params: dict, file_path: str, headers: dict, content_type: str
):
    with open(file_path, "rb") as fh:
        files = {
            "file": (os.path.basename(file_path), fh, content_type),
            # any of your flag fields go here as (None, value)
            **params,
        }
        resp = requests.post(url, files=files, headers=headers, timeout=(5, 60))
        if is_retryable_status(resp.status_code):
            raise requests.exceptions.RequestException(
                f"Retrying on POST {resp.status_code}: {resp.text}"
            )
        return resp


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
)
def marker_get(url: str, headers):
    """
    Tenacity-wrapped GET request for polling Marker status.
    Raises RequestException if we get a status code that indicates
    a retry is needed (429 or >= 500).
    """
    response = requests.get(url, headers=headers, timeout=30)
    if is_retryable_status(response.status_code):
        logger.info("retrying GET on a %s for %s", response.status_code, url)
        raise requests.exceptions.RequestException(
            f"Retrying on GET HTTP {response.status_code}: {response.text}"
        )
    return response


class MarkerClient:
    """
    Client to call the Marker endpoint, converting PDFs/Docs/PPTs to Markdown or other formats.
    Uses Tenacity for retries.
    """

    def __init__(
        self, api_key: str, base_url: str = "https://www.datalab.to/api/v1/marker"
    ):
        self.api_key = api_key
        self.base_url = base_url

    def convert_file(
        self,
        file_path: str,
        output_format: str = "markdown",
        langs: str = "English",
        force_ocr: bool = False,
        paginate: bool = False,
        use_llm: bool = False,
        strip_existing_ocr: bool = False,
        disable_image_extraction: bool = False,
        content_type: str | None = None,
    ):
        """
        Initiate the file conversion request and poll for results.
        Returns the final result once conversion is complete or raises MarkerError if an error occurs.
        """
        # 1) Start job
        if content_type is None:
            ext = os.path.splitext(file_path)[1].lower()
            content_type = "application/pdf"
            if ext == ".xml":
                content_type = "application/xml"

        job_info = self._upload_and_start_job(
            file_path,
            output_format,
            langs,
            force_ocr,
            paginate,
            use_llm,
            strip_existing_ocr,
            disable_image_extraction,
            content_type,
        )
        # 2) Poll until completion
        check_url = job_info["request_check_url"]
        return self._poll_for_completion(check_url)

    def _upload_and_start_job(
        self,
        file_path: str,
        output_format: str,
        langs: str,
        force_ocr: bool,
        paginate: bool,
        use_llm: bool,
        strip_existing_ocr: bool,
        disable_image_extraction: bool,
        content_type: str,
    ) -> dict:
        """
        Upload file to Marker and start the conversion.
        Returns the immediate API response (including 'request_check_url').
        Raises MarkerError if Marker indicates a failure.
        """
        headers = {"X-Api-Key": self.api_key}
        params = {
            "langs": (None, langs),
            "force_ocr": (None, str(force_ocr)),
            "paginate": (None, str(paginate)),
            "output_format": (None, output_format),
            "use_llm": (None, str(use_llm)),
            "strip_existing_ocr": (None, str(strip_existing_ocr)),
            "disable_image_extraction": (None, str(disable_image_extraction)),
        }

        response = marker_post(
            self.base_url,
            params=params,
            file_path=file_path,
            headers=headers,
            content_type=content_type,
        )
        try:
            data = response.json()
        except ValueError as e:
            raise MarkerError(f"Non-JSON response from Marker: {response.text}") from e

        if not data.get("success", False):
            raise MarkerError(
                f"Marker request failed with status code: {response.status_code}"
            )

        return data

    def _poll_for_completion(self, request_check_url: str, max_polls: int = 300):
        """
        Poll the request_check_url until the status is 'complete' or we hit max_polls.
        Returns the final conversion results (including 'markdown', 'json', or 'html')
        or raises MarkerError if there's a failure or a time-out.
        """
        headers = {"X-Api-Key": self.api_key}
        poll_interval = 1

        for _ in range(max_polls):
            response = marker_get(request_check_url, headers=headers)
            data = response.json()

            status = data.get("status")
            if status == "complete":
                # Return final results
                return data
            elif status == "failed":
                raise MarkerError(
                    f"Marker job failed: {data.get('error', 'Unknown error')}"
                )

            time.sleep(poll_interval)

        raise MarkerError("Marker request timed out after polling.")
