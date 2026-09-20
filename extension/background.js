const FILE_NAME = "tweet-archive.json";
const ID_CACHE_KEY = "archivedIdsCache"; // chrome.storage.local: 이미 저장된 트윗 id 배열 (빠른 조회용)

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
  if (message.action === "getArchivedIds") {
    getIdCache().then((ids) => sendResponse({ ok: true, ids }));
    return true;
  }
  if (message.action === "refreshArchivedIds") {
    refreshIdCacheFromGist()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

/* ---------- 로컬 ID 캐시 (체크 표시를 새로고침해도 유지하기 위함) ---------- */

async function getIdCache() {
  const { [ID_CACHE_KEY]: ids } = await chrome.storage.local.get(ID_CACHE_KEY);
  return Array.isArray(ids) ? ids : [];
}

async function addIdToCache(id) {
  const ids = await getIdCache();
  if (!ids.includes(id)) {
    ids.push(id);
    await chrome.storage.local.set({ [ID_CACHE_KEY]: ids });
  }
}

async function removeIdFromCache(id) {
  const ids = await getIdCache();
  const next = ids.filter((x) => x !== id);
  await chrome.storage.local.set({ [ID_CACHE_KEY]: next });
}

async function refreshIdCacheFromGist() {
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
  const ids = data.items.map((item) => item.id);
  await chrome.storage.local.set({ [ID_CACHE_KEY]: ids });
  return { ok: true, count: ids.length };
}

// 확장 프로그램이 켜지거나 설치/업데이트될 때 한 번 자동으로 캐시 최신화
chrome.runtime.onStartup.addListener(() => { refreshIdCacheFromGist().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { refreshIdCacheFromGist().catch(() => {}); });

async function getSettings() {
  const { githubToken, gistId, myHandles, accountFolderRules } = await chrome.storage.sync.get([
    "githubToken",
    "gistId",
    "myHandles",
    "accountFolderRules",
  ]);
  return {
    githubToken,
    gistId,
    myHandles: Array.isArray(myHandles) ? myHandles : [],
    accountFolderRules: Array.isArray(accountFolderRules) ? accountFolderRules : [],
  };
}

// 폴더 자동 분류 우선순위:
// 1) 자동 캡처(본인트윗/인용)는 항상 본인 계정이므로 핸들 이름 폴더
// 2) 수동추가인데 "내 계정 목록"에 있는 핸들 → 핸들 이름 폴더
// 3) 수동추가인데 "계정별 폴더 매핑"에 있는 핸들 → 매핑된 폴더
// 4) 그 외 수동추가 → 미분류 (null)
function resolveFolder(tweetPayload, myHandles, accountFolderRules) {
  const handle = tweetPayload.handle;
  if (!handle) return null;

  if (tweetPayload.source !== "manual") return handle;

  if (myHandles.includes(handle)) return handle;

  const mapped = accountFolderRules.find((rule) => rule.handles.includes(handle));
  if (mapped) return mapped.folder;

  return null;
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
  const { githubToken, gistId, myHandles, accountFolderRules } = await getSettings();

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
    await addIdToCache(tweetPayload.id);
    return { ok: true, skipped: true };
  }

  const autoFolder = resolveFolder(tweetPayload, myHandles, accountFolderRules);

  data.items.unshift({
    ...tweetPayload,
    folder: autoFolder,
    tags: [],
    archivedAt: autoFolder ? new Date().toISOString() : null,
  });

  try {
    await writeGistData(githubToken, gistId, data);
  } catch (err) {
    console.error("[트윗 아카이버]", err.message);
    return { ok: false, error: err.message };
  }

  await addIdToCache(tweetPayload.id);
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

  await removeIdFromCache(id);
  return { ok: true };
}
