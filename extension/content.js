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

function refreshAllButtonStates() {
  document.querySelectorAll('[data-archiver-btn="true"]').forEach((btn) => {
    const id = btn.dataset.tweetId;
    if (!id) return;
    setButtonState(btn, archivedIdSet.has(id));
  });
}

function setButtonState(btn, saved) {
  btn.dataset.saved = saved ? "true" : "false";
  if (saved) {
    btn.textContent = "✓";
    btn.style.color = "rgb(0,150,90)";
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
      "cursor:pointer;padding:0 10px;font-size:16px;font-weight:bold;user-select:none;";

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

  const media = [];
  if (article.querySelector('[data-testid="tweetPhoto"]')) media.push("photo");
  if (article.querySelector("video") || article.querySelector('[data-testid="videoPlayer"]')) {
    media.push("video");
  }

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
