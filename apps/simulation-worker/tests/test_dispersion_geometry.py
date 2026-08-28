import unittest

import numpy as np

from services.dispersion import _local_to_lon_lat, _point_in_ring, _rasterize_buildings


class DispersionGeometryTests(unittest.TestCase):
    def test_point_in_ring_classifies_grid_points(self):
        ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        x, y = np.meshgrid(np.asarray([1.0, 5.0, 11.0]), np.asarray([5.0]))

        result = _point_in_ring(x, y, ring)

        np.testing.assert_array_equal(result, [[True, True, False]])

    def test_rasterize_buildings_keeps_maximum_height_and_holes(self):
        buildings = [
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
                        [[6, 6], [14, 6], [14, 14], [6, 14], [6, 6]],
                    ],
                },
                "height": 10,
            },
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[10, 0], [30, 0], [30, 10], [10, 10], [10, 0]]],
                },
                "height": 20,
            },
        ]

        result = _rasterize_buildings(buildings, 0, 0, 6, 6, 5)

        self.assertEqual(result[0, 0], 10)
        self.assertEqual(result[0, 2], 20)
        self.assertEqual(result[0, 5], 20)
        self.assertEqual(result[2, 2], 0)

    def test_local_projection_preserves_center(self):
        lng, lat = _local_to_lon_lat(
            30.5,
            50.5,
            500000,
            5600000,
            np.asarray(500000.0),
            np.asarray(5600000.0),
        )

        self.assertAlmostEqual(float(lng), 30.5)
        self.assertAlmostEqual(float(lat), 50.5)


if __name__ == "__main__":
    unittest.main()
