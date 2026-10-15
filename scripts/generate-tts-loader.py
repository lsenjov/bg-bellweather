#!/usr/bin/env python3
"""Generate a manually invoked TTS layout importer from the asset manifest."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def public_url(asset):
    url = asset['url']
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError('Asset URL must be public HTTPS without embedded credentials')
    return url


def positive_integer(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f'{label} must be a positive integer')
    return value


def build_specs(manifest):
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Expected manifest schemaVersion 1')
    specs = []
    for index, deck in enumerate(manifest['decks']):
        width = positive_integer(deck['width'], 'Deck width')
        height = positive_integer(deck['height'], 'Deck height')
        number = positive_integer(deck['number'], 'Deck number')
        if number > width * height:
            raise ValueError('Deck count exceeds sheet dimensions')
        specs.append(dict(name=deck['name'], type='DeckCustom',
                          position=[-18 + (index % 8) * 5, 2, -15 - (index // 8) * 5],
                          custom=dict(face=public_url(deck['face']), back=public_url(deck['back']),
                                      width=width, height=height, number=number,
                                      unique_back=deck.get('uniqueBack', False),
                                      back_is_hidden=deck.get('backIsHidden', True))))
    shelf_index = 0
    for item in manifest['objects']:
        kind = item['kind']
        image = public_url(item['image'])
        secondary = public_url(item['imageSecondary']) if item.get('imageSecondary') else image
        count = positive_integer(item.get('count', 1), 'Object count')
        if kind == 'board':
            obj_type, custom = 'Custom_Board', dict(image=image)
        elif kind == 'figurine':
            obj_type, custom = 'Figurine_Custom', dict(image=image, image_secondary=secondary)
        elif kind in ('tile', 'token', 'reference', 'opening-marker'):
            obj_type, custom = 'Custom_Tile', dict(image=image, image_bottom=secondary,
                                                  type=0, thickness=0.15, stackable=False)
        else:
            raise ValueError(f'Unsupported object kind: {kind}')
        for copy in range(count):
            if kind == 'board' and item.get('id') == 'district-map':
                position = [0, 1, 0]
            else:
                position = [-22 + (shelf_index % 12) * 4, 2, 15 + (shelf_index // 12) * 4]
                shelf_index += 1
            spec = dict(name=item['name'], type=obj_type, custom=custom, position=position)
            if kind == 'board' and item.get('id') == 'district-map':
                spec.update(scale=[2, 1, 2], locked=True)
            elif kind == 'board':
                spec.update(scale=[0.25, 1, 0.25])
            specs.append(spec)
    return specs


def lua_long_string(text):
    equals = '='
    while ']' + equals + ']' in text:
        equals += '='
    return '[' + equals + '[' + text + ']' + equals + ']'


def generate(manifest):
    payload = json.dumps(build_specs(manifest), ensure_ascii=False, separators=(',', ':'))
    return '''-- Paste into Global, save, then run: lua Global.call("spawnBellwether")
-- Official API: https://api.tabletopsimulator.com/custom-game-objects/
-- Layout only. Choose a sufficiently large table and arrange/scale pieces before saving.
local bellwetherSpecs = JSON.decode(''' + lua_long_string(payload) + ''')
local bellwetherImported = false

function spawnBellwether()
    if bellwetherImported then
        print("Bellwether already imported in this script session. Start from an empty table to import again.")
        return
    end
    bellwetherImported = true
    for _, entry in ipairs(bellwetherSpecs) do
        local spec = entry
        local object = spawnObject({
            type = spec.type,
            position = spec.position,
            rotation = {0, 180, 0},
            callback_function = function(object)
                object.setName(spec.name)
                if spec.scale then object.setScale(spec.scale) end
                if spec.locked then object.setLock(true) end
            end
        })
        object.setCustomObject(spec.custom)
    end
    print("Bellwether components imported. Add native Support cubes and collection counters; see the guide.")
end
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path('assets/tts/manifest.json'))
    parser.add_argument('--output', type=Path, default=Path('assets/tts/import-bellwether.lua'))
    args = parser.parse_args()
    try:
        source = generate(json.loads(args.manifest.read_text()))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(source)
        print(f'Wrote {args.output}')
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Error: {error}\n')


if __name__ == '__main__':
    main()
