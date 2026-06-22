import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children, token }) {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // FIX: this previously ignored the `token` prop entirely and re-read
    // `localStorage.getItem('erp_token')` instead. That happened to work
    // in the common case (App.js only mounts this provider after login,
    // by which point the token is already in localStorage), but it meant
    // this component silently depended on a second, separate source of
    // truth instead of the prop its parent explicitly passes in — so a
    // token change (e.g. refresh) wouldn't reconnect the socket unless
    // localStorage happened to be updated first AND this effect re-ran.
    const authToken = token || localStorage.getItem('erp_token');
    if (!authToken) return; // don't connect without a token

    const instance = io(import.meta.env.VITE_API_BASE_URL || window.location.origin, {
      auth: { token: authToken },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', (err) => console.error('[Socket]', err.message));

    socketRef.current = instance;
    setSocket(instance);

    return () => {
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}