<script lang="ts">
  import { link } from "svelte-spa-router";
  import { owned } from "../lib/owned";
  import { data } from "../lib/data.svelte";

  let { params }: { params: { "series-name": string } } = $props();

  let sortDir = $state<"asc" | "desc">("asc");

  const seriesName = $derived(decodeURIComponent(params["series-name"]));

  const series = $derived(() => data.seriesMap.get(seriesName));

  const items = $derived(() => {
    const s = series();
    if (!s) return [];
    const detailMap = new Map(data.details.map((d) => [d.itemId, d]));
    const books = s.items.map((item) => ({
      ...item,
      ...(detailMap.get(item.itemId) || {}),
    }));
    const mult = sortDir === "asc" ? 1 : -1;
    return books.sort((a, b) => mult * (a.order ?? 0) - (b.order ?? 0));
  });

  // $owned를 사용하여 반응형으로 만들기
  const ownedIds = $derived($owned);

  function isOwned(itemId: string, isbn?: string | null): boolean {
    const id = itemId || isbn || "";
    return id ? ownedIds.has(id) : false;
  }
</script>

{#if !data.loaded}
  <div class="loading">데이터 로딩 중...</div>
{:else if !series()}
  <div class="not-found">
    <p>시리즈를 찾을 없습니다.</p>
    <a href="/series" use:link>← 시리즈 목록으로</a>
  </div>
{:else}
  <div class="series-detail">
    <div class="series-nav">
      <a href="/series" use:link>← 시리즈 목록</a>
    </div>

    <div class="series-header">
      <h1>{seriesName}</h1>
      <div class="series-meta">
        <span class="series-count">
          {items().filter((b) => isOwned(b.itemId, b.isbn)).length}/{items().length}권 소유
        </span>
        <button
          class="sort-dir"
          onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}
        >{sortDir === "asc" ? "↑ 오름차순" : "↓ 내림차순"}</button>
      </div>
    </div>

    <div class="book-list">
      {#each items() as book, idx (`${book.itemId}-${idx}`)}
        <div class="book-card" class:owned={isOwned(book.itemId, book.isbn)}>
          <div class="book-row">
            <label class="owned-check" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isOwned(book.itemId, book.isbn)}
                onchange={() => owned.toggle(book.itemId, book.isbn)}
              />
            </label>
            {#if book.cover}
              <a href={book.url} target="_blank" rel="noopener" class="cover-link">
                <img src={book.cover} alt="" class="book-cover" loading="lazy" />
              </a>
            {/if}
            <div class="book-info">
              <a
                class="book-title"
                href={book.url}
                target="_blank"
                rel="noopener"
              >{book.title}</a>
              <div class="book-meta">
                {book.authors?.join(", ") ?? ""}
                {#if book.isbn}
                  <span class="isbn">ISBN: {book.isbn}</span>
                {/if}
              </div>
              {#if book.publishDate}
                <div class="book-date">{book.publishDate}</div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .loading {
    text-align: center;
    padding: 48px;
    color: #999;
  }

  .not-found {
    text-align: center;
    padding: 48px;
    color: #999;
  }

  .not-found a {
    color: #4a90d9;
    text-decoration: none;
  }

  .not-found a:hover {
    text-decoration: underline;
  }

  .series-nav {
    margin-bottom: 16px;
  }

  .series-nav a {
    color: #4a90d9;
    text-decoration: none;
    font-size: 14px;
  }

  .series-nav a:hover {
    text-decoration: underline;
  }

  .series-header {
    margin-bottom: 20px;
  }

  .series-header h1 {
    font-size: 24px;
    color: #1a1a1a;
    margin: 0 0 8px;
  }

  .series-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .series-count {
    font-size: 14px;
    color: #4a90d9;
    font-weight: 600;
  }

  .sort-dir {
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .sort-dir:hover {
    background: #f5f5f5;
    border-color: #bbb;
  }

  .book-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }

  .book-card {
    padding: 12px 14px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
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

  .book-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .owned-check {
    flex-shrink: 0;
    margin-top: 2px;
    cursor: pointer;
  }

  .owned-check input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .cover-link {
    flex-shrink: 0;
  }

  .book-cover {
    width: 60px;
    height: 85px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
  }

  .book-info {
    flex: 1;
    min-width: 0;
  }

  .book-title {
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 4px;
    line-height: 1.4;
    font-size: 14px;
    text-decoration: none;
    display: block;
  }

  .book-title:hover {
    color: #4a90d9;
    text-decoration: underline;
  }

  .book-meta {
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
  }

  .isbn {
    display: inline-block;
    margin-left: 8px;
    font-size: 11px;
    color: #999;
  }

  .book-date {
    font-size: 11px;
    color: #999;
  }
</style>
