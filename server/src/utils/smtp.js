/**
 * A small SMTP client on Node's own net and tls modules (GP2 addition), so
 * sending mail adds no dependency. It covers what a password reset needs:
 * one plain-text message to one recipient.
 *
 * - Implicit TLS (port 465) or STARTTLS (587). Certificates are verified.
 * - AUTH PLAIN, or LOGIN when that is all the server offers. Credentials are
 *   never sent over an unencrypted connection unless `requireTLS` is false,
 *   which only a local mail catcher on the same machine should need.
 * - Headers are checked for CR/LF so an address or subject cannot inject
 *   extra headers; the body is base64 UTF-8, so Arabic text is safe and no
 *   line can start with a lone "." (dot-stuffing is still applied).
 *
 * buildMessage is pure and unit tested; send is tested against a fake server.
 */
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const tls = require('node:tls');

const CRLF = '\r\n';

function assertSingleLine(value, field) {
  if (/[\r\n]/.test(String(value))) throw new Error(`${field} must not contain line breaks`);
}

/** "Name <a@b>" or "a@b" -> { name, address }. */
function parseAddress(value) {
  assertSingleLine(value, 'Address');
  const text = String(value).trim();
  const match = text.match(/^(.*)<([^<>\s]+@[^<>\s]+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), address: match[2] };
  if (/^[^<>\s]+@[^<>\s]+$/.test(text)) return { name: '', address: text };
  throw new Error(`Not an email address: ${text}`);
}

/** RFC 2047: non-ASCII header text as a UTF-8 base64 encoded word. */
function encodeHeaderText(text) {
  assertSingleLine(text, 'Header');
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function formatAddress({ name, address }) {
  if (!name) return address;
  const display = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, '')}"` : encodeHeaderText(name);
  return `${display} <${address}>`;
}

/**
 * The full message (headers + body) as sent after DATA, with CRLF line ends.
 * `from` and `to` may be "Name <address>" or a bare address.
 */
function buildMessage({ from, to, subject, text, date = new Date(), messageId }) {
  const sender = parseAddress(from);
  const recipient = parseAddress(to);
  const domain = sender.address.split('@')[1];
  const id = messageId || `${crypto.randomUUID()}@${domain}`;
  const body = Buffer.from(String(text).replace(/\r?\n/g, CRLF), 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, (line) => line + CRLF);

  const headers = [
    `From: ${formatAddress(sender)}`,
    `To: ${formatAddress(recipient)}`,
    `Subject: ${encodeHeaderText(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  return headers.join(CRLF) + CRLF + CRLF + body;
}

/** Reads SMTP replies ("250-..." continues, "250 ..." ends) from a socket. */
function replyReader(socket) {
  let buffer = '';
  let lines = [];
  const waiting = [];
  const ready = [];
  let failure = null;

  const settle = () => {
    while (waiting.length && (ready.length || failure)) {
      const { resolve, reject } = waiting.shift();
      if (ready.length) resolve(ready.shift());
      else reject(failure);
    }
  };
  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        ready.push({ code: Number(line.slice(0, 3)), lines: lines.map((l) => l.slice(4)) });
        lines = [];
      }
    }
    settle();
  };
  const onEnd = (err) => {
    failure = failure || err || new Error('SMTP connection closed');
    settle();
  };
  socket.on('data', onData);
  socket.on('error', onEnd);
  socket.on('close', () => onEnd());

  return {
    next: () => new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
      settle();
    }),
    detach: () => {
      socket.off('data', onData);
      socket.off('error', onEnd);
    },
  };
}

function connect({ host, port, secure, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`SMTP timed out after ${timeoutMs} ms`)));
    socket.once(secure ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function upgrade(socket, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host }, () => resolve(secured));
    secured.setTimeout(timeoutMs, () => secured.destroy(new Error(`SMTP timed out after ${timeoutMs} ms`)));
    secured.once('error', reject);
  });
}

/**
 * Sends one message. `config`: { host, port, secure, user, pass, timeoutMs,
 * requireTLS (default true), localName }. `envelope`: { from, to } bare
 * addresses. `message`: the output of buildMessage.
 */
async function send(config, envelope, message) {
  const { host, port, user, pass, timeoutMs = 15000, requireTLS = true } = config;
  const localName = config.localName || os.hostname() || 'localhost';
  let secure = Boolean(config.secure);
  let socket = await connect({ host, port, secure, timeoutMs });
  let reader = replyReader(socket);

  // `label` names the step in an error, so credentials and the message body
  // never end up in a log line.
  const command = async (line, expected, label = line) => {
    if (line !== null) socket.write(line + CRLF);
    const reply = await reader.next();
    if (!expected.includes(reply.code)) {
      throw new Error(`SMTP ${label ?? 'greeting'} failed: ${reply.code} ${reply.lines.join(' ')}`);
    }
    return reply;
  };

  try {
    await command(null, [220]);
    let ehlo = await command(`EHLO ${localName}`, [250]);
    const offers = (reply, name) => reply.lines.some((l) => l.toUpperCase().startsWith(name));

    if (!secure && offers(ehlo, 'STARTTLS')) {
      await command('STARTTLS', [220]);
      reader.detach();
      socket = await upgrade(socket, host, timeoutMs);
      reader = replyReader(socket);
      secure = true;
      ehlo = await command(`EHLO ${localName}`, [250]);
    }
    if (!secure && requireTLS) {
      throw new Error('SMTP server offers no TLS; refusing to send (set SMTP_REQUIRE_TLS=false only for a local mail catcher)');
    }

    if (user) {
      const auth = ehlo.lines.find((l) => l.toUpperCase().startsWith('AUTH')) || '';
      if (/\bPLAIN\b/i.test(auth)) {
        await command(`AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64')}`, [235], 'AUTH PLAIN');
      } else if (/\bLOGIN\b/i.test(auth)) {
        await command('AUTH LOGIN', [334]);
        await command(Buffer.from(user).toString('base64'), [334], 'AUTH LOGIN (user)');
        await command(Buffer.from(pass).toString('base64'), [235], 'AUTH LOGIN (password)');
      } else {
        throw new Error('SMTP server offers neither AUTH PLAIN nor AUTH LOGIN');
      }
    }

    assertSingleLine(envelope.from, 'From');
    assertSingleLine(envelope.to, 'To');
    await command(`MAIL FROM:<${envelope.from}>`, [250]);
    await command(`RCPT TO:<${envelope.to}>`, [250, 251]);
    await command('DATA', [354]);
    const stuffed = message.replace(/\r\n\./g, '\r\n..').replace(/^\./, '..');
    await command(`${stuffed.endsWith(CRLF) ? stuffed : stuffed + CRLF}.`, [250], 'message body');
    socket.write(`QUIT${CRLF}`);
  } finally {
    socket.end();
  }
}

module.exports = { buildMessage, parseAddress, encodeHeaderText, send };
