"""Shared helpers for the PDF parsers."""


def _is_nan(value):
    # NaN is the only value that is not equal to itself; this catches both Python
    # floats and numpy/pandas NaN without importing pandas here.
    return isinstance(value, float) and value != value


def nan_to_none(value):
    """Recursively replace NaN floats with None so the result serialises to valid JSON.

    pandas represents empty PDF cells as NaN. ``json.dump`` would write a bare
    ``NaN`` token, which is not valid JSON and breaks the browser's ``JSON.parse``.
    """
    if _is_nan(value):
        return None
    if isinstance(value, dict):
        return {k: nan_to_none(v) for k, v in value.items()}
    if isinstance(value, list):
        return [nan_to_none(v) for v in value]
    return value
