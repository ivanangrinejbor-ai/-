const express = require('express');
const multer = require('multer');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
// НА РЕНДЕРЕ ПОРТ ДОЛЖЕН БЫТЬ ДИНАМИЧЕСКИМ (по умолчанию Render дает 10000)
const PORT = process.env.PORT || 10000; 

// ЖЕСТКАЯ НАСТРОЙКА CORS ДЛЯ ПРОБИТИЯ ЛЮБЫХ БЛОКИРОВОК БРАУЗЕРА
app.use(cors({
  origin: '*', // Разрешаем запросы абсолютно отовсюду (включая netlify.app)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// ПРИНУДИТЕЛЬНЫЙ ОТВЕТ НА ПРОВЕРОЧНЫЕ ЗАПРОСЫ OPTIONS (Preflight)
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.sendStatus(200);
});

app.use(express.json());

// Настраиваем multer в оперативную память
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 150 * 1024 * 1024 } // Ограничение 150 МБ под APK
});

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

app.post('/upload', upload.single('document'), async (req, res) => {
  // Дополнительно вешаем заголовки прямо в ответ роута загрузки
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  if (!req.file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден в запросе фронтенда' });
  }

  console.log(`📂 Файл: "${req.file.originalname}" | Размер: ${(req.file.size / (1024 * 1024)).toFixed(2)} МБ`);

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения TG_BOT_TOKEN или TG_CHAT_ID не заданы в Render!");
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения.' });
  }

  try {
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    
    const safeName = `${Date.now()}-${req.file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
    
    // Маскируем APK под octet-stream, чтобы убрать лишние придирки сетей к TLS
    form.append('document', req.file.buffer, { 
      filename: safeName,
      contentType: 'application/octet-stream' 
    });

    console.log("🚀 Отправка нативного fetch в Telegram API...");

    // Используем встроенный fetch Node 18, который обходит баги axios с сокетами
    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
      signal: AbortSignal.timeout(300000) // 5 минут таймаут на загрузку
    });

    const resData = await response.json();

    if (!response.ok || !resData.ok) {
      console.error("❌ Telegram отклонил запрос:", JSON.stringify(resData));
      return res.status(500).json({ error: resData.description || 'Telegram Reject' });
    }

    console.log("🎉 Telegram успешно принял файл!");

    const fileId = resData.result.document.file_id;
    const pathResponse = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const pathData = await pathResponse.json();
    
    if (pathData.ok) {
      const filePath = pathData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
      console.log(`🔗 Ссылка сгенерирована: ${downloadUrl}\n`);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram');
  } catch (error) {
    console.error('💥 Критический сбой внутри /upload:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проверка доступности сервера прямо из браузера
app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send('IvPlay Бэкенд на Render Работает Идеально!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
});
});
