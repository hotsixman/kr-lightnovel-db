<script lang="ts">
  import Router from "svelte-spa-router";
  import { link } from "svelte-spa-router";
  import { owned, ownedCount } from "./lib/owned";
  import { data } from "./lib/data.svelte";
  import Books from "./routes/Books.svelte";
  import SeriesList from "./routes/SeriesList.svelte";
  import SeriesDetail from "./routes/SeriesDetail.svelte";

  let importModalOpen = $state(false);
  let importText = $state("");

  data.load();

  const routes = {
    "/": Books,
    "/series": SeriesList,
    "/series/:series-name": SeriesDetail,
  };

  // 쿼리 파라미터 파싱 헬퍼
  function parseHashQuery(): Record<string, string> {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return {};
    return Object.fromEntries(new URLSearchParams(hash.slice(qIdx + 1)));
  }

  function exportOwned() {
    const blob = new Blob(
      [JSON.stringify([...$owned], null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lightnovel_owned_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importOwned() {
    try {
      const ids: string[] = JSON.parse(importText);
      if (!Array.isArray(ids)) throw new Error("Invalid format");
      owned.import(ids);
      importModalOpen = false;
      importText = "";
    } catch {
      alert("JSON 형식이 올바르지 않습니다.");
    }
  }

  function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => (importText = reader.result as string);
    reader.readAsText(file);
  }
</script>

<div class="app">
  <header>
    <h1>📚 한국 정발 라노벨 DB</h1>
    <div class="stats">
      <span>전체 {data.details.length}권</span>
      <span>소유 {$ownedCount}권</span>
    </div>
    <nav>
      <a href="/" use:link>📖 개별</a>
      <a href="/series" use:link>📚 시리즈</a>
      <button onclick={exportOwned}>📤 내보내기</button>
      <button onclick={() => (importModalOpen = true)}>📥 가져오기</button>
    </nav>
  </header>

  {#if data.warning}
    <div class="warning">{data.warning}</div>
  {/if}

  <Router {routes} />

  {#if importModalOpen}
    <div class="modal-overlay" onclick={() => (importModalOpen = false)}>
      <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2>📥 소유 목록 가져오기</h2>
        <p>JSON 파일을 선택하거나 붙여넣으세요.</p>
        <input type="file" accept=".json" onchange={handleImportFile} />
        <textarea
          bind:value={importText}
          placeholder='["itemId1", "itemId2", ...]'
          rows="8"
        ></textarea>
        <div class="modal-actions">
          <button onclick={() => (importModalOpen = false)}>취소</button>
          <button onclick={importOwned}>가져오기</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(html) {
    color-scheme: light;
  }

  :global(body) {
    margin: 0;
    font-family: "Pretendard", -apple-system, BlinkMacSystemFont, system-ui,
      Roboto, sans-serif;
    background: #fafafa;
    color: #333;
  }

  .app {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px;
    width: 100%;
  }

  header {
    text-align: center;
    margin-bottom: 24px;
  }

  h1 {
    font-size: 28px;
    margin: 0 0 8px;
    color: #1a1a1a;
  }

  .stats {
    display: flex;
    gap: 16px;
    justify-content: center;
    color: #666;
    font-size: 14px;
    margin-bottom: 12px;
  }

  nav {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }

  nav a, nav button {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    text-decoration: none;
    color: #333;
    transition: all 0.15s;
  }

  nav a:hover, nav button:hover {
    background: #f5f5f5;
    border-color: #bbb;
  }

  .warning {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 10px 16px;
    margin-bottom: 20px;
    font-size: 14px;
    color: #856404;
    text-align: center;
  }

  nav a:global(.active) {
    background: #4a90d9;
    color: white;
    border-color: #4a90d9;
  }

  /* 모달 */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }

  .modal p {
    color: #666;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .modal input[type="file"] {
    margin-bottom: 12px;
  }

  .modal textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-family: monospace;
    font-size: 13px;
    resize: vertical;
    box-sizing: border-box;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .modal-actions button {
    padding: 10px 20px;
    border-radius: 6px;
    border: 1px solid #ddd;
    cursor: pointer;
    font-size: 14px;
  }

  .modal-actions button:last-child {
    background: #4a90d9;
    color: white;
    border-color: #4a90d9;
  }
</style>
