const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');

const app = express();
const PORT = 3001;
const HOST = process.env.HOST || '0.0.0.0';

const httpAgent = new http.Agent({ keepAlive: true, family: 4 });
const httpsAgent = new https.Agent({ keepAlive: true, family: 4, rejectUnauthorized: false });

const URL_REGEX = /(https?:\/\/(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com|www\.xiaohongshu\.com|xiaohongshu\.com|xhslink\.com|163cn\.tv|music\.163\.com|y\.music\.163\.com)\/[^\s]+)/gi;

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

function decodeHtmlEntities(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sanitizeUrl(input = '') {
  return decodeHtmlEntities(String(input).trim()).replace(/[),.;!?\]}>，。！？）】]+$/g, '');
}

function normalizeMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:\/\//i, 'https://');
}

function extractLinks(content = '') {
  const matches = String(content).match(URL_REGEX) || [];
  return [...new Set(matches.map(sanitizeUrl).filter(Boolean))];
}

async function fetchText(url, headers = {}) {
  const response = await axios.get(url, {
    timeout: 25000,
    maxRedirects: 5,
    proxy: false,
    responseType: 'text',
    httpAgent,
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      ...headers
    }
  });

  return String(response.data || '');
}

async function resolveUrl(inputUrl) {
  const url = sanitizeUrl(inputUrl);
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      proxy: false,
      validateStatus: (s) => s >= 200 && s < 400,
      httpAgent,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Referer: 'https://www.xiaohongshu.com/'
      }
    });

    const finalUrl = response.request?.res?.responseUrl || response.headers?.location || url;
    return sanitizeUrl(finalUrl);
  } catch (error) {
    const redirected = error.response?.headers?.location;
    if (redirected) return sanitizeUrl(redirected);
    return url;
  }
}

function parseDouyinRouterData(html) {
  const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})<\/script>/);
  if (!routerMatch) {
    throw new Error('Failed to parse Douyin page data (router data missing)');
  }

  const routerData = JSON.parse(routerMatch[1]);
  const pageData = routerData?.loaderData?.['video_(id)/page'];
  const item = pageData?.videoInfoRes?.item_list?.[0];

  if (!item) {
    throw new Error('Failed to parse Douyin media data');
  }

  return item;
}

