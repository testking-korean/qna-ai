/**
 * Code.gs
 * QnA Insight SaaS - 메인 API 라우터
 * Google Apps Script Web App으로 배포
 *
 * GET 요청: doGet(e)  → 데이터 조회
 * POST 요청: doPost(e) → 데이터 생성/수정
 */

// ============================================
// API 라우터
// ============================================

function doGet(e) {
  try {
    var params = e.parameter;
    var action = params.action;

    var result;
    switch (action) {
      case 'getCategories':
        result = handleGetCategories(params);
        break;
      case 'getQuestions':
        result = handleGetQuestions(params);
        break;
      case 'getQuestionDetail':
        result = handleGetQuestionDetail(params);
        break;
      case 'getSummary':
        result = handleGetSummary(params);
        break;
      case 'getTypeStats':
        result = handleGetTypeStats(params);
        break;
      case 'searchQuestions':
        result = handleSearchQuestions(params);
        break;
      case 'init':
        result = initializeSheets();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    var result;
    switch (action) {
      case 'submitQuestion':
        result = handleSubmitQuestion(body);
        break;
      case 'trackClick':
        result = handleTrackClick(body);
        break;
      case 'addCategory':
        result = handleAddCategory(body);
        break;
      case 'answerQuestion':
        result = handleAnswerQuestion(body);
        break;
      case 'aiChat':
        result = handleAiChat(body);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

/**
 * CORS 대응 JSON 응답 생성
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// GET 핸들러
// ============================================

/**
 * 카테고리 트리 조회
 * GET ?action=getCategories&product_id=xxx
 */
function handleGetCategories(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var categories = findRowsByColumn('Categories', 'product_id', productId);

  // 트리 구조로 변환
  var tree = buildCategoryTree(categories);
  return { success: true, categories: tree, flat: categories };
}

/**
 * 카테고리를 트리 구조로 변환
 */
function buildCategoryTree(categories) {
  var map = {};
  var roots = [];

  // 먼저 모든 카테고리를 맵에 등록
  categories.forEach(function(cat) {
    cat.children = [];
    map[cat.category_id] = cat;
  });

  // 부모-자식 관계 설정
  categories.forEach(function(cat) {
    if (cat.parent_id && map[cat.parent_id]) {
      map[cat.parent_id].children.push(cat);
    } else {
      roots.push(cat);
    }
  });

  // sort_order로 정렬
  var sortByOrder = function(a, b) {
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  };
  roots.sort(sortByOrder);
  for (var id in map) {
    map[id].children.sort(sortByOrder);
  }

  return roots;
}

/**
 * 질문 목록 조회 (정렬/필터/페이징)
 * GET ?action=getQuestions&product_id=xxx&category_id=yyy&sort=click_count&order=desc&page=1
 */
function handleGetQuestions(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var categoryId = params.category_id || null;
  var sortBy = params.sort || 'created_at';
  var order = params.order || 'desc';
  var page = parseInt(params.page) || 1;
  var perPage = parseInt(params.per_page) || parseInt(getSetting('items_per_page')) || 10;

  // 해당 제품의 질문 가져오기
  var questions = findRows('Questions', function(row) {
    var matchProduct = String(row.product_id) === String(productId);
    var matchCategory = !categoryId || String(row.category_id) === String(categoryId);
    var matchStatus = row.status !== 'hidden';
    return matchProduct && matchCategory && matchStatus;
  });

  // 하위 카테고리 질문도 포함
  if (categoryId) {
    var allCategories = findRowsByColumn('Categories', 'product_id', productId);
    var childIds = getDescendantCategoryIds(categoryId, allCategories);
    childIds.push(categoryId);

    questions = findRows('Questions', function(row) {
      var matchProduct = String(row.product_id) === String(productId);
      var matchCategory = childIds.indexOf(String(row.category_id)) !== -1;
      var matchStatus = row.status !== 'hidden';
      return matchProduct && matchCategory && matchStatus;
    });
  }

  // 정렬
  questions.sort(function(a, b) {
    var valA, valB;
    if (sortBy === 'created_at') {
      valA = new Date(a.created_at).getTime();
      valB = new Date(b.created_at).getTime();
    } else {
      valA = Number(a[sortBy]) || 0;
      valB = Number(b[sortBy]) || 0;
    }
    return order === 'asc' ? valA - valB : valB - valA;
  });

  // 페이징
  var totalCount = questions.length;
  var totalPages = Math.ceil(totalCount / perPage);
  var startIndex = (page - 1) * perPage;
  var pagedQuestions = questions.slice(startIndex, startIndex + perPage);

  // 카테고리 이름 매핑
  var allCats = findRowsByColumn('Categories', 'product_id', productId);
  var catMap = {};
  allCats.forEach(function(c) { catMap[c.category_id] = c; });

  pagedQuestions = pagedQuestions.map(function(q) {
    q.category_name = catMap[q.category_id] ? catMap[q.category_id].name : '';
    q.category_path = getCategoryPath(q.category_id, catMap);
    return q;
  });

  return {
    success: true,
    questions: pagedQuestions,
    pagination: {
      page: page,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages
    }
  };
}

/**
 * 카테고리 경로 문자열 생성 (예: "배송/교환 > 교환절차")
 */
function getCategoryPath(categoryId, catMap) {
  var path = [];
  var current = catMap[categoryId];
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? catMap[current.parent_id] : null;
  }
  return path.join(' > ');
}

/**
 * 특정 카테고리의 모든 하위 카테고리 ID 수집
 */
function getDescendantCategoryIds(parentId, allCategories) {
  var children = allCategories.filter(function(c) {
    return String(c.parent_id) === String(parentId);
  });
  var ids = [];
  children.forEach(function(child) {
    ids.push(String(child.category_id));
    ids = ids.concat(getDescendantCategoryIds(child.category_id, allCategories));
  });
  return ids;
}

/**
 * 질문 상세 조회 + 클릭 카운트 증가
 * GET ?action=getQuestionDetail&question_id=xxx&session_id=yyy
 */
function handleGetQuestionDetail(params) {
  var questionId = params.question_id;
  if (!questionId) return { error: 'question_id 필수' };

  var questions = findRowsByColumn('Questions', 'question_id', questionId);
  if (questions.length === 0) return { error: '질문을 찾을 수 없습니다' };

  var question = questions[0];

  // 클릭 카운트 증가
  incrementCell('Questions', 'question_id', questionId, 'click_count', 1);
  question.click_count = (Number(question.click_count) || 0) + 1;

  // 클릭 로그 기록
  if (params.session_id) {
    addRow('ClickLog', {
      question_id: questionId,
      session_id: params.session_id,
      clicked_at: new Date().toISOString()
    }, 'log_id');
  }

  return { success: true, question: question };
}

/**
 * 제품 QnA 요약 통계
 * GET ?action=getSummary&product_id=xxx
 */
function handleGetSummary(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var questions = findRowsByColumn('Questions', 'product_id', productId);
  var categories = findRowsByColumn('Categories', 'product_id', productId);

  // 전체 통계
  var totalQuestions = questions.length;
  var totalClicks = 0;

  questions.forEach(function(q) {
    totalClicks += Number(q.click_count) || 0;
  });

  // 카테고리별 통계
  var categoryStats = {};
  categories.forEach(function(cat) {
    categoryStats[cat.category_id] = {
      category_id: cat.category_id,
      name: cat.name,
      level: cat.level,
      question_count: 0,
      click_count: 0
    };
  });

  questions.forEach(function(q) {
    var catId = q.category_id;
    if (categoryStats[catId]) {
      categoryStats[catId].question_count++;
      categoryStats[catId].click_count += Number(q.click_count) || 0;
    }
  });

  // 상위 질문 (클릭수 기준 Top 5)
  var topQuestions = questions
    .sort(function(a, b) {
      return (Number(b.click_count) || 0) - (Number(a.click_count) || 0);
    })
    .slice(0, 5);

  return {
    success: true,
    summary: {
      total_questions: totalQuestions,
      total_clicks: totalClicks,
      category_stats: Object.values(categoryStats),
      top_questions: topQuestions
    }
  };
}

// ============================================
// POST 핸들러
// ============================================

/**
 * 새 질문 등록
 * POST { action: "submitQuestion", product_id, category_id, question_text, author_name }
 */
function handleSubmitQuestion(body) {
  if (!body.product_id || !body.question_text) {
    return { error: 'product_id와 question_text는 필수입니다' };
  }

  var questionId = addRow('Questions', {
    product_id: body.product_id,
    category_id: body.category_id || '',
    question_text: body.question_text,
    answer_text: '',
    author_name: body.author_name || '익명',
    created_at: new Date().toISOString(),
    status: 'pending',
    click_count: 0
  }, 'question_id');

  return { success: true, question_id: questionId, message: '질문이 등록되었습니다' };
}

/**
 * 클릭 추적
 * POST { action: "trackClick", question_id, session_id }
 */
function handleTrackClick(body) {
  var questionId = body.question_id;
  if (!questionId) return { error: 'question_id 필수' };

  incrementCell('Questions', 'question_id', questionId, 'click_count', 1);

  addRow('ClickLog', {
    question_id: questionId,
    session_id: body.session_id || '',
    member_id: body.member_id || '',
    clicked_at: new Date().toISOString()
  }, 'log_id');

  return { success: true };
}

/**
 * 카테고리 추가 (관리자용)
 * POST { action: "addCategory", product_id, name, parent_id, level, sort_order }
 */
function handleAddCategory(body) {
  if (!body.product_id || !body.name) {
    return { error: 'product_id와 name은 필수입니다' };
  }

  var categoryId = addRow('Categories', {
    product_id: body.product_id,
    parent_id: body.parent_id || '',
    level: body.level || 1,
    name: body.name,
    sort_order: body.sort_order || 0
  }, 'category_id');

  return { success: true, category_id: categoryId };
}

/**
 * 질문에 답변 등록 (관리자용)
 * POST { action: "answerQuestion", question_id, answer_text }
 */
function handleAnswerQuestion(body) {
  if (!body.question_id || !body.answer_text) {
    return { error: 'question_id와 answer_text는 필수입니다' };
  }

  var updated = updateRow('Questions', 'question_id', body.question_id, {
    answer_text: body.answer_text,
    status: 'answered'
  });

  if (!updated) return { error: '질문을 찾을 수 없습니다' };
  return { success: true, message: '답변이 등록되었습니다' };
}

// ============================================
// 유형별 고유 클릭자 통계
// ============================================

/**
 * 질문유형별 고유 클릭자/질문자 수 반환
 * GET ?action=getTypeStats&product_id=xxx
 */
function handleGetTypeStats(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var questions = findRowsByColumn('Questions', 'product_id', productId);
  var categories = findRowsByColumn('Categories', 'product_id', productId);

  // 카테고리 맵
  var catMap = {};
  categories.forEach(function(c) { catMap[c.category_id] = c; });

  // category_id → level1 부모 찾기
  function getLevel1Parent(catId) {
    var current = catMap[catId];
    while (current) {
      if (Number(current.level) === 1) return current.category_id;
      current = current.parent_id ? catMap[current.parent_id] : null;
    }
    return catId;
  }

  // category_id → level2 부모 찾기
  function getLevel2Parent(catId) {
    var current = catMap[catId];
    if (!current) return null;
    if (Number(current.level) === 2) return current.category_id;
    while (current && Number(current.level) > 2) {
      current = current.parent_id ? catMap[current.parent_id] : null;
    }
    return current && Number(current.level) === 2 ? current.category_id : null;
  }

  // question → level1, level2, category_id 매핑
  var questionToLevel1 = {};
  var questionToLevel2 = {};
  var questionToCat = {};
  questions.forEach(function(q) {
    questionToLevel1[q.question_id] = getLevel1Parent(q.category_id);
    questionToLevel2[q.question_id] = getLevel2Parent(q.category_id);
    questionToCat[q.question_id] = q.category_id;
  });

  // ClickLog에서 고유 member_id 집계 (유형/세부유형/질문별)
  var clickLogs = getAllRows('ClickLog');
  var clickersPerType = {};
  var clickersPerSubType = {};
  var clickersPerQuestion = {};
  var allClickers = {};

  clickLogs.forEach(function(log) {
    var memberId = log.member_id;
    if (!memberId) return;

    var level1Id = questionToLevel1[log.question_id];
    if (!level1Id) return;

    // level-1 유형별
    if (!clickersPerType[level1Id]) clickersPerType[level1Id] = {};
    clickersPerType[level1Id][memberId] = true;
    allClickers[memberId] = true;

    // level-2 세부유형별
    var level2Id = questionToLevel2[log.question_id];
    if (level2Id) {
      if (!clickersPerSubType[level2Id]) clickersPerSubType[level2Id] = {};
      clickersPerSubType[level2Id][memberId] = true;
    }

    // 개별 질문별
    var qId = log.question_id;
    if (!clickersPerQuestion[qId]) clickersPerQuestion[qId] = {};
    clickersPerQuestion[qId][memberId] = true;
  });

  // level1별 고유 질문자 수 (author_name 기반)
  var questionersPerType = {};
  questions.forEach(function(q) {
    var level1Id = getLevel1Parent(q.category_id);
    if (!questionersPerType[level1Id]) questionersPerType[level1Id] = {};
    questionersPerType[level1Id][q.author_name || 'anonymous'] = true;
  });

  var level1Cats = categories.filter(function(c) { return Number(c.level) === 1; });
  var typeStats = {};
  level1Cats.forEach(function(cat) {
    var catId = cat.category_id;
    typeStats[catId] = {
      unique_clickers: clickersPerType[catId] ? Object.keys(clickersPerType[catId]).length : 0,
      unique_questioners: questionersPerType[catId] ? Object.keys(questionersPerType[catId]).length : 0
    };
  });

  // level2별 고유 클릭자 수
  var level2Cats = categories.filter(function(c) { return Number(c.level) === 2; });
  var subTypeStats = {};
  level2Cats.forEach(function(cat) {
    var catId = cat.category_id;
    subTypeStats[catId] = {
      unique_clickers: clickersPerSubType[catId] ? Object.keys(clickersPerSubType[catId]).length : 0
    };
  });

  // 개별 질문별 고유 클릭자 수
  var questionClickerCounts = {};
  questions.forEach(function(q) {
    questionClickerCounts[q.question_id] = clickersPerQuestion[q.question_id]
      ? Object.keys(clickersPerQuestion[q.question_id]).length : 0;
  });

  return {
    success: true,
    total_unique_clickers: Object.keys(allClickers).length,
    type_stats: typeStats,
    sub_type_stats: subTypeStats,
    question_clickers: questionClickerCounts
  };
}
