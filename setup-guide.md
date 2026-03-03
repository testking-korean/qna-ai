# QnA Insight - 셀러 설치 가이드

## 전체 구조
```
[카페24 상세페이지] ← script 삽입 → [QnA 위젯]
                                        ↕ API 통신
                              [Google Apps Script]
                                        ↕ 읽기/쓰기
                              [Google 스프레드시트]
```

---

## Step 1: Google 스프레드시트 생성

1. [Google Sheets](https://sheets.google.com)에서 **새 스프레드시트** 생성
2. 스프레드시트 이름: `QnA Insight - [내 쇼핑몰 이름]`
3. 스프레드시트 ID를 메모 (URL에서 `/d/` 뒤의 긴 문자열)
   - 예: `https://docs.google.com/spreadsheets/d/여기가_스프레드시트_ID/edit`

---

## Step 2: Google Apps Script 설정

1. 스프레드시트에서 **확장 프로그램 > Apps Script** 클릭
2. 기존 코드를 모두 삭제하고, 아래 파일들을 붙여넣기:

### 파일 추가 방법:
- Apps Script 에디터 좌측에서 **+** 버튼 → **스크립트** 클릭
- 아래 3개 파일을 각각 추가:

| 파일명 | 설명 |
|--------|------|
| `Code.gs` | 메인 API 라우터 (`google-apps-script/Code.gs` 내용 복사) |
| `SheetManager.gs` | DB 유틸리티 (`google-apps-script/SheetManager.gs` 내용 복사) |

### 초기 설정 실행:
1. `Code.gs` 파일을 선택한 상태에서
2. 상단의 함수 선택 드롭다운에서 `initializeSheets` 선택 (SheetManager.gs에 있음)
3. **실행** 버튼 클릭
4. Google 계정 권한 승인 (처음 1회)
5. 스프레드시트에 시트들이 자동 생성되었는지 확인

---

## Step 3: Web App 배포

1. Apps Script 에디터에서 **배포 > 새 배포** 클릭
2. 유형 선택: **웹 앱**
3. 설정:
   - 설명: `QnA Insight API v1`
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
4. **배포** 클릭
5. **웹 앱 URL** 복사하여 메모
   - 형식: `https://script.google.com/macros/s/xxxxx/exec`

---

## Step 4: 샘플 데이터 입력

### Categories 시트에 카테고리 추가:
| category_id | parent_id | level | name | product_id | sort_order |
|---|---|---|---|---|---|
| CAT_1 | | 1 | 배송/교환 | 내_제품ID | 1 |
| CAT_2 | | 1 | 사이즈 | 내_제품ID | 2 |
| CAT_3 | | 1 | 소재/관리 | 내_제품ID | 3 |
| CAT_1_1 | CAT_1 | 2 | 교환절차 | 내_제품ID | 1 |
| CAT_1_2 | CAT_1 | 2 | 배송기간 | 내_제품ID | 2 |

- `product_id`: 카페24의 상품번호 사용
- `level`: 1=대분류, 2=중분류, 3=소분류, 4=세부분류
- `parent_id`: 상위 카테고리의 category_id (1차는 비워두기)

### Products 시트에 제품 등록:
| product_id | product_name | seller_id | created_at |
|---|---|---|---|
| 내_제품ID | 상품명 | SELLER_001 | 2026-03-01 |

### Questions 시트에 기존 QnA 입력:
| question_id | product_id | category_id | question_text | answer_text | author_name | created_at | status | click_count | rating_sum | rating_count |
|---|---|---|---|---|---|---|---|---|---|---|
| Q_001 | 내_제품ID | CAT_3 | 세탁기에 돌려도 되나요? | 30도 이하 찬물 세탁 권장 | 김*영 | 2026-02-25 | answered | 0 | 0 | 0 |

---

## Step 5: 카페24 상세페이지에 위젯 삽입

### 위젯 파일 호스팅:
`widget/qna-widget.js`와 `widget/qna-widget.css` 파일을 웹에서 접근 가능한 곳에 업로드합니다.

**호스팅 옵션:**
- GitHub Pages (무료)
- Netlify / Vercel (무료)
- 카페24 FTP에 직접 업로드

### 카페24 상세페이지 HTML에 삽입:
```html
<!-- QnA Insight 위젯 -->
<link rel="stylesheet" href="https://[호스팅URL]/qna-widget.css">
<div id="qna-insight-widget"
     data-product-id="{상품번호}"
     data-api-url="https://script.google.com/macros/s/[배포ID]/exec">
</div>
<script src="https://[호스팅URL]/qna-widget.js"></script>
```

### 카페24에서 삽입 위치:
1. 카페24 관리자 → **디자인 > 디자인 편집**
2. **상품 상세 페이지** 템플릿 찾기
3. 리뷰 섹션 아래 또는 원하는 위치에 위 코드 삽입
4. `{상품번호}` 부분은 카페24 변수로 교체: `{$product_no}`

**최종 삽입 코드 예시 (카페24 변수 사용):**
```html
<link rel="stylesheet" href="https://[호스팅URL]/qna-widget.css">
<div id="qna-insight-widget"
     data-product-id="{$product_no}"
     data-api-url="https://script.google.com/macros/s/[배포ID]/exec">
</div>
<script src="https://[호스팅URL]/qna-widget.js"></script>
```

---

## Step 6: 동작 확인

1. 카페24 쇼핑몰의 아무 상품 상세페이지 접속
2. QnA 인사이트 섹션이 표시되는지 확인
3. 카테고리 필터, 정렬, 질문 등록이 작동하는지 테스트
4. 스프레드시트에 새 질문/클릭로그가 기록되는지 확인

---

## 문제 해결

| 증상 | 해결 방법 |
|------|-----------|
| 위젯이 로딩만 계속됨 | Apps Script 배포 URL이 정확한지, 웹 앱 액세스가 "모든 사용자"인지 확인 |
| CORS 에러 | Apps Script는 기본적으로 CORS를 허용합니다. 배포를 다시 해보세요 |
| 데이터가 안 보임 | 스프레드시트에 해당 product_id의 데이터가 있는지 확인 |
| 질문 등록 안됨 | Apps Script 실행 권한이 "나"로 설정되어 있는지 확인 |

---

## 관리자 팁

- **카테고리 추가**: Categories 시트에 직접 행을 추가하면 됩니다
- **답변 등록**: Questions 시트에서 `answer_text` 컬럼에 답변 입력, `status`를 `answered`로 변경
- **질문 숨기기**: Questions 시트에서 `status`를 `hidden`으로 변경
- **통계 확인**: 스프레드시트의 ClickLog, RatingLog 시트에서 사용자 행동 데이터 확인 가능
