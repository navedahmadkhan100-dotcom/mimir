import 'dotenv/config';
import { createMimirApp } from './src/appFactory.js';

const PORT = Number(process.env.PORT || 3000);
const app = createMimirApp({ deployment: 'render', serveFrontend: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mimir v4.3 Render Fullstack running on http://0.0.0.0:${PORT}`);
});
