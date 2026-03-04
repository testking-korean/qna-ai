/**
 * QnA Insight Widget
 * 카페24 상세페이지에 삽입되는 QnA 탭 위젯
 *
 * 사용법:
 * <div id="qna-insight-widget" data-product-id="PRODUCT_ID" data-api-url="APPS_SCRIPT_URL"></div>
 * <script src="qna-widget.js"></script>
 */

(function () {
  'use strict';

  class QnAWidget {
    constructor(container) {
      this.container = container;
      this.productId = container.getAttribute('data-product-id');
      this.apiUrl = container.getAttribute('data-api-url');
      this.memberId = container.getAttribute('data-member-id') || '';
      this.sessionId = this.getOrCreateSessionId();

      // 상태
      this.categories = [];
      this.flatCategories = [];
      this.allQuestions = [];
      this.typeStats = {};          // { CAT_1: { unique_clickers, unique_questioners }, ... }
      this.subTypeStats = {};       // { CAT_1_1: { unique_clickers }, ... }
      this.questionClickers = {};   // { Q_001: 123, ... }
      this.totalUniqueClickers = 0;
      this.viewMode = 'types'; // 'types' | 'detail'
      this.selectedTypeId = null;
      this.selectedSubTypeId = null;
      this.typeSortBy = 'questions'; // 'questions' | 'clicks'
      this.subTypeSortBy = 'questions';
      this.faqSortBy = 'questions';
      this.faqDisplayCount = 10;

      // AI 검색 & 챗봇
      this.searchQuery = '';
      this.searchResults = null;
      this.searchLoading = false;
      this.aiChatOpen = false;
      this.aiChatHistory = [];
      this.aiChatLoading = false;

      this.init();
    }

    // ============================================
    // 초기화
    // ============================================
    async init() {
      this.container.classList.add('qna-widget');
      this.render('<div class="qna-loading"><div class="spinner"></div><p>QnA 인사이트 로딩 중...</p></div>');

      try {
        const [categoryRes, questionsRes, typeStatsRes] = await Promise.all([
          this.apiGet('getCategories', { product_id: this.productId }),
          this.apiGet('getQuestions', {
            product_id: this.productId,
            sort: 'click_count',
            order: 'desc',
            page: 1,
            per_page: 9999
          }),
          this.apiGet('getTypeStats', { product_id: this.productId })
        ]);

        this.categories = categoryRes.categories || [];
        this.flatCategories = categoryRes.flat || [];
        this.allQuestions = questionsRes.questions || [];
        this.typeStats = typeStatsRes.type_stats || {};
        this.subTypeStats = typeStatsRes.sub_type_stats || {};
        this.questionClickers = typeStatsRes.question_clickers || {};
        this.totalUniqueClickers = typeStatsRes.total_unique_clickers || 0;

        this.renderCurrentView();
      } catch (err) {
        this.render('<div class="qna-error">QnA 데이터를 불러올 수 없습니다.<br><small>' + err.message + '</small></div>');
      }
    }

    // ============================================
    // API 통신
    // ============================================
    async apiGet(action, params) {
      let qs = 'action=' + encodeURIComponent(action);
      for (const key in params) {
        if (params[key] !== null && params[key] !== undefined) {
          qs += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }
      }
      const url = this.apiUrl + (this.apiUrl.indexOf('?') === -1 ? '?' : '&') + qs;
      const response = await fetch(url);
      if (!response.ok) throw new Error('API 오류: ' + response.status);
      return response.json();
    }

    async apiPost(action, body) {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
        redirect: 'follow'
      });
      if (!response.ok) throw new Error('API 오류: ' + response.status);
      return response.json();
    }

    // ============================================
    // 뷰 라우터
    // ============================================
    renderCurrentView() {
      if (this.viewMode === 'types') {
        this.renderScreen1();
      } else {
        this.renderScreen2();
      }
    }

    render(html) {
      this.container.innerHTML = html;
    }

    // ============================================
    // Screen 1: 가장 많이 물어본 질문유형 (카드형)
    // ============================================
    renderScreen1() {
      const level1Cats = this.flatCategories.filter(function (c) { return Number(c.level) === 1; });
      const self = this;

      // level1 카테고리별 집계
      const typeData = level1Cats.map(function (cat) {
        const childIds = self.getDescendantIds(cat.category_id);
        childIds.push(cat.category_id);
        const questions = self.allQuestions.filter(function (q) {
          return childIds.indexOf(q.category_id) !== -1;
        });
        // 2차 하위 카테고리 중 질문이 1개 이상인 것만 카운트
        const subCatCount = self.flatCategories.filter(function (c) {
          if (String(c.parent_id) !== String(cat.category_id) || Number(c.level) !== 2) return false;
          var subChildIds = self.getDescendantIds(c.category_id);
          subChildIds.push(c.category_id);
          return questions.some(function (q) { return subChildIds.indexOf(q.category_id) !== -1; });
        }).length;
        // API에서 가져온 실제 고유 클릭자/질문자 수
        var stats = self.typeStats[cat.category_id] || {};
        var uniqueClickers = stats.unique_clickers || 0;
        var uniqueQuestioners = stats.unique_questioners || 0;
        return { cat: cat, count: questions.length, subCatCount: subCatCount, uniqueClickers: uniqueClickers, uniqueQuestioners: uniqueQuestioners, childIds: childIds };
      });

      // 정렬
      if (self.typeSortBy === 'clicks') {
        typeData.sort(function (a, b) { return (b.uniqueClickers - a.uniqueClickers) || (b.count - a.count) || a.cat.name.localeCompare(b.cat.name); });
      } else {
        typeData.sort(function (a, b) { return (b.count - a.count) || (b.uniqueClickers - a.uniqueClickers) || a.cat.name.localeCompare(b.cat.name); });
      }

      // 전체 고유 클릭자 수 / 전체 고유 질문자 수
      var totalUniqueClickers = Math.max(1, self.totalUniqueClickers);
      var totalUniqueQuestioners = Math.max(1, typeData.reduce(function (sum, item) { return sum + item.uniqueQuestioners; }, 0));

      let html = '<div class="qna-main-section">';
      html += '<div class="qna-main-title">질문하기</div><div class="qna-main-title-divider"></div>';
      html += this.renderSearchBar();
      if (this.searchResults !== null) {
        html += this.renderSearchResults();
      }
      html += '<div class="qna-browse-section">';
      html += '<div class="qna-section-subtitle">질문 직접 찾기</div>';
      html += '<div class="qna-screen1">';
      html += '<div class="qna-sort-row">';
      html += '<button class="qna-sort-btn' + (self.typeSortBy === 'questions' ? ' active' : '') + '" data-sort="questions" data-target="type">질문 많은 순</button>';
      html += '<button class="qna-sort-btn' + (self.typeSortBy === 'clicks' ? ' active' : '') + '" data-sort="clicks" data-target="type">클릭 많은 순</button>';
      html += '</div>';
      html += '<div class="qna-type-grid">';

      typeData.forEach(function (item) {
        var qPct = Math.round(item.uniqueQuestioners / totalUniqueQuestioners * 100);
        var pct = Math.round(item.uniqueClickers / totalUniqueClickers * 100);
        html += '<div class="qna-type-card" data-type-id="' + item.cat.category_id + '">';
        html += '<div class="qna-type-card-name">' + self.escapeHtml(item.cat.name) + '</div>';
        html += '<div class="qna-type-card-stats">';
        html += '<div class="qna-type-stat-divider"></div>';
        html += '<div class="qna-type-stat">관련된 질문을 한 사람 <strong>' + self.formatNumber(item.uniqueQuestioners) + '</strong>명</div>';
        html += '<div class="qna-type-stat">이 질문을 클릭한 사람 <strong>' + self.formatNumber(item.uniqueClickers) + '</strong>명</div>';
        // 원형 차트 2개 (질문한 사람 / 클릭한 사람)
        html += '<div class="qna-type-donuts">';
        html += self.renderDonut(qPct, '질문');
        html += self.renderDonut(pct, '클릭');
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });

      html += '</div>'; // .qna-type-grid
      html += '<div class="qna-screen1-note">클릭한 사람은 로그인한 회원만 각 유형별 1회씩 집계합니다</div>';
      html += '</div>'; // .qna-screen1
      html += '</div>'; // .qna-browse-section
      html += '</div>'; // .qna-main-section
      if (this.aiChatOpen) html += this.renderAiChatModal();
      this.render(html);
      this.bindSearchEvents();
      this.bindScreen1Events();
      if (this.aiChatOpen) this.bindAiChatEvents();
    }

    // ============================================
    // Screen 2: 질문유형 상세 (라디오 네비 + 세부유형 + Q&A)
    // ============================================
    renderScreen2() {
      const self = this;
      const selectedType = this.flatCategories.find(function (c) {
        return c.category_id === self.selectedTypeId;
      });
      if (!selectedType) { this.viewMode = 'types'; this.renderScreen1(); return; }

      const level1Cats = this.flatCategories.filter(function (c) { return Number(c.level) === 1; });

      // 질문 수 기준 정렬 (Screen1과 동일)
      const typeData = level1Cats.map(function (cat) {
        const childIds = self.getDescendantIds(cat.category_id);
        childIds.push(cat.category_id);
        const count = self.allQuestions.filter(function (q) {
          return childIds.indexOf(q.category_id) !== -1;
        }).length;
        return { cat: cat, count: count };
      });
      typeData.sort(function (a, b) { return b.count - a.count; });

      let html = '<div class="qna-main-section">';
      html += '<div class="qna-main-title">질문하기</div><div class="qna-main-title-divider"></div>';
      html += this.renderSearchBar();
      if (this.searchResults !== null) {
        html += this.renderSearchResults();
      }
      html += '<div class="qna-browse-section">';
      html += '<div class="qna-section-subtitle">질문 직접 찾기</div>';
      html += '<div class="qna-screen2">';

      // 돌아가기 버튼 (nav-bar 바깥)
      html += '<button class="qna-back-btn" id="qna-back-btn">&larr; 돌아가기</button>';

      // 라디오 네비게이션 + 세부 유형 카드 (하나의 nav-bar 안)
      html += '<div class="qna-nav-bar">';
      html += '<div class="qna-type-radio-label">질문 유형</div>';
      html += '<div class="qna-type-radio-row">';
      typeData.forEach(function (item) {
        const isSelected = item.cat.category_id === self.selectedTypeId;
        html += '<button class="qna-type-radio' + (isSelected ? ' selected' : '') + '" data-type-id="' + item.cat.category_id + '">';
        html += self.escapeHtml(item.cat.name);
        html += '</button>';
      });
      html += '</div>'; // .qna-type-radio-row

      // 2단계 하위 카테고리 (세부 유형 카드) — nav-bar 안쪽
      const level2Cats = this.flatCategories.filter(function (c) {
        return String(c.parent_id) === String(self.selectedTypeId) && Number(c.level) === 2;
      });
      level2Cats.sort(function (a, b) {
        return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      });

      if (level2Cats.length > 0) {
        html += '<div class="qna-sub-divider"></div>';
        html += '<div class="qna-sub-type-label">' + self.escapeHtml(selectedType.name) + ' 질문 세부 유형</div>';

        if (!self.selectedSubTypeId) {
          // ── 카드 모드: 세부 유형을 카드로 표시 ──
          var allChildIds = self.getDescendantIds(self.selectedTypeId);
          allChildIds.push(self.selectedTypeId);
          var typeQuestions = self.allQuestions.filter(function (q) {
            return allChildIds.indexOf(q.category_id) !== -1;
          });
          // 부모 유형의 고유 질문자 / 고유 클릭자 (분모)
          var parentTypeAuthors = {};
          typeQuestions.forEach(function (q) { if (q.author_name) parentTypeAuthors[q.author_name] = true; });
          var totalTypeAuthors = Math.max(1, Object.keys(parentTypeAuthors).length);
          var parentTypeClickers = Math.max(1, (self.typeStats[self.selectedTypeId] || {}).unique_clickers || 0);

          // 세부 유형 데이터 수집
          var subTypeData = level2Cats.map(function (subCat) {
            const subChildIds = self.getDescendantIds(subCat.category_id);
            subChildIds.push(subCat.category_id);
            const subQuestions = self.allQuestions.filter(function (q) {
              return subChildIds.indexOf(q.category_id) !== -1;
            });
            var subAuthorSet = {};
            subQuestions.forEach(function (q) { if (q.author_name) subAuthorSet[q.author_name] = true; });
            var subUniqueClickers = (self.subTypeStats[subCat.category_id] || {}).unique_clickers || 0;
            return { cat: subCat, qCount: subQuestions.length, subAuthors: Object.keys(subAuthorSet).length, subUniqueClickers: subUniqueClickers };
          });

          // 정렬
          if (self.subTypeSortBy === 'clicks') {
            subTypeData.sort(function (a, b) { return (b.subUniqueClickers - a.subUniqueClickers) || (b.qCount - a.qCount) || a.cat.name.localeCompare(b.cat.name); });
          } else {
            subTypeData.sort(function (a, b) { return (b.qCount - a.qCount) || (b.subUniqueClickers - a.subUniqueClickers) || a.cat.name.localeCompare(b.cat.name); });
          }

          html += '<div class="qna-sort-row">';
          html += '<button class="qna-sort-btn' + (self.subTypeSortBy === 'questions' ? ' active' : '') + '" data-sort="questions" data-target="subtype">질문 많은 순</button>';
          html += '<button class="qna-sort-btn' + (self.subTypeSortBy === 'clicks' ? ' active' : '') + '" data-sort="clicks" data-target="subtype">클릭 많은 순</button>';
          html += '</div>';

          html += '<div class="qna-sub-type-grid">';
          subTypeData.forEach(function (item) {
            var qPct = Math.round(item.subAuthors / totalTypeAuthors * 100);
            var cPct = Math.round(item.subUniqueClickers / parentTypeClickers * 100);

            html += '<div class="qna-sub-type-card" data-sub-id="' + item.cat.category_id + '">';
            html += '<div class="qna-type-card-name">' + self.escapeHtml(item.cat.name) + '</div>';
            html += '<div class="qna-type-card-stats">';
            html += '<div class="qna-type-stat-divider"></div>';
            html += '<div class="qna-type-stat">관련된 질문을 한 사람 <strong>' + self.formatNumber(item.subAuthors) + '</strong>명</div>';
            html += '<div class="qna-type-stat">이 질문을 클릭한 사람 <strong>' + self.formatNumber(item.subUniqueClickers) + '</strong>명</div>';
            html += '<div class="qna-type-donuts">';
            html += self.renderDonut(qPct, '질문');
            html += self.renderDonut(cPct, '클릭');
            html += '</div>';
            html += '</div>';
            html += '</div>';
          });
          html += '</div>'; // .qna-sub-type-grid

        } else {
          // ── 라디오 모드: 세부 유형을 라디오 필터로 표시 ──
          html += '<div class="qna-sub-type-radio-row">';
          level2Cats.forEach(function (subCat) {
            const isSelected = String(self.selectedSubTypeId) === String(subCat.category_id);
            html += '<button class="qna-sub-type-radio' + (isSelected ? ' selected' : '') + '" data-sub-id="' + subCat.category_id + '">';
            html += self.escapeHtml(subCat.name);
            html += '</button>';
          });
          html += '</div>'; // .qna-sub-type-radio-row
        }
      }

      html += '</div>'; // .qna-nav-bar

      // 대표 질문: 세부 유형이 선택된 경우에만 표시
      if (self.selectedSubTypeId) {
        const subChildIds = self.getDescendantIds(self.selectedSubTypeId);
        subChildIds.push(self.selectedSubTypeId);
        var filteredQuestions = self.allQuestions.filter(function (q) {
          return subChildIds.indexOf(q.category_id) !== -1;
        });

        // 정렬
        if (self.faqSortBy === 'questions') {
          filteredQuestions.sort(function (a, b) { return (b.related_count || 1) - (a.related_count || 1) || a.question_text.localeCompare(b.question_text); });
        } else {
          filteredQuestions.sort(function (a, b) { return (self.questionClickers[b.question_id] || 0) - (self.questionClickers[a.question_id] || 0) || a.question_text.localeCompare(b.question_text); });
        }

        // 선택된 세부 유형 이름 + 통계
        var selectedSubType = self.flatCategories.find(function (c) { return c.category_id === self.selectedSubTypeId; });
        var subTypeName = selectedSubType ? selectedSubType.name : '';

        // 세부 유형 내 질문 수 / 세부유형 고유 클릭자 수 (% 계산용)
        var subTotalQuestions = Math.max(1, filteredQuestions.length);
        var subTypeUniqueClickers = Math.max(1, (self.subTypeStats[self.selectedSubTypeId] || {}).unique_clickers || 0);

        html += '<div class="qna-faq-section">';
        html += '<div class="qna-faq-header">';
        html += '<div class="qna-faq-title">' + self.escapeHtml(subTypeName) + ' 대표 질문</div>';
        html += '</div>';
        html += '<div class="qna-faq-desc">AI가 실제 질문을 정제하고 내용을 그룹화하였습니다</div>';

        html += '<div class="qna-sort-row">';
        html += '<button class="qna-sort-btn' + (self.faqSortBy === 'questions' ? ' active' : '') + '" data-sort="questions" data-target="faq">질문 많은 순</button>';
        html += '<button class="qna-sort-btn' + (self.faqSortBy === 'clicks' ? ' active' : '') + '" data-sort="clicks" data-target="faq">클릭 많은 순</button>';
        html += '</div>';

        if (filteredQuestions.length === 0) {
          html += '<div class="qna-empty">등록된 질문이 없습니다.</div>';
        } else {
          var visibleQuestions = filteredQuestions.slice(0, self.faqDisplayCount);
          var hasMore = filteredQuestions.length > self.faqDisplayCount;

          html += '<div class="qna-faq-list">';
          visibleQuestions.forEach(function (q, idx) {
            var hasAnswer = q.answer_text && q.status === 'answered';
            var qUniqueClickers = self.questionClickers[q.question_id] || 0;
            var cPct = Math.round(qUniqueClickers / subTypeUniqueClickers * 100);
            html += '<div class="qna-faq-item" data-faq-id="' + q.question_id + '">';
            html += '<div class="qna-faq-q">';
            html += '<span class="qna-faq-q-text">' + self.escapeHtml(q.question_text) + '</span>';
            html += '<div class="qna-faq-q-stats">';
            html += '<span>관련된 질문을 한 사람 ' + self.formatNumber(q.related_count || 1) + '명</span>';
            html += '<span>클릭 ' + cPct + '%</span>';
            html += '</div>';
            html += '</div>';
            html += '<div class="qna-faq-a" id="qna-faq-a-' + q.question_id + '">';
            if (hasAnswer) {
              html += '<div class="qna-faq-answer">' + self.escapeHtml(q.answer_text) + '</div>';
            } else {
              html += '<div class="qna-faq-answer pending">아직 답변이 등록되지 않았습니다.</div>';
            }
            html += '</div>';
            html += '</div>';
          });
          html += '</div>'; // .qna-faq-list

          if (hasMore) {
            var remaining = filteredQuestions.length - self.faqDisplayCount;
            html += '<button class="qna-faq-more-btn" id="qna-faq-more">' + remaining + '개 더보기</button>';
          }
        }
        html += '</div>'; // .qna-faq-section
      }

      html += '</div>'; // .qna-screen2
      html += '</div>'; // .qna-browse-section
      html += '</div>'; // .qna-main-section
      if (this.aiChatOpen) html += this.renderAiChatModal();
      this.render(html);
      this.bindSearchEvents();
      this.bindScreen2Events();
      if (this.aiChatOpen) this.bindAiChatEvents();
    }

    // ============================================
    // 질문 등록 폼
    // ============================================
    renderSubmitForm() {
      let catOptions = '<option value="">카테고리 선택 (선택사항)</option>';
      for (const cat of this.flatCategories) {
        const indent = '\u00A0\u00A0'.repeat(Number(cat.level) - 1);
        catOptions += '<option value="' + cat.category_id + '">' + indent + cat.name + '</option>';
      }

      return '<div class="qna-submit-section">' +
        '<button class="qna-submit-toggle" id="qna-toggle-form">+ 질문하기</button>' +
        '<div class="qna-submit-form" id="qna-form">' +
          '<div class="qna-form-group"><label>카테고리</label><select id="qna-form-category">' + catOptions + '</select></div>' +
          '<div class="qna-form-group"><label>질문 내용 *</label><textarea id="qna-form-question" placeholder="궁금한 점을 작성해주세요..."></textarea></div>' +
          '<div class="qna-form-group"><label>작성자</label><input type="text" id="qna-form-author" placeholder="닉네임 (선택사항)"></div>' +
          '<div class="qna-form-actions">' +
            '<button class="qna-btn qna-btn-secondary" id="qna-form-cancel">취소</button>' +
            '<button class="qna-btn qna-btn-primary" id="qna-form-submit">질문 등록</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // ============================================
    // 이벤트 바인딩 - Screen 1
    // ============================================
    bindScreen1Events() {
      const self = this;

      // 카드 클릭 → Screen 2로 전환
      this.container.querySelectorAll('.qna-type-card').forEach(function (card) {
        card.addEventListener('click', function () {
          self.selectedTypeId = this.getAttribute('data-type-id');
          self.viewMode = 'detail';
          self.renderCurrentView();
        });
      });

      // 정렬 버튼
      this.container.querySelectorAll('.qna-sort-btn[data-target="type"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.typeSortBy = this.getAttribute('data-sort');
          self.renderCurrentView();
        });
      });

      this.bindFormEvents();
    }

    // ============================================
    // 이벤트 바인딩 - Screen 2
    // ============================================
    bindScreen2Events() {
      const self = this;

      // 뒤로가기
      var backBtn = this.container.querySelector('#qna-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          self.viewMode = 'types';
          self.selectedTypeId = null;
          self.renderCurrentView();
        });
      }

      // 라디오 버튼 (다른 유형 선택)
      this.container.querySelectorAll('.qna-type-radio').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.selectedTypeId = this.getAttribute('data-type-id');
          self.selectedSubTypeId = null;
          self.renderCurrentView();
        });
      });

      // 세부 유형 카드 클릭 → 즉시 라디오 모드 전환
      this.container.querySelectorAll('.qna-sub-type-card').forEach(function (card) {
        card.addEventListener('click', function () {
          self.selectedSubTypeId = this.getAttribute('data-sub-id');
          self.faqDisplayCount = 10;
          self.renderCurrentView();
        });
      });

      // 세부 유형 라디오 클릭 (토글: 다시 누르면 카드 모드로 복귀)
      this.container.querySelectorAll('.qna-sub-type-radio').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var subId = this.getAttribute('data-sub-id');
          self.selectedSubTypeId = String(self.selectedSubTypeId) === String(subId) ? null : subId;
          self.faqDisplayCount = 10;
          self.renderCurrentView();
        });
      });

      // 정렬 버튼 (세부 유형)
      this.container.querySelectorAll('.qna-sort-btn[data-target="subtype"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.subTypeSortBy = this.getAttribute('data-sort');
          self.renderCurrentView();
        });
      });

      // 대표 질문 토글
      this.container.querySelectorAll('.qna-faq-q').forEach(function (faqQ) {
        faqQ.addEventListener('click', function () {
          var item = this.closest('.qna-faq-item');
          var faqId = item.getAttribute('data-faq-id');
          var answerEl = self.container.querySelector('#qna-faq-a-' + faqId);
          if (answerEl) {
            answerEl.classList.toggle('open');
            this.classList.toggle('open');
          }
        });
      });

      // 정렬 버튼 (대표 질문)
      this.container.querySelectorAll('.qna-sort-btn[data-target="faq"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.faqSortBy = this.getAttribute('data-sort');
          self.renderCurrentView();
        });
      });

      // 더보기 버튼
      var moreBtn = this.container.querySelector('#qna-faq-more');
      if (moreBtn) {
        moreBtn.addEventListener('click', function () {
          self.faqDisplayCount += 10;
          self.renderCurrentView();
        });
      }

      this.bindFormEvents();
    }

    // ============================================
    // 질문 등록 폼 이벤트 (공통)
    // ============================================
    bindFormEvents() {
      const self = this;
      const toggleBtn = this.container.querySelector('#qna-toggle-form');
      const form = this.container.querySelector('#qna-form');

      if (toggleBtn && form) {
        toggleBtn.addEventListener('click', function () {
          form.classList.toggle('visible');
          toggleBtn.style.display = form.classList.contains('visible') ? 'none' : 'flex';
        });
      }

      var cancelBtn = this.container.querySelector('#qna-form-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          form.classList.remove('visible');
          toggleBtn.style.display = 'flex';
        });
      }

      var submitBtn = this.container.querySelector('#qna-form-submit');
      if (submitBtn) {
        submitBtn.addEventListener('click', async function () {
          var questionText = self.container.querySelector('#qna-form-question').value.trim();
          var categoryId = self.container.querySelector('#qna-form-category').value;
          var authorName = self.container.querySelector('#qna-form-author').value.trim();

          if (!questionText) { alert('질문 내용을 입력해주세요.'); return; }

          submitBtn.disabled = true;
          submitBtn.textContent = '등록 중...';

          try {
            await self.apiPost('submitQuestion', {
              product_id: self.productId,
              category_id: categoryId,
              question_text: questionText,
              author_name: authorName || '익명'
            });
            alert('질문이 등록되었습니다!');

            // 데이터 새로고침
            var questionsRes = await self.apiGet('getQuestions', {
              product_id: self.productId, sort: 'click_count', order: 'desc', page: 1, per_page: 9999
            });
            self.allQuestions = questionsRes.questions || [];
            self.renderCurrentView();
          } catch (err) {
            alert('질문 등록에 실패했습니다: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = '질문 등록';
          }
        });
      }
    }

    // ============================================
    // AI 검색바
    // ============================================
    renderSearchBar() {
      let html = '<div class="qna-section-subtitle">질문 검색</div>';
      html += '<div class="qna-search-section">';
      html += '<div class="qna-search-bar">';
      html += '<input type="text" class="qna-search-input" id="qna-search-input" placeholder="궁금한 사항을 찾아보거나 입력하세요" value="' + this.escapeHtml(this.searchQuery) + '">';
      html += '<button class="qna-search-btn" id="qna-search-btn" ' + (this.searchLoading ? 'disabled' : '') + '>' + (this.searchLoading ? '검색 중...' : '검색') + '</button>';
      html += '</div>';
      html += '<div class="qna-search-hint">입력하시면 AI가 가장 유사한 질문과 답변을 찾아줍니다</div>';
      html += '</div>';
      return html;
    }

    renderSearchResults() {
      if (this.searchResults === null) return '';
      const self = this;

      let html = '<div class="qna-search-results">';

      if (this.searchResults.length > 0) {
        html += '<div class="qna-search-results-title">검색 결과 ' + this.searchResults.length + '건</div>';
        this.searchResults.forEach(function (r) {
          html += '<div class="qna-search-result-item" data-result-qid="' + r.question_id + '">';
          html += '<div class="qna-search-result-q">';
          html += '<span class="qna-search-result-q-text">' + self.escapeHtml(r.question_text) + '</span>';
          html += '<span class="qna-search-result-score">유사도 ' + r.score + '%</span>';
          html += '</div>';
          html += '<div class="qna-search-result-a" id="qna-sr-a-' + r.question_id + '">';
          if (r.answer_text && r.status === 'answered') {
            html += '<div class="qna-search-result-answer">' + self.escapeHtml(r.answer_text) + '</div>';
          } else {
            html += '<div class="qna-search-result-answer pending">아직 답변이 등록되지 않았습니다.</div>';
          }
          html += '</div>';
          html += '</div>';
        });
      } else {
        html += '<div class="qna-search-empty">유사한 질문을 찾지 못했습니다.</div>';
      }

      html += '<div class="qna-search-ai-prompt">';
      html += '<p>원하는 답변을 찾지 못하셨나요?</p>';
      html += '<button class="qna-ai-chat-open-btn" id="qna-ai-chat-open">AI 상담사에게 물어보기</button>';
      html += '</div>';

      html += '</div>';
      return html;
    }

    // ============================================
    // AI 챗봇 모달
    // ============================================
    renderAiChatModal() {
      const self = this;
      let html = '<div class="qna-ai-chat-overlay" id="qna-ai-overlay">';
      html += '<div class="qna-ai-chat-modal">';
      html += '<div class="qna-ai-chat-header">';
      html += '<span>AI 상담사</span>';
      html += '<button class="qna-ai-chat-close" id="qna-ai-close">&times;</button>';
      html += '</div>';
      html += '<div class="qna-ai-chat-body" id="qna-ai-body">';

      if (this.aiChatHistory.length === 0) {
        html += '<div class="qna-ai-chat-welcome">안녕하세요! 제품에 대해 궁금한 점을 물어보세요.</div>';
      }

      this.aiChatHistory.forEach(function (msg) {
        html += '<div class="qna-ai-chat-message ' + msg.role + '">';
        html += '<div class="qna-ai-chat-label">' + (msg.role === 'user' ? '고객' : 'AI') + '</div>';
        html += '<div class="qna-ai-chat-text">' + self.escapeHtml(msg.text) + '</div>';
        html += '</div>';
      });

      if (this.aiChatLoading) {
        html += '<div class="qna-ai-chat-message ai">';
        html += '<div class="qna-ai-chat-label">AI</div>';
        html += '<div class="qna-ai-chat-text loading">답변을 생성하고 있습니다...</div>';
        html += '</div>';
      }

      html += '</div>';
      html += '<div class="qna-ai-chat-input-area">';
      html += '<input type="text" class="qna-ai-chat-input" id="qna-ai-input" placeholder="질문을 입력하세요...">';
      html += '<button class="qna-ai-chat-send" id="qna-ai-send">보내기</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      return html;
    }

    // ============================================
    // 검색 이벤트
    // ============================================
    bindSearchEvents() {
      const self = this;

      var searchBtn = this.container.querySelector('#qna-search-btn');
      var searchInput = this.container.querySelector('#qna-search-input');

      if (searchBtn) {
        searchBtn.addEventListener('click', function () {
          self.performSearch();
        });
      }

      if (searchInput) {
        searchInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            self.performSearch();
          }
        });
      }

      // 검색 결과 아이템 토글
      this.container.querySelectorAll('.qna-search-result-item').forEach(function (item) {
        var qEl = item.querySelector('.qna-search-result-q');
        if (qEl) {
          qEl.addEventListener('click', function () {
            var qid = item.getAttribute('data-result-qid');
            var answerEl = self.container.querySelector('#qna-sr-a-' + qid);
            if (answerEl) {
              answerEl.classList.toggle('open');
              this.classList.toggle('open');
            }
          });
        }
      });

      // AI 상담사 열기 버튼
      var aiOpenBtn = this.container.querySelector('#qna-ai-chat-open');
      if (aiOpenBtn) {
        aiOpenBtn.addEventListener('click', function () {
          self.aiChatOpen = true;
          if (self.searchQuery && self.aiChatHistory.length === 0) {
            self.sendAiChat(self.searchQuery);
          } else {
            self.renderCurrentView();
          }
        });
      }
    }

    bindAiChatEvents() {
      const self = this;

      var closeBtn = this.container.querySelector('#qna-ai-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          self.aiChatOpen = false;
          self.renderCurrentView();
        });
      }

      var overlay = this.container.querySelector('#qna-ai-overlay');
      if (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) {
            self.aiChatOpen = false;
            self.renderCurrentView();
          }
        });
      }

      var sendBtn = this.container.querySelector('#qna-ai-send');
      var aiInput = this.container.querySelector('#qna-ai-input');

      if (sendBtn) {
        sendBtn.addEventListener('click', function () {
          var msg = aiInput ? aiInput.value.trim() : '';
          if (msg) self.sendAiChat(msg);
        });
      }

      if (aiInput) {
        aiInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            var msg = aiInput.value.trim();
            if (msg) self.sendAiChat(msg);
          }
        });
        aiInput.focus();
      }

      var chatBody = this.container.querySelector('#qna-ai-body');
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }

    async performSearch() {
      var input = this.container.querySelector('#qna-search-input');
      var query = input ? input.value.trim() : '';
      if (!query) return;

      this.searchQuery = query;
      this.searchLoading = true;
      this.searchResults = null;
      this.renderCurrentView();

      try {
        var res = await this.apiGet('searchQuestions', {
          product_id: this.productId,
          query: query
        });
        this.searchResults = res.results || [];
      } catch (err) {
        this.searchResults = [];
      }

      this.searchLoading = false;
      this.renderCurrentView();
    }

    async sendAiChat(message) {
      this.aiChatHistory.push({ role: 'user', text: message });
      this.aiChatLoading = true;
      this.aiChatOpen = true;
      this.renderCurrentView();

      try {
        var res = await this.apiPost('aiChat', {
          product_id: this.productId,
          message: message,
          history: this.aiChatHistory.filter(function (h) { return h.role !== undefined; }).slice(0, -1)
        });
        this.aiChatHistory.push({ role: 'ai', text: res.answer || '답변을 생성할 수 없습니다.' });
      } catch (err) {
        this.aiChatHistory.push({ role: 'ai', text: '죄송합니다. 일시적인 오류가 발생했습니다.' });
      }

      this.aiChatLoading = false;
      this.renderCurrentView();
    }

    // ============================================
    // 유틸리티
    // ============================================
    getDescendantIds(parentId) {
      const self = this;
      const children = this.flatCategories.filter(function (c) {
        return String(c.parent_id) === String(parentId);
      });
      let ids = [];
      children.forEach(function (child) {
        ids.push(child.category_id);
        ids = ids.concat(self.getDescendantIds(child.category_id));
      });
      return ids;
    }

    showLoginNotice() {
      if (this.container.querySelector('.qna-login-notice')) return;
      const notice = document.createElement('div');
      notice.className = 'qna-login-notice';
      notice.innerHTML = '<p>로그인이 되어있지 않네요.<br>중복 방지를 위해 로그인된 회원님의 수만 측정합니다.</p>';
      this.container.appendChild(notice);
      setTimeout(function () {
        notice.classList.add('fade-out');
        setTimeout(function () { notice.remove(); }, 400);
      }, 3000);
    }

    getOrCreateSessionId() {
      let id = sessionStorage.getItem('qna_session_id');
      if (!id) {
        id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('qna_session_id', id);
      }
      return id;
    }

    formatNumber(num) {
      num = Number(num) || 0;
      if (num >= 100000000) return (num / 100000000).toFixed(1) + '억';
      if (num >= 10000) return (num / 10000).toFixed(1) + '만';
      if (num >= 1000) return (num / 1000).toFixed(1) + '천';
      return num.toLocaleString();
    }

    renderDonut(pct, label) {
      var dash = pct;
      var gap = 100 - dash;
      // %가 높을수록 까매짐: 0%=#ccc(204) → 100%=#555(85)
      var gray = Math.round(204 - (pct / 100) * 119);
      var color = 'rgb(' + gray + ',' + gray + ',' + gray + ')';
      var svg = '<div class="qna-donut-item">';
      svg += '<svg class="qna-donut-svg" viewBox="0 0 50 50">';
      svg += '<circle cx="25" cy="25" r="22" fill="none" stroke="#f0f0f0" stroke-width="3"/>';
      svg += '<circle cx="25" cy="25" r="22" fill="none" stroke="' + color + '" stroke-width="3" stroke-dasharray="' + (dash * 1.382) + ' ' + (gap * 1.382) + '" stroke-dashoffset="34.6" transform="rotate(-90 25 25)"/>';
      svg += '<text x="25" y="22" text-anchor="middle" font-size="9" fill="#999">' + label + '</text>';
      svg += '<text x="25" y="33.5" text-anchor="middle" font-size="9" fill="#999" font-weight="600">' + pct + '%</text>';
      svg += '</svg>';
      svg += '</div>';
      return svg;
    }

    escapeHtml(str) {
      if (!str) return '';
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(str).replace(/[&<>"']/g, function (m) { return map[m]; });
    }
  }

  // ============================================
  // 자동 초기화
  // ============================================
  function initWidgets() {
    var containers = document.querySelectorAll('#qna-insight-widget, [data-qna-widget]');
    containers.forEach(function (el) {
      if (!el._qnaWidget) {
        el._qnaWidget = new QnAWidget(el);
      }
    });
  }

  function loadCSS() {
    var currentScript = document.currentScript;
    if (currentScript) {
      var scriptSrc = currentScript.src;
      var cssUrl = scriptSrc.replace(/\.js$/, '.css').replace('qna-widget.js', 'qna-widget.css');
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      document.head.appendChild(link);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadCSS(); initWidgets(); });
  } else {
    loadCSS();
    initWidgets();
  }

  window.QnAInsight = { init: initWidgets, Widget: QnAWidget };
})();
