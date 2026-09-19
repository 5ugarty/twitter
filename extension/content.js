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

// 3) 남의 트윗을 수동으로 추가할 수 있는 "＋" 버튼을 각 트윗에 삽입
function addManualButtons() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
    if (article.dataset.archiverInjected) return;

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) return;

    article.dataset.archiverInjected = "true";

    const btn = document.createElement("span");
    btn.textContent = "＋";
    btn.title = "트윗 아카이버에 수동으로 추가";
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
          btn.title = response.skipped
            ? "이미 아카이브에 저장된 트윗입니다"
            : "아카이브에 저장되었습니다";
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
  const statusLink = article.querySelector('a[href*="/status/"]');
  const href = statusLink ? statusLink.getAttribute("href") : null;
  const match = href ? href.match(/^\/([^/]+)\/status\/(\d+)/) : null;

  if (!match) return null;

  const handle = match[1];
  const id = match[2];
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText : "";
  const timeEl = article.querySelector("time");
  const createdAt = timeEl ? timeEl.getAttribute("datetime") : null;

  return {
    id,
    handle,
    text,
    createdAt,
    url: `https://x.com/${handle}/status/${id}`,
    isQuote: false,
    quotedUrl: null,
    source: "manual",
    capturedAt: new Date().toISOString(),
  };
}

const observer = new MutationObserver(() => addManualButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", addManualButtons);
addManualButtons();
