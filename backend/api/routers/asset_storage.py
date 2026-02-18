from enum import Enum
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from dependencies import get_storage_helper, verify_token
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper


class ContentTypeEnum(str, Enum):
    JSON = "application/json"
    MULTIPART_FORM_DATA = "multipart/form-data"
    URL_ENCODED = "application/x-www-form-urlencoded"
    PLAIN_TEXT = "text/plain"
    HTML = "text/html"
    XML = "text/xml"
    CSV = "text/csv"
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ODT = "application/vnd.oasis.opendocument.text"
    JPEG = "image/jpeg"
    PNG = "image/png"
    GIF = "image/gif"
    BMP = "image/bmp"
    AUDIO_MPEG = "audio/mpeg"
    AUDIO_WAV = "audio/wav"
    AUDIO_OGG = "audio/ogg"


class UploadRequest(BaseModel):
    content_type: Optional[ContentTypeEnum] = None  # Not required


# Pydantic models remain the same
class UploadUrlResponse(BaseModel):
    url: str
    guid: str


class BulkUploadRequest(BaseModel):
    content_type: Optional[ContentTypeEnum] = None  # Not required
    count: int


class BulkUploadUrlResponse(BaseModel):
    urls: Dict[str, str]


class DownloadRequest(BaseModel):
    filename: str


class DownloadUrlResponse(BaseModel):
    url: str


class BulkDownloadRequest(BaseModel):
    filenames: List[str]


class BulkDownloadUrlResponse(BaseModel):
    successful_urls: Dict[str, str]
    failures: Dict[str, str]


router = APIRouter(
    prefix="/asset_storage",
    tags=["asset_storage"],
)


@router.post("/download_url", response_model=DownloadUrlResponse)
async def generate_download_url(
    download_request: DownloadRequest,
    _: Request,
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
):
    """Generate a pre-signed URL for file download"""
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        url = gcs_helper.generate_pre_signed_url_for_download(download_request.filename)
        return DownloadUrlResponse(url=url)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404, detail=f"File {download_request.filename} not found"
        ) from e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Access denied") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/bulk_download_url", response_model=BulkDownloadUrlResponse)
async def generate_bulk_download_urls(
    bulk_request: BulkDownloadRequest,
    _: Request,
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
):
    """Generate pre-signed URLs for multiple file downloads"""
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        result = gcs_helper.bulk_generate_pre_signed_url_for_download(
            bulk_request.filenames
        )

        # If there are any failures but also successes, return 207
        if result["failures"] and result["successful_urls"]:
            return HTTPException(status_code=207, detail=result)

        # If all failed with not found
        if not result["successful_urls"] and all(
            "not found" in error.lower() for error in result["failures"].values()
        ):
            raise HTTPException(status_code=404, detail="No requested files found")

        # If all failed with access denied
        if not result["successful_urls"] and all(
            "access denied" in error.lower() for error in result["failures"].values()
        ):
            raise HTTPException(status_code=403, detail="Access denied to all files")

        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No requested files found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/upload_url", response_model=UploadUrlResponse)
async def generate_upload_url(
    upload_request: UploadRequest,
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
    authorized: bool = Depends(verify_token),
):
    """Generate a pre-signed URL for file upload"""
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        if upload_request.content_type is None:
            result = gcs_helper.generate_pre_signed_url_for_upload()
        else:
            result = gcs_helper.generate_pre_signed_url_for_upload(
                upload_request.content_type.value
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# Modify other endpoints similarly...
@router.post("/bulk_upload_url", response_model=BulkUploadUrlResponse)
async def generate_bulk_upload_urls(
    bulk_request: BulkUploadRequest,
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
    authorized: bool = Depends(verify_token),
):
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        if bulk_request.content_type is None:
            result = gcs_helper.bulk_generate_pre_signed_url_for_upload(
                bulk_request.count
            )
        else:
            result = gcs_helper.bulk_generate_pre_signed_url_for_upload(
                bulk_request.count, bulk_request.content_type.value
            )
        return BulkUploadUrlResponse(urls=result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