async function parseDouyin(inputUrl) {
  const resolvedUrl = await resolveUrl(inputUrl);
  let awemeId = (resolvedUrl.match(/(?:video|share\/video)\/(\d{8,25})/) || [])[1] || '';

  if (!awemeId) {
    const fallbackHtml = await fetchText(resolvedUrl, {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    });
    awemeId = (fallbackHtml.match(/"aweme_id":"(\d{8,25})"/) || [])[1] || '';
  }

  if (!awemeId) {
    throw new Error('Cannot extract Douyin video id from link');
  }

  const detailPageUrl = `https://www.iesdouyin.com/share/video/${awemeId}`;
  const html = await fetchText(detailPageUrl, {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const item = parseDouyinRouterData(html);

  const playAddr = item?.video?.play_addr?.url_list?.[0] || '';
  const noWatermarkUrl = normalizeMediaUrl(playAddr.replace('playwm', 'play'));

  if (!noWatermarkUrl) {
    throw new Error('Cannot get Douyin no-watermark video url');
  }

  const cover = normalizeMediaUrl(
    item?.video?.origin_cover?.url_list?.[0] ||
    item?.video?.cover?.url_list?.[0] ||
    item?.video?.dynamic_cover?.url_list?.[0] ||
    ''
  );

  return {
    original: inputUrl,
    longUrl: resolvedUrl,
    platform: 'douyin',
    itemId: awemeId,
    status: 'Success',
    title: item?.desc || `Douyin ${awemeId}`,
    author: item?.author?.nickname || '',
    cover,
    videoUrl: noWatermarkUrl,
    images: []
  };
}

function parseXhsInitialState(html) {
  const stateMatch = html.match(/window\.__INITIAL_STATE__=(\{[\s\S]*?\})<\/script>/);
  if (!stateMatch) {
    throw new Error('Failed to parse Xiaohongshu page data');
  }

  const normalized = stateMatch[1].replace(/:undefined/g, ':null');
  const state = JSON.parse(normalized);
  const detailMap = state?.note?.noteDetailMap || {};
  const note = Object.values(detailMap).map((x) => x?.note).find(Boolean);

  if (!note) {
    throw new Error('Xiaohongshu note not found (possibly private/expired link)');
  }

  return note;
}

async function parseXiaohongshu(inputUrl) {
  const resolvedUrl = await resolveUrl(inputUrl);
  const html = await fetchText(resolvedUrl, { Referer: 'https://www.xiaohongshu.com/' });
  const note = parseXhsInitialState(html);

  const imageList = (note?.imageList || [])
    .map((img) => normalizeMediaUrl(img?.urlDefault || img?.urlPre || img?.url || ''))
    .filter(Boolean);

  const videoUrl = normalizeMediaUrl(
    note?.video?.media?.stream?.h264?.[0]?.masterUrl ||
    note?.video?.consumer?.originVideoKey ||
    ''
  );

  const cover = imageList[0] || videoUrl || '';
  const itemId = note?.noteId || (resolvedUrl.match(/\/explore\/([a-zA-Z0-9]+)/) || [])[1] || '';

  if (!videoUrl && imageList.length === 0) {
    throw new Error('No downloadable media found in Xiaohongshu note');
  }

  return {
    original: inputUrl,
    longUrl: resolvedUrl,
    platform: 'xiaohongshu',
    itemId,
    status: 'Success',
    title: note?.title || note?.desc || `Xiaohongshu ${itemId}`,
    author: note?.user?.nickname || '',
    cover,
    videoUrl: videoUrl || null,
    images: videoUrl ? [] : imageList
  };
}

function parseNeteaseSongId(url, html = '') {
  const normalizedUrl = sanitizeUrl(url);
  const patterns = [
    /[?&]id=(\d{4,20})/i,
    /\/song\/(\d{4,20})/i,
    /song\?id=(\d{4,20})/i,
    /"songId"\s*:\s*"(\d{4,20})"/i,
    /"id"\s*:\s*(\d{4,20})/i
  ];

  for (const pattern of patterns) {
    const fromUrl = normalizedUrl.match(pattern)?.[1];
    if (fromUrl) return fromUrl;

    const fromHtml = String(html).match(pattern)?.[1];
    if (fromHtml) return fromHtml;
  }

  return '';
}

async function parseNeteaseMusic(inputUrl) {
  const resolvedUrl = await resolveUrl(inputUrl);
  let songId = parseNeteaseSongId(resolvedUrl);
  let sharePageHtml = '';

  if (!songId) {
    sharePageHtml = await fetchText(resolvedUrl, { Referer: 'https://music.163.com/' });
    songId = parseNeteaseSongId(resolvedUrl, sharePageHtml);
  }

  if (!songId) {
    throw new Error('Cannot extract Netease song id from link');
  }

  const detailUrl = `https://music.163.com/api/song/detail/?id=${songId}&ids=%5B${songId}%5D`;
  const detailResp = await axios.get(detailUrl, {
    timeout: 25000,
    proxy: false,
    httpAgent,
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      Referer: 'https://music.163.com/'
    }
  });

  const song = detailResp?.data?.songs?.[0];
  if (!song) {
    throw new Error('Netease song detail unavailable');
  }

  const artist = (song.ar || []).map((x) => x?.name).filter(Boolean).join(' / ');
  const cover = normalizeMediaUrl(song?.al?.picUrl || '');
  const audioUrl = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;

  return {
    original: inputUrl,
    longUrl: resolvedUrl,
    platform: 'netease',
    itemId: songId,
    status: 'Success',
    title: song?.name || `Netease ${songId}`,
    author: artist,
    cover,
    audioUrl,
    videoUrl: null,
    images: []
  };
}

async function parseMedia(url) {
  const normalized = sanitizeUrl(url);

  if (/douyin\.com|iesdouyin\.com/i.test(normalized)) {
    return parseDouyin(normalized);
  }

  if (/xiaohongshu\.com|xhslink\.com/i.test(normalized)) {
    return parseXiaohongshu(normalized);
  }

  if (/163cn\.tv|music\.163\.com|y\.music\.163\.com/i.test(normalized)) {
    return parseNeteaseMusic(normalized);
  }

  throw new Error('Unsupported link');
}

async function downloadStreamWithRetry(url, headers) {
  const requestConfig = {
    url,
    method: 'GET',
    responseType: 'stream',
    headers,
    timeout: 30000,
    maxRedirects: 5,
    proxy: false,
    httpAgent,
    httpsAgent
  };

  try {
    return await axios(requestConfig);
  } catch (firstError) {
    const retryableTlsError = [
      'Client network socket disconnected before secure TLS connection was established',
      'ECONNRESET',
      'ETIMEDOUT'
    ].some((keyword) => String(firstError.message || '').includes(keyword));

    if (!retryableTlsError) throw firstError;

    return axios({
      ...requestConfig,
      httpAgent: new http.Agent({ keepAlive: false, family: 4 }),
      httpsAgent: new https.Agent({ keepAlive: false, family: 4, rejectUnauthorized: false })
    });
  }
}

function buildMediaRequestHeaders(cleanUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: '*/*'
  };

  if (cleanUrl.includes('xiaohongshu.com') || cleanUrl.includes('xhslink.com') || cleanUrl.includes('xhscdn.com')) {
    headers.Referer = 'https://www.xiaohongshu.com/';
  } else if (cleanUrl.includes('douyin.com') || cleanUrl.includes('iesdouyin.com') || cleanUrl.includes('snssdk.com')) {
    headers.Referer = 'https://www.douyin.com/';
  } else if (cleanUrl.includes('music.163.com') || cleanUrl.includes('music.126.net') || cleanUrl.includes('163cn.tv')) {
    headers.Referer = 'https://music.163.com/';
  }

  return headers;
}

app.post('/api/parse-batch', async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const links = extractLinks(content);
  if (links.length === 0) return res.status(200).json({ results: [] });

  const results = [];
  for (const link of links) {
    try {
      const data = await parseMedia(link);
      results.push(data);
    } catch (error) {
      results.push({
        original: link,
        status: 'Failed',
        message: error.message || 'Unknown parse error'
      });
    }
  }

  res.json({ results });
});

app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send('URL is required');

  const cleanUrl = sanitizeUrl(url);
  const safeName = String(filename || 'download').replace(/"/g, '');

  try {
    const headers = buildMediaRequestHeaders(cleanUrl);
    const response = await downloadStreamWithRetry(cleanUrl, headers);

    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    response.data.pipe(res);
  } catch (error) {
    res.status(500).send(`Download failed: ${error.message}`);
  }
});

app.get('/api/media-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL is required');

  const cleanUrl = sanitizeUrl(url);

  try {
    const headers = buildMediaRequestHeaders(cleanUrl);
    const response = await downloadStreamWithRetry(cleanUrl, headers);

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    res.setHeader('Cache-Control', 'public, max-age=300');

    response.data.pipe(res);
  } catch (error) {
    res.status(500).send(`Media proxy failed: ${error.message}`);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Backend server running at http://${HOST}:${PORT}`);
});
