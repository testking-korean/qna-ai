/**
 * GeminiService.gs
 * Gemini Flash API 연동
 * - 유사 질문 검색 (semantic search)
 * - AI 상담사 (챗봇)
 */

// ============================================
// Gemini API 호출
// ============================================

/**
 * Gemini API Key 가져오기 (Settings 시트에서)
 */
function getGeminiApiKey() {
  return getSetting('gemini_api_key') || '';
}

/**
 * Gemini Flash API 호출
 */
function callGemini(prompt, systemInstruction) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API Key가 설정되지 않았습니다. Settings 시트에 gemini_api_key를 추가해주세요.');
  }

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  var payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error('Gemini API 오류: ' + json.error.message);
  }

  if (!json.candidates || !json.candidates[0]) {
    throw new Error('Gemini 응답이 비어있습니다.');
  }

  return json.candidates[0].content.parts[0].text;
}

// ============================================
// 유사 질문 검색
// ============================================

/**
 * 사용자 질문에 대해 기존 Q&A에서 유사한 것을 찾아 반환
 * params: { product_id, query }
 */
function handleSearchQuestions(params) {
  var productId = params.product_id;
  var query = params.query;
  if (!productId || !query) return { error: 'product_id와 query는 필수입니다' };

  var questions = findRows('Questions', function(row) {
    return String(row['제품ID']) === String(productId) && row['상태'] !== 'hidden';
  });

  if (questions.length === 0) {
    return { success: true, results: [], message: '등록된 질문이 없습니다.' };
  }

  // 질문 목록을 텍스트로 구성
  var qList = questions.map(function(q, i) {
    return 'ID:' + q['질문ID'] + ' Q:' + q['질문내용'];
  }).join('\n');

  var systemPrompt = '당신은 Q&A 검색 도우미입니다. 사용자의 질문과 가장 유사한 기존 질문을 찾아주세요.\n' +
    '반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.\n' +
    '유사도가 50% 이상인 것만 포함하고, 최대 5개까지 반환하세요.\n' +
    '[{"question_id":"ID값","score":유사도(0~100)}]';

  var prompt = '기존 질문 목록:\n' + qList + '\n\n사용자 질문: ' + query;

  try {
    var raw = callGemini(prompt, systemPrompt);

    // JSON 파싱 (마크다운 코드블록 제거)
    var cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var matches = JSON.parse(cleaned);

    // score 내림차순 정렬
    matches.sort(function(a, b) { return b.score - a.score; });

    // question_id로 실제 데이터 매핑
    var qMap = {};
    questions.forEach(function(q) { qMap[q['질문ID']] = q; });

    var results = [];
    matches.forEach(function(m) {
      var q = qMap[m.question_id];
      if (q) {
        results.push({
          question_id: q['질문ID'],
          question_text: q['질문내용'],
          answer_text: q['답변내용'],
          type: q['질문유형'],
          sub_type: q['세부유형'],
          status: q['상태'],
          score: m.score,
          related_count: q['관련질문수'] || 1
        });
      }
    });

    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.message, results: [] };
  }
}

// ============================================
// AI 상담사 (챗봇)
// ============================================

/**
 * AI 상담사 응답 생성
 * body: { product_id, message, history(optional) }
 */
function handleAiChat(body) {
  var productId = body.product_id;
  var userMessage = body.message;
  if (!productId || !userMessage) return { error: 'product_id와 message는 필수입니다' };

  // 기존 Q&A 데이터 수집
  var questions = findRows('Questions', function(row) {
    return String(row['제품ID']) === String(productId) && row['상태'] === 'answered';
  });

  var qaContext = questions.map(function(q) {
    return 'Q: ' + q['질문내용'] + '\nA: ' + q['답변내용'];
  }).join('\n\n');

  // 제품 정보 수집
  var products = findRowsByColumn('Products', 'product_id', productId);
  var productInfo = products.length > 0 ? '제품명: ' + products[0].product_name : '';

  var systemPrompt = '당신은 쇼핑몰 제품 상담 AI입니다.\n' +
    '아래 제품 정보와 기존 Q&A를 참고하여 고객의 질문에 친절하고 정확하게 답변해주세요.\n' +
    '기존 Q&A에 없는 내용이라면 "정확한 답변을 위해 판매자에게 직접 문의해주세요."라고 안내하세요.\n' +
    '답변은 간결하게 2~3문장으로 해주세요.\n\n' +
    '제품 정보:\n' + productInfo + '\n\n' +
    '기존 Q&A:\n' + qaContext;

  // 대화 히스토리 구성
  var prompt = userMessage;
  if (body.history && body.history.length > 0) {
    var historyText = body.history.map(function(h) {
      return (h.role === 'user' ? '고객: ' : 'AI: ') + h.text;
    }).join('\n');
    prompt = historyText + '\n고객: ' + userMessage;
  }

  try {
    var answer = callGemini(prompt, systemPrompt);
    return { success: true, answer: answer.trim() };
  } catch (e) {
    return { success: false, error: e.message, answer: '죄송합니다. 일시적인 오류가 발생했습니다.' };
  }
}
