
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import LogoIcon from '../components/icons/LogoIcon';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = login(username, password);
    if (success) {
      navigate('/', { replace: true });
    } else {
      setError('Invalid credentials. Please use the demo account.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-4">
      <Card className="max-w-md w-full">
        <div className="text-center mb-8">
            <div className="inline-block text-primary dark:text-white">
                <LogoIcon width="64" height="64" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface-light dark:text-on-surface-dark mt-2">AI for 6G Virtual Live Lab</h1>
            <p className="text-secondary dark:text-gray-400">Demo Access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="text-sm p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
            <p className="font-semibold text-on-surface-light dark:text-on-surface-dark">Use Demo Credentials:</p>
            <p className="text-secondary dark:text-gray-400">Username: <code className="font-mono">demo_user</code></p>
            <p className="text-secondary dark:text-gray-400">Password: <code className="font-mono">demo123</code></p>
          </div>

          <Button type="submit" className="w-full">
            Login
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Login;
