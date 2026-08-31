import * as cheerio from "cheerio";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

// ─── 타입 정의 ─────────────────────────────────────────────

interface LightNovel {
  title: string;
  subtitle?: string;
  authors: string[];
  illustrators: string[];
  translators: string[];
  publisher?: string;
  publishDate?: string;
  itemId: string;
  url: string;
}

interface LightNovelDetail {
  itemId: string;
  title: string;
  subtitle?: string;
  authors: string[];
  illustrators: string[];
  translators: string[];
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  pages?: number;
  seriesName?: string;
  cover: string | null;
  url: string;
}

interface SeriesBook {
  itemId: string;
  title: string | null;
  isbn: string | null;
}

interface Series {
  name: string;
  items: SeriesBook[];
}

interface CrawlOptions {
  listStopItemId?: string;
  delayMs?: number;
  maxPages?: number;
  maxItems?: number;
  /** 리스트 크롤링만 실행 (--list-only) */
  listOnly?: boolean;
  /** 상세 크롤링만 실행 (--detail-only) */
  detailOnly?: boolean;
}

const BASE_URL = "https://www.aladin.co.kr";
const COOKIES_FILE = "cookies.json";

// ─── 쿠키 유틸리티 ──────────────────────────────────────────

let cachedCookieStr: string | null = null;

async function loadCookies(): Promise<string> {
  if (cachedCookieStr !== null) return cachedCookieStr;
  try {
    const data = await readFile(join(process.cwd(), COOKIES_FILE), "utf-8");
    const parsed = JSON.parse(data);
    // 객체 형태: { "name": "value", ... }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cachedCookieStr = Object.entries(parsed).map(([k, v]) => `${k}=${v}`).join("; ");
    }
    // 배열 형태: [{ name, value }, ...]
    else if (Array.isArray(parsed)) {
      cachedCookieStr = parsed.map((c: any) => `${c.name}=${c.value}`).join("; ");
    } else {
      cachedCookieStr = "";
    }
  } catch {
    cachedCookieStr = "";
  }
  return cachedCookieStr!;
}

async function getCookieHeader(): Promise<Record<string, string>> {
  const cookieStr = await loadCookies();
  if (!cookieStr) return {};
  return { Cookie: cookieStr };
}
const PATTERNS = ["세트", "한정판", "특별판", "합본", "박스", "초판", "구판"];
const DATA_DIR = "data";
const LINKS_FILE = join(DATA_DIR, "lightnovel_links.json");
const LIST_FILE = join(DATA_DIR, "lightnovel_list.json");
const DETAIL_FILE = join(DATA_DIR, "lightnovel_detail.json");
const SERIES_FILE = join(DATA_DIR, "lightnovel_series.json");
const HIDDEN_FILE = join(DATA_DIR, "lightnovel_hidden.json");

// ─── 유틸리티 ───────────────────────────────────────────────

async function loadJson<T>(filename: string): Promise<T> {
  const dataPath = join(process.cwd(), filename);
  try {
    const data = await readFile(dataPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`[loadJson] ${filename} 로드 실패: ${err}`);
    await writeFile(dataPath, "[]", 'utf-8');
    return [] as unknown as T;
  }
}

async function saveJson<T>(filename: string, data: T): Promise<void> {
  await writeFile(join(process.cwd(), filename), JSON.stringify(data, null, 2), "utf-8");
}

function cleanName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s*(지음|글|그림|삽화|일러스트|옮김|옮긴|번역)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVolumeNumber(title: string): string {
  return title
    .replace(/^\s*\[절판\]\s*/i, "")
    .replace(/^\s*\[품절\]\s*/i, "")
    .replace(/\s*(제\s*)?\d+(\s*권)?\s*$/i, "")
    .replace(/\s*Vol\.?\s*\d+\s*$/i, "")
    .replace(/\s*Volume\.?\s*\d+\s*$/i, "")
    .replace(/\s*\d+(\.\d+)?\s*$/, "")
    .replace(/\s*-\s*Novel Engine\s*$/i, "")
    .replace(/\s*-\s*S Novel\+?\s*$/i, "")
    .replace(/\s*-\s*L Novel\s*$/i, "")
    .replace(/\s*-\s*J Novel\s*$/i, "")
    .replace(/\s*-\s*ROSY\s*$/i, "")
    .replace(/\s*-\s*S 블랙\s*$/i, "")
    .trim();
}

// ─── 목록 파싱용 유틸리티 ──────────────────────────────────

