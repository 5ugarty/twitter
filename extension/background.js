const FILE_NAME = "tweet-archive.json";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveTweet") {
    saveTweetToGist(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.action === "deleteTweet") {
    deleteTweetFromGist(message.id)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

async function getSettings() {
  const { githubToken, gistId } = await chrome.storage.sync.get([
    "githubToken",
    "gistId",
  ]);
  return { githubToken, gistId };
}

async function fetchGistData(githubToken, gistId) {
  const getRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!getRes.ok) {
    throw new Error(`Gist를 불러오지 못했습니다 (HTTP ${getRes.status})`);
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
  return data;
}

async function writeGistData(githubToken, gistId, data) {
  const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      files: { [FILE_NAME]: { content: JSON.stringify(data, null, 2) } },
    }),
  });
  if (!patchRes.ok) {
    throw new Error(`Gist 저장에 실패했습니다 (HTTP ${patchRes.status})`);
  }
}

async function saveTweetToGist(tweetPayload) {
  const { githubToken, gistId } = await getSettings();

  if (!githubToken || !gistId) {
    const msg =
      "GitHub 토큰 또는 Gist ID가 설정되지 않았습니다. 확장 프로그램 아이콘을 눌러 설정해주세요.";
    console.warn("[트윗 아카이버]", msg);
    return { ok: false, error: msg };
  }

  let data;
  try {
    data = await fetchGistData(githubToken, gistId);
  } catch (err) {
    console.error("[트윗 아카이버]", err.message);
    return { ok: false, error: err.message };
  }

  const exists = data.items.some((item) => item.id === tweetPayload.id);
  if (exists) {
    return { ok: true, skipped: true };
  }

  // 아이디(작성자 핸들)별로 자동 분류
  data.items.unshift({
    ...tweetPayload,
    folder: tweetPayload.handle || null,
    tags: [],
    archivedAt: tweetPayload.handle ? new Date().toISOString() : null,
  });

  try {
    await writeGistData(githubToken, gistId, data);
  } catch (err) {
    console.error("[트윗 아카이버]", err.message);
    return { ok: false, error: err.message };
  }

  return { ok: true, skipped: false };
}

async function deleteTweetFromGist(id) {
  const { githubToken, gistId } = await getSettings();

  if (!githubToken || !gistId) {
    return { ok: false, error: "GitHub 토큰/Gist ID가 설정되지 않았습니다." };
  }

  let data;
  try {
    data = await fetchGistData(githubToken, gistId);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const before = data.items.length;
  data.items = data.items.filter((item) => item.id !== id);

  if (data.items.length === before) {
    return { ok: true, notFound: true };
  }

  try {
    await writeGistData(githubToken, gistId, data);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return { ok: true };
}
