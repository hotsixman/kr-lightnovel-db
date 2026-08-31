<script lang="ts">
  import { push, link } from "svelte-spa-router";
  import { owned } from "../lib/owned";
  import { data } from "../lib/data.svelte";

  // URL에서 초기값 파싱
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

  function parseDate(d?: string): number {
    if (!d) return 0;
    const m = d.match(/(\d{4})\.(\d{2})\.(\d{2})?/);
    if (!m) return 0;
    return Number(m[1]) * 10000 + Number(m[2]) * 100 + (m[3] ? Number(m[3]) : 0);
  }

  const filteredBooks = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = data.details;
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.seriesName?.toLowerCase().includes(q) ||
          d.authors.some((a) => a.toLowerCase().includes(q))
      );
    }
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortKey === "title") {
      return [...list].sort((a, b) => mult * a.title.localeCompare(b.title, "ko"));
    }
    return [...list].sort((a, b) => mult * (parseDate(a.publishDate) - parseDate(b.publishDate)));
  });

  const pagedBooks = $derived.by(() => {
    const all = filteredBooks;
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    return {
      items: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      totalPages,
      total: all.length,
    };
  });

  // URL 업데이트 헬퍼
  function syncUrl() {
    const query = new URLSearchParams();
    if (page > 1) query.set("page", String(page));
    if (inputQuery) query.set("q", inputQuery);
    if (sortKey !== "date") query.set("sort", sortKey);
    if (sortDir !== "desc") query.set("dir", sortDir);
    const qs = query.toString();
    push("/" + (qs ? "?" + qs : ""));
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

  function toggleOwned(itemId: string, isbn?: string | null) {
    owned.toggle(itemId, isbn);
  }

  function exportOwned() {
    const blob = new Blob([JSON.stringify([...$owned], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lightnovel_owned_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="toolbar">
  <input
    type="text"
    placeholder="제목, 시리즈, 작가 검색 (엔터로 검색)..."
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

  <div class="toolbar-actions">
    <button onclick={exportOwned}>📤 내보내기</button>
  </div>
</div>

<div class="results">
  <h2>
    {searchQuery.trim() ? `검색 결과 (${pagedBooks.total}건)` : `전체 도서 (${pagedBooks.total}건)`}
    {#if pagedBooks.totalPages > 1}
      <span class="page-info"> — {page}/{pagedBooks.totalPages}페이지</span>
    {/if}
  </h2>

  {#if pagedBooks.total === 0}
    <p class="empty">결과가 없습니다.</p>
  {:else}
    <div class="book-grid">
      {#each pagedBooks.items as book, idx (`${book.itemId}-${idx}`)}
        <div class="book-card" class:owned={isOwned(book.itemId, book.isbn)}>
          <div class="cover-wrapper">
            {#if book.cover}
              <a href={book.url} target="_blank" rel="noopener" class="cover-link">
                <img src={book.cover} alt="" class="book-cover" loading="lazy" />
              </a>
            {:else}
              <div class="book-cover-placeholder">📚</div>
            {/if}
            <label class="owned-check" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isOwned(book.itemId, book.isbn)}
                onchange={() => toggleOwned(book.itemId, book.isbn)}
              />
            </label>
          </div>
          <div class="book-info">
            {#if book.seriesName}
              <div class="book-series">
                <a href="/series/{encodeURIComponent(book.seriesName)}" use:link class="series-link">
                  {book.seriesName}
                </a>
              </div>
            {/if}
            <a class="book-title" href={book.url} target="_blank" rel="noopener">{book.title}</a>
            <div class="book-meta">{book.authors.join(", ")}</div>
            {#if book.publishDate}
              <div class="book-date">{book.publishDate}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if pagedBooks.totalPages > 1}
      <div class="pagination">
        <button disabled={page <= 1} onclick={() => goToPage(1)}>«</button>
        <button disabled={page <= 1} onclick={() => goToPage(page - 1)}>‹</button>
        <span>{page} / {pagedBooks.totalPages}</span>
        <button disabled={page >= pagedBooks.totalPages} onclick={() => goToPage(page + 1)}>›</button>
        <button disabled={page >= pagedBooks.totalPages} onclick={() => goToPage(pagedBooks.totalPages)}>»</button>
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

  .toolbar-actions {
    display: flex;
    gap: 6px;
  }

  .toolbar-actions button {
    padding: 8px 14px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .toolbar-actions button:hover {
    background: #f5f5f5;
    border-color: #bbb;
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

  .book-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  @media (max-width: 900px) {
    .book-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 650px) {
    .book-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .book-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    overflow: hidden;
    transition: all 0.15s;
  }

  .book-card:hover {
    border-color: #ccc;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .book-card.owned {
    border-color: #4caf50;
    background: #f1f8e9;
  }

  .cover-wrapper {
    position: relative;
  }

  .cover-link {
    display: block;
  }

  .book-cover {
    width: 100%;
    height: 260px;
    object-fit: cover;
    display: block;
    border-bottom: 1px solid #e0e0e0;
  }

  .book-cover-placeholder {
    width: 100%;
    height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    font-size: 48px;
    border-bottom: 1px solid #e0e0e0;
  }

  .owned-check {
    position: absolute;
    top: 6px;
    right: 6px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    padding: 2px;
  }

  .owned-check input {
    width: 16px;
    height: 16px;
    cursor: pointer;
    margin: 0;
  }

  .book-info {
    padding: 8px 10px 10px;
  }

  .book-series {
    margin-bottom: 5px;
  }

  .series-link {
    font-size: 11px;
    color: #4a90d9;
    text-decoration: none;
    line-height: 1.3;
    display: block;
  }

  .series-link:hover {
    text-decoration: underline;
  }

  .book-title {
    font-weight: 600;
    font-size: 13px;
    color: #1a1a1a;
    line-height: 1.4;
    text-decoration: none;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .book-title:hover {
    color: #4a90d9;
    text-decoration: underline;
  }

  .book-meta {
    font-size: 12px;
    color: #666;
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .book-date {
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
