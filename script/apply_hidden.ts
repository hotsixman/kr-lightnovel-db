import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";

interface HiddenItem {
  isbn?: string;
  itemId?: string;
}

async function main() {
  const hidden: HiddenItem[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_hidden.json"), "utf-8")
  );

  const hiddenIds = new Set(hidden.filter((h) => h.itemId).map((h) => h.itemId!));
  const hiddenIsbns = new Set(hidden.filter((h) => h.isbn).map((h) => h.isbn!));

  console.log(`hidden: ${hiddenIds.size}건(itemId), ${hiddenIsbns.size}건(isbn)`);

  // list
  const list: Array<{ itemId: string; title?: string }> = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_list.json"), "utf-8")
  );
  const listBefore = list.length;
  const listClean = list.filter(
    (i) => !hiddenIds.has(i.itemId)
  );
  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_list.json"), JSON.stringify(listClean, null, 2), "utf-8");
  console.log(`list: ${listBefore}건 → ${listClean.length}건 (-${listBefore - listClean.length})`);

  // detail
  const details: Array<{ itemId: string; isbn?: string }> = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), "utf-8")
  );
  const detailBefore = details.length;
  const detailClean = details.filter(
    (d) => !hiddenIds.has(d.itemId) && !(d.isbn && hiddenIsbns.has(d.isbn))
  );
  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), JSON.stringify(detailClean, null, 2), "utf-8");
  console.log(`detail: ${detailBefore}건 → ${detailClean.length}건 (-${detailBefore - detailClean.length})`);

  // series
  interface SeriesBook { itemId: string; title: string | null; isbn: string | null; }
  interface Series { name: string; items: SeriesBook[]; }
  const seriesList: Series[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_series.json"), "utf-8")
  );
  let seriesItemsBefore = seriesList.reduce((a, s) => a + s.items.length, 0);
  const seriesClean = seriesList
    .map((s) => {
      s.items = s.items.filter(
        (b) => !hiddenIds.has(b.itemId) && !(b.isbn && hiddenIsbns.has(b.isbn))
      );
      return s;
    })
    .filter((s) => s.items.length > 0);
  let seriesItemsAfter = seriesClean.reduce((a, s) => a + s.items.length, 0);
  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_series.json"), JSON.stringify(seriesClean, null, 2), "utf-8");
  console.log(`series: ${seriesList.length}건(${seriesItemsBefore}항목) → ${seriesClean.length}건(${seriesItemsAfter}항목) (-${seriesItemsBefore - seriesItemsAfter})`);
}

main().catch(console.error);
