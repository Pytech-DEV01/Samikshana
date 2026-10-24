"""Small server-side Supabase REST and Storage client."""

import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class SupabaseStoreError(RuntimeError):
    """Raised when a Supabase operation fails without exposing credentials."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class SupabaseStore:
    def __init__(self, url, secret_key, timeout=15):
        self.url = url.rstrip("/")
        self.secret_key = secret_key
        self.timeout = timeout

    def _request(self, path, method="GET", payload=None, content_type="application/json"):
        body = None
        if payload is not None:
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        headers = {
            "apikey": self.secret_key,
            "Content-Type": content_type,
            "Prefer": "return=representation",
        }
        if not self.secret_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.secret_key}"
        request = Request(
            f"{self.url}{path}",
            data=body,
            method=method,
            headers=headers,
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                content = response.read()
        except HTTPError as error:
            raise SupabaseStoreError(
                f"Supabase request failed with HTTP {error.code}.",
                status_code=error.code,
            ) from None
        except URLError:
            raise SupabaseStoreError("Supabase could not be reached.") from None
        if not content:
            return None
        try:
            return json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return content

    def select(self, table, **query):
        query_string = urlencode(query, doseq=True)
        path = f"/rest/v1/{quote(table)}"
        if query_string:
            path = f"{path}?{query_string}"
        result = self._request(path)
        if not isinstance(result, list):
            raise SupabaseStoreError("Supabase returned an invalid table response.")
        return result

    def insert(self, table, record):
        result = self._request(
            f"/rest/v1/{quote(table)}", method="POST", payload=record
        )
        if not isinstance(result, list) or not result:
            raise SupabaseStoreError("Supabase did not confirm the inserted record.")
        return result[0]

    def update(self, table, filters, fields):
        query_string = urlencode(filters, doseq=True)
        result = self._request(
            f"/rest/v1/{quote(table)}?{query_string}",
            method="PATCH",
            payload=fields,
        )
        if not isinstance(result, list) or not result:
            raise SupabaseStoreError("Supabase did not confirm the updated record.")
        return result

    def delete(self, table, filters):
        query_string = urlencode(filters, doseq=True)
        return self._request(f"/rest/v1/{quote(table)}?{query_string}", method="DELETE")

    def upload(self, bucket, object_path, content, content_type):
        encoded_path = "/".join(quote(part, safe="") for part in object_path.split("/"))
        return self._request(
            f"/storage/v1/object/{quote(bucket)}/{encoded_path}",
            method="POST",
            payload=content,
            content_type=content_type,
        )

    def download(self, bucket, object_path):
        encoded_path = "/".join(quote(part, safe="") for part in object_path.split("/"))
        return self._request(
            f"/storage/v1/object/{quote(bucket)}/{encoded_path}"
        )

    def delete_objects(self, bucket, object_paths):
        return self._request(
            f"/storage/v1/object/{quote(bucket)}",
            method="DELETE",
            payload={"prefixes": object_paths},
        )
