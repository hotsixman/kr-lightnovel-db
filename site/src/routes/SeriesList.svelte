<script lang="ts">
  import { push, link } from "svelte-spa-router";
  import { owned } from "../lib/owned";
  import { data } from "../lib/data.svelte";

  function getInitialParams() {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    const p = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx + 1)) : new URLSearchParams();
    return {
      page: Number(p.get("page")) || 1,
      q: p.get("q") || "",
      sort: (p.get("sort") as "title" | "date") || "date",
      dir: (p.get("dir") as "asc" | "desc") || "desc",
    };
  }

  const init = getInitialParams();

  let inputQuery = $state(init.q);  // input에 표시되는 값
  let searchQuery = $state(init.q);  // 실제 검색에 사용되는 값
  let sortKey = $state<"title" | "date">(init.sort);
  let sortDir = $state<"asc" | "desc">(init.dir);
  let page = $state(init.page);

  const PAGE_SIZE = 100;

  const ownedIds = $derived($owned);

  function isOwned(itemId: string, isbn?: string | null): boolean {
    const id = itemId || isbn || "";
    return id ? ownedIds.has(id) : false;
  }

  const filteredSeries = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    const detailMap = new Map(data.details.map((d) => [d.itemId, d]));
    let list = data.series
      .filter((s) => s.items.length > 0)
      .map((s) => {
        const items = s.items.map((item) => ({
          ...item,
          ...(detailMap.get(item.itemId) || {}),
        }));
        const first = items[0] || {};
        return {
          ...s,
          items,
          cover: first.cover || null,
          authors: first.authors || [],
          publishDate: first.publishDate,
        };
      });
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.authors.some((a: string) => a.toLowerCase().includes(q))
      );
    }
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortKey === "title") {
      return list.sort((a, b) => mult * a.name.localeCompare(b.name, "ko"));
    }
    const parseDate = (d?: string) => {
      if (!d) return 0;
      const m = d.match(/(\d{4})\.(\d{2})\.(\d{2})?/);
      if (!m) return 0;
      return Number(m[1]) * 10000 + Number(m[2]) * 100 + (m[3] ? Number(m[3]) : 0);
    };
    return list.sort((a, b) => mult * (parseDate(a.publishDate) - parseDate(b.publishDate)));
  });

  const pagedSeries = $derived.by(() => {
    const all = filteredSeries;
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    return {
      items: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      totalPages,
      total: all.length,
    };
  });

  function syncUrl() {
    const query = new URLSearchParams();
    if (page > 1) query.set("page", String(page));
    if (inputQuery) query.set("q", inputQuery);
    if (sortKey !== "date") query.set("sort", sortKey);
    if (sortDir !== "desc") query.set("dir", sortDir);
    const qs = query.toString();
    push("/series" + (qs ? "?" + qs : ""));
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      searchQuery = inputQuery;
      page = 1;
      syncUrl();
    }
  }

  function goToPage(p: number) {
    page = p;
    syncUrl();
    window.scrollTo(0, 0);
  }

  function changeSort(key: "title" | "date") {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
    }
    page = 1;
    syncUrl();
  }
</script>

<div class="toolbar">
  <input
    type="text"
    placeholder="시리즈 검색 (엔터로 검색)..."
    bind:value={inputQuery}
    onkeydown={handleSearchKeydown}
    class="search-input"
  />

  <div class="sort-group">
    <button class:active={sortKey === "title"} onclick={() => changeSort("title")}>제목</button>
    <button class:active={sortKey === "date"} onclick={() => changeSort("date")}>출간일</button>
    <button class="sort-dir" onclick={() => changeSort(sortKey)}>
      {sortDir === "asc" ? "↑" : "↓"}
    </button>
  </div>
</div>

<div class="results">
  <h2>
    {searchQuery.trim() ? `검색 결과 (${pagedSeries.total}건)` : `전체 시리즈 (${pagedSeries.total}건)`}
    {#if pagedSeries.totalPages > 1}
      <span class="page-info"> — {page}/{pagedSeries.totalPages}페이지</span>
    {/if}
  </h2>

  {#if pagedSeries.total === 0}
    <p class="empty">결과가 없습니다.</p>
  {:else}
    <div class="series-grid">
      {#each pagedSeries.items as group (group.name)}
        {@const ownedInGroup = group.items.filter((b: any) =>
          isOwned(b.itemId, b.isbn)
        ).length}
        <a
          href="/series/{encodeURIComponent(group.name)}"
          use:link
          class="series-card"
        >
          {#if group.cover}
            <img src={group.cover} alt="" class="series-cover" loading="lazy" />
          {:else}
            <div class="series-cover-placeholder">📚</div>
          {/if}
          <div class="series-info">
            <div class="series-name">{group.name}</div>
            <div class="series-meta">
              {group.authors.slice(0, 2).join(", ")}
            </div>
            <div class="series-footer">
              <span class="series-count">
                {ownedInGroup}/{group.items.length}권
              </span>
              {#if group.publishDate}
                <span class="series-date">{group.publishDate}</span>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if pagedSeries.totalPages > 1}
      <div class="pagination">
        <button disabled={page <= 1} onclick={() => goToPage(1)}>«</button>
        <button disabled={page <= 1} onclick={() => goToPage(page - 1)}>‹</button>
        <span>{page} / {pagedSeries.totalPages}</span>
        <button disabled={page >= pagedSeries.totalPages} onclick={() => goToPage(page + 1)}>›</button>
        <button disabled={page >= pagedSeries.totalPages} onclick={() => goToPage(pagedSeries.totalPages)}>»</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
    flex-wrap: wrap;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 10px 14px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: #4a90d9;
  }

  .sort-group {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .sort-group button {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .sort-group button.active {
    background: #4a90d9;
    color: white;
    border-color: #4a90d9;
  }

  .sort-dir {
    width: 36px !important;
    padding: 8px 0 !important;
    text-align: center;
    font-size: 16px !important;
  }

  .results h2 {
    font-size: 16px;
    color: #555;
    margin: 0 0 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
  }

  .page-info {
    font-weight: normal;
    font-size: 14px;
    color: #888;
  }

  .empty {
    text-align: center;
    color: #999;
    padding: 32px;
  }

  .series-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  @media (max-width: 900px) {
    .series-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 650px) {
    .series-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .series-card {
    display: flex;
    flex-direction: column;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    overflow: hidden;
    text-decoration: none;
    transition: all 0.15s;
  }

  .series-card:hover {
    border-color: #ccc;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .series-cover {
    width: 100%;
    height: 260px;
    object-fit: cover;
    border-bottom: 1px solid #e0e0e0;
  }

  .series-cover-placeholder {
    width: 100%;
    height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    font-size: 48px;
    border-bottom: 1px solid #e0e0e0;
  }

  .series-info {
    padding: 10px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .series-name {
    font-weight: 600;
    font-size: 14px;
    color: #1a1a1a;
    line-height: 1.4;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .series-meta {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .series-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
  }

  .series-count {
    font-size: 12px;
    color: #4a90d9;
    font-weight: 600;
  }

  .series-date {
    font-size: 11px;
    color: #999;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 24px;
    padding: 16px 0;
  }

  .pagination button {
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    min-width: 36px;
  }

  .pagination button:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #bbb;
  }

  .pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pagination span {
    font-size: 14px;
    color: #333;
    min-width: 80px;
    text-align: center;
  }
</style>
