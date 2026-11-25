/** 百度识图兜底：用共享浏览器打开识图页，粘贴图片网址或注入本地文件，读回识别结果。 */
import { EngineError } from './animetrace.js'

const PAGE = 'https://graph.baidu.com/pcpage/index?tpl_from=pc'

const PASTE_SCRIPT = `(async () => {
  const url = arguments[0];
  const input = document.querySelector('.graph-d20-search-wrapper-input') || document.querySelector('input[type=text]');
  if (!input) return JSON.stringify({ ok: false, reason: '输入框未找到' });
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, url);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
  return JSON.stringify({ ok: true });
})()`

const INJECT_SCRIPT = `(async () => {
  const b64 = arguments[0];
  const mime = arguments[1] || 'image/jpeg';
  const input = document.querySelector('input.general-upload-file') || document.querySelector('input[type=file]');
  if (!input) return JSON.stringify({ ok: false, reason: '文件输入框未找到' });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const name = 'image.' + (mime.split('/')[1] || 'jpg');
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type: mime }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ ok: true, size: input.files[0] ? input.files[0].size : 0 });
})()`

const EXTRACT_SCRIPT = `(async () => {
  const deadline = Date.now() + 12000;
  let text = '';
  while (Date.now() < deadline) {
    text = (document.body && document.body.innerText) || '';
    if (/相似图片|相关商品|图片来源|未找到相关结果|图中可能是/.test(text)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const flat = text.replace(/\\s+/g, ' ').trim();
  const guessMatch = /图中可能是([^\\s，。、]+)/.exec(flat);
  const seen = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a[href^="http"]')) {
    const title = (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    const href = a.href;
    if (!title || !href) continue;
    if (/bdstatic\\.com|hao123\\.com|passport\\.baidu\\.com|graph\\.baidu\\.com/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ title, url: href });
    if (links.length >= 10) break;
  }
  return JSON.stringify({
    guess: guessMatch ? guessMatch[1] : '',
    text: flat.slice(0, 1200),
    links,
    reason: /未找到相关结果/.test(flat) ? '百度未找到相关结果' : '',
  });
})()`

function parseExecute(result, what) {
  if (!result || result.ok !== true) {
    throw new EngineError(`百度识图（${what}）执行失败：${result?.exception || '未知错误'}`)
  }
  try {
    return JSON.parse(String(result.value))
  } catch {
    throw new EngineError(`百度识图（${what}）返回了无法解析的内容`)
  }
}

export function createBaiduRunner(getBrowser) {
  let session

  async function ensureSession(browser) {
    if (session && browser.exists(session)) return session
    session = await browser.open('image-search')
    return session
  }

  return {
    available() {
      return Boolean(getBrowser())
    },
    async query({ img, signal }) {
      const browser = getBrowser()
      if (!browser) throw new EngineError('没有可用的浏览器服务（dsh-builtin-browser 未启用），无法走百度兜底')
      const current = await ensureSession(browser)

      await browser.navigate(current, { url: PAGE }, signal)
      await browser.waitFor(current, { url: 'graph.baidu.com/pcpage', timeoutMs: 20000 }, signal).catch(() => {})

      const submitted = img.kind === 'url'
        ? parseExecute(await browser.execute(current, { script: PASTE_SCRIPT, args: [img.url] }, signal), '粘贴图片网址')
        : parseExecute(
            await browser.execute(
              current,
              { script: INJECT_SCRIPT, args: [Buffer.from(img.bytes).toString('base64'), img.mime] },
              signal,
            ),
            '上传本地图片',
          )
      if (submitted.ok === false) throw new EngineError(`百度识图（提交失败）：${submitted.reason || '未知原因'}`)

      await browser.waitFor(current, { url: 'graph.baidu.com/s', timeoutMs: 45000 }, signal).catch(() => {})
      const data = parseExecute(await browser.execute(current, { script: EXTRACT_SCRIPT }, signal), '读取结果')
      return {
        guess: data.guess || '',
        text: data.text || '',
        links: Array.isArray(data.links) ? data.links : [],
        reason: data.reason || '',
      }
    },
    async dispose() {
      const browser = getBrowser()
      if (session && browser && browser.exists(session)) {
        await browser.close(session).catch(() => {})
      }
      session = undefined
    },
  }
}
