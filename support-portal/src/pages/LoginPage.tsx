import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { authService } from '../services/authService';
import { useAuth } from '../lib/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await authService.login({ email, password });
      login(session);
      navigate('/disputes');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          setError('Sem ligacao a API de suporte. Verifique VITE_API_URL e se o backend esta online.');
          return;
        }

        const message = (error.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? `Falha no login de suporte (HTTP ${error.response.status}).`);
      } else {
        setError('Falha no login de suporte. Verifique as credenciais e role.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form onSubmit={handleSubmit} className="card login-card">
        <h1>Portal de Suporte</h1>
        <p className="muted">Acesso exclusivo para agentes e administradores.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        {error && <div className="error-box">{error}</div>}

        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? 'A entrar...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
