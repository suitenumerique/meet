"""Unit tests for the parsing of the LIVEKIT_CLUSTERS setting."""

import json
import re

import pytest

from core.livekit.specs import parse_livekit_clusters
from core.tests.utils import livekit_cluster_entry

SECRET = "s3cr3t-never-shown"


def test_parse_livekit_clusters_reads_every_field():
    """Every field of an entry is kept, the API secret hidden from the repr."""
    [spec] = parse_livekit_clusters(
        json.dumps(
            [
                {
                    "name": "paris-1",
                    "url": "wss://paris-1.livekit.test",
                    "api_url": "http://livekit.paris-1.svc:7880",
                    "api_key": "key-paris-1",
                    "api_secret": SECRET,
                    "weight": 0,
                }
            ]
        )
    )

    assert spec.name == "paris-1"
    assert spec.url == "wss://paris-1.livekit.test"
    assert spec.api_url == "http://livekit.paris-1.svc:7880"
    assert spec.api_key == "key-paris-1"
    assert spec.api_secret.get_secret_value() == SECRET
    assert spec.weight == 0
    assert SECRET not in repr(spec)


def test_parse_livekit_clusters_optional_fields():
    """The API URL and the weight may be left out."""
    [spec] = parse_livekit_clusters(json.dumps([livekit_cluster_entry("paris")]))

    assert spec.api_url is None
    assert spec.weight == 1


def test_parse_livekit_clusters_keeps_their_order():
    """The clusters keep the order they are listed in, the default one first."""
    specs = parse_livekit_clusters(
        json.dumps([livekit_cluster_entry(name) for name in ("lyon", "paris", "lille")])
    )

    assert [spec.name for spec in specs] == ["lyon", "paris", "lille"]


@pytest.mark.parametrize("scheme", ["http", "https", "ws", "wss"])
def test_parse_livekit_clusters_keeps_urls_as_written(scheme):
    """
    URLs of the four schemes LiveKit serves are accepted and left untouched.
    """
    [spec] = parse_livekit_clusters(
        json.dumps(
            [
                livekit_cluster_entry(
                    "paris",
                    url=f"{scheme}://paris.livekit.test",
                    api_url=f"{scheme}://10.0.0.1:7880",
                )
            ]
        )
    )

    assert spec.url == f"{scheme}://paris.livekit.test"
    assert spec.api_url == f"{scheme}://10.0.0.1:7880"


def test_parse_livekit_clusters_accepts_upper_case_schemes():
    """The scheme is not case sensitive, and the URL is kept as written."""
    [spec] = parse_livekit_clusters(
        json.dumps([livekit_cluster_entry("paris", url="HTTPS://paris.livekit.test")])
    )

    assert spec.url == "HTTPS://paris.livekit.test"


def test_parse_livekit_clusters_accepts_international_urls():
    """URLs may hold characters beyond ASCII, such as international domain names."""
    [spec] = parse_livekit_clusters(
        json.dumps([livekit_cluster_entry("paris", url="wss://visio.exämple.fr/é")])
    )

    assert spec.url == "wss://visio.exämple.fr/é"


@pytest.mark.parametrize(
    "raw,problem",
    [
        ("", "LIVEKIT_CLUSTERS: Invalid JSON"),
        ('{"name": "paris"}', "LIVEKIT_CLUSTERS: Input should be a valid array"),
        ("[]", "LIVEKIT_CLUSTERS: List should have at least 1 item"),
        ('["paris"]', "LIVEKIT_CLUSTERS[0]: Input should be an object"),
    ],
)
def test_parse_livekit_clusters_rejects_invalid_lists(raw, problem):
    """The value must be a non-empty JSON list of objects."""
    with pytest.raises(ValueError, match=re.escape(problem)):
        parse_livekit_clusters(raw)


NAME_PATTERN_PROBLEM = (
    "LIVEKIT_CLUSTERS[1].name: String should match pattern '^[a-z0-9-]{1,63}$'"
)
URL_SCHEME_PROBLEM = "URL scheme should be 'http', 'https', 'ws' or 'wss'"
URL_AUTHORITY_PROBLEM = "URL should be written scheme://host"
URL_CHARACTERS_PROBLEM = "URL should not contain whitespace or non-printable characters"


