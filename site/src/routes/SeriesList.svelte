<script lang="ts">
  import { link } from "svelte-spa-router";
  import { owned, ownedCount } from "../lib/owned";
  import { data } from "../lib/data.svelte";

  let query = $state("");
  let sortKey = $state<"title" | "date">("title");
  let sortDir = $state<"asc" | "desc">("asc");
  let page = $state(1);
  const PAGE_SIZE = 100;

  // 검색/정렬 변경 시 1페이지로 리셋
  $effect(() => {
    query;
    sortKey;
    sortDir;
    page = 1;
  });

  const filteredSeries = $derived(() => {
    const q = query.trim().toLowerCase();
    const detailMap = new Map(data.details.map((d) => [d.itemId, d]));
    let list = data.series
      .filter((s) => s.items.length > 0)
      .map((s) => {
        const items = s.items.map((item) => ({
          ...item,
          ...(detailMap.get(item.itemId) || {}),
        }));
        // 첫 번째 책의 정보 사용 (출간일, 작가, 표지)
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
    // 출간일 정렬: 첫 번째 책의 출간일 기준
    const parseDate = (d?: string) => {
      if (!d) return 0;
      const m = d.match(/(\d{4})\.(\d{2})\.(\d{2})?/);
      if (!m) return 0;
      return Number(m[1]) * 10000 + Number(m[2]) * 100 + (m[3] ? Number(m[3]) : 0);
    };
    return list.sort((a, b) => mult * (parseDate(b.publishDate) - parseDate(a.publishDate)));
  });

  const pagedSeries = $derived(() => {
    const all = filteredSeries();
    const totalPages = Math.ceil(all.length / PAGE_SIZE);
    return {
      items: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      totalPages,
      total: all.length,
    };
  });

  // $owned를 사용하여 반응형으로 만들기
  const ownedIds = $derived($owned);

  function isOwned(itemId: string, isbn?: string | null): boolean {
    const id = itemId || isbn || "";
    return id ? ownedIds.has(id) : false;
  }
</script>

<div class="toolbar">
  <input
    type="text"
    placeholder="시리즈 검색..."
    bind:value={query}
    class="search-input"
  />

  <div class="sort-group">
    <select bind:value={sortKey}>
      <option value="title">제목</option>
      <option value="date">출간일</option>
    </select>
    <button
      class="sort-dir"
      onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}
    >{sortDir === "asc" ? "↑" : "↓"}</button>
  </div>
</div>

<div class="results">
  {#if filteredSeries().length === 0}
    <p class="empty">결과가 없습니다.</p>
  {:else}
    <div class="series-grid">
      {#each pagedSeries().items as group (group.name)}
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

    {#if pagedSeries().totalPages > 1}
      <div class="pagination">
        <button disabled={page <= 1} onclick={() => (page = 1)}>«</button>
        <button disabled={page <= 1} onclick={() => (page--)}>‹</button>
        <span>{page} / {pagedSeries().totalPages}</span>
        <button disabled={page >= pagedSeries().totalPages} onclick={() => (page++)}>›</button>
        <button disabled={page >= pagedSeries().totalPages} onclick={() => (page = pagedSeries().totalPages)}>»</button>
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

  .sort-group select {
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 13px;
    background: white;
    cursor: pointer;
  }

  .sort-dir {
    width: 36px;
    padding: 8px 0;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 16px;
    text-align: center;
  }

  .empty {
    text-align: center;
    color: #999;
    padding: 32px;
  }

  .series-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
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
    height: 180px;
    object-fit: cover;
    border-bottom: 1px solid #e0e0e0;
  }

  .series-cover-placeholder {
    width: 100%;
    height: 180px;
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
</style>
