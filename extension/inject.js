(function () {
  if (window.__tweetArchiverInjected) return;
  window.__tweetArchiverInjected = true;

  const originalFetch = window.fetch;

  function extractPayload(tweetResult) {
    const legacy = tweetResult.legacy || {};
    const userLegacy = tweetResult.core?.user_results?.result?.legacy || {};

    const handle = userLegacy.screen_name || "";
    const id = tweetResult.rest_id;
    const isQuote = !!(legacy.is_quote_status || legacy.quoted_status_permalink);

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

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req?.url;

      if (url && /\/graphql\//i.test(url)) {
        // 디버그: 트윗 작성/편집과 관련되어 보이는 모든 GraphQL 호출의 operation 이름을 콘솔에 남김
        const opMatch = url.match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
        const opName = opMatch ? opMatch[1] : "(알 수 없음)";
        if (/tweet/i.test(opName)) {
          console.log("[트윗 아카이버 디버그] GraphQL 호출 감지:", opName, url);
        }

        // 트윗 생성으로 추정되는 operation은 폭넓게 매칭 (X가 이름을 바꿔도 대응)
        if (/^CreateTweet$|^CreateScheduledTweet$|^CreateNoteTweet$/i.test(opName)) {
          response
            .clone()
            .json()
            .then((data) => {
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
            })
            .catch((err) => {
              console.warn("[트윗 아카이버 디버그] 응답 파싱 실패:", err);
            });
        }
      }
    } catch (e) {
      console.warn("[트윗 아카이버 디버그] 가로채기 중 에러:", e);
    }

    return response;
  };

  console.log("[트윗 아카이버 디버그] inject.js 로드됨 — fetch 가로채기 활성화");
})();
