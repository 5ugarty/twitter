// inject.js는 이제 manifest.json에 의해 MAIN 월드 콘텐츠 스크립트로 직접 실행되므로
// 여기서 별도로 <script> 태그를 삽입할 필요가 없다.

// 확장 프로그램이 리로드된 뒤 이 탭을 새로고침하지 않으면 chrome.runtime 연결이 끊겨서
// "Cannot read properties of undefined (reading 'sendMessage')" 에러가 나는데,
// 이걸 안전하게 감지해서 사용자에게 알아볼 수 있는 안내로 바꿔준다.
let contextInvalidWarned = false;
function safeSendMessage(message, callback) {
  if (!chrome.runtime || !chrome.runtime.id) {
    if (!contextInvalidWarned) {
      contextInvalidWarned = true;
      console.warn("[트윗 아카이버] 확장 프로그램 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.");
    }
    if (callback) callback(null);
    return;
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        if (!contextInvalidWarned) {
          contextInvalidWarned = true;
          console.warn("[트윗 아카이버] 확장 프로그램 연결이 끊겼어요:", chrome.runtime.lastError.message);
        }
        if (callback) callback(null);
        return;
      }
      if (callback) callback(response);
    });
  } catch (e) {
    if (!contextInvalidWarned) {
      contextInvalidWarned = true;
      console.warn("[트윗 아카이버] 확장 프로그램 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.", e);
    }
    if (callback) callback(null);
  }
}

// 이미 아카이브된 트윗 id 캐시 (새로고침해도 체크 표시가 유지되도록)
let archivedIdSet = new Set();
let myHandles = [];

function loadArchivedIds() {
  safeSendMessage({ action: "getArchivedIds" }, (response) => {
    if (response?.ok) {
      archivedIdSet = new Set(response.ids);
      // 캐시가 로드된 뒤 이미 그려져 있던 버튼들 상태도 갱신
      refreshAllButtonStates();
    }
  });
}
loadArchivedIds();

function loadMyHandles() {
  safeSendMessage({ action: "getMyHandles" }, (response) => {
    if (response?.ok) myHandles = response.handles || [];
  });
}
loadMyHandles();

function refreshAllButtonStates() {
  document.querySelectorAll('[data-archiver-btn="true"]').forEach((btn) => {
    const id = btn.dataset.tweetId;
    if (!id) return;
    setButtonState(btn, archivedIdSet.has(id));
  });
}

const CHECK_SVG =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 5"></polyline></svg>';

function setButtonState(btn, saved) {
  btn.dataset.saved = saved ? "true" : "false";
  if (saved) {
    btn.innerHTML = CHECK_SVG;
    btn.style.color = "rgb(124,90,180)"; // 보라색
    btn.title = "아카이브됨 (다시 누르면 취소)";
  } else {
    btn.textContent = "＋";
    btn.style.color = "rgb(83,100,113)";
    btn.title = "트윗 아카이버에 추가";
  }
}

// inject.js가 postMessage로 보낸 캡처 데이터를 받아서 background로 전달
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "TWEET_ARCHIVER_CAPTURED") return;
  safeSendMessage({ action: "saveTweet", payload: event.data.payload }, (response) => {
    if (!response?.ok) {
      console.warn("[트윗 아카이버] 자동 캡처 저장 실패:", response?.error);
    } else {
      archivedIdSet.add(event.data.payload.id);
      refreshAllButtonStates();
    }
  });
});

// 트윗마다 추가/취소 토글 버튼을 삽입 (본인 트윗도 상태 확인/취소용으로 동일하게 붙음)
function addManualButtons() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
    if (article.dataset.archiverInjected) return;

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) return;

    const id = extractTweetId(article);
    if (!id) return; // 아직 링크를 못 읽어왔으면 다음 관찰 주기에 재시도

    article.dataset.archiverInjected = "true";

    const btn = document.createElement("span");
    btn.dataset.archiverBtn = "true";
    btn.dataset.tweetId = id;
    btn.style.cssText =
      "cursor:pointer;padding:0 10px;font-size:16px;font-weight:bold;user-select:none;display:inline-flex;align-items:center;justify-content:center;";

    setButtonState(btn, archivedIdSet.has(id)); // 캐시에 있으면 처음부터 ✓로 표시

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const payload = buildManualPayload(article);
      if (!payload) {
        alert("트윗 정보를 읽어오지 못했어요. 새로고침 후 다시 시도해주세요.");
        return;
      }

      if (btn.dataset.saved === "true") {
        btn.textContent = "…";
        safeSendMessage({ action: "deleteTweet", id: payload.id }, (response) => {
          if (!response) {
            btn.textContent = "!";
            btn.style.color = "rgb(200,50,50)";
            btn.title = "확장 프로그램 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.";
            alert("확장 프로그램이 업데이트되어 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.");
            return;
          }
          if (!response.ok) {
            btn.textContent = "!";
            btn.style.color = "rgb(200,50,50)";
            btn.title = "취소 실패: " + (response.error || "확장 프로그램을 새로고침 해보세요");
            return;
          }
          archivedIdSet.delete(payload.id);
          setButtonState(btn, false);
        });
        return;
      }

      btn.textContent = "…";
      btn.style.color = "rgb(83,100,113)";

      safeSendMessage({ action: "saveTweet", payload }, (response) => {
        if (!response) {
          btn.textContent = "!";
          btn.style.color = "rgb(200,50,50)";
          btn.title = "확장 프로그램 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.";
          alert("확장 프로그램이 업데이트되어 연결이 끊겼어요. 이 탭을 새로고침(또는 닫았다 다시 열기) 해주세요.");
          return;
        }

        if (response.ok) {
          archivedIdSet.add(payload.id);
          setButtonState(btn, true);
          if (response.skipped) btn.title = "이미 아카이브에 저장된 트윗입니다 (다시 누르면 취소)";
        } else {
          btn.textContent = "!";
          btn.style.color = "rgb(200,50,50)";
          btn.title =
            "저장 실패: 확장 프로그램 아이콘을 눌러 GitHub 토큰/Gist ID가 입력되어 있는지 확인해주세요";
        }
      });
    });

    actionBar.appendChild(btn);
  });
}

