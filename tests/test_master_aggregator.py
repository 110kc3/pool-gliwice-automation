import unittest
from master_aggregator import transform_data

class TestDataTransformation(unittest.TestCase):

    def test_basic_transformation(self):
        # Test case simulating data from one successful pool
        raw_data = [
            {
                "time": "7.00- 8.00",
                "days": {"Poniedziałek": "20", "Wtorek": "15"},
                "name": "Mewa"
            }
        ]
        expected = [
            {
                "name": "Mewa",
                "schedule": [
                    {"day": "Poniedziałek", "time": "7.00- 8.00", "availableLanes": "20"},
                    {"day": "Wtorek", "time": "7.00- 8.00", "availableLanes": "15"}
                ]
            }
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_multiple_pools(self):
        # Test case simulating data from multiple distinct pools
        raw_data = [
            {"time": "9.00-10.00", "days": {"Poniedziałek": "10"}, "name": "Delfin"},
            {"time": "14.00-15.00", "days": {"Środa": "5"}, "name": "Olimpijczyk"}
        ]
        expected = [
            {"name": "Delfin", "schedule": [{"day": "Poniedziałek", "time": "9.00-10.00", "availableLanes": "10"}]},
            {"name": "Olimpijczyk", "schedule": [{"day": "Środa", "time": "14.00-15.00", "availableLanes": "5"}]}
        ]
        # Note: The order might vary based on insertion order, so we compare sets/sorted structures if possible,
        # but for this test, we assume the order dictated by the defaultdict keys is consistent.
        self.assertEqual(transform_data(raw_data), expected)

    def test_handling_nan_values(self):
        # Test case simulating a NaN value for lanes
        raw_data = [
            {
                "time": "10.00-11.00",
                "days": {"Czwartek": float('nan'), "Piątek": "1"},
                "name": "Mewa"
            }
        ]
        # The current implementation converts NaN to 'nan' string, which is what we test for.
        expected = [
            {"name": "Mewa", "schedule": [
                {"day": "Czwartek", "time": "10.00-11.00", "availableLanes": "nan"},
                {"day": "Piątek", "time": "10.00-11.00", "availableLanes": "1"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_empty_input(self):
        # Test with empty data list
        self.assertEqual(transform_data([]), [])

    def test_empty_days(self):
        # Test with an entry that has no days data
        raw_data = [
            {
                "time": "12.00-13.00",
                "days": {},
                "name": "EmptyTest"
            }
        ]
        self.assertEqual(transform_data(raw_data), [
            {"name": "EmptyTest", "schedule": []}
        ])

if __name__ == '__main__':
    unittest.main()