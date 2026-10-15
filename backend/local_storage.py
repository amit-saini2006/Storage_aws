"""
local_storage.py — Local filesystem-backed storage for development.

This module provides the same interface as S3Service but stores files on
the local filesystem.  It is activated when DEV_MODE=true so that the
application works without AWS credentials during development.

⚠️  This is NOT intended for production use.
"""

import os
import json
import uuid
import shutil
import mimetypes
from datetime import datetime, timezone
from urllib.parse import quote


STORAGE_DIR = os.path.join(os.path.dirname(__file__), 'dev_storage')
META_FILE = os.path.join(STORAGE_DIR, '_metadata.json')


class LocalStorageService:
    """Drop-in replacement for S3Service that uses the local filesystem."""

    ALLOWED_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
        '.zip', '.rar', '.7z', '.tar', '.gz',
        '.json', '.xml', '.html', '.css', '.js', '.py', '.java', '.c',
        '.cpp', '.md', '.yml', '.yaml',
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    }

    def __init__(self):
        self.max_file_size = int(os.getenv('MAX_FILE_SIZE_MB', '50')) * 1024 * 1024
        os.makedirs(STORAGE_DIR, exist_ok=True)
        self._load_metadata()

    # ── Internal metadata persistence ─────────────────────────────────

    def _load_metadata(self):
        if os.path.exists(META_FILE):
            with open(META_FILE, 'r', encoding='utf-8') as f:
                self._metadata: dict = json.load(f)
        else:
            self._metadata = {}

    def _save_metadata(self):
        with open(META_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._metadata, f, indent=2, default=str)

    # ── Helpers ───────────────────────────────────────────────────────

    def _safe_key(self, filename: str) -> str:
        base = os.path.basename(filename)
        _, ext = os.path.splitext(base)
        ext = ext.lower()
        unique_id = uuid.uuid4().hex[:12]
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        return f"uploads/{timestamp}_{unique_id}{ext}"

    def validate_file(self, filename: str, file_size: int) -> tuple[bool, str]:
        if not filename:
            return False, 'Filename is required.'
        _, ext = os.path.splitext(filename)
        if ext.lower() not in self.ALLOWED_EXTENSIONS:
            return False, f'File type "{ext}" is not allowed.'
        if file_size > self.max_file_size:
            max_mb = self.max_file_size // (1024 * 1024)
            return False, f'File size exceeds the {max_mb} MB limit.'
        return True, ''

    # ── Storage operations ────────────────────────────────────────────

    def upload_file(self, file_obj, original_filename: str) -> dict:
        s3_key = self._safe_key(original_filename)
        content_type = mimetypes.guess_type(original_filename)[0] or 'application/octet-stream'

        # Write file to disk
        local_path = os.path.join(STORAGE_DIR, s3_key.replace('/', os.sep))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        with open(local_path, 'wb') as f:
            shutil.copyfileobj(file_obj, f)

        file_size = os.path.getsize(local_path)
        now = datetime.now(timezone.utc).isoformat()

        self._metadata[s3_key] = {
            'file_id': s3_key,
            'original_name': original_filename,
            'content_type': content_type,
            'size': file_size,
            'uploaded_at': now,
        }
        self._save_metadata()

        return {
            'file_id': s3_key,
            'original_name': original_filename,
            'content_type': content_type,
            'uploaded_at': now,
        }

    def list_files(self) -> list[dict]:
        self._load_metadata()
        return list(self._metadata.values())

    def get_download_url(self, file_id: str, expires_in: int = 3600) -> str:
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')
        if file_id not in self._metadata:
            raise FileNotFoundError('File not found.')
        # In dev mode, return a local API URL — the frontend will fetch
        # through the Flask endpoint /api/files/<path>/serve
        return f'/api/files/{quote(file_id, safe="")}/serve'

    def get_preview_url(self, file_id: str, expires_in: int = 3600) -> str:
        """Same as download_url in dev mode but with inline disposition."""
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')
        if file_id not in self._metadata:
            raise FileNotFoundError('File not found.')
        return f'/api/files/{quote(file_id, safe="")}/serve?inline=true'

    def delete_file(self, file_id: str) -> bool:
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')
        if file_id not in self._metadata:
            raise FileNotFoundError('File not found.')

        local_path = os.path.join(STORAGE_DIR, file_id.replace('/', os.sep))
        if os.path.exists(local_path):
            os.remove(local_path)

        del self._metadata[file_id]
        self._save_metadata()
        return True

    def get_file_metadata(self, file_id: str) -> dict:
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')
        self._load_metadata()
        if file_id not in self._metadata:
            raise FileNotFoundError('File not found.')
        return self._metadata[file_id]

    def serve_file(self, file_id: str):
        """Return (file_path, content_type, original_name) for local serving."""
        if file_id not in self._metadata:
            raise FileNotFoundError('File not found.')

        local_path = os.path.join(STORAGE_DIR, file_id.replace('/', os.sep))
        if not os.path.exists(local_path):
            raise FileNotFoundError('File not found on disk.')

        meta = self._metadata[file_id]
        return local_path, meta['content_type'], meta['original_name']
