const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { buildMessage, parseAddress, encodeHeaderText, send } = require('../src/utils/smtp');

const decodeBody = (message) => Buffer.from(message.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');

test('builds a UTF-8 message with encoded headers (GP2 addition)', () => {
  const message = buildMessage({
    from: 'Pharmacy IMS <no-reply@pharmacy.example>',
    to: 'sara@example.com',
    subject: 'إعادة تعيين كلمة المرور',
    text: 'Line one\nسطر ثانٍ',
    date: new Date('2026-10-24T09:00:00Z'),
    messageId: 'fixed@pharmacy.example',
  });
  assert.match(message, /^From: "Pharmacy IMS" <no-reply@pharmacy\.example>\r\n/);
  assert.match(message, /\r\nTo: sara@example\.com\r\n/);
  assert.match(message, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.match(message, /\r\nDate: Sat, 24 Oct 2026 09:00:00 \+0000\r\n/);
  assert.match(message, /\r\nContent-Transfer-Encoding: base64\r\n\r\n/);
  assert.equal(decodeBody(message), 'Line one\r\nسطر ثانٍ');
  assert.ok(message.split('\r\n').every((line) => line.length <= 998));
});

test('refuses line breaks in addresses and the subject (header injection)', () => {
  assert.throws(() => buildMessage({ from: 'a@b.c', to: 'x@y.z\r\nBcc: evil@z.z', subject: 's', text: 't' }));
  assert.throws(() => buildMessage({ from: 'a@b.c', to: 'x@y.z', subject: 'Hi\r\nBcc: evil@z.z', text: 't' }));
  assert.throws(() => parseAddress('not an address'));
  assert.deepEqual(parseAddress('Name <n@x.io>'), { name: 'Name', address: 'n@x.io' });
  assert.equal(encodeHeaderText('plain ascii'), 'plain ascii');
});

/** A minimal SMTP server: records what it receives and answers like a real one. */
function fakeServer({ auth = false, starttls = false } = {}) {
  const received = { commands: [], data: '' };
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = '';
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 queued\r\n');
          } else {
            received.data += line + '\r\n';
          }
          continue;
        }
        received.commands.push(line);
        if (line.startsWith('EHLO')) {
          const ext = ['250-fake', ...(starttls ? ['250-STARTTLS'] : []), ...(auth ? ['250-AUTH PLAIN LOGIN'] : []), '250 8BITMIME'];
          socket.write(ext.join('\r\n') + '\r\n');
        } else if (line.startsWith('AUTH PLAIN')) socket.write('235 ok\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) socket.write('250 ok\r\n');
        else if (line === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('502 unknown\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port })));
}

test('sends a message through the whole SMTP conversation, dot-stuffed', async () => {
  const { server, received, port } = await fakeServer();
  try {
    const message = buildMessage({ from: 'a@pharmacy.example', to: 'b@example.com', subject: 'Hi', text: 'x' });
    // A body line starting with "." must be doubled on the wire.
    await send({ host: '127.0.0.1', port, requireTLS: false, localName: 'test' }, { from: 'a@pharmacy.example', to: 'b@example.com' }, `${message}.hidden\r\n`);
    assert.deepEqual(received.commands.slice(0, 4), ['EHLO test', 'MAIL FROM:<a@pharmacy.example>', 'RCPT TO:<b@example.com>', 'DATA']);
    assert.match(received.data, /\r\n\.\.hidden\r\n$/);
    assert.match(received.data, /^From: a@pharmacy\.example\r\n/);
  } finally {
    server.close();
  }
});

test('authenticates with AUTH PLAIN when the server offers it', async () => {
  const { server, received, port } = await fakeServer({ auth: true });
  try {
    const message = buildMessage({ from: 'a@pharmacy.example', to: 'b@example.com', subject: 'Hi', text: 'x' });
    await send({ host: '127.0.0.1', port, user: 'me', pass: 'secret', requireTLS: false, localName: 'test' }, { from: 'a@pharmacy.example', to: 'b@example.com' }, message);
    const authLine = received.commands.find((c) => c.startsWith('AUTH PLAIN'));
    assert.equal(Buffer.from(authLine.split(' ')[2], 'base64').toString(), '\u0000me\u0000secret');
  } finally {
    server.close();
  }
});

test('never sends credentials over a connection without TLS', async () => {
  const { server, received, port } = await fakeServer({ auth: true });
  try {
    const message = buildMessage({ from: 'a@pharmacy.example', to: 'b@example.com', subject: 'Hi', text: 'x' });
    await assert.rejects(
      send({ host: '127.0.0.1', port, user: 'me', pass: 'secret', localName: 'test' }, { from: 'a@pharmacy.example', to: 'b@example.com' }, message),
      /offers no TLS/
    );
    assert.equal(received.commands.some((c) => c.startsWith('AUTH')), false);
  } finally {
    server.close();
  }
});
