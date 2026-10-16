#!/usr/bin/env python3
"""Generate a manually invoked TTS layout importer from the asset manifest."""
import argparse
import json
import math
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


def physical_size(item, figurine=False):
    size = item['physicalSizeMm']
    required = {'width'} if figurine else {'width', 'height'}
    if not isinstance(size, dict) or set(size) != required:
        raise ValueError('Physical dimensions must specify width and height, or width only for figurines')
    for value in size.values():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError('Physical dimensions must be positive finite millimetres')
    return size


def build_specs(manifest):
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Expected manifest schemaVersion 1')
    specs = []
    for deck in manifest['decks']:
        width = positive_integer(deck['width'], 'Deck width')
        height = positive_integer(deck['height'], 'Deck height')
        number = positive_integer(deck['number'], 'Deck number')
        if number > width * height:
            raise ValueError('Deck count exceeds sheet dimensions')
        specs.append(dict(name=deck['name'], type='DeckCustom', physicalSizeMm=physical_size(deck),
                          custom=dict(face=public_url(deck['face']), back=public_url(deck['back']),
                                      width=width, height=height, number=number,
                                      unique_back=deck.get('uniqueBack', False),
                                      back_is_hidden=deck.get('backIsHidden', True))))
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
            spec = dict(name=item['name'], type=obj_type, custom=custom,
                        physicalSizeMm=physical_size(item, kind == 'figurine'))
            if kind == 'board' and item.get('id') == 'district-map':
                spec.update(position=[0, 1, 0], locked=True)
            specs.append(spec)
    x, z, row_depth = -24, 16, 0
    for spec in specs:
        if spec.get('locked'):
            continue
        size = spec['physicalSizeMm']
        width, depth = size['width'] / 25.4, size.get('height', size['width']) / 25.4
        if x + width > 24:
            x, z, row_depth = -24, z + row_depth + 1, 0
        spec['position'] = [x + width / 2, 2, z + depth / 2]
        x += width + 1
        row_depth = max(row_depth, depth)
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
-- Physical convention: one world unit = 25.4 mm. Choose a sufficiently large table.
local bellwetherSpecs = JSON.decode(''' + lua_long_string(payload) + ''')
local bellwetherImported = false

local function sizeBellwetherObject(object, spec)
    Wait.condition(function()
        local bounds = object.getBoundsNormalized().size
        local scale = object.getScale()
        local factor = spec.physicalSizeMm.width / 25.4 / bounds.x
        if spec.type == "Figurine_Custom" then
            object.setScale({scale.x * factor, scale.y * factor, scale.z * factor})
        else
            object.setScale({scale.x * factor, scale.y,
                scale.z * spec.physicalSizeMm.height / 25.4 / bounds.z})
        end
    end, function()
        if object.spawning or object.loading_custom then return false end
        local bounds = object.getBoundsNormalized().size
        return bounds.x > 0 and bounds.z > 0
    end, 30, function() print("Bellwether sizing timed out: " .. spec.name) end)
end

function resizeBellwether()
    local byUrl = {}
    for _, spec in ipairs(bellwetherSpecs) do
        byUrl[spec.custom.face or spec.custom.image] = spec
        if spec.locked then
            local legacy = string.gsub(spec.custom.image, "district%-map%-[^/]+%.png$",
                "district-map-9735a3d1c37bd84c.png")
            byUrl[legacy] = spec
        end
    end
    local count = 0
    for _, object in ipairs(getAllObjects()) do
        local custom = object.getCustomObject()
        local spec = custom and byUrl[custom.face or custom.image]
        if spec then
            sizeBellwetherObject(object, spec)
            count = count + 1
        end
    end
    print("Bellwether sizing requested for " .. count .. " matching objects.")
end

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
                sizeBellwetherObject(object, spec)
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
