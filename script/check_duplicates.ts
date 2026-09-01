import { readFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";
const LIST_FILE = join(DATA_DIR, "lightnovel_list.json");
const DETAIL_FILE = join(DATA_DIR, "lightnovel_detail.json");
const SERIES_FILE = join(DATA_DIR, "lightnovel_series.json");

interface LightNovel {
  title: string;
  itemId: string;
  isbn?: string;
}

interface LightNovelDetail {
  itemId: string;
  title: string;
  isbn?: string;
  seriesName?: string;
}

interface SeriesBook {
  itemId: string;
  isbn: string | null;
}

interface Series {
  name: string;
  items: SeriesBook[];
}

async function loadJson<T>(filename: string): Promise<T> {
  const data = await readFile(filename, "utf-8");
  return JSON.parse(data);
}

interface DuplicateInfo {
  type: "item" | "series-name";
  key: string;
  items: Array<{ itemId: string; title?: string; isbn?: string; seriesName?: string }>;
}

async function checkDuplicates(): Promise<DuplicateInfo[]> {
  const duplicates: DuplicateInfo[] = [];

  // 1. lightnovel_list.json - itemId 중복 체크
  const list: LightNovel[] = await loadJson(LIST_FILE);
  const listIdMap = new Map<string, LightNovel[]>();
  for (const item of list) {
    const arr = listIdMap.get(item.itemId) || [];
    arr.push(item);
    listIdMap.set(item.itemId, arr);
  }
  for (const [itemId, items] of listIdMap) {
    if (items.length > 1) {
      duplicates.push({
        type: "item",
        key: itemId,
        items: items.map((i) => ({ itemId: i.itemId, title: i.title })),
      });
    }
  }

  // 2. lightnovel_detail.json - itemId + isbn 조합 중복 체크
  const details: LightNovelDetail[] = await loadJson(DETAIL_FILE);
  const comboMap = new Map<string, LightNovelDetail[]>();
  for (const item of details) {
    const key = `${item.itemId}|${item.isbn || ""}`;
    const arr = comboMap.get(key) || [];
    arr.push(item);
    comboMap.set(key, arr);
  }
  for (const [key, items] of comboMap) {
    if (items.length > 1) {
      duplicates.push({
        type: "item",
        key,
        items: items.map((i) => ({ itemId: i.itemId, title: i.title, isbn: i.isbn })),
      });
    }
  }

  // 3. lightnovel_series.json - 같은 이름의 시리즈 체크
  const series: Series[] = await loadJson(SERIES_FILE);
  const seriesNameMap = new Map<string, Series[]>();
  for (const item of series) {
    const arr = seriesNameMap.get(item.name) || [];
    arr.push(item);
    seriesNameMap.set(item.name, arr);
  }
  for (const [name, items] of seriesNameMap) {
    if (items.length > 1) {
      duplicates.push({
        type: "series-name",
        key: name,
        items: items.flatMap((s) =>
          s.items.map((b) => ({
            itemId: b.itemId,
            isbn: b.isbn ?? undefined,
          }))
        ),
      });
    }
  }

  return duplicates;
}

async function main() {
  console.log("=== 데이터 중복 체크 시작 ===\n");

  const duplicates = await checkDuplicates();

  if (duplicates.length === 0) {
    console.log("✅ 중복이 없습니다.");
    process.exit(0);
  }

  console.log(`❌ ${duplicates.length}개의 중복이 발견되었습니다.\n`);

  for (const dup of duplicates) {
    if (dup.type === "item") {
      console.log(`[항목 중복] key=${dup.key}`);
    } else if (dup.type === "series-name") {
      console.log(`[시리즈 이름 중복] key=${dup.key}`);
    }
    for (const item of dup.items) {
      console.log(`  - itemId=${item.itemId}, title=${item.title || "(없음)"}, isbn=${item.isbn || "(없음)"}`);
    }
    console.log("");
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("에러 발생:", err);
  process.exit(1);
});
