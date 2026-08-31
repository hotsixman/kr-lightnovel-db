export interface LightNovel {
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

export interface LightNovelDetail {
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

export interface SeriesBook {
  itemId: string;
  title: string | null;
  isbn: string | null;
}

export interface Series {
  name: string;
  items: SeriesBook[];
}
