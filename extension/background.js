const FILE_NAME = "tweet-archive.json";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveTweet") {
    saveTweetToGist(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // 비동기 응답을 위해 채널 유지
  }
});

async function getSettings() {
  const { githubToken, gistId } = await chrome.storage.sync.get([
    "githubToken",
    "gistId",
  ]);
  return { githubToken, gistId };
}

async function saveTweetToGist(tweetPayload) {
  const { githubToken, gistId } = await getSettings();

  if (!githubToken || !gistId) {
    const msg =
      "GitHub 토큰 또는 Gist ID가 설정되지 않았습니다. 확장 프로그램 아이콘을 눌러 설정해주세요.";
    console.warn("[트윗 아카이버]", msg);
    return { ok: false, error: msg };
  }

  const getRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!getRes.ok) {
    const msg = `Gist를 불러오지 못했습니다 (HTTP ${getRes.status}). 토큰 권한이나 Gist ID를 확인해주세요.`;
    console.error("[트윗 아카이버]", msg);
    return { ok: false, error: msg };
  }

  const gist = await getRes.json();

  let data = { items: [] };
  try {
    const content = gist.files?.[FILE_NAME]?.content;
    if (content) data = JSON.parse(content);
  } catch (e) {
    data = { items: [] };
  }
  if (!Array.isArray(data.items)) data.items = [];

  const exists = data.items.some((item) => item.id === tweetPayload.id);
  if (exists) {
    return { ok: true, skipped: true };
  }

  data.items.unshift({
    ...tweetPayload,
    folder: null,
    tags: [],
    archivedAt: null,
  });

  const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      files: {
        [FILE_NAME]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });

  if (!patchRes.ok) {
    const msg = `Gist 저장에 실패했습니다 (HTTP ${patchRes.status}).`;
    console.error("[트윗 아카이버]", msg);
    return { ok: false, error: msg };
  }

  return { ok: true, skipped: false };
}
