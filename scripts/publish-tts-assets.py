#!/usr/bin/env python3
"""Publish a validated TTS export; preview is the default."""
import argparse
import hashlib
import json
import mimetypes
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

BUCKET = 'lsenjov-boardgame-bellwether'
REGION = 'ap-southeast-2'
PREFIX = 'tabletop-simulator/'
BASE_URL = f'https://{BUCKET}.s3.{REGION}.amazonaws.com/{PREFIX}'


def load_files(manifest_path, base_url):
    root = manifest_path.resolve().parent
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Expected manifest schemaVersion 1')
    if manifest.get('baseUrl') != base_url:
        raise ValueError('Manifest baseUrl differs from delivery URL; regenerate the export with the intended URL')
    if manifest.get('bucket', BUCKET) != BUCKET or manifest.get('prefix', PREFIX) != PREFIX:
        raise ValueError('Manifest bucket/prefix differs from configured destination')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Manifest must contain a nonempty files list')
    files, seen = [], set()
    for entry in entries:
        name = entry.get('path')
        if not isinstance(name, str) or '\\' in name:
            raise ValueError('Invalid asset path')
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or str(rel) != name or name in seen:
            raise ValueError(f'Unsafe or duplicate asset path: {name}')
        seen.add(name)
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f'Asset missing or outside export directory: {name}')
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if entry.get('sha256') != digest or entry.get('bytes') != len(data):
            raise ValueError(f'Asset checksum/size mismatch: {name}')
        content_type = entry.get('contentType')
        expected_type = mimetypes.guess_type(name)[0]
        if not isinstance(content_type, str) or content_type != expected_type:
            raise ValueError(f'Invalid content type for {name}: expected {expected_type}')
        immutable = any(re.search(r'(?:^|[._-])' + digest[:length] + r'(?:[._-]|$)', rel.name)
                        for length in range(12, 65))
        files.append((path, name, content_type, immutable))
    return files


def validate_base_url(base_url):
    parsed = urlparse(base_url)
    if (parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not base_url.endswith('/')):
        raise ValueError('Delivery URL must be an HTTPS directory URL ending in / without credentials/query/fragment')


def upload_command(aws, file):
    path, name, content_type, immutable = file
    cache = 'public,max-age=31536000,immutable' if immutable else 'no-cache'
    return [aws, 's3', 'cp', str(path), f's3://{BUCKET}/{PREFIX}{name}',
            '--region', REGION, '--content-type', content_type, '--cache-control', cache,
            '--only-show-errors']


def verify_public(base_url, files):
    failures = []
    for _, name, _, _ in files:
        url = base_url + quote(name, safe='/')
        try:
            with urlopen(Request(url, method='HEAD'), timeout=20) as response:
                if response.status != 200:
                    failures.append(f'{name}: HTTP {response.status}')
        except Exception as error:
            failures.append(f'{name}: {error}')
    return failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path('assets/tts/manifest.json'))
    parser.add_argument('--base-url', default=BASE_URL, help='Public HTTPS delivery directory used by the export')
    parser.add_argument('--upload', action='store_true', help='Upload listed files using the AWS CLI, then verify public URLs')
    args = parser.parse_args(argv)
    try:
        validate_base_url(args.base_url)
        files = load_files(args.manifest, args.base_url)
        print(f'{len(files)} validated files → s3://{BUCKET}/{PREFIX}')
        if not args.upload:
            for _, name, _, _ in files:
                print(f'Would upload: {name}')
            print('Preview only. Use --upload to publish; bucket policies and ACLs are never changed.')
            return 0
        aws = shutil.which('aws')
        if not aws:
            raise ValueError('AWS CLI is not installed. Install/configure it, then rerun with --upload.')
        identity = subprocess.run([aws, 'sts', 'get-caller-identity', '--region', REGION],
                                  capture_output=True, text=True)
        if identity.returncode:
            raise ValueError('AWS credentials are unavailable or invalid. Configure AWS CLI authentication before uploading.')
        for file in files:
            subprocess.run(upload_command(aws, file), check=True)
        failures = verify_public(args.base_url, files)
        if failures:
            print('Uploaded, but public delivery verification failed:', file=sys.stderr)
            for failure in failures:
                print(f'  {failure}', file=sys.stderr)
            print('TTS requires publicly accessible asset URLs. Configure delivery access separately; no policy was changed.', file=sys.stderr)
            return 2
        print('Upload complete; every asset URL is publicly accessible.')
        return 0
    except (ValueError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