function parseAuthorString(authorText: string): {
  authors: string[];
  illustrators: string[];
  translators: string[];
  publisher: string | undefined;
  publishDate: string | undefined;
} {
  const authors: string[] = [];
  const illustrators: string[] = [];
  const translators: string[] = [];
  let publisher: string | undefined;
  let publishDate: string | undefined;

  const parts = authorText.split("|").map((s) => s.trim());

  const lastPart = parts[parts.length - 1];
  const dateMatch = lastPart.match(/(\d{4})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?/);
  if (dateMatch) {
    publishDate = dateMatch[3]
      ? `${dateMatch[1]}.${dateMatch[2].padStart(2, "0")}.${dateMatch[3].padStart(2, "0")}`
      : `${dateMatch[1]}.${dateMatch[2].padStart(2, "0")}`;
    parts.pop();
  }

  if (parts.length >= 2) {
    publisher = parts[parts.length - 1].trim();
    parts.pop();
  }

  const rolePattern = /<a[^>]*>([^<]+)<\/a>\s*\(([^)]+)\)/g;
  let match;
  const authorParts: Array<{ name: string; role: string }> = [];
  while ((match = rolePattern.exec(authorText)) !== null) {
    authorParts.push({ name: match[1].trim(), role: match[2].trim() });
  }

  if (authorParts.length > 0) {
    for (const { name, role } of authorParts) {
      const cleanRole = role.replace(/[()]/g, "").trim();
      if (cleanRole.includes("지은") || cleanRole.includes("글") || cleanRole === "이") {
        if (cleanRole === "이") translators.push(name);
        else authors.push(name);
      } else if (cleanRole.includes("그림") || cleanRole.includes("삽화") || cleanRole.includes("일러")) {
        illustrators.push(name);
      } else if (cleanRole.includes("옮긴") || cleanRole.includes("번역")) {
        translators.push(name);
      }
    }
  } else {
    const items = parts[0].split(/[,，]/).map((s) => s.trim()).filter((s) => s);
    for (const part of items) {
      const cleaned = cleanName(part);
      if (!cleaned || cleaned.length < 1) continue;
      if (part.includes("지음") || part.includes("글")) authors.push(cleaned);
      else if (part.includes("그림") || part.includes("삽화") || part.includes("일러")) illustrators.push(cleaned);
      else if (part.includes("옮김") || part.includes("옮긴") || part.includes("번역")) translators.push(cleaned);
      else authors.push(cleaned);
    }
  }

  return { authors, illustrators, translators, publisher, publishDate };
}

function findAuthorLi($: cheerio.CheerioAPI, $parentUl: cheerio.Cheerio<any>): cheerio.Cheerio<any> | undefined {
  let authorLi: cheerio.Cheerio<any> | undefined;
  $parentUl.find("li").each((_, liEl) => {
    const text = $(liEl).text();
    if (text.includes("(지은이)") || text.includes("(그림)") || text.includes("(옮긴이)") || text.includes("(일러스트)")) {
      authorLi = $(liEl);
      return false;
    }
  });
  return authorLi;
}

// ─── 상세 페이지 파싱 ──────────────────────────────────────

function parseDetailAuthorString(authorText: string): {
  authors: string[];
  illustrators: string[];
  translators: string[];
  publisher: string | undefined;
  publishDate: string | undefined;
} {
  const authors: string[] = [];
  const illustrators: string[] = [];
  const translators: string[] = [];
  let publisher: string | undefined;
  let publishDate: string | undefined;

  const cleanText = authorText
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();

  // 1. 날짜 추출
  const dateMatch = cleanText.match(/(\d{4})-(\d{2})-(\d{2})/);
  let dateIdx = -1;
  if (dateMatch) {
    publishDate = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
    dateIdx = cleanText.indexOf(dateMatch[0]);
  }
  const textToDate = dateIdx >= 0 ? cleanText.substring(0, dateIdx) : cleanText;

  // 2. 역할 기반 파싱
  const rolePattern = /([^,(]+?)\s*\(([^)]+)\)/g;
  let lastRoleEnd = 0;
  let match;
  const validRoles = ["지은", "글", "그림", "삽화", "일러", "옮긴", "번역"];

  while ((match = rolePattern.exec(textToDate)) !== null) {
    const name = match[1].replace(/^,\s*/, "").trim();
    const role = match[2].trim();
    if (!validRoles.some((r) => role.includes(r))) continue;

    if (role.includes("지은") || role.includes("글")) authors.push(name);
    else if (role.includes("그림") || role.includes("삽화") || role.includes("일러")) illustrators.push(name);
    else if (role.includes("옮긴") || role.includes("번역")) translators.push(name);
    lastRoleEnd = match.index + match[0].length;
  }

  // 3. 출판사
  if (lastRoleEnd > 0) {
    const afterRoles = textToDate.substring(lastRoleEnd).replace(/^,\s*/, "").trim();
    if (afterRoles.length > 0) publisher = afterRoles;
  }

  return { authors, illustrators, translators, publisher, publishDate };
}

