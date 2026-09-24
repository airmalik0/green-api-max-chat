import { useState } from 'react';
import type { Credentials } from './api/types';
import { ChatScreen } from './components/ChatScreen';
import { LoginScreen } from './components/LoginScreen';
import { clearSession, loadCredentials, saveCredentials } from './lib/storage';

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(loadCredentials);
  const [notice, setNotice] = useState<string | null>(null);

  if (!credentials) {
    return (
      <LoginScreen
        onLogin={(next, loginNotice) => {
          saveCredentials(next);
          setNotice(loginNotice);
          setCredentials(next);
        }}
      />
    );
  }

  return (
    <ChatScreen
      key={credentials.idInstance}
      credentials={credentials}
      notice={notice}
      onLogout={() => {
        clearSession(credentials.idInstance);
        setCredentials(null);
      }}
    />
  );
}
