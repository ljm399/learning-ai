import crypto from 'crypto';

const SECRET = process.env.TOKEN_SECRET || 'default-secret-change-me';

function base64UrlEscape(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlUnescape(str) {
  str += new Array(5 - (str.length % 4)).join('=');
  return str.replace(/\-/g, '+').replace(/_/g, '/');
}

function base64UrlEncode(str) {
  return base64UrlEscape(Buffer.from(str).toString('base64'));
}

function base64UrlDecode(str) {
  return Buffer.from(base64UrlUnescape(str), 'base64').toString();
}

function ms(val) {
  if (typeof val === 'number') return val;
  const match = val.match(/^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i);
  if (!match) return NaN;
  const n = parseFloat(match[1]);
  const type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * 31557600000;
    case 'weeks':
    case 'week':
    case 'w':
      return n * 604800000;
    case 'days':
    case 'day':
    case 'd':
      return n * 86400000;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * 3600000;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * 60000;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * 1000;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return NaN;
  }
}

function generateToken(userId, options = {}) {
  //jwt操作-token是包含了用户id，并且设置了过期时间的，我们是可以从这个token里解析出用户id的
  const secret = options.secret || SECRET;
  const expiresIn = options.expiresIn || '7d';
  const now = Date.now();

  const header = JSON.stringify({ alg: 'HS256', typ: 'TOKEN' });
  const payload = JSON.stringify({
    userId,
    iat: now,
    exp: now + ms(expiresIn),
  });

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64');

  return `${encodedHeader}.${encodedPayload}.${base64UrlEscape(signature)}`;
}

function verifyToken(token, options = {}) {
  const secret = options.secret || SECRET;

  if (!token || typeof token !== 'string') {
    throw new Error('token must be a non-empty string');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('token格式错误');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64');

  if (base64UrlEscape(signature) !== encodedSignature) {
    throw new Error('token签名无效');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));

  if (Date.now() > payload.exp) {
    throw new Error('token已过期');
  }

  return payload;
}

export { generateToken, verifyToken };
