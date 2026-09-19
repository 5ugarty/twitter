(function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "TWEET_ARCHIVER_CAPTURED") return;
  chrome.runtime.sendMessage({ action: "saveTweet", payload: event.data.payload });
});

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
      const ok = captureManualTweet(article);
      if (ok) {
        btn.textContent = "✓";
        btn.style.color = "rgb(0,150,90)";
      }
    });

    actionBar.appendChild(btn);
  });
}

function captureManualTweet(article) {
  const statusLink = article.querySelector('a[href*="/status/"]');
  const href = statusLink ? statusLink.getAttribute("href") : null;
  const match = href ? href.match(/^\/([^/]+)\/status\/(\d+)/) : null;

  if (!match) {
    alert("트윗 정보를 읽어오지 못했어요. 새로고침 후 다시 시도해주세요.");
    return false;
  }

  const handle = match[1];
  const id = match[2];
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText : "";
  const timeEl = article.querySelector("time");
  const createdAt = timeEl ? timeEl.getAttribute("datetime") : null;

  const payload = {
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

  chrome.runtime.sendMessage({ action: "saveTweet", payload });
  return true;
}

const observer = new MutationObserver(() => addManualButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", addManualButtons);
addManualButtons();
