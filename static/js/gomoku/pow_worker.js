// Cerberus 风格 PoW Worker（SHA-256 实现，纯同步 JS）
// 协议：对 "challenge:nonce" 做 SHA-256，前 difficulty 位必须为 0
// 自包含：内含 sync SHA-256 实现，不依赖 crypto.subtle 的异步 digest

'use strict';

// -------- Sync SHA-256 (pure JS, well-known algorithm) --------
function sha256DigestSync(bytes) {
  // FIPS 180-4 SHA-256
  var K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  var H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  // Padding
  var len = bytes.length;
  var paddedLen = len + 9;
  paddedLen = ((paddedLen + 63) >> 6) << 6;  // round up to 64-byte blocks
  var msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[len] = 0x80;
  // 8-byte big-endian length (bits)
  var bitLen = len * 8;
  // write as big-endian 64-bit; JavaScript int 足够 53-bit，但我们只写 45-bit
  msg[paddedLen - 8] = 0;
  msg[paddedLen - 7] = 0;
  msg[paddedLen - 6] = 0;
  msg[paddedLen - 5] = 0;
  msg[paddedLen - 4] = (bitLen >>> 24) & 0xFF;
  msg[paddedLen - 3] = (bitLen >>> 16) & 0xFF;
  msg[paddedLen - 2] = (bitLen >>> 8) & 0xFF;
  msg[paddedLen - 1] = bitLen & 0xFF;

  var h0 = H0[0]>>>0, h1 = H0[1]>>>0, h2 = H0[2]>>>0, h3 = H0[3]>>>0;
  var h4 = H0[4]>>>0, h5 = H0[5]>>>0, h6 = H0[6]>>>0, h7 = H0[7]>>>0;

  function rotr(x,n){ return ((x>>>n) | (x<<(32-n)))>>>0; }

  for (var off = 0; off < paddedLen; off += 64) {
    var w = new Uint32Array(64);
    for (var i = 0; i < 16; i++) {
      w[i] = ((msg[off + i*4]   << 24) >>> 0) |
             ((msg[off + i*4+1] << 16) >>> 0) |
             ((msg[off + i*4+2] << 8)  >>> 0) |
              msg[off + i*4+3];
    }
    for (var j = 16; j < 64; j++) {
      var s0 = rotr(w[j-15],7) ^ rotr(w[j-15],18) ^ ((w[j-15] >>> 3) & 0xFFFFFFFF);
      var s1 = rotr(w[j-2],17) ^ rotr(w[j-2],19) ^ ((w[j-2] >>> 10) & 0xFFFFFFFF);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
    }

    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (var t = 0; t < 64; t++) {
      var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      var mj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  // 输出为大端序 32 位整数
  return [h0, h1, h2, h3, h4, h5, h6, h7];
}

function int32ToBytesBE(x) {
  return new Uint8Array([(x>>>24)&0xFF,(x>>>16)&0xFF,(x>>>8)&0xFF,x&0xFF]);
}

function hexFromState(state) {
  var out = '';
  for (var i = 0; i < state.length; i++) {
    out += state[i].toString(16).padStart(8, '0');
  }
  return out;
}

// -------- PoW bits-zero check --------
function hashBitsZero(hex, difficulty) {
  let needChars = difficulty >>> 2;
  let needBits  = difficulty & 3;
  if (hex.length < needChars + (needBits ? 1 : 0)) return false;
  for (let i = 0; i < needChars; i++) if (hex.charCodeAt(i) !== 48) return false;  // '0'
  if (needBits) {
    let top = hex.charCodeAt(needChars) - 48;
    if (top > 9) top = top - 39;
    let mask = (0xF << (4 - needBits)) & 0xF;
    if (top & mask) return false;
  }
  return true;
}

// 避免每次 hash 都 TextEncoder——直接拼 ASCII（challenge 是 hex ASCII）
function encodeAscii(str) {
  var out = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

self.onmessage = function (e) {
  const { challenge, difficulty, nonce: startNonce, threads, reportInterval } = e.data;
  let reported = 0;
  let batch = startNonce;

  while (true) {
    // 直接拼 challenge + ':' + batch.toString()，一次 TextEncoder
    const str = challenge + ':' + batch.toString();
    const data = encodeAscii(str);
    const state = sha256DigestSync(data);
    const hex = hexFromState(state);

    if (hashBitsZero(hex, difficulty)) {
      postMessage({ nonce: batch.toString(), hash: hex, difficulty });
      return;
    }

    reported++;
    if (reportInterval && reported >= reportInterval) {
      reported = 0;
      postMessage(reportInterval);
    }

    batch += threads;
    if (batch < 0) return;  // overflow protection (JS 安全整数内够用)
  }
};
