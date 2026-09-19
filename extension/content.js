// 1) inject.js를 페이지 컨텍스트에 삽입 (fetch 가로채기 위함)
(function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();

// 2) inject.js가 postMessage로 보낸 캡처 데이터를 받아서 background로 전달
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "TWEET_ARCHIVER_CAPTURED") return;
  chrome.runtime.sendMessage({ action: "saveTweet", payload: event.data.payload }, (response) => {
    if (!response?.ok) {
      console.warn("[트윗 아카이버] 자동 캡처 저장 실패:", response?.error);
    }
  });
});

// 3) 트윗마다 추가/취소 토글 버튼을 삽입 (본인 트윗도 상태 확인/취소용으로 동일하게 붙음)
function addManualButtons() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
    if (article.dataset.archiverInjected) return;

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) return;

    article.dataset.archiverInjected = "true";

    const btn = document.createElement("span");
    btn.textContent = "＋";
    btn.title = "트윗 아카이버에 추가";
    btn.dataset.saved = "false";
    btn.style.cssText =
      "cursor:pointer;padding:0 10px;color:rgb(83,100,113);font-size:16px;font-weight:bold;user-select:none;";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const payload = buildManualPayload(article);
      if (!payload) {
        alert("트윗 정보를 읽어오지 못했어요. 새로고침 후 다시 시도해주세요.");
        return;
      }

      if (btn.dataset.saved === "true") {
        // 이미 저장된 상태 → 다시 누르면 취소(삭제)
        btn.textContent = "…";
        chrome.runtime.sendMessage({ action: "deleteTweet", id: payload.id }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            btn.textContent = "!";
            btn.style.color = "rgb(200,50,50)";
            btn.title = "취소 실패: " + (response?.error || "확장 프로그램을 새로고침 해보세요");
            return;
          }
          btn.textContent = "＋";
          btn.style.color = "rgb(83,100,113)";
          btn.dataset.saved = "false";
          btn.title = "트윗 아카이버에 추가";
        });
        return;
      }

      // 저장되지 않은 상태 → 추가
      btn.textContent = "…";
      btn.style.color = "rgb(83,100,113)";

      chrome.runtime.sendMessage({ action: "saveTweet", payload }, (response) => {
        if (chrome.runtime.lastError) {
          btn.textContent = "!";
          btn.style.color = "rgb(200,50,50)";
          btn.title = "저장 실패: 페이지를 새로고침한 뒤 다시 시도해주세요";
          return;
        }

        if (response?.ok) {
          btn.textContent = "✓";
          btn.style.color = "rgb(0,150,90)";
          btn.dataset.saved = "true";
          btn.title = "아카이브됨 (다시 누르면 취소)";
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

function buildManualPayload(article) {
  // 트윗 본문에 다른 트윗 링크가 텍스트로 포함되어 있으면 그게 먼저 매칭되는 문제를 피하기 위해
  // "이 트윗 자체의 타임스탬프를 감싸는 링크"를 우선적으로 찾는다 (X의 표준 마크업)
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
