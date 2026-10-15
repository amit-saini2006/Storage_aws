"""
app.py — Flask API for Cloud-Based Personal File Storage.

This is the main entry point for the backend.  It exposes REST endpoints
for uploading, listing, downloading, and deleting files.

Storage backend:
  • DEV_MODE=true  →  local filesystem  (no AWS credentials needed)
  • DEV_MODE=false →  Amazon S3 via Boto3
"""

import os
from urllib.parse import unquote

from dotenv import load_dotenv

# Load environment variables from .env BEFORE importing services
load_dotenv()

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ── Choose storage backend ────────────────────────────────────────────
DEV_MODE = os.getenv('DEV_MODE', 'false').lower() == 'true'

if DEV_MODE:
    from local_storage import LocalStorageService
    storage = LocalStorageService()
    print('\n  [DEV] Running in DEVELOPMENT mode (local filesystem storage)\n')
else:
    from s3_service import S3Service
    storage = S3Service()
    print('\n  [AWS] Running in PRODUCTION mode (Amazon S3 storage)\n')

# ── Flask setup ───────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r'/api/*': {'origins': '*'}})

# Max upload size enforcement at the Flask level (fallback)
MAX_CONTENT_LENGTH = int(os.getenv('MAX_FILE_SIZE_MB', '50')) * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH * 5  # allow a bit extra for multi-file


# ── Error handlers ────────────────────────────────────────────────────

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'Request too large. Check file-size limits.'}), 413


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found.'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error.'}), 500


# ── API endpoints ─────────────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check — useful for load balancers and uptime monitoring."""
    return jsonify({
        'status': 'healthy',
        'mode': 'development' if DEV_MODE else 'production',
        'max_file_size_mb': MAX_CONTENT_LENGTH // (1024 * 1024),
    })


@app.route('/api/files', methods=['GET'])
def list_files():
    """Return all stored files with metadata."""
    try:
        files = storage.list_files()
        total_size = sum(f.get('size', 0) for f in files)
        return jsonify({
            'files': files,
            'total_files': len(files),
            'total_size': total_size,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files', methods=['POST'])
def upload_files():
    """Upload one or more files."""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided. Use the "files" form field.'}), 400

    uploaded_files = request.files.getlist('files')
    if not uploaded_files or all(f.filename == '' for f in uploaded_files):
        return jsonify({'error': 'No files selected.'}), 400

    results = []
    errors = []

    for file in uploaded_files:
        if file.filename == '':
            continue

        # Read content to get size (seek back after)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        # Validate
        ok, msg = storage.validate_file(file.filename, file_size)
        if not ok:
            errors.append({'filename': file.filename, 'error': msg})
            continue

        try:
            meta = storage.upload_file(file, file.filename)
            # Add the size we already measured
            meta['size'] = file_size
            results.append(meta)
        except Exception as e:
            errors.append({'filename': file.filename, 'error': str(e)})

    status_code = 201 if results else (400 if errors else 200)

    return jsonify({
        'uploaded': results,
        'errors': errors,
        'message': f'{len(results)} file(s) uploaded successfully.'
                   + (f' {len(errors)} file(s) failed.' if errors else ''),
    }), status_code


@app.route('/api/files/<path:file_id>/download', methods=['GET'])
def download_file(file_id):
    """Generate and return a download URL (presigned for S3, local path for dev)."""
    file_id = unquote(file_id)
    try:
        url = storage.get_download_url(file_id)
        return jsonify({'url': url})
    except FileNotFoundError:
        return jsonify({'error': 'File not found.'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<path:file_id>/preview', methods=['GET'])
def preview_file(file_id):
    """Generate a preview URL."""
    file_id = unquote(file_id)
    try:
        url = storage.get_preview_url(file_id)
        return jsonify({'url': url})
    except FileNotFoundError:
        return jsonify({'error': 'File not found.'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<path:file_id>/metadata', methods=['GET'])
def file_metadata(file_id):
    """Return metadata for a single file."""
    file_id = unquote(file_id)
    try:
        meta = storage.get_file_metadata(file_id)
        return jsonify(meta)
    except FileNotFoundError:
        return jsonify({'error': 'File not found.'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<path:file_id>', methods=['DELETE'])
def delete_file(file_id):
    """Delete a file."""
    file_id = unquote(file_id)
    try:
        storage.delete_file(file_id)
        return jsonify({'message': 'File deleted successfully.'})
    except FileNotFoundError:
        return jsonify({'error': 'File not found.'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Dev-mode file serving (not used in production) ────────────────────

@app.route('/api/files/<path:file_id>/serve', methods=['GET'])
def serve_file(file_id):
    """Serve a file directly from local storage (dev mode only)."""
    if not DEV_MODE:
        return jsonify({'error': 'Direct file serving is not available in production mode.'}), 400

    file_id = unquote(file_id)
    try:
        file_path, content_type, original_name = storage.serve_file(file_id)
        inline = request.args.get('inline', 'false').lower() == 'true'
        as_attachment = not inline
        return send_file(
            file_path,
            mimetype=content_type,
            as_attachment=as_attachment,
            download_name=original_name,
        )
    except FileNotFoundError:
        return jsonify({'error': 'File not found.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Entry point ───────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