// ─── 목록 크롤링 ────────────────────────────────────────────

function getBaseUrl(): string {
  const url = new URL("https://www.aladin.co.kr/shop/wbrowse.aspx?BrowseTarget=List&ViewRowsCount=50&ViewType=Detail&PublishMonth=0&SortOrder=5&page=1&Stockstatus=1&PublishDay=84&CID=50927&SearchOption=");
  url.searchParams.delete("page");
  return url.toString();
}

function getLastPage($: cheerio.CheerioAPI): number {
  let lastPage = 1;
  $("a[href*='Page_Set']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/Page_Set\('(\d+)'\)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > lastPage) lastPage = num;
    }
  });
  return lastPage;
}

function parsePage($: cheerio.CheerioAPI, stopItemId?: string): { novels: LightNovel[]; stopped: boolean } {
  const novels: LightNovel[] = [];
  const seenItemIds = new Set<string>();
  let stopped = false;

  const processItem = (fullTitle: string, itemId: string, subtitle?: string, authorText?: string) => {
    if (!itemId || !fullTitle || seenItemIds.has(itemId)) return;
    seenItemIds.add(itemId);
    if (stopItemId && itemId === stopItemId) { stopped = true; return; }
    const parsed = authorText ? parseAuthorString(authorText) : { authors: [], illustrators: [], translators: [], publisher: undefined, publishDate: undefined };
    novels.push({ title: fullTitle, subtitle, ...parsed, itemId, url: `${BASE_URL}/shop/wproduct.aspx?ItemId=${itemId}` });
  };

  for (const element of $("a.bk66[href*='ItemId']").toArray()) {
    if (stopped) break;
    const $el = $(element);
    const fullTitle = $el.text().trim();
    const href = $el.attr("href") || "";
    const itemIdMatch = href.match(/ItemId=(\d+)/);
    const itemId = itemIdMatch ? itemIdMatch[1] : "";
    const authorText = $el.closest("td").find("span.author").text().trim();
    processItem(fullTitle, itemId, undefined, authorText);
  }

  for (const element of $("a.bo3[href*='ItemId']").toArray()) {
    if (stopped) break;
    const $el = $(element);
    const fullTitle = $el.text().trim();
    const href = $el.attr("href") || "";
    const itemIdMatch = href.match(/ItemId=(\d+)/);
    const itemId = itemIdMatch ? itemIdMatch[1] : "";
    let subtitle: string | undefined;
    const $subtitleSpan = $el.next("span.ss_f_g2");
    if ($subtitleSpan.length) {
      const subtitleText = $subtitleSpan.text().trim().replace(/^-\s*/, "");
      if (subtitleText) subtitle = subtitleText;
    }
    const $parentUl = $el.closest("ul");
    const $authorLi = findAuthorLi($, $parentUl);
    const authorText = $authorLi ? $authorLi.text().trim() : "";
    processItem(fullTitle, itemId, subtitle, authorText);
  }

  // span.Ere_bo_title 요소에서 제목 추출 (일부 책에서 a.bo3 대신 사용)
  for (const element of $("span.Ere_bo_title").toArray()) {
    if (stopped) break;
    const $el = $(element);
    const fullTitle = $el.text().trim();
    if (!fullTitle) continue;
    // 부모 요소에서 itemId 찾기
    const $parent = $el.closest("a[href*='ItemId']").length ? $el.closest("a[href*='ItemId']") : $el.closest("li").find("a[href*='ItemId']").first();
    const href = $parent.attr("href") || "";
    const itemIdMatch = href.match(/ItemId=(\d+)/);
    const itemId = itemIdMatch ? itemIdMatch[1] : "";
    if (!itemId) continue;
    // 이미 처리된 itemId는 건너뛰기
    if (seenItemIds.has(itemId)) continue;
    const $parentUl = $el.closest("ul");
    const $authorLi = findAuthorLi($, $parentUl);
    const authorText = $authorLi ? $authorLi.text().trim() : "";
    processItem(fullTitle, itemId, undefined, authorText);
  }

  return { novels, stopped };
}

