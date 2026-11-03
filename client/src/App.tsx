import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Home from './pages/Home/Home';
import Watch from './pages/Watch/Watch';
import History from './pages/History/History';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/obra/:playId" element={<Watch />} />
          <Route path="/historial" element={<History />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
