document.addEventListener("DOMContentLoaded", async () => {
  const { githubToken, gistId } = await chrome.storage.sync.get([
    "githubToken",
    "gistId",
  ]);
  if (githubToken) document.getElementById("token").value = githubToken;
  if (gistId) document.getElementById("gistId").value = gistId;
});

document.getElementById("save").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  const gistId = document.getElementById("gistId").value.trim();

  await chrome.storage.sync.set({ githubToken: token, gistId });

  const status = document.getElementById("status");
  status.textContent = "저장되었습니다.";
  setTimeout(() => (status.textContent = ""), 2000);
});
