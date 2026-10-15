"""
tests/test_app.py — Unit tests for the Flask API.

Tests run against the local-storage backend (DEV_MODE=true) so they
work without AWS credentials.  For S3-specific tests, the `moto`
library mocks the AWS API.
"""

import io
import os
import sys
import json
import shutil
import pytest

# Ensure DEV_MODE is active before importing the app
os.environ['DEV_MODE'] = 'true'
os.environ['MAX_FILE_SIZE_MB'] = '5'

# Add parent dir so we can import app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import app  # noqa: E402

@pytest.fixture(autouse=True)
def client():
    """Create a test client and clean up dev_storage before and after each test."""
    from app import storage as app_storage
    storage_dir = os.path.join(os.path.dirname(__file__), '..', 'dev_storage')

    # Clean up before the test
    if os.path.exists(storage_dir):
        shutil.rmtree(storage_dir)
    # Reset in-memory metadata
    app_storage._metadata = {}
    os.makedirs(storage_dir, exist_ok=True)

    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

    # Clean up after the test
    if os.path.exists(storage_dir):
        shutil.rmtree(storage_dir)
    app_storage._metadata = {}


def _make_file(name='test.txt', content=b'hello world', mime='text/plain'):
    """Helper to create an in-memory file for upload."""
    return (io.BytesIO(content), name)


# ── Health check ──────────────────────────────────────────────────────

