import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-tts-assets.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        data = b'exported image'
        digest = hashlib.sha256(data).hexdigest()
        self.name = f'cards-{digest[:12]}.png'
        (self.root / self.name).write_bytes(data)
        self.manifest = self.root / 'manifest.json'
        self.payload = dict(schemaVersion=1, baseUrl=publisher.BASE_URL,
                            files=[dict(path=self.name, sha256=digest, bytes=len(data), contentType='image/png')])
        self.write()

    def tearDown(self):
        self.temp.cleanup()

    def write(self):
        self.manifest.write_text(json.dumps(self.payload))

    def test_preview_never_invokes_aws_or_network(self):
        with patch.object(publisher.subprocess, 'run') as run, patch.object(publisher, 'urlopen') as network:
            self.assertEqual(publisher.main(['--manifest', str(self.manifest)]), 0)
            run.assert_not_called()
            network.assert_not_called()

    def test_upload_commands_have_no_access_changes_or_deletion(self):
        files = publisher.load_files(self.manifest, publisher.BASE_URL)
        command = publisher.upload_command('aws', files[0])
        self.assertEqual(command[1:3], ['s3', 'cp'])
        self.assertIn('public,max-age=31536000,immutable', command)
        self.assertNotIn('--acl', command)
        self.assertNotIn('--delete', command)
        self.assertIn(f's3://{publisher.BUCKET}/{publisher.PREFIX}{self.name}', command)

    def test_traversal_and_checksum_mismatch_rejected(self):
        for mutation in [dict(path='../escape.png'), dict(sha256='0' * 64), dict(bytes=999), dict(path='/tmp/a.png')]:
            original = dict(self.payload['files'][0])
            self.payload['files'][0].update(mutation)
            self.write()
            with self.assertRaises(ValueError):
                publisher.load_files(self.manifest, publisher.BASE_URL)
            self.payload['files'][0] = original

    def test_symlink_outside_export_rejected(self):
        (self.root / 'escape.png').symlink_to('/etc/hosts')
        self.payload['files'][0]['path'] = 'escape.png'
        self.write()
        with self.assertRaises(ValueError):
            publisher.load_files(self.manifest, publisher.BASE_URL)

    def test_wrong_delivery_url_rejected(self):
        with self.assertRaises(ValueError):
            publisher.load_files(self.manifest, 'https://other.example/')
        for url in ['http://example.com/', 'https://user:secret@example.com/', 'https://example.com/?token=x']:
            with self.assertRaises(ValueError):
                publisher.validate_base_url(url)

    def test_missing_cli_does_not_attempt_upload(self):
        with patch.object(publisher.shutil, 'which', return_value=None), patch.object(publisher.subprocess, 'run') as run:
            self.assertEqual(publisher.main(['--manifest', str(self.manifest), '--upload']), 1)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
