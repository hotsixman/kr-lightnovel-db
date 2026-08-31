import * as cheerio from "cheerio";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = "data";
const BASE_URL = "https://www.aladin.co.kr";

async function main() {
  const details: Array<{ itemId: string; cover?: string | null; [key: string]: any }> = JSON.parse(
    await readFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), "utf-8")
  );

  const cookies = await loadCookies();
  const headers: Record<string, string> = cookies ? { Cookie: cookies } : {};

  let added = 0;
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    if (d.cover) continue;

    try {
      const response = await fetch(`${BASE_URL}/shop/wproduct.aspx?ItemId=${d.itemId}`, { headers });
      if (!response.ok) continue;
      const html = await response.text();
      const $ = cheerio.load(html);

      const coverImg = $("#CoverMainImage").attr("src");

      if (coverImg) {
        d.cover = coverImg;
        added++;
        console.log(`[${i + 1}/${details.length}] ✓ ${d.title}`);
      } else {
        d.cover = null;
      }
    } catch (err) {
      console.error(`[${i + 1}/${details.length}] ✗ ${d.itemId}: ${err}`);
    }

    if (i < details.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  await writeFile(join(process.cwd(), DATA_DIR, "lightnovel_detail.json"), JSON.stringify(details, null, 2), "utf-8");
  console.log(`\n완료: ${added}건 커버 추가`);
}

async function loadCookies(): Promise<string> {
  try {
    const data = await readFile(join(process.cwd(), "cookies.json"), "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed.map((c: any) => `${c.name}=${c.value}`).join("; ");
    }
    return Object.entries(parsed).map(([k, v]) => `${k}=${v}`).join("; ");
  } catch {
    return "";
  }
}

main().catch(console.error);
