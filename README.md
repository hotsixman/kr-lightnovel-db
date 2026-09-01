# 한국 정발 라노벨 DB

알라딘에서 크롤링한 한국 정발 라노벨 데이터를 관리하고 검색할 수 있는 웹 데이터베이스입니다.

## 기능

- 📖 **개별 도서 목록** - 제목, 시리즈, 작가로 검색하고 출간일/제목순으로 정렬
- 📚 **시리즈 목록** - 같은 시리즈끼리 그룹화하여 확인
- ✅ **소유 관리** - 소유한 도서를 체크하고 내보내기/가져오기 기능
- 🔍 **크롤링** - 알라딘에서 자동으로 도서 데이터 수집 (이후 알라딘 OpenAPI로 변경 예정)

## 기술 스택

- **프론트엔드**: Svelte 5 + TypeScript + Vite
- **크롤러**: Bun + Cheerio
- **데이터**: JSON 파일 기반

## 데이터 구조

- `data/lightnovel_list.json` - 도서 목록
- `data/lightnovel_detail.json` - 도서 상세 정보
- `data/lightnovel_series.json` - 시리즈 정보
- `data/lightnovel_hidden.json` - 숨긴 항목 (중복 등)