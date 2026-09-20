(function () {
  if (window.__tweetArchiverInjected) return;
  window.__tweetArchiverInjected = true;

  function extractPayload(tweetResult) {
    const legacy = tweetResult.legacy || {};
    const userResult = tweetResult.core?.user_results?.result || {};

    // X가 유저 정보 일부를 legacy에서 core로 옮기는 구조 변경을 해서, 여러 경로를 다 시도
    const handle =
      userResult.legacy?.screen_name ||
      userResult.core?.screen_name ||
      userResult.screen_name ||
      "";

    if (!handle) {
      console.warn("[트윗 아카이버 디버그] 핸들을 못 찾았어요. userResult 구조:", userResult);
    }

    const id = tweetResult.rest_id;
    const isQuote = !!(legacy.is_quote_status || legacy.quoted_status_permalink);

    // API의 media type 필드는 원래부터 정확해서(사진+동영상 믹스드 미디어도 각각 올바르게 표시됨)
    // 별도 보정이 필요 없다.
    const mediaList = legacy.extended_entities?.media || legacy.entities?.media || [];
    const mediaTypes = [...new Set(mediaList.map((m) => m.type))];

    return {
      id,
      handle,
      text: legacy.full_text || "",
      createdAt: legacy.created_at || null,
      url: id && handle ? `https://x.com/${handle}/status/${id}` : null,
      isQuote,
      quotedUrl: legacy.quoted_status_permalink?.expanded || null,
      media: mediaTypes,
      source: isQuote ? "quote" : "own",
      capturedAt: new Date().toISOString(),
    };
  }

  function handleGraphQLJson(url, jsonText) {
    try {
      const opMatch = url.match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
      const opName = opMatch ? opMatch[1] : "(알 수 없음)";

      if (/tweet/i.test(opName)) {
        console.log("[트윗 아카이버 디버그] GraphQL 호출 감지:", opName, url);
      }

      if (!/^CreateTweet$|^CreateScheduledTweet$|^CreateNoteTweet$/i.test(opName)) return;

      const data = JSON.parse(jsonText);
      console.log("[트윗 아카이버 디버그]", opName, "응답:", data);

      const tweetResult =
        data?.data?.create_tweet?.tweet_results?.result ||
        data?.data?.notetweet_create?.tweet_results?.result ||
        data?.data?.tweet_create?.tweet_results?.result;

      if (!tweetResult) {
        console.warn("[트윗 아카이버 디버그] 응답 안에서 tweet_results를 못 찾았어요. 구조가 바뀐 것 같아요.");
        return;
      }

      const payload = extractPayload(tweetResult);
      window.postMessage({ type: "TWEET_ARCHIVER_CAPTURED", payload }, "*");
    } catch (err) {
      console.warn("[트윗 아카이버 디버그] 응답 처리 실패:", err);
    }
  }

  /* ---- fetch 가로채기 ---- */
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req?.url;
      if (url && /\/graphql\//i.test(url)) {
        response
          .clone()
          .text()
          .then((text) => handleGraphQLJson(url, text))
          .catch(() => {});
      }
    } catch (e) {
      console.warn("[트윗 아카이버 디버그] fetch 가로채기 중 에러:", e);
    }
    return response;
  };

  /* ---- XMLHttpRequest 가로채기 (fetch를 안 쓰는 경우 대비) ---- */
  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = "";

    const originalOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      requestUrl = url;
      return originalOpen.call(xhr, method, url, ...rest);
    };

    xhr.addEventListener("load", function () {
      try {
        if (requestUrl && /\/graphql\//i.test(requestUrl)) {
          handleGraphQLJson(requestUrl, xhr.responseText);
        }
      } catch (e) {
        console.warn("[트윗 아카이버 디버그] XHR 가로채기 중 에러:", e);
      }
    });

    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  console.log("[트윗 아카이버 디버그] inject.js 로드됨 (MAIN world) — fetch + XHR 가로채기 활성화");
})();
