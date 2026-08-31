import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";
const PATTERNS = ["세트", "한정판", "특별판", "합본", "박스", "초판", "구판"];

interface LightNovel {
  title: string;
  itemId: string;
  [key: string]: any;
}

async function main() {
  const list: LightNovel[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_list.json"), "utf-8")
  );
  const details: LightNovel[] = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), "utf-8")
  );
  
  // 기존 hidden 목록 로드
  const hiddenPath = join(process.cwd(), DATA_DIR, "lightnovel_hidden.json");
  const hiddenItems: LightNovel[] = JSON.parse(
    await readFile(hiddenPath, "utf-8")
  );
  const hiddenIds = new Set(hiddenItems.map((i) => i.itemId));

  // list에서 중복 추출 (키워드 기반 + itemId 기반)
  const listKeywordDupes = list.filter((i) =>
    PATTERNS.some((p) => i.title.includes(p))
  );
  
  // itemId 중복 추출
  const idCount = new Map<string, number>();
  for (const i of list) idCount.set(i.itemId, (idCount.get(i.itemId) || 0) + 1);
  const dupeIds = new Set([...idCount.entries()].filter(([, v]) => v > 1).map(([k]) => k));
  const listIdDupes = list.filter((i) => dupeIds.has(i.itemId));

  // 중복 항목 통합 (중복 제거)
  const allDupeMap = new Map<string, LightNovel>();
  for (const item of listKeywordDupes) allDupeMap.set(item.itemId, item);
  for (const item of listIdDupes) allDupeMap.set(item.itemId, item);
  const allDupes = [...allDupeMap.values()];

  // hidden에 없는 중복 항목만 추가
  const newHiddenItems = allDupes.filter((i) => !hiddenIds.has(i.itemId));

  // hidden 목록 업데이트
  const updatedHidden = [...hiddenItems, ...newHiddenItems];
  await writeFile(hiddenPath, JSON.stringify(updatedHidden, null, 2), "utf-8");

  // list와 detail에서 중복 항목 제거
  const dupeItemIds = new Set(newHiddenItems.map((i) => i.itemId));
  const listClean = list.filter((i) => !dupeItemIds.has(i.itemId));
  const detailClean = details.filter((i) => !dupeItemIds.has(i.itemId));

  // 원본 파일 업데이트
  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_list.json"), JSON.stringify(listClean, null, 2), "utf-8");
  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), JSON.stringify(detailClean, null, 2), "utf-8");

  console.log("=== 중복 격리 완료 ===");
  console.log(`  키워드 기반 중복: ${listKeywordDupes.length}건`);
  console.log(`  itemId 기반 중복: ${listIdDupes.length}건`);
  console.log(`  새롭게 hidden에 추가: ${newHiddenItems.length}건`);
  console.log(`  list에서 제거 후: ${listClean.length}건 남음`);
  console.log(`  detail에서 제거 후: ${detailClean.length}건 남음`);
  console.log(`  hidden 총: ${updatedHidden.length}건`);
}

main().catch(console.error);
