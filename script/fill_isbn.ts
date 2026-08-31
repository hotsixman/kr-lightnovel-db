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
  const details: Array<{ itemId: string; isbn?: string }> = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), "utf-8")
  );
  const seriesList: Series[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_series.json"), "utf-8")
  );

  const detailMap = new Map(details.map((d) => [d.itemId, d.isbn]));

  let filled = 0;
  for (const series of seriesList) {
    for (const book of series.items) {
      if (!book.isbn) {
        const isbn = detailMap.get(book.itemId);
        if (isbn) {
          book.isbn = isbn;
          filled++;
        }
      }
    }
  }

  await writeFile(
    join(process.cwd(), DATA_DIR, "lightnovel_series.json"),
    JSON.stringify(seriesList, null, 2),
    "utf-8"
  );

  const remaining = seriesList.reduce(
    (acc, s) => acc + s.items.filter((b) => !b.isbn).length,
    0
  );
  console.log(`완료: ${filled}건 채움, 남은 null: ${remaining}건`);
}

main().catch(console.error);
