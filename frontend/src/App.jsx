import React, { useMemo, useState } from 'react';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function extractLinks(text) {
  const regex = /(https?:\/\/(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com|www\.xiaohongshu\.com|xiaohongshu\.com|xhslink\.com|163cn\.tv|music\.163\.com|y\.music\.163\.com)\/[^\s]+)/gi;
  return [...new Set((text.match(regex) || []).map((x) => x.replace(/[),.;!?\]}>，。！？）】]+$/g, '')))];
}

function sanitizeFilename(name) {
  return String(name || 'download').replace(/[\\/:*?"<>|]/g, '_');
}

function makeDownloadProxyUrl(url, filename) {
  return `${API_BASE}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

function makeMediaProxyUrl(url) {
  return `${API_BASE}/api/media-proxy?url=${encodeURIComponent(url)}`;
}

function shouldProxyMediaUrl(url, platform = '') {
  const lowerPlatform = String(platform || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();
  return lowerPlatform.includes('xiaohongshu') || lowerUrl.includes('xhscdn.com') || lowerUrl.includes('xiaohongshu.com');
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = makeDownloadProxyUrl(url, filename);
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function buildDownloadItems(task) {
  if (!task?.data) return [];

  const { data } = task;
  const prefix = sanitizeFilename(`${data.platform}-${data.itemId || 'media'}`);

  if (data.audioUrl) {
    return [{ url: data.audioUrl, filename: `${prefix}.mp3`, kind: 'audio' }];
  }

  if (data.videoUrl) {
    return [{ url: data.videoUrl, filename: `${prefix}.mp4`, kind: 'video' }];
  }

  return (data.images || []).map((img, index) => ({
    url: img,
    filename: `${prefix}-${index + 1}.jpg`,
    kind: 'image'
  }));
}

function getCoverUrl(task) {
  const cover = task?.data?.cover || '';
  const platform = String(task?.data?.platform || task?.platform || '').toLowerCase();

  if (cover && shouldProxyMediaUrl(cover, platform)) {
    return makeMediaProxyUrl(cover);
  }

  if (cover) return cover;

  if (platform.includes('netease') || platform.includes('网易云')) {
    return '/netease-placeholder.svg';
  }

  return '';
}

function getPreviewUrl(task, url) {
  const platform = String(task?.data?.platform || task?.platform || '').toLowerCase();
  if (shouldProxyMediaUrl(url, platform)) {
    return makeMediaProxyUrl(url);
  }
  return url;
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const parsedCount = useMemo(() => extractLinks(inputText).length, [inputText]);

  const stats = useMemo(() => {
    const success = tasks.filter((t) => t.status === 'success').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const mediaCount = tasks
      .filter((t) => t.status === 'success')
      .reduce((acc, task) => acc + buildDownloadItems(task).length, 0);

    return { total: tasks.length, success, failed, mediaCount };
  }, [tasks]);

  const handleParse = async () => {
    const links = extractLinks(inputText);
    if (links.length === 0) {
      alert('请输入至少 1 条抖音/小红书/网易云链接。');
      return;
    }

    const initial = links.map((link) => ({
      original: link,
      platform: /douyin|iesdouyin/.test(link) ? '抖音' : (/163cn\.tv|music\.163\.com|y\.music\.163\.com/.test(link) ? '网易云' : '小红书'),
      status: 'pending',
      data: null,
      message: ''
    }));

    setTasks(initial);
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/api/parse-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: inputText })
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();

      const nextTasks = initial.map((task) => {
        const result = payload?.results?.find((r) => r.original === task.original);
        if (!result) {
          return { ...task, status: 'failed', message: '后端未返回该链接结果' };
        }

        const isSuccess = String(result.status || '').toLowerCase().includes('success');
        return {
          ...task,
          status: isSuccess ? 'success' : 'failed',
          data: isSuccess ? result : null,
          message: isSuccess ? '' : (result.message || '解析失败')
        };
      });

      setTasks(nextTasks);
    } catch (error) {
      console.error(error);
      alert(`解析失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = () => {
    const allItems = tasks
      .filter((t) => t.status === 'success')
      .flatMap((task) => buildDownloadItems(task));

    if (allItems.length === 0) {
      alert('当前没有可下载资源。');
      return;
    }

    allItems.forEach((item, index) => {
      setTimeout(() => triggerDownload(item.url, item.filename), index * 350);
    });
  };

  const handleCopy = async (text) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <main className="layout">
        <section className="hero card-glass">
          <p className="eyebrow">Lynn Toolbox</p>
          <h1>Lynn的百宝箱</h1>
          <p className="hero-text">
            支持抖音、小红书、网易云。一次粘贴多条链接，统一解析，批量下载。
          </p>

          <div className="hero-stats">
            <div>
              <span>输入识别</span>
              <strong>{parsedCount}</strong>
            </div>
            <div>
              <span>解析成功</span>
              <strong>{stats.success}</strong>
            </div>
            <div>
              <span>可下载资源</span>
              <strong>{stats.mediaCount}</strong>
            </div>
          </div>
        </section>

        <section className="panel card-glass">
          <label htmlFor="link-input" className="panel-title">粘贴链接或分享文案</label>
          <textarea
            id="link-input"
            className="link-input"
            placeholder="示例: https://www.iesdouyin.com/share/video/...\nhttps://www.xiaohongshu.com/explore/...\nhttps://163cn.tv/xxxx"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleParse} disabled={loading || !inputText.trim()}>
              {loading ? '解析中...' : '一键解析'}
            </button>
            <button className="btn btn-accent" onClick={handleDownloadAll} disabled={stats.mediaCount === 0}>
              一键下载全部
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setInputText('');
                setTasks([]);
              }}
            >
              清空
            </button>
          </div>
        </section>

        <section className="result-head">
          <h2>解析结果</h2>
          <p>总计 {stats.total} 条，成功 {stats.success} 条，失败 {stats.failed} 条</p>
        </section>

        <section className="result-grid">
          {tasks.map((task, idx) => {
            const downloadItems = buildDownloadItems(task);
            return (
              <article key={`${task.original}-${idx}`} className="result-card card-glass">
                <div className="thumb-wrap">
                  {getCoverUrl(task) ? <img src={getCoverUrl(task)} alt="cover" /> : <div className="thumb-empty">No Preview</div>}
                </div>

                <div className="content-wrap">
                  <div className="meta-row">
                    <span className="tag">{task.platform}</span>
                    {task.data?.audioUrl && <span className="tag tag-netease">网易云音频</span>}
                    {task.status === 'pending' && <span className="state pending">解析中</span>}
                    {task.status === 'success' && <span className="state success">已完成</span>}
                    {task.status === 'failed' && <span className="state failed">失败</span>}
                  </div>

                  <h3>{task.data?.title || '等待解析结果'}</h3>
                  <p className="origin" title={task.original}>{task.original}</p>
                  {task.message && <p className="error-msg">{task.message}</p>}

                  {task.status === 'success' && (
                    <div className="download-block">
                      <div className="mini-actions">
                        {task.data?.audioUrl ? (
                          <>
                            <button className="chip" onClick={() => triggerDownload(downloadItems[0].url, downloadItems[0].filename)}>下载音频</button>
                            <button className="chip chip-light" onClick={() => window.open(task.data.audioUrl, '_blank')}>试听</button>
                            <button className="chip chip-light" onClick={() => handleCopy(task.data.audioUrl)}>复制地址</button>
                          </>
                        ) : task.data?.videoUrl ? (
                          <>
                            <button className="chip" onClick={() => triggerDownload(downloadItems[0].url, downloadItems[0].filename)}>下载视频</button>
                            <button className="chip chip-light" onClick={() => window.open(task.data.videoUrl, '_blank')}>预览视频</button>
                            <button className="chip chip-light" onClick={() => handleCopy(task.data.videoUrl)}>复制地址</button>
                          </>
                        ) : (
                          <>
                            {downloadItems.length > 0 && (
                              <div className="thumb-list">
                                {downloadItems.slice(0, 6).map((item) => (
                                  <img
                                    key={`preview-${item.filename}`}
                                    className="thumb-mini"
                                    src={getPreviewUrl(task, item.url)}
                                    alt={item.filename}
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            )}
                            {downloadItems.slice(0, 8).map((item) => (
                              <button
                                key={item.filename}
                                className="chip"
                                onClick={() => triggerDownload(item.url, item.filename)}
                              >
                                下载{item.filename.split('-').pop().replace('.jpg', '')}
                              </button>
                            ))}
                            {downloadItems[0] && (
                              <button className="chip chip-light" onClick={() => handleCopy(downloadItems[0].url)}>
                                复制首图地址
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