async function fetchPage(baseUrl: string, pageNum: number): Promise<string> {
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(pageNum));
  const headers = await getCookieHeader();
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}: page ${pageNum}`);
  return response.text();
}

async function crawlListPages(options: CrawlOptions = {}): Promise<LightNovel[]> {
  const opts = structuredClone(options);
  let stopItemId = opts.listStopItemId;
  const delayMs = opts.delayMs ?? 300;
  const maxPages = opts.maxPages;

  const existingList: LightNovel[] = await loadJson(LIST_FILE);
  const hiddenItems: Array<{ isbn?: string; itemId?: string }> = await loadJson(HIDDEN_FILE);
  const hiddenIds = new Set(hiddenItems.filter((h) => h.itemId).map((h) => h.itemId!));
  const hiddenIsbns = new Set(hiddenItems.filter((h) => h.isbn).map((h) => h.isbn!));

  // stopItemId: 명시적이지 않으면 기존 리스트 데이터의 첫 번째 항목 사용
  if (!stopItemId && existingList.length > 0) {
    stopItemId = existingList[0].itemId;
    console.log(`기존 리스트 ${existingList.length}건. listStopItemId=${stopItemId}\n`);
  }
  const baseUrl = getBaseUrl();

  console.log("1페이지 로딩 중...");
  const firstHtml = await fetchPage(baseUrl, 1);
  const $first = cheerio.load(firstHtml);
  const detectedLastPage = getLastPage($first);
  const lastPage = maxPages ? Math.min(maxPages, detectedLastPage) : detectedLastPage;
  console.log(`총 ${detectedLastPage}개 페이지 중 ${lastPage}개 크롤링\n`);

  const allNovels: LightNovel[] = [];
  for (let page = 1; page <= lastPage; page++) {
    const html = page === 1 ? firstHtml : await (async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      return fetchPage(baseUrl, page);
    })().catch((err) => { console.error(`  ✗ 페이지 ${page} 실패: ${err}`); return null; });

    if (!html) continue;
    const $ = cheerio.load(html);
    const { novels, stopped } = parsePage($, stopItemId);
    allNovels.push(...novels);
    console.log(`페이지 ${page}/${lastPage} — ${novels.length}건 (누적: ${allNovels.length})`);
    if (stopped) { console.log(`\nstopItemId(${stopItemId}) 발견! 중단.`); break; }
  }

  const mergedList = [...allNovels, ...existingList];

  // ── 제목이 빈 문자열인 항목 제거 (hidden에 넣지 않고 바로 삭제) ──
  const emptyTitleItems = mergedList.filter((n) => !n.title || !n.title.trim());
  if (emptyTitleItems.length > 0) {
    console.log(`\n── 제목 없음 삭제: ${emptyTitleItems.length}건 ──`);
    for (const item of emptyTitleItems) console.log(`  [${item.itemId}] (제목 없음)`);
  }
  const validList = mergedList.filter((n) => n.title && n.title.trim());

  // ── 키워드 기반 중복 탐지 ──
  const keywordDupes = mergedList.filter((n) =>
    PATTERNS.some((p) => n.title.includes(p))
  );

  // ── itemId 중복 탐지 ──
  const idCount = new Map<string, number>();
  for (const n of mergedList) idCount.set(n.itemId, (idCount.get(n.itemId) || 0) + 1);
  const dupeIds = new Set([...idCount.entries()].filter(([, v]) => v > 1).map(([k]) => k));
  const idDupes = mergedList.filter((n) => dupeIds.has(n.itemId));

  // ── 제목 기반 중복 탐지 (완전히 같은 제목) ──
  const titleGroups = new Map<string, LightNovel[]>();
  for (const n of mergedList) {
    const key = n.title.trim().toLowerCase();
    const arr = titleGroups.get(key) || [];
    arr.push(n);
    titleGroups.set(key, arr);
  }
  const titleDupes: LightNovel[] = [];
  for (const [, items] of titleGroups) {
    if (items.length <= 1) continue;
    // itemId가 작은 쪽을 hidden으로
    items.sort((a, b) => Number(a.itemId) - Number(b.itemId));
    for (let i = 0; i < items.length - 1; i++) {
      titleDupes.push(items[i]);
    }
  }

  // 중복 통합 (키워드 + itemId + 제목)
  const allDupeMap = new Map<string, LightNovel>();
  for (const item of keywordDupes) allDupeMap.set(item.itemId, item);
  for (const item of idDupes) allDupeMap.set(item.itemId, item);
  for (const item of titleDupes) allDupeMap.set(item.itemId, item);
  const allListDupes = [...allDupeMap.values()];

  // 제목이 빈 문자열인 항목은 hidden에 넣지 않음
  const emptyTitleIds = new Set(emptyTitleItems.map((n) => n.itemId));

  // hidden에 없는 중복만 hidden으로 이동 (제목 없는 항목 제외)
  const newHiddenItems = allListDupes.filter((n) => !hiddenIds.has(n.itemId) && !emptyTitleIds.has(n.itemId));
  if (newHiddenItems.length > 0) {
    const updatedHidden = [...hiddenItems, ...newHiddenItems];
    await saveJson(HIDDEN_FILE, updatedHidden);
    hiddenItems.push(...newHiddenItems);
    for (const item of newHiddenItems) hiddenIds.add(item.itemId);
    console.log(`\n── 중복 격리 → hidden: ${newHiddenItems.length}건 ──`);
    for (const item of newHiddenItems) console.log(`  [${item.itemId}] ${item.title}`);
  }

  // hidden + 중복 + 제목 없음 제거
  const cleanList = mergedList.filter(
    (n) => !hiddenIds.has(n.itemId) && !emptyTitleIds.has(n.itemId)
  );

  // itemId 중복 제거 (앞쪽 우선)
  const seenIds = new Set<string>();
  const dedupedList = cleanList.filter((n) => {
    if (seenIds.has(n.itemId)) return false;
    seenIds.add(n.itemId);
    return true;
  });

  await saveJson(LIST_FILE, dedupedList);
  const removedCount = mergedList.length - dedupedList.length;
  console.log(`\n리스트 저장: ${dedupedList.length}건 (신규 ${allNovels.length}${removedCount > 0 ? `, 중복 제거 ${removedCount}` : ""})\n`);

  return dedupedList;
}

// ─── 상세 크롤링 ────────────────────────────────────────────

function parseDetailPage($: cheerio.CheerioAPI, itemId: string): LightNovelDetail {
  const title = $("span.Ere_bo_title").text().trim() || $("h3.ex_title").text().trim() || $("title").text().split("|")[0].trim();
  const subtitleEl = $("span.gd_subInfo").text().trim() || undefined;
  const authorText = $(".Ere_sub2_title").first().html() || $(".Ere_sub2_title").first().text().trim();
  const parsed = parseDetailAuthorString(authorText);
  const bodyText = $("body").text();
  const isbnMatch = bodyText.match(/ISBN\s*:\s*(\d{10,13})/);
  const isbn = isbnMatch ? isbnMatch[1] : undefined;
  const pagesMatch = bodyText.match(/(\d+)쪽/);
  const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;

  // 커버 이미지
  let cover: string | null = null;
  const coverImg = $("#CoverMainImage").attr("src");
  if (coverImg) cover = coverImg;

  let seriesName: string | undefined;
  const firstSeriesItem = $("[id^='ulSeriesBook'] li").first().find("a").text().trim();
  if (firstSeriesItem) seriesName = stripVolumeNumber(firstSeriesItem.replace(/\s*-\s*.*$/, "").trim());

  return {
    itemId,
    title: title,
    subtitle: subtitleEl,
    ...parsed,
    isbn,
    pages,
    seriesName,
    cover,
    url: `${BASE_URL}/shop/wproduct.aspx?ItemId=${itemId}`,
  };
}

function findOrCreateSeries(
  seriesList: Series[],
  existingDetails: LightNovelDetail[],
  allSeriesItems: Array<{ itemId: string; title: string; order: number }>
): string | undefined {
  if (allSeriesItems.length === 0) return undefined;
  const seriesName = stripVolumeNumber(allSeriesItems[0].title);
  const allItemIds = allSeriesItems.map((s) => s.itemId);
  const detailMap = new Map(existingDetails.map((d) => [d.itemId, d]));

  // 1. 이름이 같은 시리즈가 있으면 병합
  for (const series of seriesList) {
    if (series.name === seriesName) {
      const existingIds = new Set(series.items.map((i) => i.itemId));
      for (const seriesItem of series.items) {
        const detail = detailMap.get(seriesItem.itemId);
        if (detail) {
          if (!seriesItem.title) seriesItem.title = detail.title;
          if (!seriesItem.isbn) seriesItem.isbn = detail.isbn ?? null;
        }
      }
      for (const item of allSeriesItems) {
        if (!existingIds.has(item.itemId)) {
          const detail = detailMap.get(item.itemId);
          series.items.push({ itemId: item.itemId, title: detail?.title ?? item.title, isbn: detail?.isbn ?? null });
        }
      }
      return series.name;
    }
  }

  // 2. itemId가 겹치는 시리즈가 있으면 병합
  for (const series of seriesList) {
    const existingIds = series.items.map((i) => i.itemId);
    const overlap = allItemIds.filter((id) => existingIds.includes(id));
    if (overlap.length > 0) {
      for (const seriesItem of series.items) {
        const detail = detailMap.get(seriesItem.itemId);
        if (detail) {
          if (!seriesItem.title) seriesItem.title = detail.title;
          if (!seriesItem.isbn) seriesItem.isbn = detail.isbn ?? null;
        }
      }
      for (const item of allSeriesItems) {
        if (!existingIds.includes(item.itemId)) {
          const detail = detailMap.get(item.itemId);
          series.items.push({ itemId: item.itemId, title: detail?.title ?? item.title, isbn: detail?.isbn ?? null });
        }
      }
      return series.name;
    }
  }

  // 3. 새 시리즈 생성
  const newItems: SeriesBook[] = allSeriesItems.map((item) => {
    const detail = detailMap.get(item.itemId);
    return { itemId: item.itemId, title: detail?.title ?? item.title, isbn: detail?.isbn ?? null };
  });
  seriesList.push({ name: seriesName, items: newItems });
  return seriesName;
}

async function crawlDetails(options: CrawlOptions = {}, novels?: LightNovel[]): Promise<void> {
  const opts = structuredClone(options);
  const delayMs = opts.delayMs ?? 500;
  const maxItems = opts.maxItems;

  // data/detail 폴더 생성
  const detailDir = join(process.cwd(), DATA_DIR, "detail");
  await mkdir(detailDir, { recursive: true });

  const existingDetails: LightNovelDetail[] = await loadJson(DETAIL_FILE);
  const existingSeries: Series[] = await loadJson(SERIES_FILE);
  const existingItemIds = new Set(existingDetails.map((d) => d.itemId));
  const hiddenItems: Array<{ isbn?: string; itemId?: string }> = await loadJson(HIDDEN_FILE);
  const hiddenIds = new Set(hiddenItems.filter((h) => h.itemId).map((h) => h.itemId!));
  const hiddenIsbns = new Set(hiddenItems.filter((h) => h.isbn).map((h) => h.isbn!));

  const listData = novels ?? await loadJson<Array<{ itemId: string }>>(LIST_FILE);
  let targetIds = listData.map((d) => d.itemId);

  console.log(`전체 ${targetIds.length}건 대상`);

  if (maxItems) targetIds = targetIds.slice(0, maxItems);
  targetIds = targetIds.filter((id) => !existingItemIds.has(id) && !hiddenIds.has(id));
  console.log(`기존 제외 후 ${targetIds.length}건 크롤링\n`);

  const newDetails: LightNovelDetail[] = [];
  const newSeries = [...existingSeries];

  for (let i = 0; i < targetIds.length; i++) {
    const itemId = targetIds[i];
    try {
      const headers = await getCookieHeader();
      const response = await fetch(`${BASE_URL}/shop/wproduct.aspx?ItemId=${itemId}`, { headers });
      if (!response.ok) { console.error(`  ✗ ${itemId}: HTTP ${response.status}`); continue; }
      const html = await response.text();
      const $ = cheerio.load(html);
      const detail = parseDetailPage($, itemId);

      // ISBN을 파일명으로 data/detail 폴더에 개별 저장
      if (detail.isbn) {
        const detailPath = join(detailDir, `${detail.isbn}.json`);
        await writeFile(detailPath, JSON.stringify(detail, null, 2), "utf-8");
      }

      const allSeriesItems: Array<{ itemId: string; title: string; order: number }> = [];
      $("[id^='ulSeriesBook'] li").each((j, el) => {
        const $li = $(el);
        const link = $li.find("a").attr("href") || "";
        const titleText = $li.find("a").text().trim();
        const match = link.match(/ItemId=(\d+)/);
        if (match && titleText) {
          allSeriesItems.push({ itemId: match[1], title: titleText.replace(/\s*-\s*.*$/, "").trim(), order: j });
        }
      });

      const matchedSeries = findOrCreateSeries(newSeries, existingDetails, allSeriesItems);
      if (matchedSeries) {
        detail.seriesName = matchedSeries;
        // 방금 크롤링한 detail의 ISBN으로 시리즈 항목 채우기
        for (const series of newSeries) {
          if (series.name === matchedSeries) {
            const book = series.items.find((b) => b.itemId === detail.itemId);
            if (book && !book.isbn && detail.isbn) {
              book.isbn = detail.isbn;
            }
            break;
          }
        }
      }

      newDetails.push(detail);
      console.log(`[${i + 1}/${targetIds.length}] ✓ ${detail.title}${matchedSeries ? ` (${matchedSeries})` : ""}`);
    } catch (err) {
      console.error(`  ✗ ${itemId}: ${err}`);
    }
    if (i < targetIds.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  const allDetails = [...newDetails, ...existingDetails].filter(
    (d) => !hiddenIds.has(d.itemId) && !(d.isbn && hiddenIsbns.has(d.isbn))
  );

  // itemId 중복 제거 (앞쪽 우선)
  const seenDetailIds = new Set<string>();
  const dedupedDetails = allDetails.filter((d) => {
    if (seenDetailIds.has(d.itemId)) return false;
    seenDetailIds.add(d.itemId);
    return true;
  });

  // ISBN 중복 제거 (앞쪽 우선)
  const seenIsbns = new Set<string>();
  const finalDetails = dedupedDetails.filter((d) => {
    if (!d.isbn) return true;
    if (seenIsbns.has(d.isbn)) return false;
    seenIsbns.add(d.isbn);
    return true;
  });

  await saveJson(DETAIL_FILE, finalDetails);
  const filteredSeries = newSeries
    .map((s) => {
      s.items = s.items.filter(
        (b) => !hiddenIds.has(b.itemId) && !(b.isbn && hiddenIsbns.has(b.isbn))
      );
      return s;
    })
    .filter((s) => s.items.length > 0);

  // ── 시리즈에속하지 않은 책들을 단독 시리즈로 만들기 ──
  const seriesItemIds = new Set(filteredSeries.flatMap((s) => s.items.map((b) => b.itemId)));
  const soloBooks = finalDetails.filter((d) => !seriesItemIds.has(d.itemId));
  for (const book of soloBooks) {
    // 이름이 같은 기존 시리즈가 있으면 거기에 추가
    const existingSeries = filteredSeries.find((s) => s.name === book.title);
    if (existingSeries) {
      if (!existingSeries.items.some((i) => i.itemId === book.itemId)) {
        existingSeries.items.push({ itemId: book.itemId, title: book.title, isbn: book.isbn ?? null });
      }
    } else {
      const soloSeries: Series = {
        name: book.title,
        items: [{ itemId: book.itemId, title: book.title, isbn: book.isbn ?? null }],
      };
      filteredSeries.push(soloSeries);
    }
    book.seriesName = book.title;
  }
  if (soloBooks.length > 0) {
    console.log(`\n단독 시리즈 생성: ${soloBooks.length}건`);
  }
  // 시리즈에서 detail이 없거나 ISBN이 null인 항목 찾아서 추가 크롤링
  const existingDetailIds = new Set(finalDetails.map((d) => d.itemId));
  const incompleteItems = filteredSeries.flatMap((s) =>
    s.items.filter((b) => !hiddenIds.has(b.itemId) && (!b.isbn || !existingDetailIds.has(b.itemId)))
  );
  if (incompleteItems.length > 0) {
    const uniqueMissing = [...new Set(incompleteItems.map((b) => b.itemId))];

    if (uniqueMissing.length > 0) {
      console.log(`\n시리즈 미완성 항목 ${uniqueMissing.length}건 추가 크롤링...`);
      for (let i = 0; i < uniqueMissing.length; i++) {
        const itemId = uniqueMissing[i];
        try {
          const headers = await getCookieHeader();
          const response = await fetch(`${BASE_URL}/shop/wproduct.aspx?ItemId=${itemId}`, { headers });
          if (!response.ok) { console.error(`  ✗ ${itemId}: HTTP ${response.status}`); continue; }
          const html = await response.text();
          const $ = cheerio.load(html);
          const detail = parseDetailPage($, itemId);

          if (detail.isbn) {
            const detailPath = join(detailDir, `${detail.isbn}.json`);
            await writeFile(detailPath, JSON.stringify(detail, null, 2), "utf-8");
          }

          finalDetails.push(detail);

          // 시리즈 항목 업데이트
          for (const s of filteredSeries) {
            const book = s.items.find((b) => b.itemId === itemId);
            if (book && !book.isbn && detail.isbn) {
              book.isbn = detail.isbn;
            }
          }

          console.log(`  [${i + 1}/${uniqueMissing.length}] ✓ ${detail.title}`);
        } catch (err) {
          console.error(`  ✗ ${itemId}: ${err}`);
        }
        if (i < uniqueMissing.length - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  // ── detail 제목이 빈 문자열인 항목 제거 ──
  const emptyTitleDetails = finalDetails.filter((d) => !d.title || !d.title.trim());
  if (emptyTitleDetails.length > 0) {
    console.log(`\n── detail 제목 없음 삭제: ${emptyTitleDetails.length}건 ──`);
    for (const d of emptyTitleDetails) console.log(`  [${d.itemId}] (제목 없음)`);
  }
  const validDetails = finalDetails.filter((d) => d.title && d.title.trim());
  const emptyDetailIds = new Set(emptyTitleDetails.map((d) => d.itemId));

  // ── detail 중복 → hidden 격리 ──
  const detailKeywordDupes = validDetails.filter((d) =>
    PATTERNS.some((p) => d.title.includes(p))
  );
  const detailIdCount = new Map<string, number>();
  for (const d of validDetails) detailIdCount.set(d.itemId, (detailIdCount.get(d.itemId) || 0) + 1);
  const detailDupeIds = new Set([...detailIdCount.entries()].filter(([, v]) => v > 1).map(([k]) => k));
  const detailIdDupes = finalDetails.filter((d) => detailDupeIds.has(d.itemId));

  // ── detail 제목 기반 중복 탐지 ──
  const detailTitleGroups = new Map<string, LightNovelDetail[]>();
  for (const d of validDetails) {
    const key = d.title.trim().toLowerCase();
    const arr = detailTitleGroups.get(key) || [];
    arr.push(d);
    detailTitleGroups.set(key, arr);
  }
  const detailTitleDupes: LightNovelDetail[] = [];
  for (const [, items] of detailTitleGroups) {
    if (items.length <= 1) continue;
    items.sort((a, b) => Number(a.itemId) - Number(b.itemId));
    for (let i = 0; i < items.length - 1; i++) {
      detailTitleDupes.push(items[i]);
    }
  }

  const detailDupeMap = new Map<string, LightNovelDetail>();
  for (const d of detailKeywordDupes) detailDupeMap.set(d.itemId, d);
  for (const d of detailIdDupes) detailDupeMap.set(d.itemId, d);
  for (const d of detailTitleDupes) detailDupeMap.set(d.itemId, d);
  const allDetailDupes = [...detailDupeMap.values()];

  // 제목이 빈 문자열인 항목은 hidden에 넣지 않음
  const newDetailHidden = allDetailDupes.filter((d) => !hiddenIds.has(d.itemId) && !emptyDetailIds.has(d.itemId));
  if (newDetailHidden.length > 0) {
    const existingHidden = await loadJson<Array<{ itemId?: string; isbn?: string }>>(HIDDEN_FILE);
    const updatedHidden = [...existingHidden, ...newDetailHidden];
    await saveJson(HIDDEN_FILE, updatedHidden);
    for (const d of newDetailHidden) hiddenIds.add(d.itemId);
    console.log(`\n── detail 중복 격리 → hidden: ${newDetailHidden.length}건 ──`);
    for (const d of newDetailHidden) console.log(`  [${d.itemId}] ${d.title}`);
  }

  const cleanDetails = validDetails.filter((d) => !hiddenIds.has(d.itemId));

  await saveJson(DETAIL_FILE, cleanDetails);
  await saveJson(SERIES_FILE, filteredSeries);
  const idDupes = allDetails.length - dedupedDetails.length;
  const isbnDupes = dedupedDetails.length - finalDetails.length;
  console.log(`\n상세: ${cleanDetails.length}건 (신규 ${newDetails.length}${idDupes > 0 ? `, itemId 중복 ${idDupes}` : ""}${isbnDupes > 0 ? `, ISBN 중복 ${isbnDupes}` : ""})`);
  console.log(`시리즈: ${newSeries.length}건`);
}

// ─── CLI & 메인 ─────────────────────────────────────────────

function parseArgs(): CrawlOptions {
  const args = process.argv.slice(2);
  const options: CrawlOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--list-stop" && args[i + 1]) { options.listStopItemId = args[++i]; }
    else if (args[i] === "--stop" && args[i + 1]) {
      options.listStopItemId = args[++i];
    }
    else if (args[i] === "--delay" && args[i + 1]) { options.delayMs = parseInt(args[++i], 10); }
    else if (args[i] === "--max-pages" && args[i + 1]) { options.maxPages = parseInt(args[++i], 10); }
    else if (args[i] === "--max-items" && args[i + 1]) { options.maxItems = parseInt(args[++i], 10); }
    else if (args[i] === "--detail-only") { options.detailOnly = true; }
    else if (args[i] === "--list-only") { options.listOnly = true; }
  }
  return options;
}

async function main() {
  const options = parseArgs();
  const delayMs = options.delayMs ?? 300;

  // data 폴더 생성
  const dataDir = join(process.cwd(), DATA_DIR);
  await mkdir(dataDir, { recursive: true });

  let novels: LightNovel[] | undefined;
  // ── 1단계: 리스트 크롤링 ──
  if (!options.detailOnly) {
    console.log("═══════════════════════════════════════════");
    console.log("  1단계: 리스트 크롤링");
    console.log("═══════════════════════════════════════════\n");

    novels = await crawlListPages(options);
  }

  // ── 2단계: 상세 크롤링 ──
  if (!options.listOnly) {
    console.log("═══════════════════════════════════════════");
    console.log("  2단계: 상세 크롤링");
    console.log("═══════════════════════════════════════════\n");

    await crawlDetails(options, novels);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  완료!");
  console.log("═══════════════════════════════════════════");
}

main().catch(console.error);
