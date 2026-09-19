(function () {
  if (window.__tweetArchiverInjected) return;
  window.__tweetArchiverInjected = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req?.url;

      if (url && /\/graphql\/[^/]+\/CreateTweet/i.test(url)) {
        response
          .clone()
          .json()
          .then((data) => {
            const tweetResult = data?.data?.create_tweet?.tweet_results?.result;
            if (!tweetResult) return;

            const legacy = tweetResult.legacy || {};
            const userLegacy =
              tweetResult.core?.user_results?.result?.legacy || {};

            const handle = userLegacy.screen_name || "";
            const id = tweetResult.rest_id;
            const isQuote = !!(
              legacy.is_quote_status || legacy.quoted_status_permalink
            );

            // 이미지/동영상 첨부 여부 추출
            const mediaList =
              legacy.extended_entities?.media || legacy.entities?.media || [];
            const mediaTypes = [...new Set(mediaList.map((m) => m.type))]; // 'photo' | 'video' | 'animated_gif'

            const payload = {
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

            window.postMessage(
              { type: "TWEET_ARCHIVER_CAPTURED", payload },
              "*"
            );
          })
          .catch(() => {});
      }
    } catch (e) {
      /* 무시 */
    }

    return response;
  };
})();
