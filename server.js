const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
// Порт для Render
const PORT = process.env.PORT || 10000; 

// Полное пробитие CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.sendStatus(200);
});

app.use(express.json());

// Настройка multer в оперативную память (до 150 МБ под APK)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 150 * 1024 * 1024 } 
});

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

app.post('/upload', upload.single('document'), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  if (!req.file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден в запросе фронтенда' });
  }

  console.log(`📂 Файл: "${req.file.originalname}" | Размер: ${(req.file.size / (1024 * 1024)).toFixed(2)} МБ`);

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения TG_BOT_TOKEN или TG_CHAT_ID пустые в панели Render!");
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения Render.' });
  }

  try {
    console.log("📦 Сборка нативного FormData под Node.js v24...");
    
    // Переводим буфер multer в нативный Blob, понятный встроенному fetch
    const fileBlob = new Blob([req.file.buffer], { type: 'application/octet-stream' });
    const safeName = `${Date.now()}-${req.file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    // Используем встроенный FormData вместо старого require('form-data')
    const nativeForm = new globalThis.FormData();
    nativeForm.append('chat_id', TG_CHAT_ID);
    nativeForm.append('document', fileBlob, safeName);

    console.log("🚀 Отправка нативного fetch в Telegram API...");

    // Нативный fetch сам выставит правильные multipart заголовки и boundary
    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: nativeForm,
      signal: AbortSignal.timeout(300000) // 5 минут таймаут на загрузку тяжелых APK
    });

    const resData = await response.json();

    if (!response.ok || !resData.ok) {
      console.error("❌ Telegram отклонил запрос:", JSON.stringify(resData));
      return res.status(500).json({ error: resData.description || 'Telegram Reject' });
    }

    console.log("🎉 Telegram успешно принял файл!");

    const fileId = resData.result.document.file_id;
    console.log(`🆔 Получен File ID: ${fileId}. Запрашиваем прямой путь к файлу...`);

    const pathResponse = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const pathData = await pathResponse.json();
    
    if (pathData.ok) {
      const filePath = pathData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
      console.log(`🔗 Ссылка сгенерирована: ${downloadUrl}\n`);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram через getFile');
  } catch (error) {
    console.error('💥 Критический сбой внутри /upload:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send('IvPlay Бэкенд на Render Работает Идеально!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
});
