const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(sa) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key, 'base64');
  return `${unsigned}.${sig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function getGoogleAccessToken(config, credsPath = 'google-credentials.json') {
  let sa;
  if (config.credsContent) {
    try {
      sa = JSON.parse(config.credsContent);
    } catch (e) {
      throw new Error(`Google credentials JSON parse error: ${e.message}`);
    }
  } else {
    if (fs.existsSync(credsPath)) {
      sa = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    } else {
      throw new Error(`Google credentials not found (checked config.credsContent and ${credsPath})`);
    }
  }
  const jwt = signJwt(sa);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString();
  const res = await axios.post('https://oauth2.googleapis.com/token', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  });
  return res.data.access_token;
}

async function gs(method, url, token, data) {
  const res = await axios({
    method,
    url,
    data,
    httpsAgent: new https.Agent({ keepAlive: true }),
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 10000
  });
  if (res.status >= 400) {
    throw new Error(`Google API ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function ensureSheet(sheetId, token, title) {
  const meta = await gs('get', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, token);
  if ((meta.sheets || []).some(s => s.properties?.title === title)) return;
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, token, {
    requests: [{ addSheet: { properties: { title } } }]
  });
}

async function clearAndWrite(sheetId, token, range, values) {
  const enc = encodeURIComponent(range);
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${enc}:clear`, token, {});
  await gs('put', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${enc}?valueInputOption=RAW`, token, { values });
}

async function readRange(sheetId, token, range) {
  const data = await gs('get', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`, token);
  return data.values || [];
}

function parseSheet(rows) {
  if (!rows.length) return [];
  const h = rows[0];
  return rows.slice(1).filter(r => r.length).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

module.exports = {
  getGoogleAccessToken,
  ensureSheet,
  clearAndWrite,
  readRange,
  parseSheet,
  gs
};
