import importlib.util
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('physical_map', Path(__file__).with_name('generate-physical-map.py'))
physical_map = importlib.util.module_from_spec(spec)
spec.loader.exec_module(physical_map)


class PhysicalMapTests(unittest.TestCase):
    def test_partial_collinear_borders(self):
        left = [[0, 0], [4, 0], [4, 4], [0, 4]]
        right = [[4, 1], [8, 1], [8, 3], [4, 3], [4, 2]]
        self.assertEqual(physical_map.shared_segments(left, right),
                         [((4, 1), (4, 2)), ((4, 2), (4, 3))])
        self.assertEqual(physical_map.shared_segments(right, left),
                         physical_map.shared_segments(left, right))

    def test_point_contacts_and_crossings_are_not_borders(self):
        square = [[0, 0], [4, 0], [4, 4], [0, 4]]
        touching = [[4, 4], [8, 4], [8, 8], [4, 8]]
        crossing = [[2, -1], [3, -1], [3, 5], [2, 5]]
        self.assertEqual(physical_map.shared_segments(square, touching), [])
        self.assertEqual(physical_map.shared_segments(square, crossing), [])

    def test_thick_borders_follow_region_membership(self):
        study = {
            'nodes': {
                'A': {'polygon': [[0, 0], [4, 0], [4, 4], [0, 4]]},
                'B': {'polygon': [[4, 0], [8, 0], [8, 4], [4, 4]]},
                'C': {'polygon': [[8, 1], [12, 1], [12, 3], [8, 3]]}},
            'districts': {'A': {'region': 'one'}, 'B': {'region': 'one'}, 'C': {'region': 'two'}}}
        self.assertEqual(list(physical_map.region_borders(study)), [((8, 1), (8, 3))])

    def test_board_labels_and_preserved_fixtures(self):
        study = json.loads((physical_map.ROOT / 'docs/components/physical-map.json').read_text())
        root = ET.fromstring(physical_map.render(study))
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        self.assertEqual(root.attrib['viewBox'], '0 0 420 297')
        self.assertEqual(len(root.findall('.//svg:circle', ns)), 0)
        for group in root.findall('svg:g[@data-district]', ns):
            district = study['districts'][group.attrib['data-district']]
            capacity = district['capacity']
            retained = capacity if capacity == 3 else capacity // 2
            labels = group.findall('svg:text', ns)
            self.assertEqual(labels[0].text, f'{retained}/{capacity}')
            self.assertLess(float(labels[0].attrib['y']), float(labels[1].attrib['y']))
            self.assertEqual(group.find('svg:polygon', ns).attrib['fill'], physical_map.COLORS[capacity])
        wells = root.findall('.//svg:rect[@class="policy-well"]', ns)
        self.assertEqual(len(wells), 0)
        self.assertEqual({g.attrib['data-policy-region'] for g in root.findall('svg:g[@data-policy-region]', ns)},
                         {'Urban', 'Outlying', 'Industrial Belt', 'Centre'})
        self.assertNotIn('Support /', ET.tostring(root, encoding='unicode'))
        years = root.findall('.//svg:rect[@class="year-well"]', ns)
        self.assertTrue(all((well.attrib['width'], well.attrib['height']) == ('15', '15') for well in years))
        self.assertEqual(len(root.findall('.//svg:rect[@class="year-well"]', ns)), 6)


if __name__ == '__main__':
    unittest.main()
