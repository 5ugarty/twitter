function parseHandleList(raw) {
  return raw
    ? raw
        .split(/[,\n]/)
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean)
    : [];
}

function parseAccountFolderRules(raw) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const folder = line.slice(0, idx).trim();
      const handles = parseHandleList(line.slice(idx + 1));
      if (!folder || handles.length === 0) return null;
      return { folder, handles };
    })
    .filter(Boolean);
}

function formatAccountFolderRules(rules) {
  if (!Array.isArray(rules)) return "";
  return rules.map((r) => `${r.folder}: ${r.handles.join(", ")}`).join("\n");
}

document.addEventListener("DOMContentLoaded", async () => {
  const { githubToken, gistId, myHandles, accountFolderRules } = await chrome.storage.sync.get([
    "githubToken",
    "gistId",
    "myHandles",
    "accountFolderRules",
  ]);
  if (githubToken) document.getElementById("token").value = githubToken;
  if (gistId) document.getElementById("gistId").value = gistId;
  if (Array.isArray(myHandles)) document.getElementById("myHandles").value = myHandles.join(", ");
  if (Array.isArray(accountFolderRules)) {
    document.getElementById("accountFolderRules").value = formatAccountFolderRules(accountFolderRules);
  }
});

document.getElementById("save").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  const gistId = document.getElementById("gistId").value.trim();
  const myHandles = parseHandleList(document.getElementById("myHandles").value.trim());
  const accountFolderRules = parseAccountFolderRules(document.getElementById("accountFolderRules").value.trim());

  await chrome.storage.sync.set({
    githubToken: token,
    gistId,
    myHandles,
    accountFolderRules,
  });

  const status = document.getElementById("status");
  status.textContent = "저장되었습니다.";
  setTimeout(() => (status.textContent = ""), 2000);
});

document.getElementById("syncBtn").addEventListener("click", () => {
  const syncStatus = document.getElementById("syncStatus");
  syncStatus.textContent = "동기화 중...";
  chrome.runtime.sendMessage({ action: "refreshArchivedIds" }, (response) => {
    if (response?.ok) {
      syncStatus.textContent = `완료! 총 ${response.count}개 트윗 캐시됨.`;
    } else {
      syncStatus.textContent = "동기화 실패: " + (response?.error || "알 수 없는 오류");
    }
    setTimeout(() => (syncStatus.textContent = ""), 4000);
  });
});
