// The live connection to the server (Socket.IO), shared by the whole signed-in app.
//
// One connection stays open on every page (GP2 addition). Two things use it:
//   - the chat pages: new messages and online status arrive over it, and text is sent on it;
//   - the notification bell: the server says "notify" when something changed.
// Components do not use this file directly: they call hooks/useChatSocket.js.
//
// What the provider gives:
//   status        - 'connecting', 'online' or 'offline' (Socket.IO reconnects by itself)
//   subscribe(fn) - fn(event) is called for everything the server sends, with a `type`:
//                     { type: 'ready', user, presence }      who is online right now
//                     { type: 'message', message, session }  a new chat message
//                     { type: 'presence', scope, online, userId? }  someone came or went
//                     { type: 'notify' }                     notifications may have changed
//                   It returns a function that stops listening.
//   sendMessage(sessionId, text) - sends a chat message and returns the saved message,
//                   or throws an ApiError if the server refused it.
import { createContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError, getToken } from '../api/client';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [status, setStatus] = useState('connecting');
  const socketRef = useRef(null);
  // Everyone who wants to hear the server's events (the bell, the open chat page)
  const listenersRef = useRef(new Set());

  useEffect(() => {
    // Connect to the same server the page came from. The login token is sent with every
    // (re)connection; the server refuses the connection if it is not valid.
    const socket = io({
      auth: (sendAuth) => sendAuth({ token: getToken() }),
    });
    socketRef.current = socket;

    // Passes one server event on to every listener
    function tellListeners(event) {
      for (const listener of listenersRef.current) {
        listener(event);
      }
    }

    socket.on('connect', () => setStatus('online'));

    socket.on('disconnect', (reason) => {
      setStatus('offline');
      // The server closed the connection on purpose (account deleted, password changed): sign out
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

    socket.on('ready', (data) => tellListeners({ type: 'ready', ...data }));
    socket.on('message', (data) => tellListeners({ type: 'message', ...data }));
    socket.on('presence', (data) => tellListeners({ type: 'presence', ...data }));
    socket.on('notify', () => tellListeners({ type: 'notify' }));

    // Close the connection when the user signs out or leaves the app
    return () => socket.disconnect();
  }, []);

  // Starts listening to the server's events. Returns a function that stops listening.
  function subscribe(listener) {
    listenersRef.current.add(listener);
    // The connection may have been open for a while already, so ask "who is online right
    // now?" - the server answers with a fresh 'ready' event (see chatSocket.js)
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('presence:refresh');
    }
    return () => listenersRef.current.delete(listener);
  }

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

  return <SocketContext.Provider value={{ status, subscribe, sendMessage }}>{children}</SocketContext.Provider>;
}
