"""
s3_service.py — Abstraction layer for file storage.

In production (DEV_MODE=false), this module communicates with Amazon S3
via Boto3. In development (DEV_MODE=true), it falls back to a local
filesystem-backed mock so the app works without AWS credentials.
"""

import os
import uuid
import mimetypes
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError


class S3Service:
    """Handles all interactions with Amazon S3."""

    # ── Allowed file types (MIME → extension mapping) ─────────────────
    ALLOWED_EXTENSIONS = {
        # Images
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico',
        # Documents
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
        # Archives
        '.zip', '.rar', '.7z', '.tar', '.gz',
        # Code / data
        '.json', '.xml', '.html', '.css', '.js', '.py', '.java', '.c',
        '.cpp', '.md', '.yml', '.yaml',
        # Media
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    }

    def __init__(self):
        self.bucket_name = (os.getenv('S3_BUCKET_NAME') or 'my-file-storage').strip()
        self.region = (os.getenv('AWS_REGION') or 'ap-south-1').strip()
        self.max_file_size = int(os.getenv('MAX_FILE_SIZE_MB', '50')) * 1024 * 1024  # bytes

        aws_key = os.getenv('AWS_ACCESS_KEY_ID')
        aws_secret = os.getenv('AWS_SECRET_ACCESS_KEY')
        self.s3_client = boto3.client(
            's3',
            region_name=self.region,
            aws_access_key_id=aws_key.strip() if aws_key else None,
            aws_secret_access_key=aws_secret.strip() if aws_secret else None,
        )

    # ── Validation helpers ────────────────────────────────────────────

    def _safe_key(self, filename: str) -> str:
        """Generate a safe, unique S3 object key to prevent collisions
        and path-traversal attacks."""
        # Strip directory components
        base = os.path.basename(filename)
        # Keep only the extension
        _, ext = os.path.splitext(base)
        ext = ext.lower()
        unique_id = uuid.uuid4().hex[:12]
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        safe_name = f"uploads/{timestamp}_{unique_id}{ext}"
        return safe_name

    def validate_file(self, filename: str, file_size: int) -> tuple[bool, str]:
        """Validate file extension and size. Returns (ok, error_message)."""
        if not filename:
            return False, 'Filename is required.'

        _, ext = os.path.splitext(filename)
        if ext.lower() not in self.ALLOWED_EXTENSIONS:
            return False, f'File type "{ext}" is not allowed.'

        if file_size > self.max_file_size:
            max_mb = self.max_file_size // (1024 * 1024)
            return False, f'File size exceeds the {max_mb} MB limit.'

        return True, ''

    # ── S3 operations ─────────────────────────────────────────────────

    def upload_file(self, file_obj, original_filename: str) -> dict:
        """Upload a file to S3 and return metadata."""
        s3_key = self._safe_key(original_filename)
        content_type = mimetypes.guess_type(original_filename)[0] or 'application/octet-stream'

        self.s3_client.upload_fileobj(
            file_obj,
            self.bucket_name,
            s3_key,
            ExtraArgs={
                'ContentType': content_type,
                'Metadata': {
                    'original-filename': original_filename,
                },
            },
        )

        return {
            'file_id': s3_key,
            'original_name': original_filename,
            'content_type': content_type,
            'uploaded_at': datetime.now(timezone.utc).isoformat(),
        }

    def list_files(self) -> list[dict]:
        """List all files in the S3 bucket under the uploads/ prefix."""
        files = []
        paginator = self.s3_client.get_paginator('list_objects_v2')

        for page in paginator.paginate(Bucket=self.bucket_name, Prefix='uploads/'):
            for obj in page.get('Contents', []):
                key = obj['Key']
                # Skip the directory marker itself
                if key.endswith('/'):
                    continue

                # Fetch head to get metadata
                try:
                    head = self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
                except ClientError:
                    continue

                original_name = head.get('Metadata', {}).get('original-filename', os.path.basename(key))
                content_type = head.get('ContentType', 'application/octet-stream')

                files.append({
                    'file_id': key,
                    'original_name': original_name,
                    'size': obj['Size'],
                    'content_type': content_type,
                    'uploaded_at': obj['LastModified'].isoformat(),
                })

        return files

    def get_download_url(self, file_id: str, expires_in: int = 3600) -> str:
        """Generate a presigned download URL (default: 1 hour)."""
        # Validate key starts with expected prefix
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')

        url = self.s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.bucket_name,
                'Key': file_id,
            },
            ExpiresIn=expires_in,
        )
        return url

    def get_preview_url(self, file_id: str, expires_in: int = 3600) -> str:
        """Generate a presigned URL suitable for inline preview."""
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')

        # Fetch content type
        try:
            head = self.s3_client.head_object(Bucket=self.bucket_name, Key=file_id)
        except ClientError:
            raise FileNotFoundError('File not found.')

        content_type = head.get('ContentType', 'application/octet-stream')

        url = self.s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.bucket_name,
                'Key': file_id,
                'ResponseContentDisposition': 'inline',
                'ResponseContentType': content_type,
            },
            ExpiresIn=expires_in,
        )
        return url

    def delete_file(self, file_id: str) -> bool:
        """Delete a file from S3. Returns True on success."""
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')

        # Verify file exists first
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=file_id)
        except ClientError:
            raise FileNotFoundError('File not found.')

        self.s3_client.delete_object(Bucket=self.bucket_name, Key=file_id)
        return True

    def get_file_metadata(self, file_id: str) -> dict:
        """Return metadata for a single file."""
        if not file_id.startswith('uploads/'):
            raise ValueError('Invalid file identifier.')

        try:
            head = self.s3_client.head_object(Bucket=self.bucket_name, Key=file_id)
        except ClientError:
            raise FileNotFoundError('File not found.')

        original_name = head.get('Metadata', {}).get('original-filename', os.path.basename(file_id))

        return {
            'file_id': file_id,
            'original_name': original_name,
            'size': head['ContentLength'],
            'content_type': head.get('ContentType', 'application/octet-stream'),
            'uploaded_at': head['LastModified'].isoformat(),
        }
