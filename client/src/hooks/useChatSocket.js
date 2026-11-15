// Listens to the app's live connection (see context/SocketContext.jsx, which keeps one
// Socket.IO connection open for the whole signed-in app).
//
//   const { status, sendMessage } = useChatSocket(handleEvent);
//
// - status: 'connecting', 'online' or 'offline' (Socket.IO reconnects by itself when offline)
// - handleEvent(event) is called for everything the server sends, with a `type`:
//     { type: 'ready', user, presence }      who is online right now
//     { type: 'message', message, session }  a new chat message
//     { type: 'presence', scope, online, userId? }  someone came online / went offline
//     { type: 'notify' }                     notifications may have changed (for the bell)
// - sendMessage(sessionId, text) sends a message over the connection and returns the saved
//   message, or throws an ApiError if the server refused it.
import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '../context/SocketContext';

export default function useChatSocket(handleEvent) {
  const { status, subscribe, sendMessage } = useContext(SocketContext);

  // Always call the newest handleEvent (it changes when the page's state changes),
  // without having to subscribe again each time
  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  // Listen while this component is on the page; stop when it leaves
  useEffect(() => {
    const stopListening = subscribe((event) => handleEventRef.current(event));
    return stopListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
