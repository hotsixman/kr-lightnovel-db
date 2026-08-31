import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";

interface SeriesBook {
  itemId: string;
  title: string | null;
  isbn: string | null;
}

interface Series {
  name: string;
  items: SeriesBook[];
}

function cleanSeriesName(name: string): string {
  return name
    .replace(/^\s*\[절판\]\s*/i, "")
    .replace(/^\s*\[품절\]\s*/i, "")
    .trim();
}

async function main() {
  // series
  const seriesList: Series[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_series.json"), "utf-8")
  );

  let changed = 0;
  for (const s of seriesList) {
    const cleaned = cleanSeriesName(s.name);
    if (cleaned !== s.name) {
      console.log(`  "${s.name}" → "${cleaned}"`);
      s.name = cleaned;
      changed++;
    }
  }

  await writeFile(
    join(process.cwd(), DATA_DIR, "lightnovel_series.json"),
    JSON.stringify(seriesList, null, 2),
    "utf-8"
  );

  console.log(`시리즈 이름 정리: ${changed}건 변경`);
}

main().catch(console.error);
