import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout/Layout';
import RequireAuth from './components/RequireAuth/RequireAuth';
import Home from './pages/Home/Home';
import Watch from './pages/Watch/Watch';
import History from './pages/History/History';
import Account from './pages/Account/Account';
import Login from './pages/Login/Login';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="/obra/:playId" element={<Watch />} />
            <Route path="/historial" element={<History />} />
            <Route path="/cuenta" element={<Account />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
