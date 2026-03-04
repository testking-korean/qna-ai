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
 * 유형 목록 조회 (Questions 시트에서 직접 추출)
 * GET ?action=getCategories&product_id=xxx
 *
 * 기존 Categories 시트 대신 Questions의 질문유형/질문세부유형 컬럼에서 동적 생성
 */
function handleGetCategories(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var questions = findRowsByColumn('Questions', '제품ID', productId);

  // 질문유형 → 질문세부유형 맵 구축
  var typeMap = {};       // { '배송/교환': { subTypes: { '교환절차': true, ... }, sort: 1 } }
  var typeOrder = [];
  questions.forEach(function(q) {
    var typeName = q['질문유형'] || '';
    var subTypeName = q['질문세부유형'] || '';
    if (!typeName) return;
    if (!typeMap[typeName]) {
      typeMap[typeName] = { subTypes: {}, sort: typeOrder.length + 1 };
      typeOrder.push(typeName);
    }
    if (subTypeName) {
      typeMap[typeName].subTypes[subTypeName] = true;
    }
  });

  // flat 배열 + 트리 구성
  var flat = [];
  var tree = [];
  typeOrder.forEach(function(typeName, idx) {
    var typeId = 'TYPE_' + (idx + 1);
    var typeObj = {
      category_id: typeId,
      parent_id: '',
      level: 1,
      name: typeName,
      product_id: productId,
      sort_order: idx + 1,
      children: []
    };
    flat.push({
      category_id: typeId, parent_id: '', level: 1,
      name: typeName, product_id: productId, sort_order: idx + 1
    });

    var subNames = Object.keys(typeMap[typeName].subTypes);
    subNames.sort();
    subNames.forEach(function(subName, sIdx) {
      var subId = typeId + '_' + (sIdx + 1);
      var subObj = {
        category_id: subId, parent_id: typeId, level: 2,
        name: subName, product_id: productId, sort_order: sIdx + 1
      };
      typeObj.children.push(subObj);
      flat.push(subObj);
    });

    tree.push(typeObj);
  });

  return { success: true, categories: tree, flat: flat };
}

/**
 * 질문 목록 조회 (정렬/필터/페이징)
 * GET ?action=getQuestions&product_id=xxx&type=질문유형&sub_type=질문세부유형&sort=클릭수&order=desc&page=1
 */
