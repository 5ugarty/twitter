let myHandles = [];
let accountFolderRules = []; // [{ folder, handles: [] }]
let credentialsReady = false;

function renderHandleList() {
  const list = document.getElementById('handleList');
  list.innerHTML = myHandles.map((h) => `
    <span class="chip">${h}<button data-handle="${h}" class="remove-handle-btn">✕</button></span>
  `).join('');
  list.querySelectorAll('.remove-handle-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      myHandles = myHandles.filter((h) => h !== btn.dataset.handle);
      renderHandleList();
      await persistConfig();
    });
  });
}

function renderRuleList() {
  const list = document.getElementById('ruleList');
  if (accountFolderRules.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = accountFolderRules.map((r, i) => `
    <div class="rule-row">
      <div><b>${r.folder}</b> ← ${r.handles.join(', ')}</div>
      <button data-idx="${i}" class="remove-rule-btn">삭제</button>
    </div>
  `).join('');
  list.querySelectorAll('.remove-rule-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      accountFolderRules.splice(Number(btn.dataset.idx), 1);
      renderRuleList();
      await persistConfig();
    });
  });
}

async function persistConfig() {
  const configStatus = document.getElementById('configStatus');
  configStatus.textContent = '저장 중...';
  const response = await sendMessagePromise({
    action: 'saveGistConfig',
    config: { myHandles, accountFolderRules },
  });
  configStatus.textContent = response?.ok ? '저장됨' : '저장 실패: ' + (response?.error || '');
  setTimeout(() => (configStatus.textContent = ''), 2000);
}

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(response);
    });
  });
}

async function loadConfigFromGist() {
  const response = await sendMessagePromise({ action: 'getGistConfig' });
  if (response?.ok) {
    myHandles = response.config.myHandles || [];
    accountFolderRules = response.config.accountFolderRules || [];
    credentialsReady = true;
  } else {
    myHandles = [];
    accountFolderRules = [];
    credentialsReady = false;
  }
  document.getElementById('configDisabledNote').style.display = credentialsReady ? 'none' : 'block';
  renderHandleList();
  renderRuleList();
}

document.addEventListener('DOMContentLoaded', async () => {
  let { githubToken, gistId } = await chrome.storage.sync.get(['githubToken', 'gistId']);

  // 아직 저장된 게 없으면 local-config.js(gitignore 대상, 이 컴퓨터에만 있는 파일)에서 자동 채움
  const local = window.TWEET_ARCHIVER_LOCAL_CONFIG;
  if ((!githubToken || !gistId) && local?.githubToken && local?.gistId) {
    githubToken = local.githubToken;
    gistId = local.gistId;
    await chrome.storage.sync.set({ githubToken, gistId });
  }

  if (githubToken) document.getElementById('token').value = githubToken;
  if (gistId) document.getElementById('gistId').value = gistId;
  await loadConfigFromGist();
});

document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  await chrome.storage.sync.set({ githubToken: token, gistId });

  const status = document.getElementById('status');
  status.textContent = '저장되었습니다.';
  setTimeout(() => (status.textContent = ''), 2000);

  await loadConfigFromGist();
});

document.getElementById('addHandleBtn').addEventListener('click', async () => {
  const input = document.getElementById('newHandleInput');
  const handle = input.value.trim().replace(/^@/, '');
  if (!handle) return;
  if (!myHandles.includes(handle)) myHandles.push(handle);
  input.value = '';
  renderHandleList();
  await persistConfig();
});
document.getElementById('newHandleInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addHandleBtn').click(); }
});

document.getElementById('addRuleBtn').addEventListener('click', async () => {
  const folderInput = document.getElementById('newRuleFolder');
  const handleInput = document.getElementById('newRuleHandle');
  const folder = folderInput.value.trim();
  const handle = handleInput.value.trim().replace(/^@/, '');
  if (!folder || !handle) return;

  let rule = accountFolderRules.find((r) => r.folder === folder);
  if (!rule) {
    rule = { folder, handles: [] };
    accountFolderRules.push(rule);
  }
  if (!rule.handles.includes(handle)) rule.handles.push(handle);

  folderInput.value = '';
  handleInput.value = '';
  renderRuleList();
  await persistConfig();
});
document.getElementById('newRuleHandle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addRuleBtn').click(); }
});

document.getElementById('syncBtn').addEventListener('click', () => {
  const syncStatus = document.getElementById('syncStatus');
  syncStatus.textContent = '동기화 중...';
  chrome.runtime.sendMessage({ action: 'refreshArchivedIds' }, (response) => {
    if (response?.ok) {
      syncStatus.textContent = `완료! 총 ${response.count}개 트윗 캐시됨.`;
    } else {
      syncStatus.textContent = '동기화 실패: ' + (response?.error || '알 수 없는 오류');
    }
    setTimeout(() => (syncStatus.textContent = ''), 4000);
  });
});
