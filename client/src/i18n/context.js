import { createContext } from 'react';

/**
 * The context object lives in its own module so it survives hot reloads:
 * editing en.json or ar.json re-evaluates I18nContext.jsx, and a fresh
 * createContext() there would leave the running provider and its consumers
 * on two different contexts until a full reload.
 */
export const I18nContext = createContext(null);
