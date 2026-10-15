import importlib.util
from pathlib import Path
import shutil
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('loader', Path(__file__).with_name('generate-tts-loader.py'))
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)


class LoaderTests(unittest.TestCase):
    def manifest(self):
        return dict(schemaVersion=1, decks=[dict(name='Cards', width=3, height=2, number=5,
                    face=dict(url='https://example.com/face.png'), back=dict(url='https://example.com/back.png'))],
                    objects=[dict(id='district-map', name='Map', kind='board', image=dict(url='https://example.com/map.png')),
                             dict(id='portrait', name='Portrait', kind='tile', count=6,
                                  image=dict(url='https://example.com/awake.png'),
                                  imageSecondary=dict(url='https://example.com/asleep.png'))])

    def test_counts_deck_dimensions_and_portrait_reverse(self):
        specs = loader.build_specs(self.manifest())
        self.assertEqual(len(specs), 8)
        self.assertEqual(specs[0]['custom']['number'], 5)
        self.assertEqual(specs[0]['custom']['width'], 3)
        self.assertTrue(specs[0]['custom']['back_is_hidden'])
        for portrait in specs[2:]:
            self.assertEqual(portrait['custom']['image_bottom'], 'https://example.com/asleep.png')
        self.assertEqual(len({tuple(s['position']) for s in specs}), len(specs))

    def test_no_automatic_spawn_or_destructive_calls(self):
        lua = loader.generate(self.manifest())
        self.assertIn('function spawnBellwether()', lua)
        self.assertIn('if bellwetherImported then', lua)
        self.assertNotIn('function onLoad', lua)
        self.assertNotIn('destroyObject', lua)

    def test_embedded_lua_delimiter_cannot_escape(self):
        manifest = self.manifest()
        manifest['decks'][0]['name'] = 'malicious ]] print("escape") --'
        lua = loader.generate(manifest)
        self.assertIn('JSON.decode([=[', lua)
        self.assertIn(']=])', lua)

    @unittest.skipUnless(shutil.which('luac'), 'Lua compiler unavailable')
    def test_generated_lua_is_valid_syntax(self):
        result = subprocess.run(['luac', '-p', '-'], input=loader.generate(self.manifest()),
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('lua'), 'Lua runtime unavailable')
    def test_custom_assets_are_configured_before_spawn_completes(self):
        harness = r'''
local callbacks = {}
local objects = {}
JSON = {decode = function(_)
    return {{type="Custom_Tile", name="Portrait", position={0,2,0},
        custom={image="https://example.com/front.png", image_bottom="https://example.com/back.png"}}}
end}
function spawnObject(parameters)
    local object = {spawning=true}
    object.setCustomObject = function(custom)
        assert(object.spawning, "Custom asset was set after spawn completed without reload")
        object.custom = custom
    end
    object.setName = function(name) object.name = name end
    objects[#objects+1] = object
    callbacks[#callbacks+1] = function()
        assert(object.custom, "No custom asset supplied during initial spawn")
        object.spawning = false
        parameters.callback_function(object)
    end
    return object
end
'''
        assertions = r'''
spawnBellwether()
assert(#objects == 1)
assert(objects[1].custom.image_bottom == "https://example.com/back.png")
for _, callback in ipairs(callbacks) do callback() end
assert(objects[1].name == "Portrait")
spawnBellwether()
assert(#objects == 1, "Repeated invocation created duplicate objects")
'''
        result = subprocess.run(['lua', '-'],
                                input=harness + loader.generate(self.manifest()) + assertions,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_urls_counts_and_sheet_sizes_rejected(self):
        for url in ['file:///tmp/a.png', 'http://example.com/x', 'https://secret@example.com/x']:
            manifest = self.manifest()
            manifest['objects'][0]['image']['url'] = url
            with self.assertRaises(ValueError):
                loader.build_specs(manifest)
        manifest = self.manifest()
        manifest['decks'][0]['number'] = 7
        with self.assertRaises(ValueError):
            loader.build_specs(manifest)


if __name__ == '__main__':
    unittest.main()
