import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";
const LIST_FILE = join(DATA_DIR, "lightnovel_list.json");
const DETAIL_FILE = join(DATA_DIR, "lightnovel_detail.json");
const SERIES_FILE = join(DATA_DIR, "lightnovel_series.json");
const HIDDEN_FILE = join(DATA_DIR, "lightnovel_hidden.json");

const keyword = process.argv[2];
if (!keyword) {
  console.error("사용법: bun run script/recrawl_by_keyword.ts <키워드>");
  process.exit(1);
}

console.log(`\n🔍 키워드: "${keyword}"\n`);

interface LightNovelDetail {
  itemId: string;
  title: string;
  seriesName?: string;
  isbn?: string;
  [key: string]: any;
}

interface Series {
  name: string;
  items: { itemId: string; title: string | null; isbn: string | null }[];
}

interface ListItem {
  itemId: string;
  [key: string]: any;
}

interface HiddenItem {
  itemId?: string;
  isbn?: string;
  title?: string;
  [key: string]: any;
}

function matches(title: string): boolean {
  return title.toLowerCase().includes(keyword.toLowerCase());
}

async function loadJson<T>(filename: string): Promise<T> {
  const data = await readFile(join(process.cwd(), filename), "utf-8");
  return JSON.parse(data);
}

async function saveJson(filename: string, data: any): Promise<void> {
  await writeFile(join(process.cwd(), filename), JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  const list: ListItem[] = await loadJson(LIST_FILE);
  const details: LightNovelDetail[] = await loadJson(DETAIL_FILE);
  const series: Series[] = await loadJson(SERIES_FILE);
  const hidden: HiddenItem[] = await loadJson(HIDDEN_FILE);

  console.log(`=== 현재 데이터 ===`);
  console.log(`list: ${list.length}건`);
  console.log(`detail: ${details.length}건`);
  console.log(`series: ${series.length}건`);
  console.log(`hidden: ${hidden.length}건\n`);

  // 대상 itemId 수집
  const targetItemIds = new Set<string>();

  // detail에서 찾기
  for (const d of details) {
    if (matches(d.title) || (d.seriesName && matches(d.seriesName))) {
      targetItemIds.add(d.itemId);
    }
  }

  // series에서 찾기
  for (const s of series) {
    if (matches(s.name)) {
      for (const item of s.items) {
        targetItemIds.add(item.itemId);
      }
    }
  }

  // list에서 찾기
  for (const item of list) {
    const title = (item as any).title || "";
    if (matches(title)) {
      targetItemIds.add(item.itemId);
    }
  }

  console.log(`=== 삭제 대상 ===`);
  console.log(`총 고유 itemId: ${targetItemIds.size}건\n`);

  if (targetItemIds.size === 0) {
    console.log("삭제할 항목이 없습니다.");
    return;
  }

  // 대상 상세 정보 출력
  for (const itemId of targetItemIds) {
    const detail = details.find((d) => d.itemId === itemId);
    if (detail) {
      console.log(`  [${itemId}] ${detail.title}`);
    }
  }
  console.log();

  // 1. detail에서 제거 + 개별 파일 삭제
  const cleanDetails = details.filter((d) => !targetItemIds.has(d.itemId));
  let deletedDetailFiles = 0;
  for (const d of details) {
    if (targetItemIds.has(d.itemId) && d.isbn) {
      try {
        await unlink(join(process.cwd(), DATA_DIR, "detail", `${d.isbn}.json`));
        deletedDetailFiles++;
      } catch {}
    }
  }
  await saveJson(DETAIL_FILE, cleanDetails);
  console.log(`detail에서 제거: ${details.length - cleanDetails.length}건`);
  console.log(`detail 개별 파일 삭제: ${deletedDetailFiles}건`);

  // 2. series에서 제거
  const cleanSeries = series
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => !targetItemIds.has(item.itemId)),
    }))
    .filter((s) => s.items.length > 0 && !matches(s.name));
  await saveJson(SERIES_FILE, cleanSeries);
  console.log(`series에서 제거: ${series.length - cleanSeries.length}건`);

  // 3. list에서 제거
  const cleanList = list.filter((item) => !targetItemIds.has(item.itemId));
  await saveJson(LIST_FILE, cleanList);
  console.log(`list에서 제거: ${list.length - cleanList.length}건`);

  // 4. hidden에서 제거 (있다면)
  const cleanHidden = hidden.filter((h) => !h.itemId || !targetItemIds.has(h.itemId));
  if (cleanHidden.length < hidden.length) {
    await saveJson(HIDDEN_FILE, cleanHidden);
    console.log(`hidden에서 제거: ${hidden.length - cleanHidden.length}건`);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`이제以下를 실행하세요:`);
  console.log(`  bun run script/crawl.ts --detail-only`);
}

main().catch(console.error);