function extractTweetId(article) {
  const timeEl = article.querySelector("time");
  const permalinkAnchor = timeEl ? timeEl.closest('a[href*="/status/"]') : null;
  const fallbackAnchor = article.querySelector('a[href*="/status/"]');
  const anchor = permalinkAnchor || fallbackAnchor;
  const href = anchor ? anchor.getAttribute("href") : null;
  const match = href ? href.match(/^\/([^/]+)\/status\/(\d+)/) : null;
  return match ? match[2] : null;
}

function buildManualPayload(article) {
  const timeEl = article.querySelector("time");
  const permalinkAnchor = timeEl ? timeEl.closest('a[href*="/status/"]') : null;
  const fallbackAnchor = article.querySelector('a[href*="/status/"]');
  const anchor = permalinkAnchor || fallbackAnchor;

  const href = anchor ? anchor.getAttribute("href") : null;
  const match = href ? href.match(/^\/([^/]+)\/status\/(\d+)/) : null;

  if (!match) return null;

  const handle = match[1];
  const id = match[2];
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText : "";
  const createdAt = timeEl ? timeEl.getAttribute("datetime") : null;

  // 트위터는 사진+동영상을 한 트윗에 같이 붙일 수 있다(믹스드 미디어).
  // 다만 동영상 재생 전 썸네일 이미지에도 tweetPhoto 속성이 붙는 경우가 있어서,
  // "비디오 플레이어 컨테이너 안에 있는" photo 요소는 썸네일로 보고 제외한다.
  const videoContainer = article.querySelector(
    '[data-testid="videoPlayer"], [data-testid="videoComponent"], video'
  );
  const hasVideo = !!videoContainer;

  const photoEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"]'));
  const hasStandalonePhoto = photoEls.some(
    (el) => !videoContainer || !videoContainer.contains(el)
  );

  const media = [];
  if (hasStandalonePhoto) media.push("photo");
  if (hasVideo) media.push("video");

  return {
    id,
    handle,
    text,
    createdAt,
    url: `https://x.com/${handle}/status/${id}`,
    isQuote: false,
    quotedUrl: null,
    media,
    source: "manual",
    capturedAt: new Date().toISOString(),
  };
}

const observer = new MutationObserver(() => addManualButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", addManualButtons);
addManualButtons();

/* ---------- 화면에 로드된 내 트윗 일괄 가져오기 (폰 등 확장프로그램 없이 쓴 트윗 복구용) ---------- */

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    if (!chrome.runtime || !chrome.runtime.id) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function createBulkImportButton() {
  if (!document.body) return;
  if (document.getElementById("archiverBulkImportBtn")) return;

  const btn = document.createElement("button");
  btn.id = "archiverBulkImportBtn";
  btn.textContent = "📥 화면의 내 트윗 가져오기";
  btn.style.cssText = [
    "position:fixed", "right:20px", "bottom:20px", "z-index:9999",
    "background:#d874ae", "color:#fff", "border:none", "border-radius:999px",
    "padding:12px 18px", "font-size:13px", "font-weight:700", "cursor:pointer",
    "box-shadow:0 4px 12px rgba(0,0,0,0.25)",
  ].join(";");

  btn.addEventListener("click", async () => {
    if (!myHandles || myHandles.length === 0) {
      alert('먼저 확장 프로그램 아이콘 → "내 계정 목록"에 계정을 등록해주세요.');
      return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let found = 0;
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const id = extractTweetId(article);
      if (!id) continue;

      const payload = buildManualPayload(article);
      if (!payload || !myHandles.includes(payload.handle)) continue;

      found++;
      btn.textContent = `가져오는 중... (${found}개 확인, ${added}개 추가)`;

      if (archivedIdSet.has(id)) {
        skipped++;
        continue;
      }

      payload.source = "own"; // 실제 본인 트윗이므로 자동트윗과 동일하게 분류되도록

      const response = await sendMessagePromise({ action: "saveTweet", payload });
      if (response?.ok) {
        archivedIdSet.add(id);
        if (!response.skipped) added++;
        else skipped++;
      } else {
        failed++;
      }

      await new Promise((r) => setTimeout(r, 150)); // API 연타 방지
    }

    btn.disabled = false;
    btn.textContent = originalText;
    refreshAllButtonStates();

    alert(
      `화면에서 내 계정 트윗 ${found}개를 확인했어요.\n` +
      `새로 추가: ${added}개\n` +
      `이미 있었음: ${skipped}개` +
      (failed > 0 ? `\n실패: ${failed}개 (설정을 확인해주세요)` : '') +
      `\n\n더 가져오려면 타임라인을 스크롤해서 트윗을 더 불러온 뒤 다시 눌러주세요.`
    );
  });

  document.body.appendChild(btn);
}

createBulkImportButton();
setInterval(createBulkImportButton, 3000); // SPA 네비게이션으로 버튼이 사라지는 경우 대비
