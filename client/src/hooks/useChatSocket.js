// Keeps a live chat connection (Socket.IO) open while a chat page is showing.
//
//   const { status, sendMessage } = useChatSocket(handleEvent);
//
// - status: 'connecting', 'online' or 'offline' (Socket.IO reconnects by itself when offline)
// - handleEvent(event) is called for everything the server sends, with a `type`:
//     { type: 'ready', user, presence }      right after connecting
//     { type: 'message', message, session }  a new chat message
//     { type: 'presence', scope, online, userId? }  someone came online / went offline
// - sendMessage(sessionId, text) sends a message over the connection and returns the saved
//   message, or throws an ApiError if the server refused it.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError, getToken } from '../api/client';

export default function useChatSocket(handleEvent) {
  const [status, setStatus] = useState('connecting');
  const socketRef = useRef(null);

  // Always call the newest handleEvent (it changes when the page's state changes),
  // without having to reconnect each time
  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  useEffect(() => {
    // Connect to the same server the page came from. The login token is sent with every
    // (re)connection; the server refuses the connection if it is not valid.
    const socket = io({
      auth: (sendAuth) => sendAuth({ token: getToken() }),
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('online'));

    socket.on('disconnect', (reason) => {
      setStatus('offline');
      // The server closed the connection on purpose (account deleted, password reset): sign out
      if (reason === 'io server disconnect') {
        window.dispatchEvent(new Event('pims:unauthorized'));
      }
    });

    socket.on('connect_error', (error) => {
      setStatus('offline');
      // The server refused the login token: sign out instead of retrying for ever
      if (error.message === 'AUTH_FAILED') {
        window.dispatchEvent(new Event('pims:unauthorized'));
      }
    });

    // Pass every server event on to the page, with its type
    socket.on('ready', (data) => handleEventRef.current({ type: 'ready', ...data }));
    socket.on('message', (data) => handleEventRef.current({ type: 'message', ...data }));
    socket.on('presence', (data) => handleEventRef.current({ type: 'presence', ...data }));

    // Close the connection when the page closes
    return () => socket.disconnect();
  }, []);

  // Sends a text message and waits for the server's reply (it saves the message first)
  function sendMessage(sessionId, content) {
    return new Promise((resolve, reject) => {
      socketRef.current.emit('message', { sessionId, content }, (reply) => {
        if (reply.ok) {
          resolve(reply.message);
        } else {
          reject(new ApiError(400, reply.error, undefined, reply.code, reply.params));
        }
      });
    });
  }

  return { status, sendMessage };
}

// Adds a message to a list unless it is already there (a message can arrive twice:
// once as the reply to sending it, and once from the live connection).
export function addMessageIfNew(messages, newMessage) {
  for (const message of messages) {
    if (message.id === newMessage.id) {
      return messages;
    }
  }
  return [...messages, newMessage];
}
