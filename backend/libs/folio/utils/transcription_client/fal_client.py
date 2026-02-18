import os
import asyncio
import fal_client
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Exception raised when transcription fails"""

    pass


class FalTranscriptionClient:
    """Client for transcribing audio files using FAL AI's whisper service"""

    def __init__(self, fal_key: Optional[str] = None):
        """
        Initialize the FAL transcription client

        Args:
            fal_key: FAL API key (optional, will use environment variable if not provided)
        """
        if fal_key:
            os.environ["FAL_KEY"] = fal_key

    async def _transcribe_file(self, file_id: str, file_path: str) -> Tuple[str, str]:
        """
        Transcribe a single audio file using FAL's whisper service

        Args:
            file_id: Unique identifier for the file
            file_path: Path to the audio file

        Returns:
            Tuple containing (file_id, transcribed_text)

        Raises:
            TranscriptionError: If transcription fails
        """

        try:
            # Upload file to FAL
            url = await fal_client.upload_file_async(file_path)

            # Call the whisper service
            response = await fal_client.subscribe_async(
                "fal-ai/whisper",
                arguments={
                    "audio_url": url,
                    "language": "en",  # Default to English
                },
            )

            # Extract transcription
            transcribed_text = response.get("text", "")

            return file_id, transcribed_text

        except Exception as e:
            raise TranscriptionError(
                f"Failed to transcribe file {file_id}: {str(e)}"
            ) from e

    async def transcribe_files(
        self, file_data: List[Tuple[str, str]], max_concurrent: int = 5
    ) -> Dict[str, str]:
        """
        Transcribe multiple audio files concurrently

        Args:
            file_data: List of tuples containing (file_id, file_path)
            max_concurrent: Maximum number of concurrent transcription tasks

        Returns:
            Dictionary mapping file_ids to transcribed text
        """
        # Set up result dictionary
        results = {}

        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _limited_transcribe(file_id: str, file_path: str):
            async with semaphore:
                try:
                    id, text = await self._transcribe_file(file_id, file_path)
                    results[id] = text
                except TranscriptionError as e:
                    logger.warning("Error transcribing %s: %s", file_id, e)
                    results[file_id] = ""  # Empty string for failed transcriptions

        # Create and run tasks
        tasks = [
            _limited_transcribe(file_id, file_path) for file_id, file_path in file_data
        ]
        await asyncio.gather(*tasks)

        return results
