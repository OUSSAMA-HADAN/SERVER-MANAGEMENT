import { useEffect } from 'react';
import { APP_TITLE, SERVER_NAME } from './api.js';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SERVER_NAME} · ${APP_TITLE}` : `${SERVER_NAME} · ${APP_TITLE}`;
  }, [title]);
}