@pytest.mark.parametrize(
    "changes,problem",
    [
        ({"name": "Paris"}, NAME_PATTERN_PROBLEM),
        ({"name": "paris_1"}, NAME_PATTERN_PROBLEM),
        ({"name": ""}, NAME_PATTERN_PROBLEM),
        ({"name": "p" * 64}, NAME_PATTERN_PROBLEM),
        ({"name": "paris\n"}, NAME_PATTERN_PROBLEM),
        (
            {"url": "ftp://paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_SCHEME_PROBLEM}",
        ),
        (
            {"url": "paris.livekit.test"},
            "LIVEKIT_CLUSTERS[1].url: Input should be a valid URL",
        ),
        (
            {"url": "https:/paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_AUTHORITY_PROBLEM}",
        ),
        (
            {"url": "wss:\\\\paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_AUTHORITY_PROBLEM}",
        ),
        (
            {"url": "https:paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_AUTHORITY_PROBLEM}",
        ),
        (
            {"api_url": "https:///paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].api_url: {URL_AUTHORITY_PROBLEM}",
        ),
        (
            {"url": "wss://paris.livekit.test "},
            f"LIVEKIT_CLUSTERS[1].url: {URL_CHARACTERS_PROBLEM}",
        ),
        (
            {"url": "wss://paris.live\tkit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_CHARACTERS_PROBLEM}",
        ),
        (
            {"url": "wss://paris.\u200blivekit.test"},
            f"LIVEKIT_CLUSTERS[1].url: {URL_CHARACTERS_PROBLEM}",
        ),
        (
            {"api_url": "redis://paris.livekit.test"},
            f"LIVEKIT_CLUSTERS[1].api_url: {URL_SCHEME_PROBLEM}",
        ),
        (
            {"api_url": " http://10.0.0.1:7880"},
            f"LIVEKIT_CLUSTERS[1].api_url: {URL_CHARACTERS_PROBLEM}",
        ),
        (
            {"api_key": ""},
            "LIVEKIT_CLUSTERS[1].api_key: String should have at least 1 character",
        ),
        (
            {"api_secret": ""},
            "LIVEKIT_CLUSTERS[1].api_secret: Value should have at least 1 item",
        ),
        (
            {"region": "eu-west-3"},
            "LIVEKIT_CLUSTERS[1].region: Extra inputs are not permitted",
        ),
        (
            {"weight": -1},
            "LIVEKIT_CLUSTERS[1].weight: Input should be greater than or equal to 0",
        ),
        (
            {"weight": "2"},
            "LIVEKIT_CLUSTERS[1].weight: Input should be a valid integer",
        ),
        (
            {"weight": True},
            "LIVEKIT_CLUSTERS[1].weight: Input should be a valid integer",
        ),
        (
            {"weight": 1.5},
            "LIVEKIT_CLUSTERS[1].weight: Input should be a valid integer",
        ),
        (
            {"redis_url": "redis://paris.livekit.test"},
            "LIVEKIT_CLUSTERS[1].redis_url: Extra inputs are not permitted",
        ),
    ],
)
def test_parse_livekit_clusters_rejects_invalid_entries(changes, problem):
    """Each field is checked, values are not coerced and unknown fields are refused."""
    raw = json.dumps(
        [livekit_cluster_entry("lyon"), {**livekit_cluster_entry("paris"), **changes}]
    )

    with pytest.raises(ValueError, match=re.escape(problem)):
        parse_livekit_clusters(raw)


@pytest.mark.parametrize("field", ["name", "url", "api_key", "api_secret"])
def test_parse_livekit_clusters_requires_fields(field):
    """The name, the URL and the API key pair are required."""
    entry = livekit_cluster_entry("paris")
    del entry[field]

    with pytest.raises(
        ValueError, match=re.escape(f"LIVEKIT_CLUSTERS[0].{field}: Field required")
    ):
        parse_livekit_clusters(json.dumps([entry]))


def test_parse_livekit_clusters_reports_every_problem():
    """All the problems found are reported at once."""
    raw = json.dumps(
        [
            {**livekit_cluster_entry("paris"), "name": "Paris"},
            livekit_cluster_entry("lyon", weight=-1),
        ]
    )

    with pytest.raises(ValueError) as excinfo:
        parse_livekit_clusters(raw)

    assert str(excinfo.value) == (
        f"{NAME_PATTERN_PROBLEM.replace('[1]', '[0]')}; "
        "LIVEKIT_CLUSTERS[1].weight: Input should be greater than or equal to 0"
    )


def test_parse_livekit_clusters_rejects_duplicate_names():
    """Two clusters cannot have the same name."""
    raw = json.dumps(
        [
            livekit_cluster_entry("paris"),
            livekit_cluster_entry("lyon"),
            {**livekit_cluster_entry("lille"), "name": "paris"},
        ]
    )

    with pytest.raises(ValueError) as excinfo:
        parse_livekit_clusters(raw)

    assert str(excinfo.value) == (
        "LIVEKIT_CLUSTERS[2].name: 'paris' is already the name of LIVEKIT_CLUSTERS[0]"
    )


def test_parse_livekit_clusters_rejects_shared_api_keys():
    """Two clusters cannot share the API key that tells them apart, left unshown."""
    raw = json.dumps(
        [
            livekit_cluster_entry("paris", api_key=SECRET),
            livekit_cluster_entry("lyon"),
            livekit_cluster_entry("lille", api_key=SECRET),
        ]
    )

    with pytest.raises(ValueError) as excinfo:
        parse_livekit_clusters(raw)

    assert str(excinfo.value) == (
        "LIVEKIT_CLUSTERS[2].api_key: LIVEKIT_CLUSTERS[0] already uses this API key, "
        "each LiveKit cluster needs its own"
    )


@pytest.mark.parametrize(
    "raw",
    [
        f'[{{"api_secret": "{SECRET}"',
        json.dumps({"api_secret": SECRET}),
        json.dumps([SECRET]),
        json.dumps([livekit_cluster_entry("paris", api_secret=[SECRET])]),
        json.dumps([livekit_cluster_entry("paris", weight=SECRET)]),
        json.dumps([livekit_cluster_entry("paris", api_secret_file=SECRET)]),
        json.dumps([livekit_cluster_entry("paris", url=f"wss://{SECRET} ")]),
    ],
    ids=[
        "invalid JSON",
        "not a list",
        "not an object",
        "invalid secret",
        "secret in another field",
        "unknown field",
        "secret in a URL with whitespace",
    ],
)
def test_parse_livekit_clusters_never_shows_the_values_read(raw):
    """Problems name places only, and pydantic's error is not chained.

    Each of these values makes pydantic's own message show the secret.
    """
    with pytest.raises(ValueError) as excinfo:
        parse_livekit_clusters(raw)

    assert SECRET not in str(excinfo.value)
    assert excinfo.value.__cause__ is None
    assert excinfo.value.__context__ is None
