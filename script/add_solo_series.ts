import { readFile, writeFile } from "fs/promises";
import { join } from "path";

interface SeriesBook {
  itemId: string;
  title: string | null;
  isbn: string | null;
}

interface Series {
  name: string;
  items: SeriesBook[];
}

interface LightNovelDetail {
  itemId: string;
  title: string;
  seriesName?: string;
  isbn?: string;
  [key: string]: any;
}

const DATA_DIR = "data";
const DETAIL_FILE = join(DATA_DIR, "lightnovel_detail.json");
const SERIES_FILE = join(DATA_DIR, "lightnovel_series.json");

async function main() {
  const details: LightNovelDetail[] = JSON.parse(
    await readFile(join(process.cwd(), DETAIL_FILE), "utf-8")
  );
  const series: Series[] = JSON.parse(
    await readFile(join(process.cwd(), SERIES_FILE), "utf-8")
  );

  console.log(`전체 도서: ${details.length}건`);
  console.log(`전체 시리즈: ${series.length}건`);

  // 시리즈에 속한 책 itemId 수집
  const seriesItemIds = new Set(series.flatMap((s) => s.items.map((b) => b.itemId)));

  // 시리즈에 속하지 않은 책 찾기
  const soloBooks = details.filter((d) => !seriesItemIds.has(d.itemId));
  console.log(`시리즈 미속_book: ${soloBooks.length}건\n`);

  if (soloBooks.length === 0) {
    console.log("단독 시리즈를 만들 책이 없습니다.");
    return;
  }

  // 단독 시리즈 생성
  let added = 0;
  for (const book of soloBooks) {
    const soloSeries: Series = {
      name: book.title,
      items: [{ itemId: book.itemId, title: book.title, isbn: book.isbn ?? null }],
    };
    series.push(soloSeries);
    book.seriesName = book.title;
    added++;
    console.log(`  [${book.itemId}] ${book.title}`);
  }

  console.log(`\n단독 시리즈 생성: ${added}건`);

  // 저장
  await writeFile(
    join(process.cwd(), SERIES_FILE),
    JSON.stringify(series, null, 2),
    "utf-8"
  );
  await writeFile(
    join(process.cwd(), DETAIL_FILE),
    JSON.stringify(details, null, 2),
    "utf-8"
  );

  console.log("저장 완료");
}

main().catch(console.error);
