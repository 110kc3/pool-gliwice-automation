import datetime as dt
import json
from unittest.mock import patch

import pytest
from master_aggregator import aggregate_data
from schedule_metadata import dates_from_text, configurations_from_text, lane_configuration, source_pdf


@pytest.mark.parametrize('text, monday', [
    ('02.11.2026 03.11.2026 04.11.2026 05.11.2026 06.11.2026 07.11.2026 08.11.2026', '02.11.2026'),
    ('Harmonogram od 09 do 15 listopada 2026 roku', '09.11.2026'),
    ('Harmonogram od 5 listopada 2026\nPoniedziałek Wtorek Środa\n11.11.26 r.', '09.11.2026'),
    ('Harmonogram od 30 marca do 5 kwietnia 2026', '30.03.2026'),
    ('Harmonogram od 28 grudnia do 3 stycznia 2027', '28.12.2026'),
    ('Harmonogram 26.10.2026 – 01.11.2026', '26.10.2026'),
])
def test_source_dates_are_not_replaced_by_build_week(text, monday):
    dates = dates_from_text(text)
    assert len(dates) == 7
    assert dates['Poniedziałek'] == monday
    assert dt.datetime.strptime(dates['Niedziela'], '%d.%m.%Y') - dt.datetime.strptime(monday, '%d.%m.%Y') == dt.timedelta(days=6)


@pytest.mark.parametrize('text', ['No dates', '31.02.2026', '02.11.2026 12.11.2026', 'od 9 do 14 listopada 2026'])
def test_missing_invalid_or_conflicting_dates_remain_unknown(text):
    assert dates_from_text(text) == {}


def test_open_ended_title_does_not_repeat_holiday_schedule_indefinitely():
    dates = dates_from_text('Harmonogram od 5 listopada 2026')
    assert list(dates) == ['Czwartek', 'Piątek', 'Sobota', 'Niedziela']
    assert dates['Czwartek'] == '05.11.2026'


def test_each_pool_keeps_its_own_source_dates(tmp_path):
    files = {}
    for name in ['mewa', 'neptun']:
        path = tmp_path / f'{name}_data.json'
        path.write_text(json.dumps([{'time': '08:00', 'days': {'Poniedziałek': 'dostępna'}}]))
        files[name] = path
    def metadata(path):
        title = 'od 2 do 8 listopada 2026' if path.name == 'mewa.pdf' else 'od 9 do 15 listopada 2026'
        return dates_from_text(title), {}
    with patch('master_aggregator.read_metadata', side_effect=metadata):
        aggregate_data(files, tmp_path / 'output.json')
    data = json.loads((tmp_path / 'output.json').read_text())
    assert [p['schedule'][0]['date'] for p in data] == ['02.11.2026', '09.11.2026']
    assert [p['dates']['Poniedziałek'] for p in data] == ['02.11.2026', '09.11.2026']


def test_unknown_source_date_does_not_borrow_current_week(tmp_path):
    path = tmp_path / 'mewa_data.json'
    path.write_text(json.dumps([{'time': '08:00', 'days': {'Poniedziałek': 'dostępna'}}]))
    with patch('master_aggregator.read_metadata', return_value=({}, {})):
        aggregate_data({'mewa': path}, tmp_path / 'output.json')
    pool = json.loads((tmp_path / 'output.json').read_text())[0]
    assert pool['dates'] == {}
    assert pool['weekRange'] is None
    assert 'date' not in pool['schedule'][0]


def test_split_configuration_is_read_per_day_and_applied_to_entries(tmp_path):
    config = configurations_from_text('50 metrów 50 metrów 50 metrów 50 metrów 2x25 metrów 2x25/50 metrów 50 metrów')
    path = tmp_path / 'olimpijczyk_data.json'
    path.write_text(json.dumps([{'time': '08:00', 'days': {'Piątek': '17x25m', 'Sobota': '7x50m, 1x25m'}}]))
    with patch('master_aggregator.read_metadata', return_value=(dates_from_text('od 9 do 15 listopada 2026'), config)):
        aggregate_data({'olimpijczyk': path}, tmp_path / 'output.json')
    entries = json.loads((tmp_path / 'output.json').read_text())[0]['schedule']
    assert [(e['totalLanes'], e['laneLength']) for e in entries] == [(20, '25m'), (10, '25m / 50m')]
    assert lane_configuration('8x25m', config['Piątek'])['totalLanes'] == 20


def test_canonical_source_is_not_selected_by_checkout_mtime(tmp_path):
    (tmp_path / 'Harmonogram_Olimpijczyk_latest.pdf').touch()
    (tmp_path / 'Harmonogram_Olimpijczyk_30_03-05_04_2026.pdf').touch()
    assert source_pdf('olimpijczyk', tmp_path).name == 'Harmonogram_Olimpijczyk_latest.pdf'
