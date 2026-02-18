import asyncio
import json
import logging
import os
import time
import uuid

import requests

logger = logging.getLogger(__name__)


class ConvexClient:
    def __init__(self, api_key, environment="dev", base_url_overwrite=None):
        self.api_key = api_key
        self.base_urls = {
            "dev": "https://rapid-egret-993.convex.site",
            "prod": "https://adamant-dachshund-473.convex.site",
        }
        self.base_url = self.base_urls[environment]
        if base_url_overwrite:
            self.base_url = base_url_overwrite
        self.headers = {"accept": "application/json"}
        self.timeout_seconds = int(os.getenv("CONVEX_HTTP_TIMEOUT_SECONDS", "30"))
        self.log_successful_calls = (
            str(os.getenv("CONVEX_LOG_SUCCESSFUL_CALLS", "false")).strip().lower()
            == "true"
        )
        self.max_log_payload_chars = int(os.getenv("CONVEX_LOG_PAYLOAD_CHARS", "600"))

    _SENSITIVE_KEYS = {"apikey", "authorization", "token", "secret", "password"}
    _BULK_KEYS = {"rows", "cells", "relationships"}

    def _is_sensitive_key(self, key):
        return str(key).strip().lower() in self._SENSITIVE_KEYS

    def _sanitize_for_log(self, value, depth=0):
        if depth > 2:
            return "<truncated>"

        if isinstance(value, dict):
            sanitized = {}
            for k, v in value.items():
                if self._is_sensitive_key(k):
                    sanitized[k] = "<redacted>"
                elif k in self._BULK_KEYS and isinstance(v, list):
                    sanitized[k] = f"<list len={len(v)}>"
                else:
                    sanitized[k] = self._sanitize_for_log(v, depth + 1)
            return sanitized

        if isinstance(value, list):
            if len(value) > 10:
                return f"<list len={len(value)}>"
            return [self._sanitize_for_log(v, depth + 1) for v in value]

        if isinstance(value, str):
            max_len = 120
            if len(value) > max_len:
                return f"{value[:max_len]}...<trimmed {len(value) - max_len} chars>"
            return value

        return value

    def _compact_payload_for_log(self, payload):
        try:
            sanitized = self._sanitize_for_log(payload)
            encoded = json.dumps(sanitized, default=str)
            if len(encoded) > self.max_log_payload_chars:
                return (
                    f"{encoded[:self.max_log_payload_chars]}...<trimmed "
                    f"{len(encoded) - self.max_log_payload_chars} chars>"
                )
            return encoded
        except Exception as exc:  # pragma: no cover - defensive
            return f"<payload-unserializable: {exc}>"

    def _request(self, method, url, headers, payload, timeout=None):
        request_id = uuid.uuid4().hex[:8]
        started = time.perf_counter()
        payload_preview = self._compact_payload_for_log(payload)

        logger.info(
            "[convex][%s] %s %s payload=%s",
            request_id,
            method.upper(),
            url,
            payload_preview,
        )
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=payload,
                timeout=timeout or self.timeout_seconds,
            )
        except Exception:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            logger.exception(
                "[convex][%s] request failed after %dms %s %s",
                request_id,
                elapsed_ms,
                method.upper(),
                url,
            )
            raise

        response._folio_convex_request_id = request_id
        response._folio_convex_url = url

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            body_excerpt = (response.text or "")[: self.max_log_payload_chars]
            logger.error(
                "[convex][%s] %s %s -> %s in %dms payload=%s body=%s",
                request_id,
                method.upper(),
                url,
                response.status_code,
                elapsed_ms,
                payload_preview,
                body_excerpt,
            )
        elif self.log_successful_calls:
            logger.warning(
                "[convex][%s] %s %s -> %s in %dms",
                request_id,
                method.upper(),
                url,
                response.status_code,
                elapsed_ms,
            )
        return response

    async def _post_with_retry(
        self, url, headers, json, retries=3, initial_delay=1, backoff=2
    ):
        """
        Attempts to call client.update_column(payload) with retries and exponential backoff.

        :param client: The convex_client instance.
        :param payload: The payload to pass to update_column.
        :param retries: Total number of attempts.
        :param initial_delay: Delay before the first retry (in seconds).
        :param backoff: Factor by which the delay increases each retry.
        """
        delay = initial_delay
        for attempt in range(1, retries + 1):
            try:
                response = self._request(
                    method="post",
                    url=url,
                    headers=headers,
                    payload=json,
                    timeout=self.timeout_seconds,
                )
                return response
            except Exception as e:
                logger.warning(
                    "[convex] attempt %d/%d failed for %s: %s",
                    attempt,
                    retries,
                    url,
                    e,
                )
                if attempt == retries:
                    raise  # Re-raise exception if it's the last attempt
                await asyncio.sleep(delay)
                delay *= backoff

    # Used to intercept the request for troubleshooting purposes
    def _post(self, url, headers, json):
        return self._request(
            method="post",
            url=url,
            headers=headers,
            payload=json,
            timeout=self.timeout_seconds,
        )

    def _get(self, url, headers, json):
        return self._request(
            method="get",
            url=url,
            headers=headers,
            payload=json,
            timeout=self.timeout_seconds,
        )

    def _get_data_object_from_response(self, res):
        if res.status_code != 200:
            request_id = getattr(res, "_folio_convex_request_id", "unknown")
            request_url = getattr(res, "_folio_convex_url", "unknown-url")
            logger.error(
                "[convex][%s] HTTP error from %s: %s %s",
                request_id,
                request_url,
                res.status_code,
                res.reason,
            )
            raise ValueError(f"Column creation failed: {res.text}")
        data_bytes = res.content
        data_string = data_bytes.decode("utf-8")
        data_object = json.loads(data_string)
        return data_object

    def create_column(self, name, project_id, column_subtype: str = None):
        url = f"{self.base_url}/createColumn"
        body = {
            "text": name,
            "project_id": project_id,
            "column_subtype": column_subtype,
            "apiKey": self.api_key,
        }
        response = self._post(url, headers=self.headers, json=body)
        data_object = self._get_data_object_from_response(response)
        return data_object["column_id"]

    def create_sheet(self, name, project_id, filter):
        url = f"{self.base_url}/createSheet"
        body = {
            "text": name,
            "project_id": project_id,
            "filter": filter,
            "apiKey": self.api_key,
        }
        response = self._post(url, headers=self.headers, json=body)
        return response

    def get_columns(self, project_id):
        url = f"{self.base_url}/getBySheet"
        body = {"project_id": project_id, "apiKey": self.api_key}
        response = self._post(url, headers=self.headers, json=body)
        data_object = self._get_data_object_from_response(response)
        # Transform each element
        columns = []
        for col in data_object:
            columns.append(
                {
                    "id": col["id"],
                    "name": col["name"],
                    # "column_type": col["column_type"],
                    # "column_subtype": col["column_subtype"],
                }
            )
        return columns

    def insert_row(self, payload):
        url = f"{self.base_url}/createRow"
        body = {
            "order": payload["order"],
            "project_id": payload["project_id"],
            "row_number": payload["row_number"],
            "cells": payload["cells"],
            "apiKey": self.api_key,
        }
        response = self._post(url, headers=self.headers, json=body)
        return response

    def update_column(self, payload):
        url = f"{self.base_url}/updateColumnState"
        body = {
            "column": payload["column"],
            "cell_state": payload["cell_state"],
            "rows": payload["rows"],
            "cells": payload["cells"],
            "apiKey": self.api_key,
        }
        try:
            response = self._post(url, headers=self.headers, json=body)
        except requests.exceptions.Timeout as e:
            raise e
        return response

    def create_relationships(self, payload):
        url = f"{self.base_url}/createRelationships"
        headers = {"accept": "application/json"}
        body = {
            "relationships": payload,
            "apiKey": self.api_key,
        }
        response = self._post(url, headers=headers, json=body)
        return response

    async def create_row_bulk(self, payload):
        url = f"{self.base_url}/createRowBulk"
        headers = {"accept": "application/json"}
        body = {
            "rows": payload,
            "apiKey": self.api_key,
        }
        response = await self._post_with_retry(url, headers=headers, json=body)
        data_object = self._get_data_object_from_response(response)

        results = []

        # Suppose 'rows' from the response each contain
        # { 'row_number': X, 'convex_row_id': Y, 'convex_row_order': Z }
        for row in data_object["rows"]:
            row_number = int(row["row_number"])
            convex_row_id = row["convex_row_id"]
            row_order = int(row["convex_row_order"])
            # Append the 3-tuple to results
            results.append((row_number, convex_row_id, row_order))

        return results

    def create_project(self, name, owner, project_grouping_id, synced):
        url = f"{self.base_url}/createProject"
        headers = {"accept": "application/json"}
        body = {
            "text": name,
            "owner": owner,
            "project_grouping": project_grouping_id,
            "apiKey": self.api_key,
            "synced": synced,
        }
        response = self._post(url, headers=headers, json=body)
        data_object = self._get_data_object_from_response(response)
        return data_object["project_id"]

    def create_project_grouping(self, name, owner, synced):
        url = f"{self.base_url}/createProjectGrouping"
        headers = {"accept": "application/json"}
        body = {"name": name, "owner": owner, "apiKey": self.api_key, "synced": synced}
        response = self._post(url, headers=headers, json=body)
        data_object = self._get_data_object_from_response(response)
        return data_object["project_grouping_id"]

    def insert_job(self, project_id, column_id, _job):
        url = f"{self.base_url}/insertJob"
        headers = {"accept": "application/json"}
        body = {
            "project_id": project_id,
            "column_id": column_id,
            "job_object": _job,
            "apiKey": self.api_key,
        }
        response = self._post(url, headers=headers, json=body)
        return response

    async def update_job(self, job_id, _job):
        url = f"{self.base_url}/updateJob"
        headers = {"accept": "application/json"}
        body = {
            "job_id": job_id,
            "job_object": _job,
            "apiKey": self.api_key,
        }
        response = await self._post_with_retry(url, headers=headers, json=body)
        return response
