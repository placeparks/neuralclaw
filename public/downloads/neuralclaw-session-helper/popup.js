const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

async function copyText(value, label) {
  await navigator.clipboard.writeText(value);
  setStatus(`${label} copied.\nPaste it into NeuralClaw.`);
}

function getCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(cookie || null);
    });
  });
}

async function copyClaude() {
  const cookie = await getCookie({ url: "https://claude.ai", name: "sessionKey" });
  if (!cookie?.value) {
    throw new Error("No Claude sessionKey found. Make sure you are logged in at claude.ai in this browser.");
  }
  await copyText(cookie.value, "Claude sessionKey");
}

async function copyChatGPTCookie(rawCookieString) {
  const primary = await getCookie({ url: "https://chatgpt.com", name: "__Secure-next-auth.session-token" });
  const secondary = await getCookie({ url: "https://chat.openai.com", name: "__Secure-next-auth.session-token" });
  const tertiary = await getCookie({ url: "https://chatgpt.com", name: "next-auth.session-token" });
  const fallback = await getCookie({ url: "https://chat.openai.com", name: "next-auth.session-token" });
  const cookie = primary || secondary || tertiary || fallback;

  if (!cookie?.value) {
    throw new Error("No ChatGPT session cookie found. Make sure you are logged in at chatgpt.com in this browser.");
  }

  if (rawCookieString) {
    await copyText(`__Secure-next-auth.session-token=${cookie.value}`, "ChatGPT cookie string");
    return;
  }

  await copyText(cookie.value, "ChatGPT session cookie");
}

async function run(action) {
  try {
    setStatus("Reading browser session...");
    await action();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

document.getElementById("copy-claude").addEventListener("click", () => run(copyClaude));
document.getElementById("copy-chatgpt").addEventListener("click", () => run(() => copyChatGPTCookie(false)));
document.getElementById("copy-chatgpt-cookie").addEventListener("click", () => run(() => copyChatGPTCookie(true)));
