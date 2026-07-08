import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from parser import parse_file
from extract import extract_file
import embed


def run(txt_path):
    src = Path(txt_path)
    if not src.exists():
        sys.exit(f"no such file: {src}")

    out_dir = Path("data/processed")
    out_dir.mkdir(parents=True, exist_ok=True)

    records = parse_file(src)
    proc = out_dir / (src.stem + ".json")
    proc.write_text(
        __import__("json").dumps(records, ensure_ascii=False, indent=2), "utf-8"
    )
    print(f"parsed {len(records)} messages -> {proc}")

    extract_file(proc)  # writes <stem>.qa.json

    with embed.connect() as conn:
        embed.embed_group(conn, src.stem)
    print(f"loaded group '{src.stem}' into the database.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python ingest/run.py <export.txt>")
    run(sys.argv[1])
