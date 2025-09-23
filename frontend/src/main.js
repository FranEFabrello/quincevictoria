import './styles/global.css';
import { createRouter } from './router.js';

const appRoot = document.getElementById('app');
const router = createRouter(appRoot);

export const navigateTo = router.navigate;
