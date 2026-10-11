"""Build a compact, offline GeoNames city index for local radio discovery.

Source: https://download.geonames.org/export/dump/cities15000.zip
GeoNames data: CC BY 4.0, https://www.geonames.org/
"""

import io
import json
import urllib.request
import zipfile
from pathlib import Path


SOURCE = "https://download.geonames.org/export/dump/cities15000.zip"
DESTINATION = Path(__file__).resolve().parents[1] / "public" / "geo" / "cities.json"


def main():
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    cities = []
    with archive.open("cities15000.txt") as source:
        for raw in source:
            fields = raw.decode("utf-8").rstrip("\n").split("\t")
            if len(fields) < 15:
                continue
            name, latitude, longitude, country_code, population = (
                fields[1], fields[4], fields[5], fields[8], fields[14]
            )
            try:
                cities.append([name, country_code, round(float(latitude), 4), round(float(longitude), 4), int(population or 0)])
            except ValueError:
                continue
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(cities, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {len(cities):,} cities to {DESTINATION}")


if __name__ == "__main__":
    main()
