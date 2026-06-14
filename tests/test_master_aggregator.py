import unittest
from master_aggregator import transform_data, is_noise_time, is_noise_value, clean_cell

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
        # NaN represents missing data: the implementation skips those slots rather
        # than emitting a literal "nan" string, which the frontend would render verbatim.
        expected = [
            {"name": "Mewa", "schedule": [
                {"day": "Piątek", "time": "10.00-11.00", "availableLanes": "1"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_skipping_non_dictionary_elements(self):
        # Test case for entries in raw_data that are not dictionaries (e.g., nulls, strings)
        raw_data = [
            {"time": "10.00-11.00", "days": {"Poniedziałek": "1"}, "name": "Mewa"},
            None,
            "a string entry",
            {"time": "12.00-13.00", "days": {"Wtorek": "2"}, "name": "Mewa"}
        ]
        expected = [
            {"name": "Mewa", "schedule": [
                {"day": "Poniedziałek", "time": "10.00-11.00", "availableLanes": "1"},
                {"day": "Wtorek", "time": "12.00-13.00", "availableLanes": "2"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_missing_time_key(self):
        # Test case where an entry is missing the 'time' key
        raw_data = [
            {
                "time": "7.00- 8.00",
                "days": {"Poniedziałek": "20"},
                "name": "Mewa"
            },
            {
                # Missing 'time' key
                "days": {"Wtorek": "15"},
                "name": "Mewa"
            }
        ]
        expected = [
            {"name": "Mewa", "schedule": [
                {"day": "Poniedziałek", "time": "7.00- 8.00", "availableLanes": "20"},
                {"day": "Wtorek", "time": "", "availableLanes": "15"} # Should default to empty time string
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_skips_header_and_date_rows(self):
        # Noise rows that the Olimpijczyk PDF emits: a title row, a "day of week"
        # header row, and a date row. None should survive into the output.
        raw_data = [
            {"time": "Harmonogram dostępności niecki basenowej", "days": {"Poniedziałek": float('nan')}, "name": "Olimpijczyk"},
            {"time": "Dzień\rtygodnia", "days": {"Poniedziałek": "Poniedziałek"}, "name": "Olimpijczyk"},
            {"time": "Data", "days": {"Poniedziałek": "30 marca"}, "name": "Olimpijczyk"},
            {"time": "7.00- 8.00", "days": {"Poniedziałek": "4x50m"}, "name": "Olimpijczyk"},
        ]
        expected = [
            {"name": "Olimpijczyk", "schedule": [
                {"day": "Poniedziałek", "time": "7.00- 8.00", "availableLanes": "4x50m"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_skips_noise_values_within_valid_rows(self):
        # A genuine time slot whose individual cells are junk (stray letter, column
        # header) should drop those cells but keep the real ones.
        raw_data = [
            {"time": "7.00- 8.00",
             "days": {"Poniedziałek": "n", "Wtorek": "Ilość wolnych torów", "Środa": "8x50m"},
             "name": "Olimpijczyk"},
        ]
        expected = [
            {"name": "Olimpijczyk", "schedule": [
                {"day": "Środa", "time": "7.00- 8.00", "availableLanes": "8x50m"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_strips_carriage_returns(self):
        raw_data = [
            {"time": "7.00-\r8.00", "days": {"Poniedziałek": "Pływalnia dostępna-zajęte 2\rtory"}, "name": "Mewa"},
        ]
        expected = [
            {"name": "Mewa", "schedule": [
                {"day": "Poniedziałek", "time": "7.00- 8.00", "availableLanes": "Pływalnia dostępna-zajęte 2 tory"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)

    def test_skips_none_lane_values(self):
        raw_data = [
            {"time": "7.00- 8.00", "days": {"Poniedziałek": None, "Wtorek": "5x50m"}, "name": "Olimpijczyk"},
        ]
        expected = [
            {"name": "Olimpijczyk", "schedule": [
                {"day": "Wtorek", "time": "7.00- 8.00", "availableLanes": "5x50m"}
            ]}
        ]
        self.assertEqual(transform_data(raw_data), expected)


class TestNoiseHelpers(unittest.TestCase):

    def test_is_noise_time(self):
        for junk in ["Data", "Dzień\rtygodnia", "Harmonogram dostępności", "Godzina"]:
            self.assertTrue(is_noise_time(junk), junk)
        for real in ["7.00- 8.00", "9.00-10.00", ""]:
            self.assertFalse(is_noise_time(real), real)

    def test_is_noise_value(self):
        for junk in ["n", "a", "Środa", "Poniedziałek", "30 marca", "5 kwietnia",
                     "Ilość wolnych torów", "P\rł\ry\rw", ""]:
            self.assertTrue(is_noise_value(junk), junk)
        for real in ["4x50m", "Pływalnia dostępna", "wolne wszystkie tory",
                     "Zajęty 3 tory", "Pływalnia niedostępna"]:
            self.assertFalse(is_noise_value(real), real)

    def test_clean_cell(self):
        self.assertEqual(clean_cell("a\rb  c"), "a b c")
        self.assertEqual(clean_cell(None), "")


if __name__ == '__main__':
    unittest.main()