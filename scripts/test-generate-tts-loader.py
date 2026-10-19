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
        return dict(schemaVersion=1, decks=[dict(name='Cards', physicalSizeMm=dict(width=63, height=88), width=3, height=2, number=5,
                    face=dict(url='https://example.com/face.png'), back=dict(url='https://example.com/back.png'))],
                    objects=[dict(id='district-map', name='Map', kind='board', physicalSizeMm=dict(width=420, height=297), image=dict(url='https://example.com/map.png')),
                             dict(id='portrait', name='Portrait', kind='tile', count=6, physicalSizeMm=dict(width=25.4, height=25.4),
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

    def test_unique_policy_backs_use_the_generic_hidden_slot(self):
        manifest = self.manifest()
        manifest['decks'][0].update(id='policies', uniqueBack=True, backIsHidden=False)
        specs = loader.build_specs(manifest)
        self.assertTrue(specs[0]['showBackWhenFaceDown'])
        self.assertNotIn('showBackWhenFaceDown', loader.build_specs(self.manifest())[0])
        custom = specs[0]['custom']
        self.assertTrue(custom['unique_back'])
        self.assertFalse(custom['back_is_hidden'])
        self.assertEqual(custom['back'], 'https://example.com/back.png')

    def test_staging_uses_physical_dimensions_without_overlap(self):
        manifest = self.manifest()
        manifest['objects'][1]['physicalSizeMm'] = dict(width=287, height=100)
        specs = loader.build_specs(manifest)
        def edges(spec):
            x, _, z = spec['position']
            size = spec['physicalSizeMm']
            w, h = size['width'] / 25.4, size['height'] / 25.4
            return x - w / 2, x + w / 2, z - h / 2, z + h / 2
        for index, first in enumerate(specs):
            a = edges(first)
            for second in specs[index + 1:]:
                b = edges(second)
                self.assertTrue(a[1] <= b[0] or b[1] <= a[0] or a[3] <= b[2] or b[3] <= a[2])

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
        physicalSizeMm={width=25.4,height=25.4},
        custom={image="https://example.com/front.png", image_bottom="https://example.com/back.png"}}}
end}
Wait = {condition = function(action, ready) assert(ready()); action() end}
function spawnObject(parameters)
    local object = {spawning=true}
    object.isDestroyed = function() return false end
    object.setCustomObject = function(custom)
        assert(object.spawning, "Custom asset was set after spawn completed without reload")
        object.custom = custom
    end
    object.getBoundsNormalized = function() return {size={x=7,y=1,z=9}} end
    object.getScale = function() return {x=2,y=3,z=4} end
    object.setScale = function(scale) object.scale = scale end
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

    @unittest.skipUnless(shutil.which('lua'), 'Lua runtime unavailable')
    def test_policy_backs_on_spawn_draw_restack_and_existing_table(self):
        harness = r'''
local policyUrl = "https://example.com/policies.png"
local normalUrl = "https://example.com/normal.png"
local function spec(url, policy)
 return {type="DeckCustom",name="Cards",showBackWhenFaceDown=policy,
  position={0,2,0},physicalSizeMm={width=63,height=88},
  custom={face=url,back="https://example.com/backs.png",unique_back=policy,back_is_hidden=not policy}}
end
JSON={decode=function() return {spec(policyUrl,true),spec(normalUrl,false)} end}
local waits, callbacks, spawned = {}, {}, {}
Wait={condition=function(action,ready) waits[#waits+1]={action,ready} end}
local function object(kind,url)
 local o={type=kind,hide_when_face_down=true,spawning=true,loading_custom=true,customReads=0}
 o.isDestroyed=function() return o.destroyed or false end
 o.custom={face=url,unique_back=true,back_is_hidden=false}
 o.getCustomObject=function()
  assert(not o.destroyed,"Read destroyed object's custom data")
  assert(o.type=="Card" or o.type=="Deck","Read unrelated custom data")
  o.customReads=o.customReads+1;return o.custom
 end
 o.setCustomObject=function(custom) o.custom=custom end
 o.getBoundsNormalized=function() return {size={x=3,y=1,z=4}} end
 o.getScale=function() return {x=1,y=1,z=1} end
 o.setScale=function(_) end
 o.setName=function(_) end
 return o
end
function spawnObject(parameters)
 local o=object("Deck",nil)
 spawned[#spawned+1]=o
 onObjectSpawn(o)
 callbacks[#callbacks+1]=function()
  o.spawning=false;o.loading_custom=false;parameters.callback_function(o)
 end
 return o
end
local function flush()
 local pending=waits;waits={}
 for _,w in ipairs(pending) do
  if w[2]() then w[1]() else waits[#waits+1]=w end
 end
end
'''
        assertions = r'''
spawnBellwether()
flush()
assert(#waits==2 and spawned[1].hide_when_face_down and spawned[2].hide_when_face_down)
for _,callback in ipairs(callbacks) do callback() end
flush()
assert(not spawned[1].hide_when_face_down and spawned[2].hide_when_face_down)
assert(spawned[1].custom.unique_back and not spawned[1].custom.back_is_hidden)

-- Drawn cards, the last remaining card and newly stacked decks each spawn as new objects.
local drawn,remainder,stacked = object("Card",policyUrl),object("Card",policyUrl),object("Deck",policyUrl)
local normal,stale,board = object("Card",normalUrl),object("Card","https://example.com/old.png"),object("Board",policyUrl)
local destroyed=object("Card",policyUrl)
for _,o in ipairs({drawn,remainder,stacked,normal,stale,board,destroyed}) do onObjectSpawn(o) end
flush()
assert(drawn.hide_when_face_down and remainder.hide_when_face_down and stacked.hide_when_face_down)
for _,o in ipairs({drawn,remainder,stacked,normal,stale}) do o.spawning=false;o.loading_custom=false end
destroyed.destroyed=true
flush()
assert(#waits==0 and not drawn.hide_when_face_down and not remainder.hide_when_face_down and not stacked.hide_when_face_down)
assert(normal.hide_when_face_down and stale.hide_when_face_down and board.hide_when_face_down)
assert(board.customReads==0 and destroyed.customReads==0)
assert(drawn.custom.unique_back and not drawn.custom.back_is_hidden)

local existingDeck,existingCard=object("Deck",policyUrl),object("Card",policyUrl)
function getAllObjects() return {existingDeck,existingCard,normal,stale,board} end
showBellwetherPolicyBacks()
assert(not existingDeck.hide_when_face_down and not existingCard.hide_when_face_down)
assert(normal.hide_when_face_down and stale.hide_when_face_down and board.customReads==0)
assert(#spawned==2,"Repair spawned replacement components")
'''
        result = subprocess.run(['lua', '-'], input=harness + loader.generate(self.manifest()) + assertions,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_invalid_and_wrong_kind_dimensions_rejected(self):
        for size in [None, [], 'bad', {}, {'width': 1}, {'width': 0, 'height': 2},
                     {'width': True, 'height': 2}, {'width': float('inf'), 'height': 2}]:
            manifest = self.manifest()
            if size is None:
                del manifest['objects'][0]['physicalSizeMm']
            else:
                manifest['objects'][0]['physicalSizeMm'] = size
            with self.assertRaises((ValueError, KeyError)):
                loader.build_specs(manifest)
        manifest = self.manifest()
        manifest['objects'][1]['kind'] = 'figurine'
        with self.assertRaises(ValueError):
            loader.build_specs(manifest)

    @unittest.skipUnless(shutil.which('lua'), 'Lua runtime unavailable')
    def test_normalized_bounds_scaling_readiness_and_existing_table(self):
        harness = r'''
local specs = {
 {name="Map",type="Custom_Board",locked=true,custom={image="https://example.com/district-map-new.png"},physicalSizeMm={width=420,height=297}},
 {name="Policy",type="DeckCustom",custom={face="https://example.com/cards.png"},physicalSizeMm={width=63,height=88}},
 {name="Agent",type="Figurine_Custom",custom={image="https://example.com/agent.png"},physicalSizeMm={width=25.4}}
}
JSON={decode=function() return specs end}
local waits={}
Wait={condition=function(action,ready) waits[#waits+1]={action,ready} end}
local function object(url, bounds, scale)
 local o={loading_custom=true, bounds=bounds,scale=scale}
 o.getCustomObject=function() return {image=url} end
 o.getBoundsNormalized=function() return {size=o.bounds} end
 o.getBounds=function() error("Rotated bounds must not be used") end
 o.getScale=function() return o.scale end
 o.setScale=function(s) o.scale={x=s[1],y=s[2],z=s[3]};o.changed=true end
 o.setLock=function(v) o.locked=v end
 return o
end
local map=object("https://example.com/district-map-9735a3d1c37bd84c.png",{x=30,z=20},{x=2,y=3,z=4})
local card=object("unused",{x=7,z=9},{x=5,y=6,z=7})
card.getCustomObject=function() return {face="https://example.com/cards.png"} end
local agent=object("https://example.com/agent.png",{x=4,z=2},{x=2,y=3,z=4})
local unrelated=object("https://example.com/other.png",{x=1,z=1},{x=1,y=1,z=1})
function getAllObjects() return {map,card,agent,unrelated} end
'''
        assertions = r'''
resizeBellwether()
assert(#waits==3)
for _, w in ipairs(waits) do assert(not w[2]()) end
map.loading_custom=false;card.loading_custom=false;agent.loading_custom=false
for _, w in ipairs(waits) do assert(w[2]());w[1]() end
local function near(a,b) assert(math.abs(a-b)<0.000001,tostring(a).." != "..tostring(b)) end
near(map.scale.x / 2 * 30, 420/25.4)
near(map.scale.z / 4 * 20, 297/25.4)
near(map.scale.y,3)
near(card.scale.x / 5 * 7 / (map.scale.x / 2 * 30),0.15)
near(card.scale.z / 7 * 9,88/25.4)
near(card.scale.y,6)
near(agent.scale.x,0.5);near(agent.scale.y,0.75);near(agent.scale.z,1)
assert(map.locked == nil and not unrelated.changed)
'''
        result = subprocess.run(['lua', '-'], input=harness + loader.generate(self.manifest()) + assertions,
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
