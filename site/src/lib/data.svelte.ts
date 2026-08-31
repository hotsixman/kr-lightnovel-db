import type { LightNovelDetail, Series } from "./types";

// 빌드 시 import한 JSON (GitHub fetch/localStorage 모두 실패할 때 사용)
import detailsFallback from "../../../data/lightnovel_detail.json";
import seriesFallback from "../../../data/lightnovel_series.json";

const GITHUB_RAW = "https://raw.githubusercontent.com/hotsixman/kr-lightnovel-db/main/data";
const STORAGE_KEY_DETAILS = "krln_detail_cache";
const STORAGE_KEY_SERIES = "krln_series_cache";

type CacheSource = "remote" | "cache" | "fallback";

async function fetchWithCache<T>(
  url: string,
  storageKey: string,
  fallback: T
): Promise<{ data: T; source: CacheSource }> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: T = await res.json();
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
    return { data, source: "remote" };
  } catch {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) return { data: JSON.parse(cached) as T, source: "cache" };
    } catch {}
    return { data: fallback, source: "fallback" };
  }
}

class DataStore {
  details = $state<LightNovelDetail[]>(detailsFallback);
  series = $state<Series[]>(seriesFallback);
  loaded = $state(false);
  warning = $state<string | null>(null);

  seriesMap = $derived.by(() => {
    const map = new Map<string, Series>();
    for (const s of this.series) {
      map.set(s.name, s);
    }
    return map;
  });

  async load() {
    const [d, s] = await Promise.all([
      fetchWithCache<LightNovelDetail[]>(
        `${GITHUB_RAW}/lightnovel_detail.json`,
        STORAGE_KEY_DETAILS,
        detailsFallback
      ),
      fetchWithCache<Series[]>(
        `${GITHUB_RAW}/lightnovel_series.json`,
        STORAGE_KEY_SERIES,
        seriesFallback
      ),
    ]);

    this.details = d.data;
    this.series = s.data;

    if (d.source === "fallback" || s.source === "fallback") {
      this.warning = "⚠️ 네트워크 연결과 브라우저 캐시 모두 사용 불가. 빌드 시 포함된 오래된 데이터를 표시합니다.";
    } else if (d.source === "cache" || s.source === "cache") {
      this.warning = "⚠️ 네트워크 연결 불가. 브라우저에 저장된 이전 데이터를 표시합니다.";
    }

    this.loaded = true;
  }
}

export const data = new DataStore();