function handleGetQuestions(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var typeName = params.type || null;
  var subTypeName = params.sub_type || null;
  var sortBy = params.sort || '작성일';
  var order = params.order || 'desc';
  var page = parseInt(params.page) || 1;
  var perPage = parseInt(params.per_page) || parseInt(getSetting('items_per_page')) || 10;

  // 해당 제품의 질문 가져오기
  var questions = findRows('Questions', function(row) {
    var matchProduct = String(row['제품ID']) === String(productId);
    var matchType = !typeName || String(row['질문유형']) === String(typeName);
    var matchSubType = !subTypeName || String(row['질문세부유형']) === String(subTypeName);
    var matchStatus = row['상태'] !== 'hidden';
    return matchProduct && matchType && matchSubType && matchStatus;
  });

  // 정렬
  questions.sort(function(a, b) {
    var valA, valB;
    if (sortBy === '작성일') {
      valA = new Date(a['작성일']).getTime();
      valB = new Date(b['작성일']).getTime();
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

  // 위젯 호환 키 매핑
  pagedQuestions = pagedQuestions.map(function(q) {
    return mapQuestionToApi(q);
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
 * Questions 시트의 한글 컬럼을 위젯 API 호환 키로 매핑
 */
function mapQuestionToApi(q) {
  return {
    question_id: q['질문ID'],
    product_id: q['제품ID'],
    type_name: q['질문유형'],
    sub_type_name: q['질문세부유형'],
    group_name: q['대표질문그룹'],
    question_text: q['질문내용'],
    answer_text: q['답변내용'],
    author_name: q['작성자'],
    created_at: q['작성일'],
    status: q['상태'],
    click_count: Number(q['클릭수']) || 0,
    related_count: Number(q['관련질문수']) || 0
  };
}


/**
 * 질문 상세 조회 + 클릭 카운트 증가
 * GET ?action=getQuestionDetail&question_id=xxx&session_id=yyy
 */
function handleGetQuestionDetail(params) {
  var questionId = params.question_id;
  if (!questionId) return { error: 'question_id 필수' };

  var questions = findRowsByColumn('Questions', '질문ID', questionId);
  if (questions.length === 0) return { error: '질문을 찾을 수 없습니다' };

  var question = questions[0];

  // 클릭 카운트 증가
  incrementCell('Questions', '질문ID', questionId, '클릭수', 1);
  question['클릭수'] = (Number(question['클릭수']) || 0) + 1;

  return { success: true, question: mapQuestionToApi(question) };
}

/**
 * 제품 QnA 요약 통계
 * GET ?action=getSummary&product_id=xxx
 */
function handleGetSummary(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var questions = findRowsByColumn('Questions', '제품ID', productId);

  // 전체 통계
  var totalQuestions = questions.length;
  var totalClicks = 0;

  questions.forEach(function(q) {
    totalClicks += Number(q['클릭수']) || 0;
  });

  // 질문유형별 통계
  var typeStats = {};
  questions.forEach(function(q) {
    var typeName = q['질문유형'] || '미분류';
    if (!typeStats[typeName]) {
      typeStats[typeName] = { name: typeName, question_count: 0, click_count: 0 };
    }
    typeStats[typeName].question_count++;
    typeStats[typeName].click_count += Number(q['클릭수']) || 0;
  });

  // 상위 질문 (클릭수 기준 Top 5)
  var topQuestions = questions
    .sort(function(a, b) {
      return (Number(b['클릭수']) || 0) - (Number(a['클릭수']) || 0);
    })
    .slice(0, 5);

  return {
    success: true,
    summary: {
      total_questions: totalQuestions,
      total_clicks: totalClicks,
      type_stats: Object.values(typeStats),
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
    '제품ID': body.product_id,
    '질문유형': body.type || '',
    '질문세부유형': body.sub_type || '',
    '대표질문그룹': '',
    '질문내용': body.question_text,
    '답변내용': '',
    '작성자': body.author_name || '익명',
    '작성일': new Date().toISOString(),
    '상태': 'pending',
    '클릭수': 0,
    '관련질문수': 0
  }, '질문ID');

  return { success: true, question_id: questionId, message: '질문이 등록되었습니다' };
}

/**
 * 클릭 추적
 * POST { action: "trackClick", question_id, session_id }
 */
function handleTrackClick(body) {
  var questionId = body.question_id;
  if (!questionId) return { error: 'question_id 필수' };

  var newCount = incrementCell('Questions', '질문ID', questionId, '클릭수', 1);

  return { success: true, click_count: newCount };
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

  var updated = updateRow('Questions', '질문ID', body.question_id, {
    '답변내용': body.answer_text,
    '상태': 'answered'
  });

  if (!updated) return { error: '질문을 찾을 수 없습니다' };
  return { success: true, message: '답변이 등록되었습니다' };
}

// ============================================
// 유형별 고유 클릭자 통계
// ============================================

/**
 * 질문유형별 클릭/질문 통계 반환
 * GET ?action=getTypeStats&product_id=xxx
 *
 * ClickLog 없이 Questions 시트의 클릭수 컬럼만으로 집계
 */
function handleGetTypeStats(params) {
  var productId = params.product_id;
  if (!productId) return { error: 'product_id 필수' };

  var questions = findRowsByColumn('Questions', '제품ID', productId);

  var totalClicks = 0;
  var typeStats = {};
  var subTypeStats = {};
  var questionClicks = {};

  questions.forEach(function(q) {
    var typeName = q['질문유형'] || '';
    var subTypeName = q['질문세부유형'] || '';
    var clicks = Number(q['클릭수']) || 0;
    var author = q['작성자'] || 'anonymous';

    totalClicks += clicks;
    questionClicks[q['질문ID']] = clicks;

    // 질문유형별 집계
    if (typeName) {
      if (!typeStats[typeName]) {
        typeStats[typeName] = { total_clicks: 0, question_count: 0, questioners: {} };
      }
      typeStats[typeName].total_clicks += clicks;
      typeStats[typeName].question_count++;
      typeStats[typeName].questioners[author] = true;
    }

    // 질문세부유형별 집계
    if (subTypeName) {
      if (!subTypeStats[subTypeName]) {
        subTypeStats[subTypeName] = { total_clicks: 0, question_count: 0 };
      }
      subTypeStats[subTypeName].total_clicks += clicks;
      subTypeStats[subTypeName].question_count++;
    }
  });

  // 최종 형태로 변환
  var typeResult = {};
  Object.keys(typeStats).forEach(function(name) {
    typeResult[name] = {
      total_clicks: typeStats[name].total_clicks,
      question_count: typeStats[name].question_count,
      unique_questioners: Object.keys(typeStats[name].questioners).length
    };
  });

  var subTypeResult = {};
  Object.keys(subTypeStats).forEach(function(name) {
    subTypeResult[name] = {
      total_clicks: subTypeStats[name].total_clicks,
      question_count: subTypeStats[name].question_count
    };
  });

  return {
    success: true,
    total_clicks: totalClicks,
    type_stats: typeResult,
    sub_type_stats: subTypeResult,
    question_clicks: questionClicks
  };
}
