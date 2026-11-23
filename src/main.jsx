import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { khoaThuNho } from './lib/khoaThuNho.js';   // NEW - 3.131 chụm 2 ngón không làm app co nhỏ

khoaThuNho();

createRoot(document.getElementById('root')).render(<App />);