class TestHealthCheck:
    def test_health_returns_200(self, client):
        resp = client.get('/api/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'healthy'
        assert data['mode'] == 'development'

    def test_health_includes_max_file_size(self, client):
        resp = client.get('/api/health')
        data = resp.get_json()
        assert 'max_file_size_mb' in data


# ── File upload ───────────────────────────────────────────────────────

class TestUpload:
    def test_upload_single_file(self, client):
        data = {'files': [_make_file()]}
        resp = client.post('/api/files', data=data, content_type='multipart/form-data')
        assert resp.status_code == 201
        result = resp.get_json()
        assert len(result['uploaded']) == 1
        assert result['uploaded'][0]['original_name'] == 'test.txt'

    def test_upload_multiple_files(self, client):
        data = {'files': [
            _make_file('a.txt', b'aaa'),
            _make_file('b.txt', b'bbb'),
        ]}
        resp = client.post('/api/files', data=data, content_type='multipart/form-data')
        assert resp.status_code == 201
        result = resp.get_json()
        assert len(result['uploaded']) == 2

    def test_upload_no_files(self, client):
        resp = client.post('/api/files', data={}, content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_upload_blocked_extension(self, client):
        data = {'files': [_make_file('malware.exe', b'\x00\x01')]}
        resp = client.post('/api/files', data=data, content_type='multipart/form-data')
        result = resp.get_json()
        assert len(result.get('errors', [])) == 1
        assert 'not allowed' in result['errors'][0]['error']

    def test_upload_file_too_large(self, client):
        # MAX_FILE_SIZE_MB is set to 5 in the test env
        big_content = b'x' * (6 * 1024 * 1024)
        data = {'files': [_make_file('big.txt', big_content)]}
        resp = client.post('/api/files', data=data, content_type='multipart/form-data')
        result = resp.get_json()
        assert len(result.get('errors', [])) == 1
        assert 'limit' in result['errors'][0]['error'].lower()


# ── File listing ──────────────────────────────────────────────────────

class TestListFiles:
    def test_list_empty(self, client):
        resp = client.get('/api/files')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['total_files'] == 0
        assert data['files'] == []

    def test_list_after_upload(self, client):
        client.post('/api/files',
                     data={'files': [_make_file()]},
                     content_type='multipart/form-data')
        resp = client.get('/api/files')
        data = resp.get_json()
        assert data['total_files'] == 1
        assert data['total_size'] > 0


# ── Download URL ──────────────────────────────────────────────────────

class TestDownload:
    def test_download_returns_url(self, client):
        # Upload first
        resp = client.post('/api/files',
                           data={'files': [_make_file()]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.get(f'/api/files/{file_id}/download')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'url' in data

    def test_download_nonexistent(self, client):
        resp = client.get('/api/files/uploads/nonexistent.txt/download')
        assert resp.status_code == 404

    def test_download_invalid_prefix(self, client):
        resp = client.get('/api/files/../../etc/passwd/download')
        assert resp.status_code == 400


# ── Delete ────────────────────────────────────────────────────────────

class TestDelete:
    def test_delete_file(self, client):
        resp = client.post('/api/files',
                           data={'files': [_make_file()]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.delete(f'/api/files/{file_id}')
        assert resp.status_code == 200

        # Verify it's gone
        resp = client.get('/api/files')
        assert resp.get_json()['total_files'] == 0

    def test_delete_nonexistent(self, client):
        resp = client.delete('/api/files/uploads/nope.txt')
        assert resp.status_code == 404


# ── File metadata ─────────────────────────────────────────────────────

class TestMetadata:
    def test_get_metadata(self, client):
        resp = client.post('/api/files',
                           data={'files': [_make_file('doc.pdf', b'%PDF')]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.get(f'/api/files/{file_id}/metadata')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['original_name'] == 'doc.pdf'
        assert data['size'] > 0


# ── Preview ───────────────────────────────────────────────────────────

class TestPreview:
    def test_preview_returns_url(self, client):
        resp = client.post('/api/files',
                           data={'files': [_make_file('photo.png', b'\x89PNG')]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.get(f'/api/files/{file_id}/preview')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'url' in data


# ── Dev-mode file serving ─────────────────────────────────────────────

class TestServeFile:
    def test_serve_file_download(self, client):
        resp = client.post('/api/files',
                           data={'files': [_make_file('readme.txt', b'Hello')]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.get(f'/api/files/{file_id}/serve')
        assert resp.status_code == 200
        assert resp.data == b'Hello'

    def test_serve_file_inline(self, client):
        resp = client.post('/api/files',
                           data={'files': [_make_file('pic.png', b'\x89PNG')]},
                           content_type='multipart/form-data')
        file_id = resp.get_json()['uploaded'][0]['file_id']

        resp = client.get(f'/api/files/{file_id}/serve?inline=true')
        assert resp.status_code == 200


# ── S3 service unit tests (mocked with moto) ─────────────────────────

class TestS3ServiceWithMoto:
    """These tests use moto to mock AWS S3 so we can verify the real
    S3Service class without needing credentials."""

    @pytest.fixture(autouse=True)
    def setup_moto(self):
        import boto3
        from moto import mock_aws

        os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
        os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
        os.environ['AWS_REGION'] = 'us-east-1'
        os.environ['S3_BUCKET_NAME'] = 'test-bucket'

        with mock_aws():
            # Create the test bucket
            s3 = boto3.client('s3', region_name='us-east-1')
            s3.create_bucket(Bucket='test-bucket')

            from s3_service import S3Service
            self.svc = S3Service()
            yield

    def test_upload_and_list(self):
        content = io.BytesIO(b'test content')
        result = self.svc.upload_file(content, 'hello.txt')
        assert result['original_name'] == 'hello.txt'
        assert result['file_id'].startswith('uploads/')

        files = self.svc.list_files()
        assert len(files) == 1
        assert files[0]['original_name'] == 'hello.txt'

    def test_delete(self):
        content = io.BytesIO(b'delete me')
        result = self.svc.upload_file(content, 'bye.txt')
        file_id = result['file_id']

        assert self.svc.delete_file(file_id) is True
        assert len(self.svc.list_files()) == 0

    def test_presigned_url(self):
        content = io.BytesIO(b'url test')
        result = self.svc.upload_file(content, 'url.txt')
        url = self.svc.get_download_url(result['file_id'])
        assert 'test-bucket' in url or 'url.txt' in url or 'X-Amz' in url

    def test_validate_blocked_extension(self):
        ok, msg = self.svc.validate_file('virus.exe', 100)
        assert ok is False

    def test_validate_oversized(self):
        ok, msg = self.svc.validate_file('big.txt', 999 * 1024 * 1024)
        assert ok is False

    def test_invalid_prefix_raises(self):
        with pytest.raises(ValueError):
            self.svc.get_download_url('../../etc/passwd')
