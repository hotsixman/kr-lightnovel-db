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

async function main() {
  const details: Array<{ itemId: string }> = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), "utf-8")
  );
  const seriesList: Series[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_series.json"), "utf-8")
  );

  const detailIds = new Set(details.map((d) => d.itemId));

  let removed = 0;
  const cleaned = seriesList
    .map((s) => {
      const before = s.items.length;
      s.items = s.items.filter((b) => detailIds.has(b.itemId));
      removed += before - s.items.length;
      return s;
    })
    .filter((s) => s.items.length > 0);

  await writeFile(
    join(process.cwd(), DATA_DIR, "lightnovel_series.json"),
    JSON.stringify(cleaned, null, 2),
    "utf-8"
  );

  const total = cleaned.reduce((a, s) => a + s.items.length, 0);
  console.log(`시리즈: ${seriesList.length}건 → ${cleaned.length}건`);
  console.log(`항목: ${total + removed}건 → ${total}건 (제거 ${removed}건)`);
}

main().catch(console.error);
